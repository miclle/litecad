import { describe, expect, test } from 'vitest'

import type { ProjectModel } from 'src/types/project'
import { buildFeatureDSLPreviewInput } from './project-feature-dsl-preview'

const baseModel = {
  id: 'mdl_lcad',
  project_id: 'prj_01test',
  original_filename: 'feature-dsl-bracket-litecad.lcad.json',
  format: 'lcad',
  content_type: 'application/json',
  byte_size: 256,
  parse_status: 'parsed',
  parse_error: '',
  metadata: {
    asset_type: 'lcad',
    source_kind: 'litecad-feature-dsl',
    version: '1',
    schema: 'litecad-feature-dsl',
    product_names: ['Feature DSL bracket'],
    length_unit: 'millimetre',
    entity_count: 256,
    parameter_count: 2,
    parameter_values: { width: 96, depth: 42, label: 'ignored' },
    representation_count: 1,
    triangle_count: 0,
    components: [],
  },
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
} satisfies ProjectModel

describe('project feature DSL preview', () => {
  test('builds worker input from saved LiteCAD feature DSL source and numeric parameter values', () => {
    const source = `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 80, "min": 20, "max": 200 },
    "depth": { "type": "number", "default": 40, "min": 10, "max": 100 }
  },
  "features": [
    { "id": "base", "type": "box", "origin": [0, 0, 0], "size": ["width", "depth", 6] }
  ]
}`

    expect(buildFeatureDSLPreviewInput(baseModel, source)).toEqual({
      filename: 'feature-dsl-bracket-litecad.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          width: { type: 'number', default: 80, min: 20, max: 200 },
          depth: { type: 'number', default: 40, min: 10, max: 100 },
        },
        features: [{ id: 'base', type: 'box', origin: [0, 0, 0], size: ['width', 'depth', 6] }],
      },
      parameterValues: { width: 96, depth: 42 },
    })
  })

  test('rejects non-JSON LiteCAD feature DSL source', () => {
    expect(() => buildFeatureDSLPreviewInput(baseModel, '{not-json')).toThrow('Invalid LiteCAD feature DSL source')
  })
})
