import type {
  CadKernelFeatureDSLArithmeticExpression,
  CadKernelFeatureDSLCircleSketch,
  CadKernelFeatureDSLDocument,
  CadKernelFeatureDSLExpression,
  CadKernelFeatureDSLInput,
  CadKernelFeatureDSLSketch,
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
  return { mesh: tessellateShape(openCascade, shape) }
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
  let accumulatedShape: any | undefined
  for (const feature of document.features) {
    const origins = resolveFeatureDSLRepeatedOrigins(feature, parameters)
    for (const origin of origins) {
      if (feature.type === 'box') {
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, buildFeatureDSLBoxShape(openCascade, feature, parameters, origin))
        continue
      }
      if (feature.type === 'box_cut') {
        if (!accumulatedShape) {
          throw new Error(`Feature ${feature.id} box_cut requires a prior solid feature`)
        }
        const cutterShape = buildFeatureDSLBoxShape(openCascade, feature, parameters, origin)
        const cutBuilder = new openCascade.BRepAlgoAPI_Cut_3(
          accumulatedShape,
          cutterShape,
          new openCascade.Message_ProgressRange_1(),
        )
        accumulatedShape = cutBuilder.Shape()
        continue
      }
      if (feature.type === 'extrude') {
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, buildFeatureDSLExtrudeShape(openCascade, feature, parameters, origin))
        continue
      }
      if (feature.type === 'extrude_cut') {
        if (!accumulatedShape) {
          throw new Error(`Feature ${feature.id} extrude_cut requires a prior solid feature`)
        }
        const cutterShape = buildFeatureDSLExtrudeCutShape(openCascade, feature, parameters, origin)
        const cutBuilder = new openCascade.BRepAlgoAPI_Cut_3(
          accumulatedShape,
          cutterShape,
          new openCascade.Message_ProgressRange_1(),
        )
        accumulatedShape = cutBuilder.Shape()
        continue
      }
      if (feature.type === 'cylinder') {
        accumulatedShape = appendFeatureDSLShape(openCascade, accumulatedShape, buildFeatureDSLCylinderShape(openCascade, feature, parameters, 'height', origin))
        continue
      }
      if (feature.type === 'cylinder_cut') {
        if (!accumulatedShape) {
          throw new Error(`Feature ${feature.id} cylinder_cut requires a prior solid feature`)
        }
        const cutterShape = buildFeatureDSLCylinderShape(openCascade, feature, parameters, 'depth', origin)
        const cutBuilder = new openCascade.BRepAlgoAPI_Cut_3(
          accumulatedShape,
          cutterShape,
          new openCascade.Message_ProgressRange_1(),
        )
        accumulatedShape = cutBuilder.Shape()
        continue
      }
      throw new Error(`Unsupported feature DSL type: ${(feature as { type?: string }).type}`)
    }
  }
  if (!accumulatedShape) {
    throw new Error('Feature DSL document has no features')
  }
  return accumulatedShape
}

function appendFeatureDSLShape(openCascade: OpenCascadeModule, accumulatedShape: any | undefined, nextShape: any) {
  return accumulatedShape ? compoundShapes(openCascade, [accumulatedShape, nextShape]) : nextShape
}

function buildFeatureDSLBoxShape(
  openCascade: OpenCascadeModule,
  feature: { id: string; origin?: readonly CadKernelFeatureDSLExpression[]; size: readonly CadKernelFeatureDSLExpression[] },
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
) {
  const size = resolveFeatureDSLVector(feature.size, parameters)
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
) {
  if (sketchSize.some((value) => value <= 0) || length <= 0) {
    throw new Error(`Feature ${featureID} ${label} dimensions must be positive`)
  }
  const originPoint = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const boxBuilder = new openCascade.BRepPrimAPI_MakeBox_3(originPoint, sketchSize[0] ?? 1, sketchSize[1] ?? 1, length)
  boxBuilder.Build(new openCascade.Message_ProgressRange_1())
  return boxBuilder.Shape()
}

