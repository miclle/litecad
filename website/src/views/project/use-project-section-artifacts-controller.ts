import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createProjectSectionArtifact, deleteProjectSectionArtifact, downloadProjectSectionArtifact, fetchProjectModelRevisionSource, fetchProjectSectionArtifacts } from 'src/api/projects'
import { runFeatureDSLExportInWorker, runSectionGeometryInWorker } from 'src/cad/kernel-worker-client'
import type { ProjectInspectionVector, ProjectSectionArtifact, ProjectSectionArtifactPayload } from 'src/types/project'
import { generateProjectSectionGeometry } from './project-section-artifact-action'
import { publishStepExportDownload, type StepExportTarget } from './project-step-export'

type ProjectSectionArtifactDependencies = {
  createArtifact: (projectId: string, payload: ProjectSectionArtifactPayload) => Promise<unknown>
  deleteArtifact: (projectId: string, artifactId: string) => Promise<unknown>
  downloadArtifact: (projectId: string, artifactId: string) => Promise<Blob>
  fetchArtifacts: (projectId: string) => Promise<ProjectSectionArtifact[]>
  fetchSourceText: (projectId: string, modelId: string, revisionId: string) => Promise<string>
  generateGeometry: typeof generateProjectSectionGeometry
  publishDownload: typeof publishStepExportDownload
  runFeatureDSLExport: typeof runFeatureDSLExportInWorker
  runSectionGeometry: typeof runSectionGeometryInWorker
}

type UseProjectSectionArtifactsControllerOptions = {
  cadDocumentRevision: number
  dependencies?: Partial<ProjectSectionArtifactDependencies>
  filename: string
  projectId: string
  targets: StepExportTarget[]
  unit: string
  visiblePreviewIds: readonly string[]
}

const defaultDependencies: ProjectSectionArtifactDependencies = {
  createArtifact: async (projectId, payload) => createProjectSectionArtifact(projectId, payload),
  deleteArtifact: async (projectId, artifactId) => deleteProjectSectionArtifact(projectId, artifactId),
  downloadArtifact: async (projectId, artifactId) => (await downloadProjectSectionArtifact(projectId, artifactId)).data,
  fetchArtifacts: async (projectId) => (await fetchProjectSectionArtifacts(projectId)).data.artifacts,
  fetchSourceText: async (projectId, modelId, revisionId) => {
    const source = (await fetchProjectModelRevisionSource(projectId, modelId, revisionId)).data
    return source.text()
  },
  generateGeometry: generateProjectSectionGeometry,
  publishDownload: publishStepExportDownload,
  runFeatureDSLExport: runFeatureDSLExportInWorker,
  runSectionGeometry: runSectionGeometryInWorker,
}

export function useProjectSectionArtifactsController({ cadDocumentRevision, dependencies, filename, projectId, targets, unit, visiblePreviewIds }: UseProjectSectionArtifactsControllerOptions) {
  const queryClient = useQueryClient()
  const queryKey = ['projects', projectId, 'section-artifacts'] as const
  const resolvedDependencies = { ...defaultDependencies, ...dependencies }
  const visibleIDSet = new Set(visiblePreviewIds)
  const visibleTargets = targets.filter((target) => visibleIDSet.has(target.occurrenceId) || visibleIDSet.has(target.modelId))
  const artifactsQuery = useQuery({ enabled: projectId !== '', queryFn: () => resolvedDependencies.fetchArtifacts(projectId), queryKey })
  const generateMutation = useMutation({
    mutationFn: async ({ artifact, planeNormal, planeOrigin }: { artifact?: ProjectSectionArtifact; planeNormal: ProjectInspectionVector; planeOrigin: ProjectInspectionVector }) => {
      const result = await resolvedDependencies.generateGeometry({
        filename,
        fetchSourceText: (modelId, revisionId) => resolvedDependencies.fetchSourceText(projectId, modelId, revisionId),
        plane: { origin: [planeOrigin.x, planeOrigin.y, planeOrigin.z], normal: [planeNormal.x, planeNormal.y, planeNormal.z] },
        runFeatureDSLExport: resolvedDependencies.runFeatureDSLExport,
        runSectionGeometry: resolvedDependencies.runSectionGeometry,
        targets: visibleTargets,
      })
      await resolvedDependencies.createArtifact(projectId, {
        ...(artifact ? { association_id: artifact.association_id, expected_generation: artifact.generation } : {}),
        cad_document_revision: cadDocumentRevision,
        unit,
        status: result.status,
        filename,
        content_type: 'model/step',
        target_count: visibleTargets.length,
        source_revision_ids: visibleTargets.map((target) => target.modelRevisionId),
        occurrence_ids: visibleTargets.map((target) => target.occurrenceId),
        plane_origin: planeOrigin,
        plane_normal: planeNormal,
        edge_count: result.edgeCount,
        step_text: result.exportedStepText,
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const deleteMutation = useMutation({ mutationFn: (artifactId: string) => resolvedDependencies.deleteArtifact(projectId, artifactId), onSuccess: () => queryClient.invalidateQueries({ queryKey }) })

  const downloadSectionArtifact = async (artifactId: string) => {
    const artifact = (artifactsQuery.data ?? []).find((candidate) => candidate.id === artifactId)
    const blob = await resolvedDependencies.downloadArtifact(projectId, artifactId)
    resolvedDependencies.publishDownload({ filename: artifact?.filename ?? filename, stepText: await blob.text() })
  }

  return {
    deleteSectionArtifact: (artifactId: string) => deleteMutation.mutate(artifactId),
    downloadSectionArtifact,
    generateSectionArtifact: (planeOrigin: ProjectInspectionVector) => generateMutation.mutate({ planeOrigin, planeNormal: { x: 1, y: 0, z: 0 } }),
    getSectionArtifactState: (artifact: ProjectSectionArtifact) => projectSectionArtifactState(artifact, cadDocumentRevision, visibleTargets),
    isSectionArtifactMutationPending: generateMutation.isPending || deleteMutation.isPending,
    isSectionArtifactsError: artifactsQuery.isError || generateMutation.isError || deleteMutation.isError,
    isSectionArtifactsLoading: artifactsQuery.isLoading,
    regenerateSectionArtifact: (artifact: ProjectSectionArtifact) => generateMutation.mutate({ artifact, planeOrigin: artifact.plane_origin, planeNormal: artifact.plane_normal }),
    restoreSectionArtifact: (_artifact: ProjectSectionArtifact) => undefined,
    sectionArtifacts: artifactsQuery.data ?? [],
    sectionArtifactError: generateMutation.error instanceof Error ? generateMutation.error.message : '',
    visibleSectionTargetCount: visibleTargets.length,
  }
}

export type ProjectSectionArtifactState = 'current' | 'stale' | 'superseded' | 'legacy'

export function projectSectionArtifactState(
  artifact: ProjectSectionArtifact,
  cadDocumentRevision: number,
  visibleTargets: readonly StepExportTarget[],
): ProjectSectionArtifactState {
  if (!artifact.association_id || artifact.generation <= 0) {
    return 'legacy'
  }
  if (!artifact.is_latest) {
    return 'superseded'
  }
  const occurrenceIDs = visibleTargets.map((target) => target.occurrenceId)
  const revisionIDs = visibleTargets.map((target) => target.modelRevisionId)
  return artifact.cad_document_revision === cadDocumentRevision &&
    equalStringArrays(artifact.occurrence_ids, occurrenceIDs) &&
    equalStringArrays(artifact.source_revision_ids, revisionIDs)
    ? 'current'
    : 'stale'
}

function equalStringArrays(first: readonly string[], second: readonly string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index])
}
