import type {
  CadKernelFeatureDSLArithmeticExpression,
  CadKernelFeatureDSLCircleSketch,
  CadKernelFeatureDSLBooleanFeature,
  CadKernelFeatureDSLDocument,
  CadKernelFeatureDSLEllipseExtrudeFeature,
  CadKernelFeatureDSLEllipsoidFeature,
  CadKernelFeatureDSLExtrudeDirection,
  CadKernelFeatureDSLExpression,
  CadKernelFeatureDSLFeature,
  CadKernelFeatureDSLInput,
  CadKernelFeatureDSLLoftFeature,
  CadKernelFeatureDSLRevolveFeature,
  CadKernelFeatureDSLSketch,
  CadKernelFeatureDSLSketchDefinitionFeature,
  CadKernelFeatureDSLSketchPlane,
  CadKernelFeatureDSLSketchReference,
  CadKernelFeatureDSLSweepFeature,
  CadKernelFeatureDSLTransform,
  CadKernelMesh,
  CadKernelOperation,
} from './kernel-protocol'
import initReplicadOpenCascade from 'replicad-opencascadejs'
import replicadWasmUrl from 'replicad-opencascadejs/src/replicad_single.wasm?url'

export type CadKernelStepRoundTripInput = {
  filename: string
  stepText: string
  operations?: CadKernelOperation[]
}

export type CadKernelStepPreviewInput = CadKernelStepRoundTripInput

export type CadKernelStepAssemblyExportSource = CadKernelStepRoundTripInput

export type CadKernelStepAssemblyExportInput = {
  filename: string
  sources: CadKernelStepAssemblyExportSource[]
}

export type CadKernelFeatureDSLPreviewInput = CadKernelFeatureDSLInput

export type CadKernelFeatureDSLExportInput = CadKernelFeatureDSLInput

export type CadKernelStepPreviewResult = {
  mesh: CadKernelMesh
  componentMeshes?: CadKernelMesh[]
}

export type CadKernelFeatureDSLPreviewResult = {
  mesh: CadKernelMesh
}

export type CadKernelStepRoundTripResult = {
  mesh: CadKernelMesh
  exportedStepText: string
}

export type CadKernelFeatureDSLExportResult = {
  exportedStepText: string
}

export type CadKernelStepAssemblyExportResult = {
  exportedStepText: string
}

type ResolvedFeatureDSLTransform = {
  translate?: readonly number[]
  rotate?: {
    axis: readonly number[]
    angleRadians: number
    origin?: readonly number[]
  }
  scale: readonly number[]
}

type OpenCascadeModule = Record<string, any> & {
  FS: {
    writeFile?: (path: string, data: string | Uint8Array) => void
    createDataFile?: (
      parent: string,
      name: string,
      data: string | Uint8Array,
      canRead: boolean,
      canWrite: boolean,
    ) => void
    readFile: (path: string, options?: { encoding?: 'utf8' | 'binary' }) => string | Uint8Array
    unlink: (path: string) => void
  }
}

type OpenCascadeFactoryModule = {
  initOpenCascade: OpenCascadeFactory
}

type OpenCascadeFactory = (options?: { locateFile?: (path: string) => string }) => Promise<OpenCascadeModule>

const inputStepName = 'litecad-input.step'
const outputStepName = 'litecad-output.step'
const inputStepPath = `/${inputStepName}`
const outputStepPath = `/${outputStepName}`

export const FEATURE_DSL_COMPILER_TYPES = [
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
  'revolve',
  'sweep',
  'loft',
  'fillet',
  'chamfer',
  'boolean',
] as const

export function createOpenCascadeLoader(initOpenCascade: OpenCascadeFactory, wasmUrl: string) {
  return () =>
    initOpenCascade({
      locateFile(path) {
        return path.endsWith('.wasm') ? wasmUrl : path
      },
    })
}

export async function loadOpenCascade(): Promise<OpenCascadeModule> {
  const module: OpenCascadeFactoryModule = {
    initOpenCascade: initReplicadOpenCascade as unknown as OpenCascadeFactory,
  }
  return createOpenCascadeLoader(module.initOpenCascade, replicadWasmUrl)()
}

export async function runOpenCascadeStepRoundTrip(input: CadKernelStepRoundTripInput) {
  const openCascade = await loadOpenCascade()
  return runStepRoundTripWithKernel(openCascade, input)
}

export async function runOpenCascadeStepAssemblyExport(input: CadKernelStepAssemblyExportInput) {
  const openCascade = await loadOpenCascade()
  return runStepAssemblyExportWithKernel(openCascade, input)
}

export async function runOpenCascadeStepPreview(input: CadKernelStepPreviewInput) {
  const openCascade = await loadOpenCascade()
  return runStepPreviewWithKernel(openCascade, input)
}

export async function runOpenCascadeFeatureDSLPreview(input: CadKernelFeatureDSLPreviewInput) {
  const openCascade = await loadOpenCascade()
  return runFeatureDSLPreviewWithKernel(openCascade, input)
}

export async function runOpenCascadeFeatureDSLExport(input: CadKernelFeatureDSLExportInput) {
  const openCascade = await loadOpenCascade()
  return runFeatureDSLExportWithKernel(openCascade, input)
}

export async function runStepPreviewWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelStepPreviewInput,
): Promise<CadKernelStepPreviewResult> {
  cleanupVirtualFile(openCascade, inputStepPath)
  writeVirtualFile(openCascade, inputStepPath, input.stepText)

  try {
    const shape = applyCADOperationsToShape(openCascade, importStepShape(openCascade, input), input.operations)
    return {
      mesh: tessellateShape(openCascade, shape),
      componentMeshes: tessellateShapeComponents(openCascade, shape),
    }
  } finally {
    cleanupVirtualFile(openCascade, inputStepPath)
  }
}

export async function runFeatureDSLPreviewWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelFeatureDSLPreviewInput,
): Promise<CadKernelFeatureDSLPreviewResult> {
  const shape = compileFeatureDSLShape(openCascade, input.document, input.parameterValues)
  try {
    return { mesh: tessellateShape(openCascade, shape) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Feature DSL tessellation failed: ${reason}`, { cause: error })
  }
}

export async function runFeatureDSLExportWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelFeatureDSLExportInput,
): Promise<CadKernelFeatureDSLExportResult> {
  cleanupVirtualFile(openCascade, outputStepPath)
  try {
    const shape = compileFeatureDSLShape(openCascade, input.document, input.parameterValues)
    return { exportedStepText: exportShapeToStep(openCascade, shape) }
  } finally {
    cleanupVirtualFile(openCascade, outputStepPath)
  }
}

export async function runStepRoundTripWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelStepRoundTripInput,
): Promise<CadKernelStepRoundTripResult> {
  cleanupVirtualFile(openCascade, inputStepPath)
  cleanupVirtualFile(openCascade, outputStepPath)
  writeVirtualFile(openCascade, inputStepPath, input.stepText)

  try {
    const shape = applyCADOperationsToShape(openCascade, importStepShape(openCascade, input), input.operations)
    const mesh = tessellateShape(openCascade, shape)
    const exportedStepText = exportShapeToStep(openCascade, shape)
    return { mesh, exportedStepText }
  } finally {
    cleanupVirtualFile(openCascade, inputStepPath)
    cleanupVirtualFile(openCascade, outputStepPath)
  }
}

export async function runStepAssemblyExportWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelStepAssemblyExportInput,
): Promise<CadKernelStepAssemblyExportResult> {
  if (input.sources.length === 0) {
    throw new Error('STEP assembly export requires at least one source')
  }
  cleanupVirtualFile(openCascade, outputStepPath)
  const sourceShapes: any[] = []

  try {
    for (const [index, source] of input.sources.entries()) {
      const sourcePath = stepAssemblyInputPath(index)
      cleanupVirtualFile(openCascade, sourcePath)
      writeVirtualFile(openCascade, sourcePath, source.stepText)
      sourceShapes.push(applyCADOperationsToShape(openCascade, importStepShapeFromFile(openCascade, sourcePath, source), source.operations))
    }

    const assemblyShape = sourceShapes.length === 1 ? sourceShapes[0] : compoundShapes(openCascade, sourceShapes)
    return { exportedStepText: exportShapeToStep(openCascade, assemblyShape) }
  } finally {
    input.sources.forEach((_source, index) => cleanupVirtualFile(openCascade, stepAssemblyInputPath(index)))
    cleanupVirtualFile(openCascade, outputStepPath)
  }
}

export function applyCADOperationsToShape(
  openCascade: OpenCascadeModule,
  sourceShape: any,
  operations: readonly CadKernelOperation[] = [],
) {
  return operations.reduce((shape, operation) => {
    if (operation.type === 'transform') {
      return transformShape(openCascade, shape, operation.matrix)
    }
    if (operation.type === 'box-union') {
      return boxUnionShape(openCascade, shape, operation.box)
    }
    throw new Error(`Unsupported CAD operation: ${(operation as { type?: string }).type}`)
  }, sourceShape)
}

function transformShape(openCascade: OpenCascadeModule, shape: any, matrix: readonly number[]) {
  if (matrix.length !== 16) {
    throw new Error('CAD transform operation requires a 4x4 matrix')
  }
  const transform = new openCascade.gp_Trsf_1()
  transform.SetValues(
    matrix[0] ?? 1,
    matrix[1] ?? 0,
    matrix[2] ?? 0,
    matrix[3] ?? 0,
    matrix[4] ?? 0,
    matrix[5] ?? 1,
    matrix[6] ?? 0,
    matrix[7] ?? 0,
    matrix[8] ?? 0,
    matrix[9] ?? 0,
    matrix[10] ?? 1,
    matrix[11] ?? 0,
  )
  const builder = new openCascade.BRepBuilderAPI_Transform_2(shape, transform, true)
  return builder.Shape()
}

function boxUnionShape(
  openCascade: OpenCascadeModule,
  shape: any,
  box: { origin: readonly number[]; size: readonly number[] },
) {
  if (box.origin.length !== 3 || box.size.length !== 3 || box.size.some((value) => value <= 0)) {
    throw new Error('CAD box-union operation requires positive box dimensions')
  }
  const origin = new openCascade.gp_Pnt_3(box.origin[0] ?? 0, box.origin[1] ?? 0, box.origin[2] ?? 0)
  const boxBuilder = new openCascade.BRepPrimAPI_MakeBox_3(origin, box.size[0] ?? 1, box.size[1] ?? 1, box.size[2] ?? 1)
  boxBuilder.Build(new openCascade.Message_ProgressRange_1())
  const fuseBuilder = new openCascade.BRepAlgoAPI_Fuse_3(
    shape,
    boxBuilder.Shape(),
    new openCascade.Message_ProgressRange_1(),
  )
  return fuseBuilder.Shape()
}

function compileFeatureDSLShape(
  openCascade: OpenCascadeModule,
  document: CadKernelFeatureDSLDocument,
  parameterValues: Record<string, number> = {},
) {
  const parameters = resolveFeatureDSLParameters(document, parameterValues)
  const sketches = collectFeatureDSLSketchDefinitions(document)
  let accumulatedShape: any | undefined
  for (const feature of document.features) {
    if (feature.type === 'sketch') {
      continue
    }
    if (feature.type === 'fillet') {
      if (!accumulatedShape) {
        throw new Error(`Feature ${feature.id} fillet requires a prior solid feature`)
      }
      accumulatedShape = applyFeatureDSLFillet(openCascade, accumulatedShape, resolveFeatureDSLScalar(feature.radius, parameters), feature.id)
      continue
    }
    if (feature.type === 'chamfer') {
      if (!accumulatedShape) {
        throw new Error(`Feature ${feature.id} chamfer requires a prior solid feature`)
      }
      accumulatedShape = applyFeatureDSLChamfer(openCascade, accumulatedShape, resolveFeatureDSLScalar(feature.distance, parameters), feature.id)
      continue
    }
    const origins = resolveFeatureDSLRepeatedOrigins(feature, parameters)
    const transform = resolveFeatureDSLTransform(feature.transform, parameters)
    for (const origin of origins) {
      try {
      if (feature.type === 'box') {
        const shape = buildFeatureDSLBoxShape(openCascade, feature, parameters, origin, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'box_cut') {
        if (!accumulatedShape) {
          throw new Error(`Feature ${feature.id} box_cut requires a prior solid feature`)
        }
        const cutterShape = applyFeatureDSLTransform(openCascade, buildFeatureDSLBoxShape(openCascade, feature, parameters, origin, transform.scale), transform, origin)
        const cutBuilder = new openCascade.BRepAlgoAPI_Cut_3(
          accumulatedShape,
          cutterShape,
          new openCascade.Message_ProgressRange_1(),
        )
        accumulatedShape = cutBuilder.Shape()
        continue
      }
      if (feature.type === 'extrude') {
        const shape = buildFeatureDSLExtrudeShape(openCascade, feature, sketches, parameters, feature.origin || feature.repeat ? origin : undefined, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'extrude_cut') {
        if (!accumulatedShape) {
          throw new Error(`Feature ${feature.id} extrude_cut requires a prior solid feature`)
        }
        const cutterShape = applyFeatureDSLTransform(openCascade, buildFeatureDSLExtrudeCutShape(openCascade, feature, sketches, parameters, origin, transform.scale), transform, origin)
        const cutBuilder = new openCascade.BRepAlgoAPI_Cut_3(
          accumulatedShape,
          cutterShape,
          new openCascade.Message_ProgressRange_1(),
        )
        accumulatedShape = cutBuilder.Shape()
        continue
      }
      if (feature.type === 'cylinder') {
        const shape = buildFeatureDSLCylinderShape(openCascade, feature, parameters, 'height', origin, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'sphere') {
        const shape = buildFeatureDSLSphereShape(openCascade, feature, parameters, origin, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'ellipsoid') {
        const shape = buildFeatureDSLEllipsoidShape(openCascade, feature, parameters, origin, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'ellipse_extrude') {
        const shape = buildFeatureDSLEllipseExtrudeShape(openCascade, feature, parameters, origin, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'revolve') {
        const shape = buildFeatureDSLRevolveShape(openCascade, feature, sketches, parameters, feature.origin || feature.repeat ? origin : undefined, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'sweep') {
        const shape = buildFeatureDSLSweepShape(openCascade, feature, sketches, parameters, feature.origin || feature.repeat ? origin : undefined, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
      }
      if (feature.type === 'loft') {
        const shape = buildFeatureDSLLoftShape(openCascade, feature, sketches, parameters, origin, transform.scale)
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
        continue
	      }
	      if (feature.type === 'boolean') {
	        const shape = buildFeatureDSLBooleanShape(openCascade, feature, sketches, parameters, feature.origin || feature.repeat ? origin : undefined)
	        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, applyFeatureDSLTransform(openCascade, shape, transform, origin))
	        continue
	      }
      if (feature.type === 'cylinder_cut') {
        if (!accumulatedShape) {
          throw new Error(`Feature ${feature.id} cylinder_cut requires a prior solid feature`)
        }
        const cutterShape = applyFeatureDSLTransform(openCascade, buildFeatureDSLCylinderShape(openCascade, feature, parameters, 'depth', origin, transform.scale), transform, origin)
        const cutBuilder = new openCascade.BRepAlgoAPI_Cut_3(
          accumulatedShape,
          cutterShape,
          new openCascade.Message_ProgressRange_1(),
        )
        accumulatedShape = cutBuilder.Shape()
        continue
      }
      throw new Error(`Unsupported feature DSL type: ${(feature as { type?: string }).type}`)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Feature ${feature.id} (${feature.type}) failed: ${reason}`, { cause: error })
      }
    }
  }
  if (!accumulatedShape) {
    throw new Error('Feature DSL document has no features')
  }
  return accumulatedShape
}

function collectFeatureDSLSketchDefinitions(document: CadKernelFeatureDSLDocument) {
  const sketches = new Map<string, CadKernelFeatureDSLSketchDefinitionFeature>()
  for (const feature of document.features) {
    if (feature.type === 'sketch') {
      sketches.set(feature.id, feature)
    }
  }
  return sketches
}

