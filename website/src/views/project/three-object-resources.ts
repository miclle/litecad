import * as THREE from 'three'

export function disposeObject3DResources(root: THREE.Object3D) {
  const disposedGeometries = new Set<THREE.BufferGeometry>()
  const disposedMaterials = new Set<THREE.Material>()
  const disposedTextures = new Set<THREE.Texture>()

  const disposeMaterial = (material: THREE.Material) => {
    if (disposedMaterials.has(material)) {
      return
    }
    const materialRecord = material as THREE.Material & Record<string, unknown>
    for (const value of Object.values(materialRecord)) {
      if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
        value.dispose()
        disposedTextures.add(value)
      }
    }
    material.dispose()
    disposedMaterials.add(material)
  }

  root.traverse((object) => {
    const disposableObject = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry
      material?: THREE.Material | THREE.Material[]
    }
    if (disposableObject.geometry instanceof THREE.BufferGeometry && !disposedGeometries.has(disposableObject.geometry)) {
      disposableObject.geometry.dispose()
      disposedGeometries.add(disposableObject.geometry)
    }
    for (const value of Object.values(disposableObject.userData)) {
      if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
        value.dispose()
        disposedTextures.add(value)
      } else if (value instanceof THREE.Material) {
        disposeMaterial(value)
      }
    }
    const { material } = disposableObject
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial)
    } else if (material instanceof THREE.Material) {
      disposeMaterial(material)
    }
  })
}
