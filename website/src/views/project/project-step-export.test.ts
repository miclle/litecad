import { afterEach, describe, expect, test, vi } from 'vitest'

import { buildStepExportTargets, createStepExportBlob, publishStepExportDownload, stepExportFilename } from './project-step-export'
import type { ProjectCADDocument, ProjectModel } from 'src/types/project'

const baseModel = {
  project_id: 'prj_01test',
  format: 'step',
  content_type: 'model/step',
  byte_size: 1024,
  parse_status: 'parsed',
  parse_error: '',
  metadata: {
    asset_type: 'step',
    version: '',
    schema: 'AUTOMOTIVE_DESIGN',
    product_names: [],
    length_unit: 'millimetre',
    entity_count: 1,
    representation_count: 1,
    triangle_count: 0,
  },
  created_at: '2026-07-05T00:00:00Z',
  updated_at: '2026-07-05T00:00:00Z',
} satisfies Omit<ProjectModel, 'id' | 'original_filename'>

const cadDocument = {
  project_id: 'prj_01test',
  id: 'doc_01test',
  schema_version: 1,
  revision: 7,
  unit: 'millimetre',
  nodes: [],
  operations: [
    {
      id: 'op_transform',
      type: 'transform',
      model_id: 'mdl_step',
      transform: { matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1] },
      created_at: '2026-07-08T00:00:00Z',
    },
    {
      id: 'op_box',
      type: 'box-union',
      model_id: 'mdl_step',
      box: { origin: [10, 0, 0], size: [5, 5, 5] },
      created_at: '2026-07-08T00:00:01Z',
    },
  ],
  created_at: '2026-07-08T00:00:00Z',
  updated_at: '2026-07-08T00:00:01Z',
} satisfies ProjectCADDocument

describe('project STEP export helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('builds export targets for parsed STEP models with current document operations', () => {
    const stepModel = {
      ...baseModel,
      id: 'mdl_step',
      original_filename: 'bracket.step',
      metadata: { ...baseModel.metadata, product_names: ['Mount bracket'] },
    } satisfies ProjectModel
    const stlModel = {
      ...baseModel,
      id: 'mdl_stl',
      original_filename: 'mesh.stl',
      format: 'stl',
      content_type: 'model/stl',
    } satisfies ProjectModel

    expect(buildStepExportTargets([stepModel, stlModel], cadDocument)).toEqual([
      {
        modelId: 'mdl_step',
        displayName: 'Mount bracket',
        sourceFilename: 'bracket.step',
        downloadFilename: 'bracket-litecad-r7.step',
        operations: [
          {
            id: 'op_transform',
            type: 'transform',
            modelId: 'mdl_step',
            matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1],
          },
          {
            id: 'op_box',
            type: 'box-union',
            modelId: 'mdl_step',
            box: { origin: [10, 0, 0], size: [5, 5, 5] },
          },
        ],
      },
    ])
  })

  test('sanitizes exported STEP filenames while preserving the source base name', () => {
    expect(stepExportFilename('gear:alpha.stp', 12)).toBe('gear-alpha-litecad-r12.step')
    expect(stepExportFilename('assembly.step', 0)).toBe('assembly-litecad-r0.step')
  })

  test('creates a browser-downloadable STEP blob', async () => {
    const blob = createStepExportBlob('ISO-10303-21;\nEND-ISO-10303-21;')

    expect(blob.type).toBe('model/step;charset=utf-8')
    await expect(blob.text()).resolves.toContain('ISO-10303-21')
  })

  test('publishes exported STEP text through a browser download link', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:litecad-export')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.fn()
    const createElement = vi.spyOn(document, 'createElement')
    let anchor: HTMLAnchorElement | undefined
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = Document.prototype.createElement.call(document, tagName, options)
      if (tagName === 'a') {
        anchor = element as HTMLAnchorElement
        anchor.click = click
      }
      return element
    })

    publishStepExportDownload({
      filename: 'bracket-litecad-r7.step',
      stepText: 'ISO-10303-21;\nEND-ISO-10303-21;',
    })

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(anchor?.href).toBe('blob:litecad-export')
    expect(anchor?.download).toBe('bracket-litecad-r7.step')
    expect(click).toHaveBeenCalledTimes(1)
    expect(anchor?.isConnected).toBe(false)

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:litecad-export')
  })
})