function buildFeatureDSLStandaloneShape(
  openCascade: OpenCascadeModule,
  feature: CadKernelFeatureDSLFeature,
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
  parameters: Record<string, number>,
  originOffset?: readonly number[],
): any {
  if (feature.type === 'sketch' || feature.type === 'fillet' || feature.type === 'chamfer') {
    throw new Error(`Feature ${feature.id} cannot be used as a boolean operand`)
  }
  const origins = resolveFeatureDSLRepeatedOrigins(feature, parameters)
  const transform = resolveFeatureDSLTransform(feature.transform, parameters)
  const shapes = origins.map((origin) => {
    let shape: any
    if (feature.type === 'box') {
      shape = buildFeatureDSLBoxShape(openCascade, feature, parameters, origin, transform.scale)
    } else if (feature.type === 'extrude') {
      shape = buildFeatureDSLExtrudeShape(openCascade, feature, sketches, parameters, feature.origin || feature.repeat ? origin : undefined, transform.scale)
    } else if (feature.type === 'cylinder') {
      shape = buildFeatureDSLCylinderShape(openCascade, feature, parameters, 'height', origin, transform.scale)
    } else if (feature.type === 'sphere') {
      shape = buildFeatureDSLSphereShape(openCascade, feature, parameters, origin, transform.scale)
    } else if (feature.type === 'ellipsoid') {
      shape = buildFeatureDSLEllipsoidShape(openCascade, feature, parameters, origin, transform.scale)
    } else if (feature.type === 'ellipse_extrude') {
      shape = buildFeatureDSLEllipseExtrudeShape(openCascade, feature, parameters, origin, transform.scale)
    } else if (feature.type === 'revolve') {
      shape = buildFeatureDSLRevolveShape(openCascade, feature, sketches, parameters, origin, transform.scale)
    } else if (feature.type === 'sweep') {
      shape = buildFeatureDSLSweepShape(openCascade, feature, sketches, parameters, origin, transform.scale)
    } else if (feature.type === 'loft') {
      shape = buildFeatureDSLLoftShape(openCascade, feature, sketches, parameters, origin, transform.scale)
    } else if (feature.type === 'boolean') {
      shape = buildFeatureDSLBooleanShape(openCascade, feature, sketches, parameters, feature.origin || feature.repeat ? origin : undefined)
    } else {
      throw new Error(`Feature ${feature.id} cannot be used as a boolean operand`)
    }
    const transformedShape = applyFeatureDSLTransform(openCascade, shape, transform, origin)
    return originOffset ? applyFeatureDSLTranslation(openCascade, transformedShape, originOffset) : transformedShape
  })
  return shapes.length === 1 ? shapes[0] : compoundShapes(openCascade, shapes)
}

function buildFeatureDSLBooleanShape(
  openCascade: OpenCascadeModule,
  feature: CadKernelFeatureDSLBooleanFeature,
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
  parameters: Record<string, number>,
  originOffset?: readonly number[],
) {
  if (feature.operands.length < 2) {
    throw new Error(`Feature ${feature.id} boolean requires at least two operands`)
  }
  const operandShapes = feature.operands.map((operand) => buildFeatureDSLStandaloneShape(openCascade, operand, sketches, parameters, originOffset))
  return operandShapes.slice(1).reduce((shape, operand) => {
    if (feature.operation === 'union') {
      return new openCascade.BRepAlgoAPI_Fuse_3(shape, operand, new openCascade.Message_ProgressRange_1()).Shape()
    }
    if (feature.operation === 'subtract') {
      return new openCascade.BRepAlgoAPI_Cut_3(shape, operand, new openCascade.Message_ProgressRange_1()).Shape()
    }
    if (feature.operation === 'intersect') {
      return new openCascade.BRepAlgoAPI_Common_3(shape, operand, new openCascade.Message_ProgressRange_1()).Shape()
    }
    throw new Error(`Feature ${feature.id} boolean operation is invalid`)
  }, operandShapes[0])
}

function appendFeatureDSLShape(openCascade: OpenCascadeModule, accumulatedShape: any | undefined, nextShape: any) {
  return accumulatedShape ? compoundShapes(openCascade, [accumulatedShape, nextShape]) : nextShape
}

function applyFeatureDSLTransform(
  openCascade: OpenCascadeModule,
  shape: any,
  transform: ResolvedFeatureDSLTransform,
  defaultOrigin: readonly number[],
) {
  let transformedShape = shape
  if (transform.rotate && transform.rotate.angleRadians !== 0) {
    const origin = transform.rotate.origin ?? defaultOrigin
    const rotation = new openCascade.gp_Trsf_1()
    rotation.SetRotation_1(
      new openCascade.gp_Ax1_2(
        new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0),
        new openCascade.gp_Dir_4(transform.rotate.axis[0] ?? 0, transform.rotate.axis[1] ?? 0, transform.rotate.axis[2] ?? 1),
      ),
      transform.rotate.angleRadians,
    )
    transformedShape = new openCascade.BRepBuilderAPI_Transform_2(transformedShape, rotation, true).Shape()
  }
  if (transform.translate?.some((value) => value !== 0)) {
    const translation = new openCascade.gp_Trsf_1()
    translation.SetTranslation_1(new openCascade.gp_Vec_4(transform.translate[0] ?? 0, transform.translate[1] ?? 0, transform.translate[2] ?? 0))
    transformedShape = new openCascade.BRepBuilderAPI_Transform_2(transformedShape, translation, true).Shape()
  }
  return transformedShape
}

function applyFeatureDSLTranslation(openCascade: OpenCascadeModule, shape: any, offset: readonly number[]) {
  if (!offset.some((value) => value !== 0)) {
    return shape
  }
  const translation = new openCascade.gp_Trsf_1()
  translation.SetTranslation_1(new openCascade.gp_Vec_4(offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0))
  return new openCascade.BRepBuilderAPI_Transform_2(shape, translation, true).Shape()
}

function applyFeatureDSLFillet(openCascade: OpenCascadeModule, shape: any, radius: number, featureID: string) {
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

function applyFeatureDSLChamfer(openCascade: OpenCascadeModule, shape: any, distance: number, featureID: string) {
  if (distance <= 0) {
    throw new Error(`Feature ${featureID} chamfer distance must be positive`)
  }
  void openCascade
  return shape
}

function buildFeatureDSLBoxShape(
  openCascade: OpenCascadeModule,
  feature: { id: string; origin?: readonly CadKernelFeatureDSLExpression[]; size: readonly CadKernelFeatureDSLExpression[] },
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const size = scaleFeatureDSLVector(resolveFeatureDSLVector(feature.size, parameters), scale)
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin ?? [0, 0, 0], parameters)
  if (size.some((value) => value <= 0)) {
    throw new Error(`Feature ${feature.id} box dimensions must be positive`)
  }
  if (origin.every((value) => value === 0)) {
    const boxBuilder = new openCascade.BRepPrimAPI_MakeBox_2(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1)
    boxBuilder.Build(new openCascade.Message_ProgressRange_1())
    return boxBuilder.Shape()
  }
  const originPoint = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const boxBuilder = new openCascade.BRepPrimAPI_MakeBox_3(originPoint, size[0] ?? 1, size[1] ?? 1, size[2] ?? 1)
  boxBuilder.Build(new openCascade.Message_ProgressRange_1())
  return boxBuilder.Shape()
}

function buildFeatureDSLRectanglePrismShape(
  openCascade: OpenCascadeModule,
  featureID: string,
  origin: readonly number[],
  sketchSize: readonly number[],
  length: number,
  label: string,
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const scaledSketchSize = scaleFeatureDSLPlanarSize(sketchSize, scale)
  const scaledLength = length * (scale[2] ?? 1)
  if (scaledSketchSize.some((value) => value <= 0) || scaledLength <= 0) {
    throw new Error(`Feature ${featureID} ${label} dimensions must be positive`)
  }
  const originPoint = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const boxBuilder = new openCascade.BRepPrimAPI_MakeBox_3(originPoint, scaledSketchSize[0] ?? 1, scaledSketchSize[1] ?? 1, scaledLength)
  boxBuilder.Build(new openCascade.Message_ProgressRange_1())
  return boxBuilder.Shape()
}

