import { describe, expect, test } from 'vitest'

import { cadTransformWithTranslation, translationFromCADTransform } from './cad-document-transforms'

describe('CAD document transforms', () => {
  test('reads translation from a row-major CAD transform matrix', () => {
    expect(
      translationFromCADTransform({
        matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1],
      }),
    ).toEqual({ x: 12, y: -4, z: 8 })
  })

  test('writes translation while preserving the rest of the matrix', () => {
    expect(
      cadTransformWithTranslation(
        {
          matrix: [1, 0, 0, 12, 0, 0, -1, -4, 0, 1, 0, 8, 0, 0, 0, 1],
        },
        { x: 3.5, y: 0, z: -9 },
      ),
    ).toEqual({
      matrix: [1, 0, 0, 3.5, 0, 0, -1, 0, 0, 1, 0, -9, 0, 0, 0, 1],
    })
  })

  test('creates an identity transform when no current transform exists', () => {
    expect(cadTransformWithTranslation(undefined, { x: 1, y: 2, z: 3 })).toEqual({
      matrix: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1],
    })
  })
})
