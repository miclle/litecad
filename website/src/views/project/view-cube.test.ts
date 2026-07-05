import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import {
  createChamferedCubeGeometry,
  getSurfaceNormal,
  viewCubeChamferHeight,
  viewCubeCornerChamferHeight,
  viewCubeCornerChamferScale,
  viewCubeFaces,
  viewCubeHalfSize,
  viewCubeSize,
} from './view-cube'

describe('view cube geometry', () => {
  test('uses compact English face labels', () => {
    expect(viewCubeFaces.map((face) => face.label)).toEqual(['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'])
  })

  test('builds larger corner surfaces without changing edge chamfer size', () => {
    const { surfaces } = createChamferedCubeGeometry(viewCubeSize, viewCubeChamferHeight, viewCubeCornerChamferHeight)
    const corner = surfaces.find((surface) => surface.kind === 'corner')
    expect(corner).toBeDefined()

    expect(viewCubeCornerChamferScale).toBeGreaterThan(1)
    expect(viewCubeCornerChamferScale).toBeLessThan(2)
    expect(viewCubeCornerChamferHeight).toBe(viewCubeChamferHeight * viewCubeCornerChamferScale)

    const cornerInset = viewCubeHalfSize - viewCubeCornerChamferHeight
    const cornerPlaneConstant = viewCubeHalfSize + cornerInset * 2
    for (const point of corner?.points ?? []) {
      expect(point.reduce((sum, value) => sum + Math.abs(value), 0)).toBeCloseTo(cornerPlaneConstant)
    }

    const edgeSurface = surfaces.find((surface) => surface.kind === 'edge')
    expect(edgeSurface).toBeDefined()
    const edgeInset = viewCubeHalfSize - viewCubeChamferHeight
    const edgePlaneConstant = (viewCubeHalfSize + edgeInset) / Math.sqrt(2)
    const edgeNormal = getSurfaceNormal(edgeSurface?.points ?? [])
    for (const point of edgeSurface?.points ?? []) {
      expect(Math.abs(edgeNormal.dot(new THREE.Vector3(...point)))).toBeCloseTo(edgePlaneConstant)
    }
  })
})