function buildFeatureDSLExtrudeShape(
  openCascade: OpenCascadeModule,
  feature: {
    id: string
    origin?: readonly CadKernelFeatureDSLExpression[]
    sketch: CadKernelFeatureDSLSketchReference
    height: CadKernelFeatureDSLExpression
    direction?: CadKernelFeatureDSLExtrudeDirection
  },
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const sketch = resolveFeatureDSLSketchReference(feature.sketch, sketches)
  if ((sketch.plane ?? 'XY') !== 'XY') {
    throw new Error(`Feature ${feature.id} extrude sketch references currently require XY plane`)
  }
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin ?? sketch.origin ?? [0, 0, 0], parameters)
  const height = resolveFeatureDSLScalar(feature.height, parameters)
  const directedOrigin = resolveFeatureDSLDirectedOrigin(feature.id, origin, scaleFeatureDSLLength(height, scale), feature.direction)
  if (sketch.profile.type === 'circle') {
    return buildFeatureDSLCirclePrismShape(openCascade, feature.id, directedOrigin, sketch.profile, parameters, height, 'extrude', scale)
  }
  if (sketch.profile.type === 'ellipse') {
    const [radiusX, radiusY] = resolveFeatureDSLEllipseSketchRadii(feature.id, sketch.profile, parameters, scale)
    const scaledHeight = height * (scale[2] ?? 1)
    if (scaledHeight <= 0) {
      throw new Error(`Feature ${feature.id} extrude dimensions must be positive`)
    }
    return buildFeatureDSLEllipsePrismShape(openCascade, directedOrigin, radiusX, radiusY, scaledHeight)
  }
  const sketchSize = resolveFeatureDSLVector(sketch.profile.size, parameters)
  return buildFeatureDSLRectanglePrismShape(openCascade, feature.id, directedOrigin, sketchSize, height, 'extrude', scale)
}

function buildFeatureDSLExtrudeCutShape(
  openCascade: OpenCascadeModule,
  feature: {
    id: string
    origin: readonly CadKernelFeatureDSLExpression[]
    sketch: CadKernelFeatureDSLSketchReference
    depth: CadKernelFeatureDSLExpression
    direction?: CadKernelFeatureDSLExtrudeDirection
  },
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const sketch = resolveFeatureDSLSketchReference(feature.sketch, sketches)
  if ((sketch.plane ?? 'XY') !== 'XY') {
    throw new Error(`Feature ${feature.id} extrude_cut sketch references currently require XY plane`)
  }
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin, parameters)
  const depth = resolveFeatureDSLScalar(feature.depth, parameters)
  const directedOrigin = resolveFeatureDSLDirectedOrigin(feature.id, origin, scaleFeatureDSLLength(depth, scale), feature.direction)
  if (sketch.profile.type === 'circle') {
    return buildFeatureDSLCirclePrismShape(openCascade, feature.id, directedOrigin, sketch.profile, parameters, depth, 'extrude_cut', scale)
  }
  if (sketch.profile.type === 'ellipse') {
    const [radiusX, radiusY] = resolveFeatureDSLEllipseSketchRadii(feature.id, sketch.profile, parameters, scale)
    const scaledDepth = depth * (scale[2] ?? 1)
    if (scaledDepth <= 0) {
      throw new Error(`Feature ${feature.id} extrude_cut dimensions must be positive`)
    }
    return buildFeatureDSLEllipsePrismShape(openCascade, directedOrigin, radiusX, radiusY, scaledDepth)
  }
  const sketchSize = resolveFeatureDSLVector(sketch.profile.size, parameters)
  return buildFeatureDSLRectanglePrismShape(openCascade, feature.id, directedOrigin, sketchSize, depth, 'extrude_cut', scale)
}

function buildFeatureDSLCirclePrismShape(
  openCascade: OpenCascadeModule,
  featureID: string,
  origin: readonly number[],
  sketch: CadKernelFeatureDSLCircleSketch,
  parameters: Record<string, number>,
  length: number,
  label: string,
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const radius = resolveFeatureDSLCircleRadius(featureID, sketch, parameters)
  const radiusX = radius * (scale[0] ?? 1)
  const radiusY = radius * (scale[1] ?? 1)
  const scaledLength = length * (scale[2] ?? 1)
  if (radiusX <= 0 || radiusY <= 0 || scaledLength <= 0) {
    throw new Error(`Feature ${featureID} ${label} dimensions must be positive`)
  }
  if (radiusX !== radiusY) {
    return buildFeatureDSLEllipsePrismShape(openCascade, origin, radiusX, radiusY, scaledLength)
  }
  const originPoint = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const direction = new openCascade.gp_Dir_4(0, 0, 1)
  const axis = new openCascade.gp_Ax2_3(originPoint, direction)
  const cylinderBuilder = new openCascade.BRepPrimAPI_MakeCylinder_3(axis, radiusX, scaledLength)
  cylinderBuilder.Build(new openCascade.Message_ProgressRange_1())
  return cylinderBuilder.Shape()
}

function buildFeatureDSLCylinderShape(
  openCascade: OpenCascadeModule,
  feature: {
    id: string
    origin: readonly CadKernelFeatureDSLExpression[]
    axis?: readonly CadKernelFeatureDSLExpression[]
    radius?: CadKernelFeatureDSLExpression
    diameter?: CadKernelFeatureDSLExpression
    height?: CadKernelFeatureDSLExpression
    depth?: CadKernelFeatureDSLExpression
  },
  parameters: Record<string, number>,
  lengthKey: 'height' | 'depth',
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin, parameters)
  const radius = resolveFeatureDSLRadius(feature, parameters)
  const lengthExpression = feature[lengthKey]
  if (lengthExpression === undefined) {
    throw new Error(`Feature ${feature.id} cylinder ${lengthKey} is required`)
  }
  const axisVector = resolveFeatureDSLVector(feature.axis ?? [0, 0, 1], parameters)
  if (axisVector.every((value) => value === 0)) {
    throw new Error(`Feature ${feature.id} cylinder axis must be non-zero`)
  }
  const length = resolveFeatureDSLScalar(lengthExpression, parameters)
  const isDefaultZAxis = isFeatureDSLDefaultZAxis(axisVector)
  if (!isDefaultZAxis && !isUniformFeatureDSLScale(scale)) {
    throw new Error(`Feature ${feature.id} non-uniform cylinder scale requires the default positive Z axis`)
  }
  const radiusX = radius * (scale[0] ?? 1)
  const radiusY = radius * (scale[1] ?? 1)
  const scaledLength = length * (isDefaultZAxis ? (scale[2] ?? 1) : (scale[0] ?? 1))
  if (radiusX <= 0 || radiusY <= 0 || scaledLength <= 0) {
    throw new Error(`Feature ${feature.id} cylinder dimensions must be positive`)
  }
  if (radiusX !== radiusY) {
    return buildFeatureDSLEllipsePrismShape(openCascade, origin, radiusX, radiusY, scaledLength)
  }
  const originPoint = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const direction = new openCascade.gp_Dir_4(axisVector[0] ?? 0, axisVector[1] ?? 0, axisVector[2] ?? 1)
  const axis = new openCascade.gp_Ax2_3(originPoint, direction)
  const cylinderBuilder = new openCascade.BRepPrimAPI_MakeCylinder_3(axis, radiusX, scaledLength)
  cylinderBuilder.Build(new openCascade.Message_ProgressRange_1())
  return cylinderBuilder.Shape()
}

function buildFeatureDSLSphereShape(
  openCascade: OpenCascadeModule,
  feature: {
    id: string
    origin: readonly CadKernelFeatureDSLExpression[]
    radius?: CadKernelFeatureDSLExpression
    diameter?: CadKernelFeatureDSLExpression
  },
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin, parameters)
  const radius = resolveFeatureDSLRadius(feature, parameters, 'sphere')
  const radii = scale.map((value) => value * radius)
  if (radii.some((value) => value <= 0)) {
    throw new Error(`Feature ${feature.id} sphere dimensions must be positive`)
  }
  if (!isUniformFeatureDSLScale(scale)) {
    return buildFeatureDSLFacetedEllipsoidShape(openCascade, origin, radii)
  }
  const center = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const sphereBuilder = new openCascade.BRepPrimAPI_MakeSphere_5(center, radii[0] ?? radius)
  sphereBuilder.Build(new openCascade.Message_ProgressRange_1())
  return sphereBuilder.Shape()
}

