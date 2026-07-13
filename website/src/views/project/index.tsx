import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  FileText,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProject,
  fetchProjectCADHistory,
  saveProjectParametricArtifactModel,
  updateProjectParametricArtifact,
  updateProjectParametricModelParameters,
} from 'src/api/projects'
import type { OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import {
  dispatchModelPreviewSetViewEvent,
  normalizeViewOrientation,
  orientationFromEvent,
  viewOrientationChangeEventName,
} from './view-events'
import { cadHistoryActionForKey } from './cad-document-history'
import { isCADDocumentNodeDeletable } from './project-cad-node-actions'
import { ProjectCanvas } from './project-canvas'
import { shouldDeleteSelectedCADNodeFromKey } from './project-delete-keyboard'
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
import { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'
import {
  initialViewOrientation,
  orientationDistance,
  rotateOrientation,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'
import type { ProjectParametricArtifact } from 'src/types/project'

function ProjectView() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
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
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const [hiddenModelIDs, setHiddenModelIDs] = useState<Set<string>>(() => new Set())
  const cadDocumentCommandAdapterRef = useRef<ProjectWorkbenchDraftCommandAdapter | null>(null)
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => (await fetchProject(projectId)).data.project,
    enabled: projectId !== '',
  })
  const projectModelUpload = useProjectModelUploadController({
    projectId,
  })
  const saveProjectParametricArtifactMutation = useMutation({
    mutationFn: async ({
      artifact,
      parameterValues,
    }: {
      artifact: ProjectParametricArtifact
      parameterValues: Record<string, OpenSCADParameterValue>
    }) => {
      await updateProjectParametricArtifact(projectId, artifact.id, {
        title: artifact.title,
        source_kind: artifact.source_kind,
        source_code: artifact.source_code,
        parameter_values: parameterValues,
        compile_status: 'success',
        compile_error: '',
      })
      return (await saveProjectParametricArtifactModel(projectId, artifact.id)).data.model
    },
    onSuccess: async (model) => {
      projectSelection.selectModel(model.id)
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'parametric-artifacts'] })
    },
    onError: () => {
      projectAssistant.setParametricRunError('Generated source could not be added to the canvas. Try generating it again.')
    },
  })
  const updateProjectParametricModelParametersMutation = useMutation({
    mutationFn: async ({
      modelID,
      parameterValues,
    }: {
      modelID: string
      parameterValues: Record<string, OpenSCADParameterValue>
    }) =>
      (
        await updateProjectParametricModelParameters(projectId, modelID, {
          parameter_values: parameterValues,
        })
      ).data.model,
    onSuccess: async (model) => {
      projectSelection.selectModel(model.id)
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document', 'history'] })
    },
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
    clearDeleteError,
    deleteNode,
    isPending: isCADDocumentCommandPending,
  } = cadDocumentCommands
  const keyboardDeleteNode = effectiveSelectedDocumentNodeID ? cadNodeByID.get(effectiveSelectedDocumentNodeID) : undefined
  const canDeleteNodeFromKeyboard = isCADDocumentNodeDeletable(keyboardDeleteNode)
  const selectedSavedParametricArtifact = parametricModels.selectedSavedArtifact
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

  useEffect(() => {
    const handleHistoryKeyDown = (event: KeyboardEvent) => {
      const action = cadHistoryActionForKey(event)
      if (!action || isCADDocumentCommandPending) {
        return
      }
      const canRun = action === 'undo' ? projectCADDocument?.history.can_undo : projectCADDocument?.history.can_redo
      if (!canRun) {
        return
      }
      event.preventDefault()
      changeHistory(action)
    }

    window.addEventListener('keydown', handleHistoryKeyDown)
    return () => window.removeEventListener('keydown', handleHistoryKeyDown)
  }, [changeHistory, isCADDocumentCommandPending, projectCADDocument?.history.can_redo, projectCADDocument?.history.can_undo])

  useEffect(() => {
    if (!keyboardDeleteNode || !canDeleteNodeFromKeyboard || isCADDocumentCommandPending) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldDeleteSelectedCADNodeFromKey(event)) {
        return
      }
      event.preventDefault()
      clearDeleteError()
      deleteNode(keyboardDeleteNode.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canDeleteNodeFromKeyboard, clearDeleteError, deleteNode, isCADDocumentCommandPending, keyboardDeleteNode])

  useEffect(() => {
    const handleViewOrientationChange = (event: Event) => {
      const nextOrientation = orientationFromEvent(event)
      if (!nextOrientation) {
        return
      }
      setAnimateViewCubeOrientation(false)
      setViewOrientation((currentOrientation) =>
        orientationDistance(currentOrientation, nextOrientation) < 0.2 ? currentOrientation : nextOrientation,
      )
    }

    window.addEventListener(viewOrientationChangeEventName, handleViewOrientationChange)
    return () => window.removeEventListener(viewOrientationChangeEventName, handleViewOrientationChange)
  }, [])

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
  const applyCanvasOrientation = (orientation: ViewOrientation) => {
    const nextOrientation = normalizeViewOrientation(orientation) ?? initialViewOrientation
    setAnimateViewCubeOrientation(true)
    setViewOrientation(nextOrientation)
    dispatchModelPreviewSetViewEvent(nextOrientation)
  }
  const stepCanvasOrientation = (step: ViewRotationStep) => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, step), rotationStep: step })
  }
  const flipCanvasOrientation = () => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, { horizontal: 180 }), rotationStep: { horizontal: 180 } })
  }
  const toggleModelVisibility = (modelID: string) => {
    setHiddenModelIDs((currentIDs) => {
      const nextIDs = new Set(currentIDs)
      if (nextIDs.has(modelID)) {
        nextIDs.delete(modelID)
      } else {
        nextIDs.add(modelID)
      }
      return nextIDs
    })
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
            saveProjectParametricArtifactMutation.mutate({ artifact, parameterValues })
          }
          onSaveModelParameters={(modelID, parameterValues) =>
            updateProjectParametricModelParametersMutation.mutate({
              modelID,
              parameterValues,
            })
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
