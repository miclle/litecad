export type CadKernelMesh = {
  positions: number[]
  normals: number[]
  indices: number[]
}

export type CadKernelMeshSummary = {
  vertexCount: number
  triangleCount: number
  hasNormals: boolean
}

export type CadKernelBoxFeature = {
  origin: readonly number[]
  size: readonly number[]
}

export type CadKernelFeatureDSLExpression = number | string

export type CadKernelFeatureDSLNumberParameter = {
  type: 'number'
  default: number
  min?: number
  max?: number
}

export type CadKernelFeatureDSLParameter = CadKernelFeatureDSLNumberParameter

export type CadKernelFeatureDSLBoxFeature = {
  id: string
  type: 'box'
  origin?: readonly CadKernelFeatureDSLExpression[]
  size: readonly CadKernelFeatureDSLExpression[]
}

export type CadKernelFeatureDSLFeature = CadKernelFeatureDSLBoxFeature

export type CadKernelFeatureDSLDocument = {
  version: 1
  unit: string
  parameters?: Record<string, CadKernelFeatureDSLParameter>
  features: CadKernelFeatureDSLFeature[]
}

export type CadKernelFeatureDSLInput = {
  filename: string
  document: CadKernelFeatureDSLDocument
  parameterValues?: Record<string, number>
}

export type CadKernelTransformOperation = {
  id: string
  type: 'transform'
  modelId: string
  matrix: readonly number[]
}

export type CadKernelBoxUnionOperation = {
  id: string
  type: 'box-union'
  modelId: string
  box: CadKernelBoxFeature
}

export type CadKernelOperation = CadKernelTransformOperation | CadKernelBoxUnionOperation

export type CadKernelStepRoundTripRequest = {
  id: string
  type: 'step-round-trip'
  payload: {
    filename: string
    stepText: string
    operations?: CadKernelOperation[]
  }
}

export type CadKernelStepPreviewRequest = {
  id: string
  type: 'step-preview'
  payload: {
    filename: string
    stepText: string
    operations?: CadKernelOperation[]
  }
}

export type CadKernelStepAssemblyExportSource = {
  filename: string
  stepText: string
  operations?: CadKernelOperation[]
}

export type CadKernelStepAssemblyExportRequest = {
  id: string
  type: 'step-assembly-export'
  payload: {
    filename: string
    sources: CadKernelStepAssemblyExportSource[]
  }
}

export type CadKernelFeatureDSLPreviewRequest = {
  id: string
  type: 'feature-dsl-preview'
  payload: CadKernelFeatureDSLInput
}

export type CadKernelFeatureDSLExportRequest = {
  id: string
  type: 'feature-dsl-export'
  payload: CadKernelFeatureDSLInput
}

export type CadKernelRequest =
  | CadKernelStepRoundTripRequest
  | CadKernelStepPreviewRequest
  | CadKernelStepAssemblyExportRequest
  | CadKernelFeatureDSLPreviewRequest
  | CadKernelFeatureDSLExportRequest

export type CadKernelStepRoundTripResponse = {
  id: string
  type: 'step-round-trip-result'
  result: {
    mesh: CadKernelMesh
    meshSummary: CadKernelMeshSummary
    exportedStepText: string
  }
}

export type CadKernelStepPreviewResponse = {
  id: string
  type: 'step-preview-result'
  result: {
    mesh: CadKernelMesh
    componentMeshes?: CadKernelMesh[]
    meshSummary: CadKernelMeshSummary
  }
}

export type CadKernelStepAssemblyExportResponse = {
  id: string
  type: 'step-assembly-export-result'
  result: {
    exportedStepText: string
  }
}

export type CadKernelFeatureDSLPreviewResponse = {
  id: string
  type: 'feature-dsl-preview-result'
  result: {
    mesh: CadKernelMesh
    meshSummary: CadKernelMeshSummary
  }
}

export type CadKernelFeatureDSLExportResponse = {
  id: string
  type: 'feature-dsl-export-result'
  result: {
    exportedStepText: string
  }
}

export type CadKernelErrorResponse = {
  id: string
  type: 'error'
  error: string
}

