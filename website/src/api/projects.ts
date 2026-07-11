import client from './client'
import type {
  CreateProjectPayload,
  CADBoxFeature,
  CADTransform,
  CreateProjectAgentConversationPayload,
  ProjectAgentConversationResponse,
  ProjectAgentConversationsResponse,
  ProjectAgentMessageResponse,
  ProjectAgentMessagesResponse,
  ProjectCADDocumentResponse,
  ProjectCADHistoryResponse,
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

export function updateProjectCADModelTransform(projectId: string, modelId: string, transform: CADTransform, expectedRevision: number) {
  return client.patch<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/models/${modelId}/transform`, {
    transform,
    expected_revision: expectedRevision,
  })
}

export function updateProjectCADNodeTransform(projectId: string, nodeId: string, transform: CADTransform, expectedRevision: number) {
  return client.patch<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/nodes/${nodeId}/transform`, {
    transform,
    expected_revision: expectedRevision,
  })
}

export function deleteProjectCADNode(projectId: string, nodeId: string, expectedRevision: number) {
  return client.delete<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/nodes/${nodeId}`, {
    data: { expected_revision: expectedRevision },
  })
}

export function addProjectCADModelBoxUnion(projectId: string, modelId: string, box: CADBoxFeature, expectedRevision: number) {
  return client.post<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/models/${modelId}/box-union`, {
    box,
    expected_revision: expectedRevision,
  })
}

export function fetchProjectCADHistory(projectId: string, beforeSequence?: number) {
  return client.get<ProjectCADHistoryResponse>(`/projects/${projectId}/cad-document/history`, {
    params: beforeSequence ? { before_sequence: beforeSequence } : {},
  })
}

export function undoProjectCADDocument(projectId: string, expectedRevision: number) {
  return client.post<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/history/undo`, {
    expected_revision: expectedRevision,
  })
}

export function redoProjectCADDocument(projectId: string, expectedRevision: number) {
  return client.post<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/history/redo`, {
    expected_revision: expectedRevision,
  })
}

export function fetchProjectAgentConversations(projectId: string) {
  return client.get<ProjectAgentConversationsResponse>(`/projects/${projectId}/agent/conversations`)
}

export function createProjectAgentConversation(projectId: string, payload: CreateProjectAgentConversationPayload = {}) {
  return client.post<ProjectAgentConversationResponse>(`/projects/${projectId}/agent/conversations`, payload)
}

export function sendProjectAgentConversationMessage(
  projectId: string,
  conversationId: string,
  payload: SendProjectAgentMessagePayload,
) {
  return client.post<ProjectAgentMessageResponse>(`/projects/${projectId}/agent/conversations/${conversationId}/messages`, payload)
}

export function fetchProjectAgentConversationMessages(projectId: string, conversationId: string) {
  return client.get<ProjectAgentMessagesResponse>(`/projects/${projectId}/agent/conversations/${conversationId}/messages`)
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