function buildFeatureDSLExtrudeShape(
  openCascade: OpenCascadeModule,
  feature: {
    id: string
    origin?: readonly CadKernelFeatureDSLExpression[]
    sketch: CadKernelFeatureDSLSketch
    height: CadKernelFeatureDSLExpression
  },
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
) {
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin ?? [0, 0, 0], parameters)
  const height = resolveFeatureDSLScalar(feature.height, parameters)
  if (feature.sketch.type === 'circle') {
    return buildFeatureDSLCirclePrismShape(openCascade, feature.id, origin, feature.sketch, parameters, height, 'extrude')
  }
  const sketchSize = resolveFeatureDSLVector(feature.sketch.size, parameters)
  return buildFeatureDSLRectanglePrismShape(openCascade, feature.id, origin, sketchSize, height, 'extrude')
}

function buildFeatureDSLExtrudeCutShape(
  openCascade: OpenCascadeModule,
  feature: {
    id: string
    origin: readonly CadKernelFeatureDSLExpression[]
    sketch: CadKernelFeatureDSLSketch
    depth: CadKernelFeatureDSLExpression
  },
  parameters: Record<string, number>,
  repeatedOrigin?: readonly number[],
) {
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin, parameters)
  const depth = resolveFeatureDSLScalar(feature.depth, parameters)
  if (feature.sketch.type === 'circle') {
    return buildFeatureDSLCirclePrismShape(openCascade, feature.id, origin, feature.sketch, parameters, depth, 'extrude_cut')
  }
  const sketchSize = resolveFeatureDSLVector(feature.sketch.size, parameters)
  return buildFeatureDSLRectanglePrismShape(openCascade, feature.id, origin, sketchSize, depth, 'extrude_cut')
}

function buildFeatureDSLCirclePrismShape(
  openCascade: OpenCascadeModule,
  featureID: string,
  origin: readonly number[],
  sketch: CadKernelFeatureDSLCircleSketch,
  parameters: Record<string, number>,
  length: number,
  label: string,
) {
  const radius = resolveFeatureDSLCircleRadius(featureID, sketch, parameters)
  if (radius <= 0 || length <= 0) {
    throw new Error(`Feature ${featureID} ${label} dimensions must be positive`)
  }
  const originPoint = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const direction = new openCascade.gp_Dir_4(0, 0, 1)
  const axis = new openCascade.gp_Ax2_3(originPoint, direction)
  const cylinderBuilder = new openCascade.BRepPrimAPI_MakeCylinder_3(axis, radius, length)
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
) {
  const origin = repeatedOrigin ?? resolveFeatureDSLVector(feature.origin, parameters)
  const radius = resolveFeatureDSLRadius(feature, parameters)
  const lengthExpression = feature[lengthKey]
  if (lengthExpression === undefined) {
    throw new Error(`Feature ${feature.id} cylinder ${lengthKey} is required`)
  }
  const length = resolveFeatureDSLScalar(lengthExpression, parameters)
  if (radius <= 0 || length <= 0) {
    throw new Error(`Feature ${feature.id} cylinder dimensions must be positive`)
  }
  const axisVector = resolveFeatureDSLVector(feature.axis ?? [0, 0, 1], parameters)
  if (axisVector.every((value) => value === 0)) {
    throw new Error(`Feature ${feature.id} cylinder axis must be non-zero`)
  }
  const originPoint = new openCascade.gp_Pnt_3(origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0)
  const direction = new openCascade.gp_Dir_4(axisVector[0] ?? 0, axisVector[1] ?? 0, axisVector[2] ?? 1)
  const axis = new openCascade.gp_Ax2_3(originPoint, direction)
  const cylinderBuilder = new openCascade.BRepPrimAPI_MakeCylinder_3(axis, radius, length)
  cylinderBuilder.Build(new openCascade.Message_ProgressRange_1())
  return cylinderBuilder.Shape()
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

function resolveFeatureDSLRadius(
  feature: { id: string; radius?: CadKernelFeatureDSLExpression; diameter?: CadKernelFeatureDSLExpression },
  parameters: Record<string, number>,
) {
  const hasRadius = feature.radius !== undefined
  const hasDiameter = feature.diameter !== undefined
  if (hasRadius === hasDiameter) {
    throw new Error(`Feature ${feature.id} cylinder requires exactly one of radius or diameter`)
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
