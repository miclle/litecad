import { describe, expect, test, vi } from 'vitest'

import { generateProjectSectionGeometry } from './project-section-artifact-action'
import type { StepExportTarget } from './project-step-export'

describe('generateProjectSectionGeometry', () => {
  test('converts STEP and LiteCAD targets into placed STEP sources before sectioning', async () => {
    const targets: StepExportTarget[] = [
      {
        occurrenceId: 'occ_step',
        modelId: 'mdl_step',
        modelRevisionId: 'mvr_step',
        sourceFormat: 'step',
        displayName: 'STEP part',
        sourceFilename: 'part.step',
        downloadFilename: 'part-r4.step',
        operations: [{ id: 'occ_step_placement', type: 'transform', modelId: 'mdl_step', matrix: [1, 0, 0, 4, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
      },
      {
        occurrenceId: 'occ_lcad',
        modelId: 'mdl_lcad',
        modelRevisionId: 'mvr_lcad',
        sourceFormat: 'lcad',
        displayName: 'DSL part',
        sourceFilename: 'part.lcad.json',
        downloadFilename: 'part-lcad-r4.step',
        parameterValues: { width: 60 },
        operations: [{ id: 'occ_lcad_placement', type: 'transform', modelId: 'mdl_lcad', matrix: [1, 0, 0, 0, 0, 1, 0, 8, 0, 0, 1, 0, 0, 0, 0, 1] }],
      },
    ]
    const fetchSourceText = vi.fn(async (modelId: string) =>
      modelId === 'mdl_step' ? 'ISO-10303-21; STEP' : JSON.stringify({ version: 1, unit: 'millimetre', features: [{ id: 'base', type: 'box', size: [60, 24, 8] }] }),
    )
    const runFeatureDSLExport = vi.fn(async () => ({ exportedStepText: 'ISO-10303-21; LCAD' }))
    const runSectionGeometry = vi.fn(async () => ({ status: 'ready' as const, edgeCount: 8, exportedStepText: 'ISO-10303-21; SECTION' }))

    const result = await generateProjectSectionGeometry({
      filename: 'center-x-section.step',
      fetchSourceText,
      plane: { origin: [30, 0, 0], normal: [1, 0, 0] },
      runFeatureDSLExport,
      runSectionGeometry,
      targets,
    })

    expect(runFeatureDSLExport).toHaveBeenCalledOnce()
    expect(runSectionGeometry).toHaveBeenCalledWith({
      filename: 'center-x-section.step',
      plane: { origin: [30, 0, 0], normal: [1, 0, 0] },
      sources: [
        { filename: 'part.step', stepText: 'ISO-10303-21; STEP', operations: targets[0]?.operations },
        { filename: 'part.lcad.json', stepText: 'ISO-10303-21; LCAD', operations: targets[1]?.operations },
      ],
    })
    expect(result).toEqual({ status: 'ready', edgeCount: 8, exportedStepText: 'ISO-10303-21; SECTION' })
  })
})
