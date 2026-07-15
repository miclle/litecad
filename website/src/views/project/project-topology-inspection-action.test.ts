import { describe, expect, it, vi } from 'vitest'

import { generateProjectTopologyInspection } from './project-topology-inspection-action'

describe('generateProjectTopologyInspection', () => {
  it('annotates revision-pinned sources with immutable occurrence scope', async () => {
    const runShapeInspection = vi.fn(async (input) => ({ derivation: 'occt-brep-properties' as const, targets: [], totals: input.sources.length }))
    const result = await generateProjectTopologyInspection({
      fetchSourceText: vi.fn(async () => 'ISO-10303-21;'),
      runFeatureDSLExport: vi.fn(),
      runShapeInspection,
      targets: [
        {
          occurrenceId: 'occ_box',
          modelId: 'mdl_box',
          modelRevisionId: 'pmr_box_1',
          sourceFormat: 'step',
          displayName: 'Box',
          sourceFilename: 'box.step',
          downloadFilename: 'box.step',
          operations: [],
        },
      ],
    })

    expect(runShapeInspection).toHaveBeenCalledWith({
      sources: [
        {
          filename: 'box.step',
          stepText: 'ISO-10303-21;',
          operations: [],
          referenceScope: { occurrenceId: 'occ_box', modelRevisionId: 'pmr_box_1' },
        },
      ],
    })
    expect(result).toMatchObject({ derivation: 'occt-brep-properties', totals: 1 })
  })

  it('rejects an empty visible target set', async () => {
    await expect(
      generateProjectTopologyInspection({
        fetchSourceText: vi.fn(),
        runFeatureDSLExport: vi.fn(),
        runShapeInspection: vi.fn(),
        targets: [],
      }),
    ).rejects.toThrow('Topology inspection requires at least one visible target')
  })
})
