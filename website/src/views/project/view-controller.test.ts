import { describe, expect, test } from 'vitest'

import { createChamferedCubeGeometry, viewCubeChamferHeight, viewCubeFaces, viewCubeSize } from './view-cube'

describe('view controller definitions', () => {
  test('defines the six primary view cube faces', () => {
    expect(viewCubeFaces.map((face) => face.id)).toEqual(['front', 'back', 'right', 'left', 'top', 'bottom'])
    expect(viewCubeFaces.every((face) => face.label.length > 0)).toBe(true)
  })

  test('builds main, edge, and corner hit surfaces for the chamfered cube', () => {
    const { edgeGeometry, geometry, surfaces } = createChamferedCubeGeometry(viewCubeSize, viewCubeChamferHeight)

    expect(surfaces.filter((surface) => surface.kind === 'main')).toHaveLength(6)
    expect(surfaces.filter((surface) => surface.kind === 'edge')).toHaveLength(12)
    expect(surfaces.filter((surface) => surface.kind === 'corner')).toHaveLength(8)
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
    expect(edgeGeometry.getAttribute('position').count).toBeGreaterThan(0)
  })
})
