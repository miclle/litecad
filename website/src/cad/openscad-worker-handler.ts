import { isOpenSCADCompileRequest, openscadErrorResponse, type OpenSCADCompileResult, type OpenSCADResponse } from './openscad-protocol'

type OpenSCADWorkerHandlerOptions = {
  compileOpenSCAD?: (input: { code: string; parameterValues?: Record<string, string | number | boolean> }) => Promise<OpenSCADCompileResult>
  postMessage: (message: OpenSCADResponse) => void
}

export function createOpenSCADWorkerHandler({ compileOpenSCAD, postMessage }: OpenSCADWorkerHandlerOptions) {
  return async (message: unknown) => {
    if (!isOpenSCADCompileRequest(message)) {
      postMessage(openscadErrorResponse('unknown', 'Invalid OpenSCAD worker request'))
      return
    }
    if (!compileOpenSCAD) {
      postMessage(openscadErrorResponse(message.id, 'OpenSCAD runtime is not configured'))
      return
    }

    try {
      const result = await compileOpenSCAD({
        code: message.payload.code,
        parameterValues: message.payload.parameterValues,
      })
      postMessage({
        id: message.id,
        type: 'openscad-compile-result',
        result,
      })
    } catch (error) {
      postMessage(openscadErrorResponse(message.id, error))
    }
  }
}
