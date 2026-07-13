import * as THREE from 'three'

import { disposeObject3DResources } from './three-object-resources'

export type ModelPreviewDisplayOptions = {
  measurement: boolean
  section: boolean
  showEdges: boolean
}

export type ModelPreviewMeasurement = {
  center: { x: number; y: number; z: number }
  modelCount: number
  size: { x: number; y: number; z: number }
}

export const defaultModelPreviewDisplayOptions: ModelPreviewDisplayOptions = {
  measurement: false,
  section: false,
  showEdges: false,
}

const edgeOverlayFlag = 'litecadEdgeOverlay'

export function syncModelPreviewEdgeOverlays(root: THREE.Object3D, enabled: boolean) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData[edgeOverlayFlag]) {
      return
    }
    removeEdgeOverlays(object)
    if (!enabled || !(object.geometry instanceof THREE.BufferGeometry)) {
      return
    }
    const overlay = new THREE.LineSegments(
      new THREE.EdgesGeometry(object.geometry, 32),
      new THREE.LineBasicMaterial({
        color: 0x1f2937,
        depthTest: true,
        opacity: 0.34,
        transparent: true,
      }),
    )
    overlay.name = 'LiteCAD edge overlay'
    overlay.renderOrder = 18
    overlay.userData[edgeOverlayFlag] = true
    object.add(overlay)
  })
}

export function removeEdgeOverlays(root: THREE.Object3D) {
  const overlays: THREE.Object3D[] = []
  root.traverse((object) => {
    if (object.userData[edgeOverlayFlag]) {
      overlays.push(object)
    }
  })
  overlays.forEach((overlay) => {
    overlay.parent?.remove(overlay)
    disposeObject3DResources(overlay)
  })
}

export function applyModelPreviewClipping(root: THREE.Object3D, clippingPlane?: THREE.Plane) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) {
      return
    }
    for (const material of previewMaterials(object.material)) {
      material.clippingPlanes = clippingPlane ? [clippingPlane] : null
      material.clipShadows = Boolean(clippingPlane)
      material.needsUpdate = true
    }
  })
}

export function measureModelPreviewObjects(objects: Iterable<THREE.Object3D>): ModelPreviewMeasurement | undefined {
  const bounds = new THREE.Box3()
  let modelCount = 0
  for (const object of objects) {
    if (!object.visible) {
      continue
    }
    bounds.expandByObject(object)
    modelCount += 1
  }
  if (modelCount === 0 || bounds.isEmpty()) {
    return undefined
  }
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  bounds.getSize(size)
  bounds.getCenter(center)
  return {
    center: vectorToMeasurement(center),
    modelCount,
    size: vectorToMeasurement(size),
  }
}

export function formatModelPreviewMeasurementValue(value: number) {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const abs = Math.abs(value)
  if (abs >= 100) {
    return value.toFixed(1)
  }
  if (abs >= 10) {
    return value.toFixed(2)
  }
  return value.toFixed(3)
}

function previewMaterials(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material]
}

function vectorToMeasurement(vector: THREE.Vector3) {
  return { x: vector.x, y: vector.y, z: vector.z }
}
