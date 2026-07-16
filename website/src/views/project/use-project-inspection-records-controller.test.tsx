import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectInspectionRecordPayload } from 'src/types/project'
import type { StepExportTarget } from './project-step-export'
import { useProjectInspectionRecordsController } from './use-project-inspection-records-controller'

const target: StepExportTarget = {
  occurrenceId: 'occ_inch',
  modelId: 'mdl_inch',
  modelRevisionId: 'mvr_inch',
  sourceFormat: 'step',
  displayName: 'Inch source',
  sourceFilename: 'inch-source.step',
  downloadFilename: 'inch-source.step',
  operations: [],
}

describe('useProjectInspectionRecordsController', () => {
  it('persists preview and exact kernel measurements in millimetres', async () => {
    const createRecord = vi.fn<(projectId: string, payload: ProjectInspectionRecordPayload) => Promise<undefined>>()
    createRecord.mockResolvedValue(undefined)
    const generateTopology = vi.fn(async () => ({
      derivation: 'occt-brep-properties' as const,
      targets: [{
        referenceScope: {
          occurrenceId: target.occurrenceId,
          modelRevisionId: target.modelRevisionId,
          operationsSignature: 'sha256:inch-source',
        },
        volume: 16_387.064,
        surfaceArea: 3_870.96,
        edgeLength: 304.8,
        centerOfMass: [12.7, 12.7, 12.7] as const,
        solidCount: 1,
        faceCount: 6,
        edgeCount: 12,
        references: [],
      }],
      totals: {
        volume: 16_387.064,
        surfaceArea: 3_870.96,
        edgeLength: 304.8,
        centerOfMass: [12.7, 12.7, 12.7] as const,
        solidCount: 1,
        faceCount: 6,
        edgeCount: 12,
      },
    }))
    const { result } = renderHook(
      () =>
        useProjectInspectionRecordsController({
          cadDocumentRevision: 7,
          dependencies: { createRecord, generateTopology },
          projectId: '',
          targets: [target],
          unit: 'inch',
          visibleModelIds: [target.occurrenceId],
        }),
      { wrapper: queryWrapper() },
    )

    act(() => {
      result.current.saveMeasurementRecord({
        center: { x: 12.7, y: 12.7, z: 12.7 },
        derivation: 'preview-visible-aabb',
        diagonal: 43.994,
        modelCount: 1,
        size: { x: 25.4, y: 25.4, z: 25.4 },
      })
    })
    await waitFor(() => expect(createRecord).toHaveBeenCalledTimes(1))

    act(() => result.current.analyzeTopology())
    await waitFor(() => expect(createRecord).toHaveBeenCalledTimes(2))

    expect(createRecord.mock.calls.map(([, payload]) => payload.unit)).toEqual(['millimetre', 'millimetre'])
    expect(result.current.previewMeasurementUnit).toBe('millimetre')
  })

  it('exposes record write failures to the workbench', async () => {
    const createRecord = vi.fn(async () => {
      throw new Error('record write failed')
    })
    const { result } = renderHook(
      () =>
        useProjectInspectionRecordsController({
          cadDocumentRevision: 7,
          dependencies: { createRecord },
          projectId: '',
          unit: 'unit',
          visibleModelIds: [],
        }),
      { wrapper: queryWrapper() },
    )

    act(() => {
      result.current.saveMeasurementRecord({
        center: { x: 0, y: 0, z: 0 },
        derivation: 'preview-visible-aabb',
        diagonal: 1,
        modelCount: 1,
        size: { x: 1, y: 1, z: 1 },
      })
    })

    await waitFor(() => expect(result.current.inspectionRecordError).toBe('record write failed'))
  })

  it('preserves the document unit for preview assets that do not pass through the browser kernel', async () => {
    const createRecord = vi.fn<(projectId: string, payload: ProjectInspectionRecordPayload) => Promise<undefined>>()
    createRecord.mockResolvedValue(undefined)
    const { result } = renderHook(
      () =>
        useProjectInspectionRecordsController({
          cadDocumentRevision: 7,
          dependencies: { createRecord },
          projectId: '',
          unit: 'metre',
          visibleModelIds: ['mdl_gltf'],
        }),
      { wrapper: queryWrapper() },
    )

    act(() => {
      result.current.saveMeasurementRecord({
        center: { x: 0.5, y: 0.5, z: 0.5 },
        derivation: 'preview-visible-aabb',
        diagonal: 1.732,
        modelCount: 1,
        size: { x: 1, y: 1, z: 1 },
      })
    })

    await waitFor(() => expect(createRecord).toHaveBeenCalledWith('', expect.objectContaining({ unit: 'metre' })))
    expect(result.current.previewMeasurementUnit).toBe('metre')
  })
})

function queryWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}
