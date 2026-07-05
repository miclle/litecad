import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  Box,
  Boxes,
  CheckCircle2,
  Circle,
  Cuboid,
  FileText,
  Layers3,
  MousePointer2,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Ruler,
  Share2,
  SlidersHorizontal,
  SquareDashedMousePointer,
  Triangle,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { fetchProject } from 'src/api/projects'
import {
  createSetViewEvent,
  modelPreviewSelector,
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

const canvasTools = [
  { label: 'Select', icon: MousePointer2, active: true },
  { label: 'Sketch', icon: PenTool },
  { label: 'Extrude', icon: Cuboid },
  { label: 'Measure', icon: Ruler },
  { label: 'Region select', icon: SquareDashedMousePointer },
  { label: 'Solid', icon: Box },
  { label: 'Triangle', icon: Triangle },
  { label: 'Circle', icon: Circle },
  { label: 'Adjust', icon: SlidersHorizontal },
]

const primaryTools = canvasTools.slice(0, 4)
const geometryTools = canvasTools.slice(4)

const modelTree = [
  {
    label: 'Bodies',
    items: [
      { label: 'Base plate', state: 'ready', icon: Boxes },
      { label: 'Mounting rib', state: 'draft', icon: Box },
    ],
  },
  {
    label: 'Construction',
    items: [{ label: 'Reference plane', state: 'locked', icon: Layers3 }],
  },
]

function ProjectView() {
  const { projectId = '' } = useParams()
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => (await fetchProject(projectId)).data.project,
    enabled: projectId !== '',
  })
  const project = projectQuery.data

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
    document.querySelector(modelPreviewSelector)?.dispatchEvent(createSetViewEvent(nextOrientation))
  }
  const stepCanvasOrientation = (step: ViewRotationStep) => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, step), rotationStep: step })
  }
  const flipCanvasOrientation = () => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, { horizontal: 180 }), rotationStep: { horizontal: 180 } })
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

        <div className="hidden items-center justify-center gap-1 lg:flex">
          {primaryTools.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={`grid size-9 place-items-center rounded-md transition ${
                  item.active ? 'bg-[#e9e2d0] text-[#111310]' : 'text-[#a8a293] hover:bg-[#242820] hover:text-[#f7f1e4]'
                }`}
                key={item.label}
                title={item.label}
                type="button"
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>

        <div className="hidden items-center justify-end gap-3 lg:flex">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#8c887c]">
            <CheckCircle2 className="size-4 text-[#b7c3a8]" />
            Autosaved
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-[#a8a293] transition hover:bg-[#242820] hover:text-[#f7f1e4]"
            type="button"
          >
            <Share2 className="size-4" />
            Share
          </button>
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
                  {project.description || 'No description yet. Start by sketching or importing a reference.'}
                </p>
              </section>

              <section className="mt-8">
                <p className="font-mono text-[11px] uppercase text-[#8c887c]">Model</p>
                <div className="mt-3 grid gap-5">
                  {modelTree.map((group) => (
                    <div key={group.label}>
                      <p className="mb-1 px-2 font-mono text-[10px] uppercase text-[#68655d]">{group.label}</p>
                      <div className="grid gap-1">
                        {group.items.map((item) => {
                          const Icon = item.icon
                          return (
                            <button
                              className="flex h-10 items-center justify-between rounded-md px-2 text-left text-sm text-[#d8d1bf] transition hover:bg-[#242820]"
                              key={item.label}
                              type="button"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <Icon className="size-4 text-[#b7c3a8]" />
                                <span className="truncate">{item.label}</span>
                              </span>
                              <span className="font-mono text-[10px] uppercase text-[#8c887c]">{item.state}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </aside>

        <section className="relative min-h-0 overflow-hidden bg-[#1b1d19]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(183,195,168,0.13),transparent_34%)]" />
          <ModelPreview key={project.id} />

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

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-[#34382f] bg-[#151814]/92 p-1 shadow-xl backdrop-blur">
            {geometryTools.map((item) => {
              const Icon = item.icon
              return (
                <button
                  className={`grid size-9 place-items-center rounded transition ${
                    item.active ? 'bg-[#e9e2d0] text-[#111310]' : 'text-[#a8a293] hover:bg-[#242820] hover:text-[#f7f1e4]'
                  }`}
                  key={item.label}
                  title={item.label}
                  type="button"
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
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
                  Ready for sketch
                </div>
                <p className="mt-2 text-sm leading-6 text-[#aaa593]">
                  Build the first solid from a prompt, a sketch, or an imported reference.
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
                    <dt className="text-[#8c887c]">Kernel</dt>
                    <dd className="text-[#d8d1bf]">Preview</dd>
                  </div>
                </dl>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

export default ProjectView
