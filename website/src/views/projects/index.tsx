import { FormEvent, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, FileBox, Grid2X2, Loader2, Plus, Sparkles, UserRound, X } from 'lucide-react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import axios from 'axios'

import {
  createProject,
  fetchProjects,
} from 'src/api/projects'
import type { AuthUser } from 'src/types/auth'
import type { Project } from 'src/types/project'

const projectSwatches = ['#cfd8c0', '#f0c77b', '#b8c7d9', '#d6b7a8', '#a8cfc4', '#d7cfec']

interface MainLayoutContext {
  currentUser?: AuthUser
}

function ProjectsView() {
  const { currentUser } = useOutletContext<MainLayoutContext>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await fetchProjects()).data.projects,
    enabled: Boolean(currentUser),
  })

  const createMutation = useMutation({
    mutationFn: async () => (await createProject({ name, description })).data.project,
    onSuccess: async (project) => {
      setName('')
      setDescription('')
      setErrorMessage('')
      setIsCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${project.id}`)
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        setErrorMessage('Add a project name and keep the description under 350 characters.')
        return
      }
      setErrorMessage('The project could not be created. Please try again.')
    },
  })

  const projects = projectsQuery.data ?? []

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    createMutation.mutate()
  }

  useEffect(() => {
    const openDialog = () => setIsCreateOpen(true)
    window.addEventListener('litecad:new-project', openDialog)
    return () => window.removeEventListener('litecad:new-project', openDialog)
  }, [])

  return (
    <div className="grid min-h-[calc(100vh-56px)] bg-[#f7f5ef] lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="border-b border-[#d9d3c2] bg-[#f3f0e8] px-3 py-3 lg:flex lg:min-h-[calc(100vh-56px)] lg:flex-col lg:border-b-0 lg:border-r">
        <nav className="flex gap-1 overflow-x-auto lg:grid lg:overflow-visible">
          <span className="flex h-10 shrink-0 items-center gap-3 rounded-md bg-[#171814] px-3 text-sm font-medium text-[#f7f5ef]">
            <Grid2X2 className="size-4" />
            All projects
          </span>
          <span className="flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm text-[#686a60] transition hover:bg-[#e8e1d0] hover:text-[#171814]">
            <Clock3 className="size-4" />
            Recent
          </span>
        </nav>

        {currentUser && (
          <div className="mt-auto hidden items-center gap-2 border-t border-[#d9d3c2] pt-3 text-sm font-medium text-[#303329] lg:flex">
            <UserRound className="size-4 shrink-0 text-[#52625a]" />
            <span className="truncate">{currentUser.name}</span>
          </div>
        )}
      </aside>

      <section className="min-w-0 px-5 py-4 lg:px-8">
        <h1 className="sr-only">Projects</h1>
        {projectsQuery.isLoading ? (
          <ProjectSkeletonGrid />
        ) : projectsQuery.isError ? (
          <StatePanel
            body="Projects could not be loaded. Check your session and try refreshing the page."
            icon={<FileBox className="size-5" />}
            title="Unable to load projects"
          />
        ) : projects.length === 0 ? (
          <StatePanel
            action={
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#171814] px-4 text-sm font-semibold text-[#f7f5ef]"
                onClick={() => setIsCreateOpen(true)}
                type="button"
              >
                <Plus className="size-4" />
                New project
              </button>
            }
            body="Create the first project to collect briefs, references, and future CAD preview work."
            icon={<Sparkles className="size-5" />}
            title="Start a project library"
          />
        ) : (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-8 gap-y-9">
            {projects.map((project, index) => (
              <ProjectCard index={index} key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#171814]/32 px-4 backdrop-blur-sm">
          <section className="w-full max-w-[520px] rounded-md border border-[#d8cfbc] bg-[#fcfaf3] shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#d9d3c2] px-5 py-4">
              <div>
                <p className="font-mono text-xs uppercase text-[#7a6c52]">Create</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#171814]">New project</h2>
              </div>
              <button
                aria-label="Close"
                className="grid size-9 place-items-center rounded-md border border-[#cfc6b2] text-[#303329] transition hover:border-[#52625a]"
                onClick={() => setIsCreateOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>

            <form className="grid gap-4 p-5" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-medium text-[#303329]">
                Project name
                <input
                  autoFocus
                  className="h-12 rounded-md border border-[#cfc6b2] bg-white px-3 text-sm outline-none focus:border-[#52625a]"
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Bracket study"
                  required
                  value={name}
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[#303329]">
                Description
                <textarea
                  className="min-h-28 resize-none rounded-md border border-[#cfc6b2] bg-white p-3 text-sm leading-6 outline-none focus:border-[#52625a]"
                  maxLength={350}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="A short note about intent, constraints, materials, or references."
                  value={description}
                />
              </label>

              <div className="flex items-center justify-between text-xs text-[#7a6c52]">
                <span>Stored in your LiteCAD workspace</span>
                <span>{description.length}/350</span>
              </div>

              {errorMessage && (
                <p className="rounded-md border border-[#d9a9a1] bg-[#fff2ef] px-3 py-2 text-sm text-[#8a2f24]">
                  {errorMessage}
                </p>
              )}

              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#171814] px-5 text-sm font-semibold text-[#f7f5ef] transition hover:bg-[#303329] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={createMutation.isPending}
                type="submit"
              >
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create project
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ index, project }: { index: number; project: Project }) {
  const models = project.thumbnail?.models ?? []
  const modelCount = project.thumbnail?.model_count ?? 0
  const updatedAt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(project.updated_at))

  return (
    <Link
      className="group flex aspect-[4/3] flex-col overflow-hidden rounded-lg border border-[#ddd6c8] bg-[#fbfaf5] text-inherit no-underline transition hover:-translate-y-0.5 hover:border-[#c9c0ad] hover:shadow-sm"
      to={`/projects/${project.id}`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden border-b border-[#e5e1d8] bg-[#f8fafc]">
        <ProjectCoverPreview cardIndex={index} models={models} snapshot={project.thumbnail?.snapshot} />
      </div>
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 py-3.5">
        <div className="flex min-w-0 items-center">
          <span className="min-w-0">
            <h2 className="line-clamp-1 text-sm font-medium leading-5 text-[#171814]">{project.name}</h2>
            <span className="block truncate text-xs leading-5 text-[#8a857b]">Edited {updatedAt}</span>
          </span>
        </div>
        <span className="shrink-0 text-xs font-medium uppercase tracking-normal text-[#686a60]">
          {modelCount > 0 ? `${modelCount} model${modelCount > 1 ? 's' : ''}` : 'No models'}
        </span>
      </div>
    </Link>
  )
}

export function ProjectCoverPreview({
  cardIndex,
  models,
  snapshot,
}: {
  cardIndex: number
  models: Project['thumbnail']['models']
  snapshot?: Project['thumbnail']['snapshot']
}) {
  const hasModels = models.length > 0

  if (snapshot) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[#f8fafc]">
        <img alt="" className="size-full object-cover" loading="lazy" src={snapshot.url} />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#f8fafc] to-transparent" />
      </div>
    )
  }

  return (
    <ProjectPlaceholderCover cardIndex={cardIndex} modelCount={Math.max(models.length, hasModels ? 1 : 0)} />
  )
}

function ProjectPlaceholderCover({ cardIndex, modelCount }: { cardIndex: number; modelCount: number }) {
  const objectCount = Math.max(1, Math.min(modelCount || 1, 3))
  const objects = Array.from({ length: objectCount })

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-full bg-[#f8fafc]"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 320 180"
    >
      <defs>
        <pattern height="12" id={`project-card-grid-${cardIndex}`} patternUnits="userSpaceOnUse" width="12">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#cbd5e1" strokeOpacity="0.4" strokeWidth="0.7" />
        </pattern>
        <filter id={`project-card-shadow-${cardIndex}`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="8" floodColor="#0f172a" floodOpacity="0.16" stdDeviation="7" />
        </filter>
        <linearGradient id={`project-card-fade-${cardIndex}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="0" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      <rect fill="#f8fafc" height="180" width="320" />
      <g opacity="0.62" transform="translate(160 122) rotate(-8) skewX(-24)">
        <rect fill={`url(#project-card-grid-${cardIndex})`} height="132" width="430" x="-215" y="-66" />
      </g>

      <g strokeLinecap="round" strokeWidth="0.5" transform="translate(160 108)">
        <line stroke="#e36b5d" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" x1="-154" x2="154" y1="28" y2="-24" />
        <line stroke="#55a968" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" x1="-126" x2="124" y1="-12" y2="52" />
        <line stroke="#5c86d6" strokeOpacity="0.22" vectorEffect="non-scaling-stroke" x1="0" x2="0" y1="4" y2="-36" />
      </g>

      <g filter={`url(#project-card-shadow-${cardIndex})`}>
        {objects.map((_, modelIndex) => {
          const x = 124 + (modelIndex - (objectCount - 1) / 2) * 42
          const y = 77 + (modelIndex % 2) * 7
          const color = projectSwatches[(cardIndex + modelIndex) % projectSwatches.length]
          return (
            <g key={modelIndex} transform={`translate(${x} ${y}) rotate(-5)`}>
              <path
                d="M17 0 H58 Q67 0 66 9 L60 46 Q58 58 47 58 H10 Q0 58 2 46 L8 10 Q10 0 17 0 Z"
                fill={color}
                stroke="#0f172a"
                strokeOpacity="0.15"
              />
              <path
                d="M58 0 L76 10 Q82 14 80 24 L74 60 Q72 70 61 72 L47 58 Q58 58 60 46 L66 9 Q67 0 58 0 Z"
                fill="#0f172a"
                fillOpacity="0.14"
                stroke="#0f172a"
                strokeOpacity="0.08"
              />
              <path
                d="M8 10 Q10 0 17 0 H58 L76 10 H25 Q17 10 15 20 L10 48 Q9 55 14 58 H10 Q0 58 2 46 Z"
                fill="#ffffff"
                fillOpacity="0.22"
              />
              <path d="M15 14 H58" stroke="#ffffff" strokeOpacity="0.34" strokeWidth="1" />
              <ellipse cx="36" cy="29" fill="#f8fafc" fillOpacity="0.42" rx="10" ry="5" />
            </g>
          )
        })}
      </g>

      <rect fill={`url(#project-card-fade-${cardIndex})`} height="56" width="320" y="124" />
    </svg>
  )
}

function ProjectSkeletonGrid() {
  return (
    <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-8 gap-y-9">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="flex aspect-[4/3] flex-col overflow-hidden rounded-lg border border-[#ddd6c8] bg-[#fbfaf5]" key={index}>
          <div className="min-h-0 flex-1 animate-pulse border-b border-[#e5e1d8] bg-[#e8e1d0]" />
          <div className="flex h-16 shrink-0 items-center px-4 py-3.5">
            <div className="grid flex-1 gap-2">
              <div className="h-4 w-2/3 animate-pulse rounded-sm bg-[#e8e1d0]" />
              <div className="h-3 w-1/3 animate-pulse rounded-sm bg-[#eee7d8]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatePanel({
  action,
  body,
  icon,
  title,
}: {
  action?: ReactNode
  body: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="mt-5 grid min-h-80 place-items-center rounded-md border border-dashed border-[#cfc6b2] bg-[#fcfaf3] p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-11 place-items-center rounded-md border border-[#cfc6b2] bg-[#f7f1e4] text-[#52625a]">
          {icon}
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[#171814]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#686a60]">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  )
}

export default ProjectsView
