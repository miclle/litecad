import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode, RefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ProjectWorkbenchComposition } from './project-workbench-composition'
import type { useCADDocumentCommands } from './use-cad-document-commands'
import type { useProjectAssistantController } from './use-project-assistant-controller'
import type { useProjectInspectionRecordsController } from './use-project-inspection-records-controller'
import type { useProjectSectionArtifactsController } from './use-project-section-artifacts-controller'
import type { useProjectModelUploadController } from './use-project-model-upload-controller'
import type { useProjectStepExportController } from './use-project-step-export-controller'
import type { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'
import type { useProjectWorkbenchDraftCommands } from './use-project-workbench-draft-commands'
import type { useProjectWorkbenchInspectorState } from './use-project-workbench-inspector-state'
import type { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import type { useProjectWorkbenchParametricModelCommands } from './use-project-workbench-parametric-model-commands'
import type { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'
import type { useProjectWorkbenchViewControls } from './use-project-workbench-view-controls'
import type { useProjectWorkbenchVisibilityState } from './use-project-workbench-visibility-state'
import type { CADHistoryEntry, Project, ProjectCADDocument } from 'src/types/project'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./project-workbench-layout', () => ({
  ProjectWorkbenchLayout: ({ assistantPanel, canvas, leftPanel, topbar }: MockProps) => (
    <div data-testid="layout">
      {topbar}
      {canvas}
      {leftPanel}
      {assistantPanel}
    </div>
  ),
}))

vi.mock('./project-assistant-panel', () => ({
  ProjectAssistantPanel: ({ onClose, open, sourceCount }: MockProps) => (
    <section data-testid="assistant">
      assistant {String(open)} {String(sourceCount)}
      <button onClick={onClose as () => void}>assistant close</button>
    </section>
  ),
}))

vi.mock('./project-canvas', () => ({
  ProjectCanvas: ({ activeCADTool, onClearSelection, onToggleFuseBoxTool }: MockProps) => (
    <section data-testid="canvas">
      canvas {String(activeCADTool)}
      <button onClick={onClearSelection as () => void}>clear canvas selection</button>
      <button onClick={onToggleFuseBoxTool as () => void}>toggle fuse box</button>
    </section>
  ),
}))

vi.mock('./project-workbench-sidebar', () => ({
  ProjectWorkbenchSidebar: ({
    modelCount,
    onModelSelect,
    onApplyGeneratedArtifactToModel,
    onCaptureSubassembly,
    onInstantiateSubassembly,
    onSaveGeneratedArtifactAsModel,
    onSaveFeatureGraph,
    onSaveModelParameters,
    onToggleModelVisibility,
  }: MockProps) => (
    <aside data-testid="sidebar">
      sidebar {String(modelCount)}
      <button onClick={() => (onModelSelect as (modelID: string, nodeID: string) => void)('model_a', 'node_a')}>select model</button>
      <button onClick={() => (onToggleModelVisibility as (modelID: string) => void)('model_a')}>toggle visibility</button>
      <button onClick={() => (onCaptureSubassembly as (payload: unknown) => void)({ group_id: 'grp_source', name: 'Drive module' })}>capture subassembly</button>
      <button
        onClick={() =>
          (onInstantiateSubassembly as (definitionID: string, payload: unknown) => void)('sub_drive', {
            name: 'Drive A',
            parent_group_id: '',
            translation: [100, 0, 0],
          })
        }
      >
        instantiate subassembly
      </button>
      <button
        onClick={() =>
          (onSaveGeneratedArtifactAsModel as (artifact: unknown, parameterValues: Record<string, unknown>) => void)(
            { id: 'artifact_a' },
            { width: 12 },
          )
        }
      >
        save generated
      </button>
      <button
        onClick={() =>
          (onApplyGeneratedArtifactToModel as (modelID: string, artifact: unknown, parameterValues: Record<string, unknown>) => void)(
            'model_a',
            { id: 'artifact_a' },
            { width: 18 },
          )
        }
      >
        apply generated
      </button>
      <button onClick={() => (onSaveModelParameters as (modelID: string, parameterValues: Record<string, unknown>) => void)('model_a', { radius: 8 })}>
        save params
      </button>
      <button onClick={() => (onSaveFeatureGraph as (modelID: string, sourceCode: string) => void)('model_a', '{"features":[]}')}>save graph</button>
    </aside>
  ),
}))