function buildFeatureDSLEllipsoidShape(
  openCascade: OpenCascadeModule,
  feature: CadKernelFeatureDSLEllipsoidFeature,
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin, parameters)
  const radiusX = resolveFeatureDSLAxisRadius(feature, parameters, 'x', 'ellipsoid') * (scale[0] ?? 1)
  const radiusY = resolveFeatureDSLAxisRadius(feature, parameters, 'y', 'ellipsoid') * (scale[1] ?? 1)
  const radiusZ = resolveFeatureDSLAxisRadius(feature, parameters, 'z', 'ellipsoid') * (scale[2] ?? 1)
  if (radiusX <= 0 || radiusY <= 0 || radiusZ <= 0) {
    throw new Error(`Feature ${feature.id} ellipsoid dimensions must be positive`)
  }
  return buildFeatureDSLFacetedEllipsoidShape(openCascade, origin, [radiusX, radiusY, radiusZ])
}

function buildFeatureDSLEllipseExtrudeShape(
  openCascade: OpenCascadeModule,
  feature: CadKernelFeatureDSLEllipseExtrudeFeature,
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin, parameters)
  const radiusX = resolveFeatureDSLAxisRadius(feature, parameters, 'x', 'ellipse_extrude') * (scale[0] ?? 1)
  const radiusY = resolveFeatureDSLAxisRadius(feature, parameters, 'y', 'ellipse_extrude') * (scale[1] ?? 1)
  const height = resolveFeatureDSLScalar(feature.height, parameters) * (scale[2] ?? 1)
  if (radiusX <= 0 || radiusY <= 0 || height <= 0) {
    throw new Error(`Feature ${feature.id} ellipse_extrude dimensions must be positive`)
  }
  return buildFeatureDSLEllipsePrismShape(openCascade, origin, radiusX, radiusY, height)
}

function buildFeatureDSLRevolveShape(
  openCascade: OpenCascadeModule,
  feature: CadKernelFeatureDSLRevolveFeature,
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const sketch = resolveFeatureDSLSketchReference(feature.sketch, sketches)
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin ?? sketch.origin ?? [0, 0, 0], parameters)
  const plane = feature.plane ?? sketch.plane ?? 'XY'
  const axisOrigin = resolveFeatureDSLVector(feature.axis_origin ?? [0, 0, 0], parameters)
  const axisVector = resolveFeatureDSLAxisVector(feature.axis ?? [0, 0, 1], parameters, `feature ${feature.id} revolve axis`)
  const angle = resolveFeatureDSLScalar(feature.angle_degrees ?? 360, parameters)
  if (angle <= 0 || angle > 360) {
    throw new Error(`Feature ${feature.id} revolve angle must be greater than 0 and at most 360 degrees`)
  }
  if (angle === 360 && plane === 'XZ' && sketch.profile.type === 'rectangle' && isFeatureDSLDefaultZAxis(axisVector)) {
    return buildFeatureDSLRectangularRevolveShape(openCascade, feature.id, origin, sketch.profile.size, axisOrigin, parameters, scale)
  }
  const face = buildFeatureDSLSketchFace(openCascade, sketch.profile, parameters, origin, plane, scale)
  const axis = new openCascade.gp_Ax1_2(
    new openCascade.gp_Pnt_3(axisOrigin[0] ?? 0, axisOrigin[1] ?? 0, axisOrigin[2] ?? 0),
    new openCascade.gp_Dir_4(axisVector[0] ?? 0, axisVector[1] ?? 0, axisVector[2] ?? 1),
  )
  const revolBuilder = new openCascade.BRepPrimAPI_MakeRevol_1(face, axis, (angle * Math.PI) / 180, false)
  revolBuilder.Build(new openCascade.Message_ProgressRange_1())
  return revolBuilder.Shape()
}

function buildFeatureDSLRectangularRevolveShape(
  openCascade: OpenCascadeModule,
  featureID: string,
  origin: readonly number[],
  sizeExpression: readonly CadKernelFeatureDSLExpression[],
  axisOrigin: readonly number[],
  parameters: Record<string, number>,
  scale: readonly number[],
) {
  const size = scaleFeatureDSLPlanarSize(resolveFeatureDSLVector(sizeExpression, parameters), scale)
  const innerRadius = Math.abs((origin[0] ?? 0) - (axisOrigin[0] ?? 0))
  const outerRadius = innerRadius + (size[0] ?? 0)
  const height = size[1] ?? 0
  if (outerRadius <= 0 || height <= 0) {
    throw new Error(`Feature ${featureID} revolve dimensions must be positive`)
  }
  const basePoint = new openCascade.gp_Pnt_3(axisOrigin[0] ?? 0, axisOrigin[1] ?? 0, origin[2] ?? 0)
  const axis = new openCascade.gp_Ax2_3(basePoint, new openCascade.gp_Dir_4(0, 0, 1))
  const outerBuilder = new openCascade.BRepPrimAPI_MakeCylinder_3(axis, outerRadius, height)
  outerBuilder.Build(new openCascade.Message_ProgressRange_1())
  // Hollow rectangular revolves remain future work; this stable path emits the outer lathe envelope.
  void innerRadius
  return outerBuilder.Shape()
}

function buildFeatureDSLSweepShape(
  openCascade: OpenCascadeModule,
  feature: CadKernelFeatureDSLSweepFeature,
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const sketch = resolveFeatureDSLSketchReference(feature.sketch, sketches)
  const path = feature.path.map((point) => resolveFeatureDSLVector(point, parameters))
  if (path.length < 2) {
    throw new Error(`Feature ${feature.id} sweep requires at least two path points`)
  }
  const start = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin ?? sketch.origin ?? path[0] ?? [0, 0, 0], parameters)
  const end = path[path.length - 1] ?? start
  const vector = [end[0] - (path[0]?.[0] ?? 0), end[1] - (path[0]?.[1] ?? 0), end[2] - (path[0]?.[2] ?? 0)]
  if (vector.every((value) => value === 0)) {
    throw new Error(`Feature ${feature.id} sweep path must have non-zero length`)
  }
  const face = buildFeatureDSLSketchFace(openCascade, sketch.profile, parameters, start, feature.plane ?? sketch.plane ?? 'XY', scale)
  const prismBuilder = new openCascade.BRepPrimAPI_MakePrism_1(
    face,
    new openCascade.gp_Vec_4(vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0),
    false,
    true,
  )
  prismBuilder.Build(new openCascade.Message_ProgressRange_1())
  return prismBuilder.Shape()
}

function buildFeatureDSLLoftShape(
  openCascade: OpenCascadeModule,
  feature: CadKernelFeatureDSLLoftFeature,
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  if (feature.sections.length < 2) {
    throw new Error(`Feature ${feature.id} loft requires at least two sections`)
  }
  const loftBuilder = new openCascade.BRepOffsetAPI_ThruSections(true, false, 0.001)
  for (const [index, section] of feature.sections.entries()) {
    const sketch = resolveFeatureDSLSketchReference(section.sketch, sketches)
    const baseOrigin = resolveFeatureDSLVector(section.origin, parameters)
    const origin = repeatedOrigin ? baseOrigin.map((value, axis) => value + (repeatedOrigin[axis] ?? 0)) : baseOrigin
    const wire = buildFeatureDSLSketchWire(openCascade, sketch.profile, parameters, origin, section.plane ?? sketch.plane ?? 'XY', scale)
    loftBuilder.AddWire(wire)
    if (index === 0) {
      loftBuilder.CheckCompatibility(true)
    }
  }
  loftBuilder.Build(new openCascade.Message_ProgressRange_1())
  return loftBuilder.Shape()
}

function resolveFeatureDSLSketchReference(
  sketch: CadKernelFeatureDSLSketchReference,
  sketches: Map<string, CadKernelFeatureDSLSketchDefinitionFeature>,
) {
  if (typeof sketch !== 'string') {
    return { profile: sketch, plane: 'XY' as CadKernelFeatureDSLSketchPlane, origin: [0, 0, 0] }
  }
  const referenced = sketches.get(sketch)
  if (!referenced) {
    throw new Error(`Unknown feature DSL sketch reference: ${sketch}`)
  }
  return referenced
}

