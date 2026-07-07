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

  test('rejects malformed worker requests before they reach the kernel', () => {
    expect(isCadKernelRequest({ id: 'job-1', type: 'step-round-trip', payload: { filename: 'part.step' } })).toBe(false)
    expect(isCadKernelRequest({ id: 'job-1', type: 'unknown', payload: { stepText: 'x' } })).toBe(false)
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
