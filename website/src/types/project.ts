export interface Project {
  id: string
  name: string
  description: string
  thumbnail: ProjectThumbnail
  created_at: string
  updated_at: string
}

export interface ProjectThumbnail {
  model_count: number
  models: ProjectModelSummary[]
  snapshot?: ProjectThumbnailSnapshot
}

export interface ProjectThumbnailSnapshot {
  url: string
  status: 'ready' | 'dirty' | 'pending' | 'error'
  revision: number
  width: number
  height: number
  updated_at: string
}

export interface ProjectThumbnailSnapshotResponse {
  snapshot: ProjectThumbnailSnapshot
}

export interface ProjectModelSummary {
  id: string
  format: 'step' | 'glb' | 'gltf' | 'stl' | 'scad' | 'lcad'
  parse_status: 'pending' | 'parsed' | 'error'
  metadata: StepMetadata
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
  format: 'step' | 'glb' | 'gltf' | 'stl' | 'scad' | 'lcad'
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
  source_kind?: string
  version: string
  schema: string
  product_names: string[] | null
  components?: StepComponent[] | null
  length_unit: string
  entity_count: number
  parameter_count?: number
  parameter_values?: Record<string, unknown>
  compile_summary?: string
  representation_count: number
  triangle_count: number
}

export interface StepComponent {
  name: string
  kind: string
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
  source_model_id?: string
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

export interface CADTransform {
  matrix: readonly number[]
}

export interface CADBoxFeature {
  origin: readonly number[]
  size: readonly number[]
}

export interface CADDocumentNode {
  id: string
  model_id: string
  source_model_id?: string
  parent_node_id: string
  name: string
  source_format: string
  transform: CADTransform
}

export interface CADOperation {
  id: string
  type: 'transform' | 'box-union' | 'delete-node'
  model_id: string
  node_id?: string
  transform?: CADTransform
  box?: CADBoxFeature
  created_at: string
}

export interface CADHistoryState {
  head_id: string
  can_undo: boolean
  can_redo: boolean
}

export interface CADHistoryEntry {
  id: string
  sequence: number
  parent_entry_id?: string
  status: 'applied' | 'undone' | 'discarded'
  command_type: 'transform' | 'box-union' | 'delete-node'
  target_id: string
  summary: string
  created_at: string
}

export interface ProjectCADHistoryResponse {
  entries: CADHistoryEntry[]
  next_before_sequence?: number
}

export interface ProjectCADDocument {
  id: string
  project_id: string
  schema_version: number
  revision: number
  unit: string
  nodes: CADDocumentNode[]
  operations: CADOperation[]
  history: CADHistoryState
  created_at: string
  updated_at: string
}

export interface ProjectCADDocumentResponse {
  document: ProjectCADDocument
}

export interface ProjectAgentMessage {
  id: string
  project_id: string
  conversation_id: string
  role: 'assistant' | 'user'
  body: string
  created_at: string
  updated_at: string
}

export interface ProjectAgentConversation {
  id: string
  project_id: string
  title: string
  active_model_id?: string
  archived_at?: string
  created_at: string
  updated_at: string
}

export interface CreateProjectAgentConversationPayload {
  title?: string
  active_model_id?: string
}

export interface SendProjectAgentMessagePayload {
  messages: Pick<ProjectAgentMessage, 'body' | 'role'>[]
}

export interface AIParametricToolCall {
  tool: 'build_parametric_model'
  input: {
    title: string
    version: string
    source_kind: 'openscad' | 'litecad-feature-dsl'
    code: string
  }
}

export interface ProjectAgentMessagePart {
  type: 'text' | 'tool_call' | 'artifact'
  text?: string
  tool_call?: AIParametricToolCall
  artifact_id?: string
}

export interface ProjectAgentStructuredMessage extends ProjectAgentMessage {
  parts: ProjectAgentMessagePart[]
}

export interface ProjectAgentParametricRunPayload {
  message: string
}

export interface ProjectAgentParametricTelemetry {
  tool_mode: 'json_fallback' | 'native_tool'
  source_kind: 'openscad' | 'litecad-feature-dsl'
  duration_ms: number
}

export interface ProjectAgentConversationResponse {
  conversation: ProjectAgentConversation
}

export interface ProjectAgentConversationsResponse {
  conversations: ProjectAgentConversation[]
}

export interface ProjectAgentMessageResponse {
  message: ProjectAgentMessage
}

export interface ProjectAgentParametricRunResponse {
  message: ProjectAgentStructuredMessage
  artifact: ProjectParametricArtifact
  telemetry: ProjectAgentParametricTelemetry
}

export interface ProjectAgentMessagesResponse {
  messages: ProjectAgentMessage[]
}

export interface ProjectParametricArtifact {
  id: string
  project_id: string
  conversation_id: string
  message_id: string
  title: string
  source_kind: 'openscad' | 'litecad-feature-dsl'
  source_code: string
  parameter_values: Record<string, unknown>
  compile_status: 'pending' | 'success' | 'error'
  compile_error: string
  preview_model_id: string
  generation_tool_mode: '' | 'json_fallback' | 'native_tool'
  generation_duration_ms: number
  created_at: string
  updated_at: string
}

export interface ProjectParametricArtifactPayload {
  conversation_id?: string
  message_id?: string
  title: string
  source_kind: 'openscad' | 'litecad-feature-dsl'
  source_code: string
  parameter_values?: Record<string, unknown>
  compile_status?: 'pending' | 'success' | 'error'
  compile_error?: string
  preview_model_id?: string
}

export interface ProjectParametricArtifactResponse {
  artifact: ProjectParametricArtifact
}

export interface ProjectParametricArtifactsResponse {
  artifacts: ProjectParametricArtifact[]
}

export interface ProjectParametricModelParametersPayload {
  parameter_values: Record<string, unknown>
}

export interface CreateProjectPayload {
  name: string
  description: string
}
