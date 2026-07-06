import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  FileText,
  HardDrive,
  Import,
  Info,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProject,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModels,
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
const defaultRightPanelWidth = 304
const leftPanelMinWidth = 220
const leftPanelMaxWidth = 440
const rightPanelMinWidth = 260
const rightPanelMaxWidth = 520

function clampPanelWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(width, minWidth), maxWidth)
}

function ProjectView() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(defaultLeftPanelWidth)
  const [rightPanelWidth, setRightPanelWidth] = useState(defaultRightPanelWidth)
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const [uploadError, setUploadError] = useState('')
  const [previewUrlsByModelID, setPreviewUrlsByModelID] = useState<Record<string, string>>({})
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
  const project = projectQuery.data
  const projectModels = projectModelsQuery.data ?? []
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
  const RightPanelIcon = isRightPanelCollapsed ? PanelRightOpen : PanelRightClose
  const projectDescription = project.description || 'No description yet. Import a CAD source file to begin the project record.'
  const documentDetails = [
    { label: 'Updated', value: updatedAt },
    { label: 'Units', value: 'Millimeters' },
    { label: 'Sources', value: projectModels.length },
    { label: 'Preview', value: previewSummary.previewLabel },
    ...(latestModel
      ? [
          {
            label: 'STEP',
            value: latestModel.metadata.schema || latestModel.metadata.asset_type.toUpperCase() || latestModel.parse_status,
          },
          { label: 'Unit', value: latestModel.metadata.length_unit || 'Unknown' },
          { label: 'Entities', value: latestModel.metadata.entity_count },
          { label: 'Triangles', value: latestTriangleCount },
        ]
      : []),
  ]
  const canvasStatusLeftOffset = isLeftPanelCollapsed ? 16 : leftPanelWidth + 32
  const canvasToolbarLeftOffset = isLeftPanelCollapsed ? 228 : leftPanelWidth + 32
  const canvasRightOffset = isRightPanelCollapsed ? 260 : rightPanelWidth + 20
  const startPanelResize = (side: 'left' | 'right', event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = side === 'left' ? leftPanelWidth : rightPanelWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX

      if (side === 'left') {
        setLeftPanelWidth(clampPanelWidth(startWidth + deltaX, leftPanelMinWidth, leftPanelMaxWidth))
        return
      }

      setRightPanelWidth(clampPanelWidth(startWidth - deltaX, rightPanelMinWidth, rightPanelMaxWidth))
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

  return (
    <div className="grid min-h-screen grid-rows-[56px_minmax(0,1fr)] bg-[#f8fafc] text-[#0f172a]">
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
          <input
            accept=".step,.stp,.gltf,.glb,.stl"
            className="hidden"
            onChange={handleModelFileChange}
            ref={fileInputRef}
            type="file"
          />
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#64748b]">
            <CheckCircle2 className="size-4 text-[#475569]" />
            Project saved
          </div>
        </div>
      </header>

      <main className="relative min-h-0 overflow-hidden bg-[#f8fafc]">
        <section className="absolute inset-0 overflow-hidden">
          <ModelPreview key={project.id} previewAssets={previewAssets} />
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

          <button
            className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-md border border-[#e2e8f0] bg-[#ffffff]/88 px-3 py-2 text-xs text-[#64748b] backdrop-blur transition hover:border-[#475569] hover:text-[#0f172a] lg:left-[var(--canvas-toolbar-left)]"
            onClick={() => applyCanvasOrientation(initialViewOrientation)}
            style={{ '--canvas-toolbar-left': `${canvasToolbarLeftOffset}px` } as CSSProperties}
            title="Reset isometric view"
            type="button"
          >
            <Orbit className="size-4 text-[#475569]" />
            Isometric
          </button>

          <ViewController
            animateViewCubeOrientation={animateViewCubeOrientation}
            className="xl:right-[var(--view-controller-right)]"
            onFlip={flipCanvasOrientation}
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
                onPointerDown={(event) => startPanelResize('left', event)}
                role="separator"
                title="Resize left panel"
              >
                <span className="absolute bottom-3 right-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
              </div>

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
            </>
          )}
        </aside>

        <aside
          className={`absolute right-4 top-4 z-30 hidden border border-[#e2e8f0] bg-[#ffffff]/92 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur xl:block ${
            isRightPanelCollapsed
              ? 'w-[228px] rounded-[14px] px-3 py-1.5'
              : 'bottom-4 overflow-y-auto rounded-md p-4'
          }`}
          style={isRightPanelCollapsed ? undefined : { width: rightPanelWidth }}
        >
          {isRightPanelCollapsed ? (
            <div className="flex min-h-7 items-center gap-2.5">
              <CheckCircle2 className="size-3.5 shrink-0 text-[#0f172a]" />
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-[#0f172a]">Inspector</p>
                <span className="shrink-0 rounded bg-[#eff6ff] px-1.5 py-0.5 text-[11px] font-medium leading-none text-[#0074d9]">
                  {previewSummary.previewLabel}
                </span>
              </div>
              <button
                aria-label="Expand right panel"
                className="grid size-6 shrink-0 place-items-center rounded text-[#0f172a] transition hover:bg-[#f1f5f9]"
                onClick={() => setIsRightPanelCollapsed(false)}
                title="Expand right panel"
                type="button"
              >
                <RightPanelIcon className="size-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div
                aria-label="Resize right panel"
                aria-orientation="vertical"
                className="group absolute left-0 top-0 z-40 h-full w-2 cursor-col-resize"
                onPointerDown={(event) => startPanelResize('right', event)}
                role="separator"
                title="Resize right panel"
              >
                <span className="absolute bottom-3 left-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
              </div>

              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] uppercase text-[#64748b]">Inspector</p>
                <button
                  aria-label="Collapse right panel"
                  className="grid size-8 place-items-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  onClick={() => setIsRightPanelCollapsed(true)}
                  title="Collapse right panel"
                  type="button"
                >
                  <RightPanelIcon className="size-4" />
                </button>
              </div>

              <section className="mt-5 rounded-md border border-[#e2e8f0] bg-white/70 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
                  <CheckCircle2 className="size-4 text-[#475569]" />
                  {previewSummary.sourceLabel}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#64748b]">
                  {previewSummary.sourceBody}
                </p>
              </section>

              <section className="mt-5">
                <p className="font-mono text-[11px] uppercase text-[#64748b]">Document</p>
                <dl className="mt-3 grid gap-3 text-sm">
                  {documentDetails.map((detail) => (
                    <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] pb-2" key={detail.label}>
                      <dt className="text-[#64748b]">{detail.label}</dt>
                      <dd className="truncate text-[#1f2937]">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          )}
        </aside>
      </main>
    </div>
  )
}

export default ProjectView
