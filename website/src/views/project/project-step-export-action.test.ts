import { describe, expect, test, vi } from 'vitest'

import { exportStepTarget } from './project-step-export-action'
import type { StepExportTarget } from './project-step-export'

describe('exportStepTarget', () => {
  test('exports the current STEP target through the worker and publishes a download', async () => {
    const target: StepExportTarget = {
      modelId: 'mdl_step',
      displayName: 'Mount bracket',
      sourceFilename: 'bracket.step',
      downloadFilename: 'bracket-litecad-r7.step',
      operations: [
        {
          id: 'op_box',
          type: 'box-union',
          modelId: 'mdl_step',
          box: { origin: [10, 0, 0], size: [5, 5, 5] },
        },
      ],
    }
    const fetchSourceText = vi.fn(async () => 'ISO-10303-21;')
    const runStepRoundTrip = vi.fn(async () => ({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
      meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
      exportedStepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
    }))
    const publishDownload = vi.fn()

    const result = await exportStepTarget({
      target,
      fetchSourceText,
      runStepRoundTrip,
      publishDownload,
    })

    expect(fetchSourceText).toHaveBeenCalledWith('mdl_step')
    expect(runStepRoundTrip).toHaveBeenCalledWith({
      filename: 'bracket.step',
      stepText: 'ISO-10303-21;',
      operations: target.operations,
    })
    expect(publishDownload).toHaveBeenCalledWith({
      filename: 'bracket-litecad-r7.step',
      stepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
    })
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })
})
