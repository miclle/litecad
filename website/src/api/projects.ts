import client from './client'
import type {
  CreateProjectPayload,
  UpdateProjectPayload,
  CADBoxFeature,
  CADTransform,
  UpdateCADAssemblyOccurrencePayload,
  UpdateCADAssemblyGroupPayload,
  CreateProjectAgentConversationPayload,
  ProjectAgentConversationResponse,
  ProjectAgentConversationsResponse,
  ProjectAgentMessageResponse,
  ProjectAgentMessagesResponse,
  ProjectAgentParametricRunPayload,
  ProjectAgentParametricRunResponse,
  ProjectCADDocumentResponse,
  ProjectCADHistoryResponse,
  ProjectGeometryDocumentResponse,
  ProjectExportArtifactPayload,
  ProjectExportArtifactResponse,
  ProjectExportArtifactsResponse,
  ProjectFeatureDSLGraphPayload,
  ProjectInspectionRecordPayload,
  ProjectInspectionRecordResponse,
  ProjectInspectionRecordsResponse,
  ProjectThumbnailSnapshotResponse,
  ProjectModelPreviewArtifactResponse,
  ProjectModelResponse,
  ProjectModelRevisionsResponse,
  ProjectModelsResponse,
  ProjectParametricArtifactPayload,
  ProjectParametricArtifactResponse,
  ProjectParametricArtifactsResponse,
  ProjectParametricModelParametersPayload,
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

export function duplicateProjectCADOccurrence(projectId: string, occurrenceId: string, expectedRevision: number) {
  return client.post<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/occurrences/${occurrenceId}/duplicate`, {
    expected_revision: expectedRevision,
  })
}

export function updateProjectCADOccurrence(projectId: string, occurrenceId: string, payload: UpdateCADAssemblyOccurrencePayload, expectedRevision: number) {
  return client.patch<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/occurrences/${occurrenceId}`, {
    ...payload,
    expected_revision: expectedRevision,
  })
}

export function moveProjectCADOccurrence(projectId: string, occurrenceId: string, targetIndex: number, expectedRevision: number) {
  return client.post<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/occurrences/${occurrenceId}/move`, {
    target_index: targetIndex,
    expected_revision: expectedRevision,
  })
}

export function deleteProjectCADOccurrence(projectId: string, occurrenceId: string, expectedRevision: number) {
  return client.delete<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/occurrences/${occurrenceId}`, {
    data: { expected_revision: expectedRevision },
  })
}

export function createProjectCADAssemblyGroup(projectId: string, payload: { name: string; parent_group_id: string }, expectedRevision: number) {
  return client.post<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/groups`, {
    ...payload,
    expected_revision: expectedRevision,
  })
}

export function updateProjectCADAssemblyGroup(projectId: string, groupId: string, payload: UpdateCADAssemblyGroupPayload, expectedRevision: number) {
  return client.patch<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/groups/${groupId}`, {
    ...payload,
    expected_revision: expectedRevision,
  })
}

