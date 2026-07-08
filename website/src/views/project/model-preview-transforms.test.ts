import { describe, expect, it } from 'vitest'

import { cadTranslationDeltaToPreviewTranslation, previewTranslationDeltaToCADTranslation } from './model-preview-transforms'

describe('model preview transform mapping', () => {
  it('preserves axes for GLTF-style preview objects', () => {
    expect(cadTranslationDeltaToPreviewTranslation({ x: 1, y: 2, z: 3 }, false)).toEqual({ x: 1, y: 2, z: 3 })
    expect(previewTranslationDeltaToCADTranslation({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 }, false)).toEqual({
      x: 11,
      y: 22,
      z: 33,
    })
  })

  it('maps CAD Y/Z axes through the oriented STEP preview frame', () => {
    expect(cadTranslationDeltaToPreviewTranslation({ x: 1, y: 2, z: 3 }, true)).toEqual({ x: 1, y: 3, z: -2 })
    expect(previewTranslationDeltaToCADTranslation({ x: 1, y: 3, z: -2 }, { x: 10, y: 20, z: 30 }, true)).toEqual({
      x: 11,
      y: 22,
      z: 33,
    })
  })
})
