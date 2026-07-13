import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
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
  Box,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProject,
  fetchProjectCADDocument,
  fetchProjectCADHistory,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModelSource,
  fetchProjectModels,
  saveProjectParametricArtifactModel,
  updateProjectParametricArtifact,
  updateProjectParametricModelParameters,
} from 'src/api/projects'
import {
  runStepPreviewInWorker,
  type CadKernelWorkerPreviewResult,
} from 'src/cad/kernel-worker-client'
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
import { ParametricArtifactEditor } from './parametric-artifact-editor'
import { isCADDocumentNodeDeletable } from './project-cad-node-actions'
import { ProjectCanvas } from './project-canvas'
import { shouldDeleteSelectedCADNodeFromKey } from './project-delete-keyboard'
import { ProjectAssistantPanel } from './project-assistant-panel'
import { ProjectInspector, type ProjectInspectorSelection, type TransformDraft } from './project-inspector'
import { ProjectModelTree } from './project-model-tree'
import { ProjectTopbar } from './project-topbar'
import { ProjectWorkbenchLayout } from './project-workbench-layout'
import {
  buildProjectPreviewAssets,
  buildProjectModelTree,
  cadKernelGeometryOperationSignature,
  cadKernelGeometryOperationsForModel,
  getModelDisplayName,
  projectPreviewSummary,
} from './project-preview-assets'
import {
  buildStepExportTargets,
  stepAssemblyExportFilename,
} from './project-step-export'
import { useCADDocumentCommands } from './use-cad-document-commands'
import { useProjectAssistantController } from './use-project-assistant-controller'
import { useProjectModelUploadController } from './use-project-model-upload-controller'
import { useProjectParametricModels } from './use-project-parametric-models'
import { useProjectSelectionController } from './use-project-selection-controller'
import { useProjectStepExportController } from './use-project-step-export-controller'
import { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'
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

function transformDraftFromTranslation(translation: CADTranslation): TransformDraft {
  return {
    x: String(translation.x),
    y: String(translation.y),
    z: String(translation.z),
  }
}

function parseTransformDraft(draft: TransformDraft | undefined): CADTranslation | undefined {
  if (!draft) {
    return undefined
  }
  const translation = {
    x: Number(draft.x),
    y: Number(draft.y),
    z: Number(draft.z),
  }
  if (!Number.isFinite(translation.x) || !Number.isFinite(translation.y) || !Number.isFinite(translation.z)) {
    return undefined
  }
  return translation
}

function cadUnitLabel(unit: string | undefined) {
  const normalizedUnit = unit?.trim().toLowerCase()
  if (normalizedUnit === 'millimetre' || normalizedUnit === 'millimeter' || normalizedUnit === 'millimeters' || normalizedUnit === 'millimetres') {
    return 'mm'
  }
  if (normalizedUnit === 'centimetre' || normalizedUnit === 'centimeter' || normalizedUnit === 'centimeters' || normalizedUnit === 'centimetres') {
    return 'cm'
  }
  if (normalizedUnit === 'metre' || normalizedUnit === 'meter' || normalizedUnit === 'meters' || normalizedUnit === 'metres') {
    return 'm'
  }
  if (normalizedUnit === 'inch' || normalizedUnit === 'inches') {
    return 'in'
  }
  return unit || 'unit'
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
  const [previewUrlsByModelID, setPreviewUrlsByModelID] = useState<Record<string, string>>({})
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
  const projectModelsQuery = useQuery({
    queryKey: ['projects', projectId, 'models'],
    queryFn: async () => (await fetchProjectModels(projectId)).data.models,
    enabled: projectId !== '' && projectQuery.isSuccess,
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
  const projectModels = useMemo(() => projectModelsQuery.data ?? [], [projectModelsQuery.data])
  const projectCADDocumentQuery = useQuery({
    queryKey: ['projects', projectId, 'cad-document'],
    queryFn: async () => (await fetchProjectCADDocument(projectId)).data.document,
    enabled: projectId !== '' && projectModelsQuery.isSuccess,
  })
  const projectCADDocument = projectCADDocumentQuery.data
  const projectCADHistoryQuery = useInfiniteQuery({
    queryKey: ['projects', projectId, 'cad-document', 'history'],
    queryFn: async ({ pageParam }) => (await fetchProjectCADHistory(projectId, pageParam)).data,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_before_sequence,
    enabled: projectId !== '' && Boolean(projectCADDocument) && isHistoryOpen,
  })
  const projectCADHistory = projectCADHistoryQuery.data?.pages.flatMap((page) => page.entries) ?? []
  const documentUnitLabel = cadUnitLabel(projectCADDocument?.unit)
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
  const cadDocumentNodes = projectCADDocument?.nodes
  const cadNodeByID = useMemo(() => new Map((cadDocumentNodes ?? []).map((node) => [node.id, node])), [cadDocumentNodes])
  const sourceNodeIDByModelID = useMemo(
    () => new Map((cadDocumentNodes ?? []).flatMap((node) => (node.model_id ? [[node.model_id, node.id] as const] : []))),
    [cadDocumentNodes],
  )
  const projectSelection = useProjectSelectionController({
    cadNodeByID,
    projectModels,
    sourceNodeIDByModelID,
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
  const parametricModels = useProjectParametricModels({
    projectId,
    projectModels,
    selectedArtifact: selectedParametricArtifact,
    selectedSourceModel,
  })
  const selectedSavedParametricArtifact = parametricModels.selectedSavedArtifact
  const projectModelTree = useMemo(() => buildProjectModelTree(projectModels, projectCADDocument), [projectModels, projectCADDocument])
  const modelTranslationsByID = useMemo(() => {
    const translations: Record<string, CADTranslation> = {}
    for (const node of projectCADDocument?.nodes ?? []) {
      const translation = translationFromCADTransform(node.transform)
      translations[node.id] = translation
      if (node.model_id) {
        translations[node.model_id] = translation
      }
    }
    return translations
  }, [projectCADDocument])
  const draftModelTranslationsByID = useMemo(() => {
    const translations: Record<string, CADTranslation> = {}
    for (const [nodeID, draft] of Object.entries(transformDraftsByModelID)) {
      const translation = parseTransformDraft(draft)
      if (translation) {
        translations[nodeID] = translation
        const modelID = cadNodeByID.get(nodeID)?.model_id
        if (modelID) {
          translations[modelID] = translation
        }
      }
    }
    return translations
  }, [cadNodeByID, transformDraftsByModelID])
  const previewModels = parametricModels.previewModels
  const browserKernelStepPreviewModels = useMemo(() => previewModels.filter((model) => model.format === 'step'), [previewModels])
  const browserKernelFeatureDSLPreviewModels = parametricModels.featureDSLPreviewModels
  const backendPreviewModels = useMemo(() => previewModels.filter((model) => model.format !== 'step' && model.format !== 'lcad'), [previewModels])
  const latestModel = projectModels[0]
  const latestProductName = latestModel?.metadata.product_names?.[0]
  const browserKernelPreviewQueries = useQueries({
    queries: browserKernelStepPreviewModels.map((model) => {
      const geometryOperationSignature = cadKernelGeometryOperationSignature(projectCADDocument, model.id)
      return {
        queryKey: ['projects', projectId, 'models', model.id, 'kernel-preview', geometryOperationSignature],
        queryFn: async () => {
          const source = (await fetchProjectModelSource(projectId, model.id)).data
          return runStepPreviewInWorker({
            filename: model.original_filename,
            stepText: await source.text(),
            operations: cadKernelGeometryOperationsForModel(projectCADDocument, model.id),
          })
        },
        enabled: projectId !== '' && projectCADDocumentQuery.isSuccess,
        retry: false,
      }
    }),
  })
  const browserKernelFeatureDSLPreviewQueries = parametricModels.featureDSLPreviewQueries
  const featureDSLKernelMeshesByModelID = parametricModels.featureDSLKernelMeshesByModelID
  const kernelMeshesByModelID = browserKernelPreviewQueries.reduce<Record<string, CadKernelWorkerPreviewResult>>(
    (meshByModelID, query, index) => {
      const modelID = browserKernelStepPreviewModels[index]?.id
      if (modelID && query.data) {
        meshByModelID[modelID] = query.data
      }
      return meshByModelID
    },
    {},
  )
  browserKernelFeatureDSLPreviewQueries.forEach((query, index) => {
    const modelID = browserKernelFeatureDSLPreviewModels[index]?.id
    const previewMesh = query.data ?? (modelID ? featureDSLKernelMeshesByModelID[modelID] : undefined)
    if (modelID && previewMesh) {
      kernelMeshesByModelID[modelID] = previewMesh
    }
  })
  const projectModelPreviewArtifactQueries = useQueries({
    queries: backendPreviewModels.map((model) => ({
      queryKey: ['projects', projectId, 'models', model.id, 'preview-artifact'],
      queryFn: async () => (await fetchProjectModelPreviewArtifact(projectId, model.id)).data.preview,
      enabled: projectId !== '',
      retry: false,
    })),
  })
  const previewArtifacts = projectModelPreviewArtifactQueries.flatMap((query) => (query.data ? [query.data] : []))
  const previewArtifactByModelID = useMemo(
    () => new Map(previewArtifacts.map((artifact) => [artifact.model_id, artifact])),
    [previewArtifacts],
  )
  const latestKernelPreview = latestModel ? kernelMeshesByModelID[latestModel.id] : undefined
  const latestPreviewArtifact = latestModel ? previewArtifactByModelID.get(latestModel.id) : undefined
  const latestPreviewFormat = latestKernelPreview ? 'kernel' : (latestPreviewArtifact?.format ?? '')
  const latestTriangleCount =
    latestKernelPreview?.meshSummary.triangleCount ?? latestPreviewArtifact?.facet_count ?? latestModel?.metadata.triangle_count ?? 0
  const projectModelPreviewQueries = useQueries({
    queries: backendPreviewModels.map((model) => {
      const artifact = previewArtifactByModelID.get(model.id)
      return {
        queryKey: ['projects', projectId, 'models', model.id, 'preview'],
        queryFn: async () => (await fetchProjectModelPreview(projectId, model.id)).data,
        enabled: projectId !== '' && Boolean(artifact),
        retry: false,
      }
    }),
  })
  const previewAssets = useMemo(
    () => buildProjectPreviewAssets(previewModels, previewArtifacts, previewUrlsByModelID, kernelMeshesByModelID, projectCADDocument),
    [kernelMeshesByModelID, previewArtifacts, previewModels, previewUrlsByModelID, projectCADDocument],
  )
  const previewAssetModelIDs = useMemo(() => new Set(previewAssets.map((asset) => asset.modelId)), [previewAssets])
  const visibleModelIds = useMemo(
    () => previewAssets.flatMap((asset) => (hiddenModelIDs.has(asset.modelId) ? [] : [asset.modelId])),
    [hiddenModelIDs, previewAssets],
  )
  const projectThumbnailSnapshot = useProjectThumbnailSnapshotController({
    previewAssets,
    projectId,
    revision: projectCADDocument?.revision ?? 0,
    visibleModelIds,
  })
  const areAllPreviewAssetsHidden = previewAssets.length > 0 && visibleModelIds.length === 0
  const previewSummary = projectPreviewSummary({
    modelCount: projectModels.length,
    previewAssetCount: previewAssets.length,
    latestPreviewFormat: latestPreviewFormat || previewAssets[0]?.previewFormat,
  })
  const shouldShowCanvasStatus = !latestModel || previewAssets.length === 0 || areAllPreviewAssetsHidden
  const canvasStatusLabel = areAllPreviewAssetsHidden ? 'Model layers hidden' : previewSummary.sourceLabel
  const canvasStatusBody = areAllPreviewAssetsHidden
    ? 'All preview layers are hidden. Show a model layer from the project tree to inspect the geometry again.'
    : latestModel
    ? `${latestProductName || latestModel.original_filename} metadata is parsed. Geometry preview is being prepared.`
    : 'The canvas is empty until imported geometry is prepared for preview. Import a CAD source file to attach real model data to this project.'
  const previewBlobSignature = projectModelPreviewQueries
    .map((query, index) => {
      const modelID = backendPreviewModels[index]?.id ?? ''
      const blob = query.data
      return `${modelID}:${blob ? `${blob.type}:${blob.size}` : 'pending'}`
    })
    .join('|')

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
    const nextPreviewUrlsByModelID: Record<string, string> = {}
    const objectUrls: string[] = []

    projectModelPreviewQueries.forEach((query, index) => {
      const blob = query.data
      const modelID = backendPreviewModels[index]?.id
      if (!blob || !modelID) {
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      nextPreviewUrlsByModelID[modelID] = objectUrl
      objectUrls.push(objectUrl)
    })

    // Object URL publication is tied to query blob lifecycle and revoked in this effect cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrlsByModelID(nextPreviewUrlsByModelID)
    return () => {
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewBlobSignature])

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

  const updatedAt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(project.updated_at))
  const LeftPanelIcon = isLeftPanelCollapsed ? PanelLeftOpen : PanelLeftClose
  const projectDescription = project.description || 'No description yet. Import a CAD source file to begin the project record.'
  const selectedModelDisplayName =
    selectedDocumentNode?.source_format === 'step-component'
      ? selectedDocumentNode.name
      : selectedSourceModel
        ? getModelDisplayName(selectedSourceModel)
        : ''
  const selectedModelTransformDraft = selectedDocumentNode
    ? transformDraftsByModelID[selectedDocumentNode.id] ?? transformDraftFromTranslation(translationFromCADTransform(selectedDocumentNode.transform))
    : undefined
  const selectedModelTransformError = selectedDocumentNode ? cadDocumentCommands.transformErrorsByNodeId[selectedDocumentNode.id] : ''
  const selectedModelSupportsFuseBox = selectedSourceModel?.format === 'step'
  const selectedModelBoxFeatureDraft = selectedSourceModel
    ? boxFeatureDraftsByModelID[selectedSourceModel.id] ?? latestBoxFeatureDraftForModel(selectedSourceModel.id)
    : undefined
  const selectedModelBoxFeatureError = selectedSourceModel ? cadDocumentCommands.boxErrorsByModelId[selectedSourceModel.id] : ''
  const isSelectedModelBoxFeatureUpdating = selectedSourceModel ? cadDocumentCommands.isBoxUnionPendingFor(selectedSourceModel.id) : false
  const selectedModelStepExportError = selectedSourceModel ? projectStepExport.errorByModelID[selectedSourceModel.id] : ''
  const selectedModelStepExportStatus = selectedSourceModel ? projectStepExport.statusByModelID[selectedSourceModel.id] : ''
  const selectedModelDetails = selectedSourceModel
    ? [
        { label: 'Format', value: selectedDocumentNode?.source_format === 'step-component' ? 'STEP-COMPONENT' : selectedSourceModel.format.toUpperCase() },
        { label: 'Status', value: selectedSourceModel.parse_status },
        { label: 'Unit', value: selectedSourceModel.metadata.length_unit || documentUnitLabel },
        { label: 'Entities', value: selectedSourceModel.metadata.entity_count },
        { label: 'Triangles', value: selectedSourceModel.metadata.triangle_count },
      ]
    : []
  const documentDetails = [
    { label: 'Updated', value: updatedAt },
    { label: 'Preview', value: previewSummary.previewLabel },
    ...(latestModel
      ? [
          {
            label: 'Schema',
            value: latestModel.metadata.schema || latestModel.metadata.asset_type.toUpperCase() || latestModel.parse_status,
          },
          { label: 'Unit', value: latestModel.metadata.length_unit || 'Unknown' },
          { label: 'Entities', value: latestModel.metadata.entity_count },
          { label: 'Triangles', value: latestTriangleCount },
        ]
      : []),
  ]
  const inspectorSelection: ProjectInspectorSelection | undefined =
    selectedDocumentNode && selectedModelTransformDraft
      ? {
          deleteError: cadDocumentCommands.deleteError,
          details: selectedModelDetails,
          name: selectedModelDisplayName,
          nodeId: selectedDocumentNode.id,
          stepExportError: selectedModelStepExportError,
          stepExportStatus: selectedModelStepExportStatus,
          transformDraft: selectedModelTransformDraft,
          transformError: selectedModelTransformError,
        }
      : undefined
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
        <aside
          className={`absolute left-4 top-4 z-30 hidden border border-[#e2e8f0] bg-[#ffffff]/92 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur lg:block ${
            isLeftPanelCollapsed
              ? 'w-[196px] rounded-[14px] px-3 py-1.5'
              : 'bottom-4 overflow-y-auto rounded-md p-3'
          }`}
          style={isLeftPanelCollapsed ? undefined : { width: leftPanelWidth }}
        >
          {isLeftPanelCollapsed ? (
            <div className="flex min-h-7 items-center gap-2.5">
              <Box className="size-3.5 shrink-0 text-[#0f172a]" />
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-[#0f172a]">Project</p>
                <span className="shrink-0 rounded bg-[#eff6ff] px-1.5 py-0.5 text-[11px] font-medium leading-none text-[#0074d9]">
                  {projectModels.length} models
                </span>
              </div>
              <button
                aria-label="Expand left panel"
                className="grid size-6 shrink-0 place-items-center rounded text-[#0f172a] transition hover:bg-[#f1f5f9]"
                onClick={() => setIsLeftPanelCollapsed(false)}
                title="Expand left panel"
                type="button"
              >
                <LeftPanelIcon className="size-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div
                aria-label="Resize left panel"
                aria-orientation="vertical"
                className="group absolute right-0 top-0 z-40 h-full w-2 cursor-col-resize"
                onPointerDown={startLeftPanelResize}
                role="separator"
                title="Resize left panel"
              >
                <span className="absolute bottom-3 right-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
              </div>

              <div className="flex min-h-full flex-col">
                <ProjectModelTree
                  groups={projectModelTree}
                  headerAction={
                    <button
                      aria-label="Collapse left panel"
                      className="grid size-8 place-items-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                      onClick={() => setIsLeftPanelCollapsed(true)}
                      title="Collapse left panel"
                      type="button"
                    >
                      <LeftPanelIcon className="size-4" />
                    </button>
                  }
                  hiddenModelIds={hiddenModelIDs}
                  isLoading={projectModelsQuery.isLoading}
                  isUploading={projectModelUpload.isUploading}
                  onSelect={(modelId, nodeId) => {
                    selectModel(modelId, nodeId)
                    cadDocumentCommands.clearDeleteError()
                  }}
                  onToggleVisibility={toggleModelVisibility}
                  previewAssetModelIds={previewAssetModelIDs}
                  selectedNodeId={effectiveSelectedDocumentNodeID}
                  uploadError={projectModelUpload.uploadError}
                />

                {selectedParametricArtifact ? (
                  <ParametricArtifactEditor
                    artifact={selectedParametricArtifact}
                    autoSaveOnPreviewSuccess={selectedParametricArtifact.source_kind === 'litecad-feature-dsl'}
                    onSaveAsModel={(parameterValues) =>
                      saveProjectParametricArtifactMutation.mutate({ artifact: selectedParametricArtifact, parameterValues })
                    }
                  />
                ) : selectedSavedParametricArtifact ? (
                  <ParametricArtifactEditor
                    artifact={selectedSavedParametricArtifact}
                    initialParameterValues={selectedSavedParametricArtifact.parameter_values}
                    onParameterValuesChange={(parameterValues) =>
                      parametricModels.updatePreviewParameters(selectedSavedParametricArtifact.preview_model_id, parameterValues)
                    }
                    onSaveParameters={(parameterValues) =>
                      updateProjectParametricModelParametersMutation.mutate({
                        modelID: selectedSavedParametricArtifact.preview_model_id,
                        parameterValues,
                      })
                    }
                  />
                ) : (
                  <ProjectInspector
                    documentDetails={documentDetails}
                    modelCount={projectModels.length}
                    onTransformChange={updateTransformDraftField}
                    selected={inspectorSelection}
                    unitLabel={documentUnitLabel}
                  />
                )}
              </div>
            </>
          )}
        </aside>
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