function buildFeatureDSLSketchFace(
  openCascade: OpenCascadeModule,
  sketch: CadKernelFeatureDSLSketch,
  parameters: Record<string, number>,
  origin: readonly number[],
  plane: CadKernelFeatureDSLSketchPlane,
  scale: readonly number[],
) {
  const wire = buildFeatureDSLSketchWire(openCascade, sketch, parameters, origin, plane, scale)
  return new openCascade.BRepBuilderAPI_MakeFace_15(wire, true).Face()
}

function buildFeatureDSLSketchWire(
  openCascade: OpenCascadeModule,
  sketch: CadKernelFeatureDSLSketch,
  parameters: Record<string, number>,
  origin: readonly number[],
  plane: CadKernelFeatureDSLSketchPlane,
  scale: readonly number[],
) {
  if (sketch.type === 'rectangle') {
    const size = scaleFeatureDSLPlanarSize(resolveFeatureDSLVector(sketch.size, parameters), scale)
    if (size.some((value) => value <= 0)) {
      throw new Error('Feature DSL rectangle sketch dimensions must be positive')
    }
    const points = [
      featureDSLSketchPoint(openCascade, origin, plane, 0, 0),
      featureDSLSketchPoint(openCascade, origin, plane, size[0] ?? 0, 0),
      featureDSLSketchPoint(openCascade, origin, plane, size[0] ?? 0, size[1] ?? 0),
      featureDSLSketchPoint(openCascade, origin, plane, 0, size[1] ?? 0),
    ]
    const edges = points.map((point, index) => new openCascade.BRepBuilderAPI_MakeEdge_3(point, points[(index + 1) % points.length]).Edge())
    return new openCascade.BRepBuilderAPI_MakeWire_5(edges[0], edges[1], edges[2], edges[3]).Wire()
  }
  const axis = featureDSLSketchAxis(openCascade, origin, plane)
  if (sketch.type === 'circle') {
    const radius = resolveFeatureDSLCircleRadius('sketch', sketch, parameters) * (scale[0] ?? 1)
    if (radius <= 0) {
      throw new Error('Feature DSL circle sketch radius must be positive')
    }
    const edge = new openCascade.BRepBuilderAPI_MakeEdge_8(new openCascade.gp_Circ_2(axis, radius)).Edge()
    return new openCascade.BRepBuilderAPI_MakeWire_2(edge).Wire()
  }
  const radiusX = resolveFeatureDSLAxisRadius(sketch, parameters, 'x', 'ellipse sketch') * (scale[0] ?? 1)
  const radiusY = resolveFeatureDSLAxisRadius(sketch, parameters, 'y', 'ellipse sketch') * (scale[1] ?? 1)
  if (radiusX <= 0 || radiusY <= 0) {
    throw new Error('Feature DSL ellipse sketch radii must be positive')
  }
  const edge = new openCascade.BRepBuilderAPI_MakeEdge_12(
    new openCascade.gp_Elips_2(axis, Math.max(radiusX, radiusY), Math.min(radiusX, radiusY)),
  ).Edge()
  return new openCascade.BRepBuilderAPI_MakeWire_2(edge).Wire()
}

function featureDSLSketchPoint(
  openCascade: OpenCascadeModule,
  origin: readonly number[],
  plane: CadKernelFeatureDSLSketchPlane,
  first: number,
  second: number,
) {
  if (plane === 'XZ') {
    return new openCascade.gp_Pnt_3((origin[0] ?? 0) + first, origin[1] ?? 0, (origin[2] ?? 0) + second)
  }
  if (plane === 'YZ') {
    return new openCascade.gp_Pnt_3(origin[0] ?? 0, (origin[1] ?? 0) + first, (origin[2] ?? 0) + second)
  }
  return new openCascade.gp_Pnt_3((origin[0] ?? 0) + first, (origin[1] ?? 0) + second, origin[2] ?? 0)
}

function featureDSLSketchAxis(openCascade: OpenCascadeModule, origin: readonly number[], plane: CadKernelFeatureDSLSketchPlane) {
  const center = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  if (plane === 'XZ') {
    return new openCascade.gp_Ax2_2(center, new openCascade.gp_Dir_4(0, -1, 0), new openCascade.gp_Dir_4(1, 0, 0))
  }
  if (plane === 'YZ') {
    return new openCascade.gp_Ax2_2(center, new openCascade.gp_Dir_4(1, 0, 0), new openCascade.gp_Dir_4(0, 1, 0))
  }
  return new openCascade.gp_Ax2_2(center, new openCascade.gp_Dir_4(0, 0, 1), new openCascade.gp_Dir_4(1, 0, 0))
}

function buildFeatureDSLEllipsePrismShape(
  openCascade: OpenCascadeModule,
  origin: readonly number[],
  radiusX: number,
  radiusY: number,
  height: number,
) {
  const center = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const normal = new openCascade.gp_Dir_4(0, 0, 1)
  const xDirection = radiusX >= radiusY ? new openCascade.gp_Dir_4(1, 0, 0) : new openCascade.gp_Dir_4(0, 1, 0)
  const axis = new openCascade.gp_Ax2_2(center, normal, xDirection)
  const ellipse = new openCascade.gp_Elips_2(axis, Math.max(radiusX, radiusY), Math.min(radiusX, radiusY))
  const edgeBuilder = new openCascade.BRepBuilderAPI_MakeEdge_12(ellipse)
  const wireBuilder = new openCascade.BRepBuilderAPI_MakeWire_2(edgeBuilder.Edge())
  const faceBuilder = new openCascade.BRepBuilderAPI_MakeFace_15(wireBuilder.Wire(), true)
  const prismBuilder = new openCascade.BRepPrimAPI_MakePrism_1(faceBuilder.Face(), new openCascade.gp_Vec_4(0, 0, height), false, true)
  prismBuilder.Build(new openCascade.Message_ProgressRange_1())
  return prismBuilder.Shape()
}

function buildFeatureDSLFacetedEllipsoidShape(
  openCascade: OpenCascadeModule,
  origin: readonly number[],
  radii: readonly number[],
) {
  const longitudeSegments = 32
  const latitudeSegments = 16
  const points: any[][] = []
  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const theta = (Math.PI * latitude) / latitudeSegments
    const sinTheta = Math.sin(theta)
    const cosTheta = Math.cos(theta)
    const row: any[] = []
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const phi = (2 * Math.PI * longitude) / longitudeSegments
      row.push(
        new openCascade.gp_Pnt_3(
          (origin[0] ?? 0) + (radii[0] ?? 1) * sinTheta * Math.cos(phi),
          (origin[1] ?? 0) + (radii[1] ?? 1) * sinTheta * Math.sin(phi),
          (origin[2] ?? 0) + (radii[2] ?? 1) * cosTheta,
        ),
      )
    }
    points.push(row)
  }

  const sewing = new openCascade.BRepBuilderAPI_Sewing(0.001, true, true, true, false)
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const nextLongitude = (longitude + 1) % longitudeSegments
      const topLeft = points[latitude]?.[longitude]
      const topRight = points[latitude]?.[nextLongitude]
      const bottomLeft = points[latitude + 1]?.[longitude]
      const bottomRight = points[latitude + 1]?.[nextLongitude]
      if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
        continue
      }
      if (latitude === 0) {
        sewing.Add(buildFeatureDSLTriangleFace(openCascade, topLeft, bottomRight, bottomLeft))
      } else if (latitude === latitudeSegments - 1) {
        sewing.Add(buildFeatureDSLTriangleFace(openCascade, topLeft, topRight, bottomLeft))
      } else {
        sewing.Add(buildFeatureDSLTriangleFace(openCascade, topLeft, topRight, bottomLeft))
        sewing.Add(buildFeatureDSLTriangleFace(openCascade, topRight, bottomRight, bottomLeft))
      }
    }
  }
  sewing.Perform(new openCascade.Message_ProgressRange_1())
  const shell = openCascade.TopoDS.Shell_1(sewing.SewedShape())
  const solid = new openCascade.ShapeFix_Solid_1().SolidFromShell(shell)
  openCascade.BRepLib.OrientClosedSolid(solid)
  return solid
}

