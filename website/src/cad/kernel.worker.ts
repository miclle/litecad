import { createCadKernelWorkerHandler } from './kernel-worker-handler'
import { runOpenCascadeStepAssemblyExport, runOpenCascadeStepPreview, runOpenCascadeStepRoundTrip } from './opencascade-step'

const handler = createCadKernelWorkerHandler({
  runStepAssemblyExport: runOpenCascadeStepAssemblyExport,
  runStepPreview: runOpenCascadeStepPreview,
  runStepRoundTrip: runOpenCascadeStepRoundTrip,
  postMessage: (message) => self.postMessage(message),
})

self.addEventListener('message', (event) => {
  void handler(event.data)
})