export function deleteProjectCADAssemblyGroup(projectId: string, groupId: string, expectedRevision: number) {
  return client.delete<ProjectCADDocumentResponse>(`/projects/${projectId}/cad-document/groups/${groupId}`, {
    data: { expected_revision: expectedRevision },
  })
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

export function sendProjectAgentConversationMessage(projectId: string, conversationId: string, payload: SendProjectAgentMessagePayload) {
  return client.post<ProjectAgentMessageResponse>(`/projects/${projectId}/agent/conversations/${conversationId}/messages`, payload)
}

export function fetchProjectAgentConversationMessages(projectId: string, conversationId: string) {
  return client.get<ProjectAgentMessagesResponse>(`/projects/${projectId}/agent/conversations/${conversationId}/messages`)
}

export function runProjectAgentParametric(projectId: string, conversationId: string, payload: ProjectAgentParametricRunPayload) {
  return client.post<ProjectAgentParametricRunResponse>(`/projects/${projectId}/agent/conversations/${conversationId}/parametric-runs`, payload)
}

export function fetchProjectParametricArtifacts(projectId: string) {
  return client.get<ProjectParametricArtifactsResponse>(`/projects/${projectId}/parametric-artifacts`)
}

export function fetchProjectParametricArtifact(projectId: string, artifactId: string) {
  return client.get<ProjectParametricArtifactResponse>(`/projects/${projectId}/parametric-artifacts/${artifactId}`)
}

export function createProjectParametricArtifact(projectId: string, payload: ProjectParametricArtifactPayload) {
  return client.post<ProjectParametricArtifactResponse>(`/projects/${projectId}/parametric-artifacts`, payload)
}

export function updateProjectParametricArtifact(projectId: string, artifactId: string, payload: ProjectParametricArtifactPayload) {
  return client.patch<ProjectParametricArtifactResponse>(`/projects/${projectId}/parametric-artifacts/${artifactId}`, payload)
}

export function saveProjectParametricArtifactModel(projectId: string, artifactId: string) {
  return client.post<ProjectModelResponse>(`/projects/${projectId}/parametric-artifacts/${artifactId}/save-model`, {})
}

export function updateProjectParametricModelParameters(projectId: string, modelId: string, payload: ProjectParametricModelParametersPayload) {
  return client.patch<ProjectModelResponse>(`/projects/${projectId}/models/${modelId}/parametric-parameters`, payload)
}

export function updateProjectFeatureDSLGraph(projectId: string, modelId: string, payload: ProjectFeatureDSLGraphPayload) {
  return client.patch<ProjectModelResponse>(`/projects/${projectId}/models/${modelId}/feature-dsl-graph`, payload)
}

export function fetchProjectModelRevisions(projectId: string, modelId: string) {
  return client.get<ProjectModelRevisionsResponse>(`/projects/${projectId}/models/${modelId}/revisions`)
}

export function restoreProjectModelRevision(projectId: string, modelId: string, revisionId: string, expectedRevision: number) {
  return client.post<ProjectModelResponse>(`/projects/${projectId}/models/${modelId}/revisions/${revisionId}/restore`, {
    expected_revision: expectedRevision,
  })
}

export function createProject(payload: CreateProjectPayload) {
  return client.post<ProjectResponse>('/projects', payload)
}

export function updateProject(projectId: string, payload: UpdateProjectPayload) {
  return client.patch<ProjectResponse>(`/projects/${projectId}`, payload)
}

export function deleteProject(projectId: string) {
  return client.delete(`/projects/${projectId}`)
}

export function uploadProjectThumbnailSnapshot(projectId: string, snapshot: Blob, metadata: { width: number; height: number; revision: number }) {
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
  return client.get<Blob>(`/projects/${projectId}/models/${modelId}/preview`, {
    responseType: 'blob',
  })
}

export function fetchProjectModelSource(projectId: string, modelId: string) {
  return client.get<Blob>(`/projects/${projectId}/models/${modelId}/source`, {
    responseType: 'blob',
  })
}

export function fetchProjectModelRevisionSource(projectId: string, modelId: string, revisionId: string) {
  return client.get<Blob>(`/projects/${projectId}/models/${modelId}/revisions/${revisionId}/source`, { responseType: 'blob' })
}

export function fetchProjectModelPreviewArtifact(projectId: string, modelId: string) {
  return client.get<ProjectModelPreviewArtifactResponse>(`/projects/${projectId}/models/${modelId}/preview-artifact`)
}

export function fetchProjectExportArtifacts(projectId: string) {
  return client.get<ProjectExportArtifactsResponse>(`/projects/${projectId}/export-artifacts`)
}

export function createProjectExportArtifact(projectId: string, payload: ProjectExportArtifactPayload) {
  return client.post<ProjectExportArtifactResponse>(`/projects/${projectId}/export-artifacts`, payload)
}

export function downloadProjectExportArtifact(projectId: string, artifactId: string) {
  return client.get<Blob>(`/projects/${projectId}/export-artifacts/${artifactId}/download`, { responseType: 'blob' })
}

export function fetchProjectInspectionRecords(projectId: string) {
  return client.get<ProjectInspectionRecordsResponse>(`/projects/${projectId}/inspection-records`)
}

export function createProjectInspectionRecord(projectId: string, payload: ProjectInspectionRecordPayload) {
  return client.post<ProjectInspectionRecordResponse>(`/projects/${projectId}/inspection-records`, payload)
}

export function deleteProjectInspectionRecord(projectId: string, recordId: string) {
  return client.delete(`/projects/${projectId}/inspection-records/${recordId}`)
}
