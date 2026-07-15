import type {
  CadKernelFeatureDSLExportRequest,
  CadKernelFeatureDSLExportResponse,
  CadKernelFeatureDSLPreviewRequest,
  CadKernelFeatureDSLPreviewResponse,
  CadKernelResponse,
  CadKernelSectionGeometryRequest,
  CadKernelSectionGeometryResponse,
  CadKernelShapeInspectionRequest,
  CadKernelShapeInspectionResponse,
  CadKernelStepAssemblyExportRequest,
  CadKernelStepAssemblyExportResponse,
  CadKernelStepPreviewRequest,
  CadKernelStepPreviewResponse,
  CadKernelStepRoundTripRequest,
  CadKernelStepRoundTripResponse,
} from './kernel-protocol'
import type {
  CadKernelFeatureDSLExportInput,
  CadKernelFeatureDSLPreviewInput,
  CadKernelStepAssemblyExportInput,
  CadKernelStepPreviewInput,
  CadKernelStepRoundTripInput,
  CadKernelSectionGeometryInput,
  CadKernelShapeInspectionInput,
} from './opencascade-step'

export type CadKernelWorkerLike = {
  addEventListener: (type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) => void
  postMessage: (message: unknown) => void
  terminate: () => void
}

export type CadKernelWorkerResult = CadKernelStepRoundTripResponse['result']
export type CadKernelWorkerPreviewResult = CadKernelStepPreviewResponse['result']
export type CadKernelWorkerAssemblyExportResult = CadKernelStepAssemblyExportResponse['result']
export type CadKernelWorkerFeatureDSLPreviewResult = CadKernelFeatureDSLPreviewResponse['result']
export type CadKernelWorkerFeatureDSLExportResult = CadKernelFeatureDSLExportResponse['result']
export type CadKernelWorkerSectionGeometryResult = CadKernelSectionGeometryResponse['result']
export type CadKernelWorkerShapeInspectionResult = CadKernelShapeInspectionResponse['result']
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

export function runSectionGeometryInWorker(
  input: CadKernelSectionGeometryInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerSectionGeometryResult> {
  const request: CadKernelSectionGeometryRequest = {
    id: createRequestID(),
    type: 'section-geometry',
    payload: input,
  }
  return runCadKernelRequestInWorker(request, workerFactory, options)
}

export function runShapeInspectionInWorker(
  input: CadKernelShapeInspectionInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerShapeInspectionResult> {
  const request: CadKernelShapeInspectionRequest = {
    id: createRequestID(),
    type: 'shape-inspection',
    payload: input,
  }
  return runCadKernelRequestInWorker(request, workerFactory, options)
}

export function runFeatureDSLPreviewInWorker(
  input: CadKernelFeatureDSLPreviewInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerFeatureDSLPreviewResult> {
  const request: CadKernelFeatureDSLPreviewRequest = {
    id: createRequestID(),
    type: 'feature-dsl-preview',
    payload: input,
  }
  return runCadKernelRequestInWorker(request, workerFactory, options)
}

export function runFeatureDSLExportInWorker(
  input: CadKernelFeatureDSLExportInput,
  workerFactory: () => CadKernelWorkerLike = createWorker,
  options: CadKernelWorkerOptions = {},
): Promise<CadKernelWorkerFeatureDSLExportResult> {
  const request: CadKernelFeatureDSLExportRequest = {
    id: createRequestID(),
    type: 'feature-dsl-export',
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
  request: CadKernelFeatureDSLPreviewRequest,
  workerFactory: () => CadKernelWorkerLike,
  options?: CadKernelWorkerOptions,
): Promise<CadKernelWorkerFeatureDSLPreviewResult>
function runCadKernelRequestInWorker(
  request: CadKernelFeatureDSLExportRequest,
  workerFactory: () => CadKernelWorkerLike,
  options?: CadKernelWorkerOptions,
): Promise<CadKernelWorkerFeatureDSLExportResult>
function runCadKernelRequestInWorker(
  request: CadKernelSectionGeometryRequest,
  workerFactory: () => CadKernelWorkerLike,
  options?: CadKernelWorkerOptions,
): Promise<CadKernelWorkerSectionGeometryResult>
function runCadKernelRequestInWorker(
  request: CadKernelShapeInspectionRequest,
  workerFactory: () => CadKernelWorkerLike,
  options?: CadKernelWorkerOptions,
): Promise<CadKernelWorkerShapeInspectionResult>
function runCadKernelRequestInWorker(
  request:
    | CadKernelStepRoundTripRequest
    | CadKernelStepPreviewRequest
    | CadKernelStepAssemblyExportRequest
    | CadKernelFeatureDSLPreviewRequest
    | CadKernelFeatureDSLExportRequest
    | CadKernelSectionGeometryRequest
    | CadKernelShapeInspectionRequest,
  workerFactory: () => CadKernelWorkerLike,
  options: CadKernelWorkerOptions = {},
): Promise<
  | CadKernelWorkerResult
  | CadKernelWorkerPreviewResult
  | CadKernelWorkerAssemblyExportResult
  | CadKernelWorkerFeatureDSLPreviewResult
  | CadKernelWorkerFeatureDSLExportResult
  | CadKernelWorkerSectionGeometryResult
  | CadKernelWorkerShapeInspectionResult
> {
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
