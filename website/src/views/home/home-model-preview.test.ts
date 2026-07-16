import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'

import { createAnimationFrameBatch, createHomePreviewEnvironment, disposeSceneResources } from './home-model-preview-resources'
import { createWorldGrid, modelPreviewGridPlaneOffset } from 'src/views/project/model-preview-grid'

describe('home model preview resources', () => {
  test('disposes directional-light shadow resources with the scene', () => {
    const scene = new THREE.Scene()
    const light = new THREE.DirectionalLight()
    const dispose = vi.spyOn(light, 'dispose')
    scene.add(light)

    disposeSceneResources(scene)

    expect(dispose).toHaveBeenCalledOnce()
  })

  test('coalesces repeated work into one animation frame', () => {
    const callbacks: FrameRequestCallback[] = []
    const cancel = vi.fn()
    const callback = vi.fn()
    const batch = createAnimationFrameBatch(callback, {
      cancel,
      request: (frameCallback) => {
        callbacks.push(frameCallback)
        return callbacks.length
      },
    })

    batch.schedule()
    batch.schedule()
    expect(callbacks).toHaveLength(1)

    callbacks[0](16)
    expect(callback).toHaveBeenCalledOnce()

    batch.schedule()
    batch.cancel()
    expect(cancel).toHaveBeenCalledWith(2)
  })

  test('uses the detail preview world grid scale and ground placement', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6))
    model.position.set(1, 2, 3)
    model.updateMatrixWorld(true)

    const { scene, worldGrid: grid } = createHomePreviewEnvironment(model)
    const bounds = new THREE.Box3().setFromObject(model)
    const sphere = new THREE.Sphere()
    bounds.getBoundingSphere(sphere)
    const radius = Math.max(sphere.radius, 1)
    const detailGrid = createWorldGrid(radius)

    expect(scene).toBeInstanceOf(THREE.Scene)
    expect((scene.background as THREE.Color).getHex()).toBe(0xf8fafc)
    expect(scene.fog).toBeInstanceOf(THREE.Fog)
    expect((scene.fog as THREE.Fog).color.getHex()).toBe(0xf8fafc)
    expect(scene.getObjectByName('Perspective CAD grid')).toBe(grid)
    expect(
      scene.children.some(
        (child) => child instanceof THREE.Mesh && child.material instanceof THREE.ShadowMaterial,
      ),
    ).toBe(false)
    expect(grid.name).toBe('Perspective CAD grid')
    expect(grid.children.slice(0, 2).every((child) => child instanceof THREE.LineSegments)).toBe(true)
    expect(grid.position.toArray()).toEqual([
      sphere.center.x,
      bounds.min.y - radius * modelPreviewGridPlaneOffset,
      sphere.center.z,
    ])
    for (const axisName of ['World X axis', 'World Y axis', 'World Z axis']) {
      const homeAxis = grid.getObjectByName(axisName) as THREE.Mesh<THREE.CylinderGeometry>
      const detailAxis = detailGrid.getObjectByName(axisName) as THREE.Mesh<THREE.CylinderGeometry>
      expect(homeAxis.geometry.parameters.height).toBe(detailAxis.geometry.parameters.height)
      expect(homeAxis.geometry.parameters.radiusTop).toBe(detailAxis.geometry.parameters.radiusTop)
      expect(homeAxis.geometry.parameters.radiusBottom).toBe(detailAxis.geometry.parameters.radiusBottom)
    }
  })
})
