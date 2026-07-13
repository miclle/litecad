import { describe, expect, it } from 'vitest'

import { featureDSLCompilerFamily } from './compile-feature'

describe('Feature DSL compiler dispatch', () => {
  it.each([
    ['box', 'primitive'],
    ['sphere', 'primitive'],
    ['extrude', 'sketch'],
    ['loft', 'sketch'],
    ['boolean', 'boolean'],
    ['fillet', 'modifier'],
    ['chamfer', 'modifier'],
    ['sketch', 'definition'],
  ] as const)('routes %s through the %s family', (featureType, family) => {
    expect(featureDSLCompilerFamily(featureType)).toBe(family)
  })

  it('rejects unsupported feature types at the dispatch boundary', () => {
    expect(() => featureDSLCompilerFamily('unsupported')).toThrow('Unsupported feature DSL type: unsupported')
  })
})
