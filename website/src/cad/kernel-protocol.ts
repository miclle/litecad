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

export type CadKernelOperation = {
  id: string
  type: 'transform'
  modelId: string
  matrix: readonly number[]
}

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
  return (
    isRecord(value) &&
    value.type === 'transform' &&
    typeof value.id === 'string' &&
    typeof value.modelId === 'string' &&
    Array.isArray(value.matrix) &&
    value.matrix.length === 16 &&
    value.matrix.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
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
