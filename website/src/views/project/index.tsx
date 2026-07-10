import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowLeft,
  Box,
  BotMessageSquare,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  History,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Redo2,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProjectAgentMessages,
  fetchProject,
  fetchProjectCADDocument,
  fetchProjectCADHistory,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModelSource,
  fetchProjectModels,
  sendProjectAgentMessage,
  uploadProjectThumbnailSnapshot,
  uploadProjectModel,
} from 'src/api/projects'
import {
  runStepAssemblyExportInWorker,
  runStepPreviewInWorker,
  runStepRoundTripInWorker,
  type CadKernelWorkerPreviewResult,
} from 'src/cad/kernel-worker-client'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  dispatchModelPreviewSetViewEvent,
  normalizeViewOrientation,
  orientationFromEvent,
  viewOrientationChangeEventName,
} from './view-events'
import { AgentMarkdown } from './agent-markdown'
import { shouldSubmitAgentInputFromKey } from './agent-input'
import {
  boxFeatureDraftFromCADBoxFeature,
  defaultBoxFeatureDraft,
  parseBoxFeatureDraft,
  type BoxFeatureDraft,
} from './cad-document-box-features'
import { cadHistoryActionForKey, cadHistoryStatusLabel } from './cad-document-history'
import { translationFromCADTransform, type CADTranslation } from './cad-document-transforms'
import { ModelPreview, type ModelPreviewSnapshotCapture } from './model-preview'
import { shouldDeleteSelectedCADNodeFromKey } from './project-delete-keyboard'
import { ProjectStepExportPopover } from './project-step-export-popover'
import { exportMergedStepTargets, exportStepTarget } from './project-step-export-action'
import {
  buildProjectPreviewAssets,
  buildProjectModelTree,
  cadKernelGeometryOperationSignature,
  cadKernelGeometryOperationsForModel,
  getModelDisplayName,
  parsedPreviewModels,
  projectPreviewSummary,
  projectPreviewAssetSignature,
} from './project-preview-assets'
import {
  buildStepExportTargets,
  defaultSelectedStepExportTargetIDs,
  publishStepExportDownload,
  selectedStepExportTargets,
  stepAssemblyExportFilename,
  type StepExportMode,
} from './project-step-export'
import { ViewController } from './view-controller'
import { useCADDocumentCommands } from './use-cad-document-commands'
import {
  initialViewOrientation,
  orientationDistance,
  rotateOrientation,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'

const defaultLeftPanelWidth = 270
const leftPanelMinWidth = 220
const leftPanelMaxWidth = 440
const defaultAiChatPanelWidth = 420
const aiChatPanelMinWidth = 340
const aiChatPanelMaxWidthRatio = 0.5
const aiChatPanelTransitionMs = 220
type AiChatMessage = {
  id: string
  role: 'assistant' | 'user'
  body: string
}

type TransformDraft = Record<keyof CADTranslation, string>
type CADTool = 'inspect' | 'fuse-box'

function TopbarTooltip({
  label,
  render,
  children,
}: {
  label: string
  render: ReactElement
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={render}>{children}</TooltipTrigger>
      <TooltipContent sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  )
}

const initialAiChatMessages: AiChatMessage[] = [
  {
    id: 'assistant-initial',
    role: 'assistant',
    body: 'I can stay beside the model while you inspect sources, metadata, and design notes.',
  },
]

function clampPanelWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(width, minWidth), maxWidth)
}

function getAiChatPanelMaxWidth() {
  if (typeof window === 'undefined') {
    return Math.max(defaultAiChatPanelWidth, aiChatPanelMinWidth)
  }
  return Math.max(Math.floor(window.innerWidth * aiChatPanelMaxWidthRatio), aiChatPanelMinWidth)
}

function projectAgentErrorMessage(error: unknown) {
  const status = (error as { response?: { status?: number } }).response?.status
  const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
  if (status === 503) {
    return 'Assistant is not configured yet. Add the server-side AI provider settings, then try again.'
  }
  if (message) {
    return message
  }
  return 'Assistant could not answer right now. Check the AI provider configuration and try again.'
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

function transformDraftsEqual(left: TransformDraft | undefined, right: TransformDraft | undefined) {
  return !!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z
}

function formatCADReadout(value: string) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return value
  }
  const roundedValue = Math.abs(numberValue) < 0.0005 ? 0 : numberValue
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(roundedValue)
}

function CompactPositionField({
  ariaLabel,
  label,
  onChange,
  value,
}: {
  ariaLabel: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <Field className="min-w-0 gap-1" orientation="vertical">
      <FieldLabel className="font-mono text-[10px] font-semibold uppercase leading-3 text-[#64748b]">{label}</FieldLabel>
      <Input
        aria-label={ariaLabel}
        className="h-7 rounded border-[#dbe3ec] bg-white px-1 text-right font-mono text-[10px] text-[#0f172a] focus-visible:border-[#64748b] focus-visible:ring-[#cbd5e1]"
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        step="0.1"
        title={value}
        type="number"
        value={formatCADReadout(value)}
      />
    </Field>
  )
}

function NumericCADField({
  ariaLabel,
  label,
  onChange,
  unitLabel,
  value,
}: {
  ariaLabel: string
  label: string
  onChange: (value: string) => void
  unitLabel: string
  value: string
}) {
  return (
    <Field className="gap-1" orientation="vertical">
      <FieldLabel className="text-[10px] font-medium uppercase tracking-normal text-[#64748b]">{label}</FieldLabel>
      <div className="relative">
        <Input
          aria-label={ariaLabel}
          className="h-8 rounded-md border-[#dbe3ec] bg-white pr-8 text-right font-mono text-[11px] text-[#334155] focus-visible:border-[#64748b] focus-visible:ring-[#cbd5e1]"
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          type="text"
          value={value}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8]">{unitLabel}</span>
      </div>
    </Field>
  )
}

