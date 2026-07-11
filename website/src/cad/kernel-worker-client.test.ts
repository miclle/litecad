import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  runFeatureDSLExportInWorker,
  runFeatureDSLPreviewInWorker,
  runStepAssemblyExportInWorker,
  runStepPreviewInWorker,
  runStepRoundTripInWorker,
  type CadKernelWorkerLike,
} from './kernel-worker-client'
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

afterEach(() => {
  vi.useRealTimers()
})

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

describe('runStepPreviewInWorker', () => {
  it('posts a step-preview request and resolves mesh buffers', async () => {
    const worker = new FakeWorker()
    const resultPromise = runStepPreviewInWorker(
      { filename: 'part.step', stepText: 'ISO-10303-21;' },
      () => worker,
    )

    expect(worker.postedMessages).toHaveLength(1)
    const request = worker.postedMessages[0]
    expect(request).toMatchObject({
      type: 'step-preview',
      payload: { filename: 'part.step', stepText: 'ISO-10303-21;' },
    })

    worker.reply({
      id: (request as { id: string }).id,
      type: 'step-preview-result',
      result: {
        mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
        meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
      },
    })

    await expect(resultPromise).resolves.toMatchObject({
      meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
    })
    expect(worker.terminated).toBe(true)
  })

  it('posts replayable CAD operations with step-preview requests', async () => {
    const worker = new FakeWorker()
    const operations = [
      {
        id: 'op_01test',
        type: 'transform' as const,
        modelId: 'mdl_01test',
        matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1],
      },
    ]
    const resultPromise = runStepPreviewInWorker(
      { filename: 'part.step', stepText: 'ISO-10303-21;', operations },
      () => worker,
    )

    expect(worker.postedMessages).toHaveLength(1)
    const request = worker.postedMessages[0]
    expect(request).toMatchObject({
      type: 'step-preview',
      payload: { filename: 'part.step', stepText: 'ISO-10303-21;', operations },
    })

    worker.reply({
      id: (request as { id: string }).id,
      type: 'step-preview-result',
      result: {
        mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
        meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
      },
    })

    await expect(resultPromise).resolves.toMatchObject({
      meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
    })
  })

  it('rejects and terminates the worker when a preview request times out', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const resultPromise = runStepPreviewInWorker(
      { filename: 'part.step', stepText: 'ISO-10303-21;' },
      () => worker,
      { timeoutMs: 100 },
    )
    const rejectionExpectation = expect(resultPromise).rejects.toThrow('CAD kernel worker timed out after 100ms')

    await vi.advanceTimersByTimeAsync(100)

    await rejectionExpectation
    expect(worker.terminated).toBe(true)
  })
})

describe('runStepAssemblyExportInWorker', () => {
  it('posts a step-assembly-export request and resolves exported STEP text', async () => {
    const worker = new FakeWorker()
    const resultPromise = runStepAssemblyExportInWorker(
      {
        filename: 'assembly.step',
        sources: [
          { filename: 'part-a.step', stepText: 'ISO-10303-21;' },
          { filename: 'part-b.step', stepText: 'ISO-10303-21;' },
        ],
      },
      () => worker,
    )

    expect(worker.postedMessages).toHaveLength(1)
    const request = worker.postedMessages[0]
    expect(request).toMatchObject({
      type: 'step-assembly-export',
      payload: {
        filename: 'assembly.step',
        sources: [
          { filename: 'part-a.step', stepText: 'ISO-10303-21;' },
          { filename: 'part-b.step', stepText: 'ISO-10303-21;' },
        ],
      },
    })

    worker.reply({
      id: (request as { id: string }).id,
      type: 'step-assembly-export-result',
      result: {
        exportedStepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
      },
    })

    await expect(resultPromise).resolves.toEqual({
      exportedStepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
    })
    expect(worker.terminated).toBe(true)
  })
})

describe('runFeatureDSLPreviewInWorker', () => {
  it('posts a feature-dsl-preview request and resolves mesh buffers', async () => {
    const worker = new FakeWorker()
    const document = {
      version: 1 as const,
      unit: 'millimetre',
      parameters: {
        width: { type: 'number' as const, default: 80 },
      },
      features: [{ id: 'base', type: 'box' as const, size: ['width', 40, 6] }],
    }
    const resultPromise = runFeatureDSLPreviewInWorker(
      { filename: 'generated.litecad.json', document, parameterValues: { width: 96 } },
      () => worker,
    )

    expect(worker.postedMessages).toHaveLength(1)
    const request = worker.postedMessages[0]
    expect(request).toMatchObject({
      type: 'feature-dsl-preview',
      payload: { filename: 'generated.litecad.json', document, parameterValues: { width: 96 } },
    })

    worker.reply({
      id: (request as { id: string }).id,
      type: 'feature-dsl-preview-result',
      result: {
        mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
        meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
      },
    })

    await expect(resultPromise).resolves.toMatchObject({
      meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
    })
    expect(worker.terminated).toBe(true)
  })
})

describe('runFeatureDSLExportInWorker', () => {
  it('posts a feature-dsl-export request and resolves exported STEP text', async () => {
    const worker = new FakeWorker()
    const document = {
      version: 1 as const,
      unit: 'millimetre',
      parameters: {
        width: { type: 'number' as const, default: 80 },
      },
      features: [{ id: 'base', type: 'box' as const, size: ['width', 40, 6] }],
    }
    const resultPromise = runFeatureDSLExportInWorker(
      { filename: 'generated.step', document, parameterValues: { width: 96 } },
      () => worker,
    )

    expect(worker.postedMessages).toHaveLength(1)
    const request = worker.postedMessages[0]
    expect(request).toMatchObject({
      type: 'feature-dsl-export',
      payload: { filename: 'generated.step', document, parameterValues: { width: 96 } },
    })

    worker.reply({
      id: (request as { id: string }).id,
      type: 'feature-dsl-export-result',
      result: {
        exportedStepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
      },
    })

    await expect(resultPromise).resolves.toEqual({
      exportedStepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
    })
    expect(worker.terminated).toBe(true)
  })
})
