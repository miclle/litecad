import type {
  CadKernelResponse,
  CadKernelStepAssemblyExportRequest,
  CadKernelStepAssemblyExportResponse,
  CadKernelStepPreviewRequest,
  CadKernelStepPreviewResponse,
  CadKernelStepRoundTripRequest,
  CadKernelStepRoundTripResponse,
} from './kernel-protocol'
import type { CadKernelStepAssemblyExportInput, CadKernelStepPreviewInput, CadKernelStepRoundTripInput } from './opencascade-step'

export type CadKernelWorkerLike = {
  addEventListener: (type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) => void
  postMessage: (message: unknown) => void
  terminate: () => void
}

export type CadKernelWorkerResult = CadKernelStepRoundTripResponse['result']
export type CadKernelWorkerPreviewResult = CadKernelStepPreviewResponse['result']
export type CadKernelWorkerAssemblyExportResult = CadKernelStepAssemblyExportResponse['result']
export type CadKernelWorkerOptions = {
  timeoutMs?: number
}

const createWorker = (): CadKernelWorkerLike => new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })

export function runStepRoundTripInWorker(
  input: CadKernelStepRoundTripInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerResult> {
  const request: CadKernelStepRoundTripRequest = {
    id: createRequestID(),
    type: 'step-round-trip',
    payload: input,
  }
  return runCadKernelRequestInWorker(request, workerFactory, options)
}

export function runStepPreviewInWorker(
  input: CadKernelStepPreviewInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerPreviewResult> {
  const request: CadKernelStepPreviewRequest = {
    id: createRequestID(),
    type: 'step-preview',
    payload: input,
  }
  return runCadKernelRequestInWorker(request, workerFactory, options)
}

export function runStepAssemblyExportInWorker(
  input: CadKernelStepAssemblyExportInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerAssemblyExportResult> {
  const request: CadKernelStepAssemblyExportRequest = {
    id: createRequestID(),
    type: 'step-assembly-export',
    payload: input,
  }
  return runCadKernelRequestInWorker(request, workerFactory, options)
}

function runCadKernelRequestInWorker(
  request: CadKernelStepRoundTripRequest,
  workerFactory: () => CadKernelWorkerLike,
  options?: CadKernelWorkerOptions,
): Promise<CadKernelWorkerResult>
function runCadKernelRequestInWorker(
  request: CadKernelStepPreviewRequest,
  workerFactory: () => CadKernelWorkerLike,
  options?: CadKernelWorkerOptions,
): Promise<CadKernelWorkerPreviewResult>
function runCadKernelRequestInWorker(
  request: CadKernelStepAssemblyExportRequest,
  workerFactory: () => CadKernelWorkerLike,
  options?: CadKernelWorkerOptions,
): Promise<CadKernelWorkerAssemblyExportResult>
function runCadKernelRequestInWorker(
  request: CadKernelStepRoundTripRequest | CadKernelStepPreviewRequest | CadKernelStepAssemblyExportRequest,
  workerFactory: () => CadKernelWorkerLike,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerResult | CadKernelWorkerPreviewResult | CadKernelWorkerAssemblyExportResult> {
  const worker = workerFactory()
  return new Promise((resolve, reject) => {
    const timeoutId =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            cleanup()
            reject(new Error(`CAD kernel worker timed out after ${options.timeoutMs}ms`))
          }, options.timeoutMs)
        : undefined
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      worker.removeEventListener('message', handleMessage)
      worker.terminate()
    }
    const handleMessage = (event: MessageEvent<CadKernelResponse>) => {
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
  return globalThis.crypto?.randomUUID?.() ?? `cad_kernel_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
