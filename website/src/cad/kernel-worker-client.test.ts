import { describe, expect, it } from 'vitest'

import { runStepRoundTripInWorker, type CadKernelWorkerLike } from './kernel-worker-client'
import type { CadKernelResponse } from './kernel-protocol'

class FakeWorker implements CadKernelWorkerLike {
  postedMessages: unknown[] = []
  terminated = false
  private messageListener?: (event: MessageEvent<CadKernelResponse>) => void

  addEventListener(_type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) {
    this.messageListener = listener
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<CadKernelResponse>) => void) {
    if (this.messageListener === listener) {
      this.messageListener = undefined
    }
  }

  postMessage(message: unknown) {
    this.postedMessages.push(message)
  }

  terminate() {
    this.terminated = true
  }

  reply(message: CadKernelResponse) {
    this.messageListener?.({ data: message } as MessageEvent<CadKernelResponse>)
  }
}

describe('runStepRoundTripInWorker', () => {
  it('posts a step-round-trip request and resolves the matching worker result', async () => {
    const worker = new FakeWorker()
    const resultPromise = runStepRoundTripInWorker(
      { filename: 'part.step', stepText: 'ISO-10303-21;' },
      () => worker,
    )

    expect(worker.postedMessages).toHaveLength(1)
    const request = worker.postedMessages[0]
    expect(request).toMatchObject({
      type: 'step-round-trip',
      payload: { filename: 'part.step', stepText: 'ISO-10303-21;' },
    })

    worker.reply({
      id: (request as { id: string }).id,
      type: 'step-round-trip-result',
      result: {
        mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
        meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
        exportedStepText: 'ISO-10303-21;',
      },
    })

    await expect(resultPromise).resolves.toMatchObject({
      meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
      exportedStepText: 'ISO-10303-21;',
    })
    expect(worker.terminated).toBe(true)
  })
})
