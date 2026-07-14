import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchProjectCADDocument,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModelSource,
  fetchProjectModels,
} from 'src/api/projects'
import { runStepPreviewInWorker } from 'src/cad/kernel-worker-client'
import type { ProjectCADDocument, ProjectModel, ProjectModelPreviewArtifact } from 'src/types/project'
import { useProjectWorkbenchModelState } from './use-project-workbench-model-state'

vi.mock('src/api/projects', () => ({
  fetchProjectCADDocument: vi.fn(),
  fetchProjectModelPreview: vi.fn(),
  fetchProjectModelPreviewArtifact: vi.fn(),
  fetchProjectModelSource: vi.fn(),
  fetchProjectModels: vi.fn(),
}))

vi.mock('src/cad/kernel-worker-client', () => ({
  runFeatureDSLPreviewInWorker: vi.fn(),
  runStepPreviewInWorker: vi.fn(),
}))

const projectId = 'prj_workbench'

describe('useProjectWorkbenchModelState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.mocked(fetchProjectModels).mockResolvedValue({ data: { models: [] } } as unknown as Awaited<ReturnType<typeof fetchProjectModels>>)
    vi.mocked(fetchProjectCADDocument).mockResolvedValue({ data: { document: cadDocument([]) } } as unknown as Awaited<ReturnType<typeof fetchProjectCADDocument>>)
    vi.mocked(fetchProjectModelPreviewArtifact).mockRejectedValue(new Error('not configured'))
    vi.mocked(fetchProjectModelPreview).mockRejectedValue(new Error('not configured'))
    vi.mocked(fetchProjectModelSource).mockRejectedValue(new Error('not configured'))
    vi.mocked(runStepPreviewInWorker).mockRejectedValue(new Error('not configured'))
  })

  it('derives the empty workbench canvas and sidebar state from model and CAD document queries', async () => {
    const { result } = renderHook(() => useModelStateScenario(), { wrapper: queryWrapper() })

    await waitFor(() => expect(result.current.projectCADDocument?.revision).toBe(1))

    expect(result.current.projectModels).toEqual([])
    expect(result.current.projectModelTree).toEqual([])
    expect(result.current.previewAssets).toEqual([])
    expect(result.current.shouldShowCanvasStatus).toBe(true)
    expect(result.current.canvasStatusLabel).toBe('Awaiting import')
    expect(result.current.previewSummary.previewLabel).toBe('Empty')
  })

  it('publishes backend preview assets and reports when all preview layers are hidden', async () => {
    const model = glbModel()
    vi.mocked(fetchProjectModels).mockResolvedValue({ data: { models: [model] } } as unknown as Awaited<ReturnType<typeof fetchProjectModels>>)
    vi.mocked(fetchProjectCADDocument).mockResolvedValue({
      data: { document: cadDocument([{ id: 'node_model_glb', model_id: model.id, parent_node_id: '', name: 'Housing', source_format: 'glb', transform: identityTransform() }]) },
    } as unknown as Awaited<ReturnType<typeof fetchProjectCADDocument>>)
    vi.mocked(fetchProjectModelPreviewArtifact).mockResolvedValue({
      data: { preview: previewArtifact(model.id) },
    } as unknown as Awaited<ReturnType<typeof fetchProjectModelPreviewArtifact>>)
    vi.mocked(fetchProjectModelPreview).mockResolvedValue({
      data: new Blob(['preview'], { type: 'model/gltf-binary' }),
    } as unknown as Awaited<ReturnType<typeof fetchProjectModelPreview>>)

    const { result } = renderHook(
      () => useModelStateScenario({ hiddenModelIds: new Set([model.id]) }),
      { wrapper: queryWrapper() },
    )

    await waitFor(() => expect(result.current.previewAssets[0]?.modelId).toBe(model.id))

    expect(result.current.previewAssets[0]).toMatchObject({ previewFormat: 'glb', previewUrl: 'blob:preview' })
    expect(result.current.visibleModelIds).toEqual([])
    expect(result.current.canvasStatusLabel).toBe('Model layers hidden')
    expect(result.current.projectModelTree[0]?.displayName).toBe('Housing')
  })
})

function useModelStateScenario(overrides: Partial<Parameters<typeof useProjectWorkbenchModelState>[0]> = {}) {
  return useProjectWorkbenchModelState({
    hiddenModelIds: new Set(),
    isProjectLoaded: true,
    projectId,
    ...overrides,
  })
}

function queryWrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function glbModel(): ProjectModel {
  return {
    id: 'model_glb',
    project_id: projectId,
    original_filename: 'housing.glb',
    format: 'glb',
    content_type: 'model/gltf-binary',
    byte_size: 120,
    parse_status: 'parsed',
    parse_error: '',
    current_revision_id: 'mvr_glb',
    revision_sequence: 1,
    metadata: {
      asset_type: 'glb',
      version: '',
      schema: 'glb',
      product_names: ['Housing'],
      length_unit: 'millimetre',
      entity_count: 12,
      representation_count: 1,
      triangle_count: 24,
    },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function previewArtifact(modelID: string): ProjectModelPreviewArtifact {
  return {
    id: 'preview_glb',
    model_id: modelID,
    format: 'glb',
    content_type: 'model/gltf-binary',
    generator_version: 'test',
    byte_size: 12,
    vertex_count: 8,
    facet_count: 6,
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadDocument(nodes: ProjectCADDocument['nodes']): ProjectCADDocument {
  return {
    id: 'doc_workbench',
    project_id: projectId,
    schema_version: 1,
    revision: 1,
    unit: 'millimetre',
    nodes,
    operations: [],
    history: { head_id: '', can_undo: false, can_redo: false },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function identityTransform() {
  return { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] }
}
