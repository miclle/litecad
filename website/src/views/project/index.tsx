import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  ArrowLeft,
  FileText,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
  fetchProject,
} from 'src/api/projects'
import { ProjectWorkbenchComposition } from './project-workbench-composition'
import { useProjectWorkbenchRouteControllers } from './use-project-workbench-route-controllers'

function ProjectView() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => (await fetchProject(projectId)).data.project,
    enabled: projectId !== '',
  })
  const project = projectQuery.data
  const workbenchControllers = useProjectWorkbenchRouteControllers({
    isProjectLoaded: projectQuery.isSuccess,
    project,
    projectId,
  })

  if (projectQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] text-[#0f172a]">
        <div className="font-mono text-xs uppercase tracking-wide text-[#64748b]">{t('project.route.opening')}</div>
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] px-5 text-center text-[#0f172a]">
        <div>
          <FileText className="mx-auto size-8 text-[#475569]" />
          <h1 className="mt-4 text-2xl font-semibold">{t('project.route.unavailableTitle')}</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#64748b]">{t('project.route.unavailableBody')}</p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0f172a] px-4 text-sm font-semibold text-[#f8fafc] no-underline transition hover:bg-[#1f2937]"
            to="/projects"
          >
            <ArrowLeft className="size-4" />
            {t('project.route.allProjects')}
          </Link>
        </div>
      </div>
    )
  }
  return (
    <ProjectWorkbenchComposition
      {...workbenchControllers}
      fileInputRef={fileInputRef}
      project={project}
    />
  )
}

export default ProjectView
