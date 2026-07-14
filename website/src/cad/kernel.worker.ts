import { createCadKernelWorkerHandler } from './kernel-worker-handler'
import {
  runOpenCascadeFeatureDSLExport,
  runOpenCascadeFeatureDSLPreview,
  runOpenCascadeSectionGeometry,
  runOpenCascadeStepAssemblyExport,
  runOpenCascadeStepPreview,
  runOpenCascadeStepRoundTrip,
} from './opencascade-step'

const handler = createCadKernelWorkerHandler({
  runFeatureDSLExport: runOpenCascadeFeatureDSLExport,
  runFeatureDSLPreview: runOpenCascadeFeatureDSLPreview,
  runSectionGeometry: runOpenCascadeSectionGeometry,
  runStepAssemblyExport: runOpenCascadeStepAssemblyExport,
  runStepPreview: runOpenCascadeStepPreview,
  runStepRoundTrip: runOpenCascadeStepRoundTrip,
  postMessage: (message) => self.postMessage(message),
})

self.addEventListener('message', (event) => {
  void handler(event.data)
})
