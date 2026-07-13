import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { createGridLineGeometry, createWorldGrid, niceGridStep } from './model-preview-grid'

describe('model preview grid helpers', () => {
  it('chooses readable CAD grid steps across model radii', () => {
    expect(niceGridStep(0.02)).toBe(0.01)
    expect(niceGridStep(12)).toBe(2)
    expect(niceGridStep(42)).toBe(5)
    expect(niceGridStep(82)).toBe(10)
  })

  it('builds line geometry only for included grid indexes', () => {
    const geometry = createGridLineGeometry(4, 2, (index) => index === 0)
    const position = geometry.getAttribute('position')

    expect(position.itemSize).toBe(3)
    expect(position.count).toBe(4)
  })

  it('builds a world grid group with minor grid, major grid, and CAD axes', () => {
    const grid = createWorldGrid(4)

    expect(grid.name).toBe('Perspective CAD grid')
    expect(grid.children).toHaveLength(5)
    expect(grid.children[0]).toBeInstanceOf(THREE.LineSegments)
    expect(grid.children[1]).toBeInstanceOf(THREE.LineSegments)
    expect(grid.children.slice(2).map((child) => child.name)).toEqual(['World X axis', 'World Y axis', 'World Z axis'])
  })
})
