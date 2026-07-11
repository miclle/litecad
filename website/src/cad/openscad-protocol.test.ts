import { describe, expect, test } from 'vitest'

import { isOpenSCADCompileRequest, openscadErrorResponse } from './openscad-protocol'

describe('OpenSCAD worker protocol', () => {
  test('accepts compile requests with source and parameter overrides', () => {
    expect(
      isOpenSCADCompileRequest({
        id: 'openscad-job-1',
        type: 'openscad-compile',
        payload: {
          code: 'width = 20;\ncube([width, 10, 5]);',
          parameterValues: { width: 40, centered: true, style: 'round' },
          output: 'preview',
        },
      }),
    ).toBe(true)
  })

  test('rejects malformed compile requests before worker execution', () => {
    expect(isOpenSCADCompileRequest({ id: 'job-1', type: 'openscad-compile', payload: {} })).toBe(false)
    expect(isOpenSCADCompileRequest({ id: 'job-1', type: 'openscad-compile', payload: { code: '' } })).toBe(false)
    expect(isOpenSCADCompileRequest({ id: 'job-1', type: 'openscad-compile', payload: { code: 'cube();', output: 'stl' } })).toBe(false)
    expect(isOpenSCADCompileRequest({ id: 'job-1', type: 'other', payload: { code: 'cube();' } })).toBe(false)
    expect(isOpenSCADCompileRequest(null)).toBe(false)
  })

  test('formats worker errors without exposing exception objects', () => {
    expect(openscadErrorResponse('job-1', new Error('OpenSCAD unavailable'))).toEqual({
      id: 'job-1',
      type: 'error',
      error: 'OpenSCAD unavailable',
    })
  })
})
