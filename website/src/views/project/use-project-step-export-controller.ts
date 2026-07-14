import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createProjectExportArtifact,
  downloadProjectExportArtifact,
  fetchProjectExportArtifacts,
  fetchProjectModelRevisionSource,
} from 'src/api/projects'
import type { ProjectExportArtifact, ProjectExportArtifactPayload } from 'src/types/project'
import {
  runFeatureDSLExportInWorker,
  runStepAssemblyExportInWorker,
  runStepRoundTripInWorker,
} from 'src/cad/kernel-worker-client'
import { exportMergedStepTargets, exportStepTarget } from './project-step-export-action'
import {
  defaultSelectedStepExportTargetIDs,
  publishStepExportDownload,
  selectedStepExportTargets,
  type StepExportMode,
  type StepExportTarget,
} from './project-step-export'

type ProjectStepExportDependencies = {
  createExportArtifact: (projectId: string, payload: ProjectExportArtifactPayload) => Promise<unknown>
  downloadExportArtifact: (projectId: string, artifactId: string) => Promise<Blob>
  exportMergedTargets: typeof exportMergedStepTargets
  exportSingleTarget: typeof exportStepTarget
  fetchExportArtifacts: (projectId: string) => Promise<ProjectExportArtifact[]>
	fetchSourceText: (projectId: string, modelId: string, modelRevisionId: string) => Promise<string>
  publishDownload: typeof publishStepExportDownload
  runFeatureDSLExport: typeof runFeatureDSLExportInWorker
  runStepAssemblyExport: typeof runStepAssemblyExportInWorker
  runStepRoundTrip: typeof runStepRoundTripInWorker
}

type UseProjectStepExportControllerOptions = {
  assemblyDownloadFilename: string
  dependencies?: Partial<ProjectStepExportDependencies>
  projectId: string
  targets: StepExportTarget[]
}

const defaultDependencies: ProjectStepExportDependencies = {
  createExportArtifact: createProjectExportArtifact,
  downloadExportArtifact: async (projectId, artifactId) => (await downloadProjectExportArtifact(projectId, artifactId)).data,
  exportMergedTargets: exportMergedStepTargets,
  exportSingleTarget: exportStepTarget,
  fetchExportArtifacts: async (projectId) => (await fetchProjectExportArtifacts(projectId)).data.artifacts,
	fetchSourceText: async (projectId, modelId, modelRevisionId) => {
		const source = (await fetchProjectModelRevisionSource(projectId, modelId, modelRevisionId)).data
    return source.text()
  },
  publishDownload: publishStepExportDownload,
  runFeatureDSLExport: runFeatureDSLExportInWorker,
  runStepAssemblyExport: runStepAssemblyExportInWorker,
  runStepRoundTrip: runStepRoundTripInWorker,
}

