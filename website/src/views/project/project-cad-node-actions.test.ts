import { describe, expect, test } from 'vitest'

import { isCADDocumentNodeDeletable } from './project-cad-node-actions'

describe('isCADDocumentNodeDeletable', () => {
  test.each(['step', 'step-component', 'stl', 'glb', 'gltf'])('allows deleting a %s document node', (sourceFormat) => {
    expect(isCADDocumentNodeDeletable({ source_format: sourceFormat })).toBe(true)
  })

  test('rejects missing document nodes', () => {
    expect(isCADDocumentNodeDeletable(undefined)).toBe(false)
  })
})
