import { createCadKernelWorkerHandler } from './kernel-worker-handler'
import { runOpenCascadeStepPreview, runOpenCascadeStepRoundTrip } from './opencascade-step'

const handler = createCadKernelWorkerHandler({
  runStepPreview: runOpenCascadeStepPreview,
  runStepRoundTrip: runOpenCascadeStepRoundTrip,
  postMessage: (message) => self.postMessage(message),
})

self.addEventListener('message', (event) => {
  void handler(event.data)
})
