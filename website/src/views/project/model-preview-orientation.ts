import * as THREE from 'three'

export function orientCADPreviewObject(object: THREE.Object3D) {
  object.rotation.x = -Math.PI / 2
  object.updateMatrixWorld(true)
}
