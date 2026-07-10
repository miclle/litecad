import * as THREE from 'three'

import type { CadKernelMesh } from 'src/cad/kernel-protocol'

export type KernelMeshPickTarget = {
  modelId: string
  nodeId: string
  name: string
}

export function createKernelMeshPreviewObject(
  mesh: CadKernelMesh,
  pickTargets: readonly KernelMeshPickTarget[] = [],
  componentMeshes: readonly CadKernelMesh[] = [],
  fallbackModelId = '',
) {
  if (pickTargets.length > 1 || componentMeshes.length > 0) {
    const pickableMeshes = componentMeshes.length > 0 ? componentMeshes : splitKernelMeshIntoComponents(mesh)
    if (pickableMeshes.length > 0) {
      const object = new THREE.Group()
      object.name = 'Browser kernel preview'
      pickableMeshes.forEach((componentMesh, index) => {
        const target =
          pickTargets[index] ??
          (fallbackModelId
            ? { modelId: fallbackModelId, nodeId: `node_${fallbackModelId}_component_${index + 1}`, name: `Browser kernel component ${index + 1}` }
            : undefined)
        const componentObject = createKernelMeshObject(componentMesh, target?.name ?? `Browser kernel preview mesh ${index + 1}`)
        if (target) {
          componentObject.userData.litecadModelId = target.modelId
          componentObject.userData.litecadNodeId = target.nodeId
        }
        object.add(componentObject)
      })
      return object
    }
  }

  const object = new THREE.Group()
  object.name = 'Browser kernel preview'
  object.add(createKernelMeshObject(mesh, 'Browser kernel preview mesh'))
  return object
}

function createKernelMeshObject(mesh: CadKernelMesh, name: string) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
  if (mesh.normals.length === mesh.positions.length) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3))
  }
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1))
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals()
  }
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const previewMesh = new THREE.Mesh(geometry)
  previewMesh.name = name
  return previewMesh
}

function splitKernelMeshIntoComponents(mesh: CadKernelMesh): CadKernelMesh[] {
  const triangleCount = Math.floor(mesh.indices.length / 3)
  if (triangleCount <= 1) {
    return [mesh]
  }

  const parents = Array.from({ length: triangleCount }, (_value, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]]
      current = parents[current]
    }
    return current
  }
  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot
    }
  }

  const firstTriangleByVertex = new Map<string, number>()
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = mesh.indices[triangleIndex * 3 + corner]
      const vertexKey = kernelVertexKey(mesh.positions, vertexIndex)
      const firstTriangle = firstTriangleByVertex.get(vertexKey)
      if (firstTriangle === undefined) {
        firstTriangleByVertex.set(vertexKey, triangleIndex)
      } else {
        union(firstTriangle, triangleIndex)
      }
    }
  }

  const trianglesByRoot = new Map<number, number[]>()
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const root = find(triangleIndex)
    const triangles = trianglesByRoot.get(root) ?? []
    triangles.push(triangleIndex)
    trianglesByRoot.set(root, triangles)
  }

  return [...trianglesByRoot.values()]
    .sort((left, right) => left[0] - right[0])
    .map((triangles) => buildKernelMeshComponent(mesh, triangles))
}

function buildKernelMeshComponent(mesh: CadKernelMesh, triangles: readonly number[]): CadKernelMesh {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const nextIndexBySourceIndex = new Map<number, number>()

  const appendVertex = (sourceIndex: number) => {
    const existingIndex = nextIndexBySourceIndex.get(sourceIndex)
    if (existingIndex !== undefined) {
      return existingIndex
    }
    const nextIndex = positions.length / 3
    positions.push(mesh.positions[sourceIndex * 3] ?? 0, mesh.positions[sourceIndex * 3 + 1] ?? 0, mesh.positions[sourceIndex * 3 + 2] ?? 0)
    if (mesh.normals.length === mesh.positions.length) {
      normals.push(mesh.normals[sourceIndex * 3] ?? 0, mesh.normals[sourceIndex * 3 + 1] ?? 0, mesh.normals[sourceIndex * 3 + 2] ?? 1)
    }
    nextIndexBySourceIndex.set(sourceIndex, nextIndex)
    return nextIndex
  }

  for (const triangleIndex of triangles) {
    indices.push(
      appendVertex(mesh.indices[triangleIndex * 3]),
      appendVertex(mesh.indices[triangleIndex * 3 + 1]),
      appendVertex(mesh.indices[triangleIndex * 3 + 2]),
    )
  }

  return { positions, normals, indices }
}

function kernelVertexKey(positions: readonly number[], vertexIndex: number) {
  const precision = 1e6
  const x = Math.round((positions[vertexIndex * 3] ?? 0) * precision)
  const y = Math.round((positions[vertexIndex * 3 + 1] ?? 0) * precision)
  const z = Math.round((positions[vertexIndex * 3 + 2] ?? 0) * precision)
  return `${x}:${y}:${z}`
}
