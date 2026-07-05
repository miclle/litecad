import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import {
  createOrientation,
  createFreeOrientation,
  createSquaredOrientation,
  initialViewOrientation,
  orientationDistance,
  orientationToViewUp,
  orientationToViewDirection,
  rotateOrientation,
  rotateOrientationToDirection,
} from './view-orientation'

describe('view orientation helpers', () => {
  test('starts from a front-biased CAD preview orientation', () => {
    expect(initialViewOrientation.yaw).toBeLessThan(30)
    expect(initialViewOrientation.pitch).toBeLessThan(25)
  })

  test('normalizes yaw and clamps pitch', () => {
    expect(createOrientation(-45, 120)).toEqual({ yaw: 315, pitch: 89 })
    expect(createOrientation(405, -120)).toEqual({ yaw: 45, pitch: -89 })
  })

  test('rotates a free orientation around the current up vector', () => {
    const rotated = rotateOrientation(initialViewOrientation, { horizontal: 45 })

    expect(orientationDistance(initialViewOrientation, rotated)).toBeGreaterThan(35)
    expect(orientationDistance(initialViewOrientation, rotated)).toBeLessThan(45)
  })

  test('rotates to a target direction while preserving a valid up vector', () => {
    const targetDirection = new THREE.Vector3(1, 0, 0)
    const rotated = rotateOrientationToDirection(initialViewOrientation, targetDirection)

    expect(orientationToViewDirection(rotated).angleTo(targetDirection)).toBeLessThan(0.001)
    expect(rotated.up).toHaveLength(3)
  })

  test('squares a rolled view while keeping the current view direction', () => {
    const rolledFront = createFreeOrientation(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
    const squared = createSquaredOrientation(rolledFront)

    expect(orientationToViewDirection(squared).angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(0.001)
    expect(orientationToViewUp(squared).angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(0.001)
  })
})
