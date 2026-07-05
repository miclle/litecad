import client from './client'
import type {
  CreateProjectPayload,
  ProjectGeometryDocumentResponse,
  ProjectModelPreviewArtifactResponse,
  ProjectModelResponse,
  ProjectModelsResponse,
  ProjectResponse,
  ProjectsResponse,
} from 'src/types/project'

export function fetchProjects() {
  return client.get<ProjectsResponse>('/projects')
}

export function fetchProject(projectId: string) {
  return client.get<ProjectResponse>(`/projects/${projectId}`)
}

export function fetchProjectGeometryDocument(projectId: string) {
  return client.get<ProjectGeometryDocumentResponse>(`/projects/${projectId}/geometry`)
}

export function createProject(payload: CreateProjectPayload) {
  return client.post<ProjectResponse>('/projects', payload)
}

export function fetchProjectModels(projectId: string) {
  return client.get<ProjectModelsResponse>(`/projects/${projectId}/models`)
}

export function uploadProjectModel(projectId: string, file: File) {
  const formData = new FormData()
  formData.append('model', file)
  return client.post<ProjectModelResponse>(`/projects/${projectId}/models`, formData)
}

export function fetchProjectModelPreview(projectId: string, modelId: string) {
  return client.get<Blob>(`/projects/${projectId}/models/${modelId}/preview`, { responseType: 'blob' })
}

export function fetchProjectModelPreviewArtifact(projectId: string, modelId: string) {
  return client.get<ProjectModelPreviewArtifactResponse>(`/projects/${projectId}/models/${modelId}/preview-artifact`)
}
