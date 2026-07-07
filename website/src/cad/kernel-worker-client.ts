import type {
  CadKernelResponse,
  CadKernelStepRoundTripRequest,
  CadKernelStepRoundTripResponse,
} from './kernel-protocol'
import type { CadKernelStepRoundTripInput } from './opencascade-step'

export type CadKernelWorkerLike = {
  addEventListener: (type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) => void
  postMessage: (message: unknown) => void
  terminate: () => void
}

export type CadKernelWorkerResult = CadKernelStepRoundTripResponse['result']

const createWorker = (): CadKernelWorkerLike => new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })

export function runStepRoundTripInWorker(
  input: CadKernelStepRoundTripInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
): Promise<CadKernelWorkerResult> {
  const worker = workerFactory()
  const request: CadKernelStepRoundTripRequest = {
    id: createRequestID(),
    type: 'step-round-trip',
    payload: input,
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
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
