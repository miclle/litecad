import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowLeft,
  Box,
  BotMessageSquare,
  CheckCircle2,
  FileText,
  HardDrive,
  Import,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProjectAgentMessages,
  fetchProject,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModels,
  sendProjectAgentMessage,
  uploadProjectModel,
} from 'src/api/projects'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  dispatchModelPreviewSetViewEvent,
  normalizeViewOrientation,
  orientationFromEvent,
  viewOrientationChangeEventName,
} from './view-events'
import { AgentMarkdown } from './agent-markdown'
import { ModelPreview } from './model-preview'
import {
  buildProjectPreviewAssets,
  getModelDisplayName,
  parsedPreviewModels,
  projectPreviewSummary,
} from './project-preview-assets'
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
type AiChatMessage = {
  id: string
  role: 'assistant' | 'user'
  body: string
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
    return 'CAD Agent is not configured yet. Add the server-side AI provider settings, then try again.'
  }
  if (message) {
    return message
  }
  return 'CAD Agent could not answer right now. Check the AI provider configuration and try again.'
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
  const [aiChatDraft, setAiChatDraft] = useState('')
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>(initialAiChatMessages)
  const [leftPanelWidth, setLeftPanelWidth] = useState(defaultLeftPanelWidth)
  const [aiChatPanelWidth, setAiChatPanelWidth] = useState(defaultAiChatPanelWidth)
  const [aiChatPanelMaxWidth, setAiChatPanelMaxWidth] = useState(getAiChatPanelMaxWidth)
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const [uploadError, setUploadError] = useState('')
  const [previewUrlsByModelID, setPreviewUrlsByModelID] = useState<Record<string, string>>({})
  const aiChatTransitionTimerRef = useRef<number | undefined>(undefined)
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
  const project = projectQuery.data
  const projectModels = useMemo(() => projectModelsQuery.data ?? [], [projectModelsQuery.data])
  const previewModels = useMemo(() => parsedPreviewModels(projectModels), [projectModels])
  const latestModel = projectModels[0]
  const latestProductName = latestModel?.metadata.product_names[0]
  const projectModelPreviewArtifactQueries = useQueries({
    queries: previewModels.map((model) => ({
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
  const latestPreviewArtifact = latestModel ? previewArtifactByModelID.get(latestModel.id) : undefined
  const latestPreviewFormat = latestPreviewArtifact?.format ?? ''
  const latestTriangleCount = latestPreviewArtifact?.facet_count ?? latestModel?.metadata.triangle_count ?? 0
  const projectModelPreviewQueries = useQueries({
    queries: previewModels.map((model) => {
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
    () => buildProjectPreviewAssets(previewModels, previewArtifacts, previewUrlsByModelID),
    [previewArtifacts, previewModels, previewUrlsByModelID],
  )
  const previewSummary = projectPreviewSummary({
    modelCount: projectModels.length,
    previewAssetCount: previewAssets.length,
    latestPreviewFormat: latestPreviewFormat || previewAssets[0]?.previewFormat,
  })
  const shouldShowCanvasStatus = !latestModel || previewAssets.length === 0
  const previewBlobSignature = projectModelPreviewQueries
    .map((query, index) => {
      const modelID = previewModels[index]?.id ?? ''
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
      const modelID = previewModels[index]?.id
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
          <Link
            className="grid size-9 shrink-0 place-items-center rounded-md text-[#64748b] no-underline transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
            title="All projects"
            to="/projects"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="relative flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold leading-tight text-[#0f172a]">{project.name}</h1>
            <Popover onOpenChange={setIsProjectInfoOpen} open={isProjectInfoOpen}>
              <PopoverTrigger
                render={
                  <Button
                    aria-label="Project info"
                    className="shrink-0"
                    size="icon-sm"
                    title="Project info"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <Info />
              </PopoverTrigger>
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

        <div className="hidden items-center justify-end gap-3 lg:flex">
          <button
            aria-label="Import model"
            className="grid size-9 place-items-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={uploadModelMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
            title="Import model"
            type="button"
          >
            <Import className="size-4" />
          </button>
          <button
            aria-label="Toggle CAD Agent"
            aria-pressed={isAiChatOpen}
            className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
              isAiChatOpen
                ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]'
                : 'border-transparent text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
            }`}
            onClick={toggleAiChat}
            title={isAiChatOpen ? 'Close CAD Agent' : 'Open CAD Agent'}
            type="button"
          >
            <BotMessageSquare className="size-4" />
            CAD Agent
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
            <ModelPreview deferResize={isAiChatTransitioning} key={project.id} previewAssets={previewAssets} />
            {shouldShowCanvasStatus && (
              <div
                className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-md border border-[#e2e8f0] bg-[#ffffff]/92 p-4 shadow-xl backdrop-blur lg:left-[var(--canvas-status-left)]"
                style={{ '--canvas-status-left': `${canvasStatusLeftOffset}px` } as CSSProperties}
              >
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#64748b]">
                  <HardDrive className="size-4 text-[#475569]" />
                  {previewSummary.sourceLabel}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#1f2937]">
                  {latestModel
                    ? `${latestProductName || latestModel.original_filename} metadata is parsed. Geometry preview is being prepared.`
                    : 'The canvas is empty until imported geometry is prepared for preview. Import a CAD source file to attach real model data to this project.'}
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

                  <div className="mt-3 grid gap-2">
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
                    {projectModels.map((model) => (
                      <div
                        className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[#1f2937] transition hover:bg-[#f1f5f9]"
                        key={model.id}
                      >
                        <Box className="size-4 shrink-0 text-[#475569]" />
                        <p className="min-w-0 flex-1 truncate">{getModelDisplayName(model)}</p>
                        <div
                          aria-label={model.parse_status === 'parsed' ? 'Model preview is ready' : 'Model is being processed'}
                          className={`size-1.5 shrink-0 rounded-full ${
                            model.parse_status === 'parsed' ? 'bg-[#475569]' : 'bg-[#c9a66b]'
                          }`}
                        />
                      </div>
                    ))}
                    {uploadModelMutation.isPending && (
                      <div className="rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-3 font-mono text-[11px] uppercase text-[#475569]">
                        Importing model
                      </div>
                    )}
                    {uploadError && <p className="text-sm leading-6 text-[#8a2f24]">{uploadError}</p>}
                  </div>
                </section>

                <section className="mt-auto pt-5">
                  <p className="font-mono text-[11px] uppercase text-[#64748b]">Document</p>
                  <dl className="mt-2 grid gap-1.5 text-xs">
                    {documentDetails.map((detail) => (
                      <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] py-1.5 last:border-b-0" key={detail.label}>
                        <dt className="text-[#64748b]">{detail.label}</dt>
                        <dd className="truncate text-[#1f2937]">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
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
          aria-label="CAD Agent panel"
          className={`relative flex h-full w-full min-h-0 flex-col overflow-hidden border-l bg-[#ffffff]/96 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur will-change-transform transition-[border-color,box-shadow,opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
            isAiChatOpen
              ? 'pointer-events-auto translate-x-0 border-[#d6dbe3] opacity-100'
              : 'pointer-events-none translate-x-full border-transparent opacity-0 shadow-none'
          }`}
          inert={!isAiChatOpen}
        >
            <div
              aria-label="Resize CAD Agent panel"
              aria-orientation="vertical"
              aria-valuemax={aiChatPanelMaxWidth}
              aria-valuemin={aiChatPanelMinWidth}
              aria-valuenow={aiChatPanelWidth}
              className="group absolute left-0 top-0 z-40 h-full w-2 cursor-col-resize"
              onPointerDown={startAiChatPanelResize}
              role="separator"
              title="Resize CAD Agent panel"
            >
              <span className="absolute bottom-3 left-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
            </div>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e2e8f0] px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
                  <BotMessageSquare className="size-4 text-[#2563eb]" />
                  CAD Agent
                </div>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#64748b]">
                  {projectModels.length} project sources attached
                </p>
              </div>
              <button
                aria-label="Close CAD Agent"
                className="grid size-8 shrink-0 place-items-center rounded-md text-[#64748b] transition hover:bg-[#e2e8f0] hover:text-[#0f172a]"
                onClick={closeAiChat}
                title="Close CAD Agent"
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
                Message CAD Agent
              </label>
              <textarea
                className="min-h-20 w-full resize-none rounded-lg bg-transparent px-2 py-2 text-sm leading-6 text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                id="project-ai-chat-input"
                onChange={(event) => setAiChatDraft(event.target.value)}
                placeholder="Describe what to inspect or change"
                readOnly={projectAgentMutation.isPending}
                value={aiChatDraft}
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <div className="h-6 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 font-mono text-[10px] uppercase leading-6 text-[#64748b]">
                  {projectAgentMutation.isPending ? 'Thinking' : 'Project context'}
                </div>
                <button
                  aria-label="Send CAD Agent message"
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
