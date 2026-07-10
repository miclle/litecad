import client from './client'
import type {
  CreateProjectPayload,
  CADBoxFeature,
  CADTransform,
  ProjectAgentMessageResponse,
  ProjectAgentMessagesResponse,
  ProjectCADDocumentResponse,
  ProjectGeometryDocumentResponse,
  ProjectThumbnailSnapshotResponse,
  ProjectModelPreviewArtifactResponse,
  ProjectModelResponse,
  ProjectModelsResponse,
  ProjectResponse,
  ProjectsResponse,
  SendProjectAgentMessagePayload,
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

export function fetchProjectCADDocument(projectId: string) {
  return client.get<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document`)
}

export function updateProjectCADModelTransform(projectId: string, modelId: string, transform: CADTransform) {
  return client.patch<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/models/${modelId}/transform`, { transform })
}

export function updateProjectCADNodeTransform(projectId: string, nodeId: string, transform: CADTransform) {
  return client.patch<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/nodes/${nodeId}/transform`, { transform })
}

export function deleteProjectCADNode(projectId: string, nodeId: string) {
  return client.delete<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/nodes/${nodeId}`)
}

export function addProjectCADModelBoxUnion(projectId: string, modelId: string, box: CADBoxFeature) {
  return client.post<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/models/${modelId}/box-union`, { box })
}

export function sendProjectAgentMessage(projectId: string, payload: SendProjectAgentMessagePayload) {
  return client.post<ProjectAgentMessageResponse>(`/projects/${projectId}/agent/messages`, payload)
}

export function fetchProjectAgentMessages(projectId: string) {
  return client.get<ProjectAgentMessagesResponse>(`/projects/${projectId}/agent/messages`)
}

export function createProject(payload: CreateProjectPayload) {
  return client.post<ProjectResponse>('/projects', payload)
}

export function uploadProjectThumbnailSnapshot(
  projectId: string,
  snapshot: Blob,
  metadata: { width: number; height: number; revision: number },
) {
  const formData = new FormData()
  formData.append('snapshot', snapshot, 'thumbnail.webp')
  formData.append('width', String(metadata.width))
  formData.append('height', String(metadata.height))
  formData.append('revision', String(metadata.revision))
  return client.post<ProjectThumbnailSnapshotResponse>(`/projects/${projectId}/thumbnail`, formData)
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

export function fetchProjectModelSource(projectId: string, modelId: string) {
  return client.get<Blob>(`/projects/${projectId}/models/${modelId}/source`, { responseType: 'blob' })
}

export function fetchProjectModelPreviewArtifact(projectId: string, modelId: string) {
  return client.get<ProjectModelPreviewArtifactResponse>(`/projects/${projectId}/models/${modelId}/preview-artifact`)
}