function ProjectView() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false)
  const [isAiChatOpen, setIsAiChatOpen] = useState(false)
  const [isAiChatColumnVisible, setIsAiChatColumnVisible] = useState(false)
  const [isAiChatTransitioning, setIsAiChatTransitioning] = useState(false)
  const [isAiChatPanelResizing, setIsAiChatPanelResizing] = useState(false)
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false)
  const [isStepExportOpen, setIsStepExportOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [aiChatDraft, setAiChatDraft] = useState('')
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>(initialAiChatMessages)
  const [leftPanelWidth, setLeftPanelWidth] = useState(defaultLeftPanelWidth)
  const [aiChatPanelWidth, setAiChatPanelWidth] = useState(defaultAiChatPanelWidth)
  const [aiChatPanelMaxWidth, setAiChatPanelMaxWidth] = useState(getAiChatPanelMaxWidth)
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const [uploadError, setUploadError] = useState('')
  const [previewUrlsByModelID, setPreviewUrlsByModelID] = useState<Record<string, string>>({})
  const [hiddenModelIDs, setHiddenModelIDs] = useState<Set<string>>(() => new Set())
  const [selectedModelID, setSelectedModelID] = useState('')
  const [selectedDocumentNodeID, setSelectedDocumentNodeID] = useState('')
  const [activeCADTool, setActiveCADTool] = useState<CADTool>('inspect')
  const [transformDraftsByModelID, setTransformDraftsByModelID] = useState<Record<string, TransformDraft>>({})
  const [boxFeatureDraftsByModelID, setBoxFeatureDraftsByModelID] = useState<Record<string, BoxFeatureDraft>>({})
  const [stepExportErrorByModelID, setStepExportErrorByModelID] = useState<Record<string, string>>({})
  const [stepExportStatusByModelID, setStepExportStatusByModelID] = useState<Record<string, string>>({})
  const [selectedStepExportTargetIDs, setSelectedStepExportTargetIDs] = useState<Set<string>>(() => new Set())
  const aiChatTransitionTimerRef = useRef<number | undefined>(undefined)
  const hasTouchedStepExportSelectionRef = useRef(false)
  const lastRequestedThumbnailSignatureRef = useRef('')
  const handleCADDocumentConflict = useCallback(() => setIsHistoryOpen(true), [])
  const handleCADDocumentNodeDeleted = useCallback((nodeId: string) => {
    setTransformDraftsByModelID((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[nodeId]
      return nextDrafts
    })
    setSelectedModelID('')
    setSelectedDocumentNodeID('')
  }, [])
  const cadDocumentCommands = useCADDocumentCommands({
    projectId,
    onConflict: handleCADDocumentConflict,
    onNodeDeleted: handleCADDocumentNodeDeleted,
  })
  const {
    cancelTransformAutosave,
    changeHistory,
    clearDeleteError,
    deleteNode,
    hasPendingTransform,
    isPending: isCADDocumentCommandPending,
  } = cadDocumentCommands
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
  const projectAgentMessagesQuery = useQuery({
    queryKey: ['projects', projectId, 'agent', 'messages'],
    queryFn: async () => (await fetchProjectAgentMessages(projectId)).data.messages,
    enabled: projectId !== '' && projectQuery.isSuccess,
  })
  const uploadModelMutation = useMutation({
    mutationFn: (file: File) => uploadProjectModel(projectId, file),
    onSuccess: async () => {
      setUploadError('')
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document'] })
    },
    onError: () => {
      setUploadError('Model upload failed. Check that the file is STEP, GLTF, GLB, or STL and try again.')
    },
  })
  const projectAgentMutation = useMutation({
    mutationFn: async (messageBody: string) => {
      const response = await sendProjectAgentMessage(projectId, {
        messages: [{ role: 'user', body: messageBody }],
      })
      return response.data.message
    },
    onSuccess: async (message) => {
      setAiChatMessages((currentMessages) => [
        ...currentMessages,
        {
          id: message.id || `assistant-${Date.now()}`,
          role: 'assistant',
          body: message.body,
        },
      ])
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'agent', 'messages'] })
    },
    onError: (error) => {
      setAiChatMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          body: projectAgentErrorMessage(error),
        },
      ])
    },
  })
  const thumbnailSnapshotMutation = useMutation({
    mutationFn: async ({
      snapshot,
      revision,
    }: {
      snapshot: ModelPreviewSnapshotCapture
      revision: number
    }) =>
      (
        await uploadProjectThumbnailSnapshot(projectId, snapshot.blob, {
          width: snapshot.width,
          height: snapshot.height,
          revision,
        })
      ).data.snapshot,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const project = projectQuery.data
  const projectModels = useMemo(() => projectModelsQuery.data ?? [], [projectModelsQuery.data])
  const selectedModel = useMemo(
    () => projectModels.find((model) => model.id === selectedModelID),
    [projectModels, selectedModelID],
  )
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
  const selectedStepExportTargetList = useMemo(
    () => selectedStepExportTargets(stepExportTargets, selectedStepExportTargetIDs),
    [selectedStepExportTargetIDs, stepExportTargets],
  )
  const stepAssemblyDownloadFilename = stepAssemblyExportFilename(project?.name ?? 'assembly', projectCADDocument?.revision ?? 0)
  const cadNodeByID = useMemo(() => new Map((projectCADDocument?.nodes ?? []).map((node) => [node.id, node])), [projectCADDocument])
  const keyboardDeleteNode = selectedDocumentNodeID ? cadNodeByID.get(selectedDocumentNodeID) : undefined
  const canDeleteNodeFromKeyboard = keyboardDeleteNode?.source_format === 'step-component'
  const sourceNodeIDByModelID = useMemo(
    () => new Map((projectCADDocument?.nodes ?? []).flatMap((node) => (node.model_id ? [[node.model_id, node.id] as const] : []))),
    [projectCADDocument],
  )
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
  const previewModels = useMemo(() => parsedPreviewModels(projectModels), [projectModels])
  const browserKernelPreviewModels = useMemo(() => previewModels.filter((model) => model.format === 'step'), [previewModels])
  const backendPreviewModels = useMemo(() => previewModels.filter((model) => model.format !== 'step'), [previewModels])
  const latestModel = projectModels[0]
  const latestProductName = latestModel?.metadata.product_names?.[0]
  const browserKernelPreviewQueries = useQueries({
    queries: browserKernelPreviewModels.map((model) => {
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
  const kernelMeshesByModelID = browserKernelPreviewQueries.reduce<Record<string, CadKernelWorkerPreviewResult>>(
    (meshByModelID, query, index) => {
      const modelID = browserKernelPreviewModels[index]?.id
      if (modelID && query.data) {
        meshByModelID[modelID] = query.data
      }
      return meshByModelID
    },
    {},
  )
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
  const thumbnailPreviewSignature = useMemo(() => projectPreviewAssetSignature(previewAssets), [previewAssets])
  const previewAssetModelIDs = useMemo(() => new Set(previewAssets.map((asset) => asset.modelId)), [previewAssets])
  const visibleModelIds = useMemo(
    () => previewAssets.flatMap((asset) => (hiddenModelIDs.has(asset.modelId) ? [] : [asset.modelId])),
    [hiddenModelIDs, previewAssets],
  )
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
  const handlePreviewSnapshotCapture = useCallback(
    (snapshot: ModelPreviewSnapshotCapture) => {
      const revision = projectCADDocument?.revision ?? 0
      const visibleSignature = visibleModelIds.join('|')
      if (!projectId || previewAssets.length === 0 || visibleModelIds.length === 0 || revision <= 0) {
        return
      }
      const signature = `${projectId}:${revision}:${thumbnailPreviewSignature}:${visibleSignature}`
      if (lastRequestedThumbnailSignatureRef.current === signature) {
        return
      }
      lastRequestedThumbnailSignatureRef.current = signature
      thumbnailSnapshotMutation.mutate({ snapshot, revision })
    },
    [previewAssets.length, projectCADDocument?.revision, projectId, thumbnailPreviewSignature, thumbnailSnapshotMutation, visibleModelIds],
  )
  const previewBlobSignature = projectModelPreviewQueries
    .map((query, index) => {
      const modelID = backendPreviewModels[index]?.id ?? ''
      const blob = query.data
      return `${modelID}:${blob ? `${blob.type}:${blob.size}` : 'pending'}`
    })
    .join('|')

  useEffect(() => {
    if (!projectAgentMessagesQuery.data) {
      return
    }
    setAiChatMessages(
      projectAgentMessagesQuery.data.length > 0
        ? projectAgentMessagesQuery.data.map((message) => ({
            id: message.id,
            role: message.role,
            body: message.body,
          }))
        : initialAiChatMessages,
    )
  }, [projectAgentMessagesQuery.data])

  useEffect(() => {
    if (selectedModelID && !selectedModel) {
      setSelectedModelID('')
      setSelectedDocumentNodeID('')
      clearDeleteError()
    }
  }, [clearDeleteError, selectedModel, selectedModelID])

  useEffect(() => {
    if (!projectCADDocument) {
      return
    }
    if (selectedDocumentNodeID && !cadNodeByID.has(selectedDocumentNodeID)) {
      setSelectedDocumentNodeID('')
      clearDeleteError()
      return
    }
    if (selectedModelID && !selectedDocumentNodeID) {
      const sourceNodeID = sourceNodeIDByModelID.get(selectedModelID)
      if (sourceNodeID) {
        setSelectedDocumentNodeID(sourceNodeID)
      }
    }
  }, [cadNodeByID, clearDeleteError, projectCADDocument, selectedDocumentNodeID, selectedModelID, sourceNodeIDByModelID])

  useEffect(() => {
    if (activeCADTool === 'fuse-box' && selectedModel?.format !== 'step') {
      setActiveCADTool('inspect')
    }
  }, [activeCADTool, selectedModel?.format])

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
    if (!projectCADDocument) {
      return
    }
    setTransformDraftsByModelID((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      for (const node of projectCADDocument.nodes ?? []) {
        const savedDraft = transformDraftFromTranslation(translationFromCADTransform(node.transform))
        const currentDraft = currentDrafts[node.id]
        if (currentDraft && hasPendingTransform(node.id) && !transformDraftsEqual(currentDraft, savedDraft)) {
          nextDrafts[node.id] = currentDraft
          continue
        }
        cancelTransformAutosave(node.id)
        nextDrafts[node.id] = savedDraft
      }
      return nextDrafts
    })
  }, [cancelTransformAutosave, hasPendingTransform, projectCADDocument])

  useEffect(() => {
    setSelectedStepExportTargetIDs((currentIDs) => {
      if (!hasTouchedStepExportSelectionRef.current) {
        return defaultSelectedStepExportTargetIDs(stepExportTargets)
      }
      const availableIDs = new Set(stepExportTargets.map((target) => target.modelId))
      return new Set([...currentIDs].filter((modelID) => availableIDs.has(modelID)))
    })
  }, [stepExportTargets])

  useEffect(() => {
    const syncAiChatPanelMaxWidth = () => {
      const nextMaxWidth = getAiChatPanelMaxWidth()

      setAiChatPanelMaxWidth(nextMaxWidth)
      setAiChatPanelWidth((currentWidth) => clampPanelWidth(currentWidth, aiChatPanelMinWidth, nextMaxWidth))
    }

    syncAiChatPanelMaxWidth()
    window.addEventListener('resize', syncAiChatPanelMaxWidth)
    return () => window.removeEventListener('resize', syncAiChatPanelMaxWidth)
  }, [])

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

  const closeAiChat = () => {
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
  }

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
  }, [isAiChatOpen])

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
  const selectedDocumentNode = selectedDocumentNodeID ? cadNodeByID.get(selectedDocumentNodeID) : undefined
  const selectedSourceModelID = selectedDocumentNode?.source_model_id || selectedDocumentNode?.model_id || selectedModelID
  const selectedSourceModel = selectedSourceModelID ? projectModels.find((model) => model.id === selectedSourceModelID) : undefined
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
  const selectedDocumentNodeCanDelete = selectedDocumentNode?.source_format === 'step-component'
  const isSelectedDocumentNodeDeleting = selectedDocumentNode ? cadDocumentCommands.isDeletingNode(selectedDocumentNode.id) : false
  const selectedModelSupportsFuseBox = selectedSourceModel?.format === 'step'
  const selectedModelBoxFeatureDraft = selectedSourceModel
    ? boxFeatureDraftsByModelID[selectedSourceModel.id] ?? latestBoxFeatureDraftForModel(selectedSourceModel.id)
    : undefined
  const selectedModelBoxFeatureError = selectedSourceModel ? cadDocumentCommands.boxErrorsByModelId[selectedSourceModel.id] : ''
  const isSelectedModelBoxFeatureUpdating = selectedSourceModel ? cadDocumentCommands.isBoxUnionPendingFor(selectedSourceModel.id) : false
  const selectedModelStepExportError = selectedSourceModel ? stepExportErrorByModelID[selectedSourceModel.id] : ''
  const selectedModelStepExportStatus = selectedSourceModel ? stepExportStatusByModelID[selectedSourceModel.id] : ''
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
  const deleteSelectedDocumentNode = () => {
    if (!selectedDocumentNode || !selectedDocumentNodeCanDelete || cadDocumentCommands.isDeletingNode(selectedDocumentNode.id)) {
      return
    }
    cadDocumentCommands.clearDeleteError()
    cadDocumentCommands.deleteNode(selectedDocumentNode.id)
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
  const selectAllStepExportTargets = () => {
    hasTouchedStepExportSelectionRef.current = true
    setSelectedStepExportTargetIDs(defaultSelectedStepExportTargetIDs(stepExportTargets))
  }
  const toggleStepExportTarget = (modelID: string) => {
    hasTouchedStepExportSelectionRef.current = true
    setSelectedStepExportTargetIDs((currentIDs) => {
      const nextIDs = new Set(currentIDs)
      if (nextIDs.has(modelID)) {
        nextIDs.delete(modelID)
      } else {
        nextIDs.add(modelID)
      }
      return nextIDs
    })
  }
  const exportSelectedStepModels = async (mode: StepExportMode) => {
    if (selectedStepExportTargetList.length === 0) {
      throw new Error('No STEP models selected')
    }
    const fetchSourceText = async (modelId: string) => {
      const source = (await fetchProjectModelSource(projectId, modelId)).data
      return source.text()
    }
    if (mode === 'merged') {
      await exportMergedStepTargets({
        targets: selectedStepExportTargetList,
        downloadFilename: stepAssemblyDownloadFilename,
        fetchSourceText,
        runStepAssemblyExport: runStepAssemblyExportInWorker,
        publishDownload: publishStepExportDownload,
      })
    } else {
      for (const target of selectedStepExportTargetList) {
        await exportStepTarget({
          target,
          fetchSourceText,
          runStepRoundTrip: runStepRoundTripInWorker,
          publishDownload: publishStepExportDownload,
        })
      }
    }
    setStepExportErrorByModelID((currentErrors) => {
      const nextErrors = { ...currentErrors }
      selectedStepExportTargetList.forEach((target) => {
        nextErrors[target.modelId] = ''
      })
      return nextErrors
    })
    setStepExportStatusByModelID((currentStatuses) => {
      const nextStatuses = { ...currentStatuses }
      selectedStepExportTargetList.forEach((target) => {
        nextStatuses[target.modelId] =
          mode === 'merged' ? `Included in ${stepAssemblyDownloadFilename}` : `Downloaded ${target.downloadFilename}`
      })
      return nextStatuses
    })
  }
  const handleModelFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    uploadModelMutation.mutate(file)
    event.target.value = ''
  }
  const handleAiChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const messageBody = aiChatDraft.trim()
    if (!messageBody || projectAgentMutation.isPending) {
      return
    }
    const nextMessages = [
      ...aiChatMessages,
      { id: `user-${Date.now()}`, role: 'user' as const, body: messageBody },
    ]
    setAiChatMessages(nextMessages)
    projectAgentMutation.mutate(messageBody)
    setAiChatDraft('')
  }
  const handleAiChatInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldSubmitAgentInputFromKey({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
    })) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <div
      className={`grid min-h-screen overflow-x-auto overflow-y-hidden bg-[#f8fafc] text-[#0f172a] motion-reduce:transition-none ${
        isAiChatPanelResizing ? '' : 'transition-[grid-template-columns] duration-[220ms] ease-out'
      }`}
      style={workspaceGridStyle}
    >
      <div className="grid min-h-screen min-w-0 grid-rows-[56px_minmax(0,1fr)] bg-[#f8fafc]">
        <header className="relative z-50 flex items-center justify-between border-b border-[#e2e8f0] bg-[#f8fafc]/92 px-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <TopbarTooltip
            label="All projects"
            render={
              <Link
                aria-label="All projects"
                className="grid size-9 shrink-0 place-items-center rounded-md text-[#64748b] no-underline transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                to="/projects"
              />
            }
          >
            <ArrowLeft className="size-4" />
          </TopbarTooltip>
          <div className="relative flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold leading-tight text-[#0f172a]">{project.name}</h1>
            <Popover onOpenChange={setIsProjectInfoOpen} open={isProjectInfoOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PopoverTrigger
                      render={
                        <Button
                          aria-label="Project info"
                          className="shrink-0"
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        />
                      }
                    >
                      <Info />
                    </PopoverTrigger>
                  }
                />
                <TooltipContent sideOffset={8}>Project info</TooltipContent>
              </Tooltip>
              <PopoverContent
                align="center"
                aria-label="Project info"
                className="relative w-[min(360px,calc(100vw-24px))] gap-0 rounded-md border-[#e2e8f0] bg-white/96 p-4 text-left shadow-[0_16px_42px_rgba(15,23,42,0.12)] backdrop-blur"
                sideOffset={10}
              >
                <PopoverArrow className="border-[#e2e8f0] bg-white/96" />
                <PopoverHeader className="flex-row items-center justify-between gap-3">
                  <PopoverTitle className="font-mono text-[11px] uppercase text-[#64748b]">Project</PopoverTitle>
                  <PopoverDescription className="truncate text-sm font-semibold text-[#0f172a]">
                    {project.name}
                  </PopoverDescription>
                </PopoverHeader>

                <section className="mt-4">
                  <p className="font-mono text-[11px] uppercase text-[#64748b]">Description</p>
                  <p className="mt-2 text-sm leading-6 text-[#1f2937]">{projectDescription}</p>
                </section>

                <section className="mt-4 rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
                    <CheckCircle2 className="size-4 text-[#475569]" />
                    {previewSummary.sourceLabel}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#64748b]">{previewSummary.sourceBody}</p>
                </section>

                <section className="mt-4">
                  <p className="font-mono text-[11px] uppercase text-[#64748b]">Document</p>
                  <dl className="mt-3 grid gap-2 text-sm">
                    {documentDetails.map((detail) => (
                      <div className="flex items-center justify-between gap-4 border-b border-[#e2e8f0] pb-2" key={detail.label}>
                        <dt className="text-[#64748b]">{detail.label}</dt>
                        <dd className="truncate text-[#1f2937]">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="hidden items-center justify-end gap-1.5 lg:flex">
          <div className="flex items-center rounded-md border border-[#e2e8f0] bg-white/70 p-0.5">
            <TopbarTooltip
              label="Undo"
              render={
                <Button
                  aria-label="Undo"
                  disabled={cadDocumentCommands.isPending || !projectCADDocument?.history.can_undo}
                  onClick={() => cadDocumentCommands.changeHistory('undo')}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <Undo2 />
            </TopbarTooltip>
            <TopbarTooltip
              label="Redo"
              render={
                <Button
                  aria-label="Redo"
                  disabled={cadDocumentCommands.isPending || !projectCADDocument?.history.can_redo}
                  onClick={() => cadDocumentCommands.changeHistory('redo')}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <Redo2 />
            </TopbarTooltip>
            <Popover onOpenChange={setIsHistoryOpen} open={isHistoryOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PopoverTrigger
                      render={<Button aria-label="Operation history" size="icon-sm" type="button" variant="ghost" />}
                    >
                      <History />
                    </PopoverTrigger>
                  }
                />
                <TooltipContent sideOffset={8}>Operation history</TooltipContent>
              </Tooltip>
              <PopoverContent
                align="end"
                aria-label="Operation history"
                className="relative w-[min(380px,calc(100vw-24px))] gap-0 rounded-md border-[#e2e8f0] bg-white/96 p-2 text-left shadow-[0_16px_42px_rgba(15,23,42,0.12)] backdrop-blur"
                sideOffset={10}
              >
                <PopoverArrow className="border-[#e2e8f0] bg-white/96" />
                <PopoverHeader className="px-2 py-2">
                  <PopoverTitle className="font-mono text-[11px] uppercase text-[#64748b]">Operation history</PopoverTitle>
                  <PopoverDescription className="text-xs leading-5 text-[#64748b]">
                    Saved with this project and available on every signed-in device.
                  </PopoverDescription>
                </PopoverHeader>
                {cadDocumentCommands.historyError ? (
                  <p className="mx-2 border-t border-[#e2e8f0] py-3 text-xs leading-5 text-[#8a2f24]">{cadDocumentCommands.historyError}</p>
                ) : null}
                <div className="max-h-72 overflow-y-auto border-t border-[#e2e8f0] py-1">
                  {projectCADHistoryQuery.isPending ? <p className="px-2 py-4 text-xs text-[#64748b]">Loading history…</p> : null}
                  {projectCADHistoryQuery.isError ? <p className="px-2 py-4 text-xs text-[#8a2f24]">Could not load operation history.</p> : null}
                  {!projectCADHistoryQuery.isPending && !projectCADHistoryQuery.isError && projectCADHistory.length === 0 ? (
                    <p className="px-2 py-4 text-xs leading-5 text-[#64748b]">Edits will appear here after you move, add, or delete model content.</p>
                  ) : null}
                  {projectCADHistory.map((entry) => (
                    <div className="flex items-start gap-3 rounded px-2 py-2.5 hover:bg-[#f8fafc]" key={entry.id}>
                      <span className="mt-0.5 min-w-8 font-mono text-[10px] text-[#94a3b8]">#{entry.sequence}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[#1f2937]" title={entry.summary}>
                          {entry.summary}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-3 font-mono text-[10px] uppercase text-[#64748b]">
                          <span>{cadHistoryStatusLabel(entry.status)}</span>
                          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                        </div>
                      </div>
                    </div>
                  ))}
                  {projectCADHistoryQuery.hasNextPage ? (
                    <Button
                      className="mx-2 my-2 w-[calc(100%-16px)]"
                      disabled={projectCADHistoryQuery.isFetchingNextPage}
                      onClick={() => projectCADHistoryQuery.fetchNextPage()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {projectCADHistoryQuery.isFetchingNextPage ? 'Loading…' : 'Load older operations'}
                    </Button>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <ProjectStepExportPopover
            disabled={stepExportTargets.length === 0 || !projectCADDocument}
            onExport={exportSelectedStepModels}
            onOpenChange={setIsStepExportOpen}
            onSelectAll={selectAllStepExportTargets}
            onToggleTarget={toggleStepExportTarget}
            open={isStepExportOpen}
            selectedTargetIds={selectedStepExportTargetIDs}
            targets={stepExportTargets}
          />
          <TopbarTooltip
            label="Import model"
            render={
              <button
                aria-label="Import model"
                className="grid size-9 place-items-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={uploadModelMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              />
            }
          >
            <Upload className="size-4" />
          </TopbarTooltip>
          <button
            aria-label="Toggle Assistant"
            aria-pressed={isAiChatOpen}
            className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
              isAiChatOpen
                ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]'
                : 'border-transparent text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
            }`}
            onClick={toggleAiChat}
            title={isAiChatOpen ? 'Close Assistant' : 'Open Assistant'}
            type="button"
          >
            <BotMessageSquare className="size-4" />
            Assistant
          </button>
          <input
            accept=".step,.stp,.gltf,.glb,.stl"
            className="hidden"
            onChange={handleModelFileChange}
            ref={fileInputRef}
            type="file"
          />
        </div>
        </header>

        <main className="min-h-0 overflow-x-auto overflow-y-hidden bg-[#f8fafc]">
        <div className="relative h-full min-h-0 overflow-hidden bg-[#f8fafc]">
          <section className="absolute inset-0 overflow-hidden">
            <ModelPreview
              deferResize={isAiChatTransitioning}
              draftModelTranslations={draftModelTranslationsByID}
              key={project.id}
              modelTranslations={modelTranslationsByID}
              onClearSelection={() => {
                setSelectedModelID('')
                setSelectedDocumentNodeID('')
                cadDocumentCommands.clearDeleteError()
              }}
              onModelTranslationChange={updateTransformDraftFromTranslation}
              onSelectModel={(modelID, nodeID) => {
                setSelectedModelID(modelID)
                setSelectedDocumentNodeID(nodeID ?? sourceNodeIDByModelID.get(modelID) ?? `node_${modelID}`)
                cadDocumentCommands.clearDeleteError()
              }}
              onSnapshotCapture={handlePreviewSnapshotCapture}
              previewAssets={previewAssets}
              selectedModelId={selectedModelID}
              selectedNodeId={selectedDocumentNodeID}
              visibleModelIds={visibleModelIds}
            />
            {shouldShowCanvasStatus && (
              <div
                className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-md border border-[#e2e8f0] bg-[#ffffff]/92 p-4 shadow-xl backdrop-blur lg:left-[var(--canvas-status-left)]"
                style={{ '--canvas-status-left': `${canvasStatusLeftOffset}px` } as CSSProperties}
              >
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#64748b]">
                  <HardDrive className="size-4 text-[#475569]" />
                  {canvasStatusLabel}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#1f2937]">
                  {canvasStatusBody}
                </p>
              </div>
            )}

          <div
            aria-label="CAD tools"
            className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-[#dbe3ec] bg-white/94 p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur"
            role="toolbar"
          >
            <span className="px-1.5 font-mono text-[10px] font-semibold uppercase text-[#64748b]">CAD tools</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-pressed={activeCADTool === 'fuse-box'}
                    className={cn(
                      'min-w-[96px] justify-center',
                      activeCADTool === 'fuse-box' && 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]',
                    )}
                    disabled={!selectedModelSupportsFuseBox}
                    onClick={() => setActiveCADTool((currentTool) => (currentTool === 'fuse-box' ? 'inspect' : 'fuse-box'))}
                    size="sm"
                    type="button"
                    variant="outline"
                  />
                }
              >
                <Box data-icon="inline-start" />
                <span className="truncate">Fuse box</span>
              </TooltipTrigger>
              {!selectedDocumentNode ? (
                <TooltipContent sideOffset={8}>Select a model first</TooltipContent>
              ) : !selectedModelSupportsFuseBox ? (
                <TooltipContent sideOffset={8}>STEP models only</TooltipContent>
              ) : null}
            </Tooltip>
          </div>

          {activeCADTool === 'fuse-box' && selectedModelSupportsFuseBox && selectedModelBoxFeatureDraft && selectedSourceModel && (
            <aside
              aria-label="Fuse box tool"
              className="absolute right-4 top-40 z-20 w-[min(320px,calc(100vw-32px))] rounded-md border border-[#dbe3ec] bg-white/94 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.12)] backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase text-[#64748b]">Tool</p>
                  <h2 className="mt-1 text-sm font-semibold text-[#0f172a]">Fuse box</h2>
                  <p className="mt-1 text-xs leading-5 text-[#64748b]">
                    Add a rectangular union to the selected STEP model for preview and export.
                  </p>
                </div>
                <Button
                  aria-label="Close Fuse box tool"
                  className="shrink-0"
                  onClick={() => setActiveCADTool('inspect')}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <X />
                </Button>
              </div>

              <div className="mt-3 flex min-w-0 items-center gap-2 rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1.5">
                <Box className="size-3.5 shrink-0 text-[#1d4ed8]" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#334155]" title={selectedModelDisplayName}>
                  {selectedModelDisplayName}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">{documentUnitLabel}</span>
              </div>

              <FieldSet className="mt-3 gap-3">
                <FieldGroup className="gap-2">
                  <FieldTitle className="text-xs text-[#334155]">Origin</FieldTitle>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['originX', 'Origin X'],
                        ['originY', 'Origin Y'],
                        ['originZ', 'Origin Z'],
                      ] as const
                    ).map(([field, label]) => (
                      <NumericCADField
                        ariaLabel={`${label} for ${selectedModelDisplayName}`}
                        key={field}
                        label={label.replace('Origin ', '')}
                        onChange={(value) => updateBoxFeatureDraft(selectedSourceModel.id, field, value)}
                        unitLabel={documentUnitLabel}
                        value={selectedModelBoxFeatureDraft[field]}
                      />
                    ))}
                  </div>
                </FieldGroup>

                <FieldGroup className="gap-2">
                  <FieldTitle className="text-xs text-[#334155]">Size</FieldTitle>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['sizeX', 'Size X'],
                        ['sizeY', 'Size Y'],
                        ['sizeZ', 'Size Z'],
                      ] as const
                    ).map(([field, label]) => (
                      <NumericCADField
                        ariaLabel={`${label} for ${selectedModelDisplayName}`}
                        key={field}
                        label={label.replace('Size ', '')}
                        onChange={(value) => updateBoxFeatureDraft(selectedSourceModel.id, field, value)}
                        unitLabel={documentUnitLabel}
                        value={selectedModelBoxFeatureDraft[field]}
                      />
                    ))}
                  </div>
                </FieldGroup>

                {selectedModelBoxFeatureError && <FieldError className="text-[11px] leading-4">{selectedModelBoxFeatureError}</FieldError>}

                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <Button
                    className="justify-center"
                    disabled={isSelectedModelBoxFeatureUpdating || !projectCADDocument}
                    onClick={() => addBoxFeatureDraft(selectedSourceModel.id)}
                    size="sm"
                    type="button"
                  >
                    <Box data-icon="inline-start" />
                    {isSelectedModelBoxFeatureUpdating ? 'Applying' : 'Apply fuse'}
                  </Button>
                  <Button onClick={() => setActiveCADTool('inspect')} size="sm" type="button" variant="outline">
                    Cancel
                  </Button>
                </div>
              </FieldSet>
            </aside>
          )}

          <ViewController
            animateViewCubeOrientation={animateViewCubeOrientation}
            className="xl:right-[var(--view-controller-right)]"
            onFlip={flipCanvasOrientation}
            onResetIsometric={() => applyCanvasOrientation(initialViewOrientation)}
            onSetOrientation={applyCanvasOrientation}
            onStep={stepCanvasOrientation}
            orientation={viewOrientation}
            style={{ '--view-controller-right': `${canvasRightOffset}px` } as CSSProperties}
          />
        </section>

        <aside
          className={`absolute left-4 top-4 z-30 hidden border border-[#e2e8f0] bg-[#ffffff]/92 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur lg:block ${
            isLeftPanelCollapsed
              ? 'w-[196px] rounded-[14px] px-3 py-1.5'
              : 'bottom-4 overflow-y-auto rounded-md p-4'
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
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] uppercase text-[#64748b]">Project</p>
                  <button
                    aria-label="Collapse left panel"
                    className="grid size-8 place-items-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                    onClick={() => setIsLeftPanelCollapsed(true)}
                    title="Collapse left panel"
                    type="button"
                  >
                    <LeftPanelIcon className="size-4" />
                  </button>
                </div>

                <section className="mt-3">
                  <p className="text-sm leading-6 text-[#64748b]">
                    {projectDescription}
                  </p>
                </section>

                <section className="mt-8">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[11px] uppercase text-[#64748b]">Model</p>
                  </div>

                  <div aria-label="Project models" className="mt-3 grid gap-2" role="listbox">
                    {projectModelsQuery.isLoading && (
                      <div className="px-2 py-2 font-mono text-[11px] uppercase text-[#64748b]">
                        Loading model tree
                      </div>
                    )}
                    {!projectModelsQuery.isLoading && projectModels.length === 0 && (
                      <div className="px-2 py-3 text-sm leading-6 text-[#64748b]">
                        Import a CAD model to populate the project tree.
                      </div>
                    )}
                    {projectModelTree.map((group) => {
                      const model = group.model
                      const modelDisplayName = group.displayName
                      const isModelHidden = hiddenModelIDs.has(model.id)
                      const isSelectedSourceNode = selectedDocumentNodeID === group.sourceNodeId
                      const hasPreviewAsset = previewAssetModelIDs.has(model.id)
                      const VisibilityIcon = isModelHidden ? EyeOff : Eye

                      return (
                        <div className="grid gap-1" key={model.id}>
                          <div
                            className={`group/model-row min-w-0 rounded-md px-2 py-1.5 text-sm transition ${
                              isSelectedSourceNode
                                ? 'bg-[#eff6ff] text-[#0f172a] ring-1 ring-[#bfdbfe]'
                                : isModelHidden
                                ? 'text-[#94a3b8] hover:bg-[#f1f5f9]'
                                : 'text-[#1f2937] hover:bg-[#f1f5f9]'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <button
                                aria-selected={isSelectedSourceNode}
                                className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]"
                                onClick={() => {
                                  setSelectedModelID(model.id)
                                  setSelectedDocumentNodeID(group.sourceNodeId)
                                  cadDocumentCommands.clearDeleteError()
                                }}
                                role="option"
                                title={modelDisplayName}
                                type="button"
                              >
                                <FileText
                                  className={`size-4 shrink-0 ${
                                    isSelectedSourceNode ? 'text-[#1d4ed8]' : isModelHidden ? 'text-[#94a3b8]' : 'text-[#475569]'
                                  }`}
                                />
                                <span className="min-w-0 flex-1 truncate">{modelDisplayName}</span>
                                {group.children.length > 0 && (
                                  <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">{group.children.length} models</span>
                                )}
                              </button>
                              {hasPreviewAsset && (
                                <button
                                  aria-label={isModelHidden ? `Show ${modelDisplayName}` : `Hide ${modelDisplayName}`}
                                  aria-pressed={!isModelHidden}
                                  className={`grid size-6 shrink-0 place-items-center rounded text-[#64748b] opacity-0 transition hover:bg-[#e2e8f0] hover:text-[#0f172a] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8] group-hover/model-row:opacity-100 ${
                                    isModelHidden ? 'opacity-100 text-[#94a3b8]' : ''
                                  }`}
                                  onClick={() => toggleModelVisibility(model.id)}
                                  title={isModelHidden ? 'Show model' : 'Hide model'}
                                  type="button"
                                >
                                  <VisibilityIcon className="size-3.5" />
                                </button>
                              )}
                              <div
                                aria-label={model.parse_status === 'parsed' ? 'Model preview is ready' : 'Model is being processed'}
                                className={`size-1.5 shrink-0 rounded-full ${
                                  model.parse_status === 'parsed' ? 'bg-[#475569]' : 'bg-[#c9a66b]'
                                }`}
                              />
                            </div>
                          </div>
                          {group.children.length > 0 && (
                            <div className="grid gap-1 pl-5">
                              {group.children.map((child) => (
                                (() => {
                                  const isSelectedChild = selectedDocumentNodeID === child.id
                                  return (
                                    <button
                                      aria-selected={isSelectedChild}
                                      className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8] ${
                                        isSelectedChild
                                          ? 'bg-[#eff6ff] text-[#0f172a] ring-1 ring-[#bfdbfe]'
                                          : isModelHidden
                                          ? 'text-[#94a3b8] hover:bg-[#f1f5f9]'
                                          : 'text-[#334155] hover:bg-[#f1f5f9]'
                                      }`}
                                      key={child.id}
                                      onClick={() => {
                                        setSelectedModelID(child.sourceModelId || model.id)
                                        setSelectedDocumentNodeID(child.id)
                                        cadDocumentCommands.clearDeleteError()
                                      }}
                                      role="option"
                                      title={child.name}
                                      type="button"
                                    >
                                      <Box
                                        className={`size-3.5 shrink-0 ${
                                          isSelectedChild ? 'text-[#1d4ed8]' : isModelHidden ? 'text-[#94a3b8]' : 'text-[#64748b]'
                                        }`}
                                      />
                                      <span className="min-w-0 flex-1 truncate">{child.name}</span>
                                    </button>
                                  )
                                })()
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {uploadModelMutation.isPending && (
                      <div className="rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-3 font-mono text-[11px] uppercase text-[#475569]">
                        Importing model
                      </div>
                    )}
                    {uploadError && <p className="text-sm leading-6 text-[#8a2f24]">{uploadError}</p>}
                  </div>
                </section>

                <section className="mt-auto pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[11px] uppercase text-[#64748b]">Document</p>
                    {selectedDocumentNode && (
                      <button
                        className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]"
                        onClick={() => {
                          setSelectedModelID('')
                          setSelectedDocumentNodeID('')
                          cadDocumentCommands.clearDeleteError()
                        }}
                        type="button"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {selectedDocumentNode && selectedModelTransformDraft ? (
                    <div className="mt-2 grid gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Box className="size-4 shrink-0 text-[#1d4ed8]" />
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0f172a]" title={selectedModelDisplayName}>
                            {selectedModelDisplayName}
                          </p>
                          {selectedDocumentNodeCanDelete && (
                            <button
                              aria-label={`Delete ${selectedModelDisplayName}`}
                              className="grid size-7 shrink-0 place-items-center rounded-md text-[#9f3a2d] transition hover:bg-[#fee2e2] hover:text-[#7f1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fca5a5] disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isSelectedDocumentNodeDeleting}
                              onClick={deleteSelectedDocumentNode}
                              title="Delete model"
                              type="button"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                        <dl className="mt-2 grid gap-1.5 text-xs">
                          {selectedModelDetails.map((detail) => (
                            <div
                              className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] py-1.5 last:border-b-0"
                              key={detail.label}
                            >
                              <dt className="text-[#64748b]">{detail.label}</dt>
                              <dd className="truncate text-[#1f2937]">{detail.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <div className="border-t border-[#e2e8f0] pt-2.5">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <p className="text-xs font-medium text-[#334155]">Position</p>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">{documentUnitLabel}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 pb-2 pt-1.5">
                          {(['x', 'y', 'z'] as const).map((axis) => (
                            <CompactPositionField
                              ariaLabel={`${axis.toUpperCase()} position for ${selectedModelDisplayName}`}
                              key={axis}
                              label={axis}
                              onChange={(value) => updateTransformDraftField(selectedDocumentNode.id, axis, value)}
                              value={selectedModelTransformDraft[axis]}
                            />
                          ))}
                        </div>
                        {selectedModelTransformError && (
                          <p className="mt-2 text-[11px] leading-4 text-[#8a2f24]">{selectedModelTransformError}</p>
                        )}
                      </div>

                      {selectedModelStepExportError && (
                        <p className="text-[11px] leading-4 text-[#8a2f24]">{selectedModelStepExportError}</p>
                      )}
                      {cadDocumentCommands.deleteError && (
                        <p className="text-[11px] leading-4 text-[#8a2f24]">{cadDocumentCommands.deleteError}</p>
                      )}
                      {selectedModelStepExportStatus && (
                        <p className="text-[11px] leading-4 text-[#3f6212]">{selectedModelStepExportStatus}</p>
                      )}
                    </div>
                  ) : (
                    <dl className="mt-2 grid gap-1.5 text-xs">
                      {documentDetails.map((detail) => (
                        <div
                          className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] py-1.5 last:border-b-0"
                          key={detail.label}
                        >
                          <dt className="text-[#64748b]">{detail.label}</dt>
                          <dd className="truncate text-[#1f2937]">{detail.value}</dd>
                        </div>
                      ))}
                      {projectModels.length > 0 && (
                        <div className="pt-2 text-[11px] leading-4 text-[#64748b]">Select a model to inspect placement and features.</div>
                      )}
                    </dl>
                  )}
                </section>
              </div>
            </>
          )}
        </aside>
        </div>
        </main>
      </div>

      <div className="h-screen min-w-0 overflow-hidden">
        <aside
          aria-hidden={!isAiChatOpen}
          aria-label="Assistant panel"
          className={`relative flex h-full w-full min-h-0 flex-col overflow-hidden border-l bg-[#ffffff]/96 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur will-change-transform transition-[border-color,box-shadow,opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
            isAiChatOpen
              ? 'pointer-events-auto translate-x-0 border-[#d6dbe3] opacity-100'
              : 'pointer-events-none translate-x-full border-transparent opacity-0 shadow-none'
          }`}
          inert={!isAiChatOpen}
        >
            <div
              aria-label="Resize Assistant panel"
              aria-orientation="vertical"
              aria-valuemax={aiChatPanelMaxWidth}
              aria-valuemin={aiChatPanelMinWidth}
              aria-valuenow={aiChatPanelWidth}
              className="group absolute left-0 top-0 z-40 h-full w-2 cursor-col-resize"
              onPointerDown={startAiChatPanelResize}
              role="separator"
              title="Resize Assistant panel"
            >
              <span className="absolute bottom-3 left-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
            </div>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e2e8f0] px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
                  <BotMessageSquare className="size-4 text-[#2563eb]" />
                  Assistant
                </div>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#64748b]">
                  {projectModels.length} project sources attached
                </p>
              </div>
              <button
                aria-label="Close Assistant"
                className="grid size-8 shrink-0 place-items-center rounded-md text-[#64748b] transition hover:bg-[#e2e8f0] hover:text-[#0f172a]"
                onClick={closeAiChat}
                title="Close Assistant"
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
              {aiChatMessages.map((message) => (
                <div
                  className={`max-w-[96%] rounded-md px-3 py-2 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'ml-auto bg-[#0f172a] text-white'
                      : 'mr-auto border border-[#e2e8f0] bg-white/80 text-[#1f2937]'
                  }`}
                  key={message.id}
                >
                  {message.role === 'assistant' ? <AgentMarkdown>{message.body}</AgentMarkdown> : message.body}
                </div>
              ))}
            </div>

            <form
              className="m-4 rounded-xl border border-[#d6dbe3] bg-white/95 p-2 shadow-[0_6px_22px_rgba(15,23,42,0.08)] transition focus-within:border-[#94a3b8] focus-within:shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
              onSubmit={handleAiChatSubmit}
            >
              <label className="sr-only" htmlFor="project-ai-chat-input">
                Message Assistant
              </label>
              <textarea
                className="min-h-20 w-full resize-none rounded-lg bg-transparent px-2 py-2 text-sm leading-6 text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                id="project-ai-chat-input"
                onChange={(event) => setAiChatDraft(event.target.value)}
                onKeyDown={handleAiChatInputKeyDown}
                placeholder="Describe what to inspect or change"
                readOnly={projectAgentMutation.isPending}
                value={aiChatDraft}
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <div className="h-6 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 font-mono text-[10px] uppercase leading-6 text-[#64748b]">
                  {projectAgentMutation.isPending ? 'Thinking' : 'Project context'}
                </div>
                <button
                  aria-label="Send Assistant message"
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#0f172a] text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-[#d7dde5] disabled:shadow-none"
                  disabled={aiChatDraft.trim() === '' || projectAgentMutation.isPending}
                  type="submit"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </form>
        </aside>
      </div>
    </div>
  )
}

export default ProjectView
