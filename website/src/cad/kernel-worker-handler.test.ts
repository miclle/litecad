import { describe, expect, test, vi } from 'vitest'

import { createCadKernelWorkerHandler } from './kernel-worker-handler'
import type { CadKernelStepPreviewResult, CadKernelStepRoundTripResult } from './opencascade-step'

describe('CAD kernel worker handler', () => {
  test('runs a valid STEP round-trip request and posts the result', async () => {
    const result: CadKernelStepRoundTripResult = {
      mesh: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
      },
      exportedStepText: 'ISO-10303-21;END-ISO-10303-21;',
    }
    const runStepPreview = vi.fn()
    const runStepRoundTrip = vi.fn(async () => result)
    const postMessage = vi.fn()
    const handler = createCadKernelWorkerHandler({ runStepPreview, runStepRoundTrip, postMessage })

    await handler({
      id: 'job-1',
      type: 'step-round-trip',
      payload: {
        filename: 'part.step',
        stepText: 'ISO-10303-21;END-ISO-10303-21;',
      },
    })

    expect(runStepPreview).not.toHaveBeenCalled()
    expect(runStepRoundTrip).toHaveBeenCalledWith({
      filename: 'part.step',
      stepText: 'ISO-10303-21;END-ISO-10303-21;',
    })
    expect(postMessage).toHaveBeenCalledWith({
      id: 'job-1',
      type: 'step-round-trip-result',
      result: {
        ...result,
        meshSummary: {
          vertexCount: 3,
          triangleCount: 1,
          hasNormals: true,
        },
      },
    })
  })

  test('runs a valid STEP preview request without exporting STEP', async () => {
    const result: CadKernelStepPreviewResult = {
      mesh: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
      },
    }
    const runStepPreview = vi.fn(async () => result)
    const runStepRoundTrip = vi.fn()
    const postMessage = vi.fn()
    const handler = createCadKernelWorkerHandler({ runStepPreview, runStepRoundTrip, postMessage })

    await handler({
      id: 'job-preview',
      type: 'step-preview',
      payload: {
        filename: 'part.step',
        stepText: 'ISO-10303-21;END-ISO-10303-21;',
      },
    })

    expect(runStepPreview).toHaveBeenCalledWith({
      filename: 'part.step',
      stepText: 'ISO-10303-21;END-ISO-10303-21;',
    })
    expect(runStepRoundTrip).not.toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({
      id: 'job-preview',
      type: 'step-preview-result',
      result: {
        ...result,
        meshSummary: {
          vertexCount: 3,
          triangleCount: 1,
          hasNormals: true,
        },
      },
    })
  })

  test('rejects invalid requests before invoking the kernel', async () => {
    const runStepPreview = vi.fn()
    const runStepRoundTrip = vi.fn()
    const postMessage = vi.fn()
    const handler = createCadKernelWorkerHandler({ runStepPreview, runStepRoundTrip, postMessage })

    await handler({ id: 'job-1', type: 'step-round-trip', payload: { filename: 'part.step' } })

    expect(runStepPreview).not.toHaveBeenCalled()
    expect(runStepRoundTrip).not.toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({
      id: 'unknown',
      type: 'error',
      error: 'Invalid CAD kernel worker request',
    })
  })

  test('returns kernel failures as structured worker errors', async () => {
    const runStepPreview = vi.fn()
    const runStepRoundTrip = vi.fn(async () => {
      throw new Error('STEP import failed')
    })
    const postMessage = vi.fn()
    const handler = createCadKernelWorkerHandler({ runStepPreview, runStepRoundTrip, postMessage })

    await handler({
      id: 'job-2',
      type: 'step-round-trip',
      payload: {
        filename: 'bad.step',
        stepText: 'broken',
      },
    })

    expect(postMessage).toHaveBeenCalledWith({
      id: 'job-2',
      type: 'error',
      error: 'STEP import failed',
    })
  })
})
