import { createCadKernelWorkerHandler } from './kernel-worker-handler'
import { runOpenCascadeStepRoundTrip } from './opencascade-step'

const handler = createCadKernelWorkerHandler({
  runStepRoundTrip: runOpenCascadeStepRoundTrip,
  postMessage: (message) => self.postMessage(message),
})

self.addEventListener('message', (event) => {
  void handler(event.data)
})
