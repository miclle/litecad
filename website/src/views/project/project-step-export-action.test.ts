import { describe, expect, test, vi } from 'vitest'

import { exportMergedStepTargets, exportStepTarget, exportStepTargetsSeparately } from './project-step-export-action'
import type { StepExportTarget } from './project-step-export'

describe('exportStepTarget', () => {
  test('exports the current STEP target through the worker and publishes a download', async () => {
    const target: StepExportTarget = {
      modelId: 'mdl_step',
      sourceFormat: 'step',
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
    const runFeatureDSLExport = vi.fn()
    const publishDownload = vi.fn()

    const result = await exportStepTarget({
      target,
      fetchSourceText,
      runStepRoundTrip,
      runFeatureDSLExport,
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
    expect(runFeatureDSLExport).not.toHaveBeenCalled()
  })

  test('exports a LiteCAD feature DSL target through the feature DSL worker and publishes a STEP download', async () => {
    const target: StepExportTarget = {
      modelId: 'mdl_lcad',
      sourceFormat: 'lcad',
      displayName: 'Feature DSL bracket',
      sourceFilename: 'feature-dsl-bracket-litecad.lcad.json',
      downloadFilename: 'feature-dsl-bracket-litecad.lcad-litecad-r7.step',
      parameterValues: { width: 96 },
      operations: [],
    }
    const source = JSON.stringify({
      version: 1,
      unit: 'millimetre',
      parameters: { width: { type: 'number', default: 80, min: 20, max: 200 } },
      features: [{ id: 'base', type: 'box', origin: [0, 0, 0], size: ['width', 40, 6] }],
    })
    const fetchSourceText = vi.fn(async () => source)
    const runStepRoundTrip = vi.fn()
    const runFeatureDSLExport = vi.fn(async () => ({
      exportedStepText: 'ISO-10303-21;\nFEATURE-DSL-STEP;\nEND-ISO-10303-21;',
    }))
    const publishDownload = vi.fn()

    const result = await exportStepTarget({
      target,
      fetchSourceText,
      runStepRoundTrip,
      runFeatureDSLExport,
      publishDownload,
    })

    expect(fetchSourceText).toHaveBeenCalledWith('mdl_lcad')
    expect(runStepRoundTrip).not.toHaveBeenCalled()
    expect(runFeatureDSLExport).toHaveBeenCalledWith({
      filename: 'feature-dsl-bracket-litecad.lcad.json',
      document: JSON.parse(source),
      parameterValues: { width: 96 },
    })
    expect(publishDownload).toHaveBeenCalledWith({
      filename: 'feature-dsl-bracket-litecad.lcad-litecad-r7.step',
      stepText: 'ISO-10303-21;\nFEATURE-DSL-STEP;\nEND-ISO-10303-21;',
    })
    expect(result.exportedStepText).toContain('FEATURE-DSL-STEP')
  })
})

describe('exportStepTargetsSeparately', () => {
  test('exports each selected target as its own STEP download', async () => {
    const targets: StepExportTarget[] = [
      {
        modelId: 'mdl_a',
        sourceFormat: 'step',
        displayName: 'A',
        sourceFilename: 'a.step',
        downloadFilename: 'a-litecad-r7.step',
        operations: [],
      },
      {
        modelId: 'mdl_b',
        sourceFormat: 'step',
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
    const runFeatureDSLExport = vi.fn()
    const publishDownload = vi.fn()

    await exportStepTargetsSeparately({ targets, fetchSourceText, runStepRoundTrip, runFeatureDSLExport, publishDownload })

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
        sourceFormat: 'step',
        displayName: 'A',
        sourceFilename: 'a.step',
        downloadFilename: 'a-litecad-r7.step',
        operations: [],
      },
      {
        modelId: 'mdl_b',
        sourceFormat: 'step',
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
    const runFeatureDSLExport = vi.fn()
    const publishDownload = vi.fn()

    await exportMergedStepTargets({
      targets,
      downloadFilename: 'assembly-litecad-assembly-r7.step',
      fetchSourceText,
      runStepAssemblyExport,
      runFeatureDSLExport,
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

  test('converts LiteCAD feature DSL targets before publishing one merged STEP download', async () => {
    const targets: StepExportTarget[] = [
      {
        modelId: 'mdl_step',
        sourceFormat: 'step',
        displayName: 'Step',
        sourceFilename: 'step.step',
        downloadFilename: 'step-litecad-r7.step',
        operations: [],
      },
      {
        modelId: 'mdl_lcad',
        sourceFormat: 'lcad',
        displayName: 'DSL',
        sourceFilename: 'dsl.lcad.json',
        downloadFilename: 'dsl.lcad-litecad-r7.step',
        parameterValues: { width: 96 },
        operations: [],
      },
    ]
    const dslSource = JSON.stringify({
      version: 1,
      unit: 'millimetre',
      parameters: { width: { type: 'number', default: 80 } },
      features: [{ id: 'base', type: 'box', size: ['width', 40, 6] }],
    })
    const fetchSourceText = vi.fn(async (modelId: string) => (modelId === 'mdl_lcad' ? dslSource : 'STEP-SOURCE'))
    const runStepAssemblyExport = vi.fn(async () => ({
      exportedStepText: 'MERGED-STEP',
    }))
    const runFeatureDSLExport = vi.fn(async () => ({
      exportedStepText: 'DSL-STEP',
    }))
    const publishDownload = vi.fn()

    await exportMergedStepTargets({
      targets,
      downloadFilename: 'assembly-litecad-assembly-r7.step',
      fetchSourceText,
      runStepAssemblyExport,
      runFeatureDSLExport,
      publishDownload,
    })

    expect(runFeatureDSLExport).toHaveBeenCalledWith({
      filename: 'dsl.lcad.json',
      document: JSON.parse(dslSource),
      parameterValues: { width: 96 },
    })
    expect(runStepAssemblyExport).toHaveBeenCalledWith({
      filename: 'assembly-litecad-assembly-r7.step',
      sources: [
        { filename: 'step.step', stepText: 'STEP-SOURCE', operations: [] },
        { filename: 'dsl.lcad.json', stepText: 'DSL-STEP', operations: [] },
      ],
    })
    expect(publishDownload).toHaveBeenCalledWith({
      filename: 'assembly-litecad-assembly-r7.step',
      stepText: 'MERGED-STEP',
    })
  })
})
