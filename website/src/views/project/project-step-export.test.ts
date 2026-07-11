import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  buildStepExportTargets,
  createStepExportBlob,
  defaultSelectedStepExportTargetIDs,
  publishStepExportDownload,
  selectedStepExportTargets,
  stepAssemblyExportFilename,
  stepExportFilename,
} from './project-step-export'
import type { ProjectCADDocument, ProjectModel } from 'src/types/project'
import type { StepExportTarget } from './project-step-export'

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
  history: { head_id: 'hist_07test', can_undo: true, can_redo: false },
  unit: 'millimetre',
  nodes: [
    {
      id: 'node_mdl_step',
      model_id: 'mdl_step',
      source_model_id: 'mdl_step',
      parent_node_id: '',
      name: 'bracket.step',
      source_format: 'step',
      transform: { matrix: [] },
    },
  ],
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

  test('builds export targets for parsed STEP and LiteCAD feature DSL models', () => {
    const stepModel = {
      ...baseModel,
      id: 'mdl_step',
      original_filename: 'bracket.step',
      metadata: { ...baseModel.metadata, product_names: ['Mount bracket'] },
    } satisfies ProjectModel
    const lcadModel = {
      ...baseModel,
      id: 'mdl_lcad',
      original_filename: 'feature-dsl-bracket-litecad.lcad.json',
      format: 'lcad',
      content_type: 'application/json',
      metadata: {
        ...baseModel.metadata,
        asset_type: 'lcad',
        source_kind: 'litecad-feature-dsl',
        schema: 'litecad-feature-dsl',
        product_names: ['Feature DSL bracket'],
        parameter_values: { width: 96 },
      },
    } satisfies ProjectModel
    const stlModel = {
      ...baseModel,
      id: 'mdl_stl',
      original_filename: 'mesh.stl',
      format: 'stl',
      content_type: 'model/stl',
    } satisfies ProjectModel
    const exportDocument = {
      ...cadDocument,
      nodes: [
        ...cadDocument.nodes,
        {
          id: 'node_mdl_lcad',
          model_id: 'mdl_lcad',
          source_model_id: 'mdl_lcad',
          parent_node_id: '',
          name: 'feature-dsl-bracket-litecad.lcad.json',
          source_format: 'lcad',
          transform: { matrix: [] },
        },
      ],
    } satisfies ProjectCADDocument

    expect(buildStepExportTargets([stepModel, lcadModel, stlModel], exportDocument)).toEqual([
      {
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
          {
            id: 'op_transform',
            type: 'transform',
            modelId: 'mdl_step',
            matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1],
          },
        ],
      },
      {
        modelId: 'mdl_lcad',
        sourceFormat: 'lcad',
        displayName: 'Feature DSL bracket',
        sourceFilename: 'feature-dsl-bracket-litecad.lcad.json',
        downloadFilename: 'feature-dsl-bracket-litecad.lcad-litecad-r7.step',
        parameterValues: { width: 96 },
        operations: [],
      },
    ])
  })

  test('omits STEP models deleted from the CAD document', () => {
    const retainedModel = {
      ...baseModel,
      id: 'mdl_retained',
      original_filename: 'retained.step',
    } satisfies ProjectModel
    const deletedModel = {
      ...baseModel,
      id: 'mdl_deleted',
      original_filename: 'deleted.step',
    } satisfies ProjectModel
    const document = {
      ...cadDocument,
      nodes: [
        {
          id: 'node_mdl_retained',
          model_id: 'mdl_retained',
          source_model_id: 'mdl_retained',
          parent_node_id: '',
          name: 'retained.step',
          source_format: 'step',
          transform: { matrix: [] },
        },
      ],
      operations: [
        {
          id: 'op_delete',
          type: 'delete-node',
          model_id: 'mdl_deleted',
          node_id: 'node_mdl_deleted',
          created_at: '2026-07-10T00:00:00Z',
        },
      ],
    } satisfies ProjectCADDocument

    expect(buildStepExportTargets([retainedModel, deletedModel], document).map((target) => target.modelId)).toEqual(['mdl_retained'])
  })

  test('sanitizes exported STEP filenames while preserving the source base name', () => {
    expect(stepExportFilename('gear:alpha.stp', 12)).toBe('gear-alpha-litecad-r12.step')
    expect(stepExportFilename('assembly.step', 0)).toBe('assembly-litecad-r0.step')
  })

  test('sanitizes merged assembly STEP filenames from the project name', () => {
    expect(stepAssemblyExportFilename('Portal frame: alpha', 7)).toBe('Portal frame- alpha-litecad-assembly-r7.step')
    expect(stepAssemblyExportFilename('', 0)).toBe('assembly-litecad-assembly-r0.step')
  })

  test('builds default and filtered export selections', () => {
    const targets = [
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
    ] satisfies StepExportTarget[]

    expect([...defaultSelectedStepExportTargetIDs(targets)]).toEqual(['mdl_a', 'mdl_b'])
    expect(selectedStepExportTargets(targets, new Set(['mdl_b']))).toEqual([targets[1]])
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
