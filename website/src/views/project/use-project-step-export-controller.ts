import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchProjectModelRevisionSource } from 'src/api/projects'
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
  exportMergedTargets: typeof exportMergedStepTargets
  exportSingleTarget: typeof exportStepTarget
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
  exportMergedTargets: exportMergedStepTargets,
  exportSingleTarget: exportStepTarget,
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
  const [errorByModelID, setErrorByModelID] = useState<Record<string, string>>({})
  const [statusByModelID, setStatusByModelID] = useState<Record<string, string>>({})
  const [selectedTargetIDs, setSelectedTargetIDs] = useState<Set<string>>(() => new Set())
  const hasTouchedSelectionRef = useRef(false)
  const resolvedDependencies = { ...defaultDependencies, ...dependencies }
  const selectedTargets = selectedStepExportTargets(targets, selectedTargetIDs)

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
      await resolvedDependencies.exportMergedTargets({
        targets: selectedTargets,
        downloadFilename: assemblyDownloadFilename,
        fetchSourceText,
        runStepAssemblyExport: resolvedDependencies.runStepAssemblyExport,
        runFeatureDSLExport: resolvedDependencies.runFeatureDSLExport,
        publishDownload: resolvedDependencies.publishDownload,
      })
    } else {
      for (const target of selectedTargets) {
        await resolvedDependencies.exportSingleTarget({
          target,
          fetchSourceText,
          runStepRoundTrip: resolvedDependencies.runStepRoundTrip,
          runFeatureDSLExport: resolvedDependencies.runFeatureDSLExport,
          publishDownload: resolvedDependencies.publishDownload,
        })
      }
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

  return {
    errorByModelID,
    exportSelection,
    selectAllTargets,
    selectedTargetIDs,
    selectedTargets,
    statusByModelID,
    toggleTarget,
  }
}
