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
          radius: 'boss_radius',
          height: 10,
        },
        {
          id: 'mount_hole',
          type: 'cylinder_cut',
          origin: [40, 20, -1],
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
