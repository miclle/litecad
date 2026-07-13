import { booleanFeatureDSLTypeList, booleanFeatureDSLTypes } from './compile-booleans'
import { modifierFeatureDSLTypeList, modifierFeatureDSLTypes } from './compile-modifiers'
import { primitiveFeatureDSLTypeList, primitiveFeatureDSLTypes } from './compile-primitives'
import { sketchFeatureDSLTypeList, sketchFeatureDSLTypes } from './compile-sketch-features'

export type FeatureDSLCompilerFamily = 'definition' | 'primitive' | 'sketch' | 'boolean' | 'modifier'

export const FEATURE_DSL_COMPILER_TYPES = [
  'sketch',
  ...primitiveFeatureDSLTypeList,
  ...sketchFeatureDSLTypeList,
  ...modifierFeatureDSLTypeList,
  ...booleanFeatureDSLTypeList,
] as const

export function featureDSLCompilerFamily(featureType: string): FeatureDSLCompilerFamily {
  if (featureType === 'sketch') return 'definition'
  if (primitiveFeatureDSLTypes.has(featureType)) return 'primitive'
  if (sketchFeatureDSLTypes.has(featureType)) return 'sketch'
  if (booleanFeatureDSLTypes.has(featureType)) return 'boolean'
  if (modifierFeatureDSLTypes.has(featureType)) return 'modifier'
  throw new Error(`Unsupported feature DSL type: ${featureType}`)
}
