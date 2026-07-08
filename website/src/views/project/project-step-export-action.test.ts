import { describe, expect, test, vi } from 'vitest'

import { exportMergedStepTargets, exportStepTarget, exportStepTargetsSeparately } from './project-step-export-action'
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

describe('exportStepTargetsSeparately', () => {
  test('exports each selected target as its own STEP download', async () => {
    const targets: StepExportTarget[] = [
      {
        modelId: 'mdl_a',
        displayName: 'A',
        sourceFilename: 'a.step',
        downloadFilename: 'a-litecad-r7.step',
        operations: [],
      },
      {
        modelId: 'mdl_b',
        displayName: 'B',
        sourceFilename: 'b.step',
        downloadFilename: 'b-litecad-r7.step',
        operations: [],
      },
    ]
    const fetchSourceText = vi.fn(async (modelId: string) => `${modelId}-source`)
    const runStepRoundTrip = vi.fn(async (input) => ({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
      meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
      exportedStepText: `${input.filename}-exported`,
    }))
    const publishDownload = vi.fn()

    await exportStepTargetsSeparately({ targets, fetchSourceText, runStepRoundTrip, publishDownload })

    expect(fetchSourceText).toHaveBeenCalledWith('mdl_a')
    expect(fetchSourceText).toHaveBeenCalledWith('mdl_b')
    expect(publishDownload).toHaveBeenCalledWith({ filename: 'a-litecad-r7.step', stepText: 'a.step-exported' })
    expect(publishDownload).toHaveBeenCalledWith({ filename: 'b-litecad-r7.step', stepText: 'b.step-exported' })
  })
})

describe('exportMergedStepTargets', () => {
  test('fetches selected source STEP texts and publishes one merged STEP download', async () => {
    const targets: StepExportTarget[] = [
      {
        modelId: 'mdl_a',
        displayName: 'A',
        sourceFilename: 'a.step',
        downloadFilename: 'a-litecad-r7.step',
        operations: [],
      },
      {
        modelId: 'mdl_b',
        displayName: 'B',
        sourceFilename: 'b.step',
        downloadFilename: 'b-litecad-r7.step',
        operations: [
          {
            id: 'op_box',
            type: 'box-union',
            modelId: 'mdl_b',
            box: { origin: [10, 0, 0], size: [5, 5, 5] },
          },
        ],
      },
    ]
    const fetchSourceText = vi.fn(async (modelId: string) => `${modelId}-source`)
    const runStepAssemblyExport = vi.fn(async () => ({
      exportedStepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
    }))
    const publishDownload = vi.fn()

    await exportMergedStepTargets({
      targets,
      downloadFilename: 'assembly-litecad-assembly-r7.step',
      fetchSourceText,
      runStepAssemblyExport,
      publishDownload,
    })

    expect(runStepAssemblyExport).toHaveBeenCalledWith({
      filename: 'assembly-litecad-assembly-r7.step',
      sources: [
        { filename: 'a.step', stepText: 'mdl_a-source', operations: [] },
        { filename: 'b.step', stepText: 'mdl_b-source', operations: targets[1]?.operations },
      ],
    })
    expect(publishDownload).toHaveBeenCalledWith({
      filename: 'assembly-litecad-assembly-r7.step',
      stepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
    })
  })
})
