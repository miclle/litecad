import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createProjectInspectionRecord,
  deleteProjectInspectionRecord,
  fetchProjectModelRevisionSource,
  fetchProjectInspectionRecords,
} from 'src/api/projects'
import { runFeatureDSLExportInWorker, runShapeInspectionInWorker } from 'src/cad/kernel-worker-client'
import type { ProjectInspectionRecord, ProjectInspectionRecordPayload } from 'src/types/project'
import type { ModelPreviewMeasurement } from './model-preview-tools'
import { generateProjectTopologyInspection } from './project-topology-inspection-action'
import type { StepExportTarget } from './project-step-export'

type ProjectInspectionDependencies = {
  createRecord: (projectId: string, payload: ProjectInspectionRecordPayload) => Promise<unknown>
  fetchRecords: (projectId: string) => Promise<ProjectInspectionRecord[]>
  fetchSourceText: (projectId: string, modelId: string, revisionId: string) => Promise<string>
  generateTopology: typeof generateProjectTopologyInspection
  runFeatureDSLExport: typeof runFeatureDSLExportInWorker
  runShapeInspection: typeof runShapeInspectionInWorker
}

type UseProjectInspectionRecordsControllerOptions = {
  cadDocumentRevision: number
  dependencies?: Partial<ProjectInspectionDependencies>
  projectId: string
  targets?: StepExportTarget[]
  unit: string
  visibleModelIds: readonly string[]
}

const browserKernelUnit = 'millimetre'

const defaultDependencies: ProjectInspectionDependencies = {
  createRecord: (projectId, payload) => createProjectInspectionRecord(projectId, payload),
  fetchRecords: async (projectId) => (await fetchProjectInspectionRecords(projectId)).data.records,
  fetchSourceText: async (projectId, modelId, revisionId) => {
    const source = (await fetchProjectModelRevisionSource(projectId, modelId, revisionId)).data
    return source.text()
  },
  generateTopology: generateProjectTopologyInspection,
  runFeatureDSLExport: runFeatureDSLExportInWorker,
  runShapeInspection: runShapeInspectionInWorker,
}

export function useProjectInspectionRecordsController({
  cadDocumentRevision,
  dependencies,
  projectId,
  targets = [],
  unit,
  visibleModelIds,
}: UseProjectInspectionRecordsControllerOptions) {
  const queryClient = useQueryClient()
  const queryKey = ['projects', projectId, 'inspection-records'] as const
  const resolvedDependencies = { ...defaultDependencies, ...dependencies }
  const visibleIDSet = new Set(visibleModelIds)
  const visibleTargets = targets.filter((target) => visibleIDSet.has(target.occurrenceId) || visibleIDSet.has(target.modelId))
  const previewMeasurementUnit = visibleModelIds.length > 0 && visibleModelIds.every((visibleModelId) =>
    visibleTargets.some((target) => target.occurrenceId === visibleModelId || target.modelId === visibleModelId),
  ) ? browserKernelUnit : unit
  const recordsQuery = useQuery({
    queryKey,
    queryFn: () => resolvedDependencies.fetchRecords(projectId),
    enabled: projectId !== '',
  })
  const createMutation = useMutation({
    mutationFn: (record: ProjectInspectionRecordPayload) => resolvedDependencies.createRecord(projectId, record),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const topologyMutation = useMutation({
    mutationFn: async () => {
      const result = await resolvedDependencies.generateTopology({
        fetchSourceText: (modelId, revisionId) => resolvedDependencies.fetchSourceText(projectId, modelId, revisionId),
        runFeatureDSLExport: resolvedDependencies.runFeatureDSLExport,
        runShapeInspection: resolvedDependencies.runShapeInspection,
        targets: visibleTargets,
      })
      return resolvedDependencies.createRecord(projectId, {
        kind: 'measurement',
        name: 'Exact B-rep properties',
        cad_document_revision: cadDocumentRevision,
        unit: browserKernelUnit,
        visible_model_ids: visibleTargets.map((target) => target.occurrenceId),
        measurement: {
          derivation: result.derivation,
          topology: {
            target_count: result.targets.length,
            totals: topologyPropertiesPayload(result.totals),
            targets: result.targets.map((target) => ({
              reference_scope: {
                occurrence_id: target.referenceScope.occurrenceId,
                model_revision_id: target.referenceScope.modelRevisionId,
                operations_signature: target.referenceScope.operationsSignature,
              },
              ...topologyPropertiesPayload(target),
              references: target.references,
            })),
          },
        },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => deleteProjectInspectionRecord(projectId, recordId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const saveMeasurementRecord = (measurement: ModelPreviewMeasurement) => {
    createMutation.mutate({
      kind: 'measurement',
      name: 'Visible bounds',
      cad_document_revision: cadDocumentRevision,
      unit: previewMeasurementUnit,
      visible_model_ids: [...visibleModelIds],
      measurement: {
        derivation: measurement.derivation,
        model_count: measurement.modelCount,
        center: measurement.center,
        size: measurement.size,
        diagonal: measurement.diagonal,
      },
    })
  }
  const saveSectionRecord = () => {
    createMutation.mutate({
      kind: 'section',
      name: 'Center X section',
      cad_document_revision: cadDocumentRevision,
      unit: previewMeasurementUnit,
      visible_model_ids: [...visibleModelIds],
      section: {
        mode: 'center-plane',
        plane_normal: { x: -1, y: 0, z: 0 },
        plane_constant: 0,
      },
    })
  }

  return {
    analyzeTopology: () => topologyMutation.mutate(),
    canAnalyzeTopology: visibleTargets.length > 0,
    deleteInspectionRecord: (recordId: string) => deleteMutation.mutate(recordId),
    inspectionRecords: recordsQuery.data ?? [],
    isInspectionRecordsLoading: recordsQuery.isLoading,
    inspectionRecordError: firstErrorMessage(recordsQuery.error, createMutation.error, topologyMutation.error, deleteMutation.error),
    isInspectionRecordMutationPending: createMutation.isPending || deleteMutation.isPending || topologyMutation.isPending,
    previewMeasurementUnit,
    saveMeasurementRecord,
    saveSectionRecord,
    selectedRestoredRecord: undefined as ProjectInspectionRecord | undefined,
  }
}

function firstErrorMessage(...errors: unknown[]) {
  const error = errors.find(Boolean)
  return error instanceof Error ? error.message : error ? String(error) : ''
}

function topologyPropertiesPayload(properties: {
  volume: number
  surfaceArea: number
  edgeLength: number
  centerOfMass: readonly [number, number, number]
  solidCount: number
  faceCount: number
  edgeCount: number
}) {
  return {
    volume: properties.volume,
    surface_area: properties.surfaceArea,
    edge_length: properties.edgeLength,
    center_of_mass: { x: properties.centerOfMass[0], y: properties.centerOfMass[1], z: properties.centerOfMass[2] },
    solid_count: properties.solidCount,
    face_count: properties.faceCount,
    edge_count: properties.edgeCount,
  }
}