export function useProjectStepExportController({
  assemblyDownloadFilename,
  dependencies,
  projectId,
  targets,
}: UseProjectStepExportControllerOptions) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [errorByModelID, setErrorByModelID] = useState<Record<string, string>>({})
  const [statusByModelID, setStatusByModelID] = useState<Record<string, string>>({})
  const [selectedTargetIDs, setSelectedTargetIDs] = useState<Set<string>>(() => new Set())
  const hasTouchedSelectionRef = useRef(false)
  const resolvedDependencies = { ...defaultDependencies, ...dependencies }
  const selectedTargets = selectedStepExportTargets(targets, selectedTargetIDs)
  const exportArtifactsQuery = useQuery({
    enabled: projectId !== '',
    queryFn: () => resolvedDependencies.fetchExportArtifacts(projectId),
    queryKey: ['projects', projectId, 'export-artifacts'],
  })

  useEffect(() => {
    setSelectedTargetIDs((currentIDs) => {
      if (!hasTouchedSelectionRef.current) {
        return defaultSelectedStepExportTargetIDs(targets)
      }
		const availableIDs = new Set(targets.map((target) => target.occurrenceId))
		return new Set([...currentIDs].filter((occurrenceID) => availableIDs.has(occurrenceID)))
    })
  }, [targets])

  const selectAllTargets = () => {
    hasTouchedSelectionRef.current = true
    setSelectedTargetIDs(defaultSelectedStepExportTargetIDs(targets))
  }

	const toggleTarget = (occurrenceID: string) => {
    hasTouchedSelectionRef.current = true
    setSelectedTargetIDs((currentIDs) => {
      const nextIDs = new Set(currentIDs)
		if (nextIDs.has(occurrenceID)) {
			nextIDs.delete(occurrenceID)
		} else {
			nextIDs.add(occurrenceID)
      }
      return nextIDs
    })
  }

  const exportSelection = async (mode: StepExportMode) => {
    if (selectedTargets.length === 0) {
      throw new Error(t('project.export.noSelection'))
    }
		const fetchSourceText = (modelId: string, modelRevisionId: string) => resolvedDependencies.fetchSourceText(projectId, modelId, modelRevisionId)

    if (mode === 'merged') {
      const result = await resolvedDependencies.exportMergedTargets({
        targets: selectedTargets,
        downloadFilename: assemblyDownloadFilename,
        fetchSourceText,
        runStepAssemblyExport: resolvedDependencies.runStepAssemblyExport,
        runFeatureDSLExport: resolvedDependencies.runFeatureDSLExport,
        publishDownload: resolvedDependencies.publishDownload,
      })
      await resolvedDependencies.createExportArtifact(projectId, {
        filename: assemblyDownloadFilename,
        content_type: 'model/step',
        export_kind: 'merged',
        target_count: selectedTargets.length,
        source_revision_ids: selectedTargets.map((target) => target.modelRevisionId),
        occurrence_ids: selectedTargets.map((target) => target.occurrenceId),
        step_text: result.exportedStepText,
      })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'export-artifacts'] })
    } else {
      for (const target of selectedTargets) {
        const result = await resolvedDependencies.exportSingleTarget({
          target,
          fetchSourceText,
          runStepRoundTrip: resolvedDependencies.runStepRoundTrip,
          runFeatureDSLExport: resolvedDependencies.runFeatureDSLExport,
          publishDownload: resolvedDependencies.publishDownload,
        })
        await resolvedDependencies.createExportArtifact(projectId, {
          filename: target.downloadFilename,
          content_type: 'model/step',
          export_kind: 'single',
          target_count: 1,
          source_revision_ids: [target.modelRevisionId],
          occurrence_ids: [target.occurrenceId],
          step_text: result.exportedStepText,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'export-artifacts'] })
    }

    setErrorByModelID((currentErrors) => {
      const nextErrors = { ...currentErrors }
      selectedTargets.forEach((target) => {
        nextErrors[target.modelId] = ''
      })
      return nextErrors
    })
    setStatusByModelID((currentStatuses) => {
      const nextStatuses = { ...currentStatuses }
      selectedTargets.forEach((target) => {
        nextStatuses[target.modelId] =
          mode === 'merged'
            ? t('project.export.included', { filename: assemblyDownloadFilename })
            : t('project.export.downloaded', { filename: target.downloadFilename })
      })
      return nextStatuses
    })
  }

  const downloadExportArtifact = async (artifactId: string) => {
    const artifact = (exportArtifactsQuery.data ?? []).find((candidate) => candidate.id === artifactId)
    const blob = await resolvedDependencies.downloadExportArtifact(projectId, artifactId)
    resolvedDependencies.publishDownload({
      filename: artifact?.filename ?? 'litecad-export.step',
      stepText: await blob.text(),
    })
  }

  return {
    downloadExportArtifact,
    errorByModelID,
    exportArtifacts: exportArtifactsQuery.data ?? [],
    exportSelection,
    isExportHistoryError: exportArtifactsQuery.isError,
    isExportHistoryLoading: exportArtifactsQuery.isLoading,
    selectAllTargets,
    selectedTargetIDs,
    selectedTargets,
    statusByModelID,
    toggleTarget,
  }
}
