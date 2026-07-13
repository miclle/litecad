import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
import {
  boxFeatureDraftFromCADBoxFeature,
  defaultBoxFeatureDraft,
  parseBoxFeatureDraft,
  type BoxFeatureDraft,
} from './cad-document-box-features'
import { cadHistoryActionForKey } from './cad-document-history'
import { translationFromCADTransform, type CADTranslation } from './cad-document-transforms'
import { isCADDocumentNodeDeletable } from './project-cad-node-actions'
import { ProjectCanvas } from './project-canvas'
import { shouldDeleteSelectedCADNodeFromKey } from './project-delete-keyboard'
import { ProjectAssistantPanel } from './project-assistant-panel'
import type { TransformDraft } from './project-inspector'
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
import {
  parseTransformDraft,
  transformDraftFromTranslation,
  useProjectWorkbenchInspectorState,
} from './use-project-workbench-inspector-state'
import { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import {
  aiChatPanelMinWidth,
  defaultAiChatPanelWidth,
  leftPanelMaxWidth,
  leftPanelMinWidth,
  useProjectWorkspacePreferences,
} from './use-project-workspace-preferences'
import {
  initialViewOrientation,
  orientationDistance,
  rotateOrientation,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'
import type { ProjectParametricArtifact } from 'src/types/project'

const aiChatPanelMaxWidthRatio = 0.5
const aiChatPanelTransitionMs = 220

function clampPanelWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(width, minWidth), maxWidth)
}

function getAiChatPanelMaxWidth() {
  if (typeof window === 'undefined') {
    return Math.max(defaultAiChatPanelWidth, aiChatPanelMinWidth)
  }
  return Math.max(Math.floor(window.innerWidth * aiChatPanelMaxWidthRatio), aiChatPanelMinWidth)
}

function translationsEqual(left: CADTranslation | undefined, right: CADTranslation | undefined) {
  return !!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z
}