export type CadKernelResponse =
  | CadKernelStepRoundTripResponse
  | CadKernelStepPreviewResponse
  | CadKernelStepAssemblyExportResponse
  | CadKernelFeatureDSLPreviewResponse
  | CadKernelFeatureDSLExportResponse
  | CadKernelErrorResponse

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function isCadKernelRequest(value: unknown): value is CadKernelRequest {
  if (
    !isRecord(value) ||
    (value.type !== 'step-round-trip' &&
      value.type !== 'step-preview' &&
      value.type !== 'step-assembly-export' &&
      value.type !== 'feature-dsl-preview' &&
      value.type !== 'feature-dsl-export') ||
    typeof value.id !== 'string'
  ) {
    return false
  }
  const payload = value.payload
  if (value.type === 'feature-dsl-preview' || value.type === 'feature-dsl-export') {
    return isCadKernelFeatureDSLInput(payload)
  }
  if (value.type === 'step-assembly-export') {
    return (
      isRecord(payload) &&
      typeof payload.filename === 'string' &&
      Array.isArray(payload.sources) &&
      payload.sources.length > 0 &&
      payload.sources.every(isCadKernelAssemblyExportSource)
    )
  }

  return (
    isRecord(payload) &&
    typeof payload.filename === 'string' &&
    typeof payload.stepText === 'string' &&
    isCadKernelOperations(payload.operations)
  )
}

function isCadKernelFeatureDSLInput(value: unknown): value is CadKernelFeatureDSLInput {
  return (
    isRecord(value) &&
    typeof value.filename === 'string' &&
    isCadKernelFeatureDSLDocument(value.document) &&
    isFeatureDSLParameterValues(value.parameterValues)
  )
}

function isCadKernelFeatureDSLDocument(value: unknown): value is CadKernelFeatureDSLDocument {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.unit === 'string' &&
    (value.parameters === undefined || (isRecord(value.parameters) && Object.values(value.parameters).every(isFeatureDSLParameter))) &&
    Array.isArray(value.features) &&
    value.features.length > 0 &&
    value.features.every(isFeatureDSLFeature)
  )
}

function isFeatureDSLParameter(value: unknown): value is CadKernelFeatureDSLParameter {
  return (
    isRecord(value) &&
    value.type === 'number' &&
    typeof value.default === 'number' &&
    Number.isFinite(value.default) &&
    (value.min === undefined || (typeof value.min === 'number' && Number.isFinite(value.min))) &&
    (value.max === undefined || (typeof value.max === 'number' && Number.isFinite(value.max)))
  )
}

function isFeatureDSLFeature(value: unknown): value is CadKernelFeatureDSLFeature {
  return isRecord(value) && value.type === 'box' && typeof value.id === 'string' && isFeatureDSLExpressionTuple(value.size, 3) && (value.origin === undefined || isFeatureDSLExpressionTuple(value.origin, 3))
}

function isFeatureDSLExpressionTuple(value: unknown, length: number): value is CadKernelFeatureDSLExpression[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => (typeof entry === 'number' && Number.isFinite(entry)) || typeof entry === 'string')
  )
}

function isFeatureDSLParameterValues(value: unknown): value is Record<string, number> | undefined {
  if (value === undefined) {
    return true
  }
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

function isCadKernelAssemblyExportSource(value: unknown): value is CadKernelStepAssemblyExportSource {
  return (
    isRecord(value) &&
    typeof value.filename === 'string' &&
    typeof value.stepText === 'string' &&
    isCadKernelOperations(value.operations)
  )
}

function isCadKernelOperations(value: unknown): value is CadKernelOperation[] | undefined {
  if (value === undefined) {
    return true
  }
  return Array.isArray(value) && value.every(isCadKernelOperation)
}

function isCadKernelOperation(value: unknown): value is CadKernelOperation {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.modelId !== 'string') {
    return false
  }
  if (value.type === 'box-union') {
    return isCadKernelBoxFeature(value.box)
  }
  return (
    value.type === 'transform' &&
    Array.isArray(value.matrix) &&
    value.matrix.length === 16 &&
    value.matrix.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function isCadKernelBoxFeature(value: unknown): value is CadKernelBoxFeature {
  if (!isRecord(value) || !isFiniteNumberTuple(value.origin, 3) || !isFiniteNumberTuple(value.size, 3)) {
    return false
  }
  return value.size.every((entry) => entry > 0)
}

function isFiniteNumberTuple(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

export function summarizeCadKernelMesh(mesh: CadKernelMesh): CadKernelMeshSummary {
  return {
    vertexCount: Math.floor(mesh.positions.length / 3),
    triangleCount: Math.floor(mesh.indices.length / 3),
    hasNormals: mesh.normals.length > 0,
  }
}

export function cadKernelErrorResponse(id: string, error: unknown): CadKernelErrorResponse {
  return {
    id,
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
  }
}
