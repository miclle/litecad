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

export type CadKernelRequest = CadKernelStepRoundTripRequest | CadKernelStepPreviewRequest

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
    meshSummary: CadKernelMeshSummary
  }
}

export type CadKernelErrorResponse = {
  id: string
  type: 'error'
  error: string
}

export type CadKernelResponse = CadKernelStepRoundTripResponse | CadKernelStepPreviewResponse | CadKernelErrorResponse

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function isCadKernelRequest(value: unknown): value is CadKernelRequest {
  if (
    !isRecord(value) ||
    (value.type !== 'step-round-trip' && value.type !== 'step-preview') ||
    typeof value.id !== 'string'
  ) {
    return false
  }
  const payload = value.payload
  return (
    isRecord(payload) &&
    typeof payload.filename === 'string' &&
    typeof payload.stepText === 'string' &&
    isCadKernelOperations(payload.operations)
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
