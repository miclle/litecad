import { createCadKernelWorkerHandler } from './kernel-worker-handler'
import {
  runOpenCascadeFeatureDSLExport,
  runOpenCascadeFeatureDSLPreview,
  runOpenCascadeStepAssemblyExport,
  runOpenCascadeStepPreview,
  runOpenCascadeStepRoundTrip,
} from './opencascade-step'

const handler = createCadKernelWorkerHandler({
  runFeatureDSLExport: runOpenCascadeFeatureDSLExport,
  runFeatureDSLPreview: runOpenCascadeFeatureDSLPreview,
  runStepAssemblyExport: runOpenCascadeStepAssemblyExport,
  runStepPreview: runOpenCascadeStepPreview,
  runStepRoundTrip: runOpenCascadeStepRoundTrip,
  postMessage: (message) => self.postMessage(message),
})

self.addEventListener('message', (event) => {
  void handler(event.data)
})
