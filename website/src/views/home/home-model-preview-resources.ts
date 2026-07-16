import * as THREE from 'three'

import {
  createWorldGrid,
  modelPreviewGridPlaneOffset,
  modelPreviewViewportBackground,
} from 'src/views/project/model-preview-grid'

type AnimationFrameScheduler = {
  cancel: (frameID: number) => void
  request: (callback: FrameRequestCallback) => number
}

export function createAnimationFrameBatch(
  callback: () => void,
  scheduler: AnimationFrameScheduler = {
    cancel: window.cancelAnimationFrame.bind(window),
    request: window.requestAnimationFrame.bind(window),
  },
) {
  let frameID: number | null = null

  return {
    cancel: () => {
      if (frameID === null) {
        return
      }
      scheduler.cancel(frameID)
      frameID = null
    },
    schedule: () => {
      if (frameID !== null) {
        return
      }
      frameID = scheduler.request(() => {
        frameID = null
        callback()
      })
    },
  }
}

export function createHomePreviewEnvironment(model: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(model)
  const sphere = new THREE.Sphere()
  bounds.getBoundingSphere(sphere)
  const radius = Math.max(sphere.radius, 1)
  const worldGrid = createWorldGrid(radius)
  worldGrid.position.set(
    sphere.center.x,
    bounds.min.y - radius * modelPreviewGridPlaneOffset,
    sphere.center.z,
  )
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(modelPreviewViewportBackground)
  scene.fog = new THREE.Fog(modelPreviewViewportBackground, 40, 520)
  scene.add(model)
  scene.add(worldGrid)
  return { center: sphere.center.clone(), radius, scene, worldGrid }
}

export function disposeSceneResources(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  scene.traverse((object) => {
    const disposable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry
      material?: THREE.Material | THREE.Material[]
    }
    if (disposable.geometry && !geometries.has(disposable.geometry)) {
      disposable.geometry.dispose()
      geometries.add(disposable.geometry)
    }
    const objectMaterials = Array.isArray(disposable.material) ? disposable.material : [disposable.material]
    objectMaterials.forEach((material) => {
      if (material && !materials.has(material)) {
        material.dispose()
        materials.add(material)
      }
    })
    const light = object as THREE.Object3D & { dispose?: () => void; isLight?: boolean }
    if (light.isLight && light.dispose) {
      light.dispose()
    }
  })
}
