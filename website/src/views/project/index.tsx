import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  FileText,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProject,
  fetchProjectCADHistory,
} from 'src/api/projects'
import { ProjectCanvas } from './project-canvas'
import { ProjectAssistantPanel } from './project-assistant-panel'
import { ProjectTopbar } from './project-topbar'
import { ProjectWorkbenchSidebar } from './project-workbench-sidebar'
import { ProjectWorkbenchLayout } from './project-workbench-layout'
import {
  buildStepExportTargets,
  stepAssemblyExportFilename,
} from './project-step-export'
import { useCADDocumentCommands } from './use-cad-document-commands'
import { useProjectAssistantController } from './use-project-assistant-controller'
import { useProjectModelUploadController } from './use-project-model-upload-controller'
import { useProjectStepExportController } from './use-project-step-export-controller'
import { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'
import { useProjectWorkbenchInspectorState } from './use-project-workbench-inspector-state'
import { useProjectWorkbenchDraftCommands, type ProjectWorkbenchDraftCommandAdapter } from './use-project-workbench-draft-commands'
import { useProjectWorkbenchKeyboardCommands } from './use-project-workbench-keyboard-commands'
import { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import { useProjectWorkbenchParametricModelCommands } from './use-project-workbench-parametric-model-commands'
import { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'
import { useProjectWorkbenchViewControls } from './use-project-workbench-view-controls'
import { useProjectWorkbenchVisibilityState } from './use-project-workbench-visibility-state'
import { initialViewOrientation } from './view-orientation'

function ProjectView() {
  const { projectId = '' } = useParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    aiChatPanelMaxWidth,
    aiChatPanelWidth,
    canvasRightOffset,
    canvasStatusLeftOffset,
    closeAiChat,
    handleCADDocumentConflict,
    isAiChatOpen,
    isAiChatPanelResizing,
    isAiChatTransitioning,
    isHistoryOpen,
    isLeftPanelCollapsed,
    isProjectInfoOpen,
    isStepExportOpen,
    leftPanelWidth,
    setIsHistoryOpen,
    setIsLeftPanelCollapsed,
    setIsProjectInfoOpen,
    setIsStepExportOpen,
    startAiChatPanelResize,
    startLeftPanelResize,
    toggleAiChat,
    workspaceGridStyle,
  } = useProjectWorkbenchShellState()
  const {
    animateViewCubeOrientation,
    applyCanvasOrientation,
    flipCanvasOrientation,
    stepCanvasOrientation,
    viewOrientation,
  } = useProjectWorkbenchViewControls()
  const { hiddenModelIDs, toggleModelVisibility } = useProjectWorkbenchVisibilityState()
  const cadDocumentCommandAdapterRef = useRef<ProjectWorkbenchDraftCommandAdapter | null>(null)
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => (await fetchProject(projectId)).data.project,
    enabled: projectId !== '',
  })
  const projectModelUpload = useProjectModelUploadController({
    projectId,
  })
  const project = projectQuery.data
  const {
    cadNodeByID,
    canvasStatusBody,
    canvasStatusLabel,
    latestModel,
    latestTriangleCount,
    modelTranslationsByID,
    parametricModels,
    previewAssetModelIDs,
    previewAssets,
    previewSummary,
    projectCADDocument,
    projectModelTree,
    projectModels,
    projectModelsQuery,
    projectSelection,
    shouldShowCanvasStatus,
    sourceNodeIDByModelID,
    visibleModelIds,
  } = useProjectWorkbenchModelState({
    hiddenModelIds: hiddenModelIDs,
    isProjectLoaded: projectQuery.isSuccess,
    projectId,
  })
  const projectCADHistoryQuery = useInfiniteQuery({
    queryKey: ['projects', projectId, 'cad-document', 'history'],
    queryFn: async ({ pageParam }) => (await fetchProjectCADHistory(projectId, pageParam)).data,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_before_sequence,
    enabled: projectId !== '' && Boolean(projectCADDocument) && isHistoryOpen,
  })
  const projectCADHistory = projectCADHistoryQuery.data?.pages.flatMap((page) => page.entries) ?? []
  const stepExportTargets = useMemo(
    () => buildStepExportTargets(projectModels, projectCADDocument),
    [projectModels, projectCADDocument],
  )
  const stepAssemblyDownloadFilename = stepAssemblyExportFilename(project?.name ?? 'assembly', projectCADDocument?.revision ?? 0)
  const projectStepExport = useProjectStepExportController({
    assemblyDownloadFilename: stepAssemblyDownloadFilename,
    projectId,
    targets: stepExportTargets,
  })
  const projectAssistant = useProjectAssistantController({
    enabled: projectId !== '' && isAiChatOpen,
    onArtifactSelected: projectSelection.selectArtifact,
    projectId,
  })
  const {
    activeCADTool,
    effectiveSelectedDocumentNodeID,
    effectiveSelectedModelID,
    clearSelection,
    selectModel,
    selectedArtifact: selectedParametricArtifact,
    selectedDocumentNode,
    selectedSourceModel,
    setActiveCADTool,
  } = projectSelection
  const projectDraftCommands = useProjectWorkbenchDraftCommands({
    cadNodeByID,
    commandAdapterRef: cadDocumentCommandAdapterRef,
    onSelectionClear: clearSelection,
    projectCADDocument,
    sourceNodeIDByModelID,
  })
  const cadDocumentCommands = useCADDocumentCommands({
    projectId,
    onConflict: handleCADDocumentConflict,
    onNodeDeleted: projectDraftCommands.handleCADDocumentNodeDeleted,
    onTransformSynchronized: projectDraftCommands.handleTransformSynchronized,
  })
  const {
    changeHistory,
    isPending: isCADDocumentCommandPending,
  } = cadDocumentCommands
  const keyboardDeleteNode = effectiveSelectedDocumentNodeID ? cadNodeByID.get(effectiveSelectedDocumentNodeID) : undefined
  const selectedSavedParametricArtifact = parametricModels.selectedSavedArtifact
  const projectParametricModelCommands = useProjectWorkbenchParametricModelCommands({
    onArtifactSaveError: () => {
      projectAssistant.setParametricRunError('Generated source could not be added to the canvas. Try generating it again.')
    },
    onModelSelected: projectSelection.selectModel,
    projectId,
  })
  const projectThumbnailSnapshot = useProjectThumbnailSnapshotController({
    previewAssets,
    projectId,
    revision: projectCADDocument?.revision ?? 0,
    visibleModelIds,
  })

  useEffect(() => {
    cadDocumentCommandAdapterRef.current = cadDocumentCommands
    return () => {
      if (cadDocumentCommandAdapterRef.current === cadDocumentCommands) {
        cadDocumentCommandAdapterRef.current = null
      }
    }
  }, [cadDocumentCommands])

  useProjectWorkbenchKeyboardCommands({
    changeHistory,
    clearDeleteError: cadDocumentCommands.clearDeleteError,
    deleteNode: cadDocumentCommands.deleteNode,
    isCADDocumentCommandPending,
    keyboardDeleteNode,
    projectCADDocument,
  })

  const {
    documentDetails,
    documentUnitLabel,
    inspectorSelection,
    isSelectedModelBoxFeatureUpdating,
    projectDescription,
    selectedModelBoxFeatureDraft,
    selectedModelBoxFeatureError,
    selectedModelDisplayName,
    selectedModelSupportsFuseBox,
  } = useProjectWorkbenchInspectorState({
    boxErrorsByModelId: cadDocumentCommands.boxErrorsByModelId,
    boxFeatureDraftsByModelId: projectDraftCommands.boxFeatureDraftsByModelID,
    deleteError: cadDocumentCommands.deleteError,
    getBoxFeatureDraft: projectDraftCommands.latestBoxFeatureDraftForModel,
    isBoxUnionPendingFor: cadDocumentCommands.isBoxUnionPendingFor,
    latestModel,
    latestTriangleCount,
    previewSummary,
    project,
    projectCADDocument,
    selectedDocumentNode,
    selectedSourceModel,
    stepExportErrorByModelId: projectStepExport.errorByModelID,
    stepExportStatusByModelId: projectStepExport.statusByModelID,
    transformDraftsByNodeId: projectDraftCommands.transformDraftsByNodeID,
    transformErrorsByNodeId: cadDocumentCommands.transformErrorsByNodeId,
  })

  if (projectQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] text-[#0f172a]">
        <div className="font-mono text-xs uppercase tracking-wide text-[#64748b]">Opening project</div>
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] px-5 text-center text-[#0f172a]">
        <div>
          <FileText className="mx-auto size-8 text-[#475569]" />
          <h1 className="mt-4 text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#64748b]">
            This project could not be loaded. It may have been removed or belongs to another account.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0f172a] px-4 text-sm font-semibold text-[#f8fafc] no-underline transition hover:bg-[#1f2937]"
            to="/projects"
          >
            <ArrowLeft className="size-4" />
            All projects
          </Link>
        </div>
      </div>
    )
  }
  return (
    <ProjectWorkbenchLayout
      assistantPanel={
        <ProjectAssistantPanel
          activeConversationId={projectAssistant.activeConversationID}
          conversations={projectAssistant.conversations}
          draft={projectAssistant.draft}
          isPending={projectAssistant.isPending}
          maxWidth={aiChatPanelMaxWidth}
          messages={projectAssistant.messages}
          onClose={closeAiChat}
          onCreateConversation={projectAssistant.createConversation}
          onDraftChange={projectAssistant.setDraft}
          onGenerateParametric={projectAssistant.generateParametricArtifact}
          onResizePointerDown={startAiChatPanelResize}
          onRetryParametric={projectAssistant.retryParametricGeneration}
          onSelectConversation={projectAssistant.selectConversation}
          onSubmit={projectAssistant.submitMessage}
          open={isAiChatOpen}
          parametricRunError={projectAssistant.parametricRunError}
          pendingKind={projectAssistant.pendingKind}
          retryParametricPrompt={projectAssistant.retryParametricPrompt}
          sourceCount={projectModels.length}
          width={aiChatPanelWidth}
        />
      }
      canvas={
        <ProjectCanvas
          activeCADTool={activeCADTool}
          animateViewCubeOrientation={animateViewCubeOrientation}
          canvasRightOffset={canvasRightOffset}
          canvasStatusBody={canvasStatusBody}
          canvasStatusLabel={canvasStatusLabel}
          canvasStatusLeftOffset={canvasStatusLeftOffset}
          deferResize={isAiChatTransitioning}
          draftModelTranslations={projectDraftCommands.draftModelTranslationsByID}
          isSelectedModelBoxFeatureUpdating={isSelectedModelBoxFeatureUpdating}
          modelTranslations={modelTranslationsByID}
          onApplyBoxFeatureDraft={projectDraftCommands.addBoxFeatureDraft}
          onClearSelection={() => {
            clearSelection()
            cadDocumentCommands.clearDeleteError()
          }}
          onCloseCADTool={() => setActiveCADTool('inspect')}
          onFlipOrientation={flipCanvasOrientation}
          onModelTranslationChange={projectDraftCommands.updateTransformDraftFromTranslation}
          onResetIsometric={() => applyCanvasOrientation(initialViewOrientation)}
          onSelectModel={(modelID, nodeID) => {
            selectModel(modelID, nodeID)
            cadDocumentCommands.clearDeleteError()
          }}
          onSetOrientation={applyCanvasOrientation}
          onSnapshotCapture={projectThumbnailSnapshot.onSnapshotCapture}
          onStepOrientation={stepCanvasOrientation}
          onToggleFuseBoxTool={() => setActiveCADTool((currentTool) => (currentTool === 'fuse-box' ? 'inspect' : 'fuse-box'))}
          onUpdateBoxFeatureDraft={projectDraftCommands.updateBoxFeatureDraft}
          previewAssets={previewAssets}
          projectCADDocument={projectCADDocument}
          projectId={project.id}
          selectedDocumentNode={selectedDocumentNode}
          selectedModelBoxFeatureDraft={selectedModelBoxFeatureDraft}
          selectedModelBoxFeatureError={selectedModelBoxFeatureError}
          selectedModelDisplayName={selectedModelDisplayName}
          selectedModelId={effectiveSelectedModelID}
          selectedModelSupportsFuseBox={selectedModelSupportsFuseBox}
          selectedNodeId={effectiveSelectedDocumentNodeID}
          selectedSourceModel={selectedSourceModel}
          shouldShowCanvasStatus={shouldShowCanvasStatus}
          unitLabel={documentUnitLabel}
          viewOrientation={viewOrientation}
          visibleModelIds={visibleModelIds}
        />
      }
      isAiChatPanelResizing={isAiChatPanelResizing}
      leftPanel={
        <ProjectWorkbenchSidebar
          documentDetails={documentDetails}
          hiddenModelIds={hiddenModelIDs}
          inspectorSelection={inspectorSelection}
          isLeftPanelCollapsed={isLeftPanelCollapsed}
          isModelTreeLoading={projectModelsQuery.isLoading}
          isUploading={projectModelUpload.isUploading}
          leftPanelWidth={leftPanelWidth}
          modelCount={projectModels.length}
          onCollapseChange={setIsLeftPanelCollapsed}
          onModelSelect={(modelId, nodeId) => {
            selectModel(modelId, nodeId)
            cadDocumentCommands.clearDeleteError()
          }}
          onParameterValuesChange={parametricModels.updatePreviewParameters}
          onResizePointerDown={startLeftPanelResize}
          onSaveGeneratedArtifactAsModel={(artifact, parameterValues) =>
            projectParametricModelCommands.saveGeneratedArtifactAsModel({ artifact, parameterValues })
          }
          onSaveModelParameters={(modelID, parameterValues) =>
            projectParametricModelCommands.saveModelParameters({ modelID, parameterValues })
          }
          onToggleModelVisibility={toggleModelVisibility}
          onTransformChange={projectDraftCommands.updateTransformDraftField}
          previewAssetModelIds={previewAssetModelIDs}
          projectModelTree={projectModelTree}
          selectedGeneratedArtifact={selectedParametricArtifact}
          selectedNodeId={effectiveSelectedDocumentNodeID}
          selectedSavedArtifact={selectedSavedParametricArtifact}
          unitLabel={documentUnitLabel}
          uploadError={projectModelUpload.uploadError}
        />
      }
      topbar={
        <ProjectTopbar
          canRedo={Boolean(projectCADDocument?.history.can_redo)}
          canUndo={Boolean(projectCADDocument?.history.can_undo)}
          documentDetails={documentDetails}
          fileInputRef={fileInputRef}
          hasNextHistoryPage={Boolean(projectCADHistoryQuery.hasNextPage)}
          historyEntries={projectCADHistory}
          historyError={cadDocumentCommands.historyError}
          isAiChatOpen={isAiChatOpen}
          isHistoryFetchingNextPage={projectCADHistoryQuery.isFetchingNextPage}
          isHistoryLoading={projectCADHistoryQuery.isPending}
          isHistoryLoadError={projectCADHistoryQuery.isError}
          isHistoryMutationPending={cadDocumentCommands.isPending}
          isHistoryOpen={isHistoryOpen}
          isProjectInfoOpen={isProjectInfoOpen}
          isStepExportOpen={isStepExportOpen}
          isUploading={projectModelUpload.isUploading}
          onFetchNextHistoryPage={() => projectCADHistoryQuery.fetchNextPage()}
          onHistoryAction={cadDocumentCommands.changeHistory}
          onHistoryOpenChange={setIsHistoryOpen}
          onModelFileChange={projectModelUpload.handleModelFileChange}
          onProjectInfoOpenChange={setIsProjectInfoOpen}
          onStepExport={projectStepExport.exportSelection}
          onStepExportOpenChange={setIsStepExportOpen}
          onStepExportSelectAll={projectStepExport.selectAllTargets}
          onStepExportToggleTarget={projectStepExport.toggleTarget}
          onToggleAiChat={toggleAiChat}
          previewSummary={previewSummary}
          project={project}
          projectDescription={projectDescription}
          selectedStepExportTargetIds={projectStepExport.selectedTargetIDs}
          stepExportDisabled={stepExportTargets.length === 0 || !projectCADDocument}
          stepExportTargets={stepExportTargets}
        />
      }
      workspaceGridStyle={workspaceGridStyle}
    />
  )
}

export default ProjectView
