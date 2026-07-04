import { FormEvent, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Clock3, FileBox, Grid2X2, Loader2, Plus, Sparkles, UserRound, X } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import axios from 'axios'

import { createProject, fetchProjects } from 'src/api/projects'
import type { AuthUser } from 'src/types/auth'
import type { Project } from 'src/types/project'

const projectSwatches = ['#cfd8c0', '#f0c77b', '#b8c7d9', '#d6b7a8', '#a8cfc4', '#d7cfec']

interface MainLayoutContext {
  currentUser?: AuthUser
}

function ProjectsView() {
  const { currentUser } = useOutletContext<MainLayoutContext>()
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await fetchProjects()).data.projects,
  })

  const createMutation = useMutation({
    mutationFn: async () => (await createProject({ name, description })).data.project,
    onSuccess: async () => {
      setName('')
      setDescription('')
      setErrorMessage('')
      setIsCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
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
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
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
  const swatch = projectSwatches[index % projectSwatches.length]
  const updatedAt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(project.updated_at))

  return (
    <article className="group overflow-hidden rounded-md border border-[#d8cfbc] bg-[#fcfaf3] shadow-sm transition hover:-translate-y-0.5 hover:border-[#a9b093] hover:shadow-md">
      <div className="relative h-36 border-b border-[#d9d3c2] bg-[#efe6d5]">
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-3 gap-px p-3">
          {Array.from({ length: 12 }).map((_, cellIndex) => (
            <div
              className="border border-[#171814]/10 bg-white/42"
              key={cellIndex}
              style={{ backgroundColor: cellIndex % 5 === 0 ? swatch : undefined }}
            />
          ))}
        </div>
        <div className="absolute bottom-3 left-3 rounded-md border border-[#171814]/12 bg-[#fcfaf3]/90 px-2.5 py-1.5 font-mono text-xs uppercase text-[#52625a] backdrop-blur">
          CAD brief
        </div>
      </div>
      <div className="p-4">
        <h2 className="line-clamp-2 min-h-12 text-base font-semibold leading-6 text-[#171814]">{project.name}</h2>
        <p className="mt-2 line-clamp-2 min-h-11 text-sm leading-6 text-[#686a60]">
          {project.description || 'No description yet.'}
        </p>
        <div className="mt-5 flex items-center gap-2 border-t border-[#e4ddcd] pt-3 text-xs text-[#7a6c52]">
          <CalendarDays className="size-4" />
          Updated {updatedAt}
        </div>
      </div>
    </article>
  )
}

function ProjectSkeletonGrid() {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="overflow-hidden rounded-md border border-[#d8cfbc] bg-[#fcfaf3]" key={index}>
          <div className="h-36 animate-pulse border-b border-[#d9d3c2] bg-[#e8e1d0]" />
          <div className="grid gap-3 p-4">
            <div className="h-5 w-3/4 animate-pulse rounded-sm bg-[#e8e1d0]" />
            <div className="h-4 w-full animate-pulse rounded-sm bg-[#eee7d8]" />
            <div className="h-4 w-2/3 animate-pulse rounded-sm bg-[#eee7d8]" />
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