function ProjectView() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    aiChatPanelWidth,
    isAiChatOpen,
    isLeftPanelCollapsed,
    leftPanelWidth,
    setAiChatPanelWidth,
    setIsAiChatOpen,
    setIsLeftPanelCollapsed,
    setLeftPanelWidth,
  } = useProjectWorkspacePreferences()
  const [isAiChatColumnVisible, setIsAiChatColumnVisible] = useState(isAiChatOpen)
  const [isAiChatTransitioning, setIsAiChatTransitioning] = useState(false)
  const [isAiChatPanelResizing, setIsAiChatPanelResizing] = useState(false)
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false)
  const [isStepExportOpen, setIsStepExportOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [aiChatPanelMaxWidth, setAiChatPanelMaxWidth] = useState(getAiChatPanelMaxWidth)
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const [hiddenModelIDs, setHiddenModelIDs] = useState<Set<string>>(() => new Set())
  const [transformDraftsByModelID, setTransformDraftsByModelID] = useState<Record<string, TransformDraft>>({})
  const [boxFeatureDraftsByModelID, setBoxFeatureDraftsByModelID] = useState<Record<string, BoxFeatureDraft>>({})
  const aiChatTransitionTimerRef = useRef<number | undefined>(undefined)
  const handleCADDocumentConflict = useCallback(() => setIsHistoryOpen(true), [])
  const handleTransformSynchronized = useCallback((nodeId: string) => {
    setTransformDraftsByModelID((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[nodeId]
      return nextDrafts
    })
  }, [])
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
    draftModelTranslationsByID,
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
    transformDraftsByNodeId: transformDraftsByModelID,
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
  const handleCADDocumentNodeDeleted = (nodeId: string) => {
    setTransformDraftsByModelID((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[nodeId]
      return nextDrafts
    })
    clearSelection()
  }
  const cadDocumentCommands = useCADDocumentCommands({
    projectId,
    onConflict: handleCADDocumentConflict,
    onNodeDeleted: handleCADDocumentNodeDeleted,
    onTransformSynchronized: handleTransformSynchronized,
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
    const syncAiChatPanelMaxWidth = () => {
      const nextMaxWidth = getAiChatPanelMaxWidth()

      setAiChatPanelMaxWidth(nextMaxWidth)
      setAiChatPanelWidth((currentWidth) => clampPanelWidth(currentWidth, aiChatPanelMinWidth, nextMaxWidth))
    }

    syncAiChatPanelMaxWidth()
    window.addEventListener('resize', syncAiChatPanelMaxWidth)
    return () => window.removeEventListener('resize', syncAiChatPanelMaxWidth)
  }, [setAiChatPanelWidth])

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

  const openAiChat = () => {
    if (aiChatTransitionTimerRef.current !== undefined) {
      window.clearTimeout(aiChatTransitionTimerRef.current)
    }

    setIsAiChatTransitioning(true)
    setIsAiChatColumnVisible(true)
    setIsAiChatOpen(true)
    aiChatTransitionTimerRef.current = window.setTimeout(() => {
      setIsAiChatTransitioning(false)
      aiChatTransitionTimerRef.current = undefined
    }, aiChatPanelTransitionMs)
  }

  const closeAiChat = useCallback(() => {
    if (aiChatTransitionTimerRef.current !== undefined) {
      window.clearTimeout(aiChatTransitionTimerRef.current)
    }

    setIsAiChatTransitioning(true)
    setIsAiChatOpen(false)
    setIsAiChatColumnVisible(false)
    aiChatTransitionTimerRef.current = window.setTimeout(() => {
      setIsAiChatTransitioning(false)
      aiChatTransitionTimerRef.current = undefined
    }, aiChatPanelTransitionMs)
  }, [setIsAiChatOpen])

  const toggleAiChat = () => {
    if (isAiChatOpen) {
      closeAiChat()
      return
    }

    openAiChat()
  }

  useEffect(() => {
    return () => {
      if (aiChatTransitionTimerRef.current !== undefined) {
        window.clearTimeout(aiChatTransitionTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isAiChatOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAiChat()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeAiChat, isAiChatOpen])

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
    boxFeatureDraftsByModelId: boxFeatureDraftsByModelID,
    deleteError: cadDocumentCommands.deleteError,
    getBoxFeatureDraft: latestBoxFeatureDraftForModel,
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
    transformDraftsByNodeId: transformDraftsByModelID,
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
  const canvasStatusLeftOffset = isLeftPanelCollapsed ? 16 : leftPanelWidth + 32
  const canvasRightOffset = 20
  const cadWorkspaceMinWidth = (isLeftPanelCollapsed ? 196 : leftPanelWidth) + 260
  const workspaceGridStyle = {
    gridTemplateColumns: isAiChatColumnVisible
      ? `minmax(${cadWorkspaceMinWidth}px, 1fr) ${aiChatPanelWidth}px`
      : 'minmax(0, 1fr) 0px',
  } as CSSProperties
  const startLeftPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftPanelWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      setLeftPanelWidth(clampPanelWidth(startWidth + deltaX, leftPanelMinWidth, leftPanelMaxWidth))
    }

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }
  const startAiChatPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = aiChatPanelWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    setIsAiChatPanelResizing(true)
    setIsAiChatTransitioning(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = startX - moveEvent.clientX
      setAiChatPanelWidth(clampPanelWidth(startWidth + deltaX, aiChatPanelMinWidth, aiChatPanelMaxWidth))
    }

    const handlePointerUp = () => {
      setIsAiChatPanelResizing(false)
      setIsAiChatTransitioning(false)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
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
  const updateTransformDraftFromTranslation = (modelID: string, translation: CADTranslation, selectedNodeID?: string) => {
    const nodeID = selectedNodeID ?? sourceNodeIDByModelID.get(modelID) ?? `node_${modelID}`
    const nextDraft = transformDraftFromTranslation(translation)
    setTransformDraftsByModelID((currentDrafts) => ({ ...currentDrafts, [nodeID]: nextDraft }))
    cadDocumentCommands.setTransformValidationError(nodeID, '')
    cadDocumentCommands.scheduleTransformAutosave(nodeID, translation)
  }
  const updateTransformDraftField = (nodeID: string, axis: keyof CADTranslation, value: string) => {
    const currentDraft =
      transformDraftsByModelID[nodeID] ?? transformDraftFromTranslation(translationFromCADTransform(cadNodeByID.get(nodeID)?.transform))
    const nextDraft = { ...currentDraft, [axis]: value }
    setTransformDraftsByModelID((currentDrafts) => ({ ...currentDrafts, [nodeID]: nextDraft }))
    const translation = parseTransformDraft(nextDraft)
    if (!translation) {
      cadDocumentCommands.cancelTransformAutosave(nodeID)
      cadDocumentCommands.setTransformValidationError(nodeID, 'Invalid transform')
      return
    }
    const savedTranslation = translationFromCADTransform(cadNodeByID.get(nodeID)?.transform)
    if (translationsEqual(translation, savedTranslation)) {
      cadDocumentCommands.cancelTransformAutosave(nodeID)
      cadDocumentCommands.setTransformValidationError(nodeID, '')
      return
    }
    cadDocumentCommands.setTransformValidationError(nodeID, '')
    cadDocumentCommands.scheduleTransformAutosave(nodeID, translation)
  }
  function latestBoxFeatureDraftForModel(modelID: string) {
    const latestBoxOperation = [...(projectCADDocument?.operations ?? [])]
      .reverse()
      .find((operation) => operation.model_id === modelID && operation.type === 'box-union' && operation.box)
    return latestBoxOperation?.box ? boxFeatureDraftFromCADBoxFeature(latestBoxOperation.box) : defaultBoxFeatureDraft()
  }
  const updateBoxFeatureDraft = (modelID: string, field: keyof BoxFeatureDraft, value: string) => {
    setBoxFeatureDraftsByModelID((currentDrafts) => {
      const currentDraft = currentDrafts[modelID] ?? latestBoxFeatureDraftForModel(modelID)
      return {
        ...currentDrafts,
        [modelID]: {
          ...currentDraft,
          [field]: value,
        },
      }
    })
  }
  const addBoxFeatureDraft = (modelID: string) => {
    const draft = boxFeatureDraftsByModelID[modelID] ?? latestBoxFeatureDraftForModel(modelID)
    const box = parseBoxFeatureDraft(draft)
    if (!box) {
      cadDocumentCommands.setBoxValidationError(modelID, 'Invalid box feature')
      return
    }
    cadDocumentCommands.addBoxUnion(modelID, box)
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
          draftModelTranslations={draftModelTranslationsByID}
          isSelectedModelBoxFeatureUpdating={isSelectedModelBoxFeatureUpdating}
          modelTranslations={modelTranslationsByID}
          onApplyBoxFeatureDraft={addBoxFeatureDraft}
          onClearSelection={() => {
            clearSelection()
            cadDocumentCommands.clearDeleteError()
          }}
          onCloseCADTool={() => setActiveCADTool('inspect')}
          onFlipOrientation={flipCanvasOrientation}
          onModelTranslationChange={updateTransformDraftFromTranslation}
          onResetIsometric={() => applyCanvasOrientation(initialViewOrientation)}
          onSelectModel={(modelID, nodeID) => {
            selectModel(modelID, nodeID)
            cadDocumentCommands.clearDeleteError()
          }}
          onSetOrientation={applyCanvasOrientation}
          onSnapshotCapture={projectThumbnailSnapshot.onSnapshotCapture}
          onStepOrientation={stepCanvasOrientation}
          onToggleFuseBoxTool={() => setActiveCADTool((currentTool) => (currentTool === 'fuse-box' ? 'inspect' : 'fuse-box'))}
          onUpdateBoxFeatureDraft={updateBoxFeatureDraft}
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
          onTransformChange={updateTransformDraftField}
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
