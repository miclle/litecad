export const sketchFeatureDSLTypeList = ['extrude', 'extrude_cut', 'tapered_extrude', 'revolve', 'sweep', 'loft'] as const

export const sketchFeatureDSLTypes = new Set<string>(sketchFeatureDSLTypeList)
