import {
  cadKernelErrorResponse,
  isCadKernelRequest,
  summarizeCadKernelMesh,
  type CadKernelResponse,
} from './kernel-protocol'
import type {
  CadKernelStepPreviewInput,
  CadKernelStepPreviewResult,
  CadKernelStepRoundTripInput,
  CadKernelStepRoundTripResult,
} from './opencascade-step'

type CadKernelWorkerHandlerOptions = {
  runStepPreview: (input: CadKernelStepPreviewInput) => Promise<CadKernelStepPreviewResult>
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelStepRoundTripResult>
  postMessage: (message: CadKernelResponse) => void
}

export function createCadKernelWorkerHandler({ runStepPreview, runStepRoundTrip, postMessage }: CadKernelWorkerHandlerOptions) {
  return async (message: unknown) => {
    if (!isCadKernelRequest(message)) {
      postMessage(cadKernelErrorResponse('unknown', 'Invalid CAD kernel worker request'))
      return
    }

    try {
      if (message.type === 'step-preview') {
        const result = await runStepPreview(message.payload)
        postMessage({
          id: message.id,
          type: 'step-preview-result',
          result: {
            ...result,
            meshSummary: summarizeCadKernelMesh(result.mesh),
          },
        })
        return
      }

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
