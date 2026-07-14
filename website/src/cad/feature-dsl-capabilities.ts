export const LITECAD_FEATURE_DSL_CAPABILITY_REGISTRY = {
  version: 1,
  features: [
    'sketch',
    'box',
    'box_cut',
    'extrude',
    'extrude_cut',
    'cylinder',
    'cylinder_cut',
    'sphere',
    'ellipsoid',
    'ellipse_extrude',
    'tapered_extrude',
    'revolve',
    'sweep',
    'loft',
    'fillet',
    'chamfer',
    'boolean',
  ],
  booleanOperations: ['union', 'subtract', 'intersect'],
  sketchPlanes: ['XY', 'XZ', 'YZ'],
} as const

const supportedFeatureDSLTypes = new Set<string>(LITECAD_FEATURE_DSL_CAPABILITY_REGISTRY.features)

export function isSupportedFeatureDSLType(type: unknown): type is (typeof LITECAD_FEATURE_DSL_CAPABILITY_REGISTRY.features)[number] {
  return typeof type === 'string' && supportedFeatureDSLTypes.has(type)
}

export function assertFeatureDSLCompilerCoverage(compilerTypes: readonly string[]) {
  const compilerTypeSet = new Set(compilerTypes)
  const missing = LITECAD_FEATURE_DSL_CAPABILITY_REGISTRY.features.filter((type) => !compilerTypeSet.has(type))
  const extra = compilerTypes.filter((type) => !supportedFeatureDSLTypes.has(type))
  if (missing.length === 0 && extra.length === 0) {
    return
  }
  const details = [
    missing.length > 0 ? `missing ${missing.join(', ')}` : '',
    extra.length > 0 ? `extra ${extra.join(', ')}` : '',
  ].filter(Boolean)
  throw new Error(`Feature DSL compiler coverage mismatch: ${details.join('; ')}`)
}
