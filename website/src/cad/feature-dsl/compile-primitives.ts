export const primitiveFeatureDSLTypeList = [
  'box',
  'box_cut',
  'cylinder',
  'cylinder_cut',
  'sphere',
  'ellipsoid',
  'ellipse_extrude',
] as const

export const primitiveFeatureDSLTypes = new Set<string>(primitiveFeatureDSLTypeList)
