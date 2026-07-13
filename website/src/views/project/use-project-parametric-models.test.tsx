import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProjectModelSource } from 'src/api/projects'
import { runFeatureDSLPreviewInWorker } from 'src/cad/kernel-worker-client'
import type { ProjectModel } from 'src/types/project'
import { useProjectParametricModels } from './use-project-parametric-models'

vi.mock('src/api/projects', () => ({ fetchProjectModelSource: vi.fn() }))
vi.mock('src/cad/kernel-worker-client', () => ({ runFeatureDSLPreviewInWorker: vi.fn() }))

const projectId = 'project_parametric'
const sourceCode = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  parameters: { width: { type: 'number', default: 20 } },
  features: [{ id: 'body', type: 'box', size: ['width', 10, 5] }],
})
const model: ProjectModel = {
  id: 'model_lcad',
  project_id: projectId,
  original_filename: 'bracket.lcad.json',
  format: 'lcad',
  content_type: 'application/json',
  byte_size: sourceCode.length,
  parse_status: 'parsed',
  parse_error: '',
  metadata: {
    asset_type: 'parametric-model',
    source_kind: 'litecad-feature-dsl',
    version: '1',
    schema: 'litecad-feature-dsl',
    product_names: ['Bracket'],
    length_unit: 'millimetre',
    entity_count: 1,
    parameter_count: 1,
    parameter_values: { width: 20 },
    representation_count: 1,
    triangle_count: 12,
  },
  created_at: '2026-07-13T00:00:00Z',
  updated_at: '2026-07-13T00:00:00Z',
}

function createHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

describe('useProjectParametricModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchProjectModelSource).mockResolvedValue({ data: new Blob([sourceCode]) } as Awaited<ReturnType<typeof fetchProjectModelSource>>)
    vi.mocked(runFeatureDSLPreviewInWorker).mockResolvedValue({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
      meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
    })
  })

  it('derives the selected saved LiteCAD artifact from the model source', async () => {
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () =>
        useProjectParametricModels({
          projectId,
          projectModels: [model],
          selectedArtifact: undefined,
          selectedSourceModel: model,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.selectedSavedArtifact?.source_code).toBe(sourceCode))
    expect(result.current.selectedSavedArtifact).toMatchObject({
      source_kind: 'litecad-feature-dsl',
      preview_model_id: model.id,
      parameter_values: { width: 20 },
    })
  })

  it('applies local parameter overrides to the preview model without mutating server data', async () => {
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () =>
        useProjectParametricModels({
          projectId,
          projectModels: [model],
          selectedArtifact: undefined,
          selectedSourceModel: model,
        }),
      { wrapper },
    )

    act(() => result.current.updatePreviewParameters(model.id, { width: 24 }))

    expect(result.current.previewModels[0]?.metadata.parameter_values).toEqual({ width: 24 })
    expect(model.metadata.parameter_values).toEqual({ width: 20 })
    await waitFor(() => expect(result.current.kernelMeshesByModelID[model.id]).toBeDefined())
  })
})
