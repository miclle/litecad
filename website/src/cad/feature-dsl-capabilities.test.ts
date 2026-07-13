import { describe, expect, it } from 'vitest'

import { FEATURE_DSL_COMPILER_TYPES } from './feature-dsl/compile-feature'
import {
  LITECAD_FEATURE_DSL_CAPABILITY_REGISTRY,
  assertFeatureDSLCompilerCoverage,
  isSupportedFeatureDSLType,
} from './feature-dsl-capabilities'

describe('Feature DSL capabilities', () => {
  it('keeps protocol capabilities and compiler dispatch coverage identical', () => {
    expect(() => assertFeatureDSLCompilerCoverage(FEATURE_DSL_COMPILER_TYPES)).not.toThrow()
    expect([...FEATURE_DSL_COMPILER_TYPES].sort()).toEqual([...LITECAD_FEATURE_DSL_CAPABILITY_REGISTRY.features].sort())
  })

  it('rejects missing, extra, and unknown feature types', () => {
    expect(isSupportedFeatureDSLType('box')).toBe(true)
    expect(isSupportedFeatureDSLType('unsupported')).toBe(false)
    expect(() => assertFeatureDSLCompilerCoverage(FEATURE_DSL_COMPILER_TYPES.filter((type) => type !== 'loft'))).toThrow(
      'Feature DSL compiler coverage mismatch: missing loft',
    )
    expect(() => assertFeatureDSLCompilerCoverage([...FEATURE_DSL_COMPILER_TYPES, 'unsupported'])).toThrow(
      'Feature DSL compiler coverage mismatch: extra unsupported',
    )
  })
})
