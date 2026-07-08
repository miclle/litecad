import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
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
  Download,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Upload,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  addProjectCADModelBoxUnion,
  fetchProjectAgentMessages,
  fetchProject,
  fetchProjectCADDocument,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModelSource,
  fetchProjectModels,
  sendProjectAgentMessage,
  updateProjectCADModelTransform,
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
import { cadTransformWithTranslation, translationFromCADTransform, type CADTranslation } from './cad-document-transforms'
import { ModelPreview } from './model-preview'
import { exportMergedStepTargets, exportStepTarget } from './project-step-export-action'
import {
  buildProjectPreviewAssets,
  cadKernelGeometryOperationSignature,
  cadKernelGeometryOperationsForModel,
  getModelDisplayName,
  parsedPreviewModels,
  projectPreviewSummary,
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
const transformAutosaveDelayMS = 500
type AiChatMessage = {
  id: string
  role: 'assistant' | 'user'
  body: string
}

type TransformDraft = Record<keyof CADTranslation, string>

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
          type="number"
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
  const [transformDraftsByModelID, setTransformDraftsByModelID] = useState<Record<string, TransformDraft>>({})
  const [transformErrorByModelID, setTransformErrorByModelID] = useState<Record<string, string>>({})
  const [boxFeatureDraftsByModelID, setBoxFeatureDraftsByModelID] = useState<Record<string, BoxFeatureDraft>>({})
  const [boxFeatureErrorByModelID, setBoxFeatureErrorByModelID] = useState<Record<string, string>>({})
  const [stepExportErrorByModelID, setStepExportErrorByModelID] = useState<Record<string, string>>({})
  const [stepExportStatusByModelID, setStepExportStatusByModelID] = useState<Record<string, string>>({})
  const [stepExportBatchError, setStepExportBatchError] = useState('')
  const [selectedStepExportTargetIDs, setSelectedStepExportTargetIDs] = useState<Set<string>>(() => new Set())
  const aiChatTransitionTimerRef = useRef<number | undefined>(undefined)
  const hasTouchedStepExportSelectionRef = useRef(false)
  const latestTransformDraftsRef = useRef<Record<string, TransformDraft>>({})
  const latestTransformSaveRequestByModelIDRef = useRef<Record<string, number>>({})
  const transformAutosaveTimersRef = useRef<Record<string, number>>({})
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
  const updateCADModelTransformMutation = useMutation({
    mutationFn: async ({
      modelId,
      translation,
    }: {
      modelId: string
      requestVersion: number
      translation: CADTranslation
    }) => {
      const currentNode = projectCADDocument?.nodes.find((node) => node.model_id === modelId)
      const transform = cadTransformWithTranslation(currentNode?.transform, translation)
      return (await updateProjectCADModelTransform(projectId, modelId, transform)).data.document
    },
    onSuccess: async (document, variables) => {
      if ((latestTransformSaveRequestByModelIDRef.current[variables.modelId] ?? 0) > variables.requestVersion) {
        return
      }
      const latestDraft = latestTransformDraftsRef.current[variables.modelId]
      if (latestDraft) {
        const latestTranslation = parseTransformDraft(latestDraft)
        if (latestTranslation && !translationsEqual(latestTranslation, variables.translation)) {
          return
        }
      }
      setTransformErrorByModelID((currentErrors) => ({ ...currentErrors, [variables.modelId]: '' }))
      queryClient.setQueryData(['projects', projectId, 'cad-document'], document)
    },
    onError: (_error, variables) => {
      if ((latestTransformSaveRequestByModelIDRef.current[variables.modelId] ?? 0) > variables.requestVersion) {
        return
      }
      setTransformErrorByModelID((currentErrors) => ({ ...currentErrors, [variables.modelId]: 'Invalid transform' }))
    },
  })
  const addCADModelBoxUnionMutation = useMutation({
    mutationFn: async ({ modelId, box }: { modelId: string; box: ReturnType<typeof parseBoxFeatureDraft> }) => {
      if (!box) {
        throw new Error('Invalid box feature')
      }
      return (await addProjectCADModelBoxUnion(projectId, modelId, box)).data.document
    },
    onSuccess: async (document, variables) => {
      setBoxFeatureErrorByModelID((currentErrors) => ({ ...currentErrors, [variables.modelId]: '' }))
      queryClient.setQueryData(['projects', projectId, 'cad-document'], document)
    },
    onError: (_error, variables) => {
      setBoxFeatureErrorByModelID((currentErrors) => ({ ...currentErrors, [variables.modelId]: 'Invalid box feature' }))
    },
  })
  const exportStepSelectionMutation = useMutation({
    mutationFn: async ({
      mode,
      targets,
      downloadFilename,
    }: {
      mode: StepExportMode
      targets: ReturnType<typeof buildStepExportTargets>
      downloadFilename: string
    }) => {
      if (targets.length === 0) {
        throw new Error('No STEP models selected')
      }
      const fetchSourceText = async (modelId: string) => {
        const source = (await fetchProjectModelSource(projectId, modelId)).data
        return source.text()
      }
      if (mode === 'merged') {
        return exportMergedStepTargets({
          targets,
          downloadFilename,
          fetchSourceText,
          runStepAssemblyExport: runStepAssemblyExportInWorker,
          publishDownload: publishStepExportDownload,
        })
      }

      const results = []
      for (const target of targets) {
        results.push(
          await exportStepTarget({
            target,
            fetchSourceText,
            runStepRoundTrip: runStepRoundTripInWorker,
            publishDownload: publishStepExportDownload,
          }),
        )
      }
      return results
    },
    onSuccess: (_result, variables) => {
      setStepExportBatchError('')
      setIsStepExportOpen(false)
      setStepExportErrorByModelID((currentErrors) => {
        const nextErrors = { ...currentErrors }
        variables.targets.forEach((target) => {
          nextErrors[target.modelId] = ''
        })
        return nextErrors
      })
      setStepExportStatusByModelID((currentStatuses) => {
        const nextStatuses = { ...currentStatuses }
        variables.targets.forEach((target) => {
          nextStatuses[target.modelId] =
            variables.mode === 'merged' ? `Included in ${variables.downloadFilename}` : `Downloaded ${target.downloadFilename}`
        })
        return nextStatuses
      })
    },
    onError: () => {
      setStepExportBatchError('STEP export failed')
      setIsStepExportOpen(true)
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
  const cadNodeByModelID = useMemo(
    () => new Map((projectCADDocument?.nodes ?? []).map((node) => [node.model_id, node])),
    [projectCADDocument],
  )
  const modelTranslationsByID = useMemo(() => {
    const translations: Record<string, CADTranslation> = {}
    for (const node of projectCADDocument?.nodes ?? []) {
      translations[node.model_id] = translationFromCADTransform(node.transform)
    }
    return translations
  }, [projectCADDocument])
  const draftModelTranslationsByID = useMemo(() => {
    const translations: Record<string, CADTranslation> = {}
    for (const [modelID, draft] of Object.entries(transformDraftsByModelID)) {
      const translation = parseTransformDraft(draft)
      if (translation) {
        translations[modelID] = translation
      }
    }
    return translations
  }, [transformDraftsByModelID])
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
    }
  }, [selectedModel, selectedModelID])

  useEffect(() => {
    if (!projectCADDocument) {
      return
    }
    setTransformDraftsByModelID((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      for (const node of projectCADDocument.nodes ?? []) {
        const savedDraft = transformDraftFromTranslation(translationFromCADTransform(node.transform))
        const latestDraft = latestTransformDraftsRef.current[node.model_id]
        if (latestDraft && !transformDraftsEqual(latestDraft, savedDraft)) {
          nextDrafts[node.model_id] = latestDraft
          continue
        }
        clearTransformAutosaveTimer(node.model_id)
        delete latestTransformDraftsRef.current[node.model_id]
        nextDrafts[node.model_id] = savedDraft
      }
      return nextDrafts
    })
    // clearTransformAutosaveTimer reads a ref and is intentionally kept out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCADDocument])

  useEffect(
    () => () => {
      Object.values(transformAutosaveTimersRef.current).forEach((timerID) => window.clearTimeout(timerID))
      transformAutosaveTimersRef.current = {}
      latestTransformDraftsRef.current = {}
      latestTransformSaveRequestByModelIDRef.current = {}
    },
    [projectId],
  )

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
  const selectedModelDisplayName = selectedModel ? getModelDisplayName(selectedModel) : ''
  const selectedModelNode = selectedModel ? cadNodeByModelID.get(selectedModel.id) : undefined
  const selectedModelTransformDraft = selectedModel
    ? transformDraftsByModelID[selectedModel.id] ?? transformDraftFromTranslation(translationFromCADTransform(selectedModelNode?.transform))
    : undefined
  const selectedModelTransformError = selectedModel ? transformErrorByModelID[selectedModel.id] : ''
  const selectedModelBoxFeatureDraft = selectedModel ? boxFeatureDraftsByModelID[selectedModel.id] ?? latestBoxFeatureDraftForModel(selectedModel.id) : undefined
  const selectedModelBoxFeatureError = selectedModel ? boxFeatureErrorByModelID[selectedModel.id] : ''
  const isSelectedModelBoxFeatureUpdating =
    Boolean(selectedModel) && addCADModelBoxUnionMutation.isPending && addCADModelBoxUnionMutation.variables?.modelId === selectedModel?.id
  const selectedModelStepExportError = selectedModel ? stepExportErrorByModelID[selectedModel.id] : ''
  const selectedModelStepExportStatus = selectedModel ? stepExportStatusByModelID[selectedModel.id] : ''
  const selectedModelDetails = selectedModel
    ? [
        { label: 'Format', value: selectedModel.format.toUpperCase() },
        { label: 'Status', value: selectedModel.parse_status },
        { label: 'Unit', value: selectedModel.metadata.length_unit || documentUnitLabel },
        { label: 'Entities', value: selectedModel.metadata.entity_count },
        { label: 'Triangles', value: selectedModel.metadata.triangle_count },
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
  const isStepExportPending = exportStepSelectionMutation.isPending
  const selectedStepExportCount = selectedStepExportTargetList.length
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
  const clearTransformAutosaveTimer = (modelID: string) => {
    const timerID = transformAutosaveTimersRef.current[modelID]
    if (timerID === undefined) {
      return
    }
    window.clearTimeout(timerID)
    delete transformAutosaveTimersRef.current[modelID]
  }
  const scheduleTransformAutosave = (modelID: string, draft: TransformDraft) => {
    clearTransformAutosaveTimer(modelID)
    transformAutosaveTimersRef.current[modelID] = window.setTimeout(() => {
      delete transformAutosaveTimersRef.current[modelID]
      const translation = parseTransformDraft(draft)
      if (!translation) {
        setTransformErrorByModelID((currentErrors) => ({ ...currentErrors, [modelID]: 'Invalid transform' }))
        return
      }
      const savedTranslation = modelTranslationsByID[modelID] ?? translationFromCADTransform(cadNodeByModelID.get(modelID)?.transform)
      if (translationsEqual(translation, savedTranslation)) {
        delete latestTransformDraftsRef.current[modelID]
        setTransformErrorByModelID((currentErrors) => ({ ...currentErrors, [modelID]: '' }))
        return
      }
      const requestVersion = (latestTransformSaveRequestByModelIDRef.current[modelID] ?? 0) + 1
      latestTransformSaveRequestByModelIDRef.current[modelID] = requestVersion
      updateCADModelTransformMutation.mutate({ modelId: modelID, requestVersion, translation })
    }, transformAutosaveDelayMS)
  }
  const updateTransformDraftFromTranslation = (modelID: string, translation: CADTranslation) => {
    const nextDraft = transformDraftFromTranslation(translation)
    latestTransformDraftsRef.current[modelID] = nextDraft
    setTransformDraftsByModelID((currentDrafts) => ({ ...currentDrafts, [modelID]: nextDraft }))
    setTransformErrorByModelID((currentErrors) => ({ ...currentErrors, [modelID]: '' }))
    scheduleTransformAutosave(modelID, nextDraft)
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
      setBoxFeatureErrorByModelID((currentErrors) => ({ ...currentErrors, [modelID]: 'Invalid box feature' }))
      return
    }
    addCADModelBoxUnionMutation.mutate({ modelId: modelID, box })
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
  const exportSelectedStepModels = (mode: StepExportMode) => {
    if (selectedStepExportTargetList.length === 0) {
      setStepExportBatchError('Select at least one STEP model')
      return
    }
    setStepExportBatchError('')
    exportStepSelectionMutation.mutate({
      mode,
      targets: selectedStepExportTargetList,
      downloadFilename: stepAssemblyDownloadFilename,
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
          <Popover onOpenChange={setIsStepExportOpen} open={isStepExportOpen}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        aria-label="Export STEP"
                        className="border-transparent text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                        disabled={stepExportTargets.length === 0 || !projectCADDocument}
                        size="icon-lg"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <Download className="size-4" />
                  </PopoverTrigger>
                }
              />
              <TooltipContent sideOffset={8}>Export STEP</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="end"
              aria-label="Export STEP options"
              className="relative w-[min(420px,calc(100vw-24px))] gap-0 rounded-md border-[#e2e8f0] bg-white/96 p-2 text-left shadow-[0_16px_42px_rgba(15,23,42,0.12)] backdrop-blur"
              sideOffset={10}
            >
              <PopoverArrow className="border-[#e2e8f0] bg-white/96" />
              <PopoverHeader className="px-2 py-2">
                <PopoverTitle className="font-mono text-[11px] uppercase text-[#64748b]">Export STEP</PopoverTitle>
                <PopoverDescription className="text-xs leading-5 text-[#64748b]">
                  Select current document models, then choose a download action.
                </PopoverDescription>
              </PopoverHeader>
              <div className="mt-1 border-t border-[#e2e8f0] px-2 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase text-[#64748b]">
                    {selectedStepExportCount}/{stepExportTargets.length} selected
                  </span>
                  <button
                    className="text-xs font-semibold text-[#475569] transition hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]"
                    disabled={isStepExportPending || stepExportTargets.length === 0}
                    onClick={selectAllStepExportTargets}
                    type="button"
                  >
                    Select all
                  </button>
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto pr-1">
                  {stepExportTargets.map((target) => {
                    const isSelected = selectedStepExportTargetIDs.has(target.modelId)

                    return (
                      <label
                        className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm text-[#1f2937] transition hover:bg-[#f1f5f9]"
                        key={target.modelId}
                        title={target.downloadFilename}
                      >
                        <input
                          checked={isSelected}
                          className="size-4 accent-[#0f172a]"
                          disabled={isStepExportPending}
                          onChange={() => toggleStepExportTarget(target.modelId)}
                          type="checkbox"
                        />
                        <FileText className="size-4 shrink-0 text-[#64748b]" />
                        <span className="min-w-0 flex-1 truncate">{target.displayName}</span>
                      </label>
                    )
                  })}
                </div>
                {stepExportBatchError && <p className="mt-2 text-xs leading-5 text-[#8a2f24]">{stepExportBatchError}</p>}
                <div className="my-1 h-px bg-[#e2e8f0]" />
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    className="flex h-[30px] min-w-0 items-center justify-center gap-1.5 rounded bg-[#0f172a] px-2.5 text-xs font-semibold text-white transition hover:bg-[#1f2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isStepExportPending || selectedStepExportCount === 0}
                    onClick={() => exportSelectedStepModels('merged')}
                    type="button"
                  >
                    <Download className="size-3.5 shrink-0" />
                    <span className="truncate">{exportStepSelectionMutation.isPending ? 'Exporting' : 'Merged STEP'}</span>
                  </button>
                  <button
                    className="flex h-[30px] min-w-0 items-center justify-center gap-1.5 rounded border border-[#cbd5e1] bg-white px-2.5 text-xs font-semibold text-[#0f172a] transition hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isStepExportPending || selectedStepExportCount === 0}
                    onClick={() => exportSelectedStepModels('separate')}
                    type="button"
                  >
                    <Download className="size-3.5 shrink-0 text-[#475569]" />
                    <span className="truncate">{exportStepSelectionMutation.isPending ? 'Exporting' : 'Separate files'}</span>
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
              onClearSelection={() => setSelectedModelID('')}
              onModelTranslationChange={updateTransformDraftFromTranslation}
              onSelectModel={setSelectedModelID}
              previewAssets={previewAssets}
              selectedModelId={selectedModelID}
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
                    {projectModels.map((model) => {
                      const modelDisplayName = getModelDisplayName(model)
                      const isModelHidden = hiddenModelIDs.has(model.id)
                      const isSelectedModel = selectedModelID === model.id
                      const hasPreviewAsset = previewAssetModelIDs.has(model.id)
                      const VisibilityIcon = isModelHidden ? EyeOff : Eye

                      return (
                        <div
                          className={`group/model-row min-w-0 rounded-md px-2 py-1.5 text-sm transition ${
                            isSelectedModel
                              ? 'bg-[#eff6ff] text-[#0f172a] ring-1 ring-[#bfdbfe]'
                              : isModelHidden
                              ? 'text-[#94a3b8] hover:bg-[#f1f5f9]'
                              : 'text-[#1f2937] hover:bg-[#f1f5f9]'
                          }`}
                          key={model.id}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              aria-selected={isSelectedModel}
                              className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]"
                              onClick={() => setSelectedModelID(model.id)}
                              role="option"
                              title={modelDisplayName}
                              type="button"
                            >
                              <Box
                                className={`size-4 shrink-0 ${
                                  isSelectedModel ? 'text-[#1d4ed8]' : isModelHidden ? 'text-[#94a3b8]' : 'text-[#475569]'
                                }`}
                              />
                              <p className="min-w-0 flex-1 truncate">{modelDisplayName}</p>
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
                    {selectedModel && (
                      <button
                        className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]"
                        onClick={() => setSelectedModelID('')}
                        type="button"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {selectedModel && selectedModelTransformDraft ? (
                    <div className="mt-3 grid gap-3 rounded-md border border-[#e2e8f0] bg-white/80 p-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Box className="size-4 shrink-0 text-[#1d4ed8]" />
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0f172a]" title={selectedModelDisplayName}>
                            {selectedModelDisplayName}
                          </p>
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

                      <FieldSet className="gap-3">
                        <FieldGroup className="gap-2">
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <FieldTitle className="text-xs text-[#334155]">Move position</FieldTitle>
                            <span className="font-mono text-[10px] uppercase text-[#94a3b8]">{documentUnitLabel}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5" role="list">
                            {(['x', 'y', 'z'] as const).map((axis) => (
                              <div
                                aria-label={`${axis.toUpperCase()} translation for ${selectedModelDisplayName}`}
                                className="min-w-0 rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1.5"
                                key={axis}
                                role="listitem"
                              >
                                <div className="font-mono text-[10px] font-semibold uppercase leading-3 text-[#64748b]">{axis}</div>
                                <div className="mt-1 truncate font-mono text-xs text-[#0f172a]" title={selectedModelTransformDraft[axis]}>
                                  {selectedModelTransformDraft[axis]}
                                </div>
                              </div>
                            ))}
                          </div>
                          {selectedModelTransformError && (
                            <FieldError className="text-[11px] leading-4">{selectedModelTransformError}</FieldError>
                          )}
                        </FieldGroup>

                        {selectedModel.format === 'step' && selectedModelBoxFeatureDraft && (
                          <FieldGroup className="gap-2 border-t border-[#e2e8f0] pt-3">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <FieldTitle className="text-xs text-[#334155]">Add box feature</FieldTitle>
                              <p className="text-[11px] leading-4 text-[#64748b]">
                                Fuse a rectangular box into this STEP model for preview and export.
                              </p>
                            </div>
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
                                  onChange={(value) => updateBoxFeatureDraft(selectedModel.id, field, value)}
                                  unitLabel={documentUnitLabel}
                                  value={selectedModelBoxFeatureDraft[field]}
                                />
                              ))}
                            </div>
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
                                  onChange={(value) => updateBoxFeatureDraft(selectedModel.id, field, value)}
                                  unitLabel={documentUnitLabel}
                                  value={selectedModelBoxFeatureDraft[field]}
                                />
                              ))}
                            </div>
                            {selectedModelBoxFeatureError && (
                              <FieldError className="text-[11px] leading-4">{selectedModelBoxFeatureError}</FieldError>
                            )}
                            <Button
                              className="w-full justify-center"
                              disabled={isSelectedModelBoxFeatureUpdating || !projectCADDocument}
                              onClick={() => addBoxFeatureDraft(selectedModel.id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Box data-icon="inline-start" />
                              Add box feature
                            </Button>
                          </FieldGroup>
                        )}
                      </FieldSet>

                      {selectedModelStepExportError && (
                        <p className="text-[11px] leading-4 text-[#8a2f24]">{selectedModelStepExportError}</p>
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
