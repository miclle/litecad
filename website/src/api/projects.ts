import client from './client'
import type { CreateProjectPayload, ProjectResponse, ProjectsResponse } from 'src/types/project'

export function fetchProjects() {
  return client.get<ProjectsResponse>('/projects')
}

export function fetchProject(projectId: string) {
  return client.get<ProjectResponse>(`/projects/${projectId}`)
}

export function createProject(payload: CreateProjectPayload) {
  return client.post<ProjectResponse>('/projects', payload)
}
