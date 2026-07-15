import { describe, expect, test } from 'vitest'

import {
  cadKernelErrorResponse,
  isCadKernelRequest,
  summarizeCadKernelMesh,
  type CadKernelMesh,
} from './kernel-protocol'

describe('CAD kernel worker protocol', () => {
  test('accepts STEP round-trip requests with string STEP source', () => {
    expect(
      isCadKernelRequest({
        id: 'job-1',
        type: 'step-round-trip',
        payload: {
          filename: 'part.step',
          stepText: 'ISO-10303-21;END-ISO-10303-21;',
        },
      }),
    ).toBe(true)
  })

  test('accepts STEP preview requests with string STEP source', () => {
    expect(
      isCadKernelRequest({
        id: 'job-1',
        type: 'step-preview',
        payload: {
          filename: 'part.step',
          stepText: 'ISO-10303-21;END-ISO-10303-21;',
        },
      }),
    ).toBe(true)
  })

  test('accepts STEP assembly export requests with one or more sources', () => {
    expect(
      isCadKernelRequest({
        id: 'job-assembly',
        type: 'step-assembly-export',
        payload: {
          filename: 'assembly.step',
          sources: [
            {
              filename: 'part-a.step',
              stepText: 'ISO-10303-21;END-ISO-10303-21;',
              operations: [
                {
                  id: 'op_01test',
                  type: 'transform',
                  modelId: 'mdl_01test',
                  matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1],
                },
              ],
            },
            {
              filename: 'part-b.step',
              stepText: 'ISO-10303-21;END-ISO-10303-21;',
            },
          ],
        },
      }),
    ).toBe(true)
  })

  test('accepts section geometry requests with a finite non-zero plane normal', () => {
    expect(
      isCadKernelRequest({
        id: 'job-section',
        type: 'section-geometry',
        payload: {
          filename: 'center-x-section.step',
          sources: [{ filename: 'part.step', stepText: 'ISO-10303-21;END-ISO-10303-21;' }],
          plane: { origin: [30, 0, 0], normal: [1, 0, 0] },
        },
      }),
    ).toBe(true)
    expect(
      isCadKernelRequest({
        id: 'job-section-invalid',
        type: 'section-geometry',
        payload: {
          filename: 'center-x-section.step',
          sources: [{ filename: 'part.step', stepText: 'ISO-10303-21;END-ISO-10303-21;' }],
          plane: { origin: [30, 0, 0], normal: [0, 0, 0] },
        },
      }),
    ).toBe(false)
  })

  test('accepts STEP preview requests with replayable CAD operations', () => {
    expect(
      isCadKernelRequest({
        id: 'job-1',
        type: 'step-preview',
        payload: {
          filename: 'part.step',
          stepText: 'ISO-10303-21;END-ISO-10303-21;',
          operations: [
            {
              id: 'op_01test',
              type: 'transform',
              modelId: 'mdl_01test',
              matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1],
            },
          ],
        },
      }),
    ).toBe(true)
  })

  test('accepts STEP preview requests with box-union feature operations', () => {
    expect(
      isCadKernelRequest({
        id: 'job-1',
        type: 'step-preview',
        payload: {
          filename: 'part.step',
          stepText: 'ISO-10303-21;END-ISO-10303-21;',
          operations: [
            {
              id: 'op_box',
              type: 'box-union',
              modelId: 'mdl_01test',
              box: {
                origin: [2, -1, 4],
                size: [8, 6, 3],
              },
            },
          ],
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL preview and export requests', () => {
    const document = {
      version: 1,
      unit: 'millimetre',
      parameters: {
        width: { type: 'number', default: 80, min: 20, max: 200 },
      },
      features: [
        {
          id: 'base',
          type: 'box',
          origin: [0, 0, 0],
          size: ['width', 40, 6],
        },
      ],
    }

    expect(
      isCadKernelRequest({
        id: 'job-dsl-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'generated.litecad.json',
          document,
          parameterValues: { width: 96 },
        },
      }),
    ).toBe(true)
    expect(
      isCadKernelRequest({
        id: 'job-dsl-export',
        type: 'feature-dsl-export',
        payload: {
          filename: 'generated.step',
          document,
          parameterValues: { width: 96 },
        },
      }),
    ).toBe(true)
  })

  test('rejects duplicate top-level LiteCAD feature graph node IDs', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-duplicate-feature-id',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'duplicate-nodes.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              { id: 'base', type: 'box', size: [20, 20, 4] },
              { id: 'base', type: 'box_cut', origin: [4, 4, -1], size: [12, 12, 6] },
            ],
          },
        },
      }),
    ).toBe(false)
  })

  test('rejects duplicate recursive LiteCAD feature graph node IDs', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-duplicate-recursive-feature-id',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'duplicate-recursive-nodes.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'body',
                type: 'boolean',
                operation: 'subtract',
                operands: [
                  { id: 'blank', type: 'box', size: [20, 20, 4] },
                  { id: 'body', type: 'cylinder', origin: [10, 10, -1], diameter: 6, height: 6 },
                ],
              },
            ],
          },
        },
      }),
    ).toBe(false)
  })

  test('rejects unstable whitespace IDs and operands on non-boolean nodes', () => {
    for (const feature of [
      { id: ' base ', type: 'box', size: [20, 20, 4] },
      {
        id: 'base',
        type: 'box',
        size: [20, 20, 4],
        operands: [{ id: 'hidden', type: 'box', size: [1, 1, 1] }],
      },
    ]) {
      expect(
        isCadKernelRequest({
          id: 'job-dsl-invalid-graph-identity',
          type: 'feature-dsl-preview',
          payload: {
            filename: 'invalid-graph-identity.lcad.json',
            document: { version: 1, unit: 'millimetre', features: [feature] },
          },
        }),
      ).toBe(false)
    }
  })

  test('accepts LiteCAD feature DSL cylinder and cylinder-cut features', () => {
    const document = {
      version: 1,
      unit: 'millimetre',
      parameters: {
        hole_diameter: { type: 'number', default: 8, min: 2, max: 20 },
        boss_radius: { type: 'number', default: 6 },
      },
      features: [
        {
          id: 'plate',
          type: 'box',
          size: [80, 40, 6],
        },
        {
          id: 'boss',
          type: 'cylinder',
          origin: [20, 20, 6],
          axis: [0, 0, 1],
          radius: 'boss_radius',
          height: 10,
        },
        {
          id: 'mount_hole',
          type: 'cylinder_cut',
          origin: [40, 20, -1],
          axis: [1, 0, 0],
          repeat: { count: 3, step: [0, 12, 0] },
          diameter: 'hole_diameter',
          depth: 8,
        },
      ],
    }

    expect(
      isCadKernelRequest({
        id: 'job-dsl-cylinder-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'plate-with-hole.lcad.json',
          document,
          parameterValues: { hole_diameter: 10, boss_radius: 7 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL sphere features', () => {
    const document = {
      version: 1,
      unit: 'millimetre',
      parameters: {
        ball_diameter: { type: 'number', default: 30, min: 1, max: 120 },
      },
      features: [
        {
          id: 'ball',
          type: 'sphere',
          origin: [0, 0, 0],
          diameter: 'ball_diameter',
        },
      ],
    }

    expect(
      isCadKernelRequest({
        id: 'job-dsl-sphere-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'sphere.lcad.json',
          document,
          parameterValues: { ball_diameter: 34 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL ellipsoid and ellipse extrude features', () => {
    const document = {
      version: 1,
      unit: 'millimetre',
      parameters: {
        major: { type: 'number', default: 30, min: 1, max: 120 },
        minor: { type: 'number', default: 18, min: 1, max: 120 },
        height: { type: 'number', default: 50, min: 1, max: 120 },
      },
      features: [
        {
          id: 'ellipsoid',
          type: 'ellipsoid',
          origin: [0, 0, 0],
          radius_x: { op: 'div', args: ['major', 2] },
          radius_y: { op: 'div', args: ['minor', 2] },
          radius_z: 12,
        },
        {
          id: 'oval_post',
          type: 'ellipse_extrude',
          origin: [45, 0, 0],
          radius_x: { op: 'div', args: ['major', 2] },
          radius_y: { op: 'div', args: ['minor', 2] },
          height: 'height',
        },
      ],
    }

    expect(
      isCadKernelRequest({
        id: 'job-dsl-ellipse-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'ellipse-features.lcad.json',
          document,
          parameterValues: { major: 34, minor: 16, height: 48 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature graph nodes and the capability registry', () => {
    const document = {
      version: 1,
      unit: 'millimetre',
      parameters: {
        fillet_radius: { type: 'number', default: 1, min: 0.1, max: 5 },
      },
      features: [
        {
          id: 'lathe_profile',
          type: 'sketch',
          plane: 'XZ',
          origin: [8, 0, -4],
          profile: { type: 'rectangle', size: [4, 8] },
        },
        {
          id: 'turned_body',
          type: 'revolve',
          sketch: 'lathe_profile',
          axis_origin: [0, 0, 0],
          axis: [0, 0, 1],
          angle_degrees: 360,
        },
        {
          id: 'extrude_profile',
          type: 'sketch',
          plane: 'XY',
          origin: [14, 0, 0],
          profile: { type: 'rectangle', size: [8, 6] },
        },
        {
          id: 'referenced_extrude',
          type: 'extrude',
          sketch: 'extrude_profile',
          height: 4,
        },
        {
          id: 'tube',
          type: 'sweep',
          sketch: { type: 'circle', diameter: 6 },
          path: [
            [30, 0, 0],
            [30, 0, 24],
          ],
        },
        {
          id: 'lofted_body',
          type: 'loft',
          sections: [
            { origin: [50, 0, 0], sketch: { type: 'circle', diameter: 8 } },
            { origin: [50, 0, 20], sketch: { type: 'circle', diameter: 16 } },
          ],
        },
        {
          id: 'boolean_body',
          type: 'boolean',
          operation: 'subtract',
          operands: [
            { id: 'base', type: 'box', origin: [70, 0, 0], size: [20, 20, 8] },
            { id: 'hole', type: 'cylinder', origin: [80, 10, -1], diameter: 6, height: 10 },
          ],
        },
        { id: 'soften', type: 'fillet', radius: 'fillet_radius' },
        { id: 'bevel', type: 'chamfer', distance: 0.5 },
      ],
    }

    expect(
      isCadKernelRequest({
        id: 'job-dsl-feature-graph-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'feature-graph.lcad.json',
          document,
          parameterValues: { fillet_radius: 1.2 },
        },
      }),
    ).toBe(true)
  })

  test('rejects malformed LiteCAD feature DSL transforms', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-bad-transform',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'bad-transform.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'bad_box',
                type: 'box',
                origin: [0, 0, 0],
                size: [10, 10, 10],
                transform: { scale: [1, 0, 1] },
              },
            ],
          },
          parameterValues: {},
        },
      }),
    ).toBe(false)
  })

  test('accepts LiteCAD feature DSL transforms', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-transform-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'transform.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            parameters: {
              lift: { type: 'number', default: 12 },
              turn: { type: 'number', default: 45 },
            },
            features: [
              {
                id: 'body',
                type: 'box',
                origin: [0, 0, 0],
                size: [10, 10, 10],
                transform: {
                  scale: [1.5, 0.75, 2],
                  rotate: { axis: [0, 0, 1], angle_degrees: 'turn' },
                  translate: [0, 0, 'lift'],
                },
              },
            ],
          },
          parameterValues: { lift: 18, turn: 90 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL box-cut features for rectangular pockets and slots', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-box-cut-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'plate-with-slot.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            parameters: {
              slot_width: { type: 'number', default: 12, min: 4, max: 30 },
            },
            features: [
              { id: 'plate', type: 'box', origin: [0, 0, 0], size: [80, 40, 6] },
              { id: 'slot', type: 'box_cut', origin: [30, 14, -1], size: [20, 'slot_width', 8] },
            ],
          },
          parameterValues: { slot_width: 10 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL rectangular sketch extrudes', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-extrude-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'extruded-bracket.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            parameters: {
              width: { type: 'number', default: 80, min: 20, max: 200 },
              depth: { type: 'number', default: 40, min: 10, max: 120 },
              thickness: { type: 'number', default: 6, min: 2, max: 20 },
            },
            features: [
              {
                id: 'base',
                type: 'extrude',
                origin: [0, 0, 0],
                sketch: { type: 'rectangle', size: ['width', 'depth'] },
                height: 'thickness',
              },
            ],
          },
          parameterValues: { width: 96, depth: 48, thickness: 8 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL rectangular sketch cut extrudes', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-extrude-cut-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'extruded-cut-bracket.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            parameters: {
              slot_width: { type: 'number', default: 12, min: 4, max: 30 },
              cut_depth: { type: 'number', default: 8, min: 2, max: 20 },
            },
            features: [
              { id: 'base', type: 'extrude', sketch: { type: 'rectangle', size: [80, 40] }, height: 6 },
              {
                id: 'slot',
                type: 'extrude_cut',
                origin: [30, 14, -1],
                sketch: { type: 'rectangle', size: [20, 'slot_width'] },
                depth: 'cut_depth',
              },
            ],
          },
          parameterValues: { slot_width: 10, cut_depth: 9 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL sketch extrusion directions', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-directed-extrude-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'directed-extrudes.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'base',
                type: 'extrude',
                origin: [0, 0, 6],
                sketch: { type: 'rectangle', size: [80, 40] },
                height: 6,
                direction: 'negative',
              },
              {
                id: 'slot',
                type: 'extrude_cut',
                origin: [30, 14, 3],
                sketch: { type: 'rectangle', size: [20, 10] },
                depth: 8,
                direction: 'symmetric',
              },
            ],
          },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL circular sketch extrudes', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-circle-extrude-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'round-boss.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            parameters: {
              boss_diameter: { type: 'number', default: 18, min: 4, max: 40 },
              hole_radius: { type: 'number', default: 3, min: 1, max: 8 },
            },
            features: [
              { id: 'boss', type: 'extrude', origin: [0, 0, 0], sketch: { type: 'circle', diameter: 'boss_diameter' }, height: 8 },
              { id: 'hole', type: 'extrude_cut', origin: [0, 0, -1], sketch: { type: 'circle', radius: 'hole_radius' }, depth: 10 },
            ],
          },
        },
      }),
    ).toBe(true)
  })

  test('rejects malformed LiteCAD feature DSL circular sketches', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-bad-circle-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'bad-round-boss.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [{ id: 'boss', type: 'extrude', sketch: { type: 'circle', radius: 4, size: [8, 8] }, height: 6 }],
          },
        },
      }),
    ).toBe(false)
  })

  test('accepts LiteCAD feature DSL structured numeric expressions', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-expression-preview',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'expression-bracket.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            parameters: {
              width: { type: 'number', default: 80, min: 20, max: 200 },
              clearance: { type: 'number', default: 2, min: 0, max: 10 },
            },
            features: [
              {
                id: 'base',
                type: 'extrude',
                sketch: {
                  type: 'rectangle',
                  size: [{ op: 'add', args: ['width', { op: 'mul', args: ['clearance', 2] }] }, 40],
                },
                height: { op: 'div', args: ['width', 20] },
              },
            ],
          },
          parameterValues: { width: 100, clearance: 3 },
        },
      }),
    ).toBe(true)
  })

  test('accepts LiteCAD feature DSL non-geometry parameter metadata', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-ui-params',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'panel-with-ui-params.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            parameters: {
              width: { type: 'number', default: 80, min: 20, max: 200 },
              include_holes: { type: 'boolean', default: true },
              finish: { type: 'string', default: 'matte', options: ['matte', 'polished'] },
            },
            features: [{ id: 'base', type: 'box', size: ['width', 40, 6] }],
          },
          parameterValues: { width: 96 },
        },
      }),
    ).toBe(true)
  })

  test('rejects malformed LiteCAD feature DSL repeat patterns', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-bad-repeat',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'bad-repeat.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'hole_pattern',
                type: 'cylinder_cut',
                origin: [0, 0, 0],
                radius: 4,
                depth: 8,
                repeat: { count: 0, step: [10, 0, 0] },
              },
            ],
          },
        },
      }),
    ).toBe(false)
  })

  test('rejects malformed LiteCAD feature DSL cylinder axes', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-bad-axis',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'bad-axis.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'zero-axis',
                type: 'cylinder',
                origin: [0, 0, 0],
                axis: [0, 0, 0],
                radius: 5,
                height: 8,
              },
            ],
          },
        },
      }),
    ).toBe(false)
  })

  test('rejects malformed LiteCAD feature DSL cylinder features', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-bad-cylinder',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'bad.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'ambiguous',
                type: 'cylinder',
                origin: [0, 0, 0],
                radius: 5,
                diameter: 10,
                height: 8,
              },
            ],
          },
        },
      }),
    ).toBe(false)
    expect(
      isCadKernelRequest({
        id: 'job-dsl-bad-cut',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'bad.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'missing-depth',
                type: 'cylinder_cut',
                origin: [0, 0, 0],
                radius: 5,
              },
            ],
          },
        },
      }),
    ).toBe(false)
  })

  test('rejects malformed LiteCAD feature DSL box-cut features', () => {
    expect(
      isCadKernelRequest({
        id: 'job-dsl-bad-box-cut',
        type: 'feature-dsl-preview',
        payload: {
          filename: 'bad-box-cut.lcad.json',
          document: {
            version: 1,
            unit: 'millimetre',
            features: [
              {
                id: 'missing-size',
                type: 'box_cut',
                origin: [0, 0, 0],
              },
            ],
          },
        },
      }),
    ).toBe(false)
  })

  test('rejects malformed worker requests before they reach the kernel', () => {
    expect(isCadKernelRequest({ id: 'job-1', type: 'step-round-trip', payload: { filename: 'part.step' } })).toBe(false)
    expect(isCadKernelRequest({ id: 'job-1', type: 'unknown', payload: { stepText: 'x' } })).toBe(false)
    expect(isCadKernelRequest({ id: 'job-1', type: 'step-assembly-export', payload: { filename: 'assembly.step', sources: [] } })).toBe(false)
    expect(isCadKernelRequest({ id: 'job-1', type: 'feature-dsl-preview', payload: { filename: 'generated.json' } })).toBe(false)
    expect(isCadKernelRequest(null)).toBe(false)
  })

  test('rejects malformed CAD operations before they reach the kernel', () => {
    expect(
      isCadKernelRequest({
        id: 'job-1',
        type: 'step-preview',
        payload: {
          filename: 'part.step',
          stepText: 'ISO-10303-21;END-ISO-10303-21;',
          operations: [
            {
              id: 'op_01test',
              type: 'transform',
              modelId: 'mdl_01test',
              matrix: [1, 0, 0],
            },
          ],
        },
      }),
    ).toBe(false)
    expect(
      isCadKernelRequest({
        id: 'job-1',
        type: 'step-preview',
        payload: {
          filename: 'part.step',
          stepText: 'ISO-10303-21;END-ISO-10303-21;',
          operations: [
            {
              id: 'op_box',
              type: 'box-union',
              modelId: 'mdl_01test',
              box: {
                origin: [0, 0, 0],
                size: [8, 0, 3],
              },
            },
          ],
        },
      }),
    ).toBe(false)
  })

  test('summarizes mesh buffers for smoke verification', () => {
    const mesh: CadKernelMesh = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    }

    expect(summarizeCadKernelMesh(mesh)).toEqual({
      vertexCount: 3,
      triangleCount: 1,
      hasNormals: true,
    })
  })

  test('formats kernel errors without exposing exception objects', () => {
    expect(cadKernelErrorResponse('job-1', new Error('STEP import failed'))).toEqual({
      id: 'job-1',
      type: 'error',
      error: 'STEP import failed',
    })
    expect(cadKernelErrorResponse('job-2', 'bad input')).toEqual({
      id: 'job-2',
      type: 'error',
      error: 'bad input',
    })
  })
})
