import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  saveProjectParametricArtifactModel,
  restoreProjectModelRevision,
  updateProjectFeatureDSLGraph,
  updateProjectParametricArtifact,
  updateProjectParametricModelParameters,
} from 'src/api/projects'
import { useProjectWorkbenchParametricModelCommands } from './use-project-workbench-parametric-model-commands'
import type { ProjectModel, ProjectParametricArtifact } from 'src/types/project'

vi.mock('src/api/projects', () => ({
  saveProjectParametricArtifactModel: vi.fn(),
  restoreProjectModelRevision: vi.fn(),
  updateProjectFeatureDSLGraph: vi.fn(),
  updateProjectParametricArtifact: vi.fn(),
  updateProjectParametricModelParameters: vi.fn(),
}))

const mockedSaveProjectParametricArtifactModel = vi.mocked(saveProjectParametricArtifactModel)
const mockedRestoreProjectModelRevision = vi.mocked(restoreProjectModelRevision)
const mockedUpdateProjectFeatureDSLGraph = vi.mocked(updateProjectFeatureDSLGraph)
const mockedUpdateProjectParametricArtifact = vi.mocked(updateProjectParametricArtifact)
const mockedUpdateProjectParametricModelParameters = vi.mocked(updateProjectParametricModelParameters)

describe('useProjectWorkbenchParametricModelCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves a generated artifact as a model and refreshes dependent project queries', async () => {
    const model = projectModel('model_saved')
    mockedUpdateProjectParametricArtifact.mockResolvedValue({ data: { artifact: artifact() } } as Awaited<ReturnType<typeof updateProjectParametricArtifact>>)
    mockedSaveProjectParametricArtifactModel.mockResolvedValue({ data: { model } } as Awaited<ReturnType<typeof saveProjectParametricArtifactModel>>)
    const onModelSelected = vi.fn()
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(
      () =>
        useProjectWorkbenchParametricModelCommands({
          onArtifactSaveError: vi.fn(),
          onModelSelected,
          projectId: 'prj_commands',
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => {
      result.current.saveGeneratedArtifactAsModel({
        artifact: artifact(),
        parameterValues: { width: 12 },
      })
    })

    await waitFor(() => expect(onModelSelected).toHaveBeenCalledWith('model_saved'))
    expect(mockedUpdateProjectParametricArtifact).toHaveBeenCalledWith('prj_commands', 'artifact_saved', {
      title: 'Generated bracket',
      source_kind: 'litecad-feature-dsl',
      source_code: '{"version":"1.0"}',
      parameter_values: { width: 12 },
      compile_status: 'success',
      compile_error: '',
    })
    expect(mockedSaveProjectParametricArtifactModel).toHaveBeenCalledWith('prj_commands', 'artifact_saved')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'models'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'cad-document'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'parametric-artifacts'] })
  })

  it('applies a generated artifact to an existing LiteCAD model revision', async () => {
    const model = { ...projectModel('model_revision'), revision_sequence: 2 }
    mockedUpdateProjectParametricArtifact.mockResolvedValue({ data: { artifact: artifact() } } as Awaited<ReturnType<typeof updateProjectParametricArtifact>>)
    mockedUpdateProjectFeatureDSLGraph.mockResolvedValue({ data: { model } } as Awaited<ReturnType<typeof updateProjectFeatureDSLGraph>>)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['projects', 'prj_commands', 'cad-document'], { revision: 17 })
    const removeQueries = vi.spyOn(queryClient, 'removeQueries')
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const onModelSelected = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectWorkbenchParametricModelCommands({
          onArtifactSaveError: vi.fn(),
          onModelSelected,
          projectId: 'prj_commands',
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => {
      result.current.applyGeneratedArtifactToModel({
        artifact: artifact(),
        modelID: 'model_revision',
        parameterValues: { width: 24 },
      })
    })

    await waitFor(() => expect(onModelSelected).toHaveBeenCalledWith('model_revision'))
    expect(mockedUpdateProjectParametricArtifact).toHaveBeenCalledWith('prj_commands', 'artifact_saved', {
      title: 'Generated bracket',
      source_kind: 'litecad-feature-dsl',
      source_code: '{"version":"1.0"}',
      parameter_values: { width: 24 },
      compile_status: 'success',
      compile_error: '',
    })
    expect(mockedUpdateProjectFeatureDSLGraph).toHaveBeenCalledWith('prj_commands', 'model_revision', {
      source_code: '{"version":"1.0"}',
      expected_revision: 17,
    })
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ['projects', 'prj_commands', 'models', 'model_revision', 'parametric-source'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'models'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'models', 'model_revision', 'revisions'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'cad-document'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'cad-document', 'history'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'parametric-artifacts'] })
  })

  it('reports generated artifact save failures through the Assistant error boundary', async () => {
    mockedUpdateProjectParametricArtifact.mockRejectedValue(new Error('save failed'))
    const onArtifactSaveError = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectWorkbenchParametricModelCommands({
          onArtifactSaveError,
          onModelSelected: vi.fn(),
          projectId: 'prj_commands',
        }),
      { wrapper: queryWrapper(new QueryClient()) },
    )

    act(() => {
      result.current.saveGeneratedArtifactAsModel({
        artifact: artifact(),
        parameterValues: {},
      })
    })

    await waitFor(() => expect(onArtifactSaveError).toHaveBeenCalledTimes(1))
  })

  it('saves model parameter changes and refreshes History', async () => {
    mockedUpdateProjectParametricModelParameters.mockResolvedValue({
      data: { model: projectModel('model_parameters') },
    } as Awaited<ReturnType<typeof updateProjectParametricModelParameters>>)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['projects', 'prj_commands', 'cad-document'], { revision: 7 })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const onModelSelected = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectWorkbenchParametricModelCommands({
          onArtifactSaveError: vi.fn(),
          onModelSelected,
          projectId: 'prj_commands',
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => {
      result.current.saveModelParameters({
        modelID: 'model_parameters',
        parameterValues: { radius: 8 },
      })
    })

    await waitFor(() => expect(onModelSelected).toHaveBeenCalledWith('model_parameters'))
    expect(mockedUpdateProjectParametricModelParameters).toHaveBeenCalledWith('prj_commands', 'model_parameters', {
      parameter_values: { radius: 8 },
      expected_revision: 7,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'models'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'cad-document'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'cad-document', 'history'] })
  })

  it('restores an immutable model revision and refreshes its source and History', async () => {
    const model = projectModel('model_parameters')
    mockedRestoreProjectModelRevision.mockResolvedValue({ data: { model } } as Awaited<ReturnType<typeof restoreProjectModelRevision>>)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['projects', 'prj_commands', 'cad-document'], { revision: 9 })
    const removeQueries = vi.spyOn(queryClient, 'removeQueries')
    const onModelSelected = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectWorkbenchParametricModelCommands({
          onArtifactSaveError: vi.fn(),
          onModelSelected,
          projectId: 'prj_commands',
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => {
      result.current.restoreModelRevision({ modelID: 'model_parameters', revisionID: 'mvr_first' })
    })

    await waitFor(() => expect(onModelSelected).toHaveBeenCalledWith('model_parameters'))
    expect(mockedRestoreProjectModelRevision).toHaveBeenCalledWith('prj_commands', 'model_parameters', 'mvr_first', 9)
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ['projects', 'prj_commands', 'models', 'model_parameters', 'parametric-source'],
    })
  })

  it('saves a Feature DSL graph revision and refreshes source preview and History', async () => {
    const model = { ...projectModel('model_graph'), revision_sequence: 2 }
    mockedUpdateProjectFeatureDSLGraph.mockResolvedValue({ data: { model } } as Awaited<ReturnType<typeof updateProjectFeatureDSLGraph>>)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['projects', 'prj_commands', 'cad-document'], { revision: 11 })
    const removeQueries = vi.spyOn(queryClient, 'removeQueries')
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const onModelSelected = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectWorkbenchParametricModelCommands({
          onArtifactSaveError: vi.fn(),
          onModelSelected,
          projectId: 'prj_commands',
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => {
      result.current.saveFeatureGraph({ modelID: 'model_graph', sourceCode: '{"version":1}' })
    })

    await waitFor(() => expect(onModelSelected).toHaveBeenCalledWith('model_graph'))
    expect(mockedUpdateProjectFeatureDSLGraph).toHaveBeenCalledWith('prj_commands', 'model_graph', {
      source_code: '{"version":1}',
      expected_revision: 11,
    })
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ['projects', 'prj_commands', 'models', 'model_graph', 'parametric-source'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'models'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'models', 'model_graph', 'revisions'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'cad-document'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_commands', 'cad-document', 'history'] })
  })

  it('refreshes model state after a stale Feature DSL graph revision', async () => {
    mockedUpdateProjectFeatureDSLGraph.mockRejectedValue({ response: { status: 409 } })
    const queryClient = new QueryClient()
    queryClient.setQueryData(['projects', 'prj_commands', 'cad-document'], { revision: 12 })
    const onConflict = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectWorkbenchParametricModelCommands({
          onArtifactSaveError: vi.fn(),
          onConflict,
          onModelSelected: vi.fn(),
          projectId: 'prj_commands',
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => {
      result.current.saveFeatureGraph({ modelID: 'model_graph', sourceCode: '{"version":1}' })
    })

    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1))
  })
})

function queryWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function artifact(): ProjectParametricArtifact {
  return {
    id: 'artifact_saved',
    project_id: 'prj_commands',
    conversation_id: 'conversation_saved',
    message_id: 'message_saved',
    title: 'Generated bracket',
    source_kind: 'litecad-feature-dsl',
    source_code: '{"version":"1.0"}',
    parameter_values: {},
    compile_status: 'pending',
    compile_error: '',
    preview_model_id: '',
    generation_tool_mode: 'native_tool',
    generation_duration_ms: 1200,
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function projectModel(id: string): ProjectModel {
  return {
    id,
    project_id: 'prj_commands',
    original_filename: `${id}.lcad.json`,
    format: 'lcad',
    content_type: 'application/json',
    byte_size: 120,
    parse_status: 'parsed',
    parse_error: '',
    current_revision_id: `mvr_${id}`,
    revision_sequence: 1,
    metadata: {
      asset_type: 'feature-dsl',
      version: '1.0',
      schema: '',
      product_names: [],
      length_unit: 'millimetre',
      entity_count: 0,
      representation_count: 0,
      triangle_count: 0,
    },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}
