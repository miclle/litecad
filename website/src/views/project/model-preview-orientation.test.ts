import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import { orientCADPreviewObject } from './model-preview-orientation'

describe('orientCADPreviewObject', () => {
  test('maps CAD Z-up previews into the Three.js Y-up viewer space', () => {
    const object = new THREE.Object3D()

    orientCADPreviewObject(object)

    expect(object.rotation.x).toBeCloseTo(-Math.PI / 2)
  })
})