vi.mock('./project-topbar', () => ({
  ProjectTopbar: ({ canUndo, historyEntries, onFetchNextHistoryPage, onToggleAiChat }: MockProps) => (
    <nav data-testid="topbar">
      topbar {String(canUndo)} {(historyEntries as unknown[]).length}
      <button onClick={onToggleAiChat as () => void}>toggle assistant</button>
      <button onClick={onFetchNextHistoryPage as () => void}>next history</button>
    </nav>
  ),
}))

type MockProps = {
  assistantPanel?: ReactNode
  canvas?: ReactNode
  leftPanel?: ReactNode
  topbar?: ReactNode
} & Record<string, unknown>

describe('ProjectWorkbenchComposition', () => {
  it('renders workbench slots and preserves cross-controller callback glue', () => {
    const callbacks = callbackSpies()
    renderComposition(callbacks)

    expect(document.body.textContent).toContain('topbar true 1')
    expect(document.body.textContent).toContain('canvas inspect')
    expect(document.body.textContent).toContain('sidebar 1')
    expect(document.body.textContent).toContain('assistant true 1')

    click('clear canvas selection')
    expect(callbacks.clearSelection).toHaveBeenCalledTimes(1)
    expect(callbacks.clearDeleteError).toHaveBeenCalledTimes(1)

    click('select model')
    expect(callbacks.selectModel).toHaveBeenCalledWith('model_a', 'node_a')
    expect(callbacks.clearDeleteError).toHaveBeenCalledTimes(2)

    click('toggle fuse box')
    expect(callbacks.setActiveCADTool).toHaveBeenCalledWith(expect.any(Function))

    click('save generated')
    expect(callbacks.saveGeneratedArtifactAsModel).toHaveBeenCalledWith({ artifact: { id: 'artifact_a' }, parameterValues: { width: 12 } })

    click('apply generated')
    expect(callbacks.applyGeneratedArtifactToModel).toHaveBeenCalledWith({ modelID: 'model_a', artifact: { id: 'artifact_a' }, parameterValues: { width: 18 } })

    click('save params')
    expect(callbacks.saveModelParameters).toHaveBeenCalledWith({ modelID: 'model_a', parameterValues: { radius: 8 } })

    click('save graph')
    expect(callbacks.saveFeatureGraph).toHaveBeenCalledWith({ modelID: 'model_a', sourceCode: '{"features":[]}' })

    click('toggle visibility')
    expect(callbacks.toggleModelVisibility).toHaveBeenCalledWith('model_a')

    click('capture subassembly')
    expect(callbacks.captureSubassembly).toHaveBeenCalledWith({ group_id: 'grp_source', name: 'Drive module' })

    click('instantiate subassembly')
    expect(callbacks.instantiateSubassembly).toHaveBeenCalledWith('sub_drive', {
      name: 'Drive A',
      parent_group_id: '',
      translation: [100, 0, 0],
    })

    click('toggle assistant')
    expect(callbacks.toggleAiChat).toHaveBeenCalledTimes(1)

    click('next history')
    expect(callbacks.fetchNextHistoryPage).toHaveBeenCalledTimes(1)
  })
})

function renderComposition(callbacks: ReturnType<typeof callbackSpies>) {
  const host = document.createElement('div')
  document.body.replaceChildren(host)

  act(() => {
    createRoot(host).render(
      <ProjectWorkbenchComposition
        cadDocumentCommands={cadDocumentCommands(callbacks)}
        draftCommands={draftCommands()}
        fileInputRef={{ current: null } as RefObject<HTMLInputElement | null>}
        inspectorState={inspectorState()}
        modelState={modelState(callbacks)}
        parametricModelCommands={parametricModelCommands(callbacks)}
        project={project()}
        projectAssistant={projectAssistant(callbacks)}
        projectCADHistory={{
          entries: [historyEntry()],
          fetchNextPage: callbacks.fetchNextHistoryPage,
          hasNextPage: true,
          isError: false,
          isFetchingNextPage: false,
          isPending: false,
        }}
        projectModelUpload={projectModelUpload()}
        projectInspectionRecords={projectInspectionRecords(callbacks)}
        projectSectionArtifacts={projectSectionArtifacts()}
        projectStepExport={projectStepExport()}
        projectThumbnailSnapshot={projectThumbnailSnapshot()}
        shellState={shellState(callbacks)}
        stepExportTargets={[]}
        viewControls={viewControls()}
        visibilityState={visibilityState(callbacks)}
      />,
    )
  })
}

function click(label: string) {
  act(() => {
    document.querySelectorAll('button').forEach((button) => {
      if (button.textContent === label) {
        button.click()
      }
    })
  })
}

