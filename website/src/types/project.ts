export interface Project {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface ProjectsResponse {
  projects: Project[]
}

export interface ProjectResponse {
  project: Project
}

export interface ProjectModel {
  id: string
  project_id: string
  original_filename: string
  format: 'step' | 'glb' | 'gltf' | 'stl'
  content_type: string
  byte_size: number
  parse_status: 'pending' | 'parsed' | 'error'
  parse_error: string
  metadata: StepMetadata
  created_at: string
  updated_at: string
}

export interface StepMetadata {
  asset_type: string
  version: string
  schema: string
  product_names: string[]
  length_unit: string
  entity_count: number
  representation_count: number
  triangle_count: number
}

export interface ProjectModelsResponse {
  models: ProjectModel[]
}

export interface ProjectModelResponse {
  model: ProjectModel
}

export interface ProjectModelPreviewArtifact {
  id: string
  model_id: string
  format: 'obj' | 'gltf' | 'glb'
  content_type: string
  generator_version: string
  byte_size: number
  vertex_count: number
  facet_count: number
  created_at: string
  updated_at: string
}

export interface ProjectModelPreviewArtifactResponse {
  preview: ProjectModelPreviewArtifact
}

export interface ProjectGeometryTreeNode {
  model_id: string
  parent_model_id: string
  preview_artifact_id: string
  name: string
  format: string
  preview_format: string
}

export interface ProjectGeometryVersion {
  id: string
  project_id: string
  source_model_id: string
  preview_artifact_id: string
  version_number: number
  summary: string
  created_at: string
  updated_at: string
}

export interface ProjectGeometryDocument {
  project_id: string
  model_tree: ProjectGeometryTreeNode[]
  models: ProjectModel[]
  preview_artifacts: ProjectModelPreviewArtifact[]
  versions: ProjectGeometryVersion[]
}

export interface ProjectGeometryDocumentResponse {
  document: ProjectGeometryDocument
}

export interface ProjectAgentMessage {
  id: string
  project_id: string
  role: 'assistant' | 'user'
  body: string
  created_at: string
  updated_at: string
}

export interface SendProjectAgentMessagePayload {
  messages: Pick<ProjectAgentMessage, 'body' | 'role'>[]
}

export interface ProjectAgentMessageResponse {
  message: ProjectAgentMessage
}

export interface ProjectAgentMessagesResponse {
  messages: ProjectAgentMessage[]
}

export interface CreateProjectPayload {
  name: string
  description: string
}
