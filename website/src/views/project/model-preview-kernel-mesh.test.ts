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

  test('splits disconnected kernel mesh islands into pickable document-node objects', () => {
    const object = createKernelMeshPreviewObject(
      {
        positions: [
          0, 0, 0, 1, 0, 0, 0, 1, 0,
          10, 0, 0, 11, 0, 0, 10, 1, 0,
        ],
        normals: [
          0, 0, 1, 0, 0, 1, 0, 0, 1,
          0, 0, 1, 0, 0, 1, 0, 0, 1,
        ],
        indices: [0, 1, 2, 3, 4, 5],
      },
      [
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_1', name: 'Left pulley' },
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_2', name: 'Right pulley' },
      ],
    )

    expect(object.children).toHaveLength(2)
    expect(object.children.map((child) => child.userData.litecadNodeId)).toEqual([
      'node_mdl_step_component_1',
      'node_mdl_step_component_2',
    ])
    expect(object.children.map((child) => child.name)).toEqual(['Left pulley', 'Right pulley'])
  })

  test('uses kernel-provided component meshes as pickable document-node objects', () => {
    const object = createKernelMeshPreviewObject(
      {
        positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
      },
      [
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_1', name: 'Left pulley' },
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_2', name: 'Right pulley' },
      ],
      [
        {
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
        },
        {
          positions: [10, 0, 0, 11, 0, 0, 10, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
        },
      ],
    )

    expect(object.children).toHaveLength(2)
    expect(object.children.map((child) => child.userData.litecadNodeId)).toEqual([
      'node_mdl_step_component_1',
      'node_mdl_step_component_2',
    ])
    expect(object.children.map((child) => child.name)).toEqual(['Left pulley', 'Right pulley'])
  })

  test('uses deterministic component node ids when pick targets are not ready yet', () => {
    const object = createKernelMeshPreviewObject(
      {
        positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
      },
      [],
      [
        {
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
        },
        {
          positions: [10, 0, 0, 11, 0, 0, 10, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
        },
      ],
      'mdl_step',
    )

    expect(object.children).toHaveLength(2)
    expect(object.children.map((child) => child.userData.litecadNodeId)).toEqual([
      'node_mdl_step_component_1',
      'node_mdl_step_component_2',
    ])
  })
})
