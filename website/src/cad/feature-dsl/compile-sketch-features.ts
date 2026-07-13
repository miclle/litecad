export const sketchFeatureDSLTypeList = ['extrude', 'extrude_cut', 'revolve', 'sweep', 'loft'] as const

export const sketchFeatureDSLTypes = new Set<string>(sketchFeatureDSLTypeList)
