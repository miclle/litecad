import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import {
  applyModelPreviewClipping,
  formatModelPreviewMeasurementValue,
  measureModelPreviewObjects,
  removeEdgeOverlays,
  syncModelPreviewEdgeOverlays,
} from './model-preview-tools'

describe('model preview tools', () => {
  test('adds and removes edge overlays for mesh geometry', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshBasicMaterial())

    syncModelPreviewEdgeOverlays(mesh, true)

    expect(mesh.children).toHaveLength(1)
    expect(mesh.children[0]).toBeInstanceOf(THREE.LineSegments)
    expect(mesh.children[0].userData.litecadEdgeOverlay).toBe(true)

    syncModelPreviewEdgeOverlays(mesh, true)
    expect(mesh.children).toHaveLength(1)

    removeEdgeOverlays(mesh)
    expect(mesh.children).toHaveLength(0)
  })

  test('applies and clears clipping planes on mesh materials', () => {
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
    syncModelPreviewEdgeOverlays(mesh, true)
    const overlayMaterial = (mesh.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)

    applyModelPreviewClipping(mesh, plane)

    expect(material.clippingPlanes).toEqual([plane])
    expect(material.clipShadows).toBe(true)
    expect(overlayMaterial.clippingPlanes).toEqual([plane])

    applyModelPreviewClipping(mesh)
    expect(material.clippingPlanes).toBeNull()
    expect(material.clipShadows).toBe(false)
    expect(overlayMaterial.clippingPlanes).toBeNull()
  })

  test('measures visible object bounds', () => {
    const first = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial())
    const second = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())
    second.position.set(10, 0, 0)
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial())
    hidden.visible = false

    const measurement = measureModelPreviewObjects([first, second, hidden])

    expect(measurement?.modelCount).toBe(2)
    expect(measurement?.size.x).toBeCloseTo(12)
    expect(measurement?.size.y).toBeCloseTo(4)
    expect(measurement?.size.z).toBeCloseTo(6)
    expect(measurement?.center.x).toBeCloseTo(5)
  })

  test('formats measurement values by scale', () => {
    expect(formatModelPreviewMeasurementValue(128.234)).toBe('128.2')
    expect(formatModelPreviewMeasurementValue(12.345)).toBe('12.35')
    expect(formatModelPreviewMeasurementValue(1.2345)).toBe('1.234')
    expect(formatModelPreviewMeasurementValue(Number.NaN)).toBe('0')
  })
})
