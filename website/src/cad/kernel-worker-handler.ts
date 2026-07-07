import {
  cadKernelErrorResponse,
  isCadKernelRequest,
  summarizeCadKernelMesh,
  type CadKernelResponse,
} from './kernel-protocol'
import type { CadKernelStepRoundTripInput, CadKernelStepRoundTripResult } from './opencascade-step'

type CadKernelWorkerHandlerOptions = {
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelStepRoundTripResult>
  postMessage: (message: CadKernelResponse) => void
}

export function createCadKernelWorkerHandler({ runStepRoundTrip, postMessage }: CadKernelWorkerHandlerOptions) {
  return async (message: unknown) => {
    if (!isCadKernelRequest(message)) {
      postMessage(cadKernelErrorResponse('unknown', 'Invalid CAD kernel worker request'))
      return
    }

    try {
      const result = await runStepRoundTrip(message.payload)
      postMessage({
        id: message.id,
        type: 'step-round-trip-result',
        result: {
          ...result,
          meshSummary: summarizeCadKernelMesh(result.mesh),
        },
      })
    } catch (error) {
      postMessage(cadKernelErrorResponse(message.id, error))
    }
  }
}
