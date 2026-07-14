import {
  cadKernelErrorResponse,
  isCadKernelRequest,
  summarizeCadKernelMesh,
  type CadKernelResponse,
} from './kernel-protocol'
import type {
  CadKernelFeatureDSLExportInput,
  CadKernelFeatureDSLExportResult,
  CadKernelFeatureDSLPreviewInput,
  CadKernelFeatureDSLPreviewResult,
  CadKernelSectionGeometryInput,
  CadKernelSectionGeometryResult,
  CadKernelStepAssemblyExportInput,
  CadKernelStepAssemblyExportResult,
  CadKernelStepPreviewInput,
  CadKernelStepPreviewResult,
  CadKernelStepRoundTripInput,
  CadKernelStepRoundTripResult,
} from './opencascade-step'

type CadKernelWorkerHandlerOptions = {
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelFeatureDSLExportResult>
  runFeatureDSLPreview: (input: CadKernelFeatureDSLPreviewInput) => Promise<CadKernelFeatureDSLPreviewResult>
  runSectionGeometry?: (input: CadKernelSectionGeometryInput) => Promise<CadKernelSectionGeometryResult>
  runStepAssemblyExport: (input: CadKernelStepAssemblyExportInput) => Promise<CadKernelStepAssemblyExportResult>
  runStepPreview: (input: CadKernelStepPreviewInput) => Promise<CadKernelStepPreviewResult>
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelStepRoundTripResult>
  postMessage: (message: CadKernelResponse) => void
}

export function createCadKernelWorkerHandler({
  runFeatureDSLExport,
  runFeatureDSLPreview,
  runSectionGeometry,
  runStepAssemblyExport,
  runStepPreview,
  runStepRoundTrip,
  postMessage,
}: CadKernelWorkerHandlerOptions) {
  return async (message: unknown) => {
    if (!isCadKernelRequest(message)) {
      postMessage(cadKernelErrorResponse('unknown', 'Invalid CAD kernel worker request'))
      return
    }

    try {
      if (message.type === 'feature-dsl-preview') {
        const result = await runFeatureDSLPreview(message.payload)
        postMessage({
          id: message.id,
          type: 'feature-dsl-preview-result',
          result: {
            ...result,
            meshSummary: summarizeCadKernelMesh(result.mesh),
          },
        })
        return
      }

      if (message.type === 'feature-dsl-export') {
        const result = await runFeatureDSLExport(message.payload)
        postMessage({
          id: message.id,
          type: 'feature-dsl-export-result',
          result,
        })
        return
      }

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

      if (message.type === 'step-assembly-export') {
        const result = await runStepAssemblyExport(message.payload)
        postMessage({
          id: message.id,
          type: 'step-assembly-export-result',
          result,
        })
        return
      }

      if (message.type === 'section-geometry') {
        if (!runSectionGeometry) {
          throw new Error('Section geometry is unavailable')
        }
        const result = await runSectionGeometry(message.payload)
        postMessage({
          id: message.id,
          type: 'section-geometry-result',
          result,
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
