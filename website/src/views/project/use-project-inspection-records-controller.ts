import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createProjectInspectionRecord,
  deleteProjectInspectionRecord,
  fetchProjectInspectionRecords,
} from 'src/api/projects'
import type { ProjectInspectionRecord } from 'src/types/project'
import type { ModelPreviewMeasurement } from './model-preview-tools'

type UseProjectInspectionRecordsControllerOptions = {
  cadDocumentRevision: number
  projectId: string
  unit: string
  visibleModelIds: readonly string[]
}

export function useProjectInspectionRecordsController({
  cadDocumentRevision,
  projectId,
  unit,
  visibleModelIds,
}: UseProjectInspectionRecordsControllerOptions) {
  const queryClient = useQueryClient()
  const queryKey = ['projects', projectId, 'inspection-records'] as const
  const recordsQuery = useQuery({
    queryKey,
    queryFn: async () => (await fetchProjectInspectionRecords(projectId)).data.records,
    enabled: projectId !== '',
  })
  const createMutation = useMutation({
    mutationFn: (record: Parameters<typeof createProjectInspectionRecord>[1]) => createProjectInspectionRecord(projectId, record),
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
      unit,
      visible_model_ids: [...visibleModelIds],
      measurement: {
        model_count: measurement.modelCount,
        center: measurement.center,
        size: measurement.size,
      },
    })
  }
  const saveSectionRecord = () => {
    createMutation.mutate({
      kind: 'section',
      name: 'Center X section',
      cad_document_revision: cadDocumentRevision,
      unit,
      visible_model_ids: [...visibleModelIds],
      section: {
        mode: 'center-plane',
        plane_normal: { x: -1, y: 0, z: 0 },
        plane_constant: 0,
      },
    })
  }

  return {
    deleteInspectionRecord: (recordId: string) => deleteMutation.mutate(recordId),
    inspectionRecords: recordsQuery.data ?? [],
    isInspectionRecordsLoading: recordsQuery.isLoading,
    isInspectionRecordMutationPending: createMutation.isPending || deleteMutation.isPending,
    saveMeasurementRecord,
    saveSectionRecord,
    selectedRestoredRecord: undefined as ProjectInspectionRecord | undefined,
  }
}
