import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import { createKernelMeshPreviewObject } from './model-preview-kernel-mesh'

describe('createKernelMeshPreviewObject', () => {
  test('creates a Three.js mesh from browser-kernel preview buffers', () => {
    const object = createKernelMeshPreviewObject({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    })

    expect(object.children).toHaveLength(1)
    const mesh = object.children[0]
    expect(mesh).toBeInstanceOf(THREE.Mesh)
    if (!(mesh instanceof THREE.Mesh)) {
      throw new Error('expected kernel preview child to be a mesh')
    }
    expect(mesh.name).toBe('Browser kernel preview mesh')
    expect(mesh.geometry.getAttribute('position').count).toBe(3)
    expect(mesh.geometry.getAttribute('normal').count).toBe(3)
    expect(mesh.geometry.getIndex()?.count).toBe(3)
  })

  test('computes normals when kernel output omits normal buffers', () => {
    const object = createKernelMeshPreviewObject({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [],
      indices: [0, 1, 2],
    })

    const mesh = object.children[0]
    expect(mesh).toBeInstanceOf(THREE.Mesh)
    if (!(mesh instanceof THREE.Mesh)) {
      throw new Error('expected kernel preview child to be a mesh')
    }
    expect(mesh.geometry.getAttribute('normal').count).toBe(3)
  })
})
