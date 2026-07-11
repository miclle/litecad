import { createOpenSCADWorkerHandler } from './openscad-worker-handler'

const handler = createOpenSCADWorkerHandler({
  postMessage: (message) => self.postMessage(message),
})

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  void handler(event.data)
})
