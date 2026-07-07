import * as THREE from 'three'

import type { CadKernelMesh } from 'src/cad/kernel-protocol'

export function createKernelMeshPreviewObject(mesh: CadKernelMesh) {
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

  const object = new THREE.Group()
  object.name = 'Browser kernel preview'
  const previewMesh = new THREE.Mesh(geometry)
  previewMesh.name = 'Browser kernel preview mesh'
  object.add(previewMesh)
  return object
}