function callbackSpies() {
  return {
    captureSubassembly: vi.fn(),
    clearDeleteError: vi.fn(),
    clearSelection: vi.fn(),
    fetchNextHistoryPage: vi.fn(),
    instantiateSubassembly: vi.fn(),
    applyGeneratedArtifactToModel: vi.fn(),
    saveGeneratedArtifactAsModel: vi.fn(),
    saveFeatureGraph: vi.fn(),
    saveModelParameters: vi.fn(),
    selectModel: vi.fn(),
    setActiveCADTool: vi.fn(),
    toggleAiChat: vi.fn(),
    toggleModelVisibility: vi.fn(),
  }
}

function modelState(callbacks: ReturnType<typeof callbackSpies>) {
  return {
    canvasStatusBody: 'Ready',
    canvasStatusLabel: 'READY',
    modelTranslationsByID: {},
    parametricModels: { selectedSavedArtifact: undefined, updatePreviewParameters: vi.fn() },
    previewAssetModelIDs: new Set(['model_a']),
    previewAssets: [],
    previewSummary: { sourceBody: 'Empty', sourceLabel: 'Preview' },
    projectCADDocument: cadDocument(),
    projectModelTree: [],
    projectModels: [{ id: 'model_a' }],
    projectModelsQuery: { isLoading: false },
    projectSelection: {
      activeCADTool: 'inspect',
      clearSelection: callbacks.clearSelection,
      effectiveSelectedDocumentNodeID: 'node_a',
      effectiveSelectedModelID: 'model_a',
      selectModel: callbacks.selectModel,
      selectedArtifact: undefined,
      selectedDocumentNode: undefined,
      selectedSourceModel: undefined,
      setActiveCADTool: callbacks.setActiveCADTool,
    },
    shouldShowCanvasStatus: true,
    visibleModelIds: ['model_a'],
  } as unknown as ReturnType<typeof useProjectWorkbenchModelState>
}

function inspectorState() {
  return {
    documentDetails: [{ label: 'Unit', value: 'mm' }],
    documentUnitLabel: 'mm',
    inspectorSelection: undefined,
    isSelectedModelBoxFeatureUpdating: false,
    projectDescription: 'Composition project',
    selectedModelBoxFeatureDraft: undefined,
    selectedModelBoxFeatureError: '',
    selectedModelDisplayName: 'Model A',
    selectedModelSupportsFuseBox: false,
  } as unknown as ReturnType<typeof useProjectWorkbenchInspectorState>
}

function shellState(callbacks: ReturnType<typeof callbackSpies>) {
  return {
    aiChatPanelMaxWidth: 600,
    aiChatPanelWidth: 420,
    canvasRightOffset: 20,
    canvasStatusLeftOffset: 302,
    closeAiChat: vi.fn(),
    isAiChatOpen: true,
    isAiChatPanelResizing: false,
    isAiChatTransitioning: false,
    isHistoryOpen: false,
    isLeftPanelCollapsed: false,
    isProjectInfoOpen: false,
    isStepExportOpen: false,
    leftPanelWidth: 270,
    setIsHistoryOpen: vi.fn(),
    setIsLeftPanelCollapsed: vi.fn(),
    setIsProjectInfoOpen: vi.fn(),
    setIsStepExportOpen: vi.fn(),
    startAiChatPanelResize: vi.fn(),
    startLeftPanelResize: vi.fn(),
    toggleAiChat: callbacks.toggleAiChat,
    workspaceGridStyle: { gridTemplateColumns: '1fr 420px' },
  } as unknown as ReturnType<typeof useProjectWorkbenchShellState>
}

function cadDocumentCommands(callbacks: ReturnType<typeof callbackSpies>) {
  return {
    captureSubassembly: callbacks.captureSubassembly,
    changeHistory: vi.fn(),
    clearDeleteError: callbacks.clearDeleteError,
    historyError: '',
    isPending: false,
    instantiateSubassembly: callbacks.instantiateSubassembly,
  } as unknown as ReturnType<typeof useCADDocumentCommands>
}

function draftCommands() {
  return {
    addBoxFeatureDraft: vi.fn(),
    draftModelTranslationsByID: {},
    updateBoxFeatureDraft: vi.fn(),
    updateTransformDraftField: vi.fn(),
    updateTransformDraftFromTranslation: vi.fn(),
  } as unknown as ReturnType<typeof useProjectWorkbenchDraftCommands>
}

