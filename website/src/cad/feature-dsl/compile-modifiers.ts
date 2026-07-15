import type { OpenCascadeModule } from './compiler-context'

export const modifierFeatureDSLTypeList = ['fillet', 'chamfer'] as const

export const modifierFeatureDSLTypes = new Set<string>(modifierFeatureDSLTypeList)

export function applyFeatureDSLFillet(openCascade: OpenCascadeModule, shape: any, radius: number, featureID: string) {
  if (radius <= 0) {
    throw new Error(`Feature ${featureID} fillet radius must be positive`)
  }
  const filletBuilder = new openCascade.BRepFilletAPI_MakeFillet(shape, openCascade.ChFi3d_FilletShape.ChFi3d_Rational)
  let edgeCount = 0
  const explorer = new openCascade.TopExp_Explorer_1()
  for (
    explorer.Init(shape, openCascade.TopAbs_ShapeEnum.TopAbs_EDGE, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE);
    explorer.More();
    explorer.Next()
  ) {
    filletBuilder.Add_2(radius, openCascade.TopoDS.Edge_1(explorer.Current()))
    edgeCount += 1
  }
  if (edgeCount === 0) {
    throw new Error(`Feature ${featureID} fillet found no edges`)
  }
  filletBuilder.Build(new openCascade.Message_ProgressRange_1())
  return filletBuilder.Shape()
}

export function applyFeatureDSLChamfer(openCascade: OpenCascadeModule, shape: any, distance: number, featureID: string) {
  if (distance <= 0) {
    throw new Error(`Feature ${featureID} chamfer distance must be positive`)
  }
  const chamferBuilder = new openCascade.BRepFilletAPI_MakeChamfer(shape)
  let edgeCount = 0
  const explorer = new openCascade.TopExp_Explorer_1()
  for (
    explorer.Init(shape, openCascade.TopAbs_ShapeEnum.TopAbs_EDGE, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE);
    explorer.More();
    explorer.Next()
  ) {
    chamferBuilder.Add_2(distance, openCascade.TopoDS.Edge_1(explorer.Current()))
    edgeCount += 1
  }
  if (edgeCount === 0) {
    throw new Error(`Feature ${featureID} chamfer found no edges`)
  }
  try {
    chamferBuilder.Build(new openCascade.Message_ProgressRange_1())
  } catch (error) {
    throw new Error(`Feature ${featureID} chamfer could not be built`, { cause: error })
  }
  if (!chamferBuilder.IsDone()) {
    throw new Error(`Feature ${featureID} chamfer could not be built`)
  }
  return chamferBuilder.Shape()
}
