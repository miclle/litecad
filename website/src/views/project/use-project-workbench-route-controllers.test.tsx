import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProjectCADHistory } from 'src/api/projects'
import { useProjectWorkbenchRouteControllers } from './use-project-workbench-route-controllers'
import { useCADDocumentCommands } from './use-cad-document-commands'
import { useProjectAssistantController } from './use-project-assistant-controller'
import { useProjectModelUploadController } from './use-project-model-upload-controller'
import { useProjectStepExportController } from './use-project-step-export-controller'
import { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'
import { useProjectWorkbenchDraftCommands } from './use-project-workbench-draft-commands'
import { useProjectWorkbenchInspectorState } from './use-project-workbench-inspector-state'
import { useProjectWorkbenchKeyboardCommands } from './use-project-workbench-keyboard-commands'
import { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import { useProjectWorkbenchParametricModelCommands } from './use-project-workbench-parametric-model-commands'
import { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'
import { useProjectWorkbenchViewControls } from './use-project-workbench-view-controls'
import { useProjectWorkbenchVisibilityState } from './use-project-workbench-visibility-state'
import type { Project, ProjectCADDocument } from 'src/types/project'

vi.mock('src/api/projects', () => ({
  fetchProjectCADHistory: vi.fn(),
}))

vi.mock('./use-cad-document-commands', () => ({ useCADDocumentCommands: vi.fn() }))
vi.mock('./use-project-assistant-controller', () => ({ useProjectAssistantController: vi.fn() }))
vi.mock('./use-project-model-upload-controller', () => ({ useProjectModelUploadController: vi.fn() }))
vi.mock('./use-project-step-export-controller', () => ({ useProjectStepExportController: vi.fn() }))
vi.mock('./use-project-thumbnail-snapshot-controller', () => ({ useProjectThumbnailSnapshotController: vi.fn() }))
vi.mock('./use-project-workbench-draft-commands', () => ({ useProjectWorkbenchDraftCommands: vi.fn() }))
vi.mock('./use-project-workbench-inspector-state', () => ({ useProjectWorkbenchInspectorState: vi.fn() }))
vi.mock('./use-project-workbench-keyboard-commands', () => ({ useProjectWorkbenchKeyboardCommands: vi.fn() }))
vi.mock('./use-project-workbench-model-state', () => ({ useProjectWorkbenchModelState: vi.fn() }))
vi.mock('./use-project-workbench-parametric-model-commands', () => ({ useProjectWorkbenchParametricModelCommands: vi.fn() }))
vi.mock('./use-project-workbench-shell-state', () => ({ useProjectWorkbenchShellState: vi.fn() }))
vi.mock('./use-project-workbench-view-controls', () => ({ useProjectWorkbenchViewControls: vi.fn() }))
vi.mock('./use-project-workbench-visibility-state', () => ({ useProjectWorkbenchVisibilityState: vi.fn() }))

const mockedFetchProjectCADHistory = vi.mocked(fetchProjectCADHistory)
const mockedUseCADDocumentCommands = vi.mocked(useCADDocumentCommands)
const mockedUseProjectAssistantController = vi.mocked(useProjectAssistantController)
const mockedUseProjectModelUploadController = vi.mocked(useProjectModelUploadController)
const mockedUseProjectStepExportController = vi.mocked(useProjectStepExportController)
const mockedUseProjectThumbnailSnapshotController = vi.mocked(useProjectThumbnailSnapshotController)
const mockedUseProjectWorkbenchDraftCommands = vi.mocked(useProjectWorkbenchDraftCommands)
const mockedUseProjectWorkbenchInspectorState = vi.mocked(useProjectWorkbenchInspectorState)
const mockedUseProjectWorkbenchKeyboardCommands = vi.mocked(useProjectWorkbenchKeyboardCommands)
const mockedUseProjectWorkbenchModelState = vi.mocked(useProjectWorkbenchModelState)
const mockedUseProjectWorkbenchParametricModelCommands = vi.mocked(useProjectWorkbenchParametricModelCommands)
const mockedUseProjectWorkbenchShellState = vi.mocked(useProjectWorkbenchShellState)
const mockedUseProjectWorkbenchViewControls = vi.mocked(useProjectWorkbenchViewControls)
const mockedUseProjectWorkbenchVisibilityState = vi.mocked(useProjectWorkbenchVisibilityState)

describe('useProjectWorkbenchRouteControllers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchProjectCADHistory.mockResolvedValue({
      data: {
        entries: [historyEntry()],
        next_before_sequence: undefined,
      },
    } as Awaited<ReturnType<typeof fetchProjectCADHistory>>)
    installControllerMocks()
  })

  it('assembles workbench controllers and loads History only when the shell opens it', async () => {
    renderRouteControllers()

    await waitFor(() => expect(mockedFetchProjectCADHistory).toHaveBeenCalledWith('prj_route', undefined))
    expect(mockedUseProjectWorkbenchModelState).toHaveBeenCalledWith({
      hiddenModelIds: new Set(['model_hidden']),
      isProjectLoaded: true,
      projectId: 'prj_route',
    })
    expect(mockedUseProjectAssistantController).toHaveBeenCalledWith({
      enabled: true,
      onArtifactSelected: expect.any(Function),
      projectId: 'prj_route',
    })
    expect(mockedUseProjectStepExportController).toHaveBeenCalledWith({
      assemblyDownloadFilename: 'Route Project-litecad-assembly-r7.step',
      projectId: 'prj_route',
      targets: [],
    })
    expect(mockedUseProjectWorkbenchKeyboardCommands).toHaveBeenCalledWith({
      changeHistory: expect.any(Function),
      clearDeleteError: expect.any(Function),
      deleteNode: expect.any(Function),
			deleteOccurrence: undefined,
      isCADDocumentCommandPending: false,
      keyboardDeleteNode: cadDocumentNode(),
      projectCADDocument: cadDocument(),
			selectedModelOccurrenceCount: 0,
			selectedOccurrence: undefined,
    })
  })

  it('routes generated-artifact save failures back into the Assistant error state', () => {
    const setParametricRunError = vi.fn()
    installControllerMocks({ setParametricRunError })

    renderRouteControllers()

    const parametricOptions = mockedUseProjectWorkbenchParametricModelCommands.mock.calls[0]?.[0]
    parametricOptions?.onArtifactSaveError()

    expect(setParametricRunError).toHaveBeenCalledWith('Generated source could not be added to the canvas. Try generating it again.')
  })
})

