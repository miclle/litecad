import type { OpenSCADCompileRequest, OpenSCADCompileResult, OpenSCADResponse } from './openscad-protocol'

export type OpenSCADWorkerLike = {
  addEventListener: (type: 'message', listener: (event: MessageEvent<OpenSCADResponse>) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent<OpenSCADResponse>) => void) => void
  postMessage: (message: unknown) => void
  terminate: () => void
}

export type OpenSCADCompileInput = {
  code: string
  parameterValues?: Record<string, string | number | boolean>
}

export type OpenSCADWorkerOptions = {
  timeoutMs?: number
}

const createWorker = (): OpenSCADWorkerLike => new Worker(new URL('./openscad.worker.ts', import.meta.url), { type: 'module' })

export function compileOpenSCADInWorker(
  input: OpenSCADCompileInput,
  workerFactory: () => OpenSCADWorkerLike = createWorker,
  options: OpenSCADWorkerOptions = {},
): Promise<OpenSCADCompileResult> {
  const request: OpenSCADCompileRequest = {
    id: createRequestID(),
    type: 'openscad-compile',
    payload: {
      ...input,
      output: 'preview',
    },
  }
  return runOpenSCADRequestInWorker(request, workerFactory, options)
}

function runOpenSCADRequestInWorker(
  request: OpenSCADCompileRequest,
  workerFactory: () => OpenSCADWorkerLike,
  options: OpenSCADWorkerOptions,
): Promise<OpenSCADCompileResult> {
  const worker = workerFactory()
  return new Promise((resolve, reject) => {
    const timeoutId =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            cleanup()
            reject(new Error(`OpenSCAD worker timed out after ${options.timeoutMs}ms`))
          }, options.timeoutMs)
        : undefined
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      worker.removeEventListener('message', handleMessage)
      worker.terminate()
    }
    const handleMessage = (event: MessageEvent<OpenSCADResponse>) => {
      const response = event.data
      if (response.id !== request.id) {
        return
      }
      cleanup()
      if (response.type === 'error') {
        reject(new Error(response.error))
        return
      }
      resolve(response.result)
    }

    worker.addEventListener('message', handleMessage)
    worker.postMessage(request)
  })
}

function createRequestID() {
  return globalThis.crypto?.randomUUID?.() ?? `openscad_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