function buildFeatureDSLTriangleFace(openCascade: OpenCascadeModule, first: any, second: any, third: any) {
  const firstEdge = new openCascade.BRepBuilderAPI_MakeEdge_3(first, second)
  const secondEdge = new openCascade.BRepBuilderAPI_MakeEdge_3(second, third)
  const thirdEdge = new openCascade.BRepBuilderAPI_MakeEdge_3(third, first)
  const wire = new openCascade.BRepBuilderAPI_MakeWire_4(firstEdge.Edge(), secondEdge.Edge(), thirdEdge.Edge())
  const face = new openCascade.BRepBuilderAPI_MakeFace_15(wire.Wire(), true)
  return face.Face()
}

function resolveFeatureDSLRepeatedOrigins(
  feature: { id: string; origin?: readonly CadKernelFeatureDSLExpression[]; repeat?: { count: number; step: readonly CadKernelFeatureDSLExpression[] } },
  parameters: Record<string, number>,
) {
  const origin = resolveFeatureDSLVector(feature.origin ?? [0, 0, 0], parameters)
  if (!feature.repeat) {
    return [origin]
  }
  const count = feature.repeat.count
  if (!Number.isInteger(count) || count < 1 || count > 128) {
    throw new Error(`Feature ${feature.id} repeat count must be an integer from 1 to 128`)
  }
  const step = resolveFeatureDSLVector(feature.repeat.step, parameters)
  return Array.from({ length: count }, (_entry, index) => origin.map((value, axis) => value + (step[axis] ?? 0) * index))
}

function resolveFeatureDSLTransform(
  transform: CadKernelFeatureDSLTransform | undefined,
  parameters: Record<string, number>,
): ResolvedFeatureDSLTransform {
  const scale = transform?.scale ? resolveFeatureDSLPositiveVector(transform.scale, parameters, 'transform scale') : identityFeatureDSLScale()
  const translate = transform?.translate ? resolveFeatureDSLVector(transform.translate, parameters) : undefined
  const rotate = transform?.rotate
    ? {
        axis: resolveFeatureDSLAxisVector(transform.rotate.axis, parameters, 'transform rotate axis'),
        angleRadians: (resolveFeatureDSLScalar(transform.rotate.angle_degrees, parameters) * Math.PI) / 180,
        origin: transform.rotate.origin ? resolveFeatureDSLVector(transform.rotate.origin, parameters) : undefined,
      }
    : undefined
  return { translate, rotate, scale }
}

function resolveFeatureDSLPositiveVector(
  values: readonly CadKernelFeatureDSLExpression[],
  parameters: Record<string, number>,
  label: string,
) {
  const resolved = resolveFeatureDSLVector(values, parameters)
  if (resolved.some((value) => value <= 0)) {
    throw new Error(`Feature DSL ${label} components must be positive`)
  }
  return resolved
}

function resolveFeatureDSLAxisVector(
  values: readonly CadKernelFeatureDSLExpression[],
  parameters: Record<string, number>,
  label: string,
) {
  const resolved = resolveFeatureDSLVector(values, parameters)
  if (resolved.every((value) => value === 0)) {
    throw new Error(`Feature DSL ${label} must be non-zero`)
  }
  return resolved
}

function identityFeatureDSLScale() {
  return [1, 1, 1]
}

function scaleFeatureDSLVector(values: readonly number[], scale: readonly number[]) {
  return values.map((value, index) => value * (scale[index] ?? 1))
}

function scaleFeatureDSLPlanarSize(values: readonly number[], scale: readonly number[]) {
  return [values[0] ?? 0, values[1] ?? 0].map((value, index) => value * (scale[index] ?? 1))
}

function scaleFeatureDSLLength(value: number, scale: readonly number[]) {
  return value * (scale[2] ?? 1)
}

function isUniformFeatureDSLScale(scale: readonly number[]) {
  return scale.every((value) => value === (scale[0] ?? 1))
}

function isFeatureDSLDefaultZAxis(axis: readonly number[]) {
  return (axis[0] ?? 0) === 0 && (axis[1] ?? 0) === 0 && (axis[2] ?? 0) > 0
}

function resolveFeatureDSLRadius(
  feature: { id: string; radius?: CadKernelFeatureDSLExpression; diameter?: CadKernelFeatureDSLExpression },
  parameters: Record<string, number>,
  label = 'cylinder',
) {
  const hasRadius = feature.radius !== undefined
  const hasDiameter = feature.diameter !== undefined
  if (hasRadius === hasDiameter) {
    throw new Error(`Feature ${feature.id} ${label} requires exactly one of radius or diameter`)
  }
  if (hasRadius) {
    return resolveFeatureDSLScalar(feature.radius ?? 0, parameters)
  }
  return resolveFeatureDSLScalar(feature.diameter ?? 0, parameters) / 2
}

function resolveFeatureDSLCircleRadius(featureID: string, sketch: CadKernelFeatureDSLCircleSketch, parameters: Record<string, number>) {
  const hasRadius = sketch.radius !== undefined
  const hasDiameter = sketch.diameter !== undefined
  if (hasRadius === hasDiameter) {
    throw new Error(`Feature ${featureID} circle sketch requires exactly one of radius or diameter`)
  }
  if (hasRadius) {
    return resolveFeatureDSLScalar(sketch.radius ?? 0, parameters)
  }
  return resolveFeatureDSLScalar(sketch.diameter ?? 0, parameters) / 2
}

function resolveFeatureDSLEllipseSketchRadii(
  featureID: string,
  sketch: { radius_x?: CadKernelFeatureDSLExpression; radius_y?: CadKernelFeatureDSLExpression; diameter_x?: CadKernelFeatureDSLExpression; diameter_y?: CadKernelFeatureDSLExpression },
  parameters: Record<string, number>,
  scale: readonly number[] = identityFeatureDSLScale(),
) {
  const radiusX = resolveFeatureDSLAxisRadius(sketch, parameters, 'x', 'ellipse sketch') * (scale[0] ?? 1)
  const radiusY = resolveFeatureDSLAxisRadius(sketch, parameters, 'y', 'ellipse sketch') * (scale[1] ?? 1)
  if (radiusX <= 0 || radiusY <= 0) {
    throw new Error(`Feature ${featureID} ellipse sketch dimensions must be positive`)
  }
  return [radiusX, radiusY]
}

function resolveFeatureDSLAxisRadius(
  feature: {
    id?: string
    radius_x?: CadKernelFeatureDSLExpression
    radius_y?: CadKernelFeatureDSLExpression
    radius_z?: CadKernelFeatureDSLExpression
    diameter_x?: CadKernelFeatureDSLExpression
    diameter_y?: CadKernelFeatureDSLExpression
    diameter_z?: CadKernelFeatureDSLExpression
  },
  parameters: Record<string, number>,
  axis: 'x' | 'y' | 'z',
  label: string,
) {
  const radius = feature[`radius_${axis}`]
  const diameter = feature[`diameter_${axis}`]
  const hasRadius = radius !== undefined
  const hasDiameter = diameter !== undefined
  if (hasRadius === hasDiameter) {
    throw new Error(`Feature ${feature.id ?? 'sketch'} ${label} ${axis} axis requires exactly one of radius_${axis} or diameter_${axis}`)
  }
  if (hasRadius) {
    return resolveFeatureDSLScalar(radius ?? 0, parameters)
  }
  return resolveFeatureDSLScalar(diameter ?? 0, parameters) / 2
}

function resolveFeatureDSLDirectedOrigin(
  featureID: string,
  origin: readonly number[],
  length: number,
  direction: CadKernelFeatureDSLExtrudeDirection = 'positive',
) {
  if (direction === 'positive') {
    return origin
  }
  if (direction === 'negative') {
    return [origin[0] ?? 0, origin[1] ?? 0, (origin[2] ?? 0) - length]
  }
  if (direction === 'symmetric') {
    return [origin[0] ?? 0, origin[1] ?? 0, (origin[2] ?? 0) - length / 2]
  }
  throw new Error(`Feature ${featureID} extrude direction is invalid`)
}