function projectAssistant(callbacks: ReturnType<typeof callbackSpies>) {
  return {
    activeConversationID: '',
    conversations: [],
    createConversation: vi.fn(),
    draft: '',
    generateParametricArtifact: vi.fn(),
    generatedArtifactRevisionTargetModelID: '',
    isPending: false,
    messages: [],
    parametricRunError: '',
    pendingKind: 'message',
    retryParametricGeneration: vi.fn(),
    retryParametricPrompt: '',
    selectConversation: vi.fn(),
    setDraft: vi.fn(),
    submitMessage: vi.fn(),
    toggleAiChat: callbacks.toggleAiChat,
  } as unknown as ReturnType<typeof useProjectAssistantController>
}

function projectModelUpload() {
  return {
    handleModelFileChange: vi.fn(),
    isUploading: false,
    uploadError: '',
  } as unknown as ReturnType<typeof useProjectModelUploadController>
}

function projectInspectionRecords(_callbacks: ReturnType<typeof callbackSpies>) {
  return {
    analyzeTopology: vi.fn(),
    canAnalyzeTopology: false,
    deleteInspectionRecord: vi.fn(),
    inspectionRecords: [],
    inspectionRecordError: '',
    isInspectionRecordMutationPending: false,
    isInspectionRecordsLoading: false,
    saveMeasurementRecord: vi.fn(),
    saveSectionRecord: vi.fn(),
    selectedRestoredRecord: undefined,
  } as unknown as ReturnType<typeof useProjectInspectionRecordsController>
}

function projectSectionArtifacts() {
  return {
    deleteSectionArtifact: vi.fn(),
    downloadSectionArtifact: vi.fn(),
    generateSectionArtifact: vi.fn(),
    getSectionArtifactState: vi.fn(() => 'legacy'),
    isSectionArtifactMutationPending: false,
    isSectionArtifactsError: false,
    isSectionArtifactsLoading: false,
    regenerateSectionArtifact: vi.fn(),
    restoreSectionArtifact: vi.fn(),
    sectionArtifacts: [],
    sectionArtifactError: '',
    visibleSectionTargetCount: 0,
  } as unknown as ReturnType<typeof useProjectSectionArtifactsController>
}

function projectStepExport() {
  return {
    downloadExportArtifact: vi.fn(),
    errorByModelID: {},
    exportArtifacts: [],
    exportSelection: vi.fn(),
    isExportHistoryError: false,
    isExportHistoryLoading: false,
    selectAllTargets: vi.fn(),
    selectedTargetIDs: new Set<string>(),
    statusByModelID: {},
    toggleTarget: vi.fn(),
  } as unknown as ReturnType<typeof useProjectStepExportController>
}

function projectThumbnailSnapshot() {
  return {
    onSnapshotCapture: vi.fn(),
  } as unknown as ReturnType<typeof useProjectThumbnailSnapshotController>
}

function parametricModelCommands(callbacks: ReturnType<typeof callbackSpies>) {
  return {
    applyGeneratedArtifactToModel: callbacks.applyGeneratedArtifactToModel,
    saveGeneratedArtifactAsModel: callbacks.saveGeneratedArtifactAsModel,
    saveFeatureGraph: callbacks.saveFeatureGraph,
    saveModelParameters: callbacks.saveModelParameters,
  } as unknown as ReturnType<typeof useProjectWorkbenchParametricModelCommands>
}

function viewControls() {
  return {
    animateViewCubeOrientation: false,
    applyCanvasOrientation: vi.fn(),
    flipCanvasOrientation: vi.fn(),
    stepCanvasOrientation: vi.fn(),
    viewOrientation: { yaw: 22, pitch: 18 },
  } as unknown as ReturnType<typeof useProjectWorkbenchViewControls>
}

function visibilityState(callbacks: ReturnType<typeof callbackSpies>) {
  return {
    hiddenModelIDs: new Set<string>(),
    toggleModelVisibility: callbacks.toggleModelVisibility,
  } as unknown as ReturnType<typeof useProjectWorkbenchVisibilityState>
}

function project(): Project {
  return {
    id: 'prj_composition',
    name: 'Composition Project',
    description: '',
    thumbnail: { model_count: 1, models: [] },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadDocument(): ProjectCADDocument {
  return {
    id: 'doc_composition',
    project_id: 'prj_composition',
    schema_version: 1,
    revision: 1,
    unit: 'millimetre',
    nodes: [],
    operations: [],
    history: { head_id: 'history_a', can_undo: true, can_redo: false },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function historyEntry(): CADHistoryEntry {
  return {
    id: 'history_a',
    sequence: 1,
    status: 'applied',
    command_type: 'transform',
    target_id: 'node_a',
    summary: 'Moved model',
    created_at: '2026-07-13T00:00:00Z',
  }
}
