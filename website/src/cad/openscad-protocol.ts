export type OpenSCADParameterValue = string | number | boolean

export type OpenSCADCompileRequest = {
  id: string
  type: 'openscad-compile'
  payload: {
    code: string
    parameterValues?: Record<string, OpenSCADParameterValue>
    output?: 'preview'
  }
}

export type OpenSCADCompileResult = {
  output: 'preview'
  bytes: Uint8Array
  stdout: string
  stderr: string
  durationMs: number
}

export type OpenSCADCompileResponse = {
  id: string
  type: 'openscad-compile-result'
  result: OpenSCADCompileResult
}

export type OpenSCADErrorResponse = {
  id: string
  type: 'error'
  error: string
}

export type OpenSCADResponse = OpenSCADCompileResponse | OpenSCADErrorResponse

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function isOpenSCADCompileRequest(value: unknown): value is OpenSCADCompileRequest {
  if (!isRecord(value) || value.type !== 'openscad-compile' || typeof value.id !== 'string') {
    return false
  }
  const payload = value.payload
  return (
    isRecord(payload) &&
    typeof payload.code === 'string' &&
    payload.code.trim() !== '' &&
    (payload.output === undefined || payload.output === 'preview') &&
    isOpenSCADParameterValues(payload.parameterValues)
  )
}

function isOpenSCADParameterValues(value: unknown): value is Record<string, OpenSCADParameterValue> | undefined {
  if (value === undefined) {
    return true
  }
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')
  )
}

export function openscadErrorResponse(id: string, error: unknown): OpenSCADErrorResponse {
  return {
    id,
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
  }
}
