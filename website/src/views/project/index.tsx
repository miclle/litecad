import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FileText,
  FileUp,
  HardDrive,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Upload,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProject,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModels,
  uploadProjectModel,
} from 'src/api/projects'
import {
  dispatchModelPreviewSetViewEvent,
  normalizeViewOrientation,
  orientationFromEvent,
  viewOrientationChangeEventName,
} from './view-events'
import { ModelPreview } from './model-preview'
import { ViewController } from './view-controller'
import {
  initialViewOrientation,
  orientationDistance,
  rotateOrientation,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'

function ProjectView() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const [uploadError, setUploadError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
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
  const latestModel = projectModels[0]
  const latestProductName = latestModel?.metadata.product_names[0]
  const projectModelPreviewArtifactQuery = useQuery({
    queryKey: ['projects', projectId, 'models', latestModel?.id, 'preview-artifact'],
    queryFn: async () => (await fetchProjectModelPreviewArtifact(projectId, latestModel?.id ?? '')).data.preview,
    enabled: projectId !== '' && latestModel?.parse_status === 'parsed',
    retry: false,
  })
  const latestPreviewArtifact = projectModelPreviewArtifactQuery.data
  const latestPreviewFormat = latestPreviewArtifact?.format ?? ''
  const latestTriangleCount = latestPreviewArtifact?.facet_count ?? latestModel?.metadata.triangle_count ?? 0
  const projectModelPreviewQuery = useQuery({
    queryKey: ['projects', projectId, 'models', latestModel?.id, 'preview'],
    queryFn: async () => (await fetchProjectModelPreview(projectId, latestModel?.id ?? '')).data,
    enabled: projectId !== '' && latestModel?.parse_status === 'parsed' && projectModelPreviewArtifactQuery.isSuccess,
    retry: false,
  })

  useEffect(() => {
    const blob = projectModelPreviewQuery.data
    if (!blob) {
      setPreviewUrl('')
      return undefined
    }
    const nextPreviewUrl = URL.createObjectURL(blob)
    setPreviewUrl(nextPreviewUrl)
    return () => URL.revokeObjectURL(nextPreviewUrl)
  }, [projectModelPreviewQuery.data])

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
      <div className="grid min-h-screen place-items-center bg-[#101210] text-[#e9e2d0]">
        <div className="font-mono text-xs uppercase tracking-wide text-[#9d988a]">Opening project</div>
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#101210] px-5 text-center text-[#e9e2d0]">
        <div>
          <FileText className="mx-auto size-8 text-[#cfc6b2]" />
          <h1 className="mt-4 text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#9d988a]">
            This project could not be loaded. It may have been removed or belongs to another account.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#e9e2d0] px-4 text-sm font-semibold text-[#111310] no-underline"
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
  const projectColumns = `${isLeftPanelCollapsed ? '56px' : '270px'} minmax(0,1fr) ${isRightPanelCollapsed ? '56px' : '304px'}`
  const shellStyle = { '--project-columns': projectColumns } as CSSProperties
  const LeftPanelIcon = isLeftPanelCollapsed ? PanelLeftOpen : PanelLeftClose
  const RightPanelIcon = isRightPanelCollapsed ? PanelRightOpen : PanelRightClose
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
    <div className="grid min-h-screen grid-rows-[56px_minmax(0,1fr)] bg-[#111310] text-[#e9e2d0]">
      <header className="grid border-b border-[#2d302b] bg-[#151814] px-3 lg:grid-cols-[270px_minmax(0,1fr)_304px]">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="grid size-9 shrink-0 place-items-center rounded-md text-[#a8a293] no-underline transition hover:bg-[#242820] hover:text-[#f7f1e4]"
            title="All projects"
            to="/projects"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-[#f7f1e4]">{project.name}</h1>
          </div>
        </div>

        <div className="hidden items-center justify-center gap-2 lg:flex">
          <div className="flex items-center gap-2 rounded-md border border-[#2d302b] bg-[#101210] px-3 py-2 font-mono text-[11px] uppercase text-[#8c887c]">
            <Database className="size-4 text-[#b7c3a8]" />
            {projectModels.length > 0 ? `${projectModels.length} source ${projectModels.length === 1 ? 'file' : 'files'}` : 'No source file'}
          </div>
        </div>

        <div className="hidden items-center justify-end gap-3 lg:flex">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#8c887c]">
            <CheckCircle2 className="size-4 text-[#b7c3a8]" />
            Project saved
          </div>
        </div>
      </header>

      <div className="grid min-h-0 lg:grid-cols-[var(--project-columns)]" style={shellStyle}>
        <aside
          className={`hidden min-h-0 border-r border-[#2d302b] bg-[#171a16] lg:block ${
            isLeftPanelCollapsed ? 'p-2' : 'p-4'
          }`}
        >
          <div className="flex items-center justify-between">
            {!isLeftPanelCollapsed && <p className="font-mono text-[11px] uppercase text-[#8c887c]">Project</p>}
            <button
              aria-label={isLeftPanelCollapsed ? 'Expand left panel' : 'Collapse left panel'}
              className="grid size-8 place-items-center rounded-md text-[#8c887c] transition hover:bg-[#242820] hover:text-[#f7f1e4]"
              onClick={() => setIsLeftPanelCollapsed((collapsed) => !collapsed)}
              title={isLeftPanelCollapsed ? 'Expand left panel' : 'Collapse left panel'}
              type="button"
            >
              <LeftPanelIcon className="size-4" />
            </button>
          </div>

          {!isLeftPanelCollapsed && (
            <>
              <section className="mt-3">
                <p className="text-sm leading-6 text-[#aaa593]">
                  {project.description || 'No description yet. Import a CAD source file to begin the project record.'}
                </p>
              </section>

              <section className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] uppercase text-[#8c887c]">Source files</p>
                  <button
                    className="grid size-8 place-items-center rounded-md text-[#a8a293] transition hover:bg-[#242820] hover:text-[#f7f1e4]"
                    disabled={uploadModelMutation.isPending}
                    onClick={() => fileInputRef.current?.click()}
                    title="Import model"
                    type="button"
                  >
                    <Upload className="size-4" />
                  </button>
                  <input
                    accept=".step,.stp,.gltf,.glb,.stl"
                    className="hidden"
                    onChange={handleModelFileChange}
                    ref={fileInputRef}
                    type="file"
                  />
                </div>

                <div className="mt-3 grid gap-2">
                  {projectModelsQuery.isLoading && (
                    <div className="rounded-md border border-[#2d302b] bg-[#111310] px-3 py-3 font-mono text-[11px] uppercase text-[#8c887c]">
                      Loading sources
                    </div>
                  )}
                  {!projectModelsQuery.isLoading && projectModels.length === 0 && (
                    <div className="rounded-md border border-dashed border-[#34382f] bg-[#111310] px-3 py-4 text-sm leading-6 text-[#aaa593]">
                      No project-owned model source has been imported.
                    </div>
                  )}
                  {projectModels.map((model) => (
                    <div className="rounded-md border border-[#34382f] bg-[#111310] p-3" key={model.id}>
                      <div className="flex min-w-0 items-center gap-2">
                        <FileUp className="size-4 shrink-0 text-[#b7c3a8]" />
                        <p className="truncate text-sm font-medium text-[#f7f1e4]">{model.original_filename}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] uppercase text-[#8c887c]">
                        <span>{model.format}</span>
                        <span>{formatBytes(model.byte_size)}</span>
                      </div>
                      <div className="mt-3 grid gap-1 text-xs leading-5 text-[#aaa593]">
                        <p className="truncate text-[#d8d1bf]">
                          {model.metadata.product_names[0] || model.metadata.asset_type.toUpperCase() || 'No product name parsed'}
                        </p>
                        <p className="font-mono uppercase text-[#8c887c]">
                          {model.parse_status === 'parsed' ? model.metadata.schema || 'STEP' : model.parse_status}
                        </p>
                      </div>
                    </div>
                  ))}
                  {uploadModelMutation.isPending && (
                    <div className="rounded-md border border-[#34382f] bg-[#151814] px-3 py-3 font-mono text-[11px] uppercase text-[#b7c3a8]">
                      Importing model
                    </div>
                  )}
                  {uploadError && <p className="text-sm leading-6 text-[#e0a19a]">{uploadError}</p>}
                </div>
              </section>
            </>
          )}
        </aside>

        <section className="relative min-h-0 overflow-hidden bg-[#1b1d19]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(183,195,168,0.13),transparent_34%)]" />
          <ModelPreview key={project.id} previewFormat={latestPreviewFormat} previewUrl={previewUrl} />
          <div className="pointer-events-none absolute left-4 bottom-4 max-w-sm rounded-md border border-[#34382f] bg-[#151814]/92 p-4 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#8c887c]">
              <HardDrive className="size-4 text-[#b7c3a8]" />
              {latestModel ? `Imported ${latestModel.format.toUpperCase()} source` : 'Empty project canvas'}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#d8d1bf]">
              {latestModel
                ? previewUrl
                  ? `${latestProductName || latestModel.original_filename} preview is loaded as ${latestPreviewFormat.toUpperCase()}.`
                  : `${latestProductName || latestModel.original_filename} metadata is parsed. Geometry preview is being prepared.`
                : 'The canvas is empty until imported geometry is prepared for preview. Import a CAD source file to attach real model data to this project.'}
            </p>
          </div>

          <button
            className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-[#34382f] bg-[#151814]/88 px-3 py-2 text-xs text-[#aaa593] backdrop-blur transition hover:bg-[#242820] hover:text-[#f7f1e4]"
            onClick={() => applyCanvasOrientation(initialViewOrientation)}
            title="Reset isometric view"
            type="button"
          >
            <Orbit className="size-4 text-[#b7c3a8]" />
            Isometric
          </button>

          <ViewController
            animateViewCubeOrientation={animateViewCubeOrientation}
            onFlip={flipCanvasOrientation}
            onSetOrientation={applyCanvasOrientation}
            onStep={stepCanvasOrientation}
            orientation={viewOrientation}
          />

          <div className="absolute right-4 top-[160px] hidden items-center gap-2 rounded-md border border-[#34382f] bg-[#151814]/88 px-3 py-2 font-mono text-[11px] uppercase text-[#8c887c] backdrop-blur sm:flex">
            Grid 10 mm
          </div>
        </section>

        <aside
          className={`hidden min-h-0 border-l border-[#2d302b] bg-[#171a16] xl:block ${
            isRightPanelCollapsed ? 'p-2' : 'p-4'
          }`}
        >
          <div className="flex items-center justify-between">
            {!isRightPanelCollapsed && <p className="font-mono text-[11px] uppercase text-[#8c887c]">Inspector</p>}
            <button
              aria-label={isRightPanelCollapsed ? 'Expand right panel' : 'Collapse right panel'}
              className="grid size-8 place-items-center rounded-md text-[#8c887c] transition hover:bg-[#242820] hover:text-[#f7f1e4]"
              onClick={() => setIsRightPanelCollapsed((collapsed) => !collapsed)}
              title={isRightPanelCollapsed ? 'Expand right panel' : 'Collapse right panel'}
              type="button"
            >
              <RightPanelIcon className="size-4" />
            </button>
          </div>

          {!isRightPanelCollapsed && (
            <>
              <section className="mt-5 rounded-md border border-[#34382f] bg-[#111310] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f7f1e4]">
                  <CheckCircle2 className="size-4 text-[#b7c3a8]" />
                  {latestModel ? `${latestModel.format.toUpperCase()} source stored` : 'Awaiting import'}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#aaa593]">
                  {latestModel
                    ? previewUrl
                      ? 'The project owns an uploaded source file and a browser-loadable preview mesh.'
                      : 'The project owns an uploaded source file with parsed STEP metadata. Mesh preview generation is pending.'
                    : 'The workbench starts empty until a real CAD source file is imported.'}
                </p>
              </section>

              <section className="mt-5">
                <p className="font-mono text-[11px] uppercase text-[#8c887c]">Document</p>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                    <dt className="text-[#8c887c]">Updated</dt>
                    <dd className="text-[#d8d1bf]">{updatedAt}</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                    <dt className="text-[#8c887c]">Units</dt>
                    <dd className="text-[#d8d1bf]">Millimeters</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                    <dt className="text-[#8c887c]">Sources</dt>
                    <dd className="text-[#d8d1bf]">{projectModels.length}</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                    <dt className="text-[#8c887c]">Preview</dt>
                    <dd className="text-[#d8d1bf]">{previewUrl ? `${latestPreviewFormat.toUpperCase()} mesh` : latestModel ? 'Preparing' : 'Empty'}</dd>
                  </div>
                  {latestModel && (
                    <>
                      <div className="flex items-center justify-between gap-3 border-b border-[#2d302b] pb-2">
                        <dt className="text-[#8c887c]">STEP</dt>
                        <dd className="truncate text-[#d8d1bf]">
                          {latestModel.metadata.schema || latestModel.metadata.asset_type.toUpperCase() || latestModel.parse_status}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                        <dt className="text-[#8c887c]">Unit</dt>
                        <dd className="text-[#d8d1bf]">{latestModel.metadata.length_unit || 'Unknown'}</dd>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                        <dt className="text-[#8c887c]">Entities</dt>
                        <dd className="text-[#d8d1bf]">{latestModel.metadata.entity_count}</dd>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                        <dt className="text-[#8c887c]">Triangles</dt>
                        <dd className="text-[#d8d1bf]">{latestTriangleCount}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default ProjectView
