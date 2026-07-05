import { describe, expect, test } from 'vitest'

import { viewCubeFaces } from './view-controller'

describe('view controller definitions', () => {
  test('defines the six primary view cube faces', () => {
    expect(viewCubeFaces.map((face) => face.id)).toEqual(['front', 'back', 'right', 'left', 'top', 'bottom'])
    expect(viewCubeFaces.every((face) => face.label.length > 0)).toBe(true)
  })
})
