import { describe, expect, test } from 'vitest'

import { createDemoAssemblyScene } from './demo-assembly-scene'

describe('demo assembly scene', () => {
  test('builds the preview assembly and drag targets', () => {
    const { assembly, draggableMeshes } = createDemoAssemblyScene()

    expect(assembly.children.length).toBeGreaterThan(0)
    expect(draggableMeshes).toHaveLength(5)
    expect(draggableMeshes.every((mesh) => mesh.parent === assembly)).toBe(true)
  })
})