function renderRouteControllers() {
  return renderHook(
    () =>
      useProjectWorkbenchRouteControllers({
        isProjectLoaded: true,
        project: project(),
        projectId: 'prj_route',
      }),
    { wrapper: queryWrapper() },
  )
}

function installControllerMocks(overrides: { setParametricRunError?: ReturnType<typeof vi.fn> } = {}) {
  const hiddenModelIDs = new Set(['model_hidden'])
  const shellState = {
    handleCADDocumentConflict: vi.fn(),
    isAiChatOpen: true,
    isHistoryOpen: true,
  }
  const modelState = {
    cadNodeByID: new Map([['node_route', cadDocumentNode()]]),
    latestModel: undefined,
    latestTriangleCount: 0,
    previewAssets: [],
    previewSummary: { previewLabel: 'Empty' },
    projectCADDocument: cadDocument(),
    projectModels: [],
    projectSelection: {
      clearSelection: vi.fn(),
      effectiveSelectedDocumentNodeID: 'node_route',
      selectArtifact: vi.fn(),
      selectModel: vi.fn(),
      selectedDocumentNode: cadDocumentNode(),
      selectedSourceModel: undefined,
    },
    sourceNodeIDByModelID: new Map(),
    visibleModelIds: [],
  }
  const draftCommands = {
    boxFeatureDraftsByModelID: {},
    handleCADDocumentNodeDeleted: vi.fn(),
    handleTransformSynchronized: vi.fn(),
    latestBoxFeatureDraftForModel: vi.fn(),
    transformDraftsByNodeID: {},
  }
  const cadDocumentCommands = {
    boxErrorsByModelId: {},
    changeHistory: vi.fn(),
    clearDeleteError: vi.fn(),
    deleteError: '',
    deleteNode: vi.fn(),
    historyError: '',
    isBoxUnionPendingFor: vi.fn(() => false),
    isPending: false,
    transformErrorsByNodeId: {},
  }
  const projectAssistant = {
    setParametricRunError: overrides.setParametricRunError ?? vi.fn(),
  }

  mockedUseProjectWorkbenchShellState.mockReturnValue(shellState as unknown as ReturnType<typeof useProjectWorkbenchShellState>)
  mockedUseProjectWorkbenchViewControls.mockReturnValue({} as ReturnType<typeof useProjectWorkbenchViewControls>)
  mockedUseProjectWorkbenchVisibilityState.mockReturnValue({
    hiddenModelIDs,
  } as ReturnType<typeof useProjectWorkbenchVisibilityState>)
  mockedUseProjectModelUploadController.mockReturnValue({} as ReturnType<typeof useProjectModelUploadController>)
  mockedUseProjectWorkbenchModelState.mockReturnValue(modelState as unknown as ReturnType<typeof useProjectWorkbenchModelState>)
  mockedUseProjectStepExportController.mockReturnValue({ errorByModelID: {}, statusByModelID: {} } as ReturnType<typeof useProjectStepExportController>)
  mockedUseProjectAssistantController.mockReturnValue(projectAssistant as unknown as ReturnType<typeof useProjectAssistantController>)
  mockedUseProjectWorkbenchDraftCommands.mockReturnValue(draftCommands as unknown as ReturnType<typeof useProjectWorkbenchDraftCommands>)
  mockedUseCADDocumentCommands.mockReturnValue(cadDocumentCommands as unknown as ReturnType<typeof useCADDocumentCommands>)
  mockedUseProjectWorkbenchParametricModelCommands.mockReturnValue({} as ReturnType<typeof useProjectWorkbenchParametricModelCommands>)
  mockedUseProjectThumbnailSnapshotController.mockReturnValue({} as ReturnType<typeof useProjectThumbnailSnapshotController>)
  mockedUseProjectWorkbenchInspectorState.mockReturnValue({} as ReturnType<typeof useProjectWorkbenchInspectorState>)
  mockedUseProjectWorkbenchKeyboardCommands.mockReturnValue(undefined)
}

function queryWrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function project(): Project {
  return {
    id: 'prj_route',
    name: 'Route Project',
    description: '',
    thumbnail: { model_count: 0, models: [] },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadDocument(): ProjectCADDocument {
  return {
    id: 'doc_route',
    project_id: 'prj_route',
    schema_version: 1,
    revision: 7,
    unit: 'millimetre',
    nodes: [cadDocumentNode()],
    operations: [],
    history: { head_id: 'history_route', can_undo: false, can_redo: false },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadDocumentNode(): ProjectCADDocument['nodes'][number] {
  return {
    id: 'node_route',
    model_id: 'model_route',
    parent_node_id: '',
    source_model_id: 'model_route',
    source_format: 'step',
    name: 'Route node',
    transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] },
  }
}

function historyEntry() {
  return {
    id: 'history_route',
    sequence: 7,
    status: 'applied',
    command_type: 'transform',
    target_id: 'node_route',
    summary: 'Moved route node',
    created_at: '2026-07-13T00:00:00Z',
  }
}