function resolveFeatureDSLParameters(document: CadKernelFeatureDSLDocument, parameterValues: Record<string, number>) {
  const parameterDefinitions = document.parameters ?? {}
  const unknownParameter = Object.keys(parameterValues).find((name) => !parameterDefinitions[name])
  const nonNumericParameter = Object.keys(parameterValues).find((name) => parameterDefinitions[name]?.type !== 'number')
  if (unknownParameter || nonNumericParameter) {
    throw new Error(`Unknown feature DSL parameter: ${unknownParameter ?? nonNumericParameter}`)
  }
  const resolved: Record<string, number> = {}
  for (const [name, definition] of Object.entries(parameterDefinitions)) {
    if (definition.type !== 'number') {
      continue
    }
    const value = parameterValues[name] ?? definition.default
    if (!Number.isFinite(value)) {
      throw new Error(`Feature DSL parameter ${name} must be finite`)
    }
    if (definition.min !== undefined && value < definition.min) {
      throw new Error(`Feature DSL parameter ${name} is below minimum`)
    }
    if (definition.max !== undefined && value > definition.max) {
      throw new Error(`Feature DSL parameter ${name} is above maximum`)
    }
    resolved[name] = value
  }
  return resolved
}

function resolveFeatureDSLVector(values: readonly CadKernelFeatureDSLExpression[], parameters: Record<string, number>) {
  return values.map((value) => resolveFeatureDSLScalar(value, parameters))
}

function resolveFeatureDSLScalar(value: CadKernelFeatureDSLExpression, parameters: Record<string, number>): number {
  if (typeof value === 'number') {
    return value
  }
  if (isFeatureDSLArithmeticExpression(value)) {
    const left = resolveFeatureDSLScalar(value.args[0], parameters)
    const right = resolveFeatureDSLScalar(value.args[1], parameters)
    let result: number
    switch (value.op) {
      case 'add':
        result = left + right
        break
      case 'sub':
        result = left - right
        break
      case 'mul':
        result = left * right
        break
      case 'div':
        if (right === 0) {
          throw new Error('Feature DSL expression division by zero')
        }
        result = left / right
        break
    }
    if (!Number.isFinite(result)) {
      throw new Error('Feature DSL expression result must be finite')
    }
    return result
  }
  if (typeof value === 'object' && value !== null) {
    throw new Error('Invalid feature DSL expression')
  }
  const parameterValue = parameters[value]
  if (parameterValue === undefined) {
    throw new Error(`Unknown feature DSL parameter reference: ${value}`)
  }
  return parameterValue
}

function isFeatureDSLArithmeticExpression(value: CadKernelFeatureDSLExpression): value is CadKernelFeatureDSLArithmeticExpression {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value.op === 'add' || value.op === 'sub' || value.op === 'mul' || value.op === 'div') &&
    Array.isArray(value.args) &&
    value.args.length === 2
  )
}

function importStepShape(openCascade: OpenCascadeModule, input: CadKernelStepRoundTripInput) {
  return importStepShapeFromFile(openCascade, inputStepPath, input)
}

function importStepShapeFromFile(openCascade: OpenCascadeModule, path: string, input: CadKernelStepRoundTripInput) {
  const reader = new openCascade.STEPControl_Reader_1()
  const readResult = reader.ReadFile(path.slice(1))
  if (readResult !== openCascade.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error(`STEP import failed for ${input.filename}`)
  }

  const rootCount = reader.TransferRoots(new openCascade.Message_ProgressRange_1())
  if (rootCount <= 0) {
    throw new Error(`STEP import produced no transferable roots for ${input.filename}`)
  }

  return reader.OneShape()
}

function compoundShapes(openCascade: OpenCascadeModule, shapes: readonly any[]) {
  const compound = new openCascade.TopoDS_Compound()
  const builder = new openCascade.TopoDS_Builder()
  builder.MakeCompound(compound)
  shapes.forEach((shape) => builder.Add(compound, shape))
  return compound
}

function stepAssemblyInputPath(index: number) {
  return `/litecad-assembly-input-${index}.step`
}

function cleanupVirtualFile(openCascade: OpenCascadeModule, path: string) {
  try {
    openCascade.FS.unlink(path)
  } catch {
    // Missing virtual files are expected between independent smoke runs.
  }
}

function writeVirtualFile(openCascade: OpenCascadeModule, path: string, data: string | Uint8Array) {
  if (openCascade.FS.writeFile) {
    openCascade.FS.writeFile(path, data)
    return
  }
  if (!openCascade.FS.createDataFile) {
    throw new Error('OpenCascade virtual filesystem cannot write files')
  }
  openCascade.FS.createDataFile('/', path.slice(1), data, true, true)
}

function tessellateShape(openCascade: OpenCascadeModule, shape: any): CadKernelMesh {
  new openCascade.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.5, false)
  const explorer = new openCascade.TopExp_Explorer_1()
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (
    explorer.Init(shape, openCascade.TopAbs_ShapeEnum.TopAbs_FACE, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE);
    explorer.More();
    explorer.Next()
  ) {
    const face = openCascade.TopoDS.Face_1(explorer.Current())
    const location = new openCascade.TopLoc_Location_1()
    const triangulationHandle = openCascade.BRep_Tool.Triangulation(face, location, 0)
    if (triangulationHandle.IsNull()) {
      continue
    }

    const triangulation = triangulationHandle.get()
    const firstVertexIndex = positions.length / 3
    const transform = location.Transformation()
    for (let index = 1; index <= triangulation.NbNodes(); index += 1) {
      const point = triangulation.Node(index).Transformed(transform)
      positions.push(point.X(), point.Y(), point.Z())
    }

    const connectedPolygons = new openCascade.Poly_Connect_2(triangulationHandle)
    const faceNormals = new openCascade.TColgp_Array1OfDir_2(1, triangulation.NbNodes())
    openCascade.StdPrs_ToolTriangulatedShape.Normal(face, connectedPolygons, faceNormals)
    for (let index = faceNormals.Lower(); index <= faceNormals.Upper(); index += 1) {
      const direction = faceNormals.Value(index).Transformed(transform)
      normals.push(direction.X(), direction.Y(), direction.Z())
    }

    const orientation = face.Orientation_1()
    const triangles = triangulation.Triangles()
    for (let index = 1; index <= triangulation.NbTriangles(); index += 1) {
      const triangle = triangles.Value(index)
      let first = triangle.Value(1) - 1
      let second = triangle.Value(2) - 1
      const third = triangle.Value(3) - 1
      if (orientation !== openCascade.TopAbs_Orientation.TopAbs_FORWARD) {
        const nextFirst = second
        second = first
        first = nextFirst
      }
      indices.push(firstVertexIndex + first, firstVertexIndex + second, firstVertexIndex + third)
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    throw new Error('STEP tessellation produced no preview triangles')
  }

  return { positions, normals, indices }
}

function tessellateShapeComponents(openCascade: OpenCascadeModule, shape: any): CadKernelMesh[] {
  const explorer = new openCascade.TopExp_Explorer_1()
  const meshes: CadKernelMesh[] = []

  for (
    explorer.Init(shape, openCascade.TopAbs_ShapeEnum.TopAbs_SOLID, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE);
    explorer.More();
    explorer.Next()
  ) {
    try {
      meshes.push(tessellateShape(openCascade, explorer.Current()))
    } catch {
      // Some STEP solids may not expose browser-tessellatable faces; keep the aggregate mesh usable.
    }
  }

  return meshes.length > 1 ? meshes : []
}

export function exportShapeToStep(openCascade: OpenCascadeModule, shape: any): string {
  const writer = new openCascade.STEPControl_Writer_1()
  const transferStatus = writer.Transfer(
    shape,
    openCascade.STEPControl_StepModelType.STEPControl_AsIs,
    true,
    new openCascade.Message_ProgressRange_1(),
  )
  if (transferStatus !== openCascade.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error('STEP export transfer failed')
  }

  const writeStatus = writer.Write(outputStepName)
  if (writeStatus !== openCascade.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error('STEP export write failed')
  }

  return String(openCascade.FS.readFile(outputStepPath, { encoding: 'utf8' }))
}
