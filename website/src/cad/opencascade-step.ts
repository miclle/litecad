import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type {
  CadKernelFeatureDSLInput,
  CadKernelGeometricReference,
  CadKernelMesh,
  CadKernelOperation,
  CadKernelShapeInspectionResult as CadKernelShapeInspectionProtocolResult,
  CadKernelShapeInspectionSource,
  CadKernelShapeProperties,
} from './kernel-protocol'
import initReplicadOpenCascade from 'replicad-opencascadejs'
import replicadWasmUrl from 'replicad-opencascadejs/src/replicad_single.wasm?url'
import type { OpenCascadeModule } from './feature-dsl/compiler-context'
import { compileFeatureDSLShape } from './feature-dsl/compile-runtime'

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

export type CadKernelSectionGeometryInput = {
  filename: string
  sources: CadKernelStepAssemblyExportSource[]
  plane: {
    origin: readonly number[]
    normal: readonly number[]
  }
}

export type CadKernelShapeInspectionInput = {
  sources: CadKernelShapeInspectionSource[]
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

export type CadKernelSectionGeometryResult = {
  status: 'ready' | 'empty'
  edgeCount: number
  exportedStepText: string
}

export type CadKernelShapeInspectionResult = CadKernelShapeInspectionProtocolResult

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

export async function runOpenCascadeSectionGeometry(input: CadKernelSectionGeometryInput) {
  const openCascade = await loadOpenCascade()
  return runSectionGeometryWithKernel(openCascade, input)
}

export async function runOpenCascadeShapeInspection(input: CadKernelShapeInspectionInput) {
  const openCascade = await loadOpenCascade()
  return runShapeInspectionWithKernel(openCascade, input)
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

export async function runSectionGeometryWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelSectionGeometryInput,
): Promise<CadKernelSectionGeometryResult> {
  if (input.sources.length === 0) {
    throw new Error('Section geometry requires at least one source')
  }
  const planeValues = [...input.plane.origin, ...input.plane.normal]
  if (
    input.plane.origin.length !== 3 ||
    input.plane.normal.length !== 3 ||
    planeValues.some((value) => !Number.isFinite(value)) ||
    input.plane.normal.every((value) => value === 0)
  ) {
    throw new Error('Section geometry requires a finite plane origin and non-zero normal')
  }
  cleanupVirtualFile(openCascade, outputStepPath)
  const sourceShapes: any[] = []

  try {
    for (const [index, source] of input.sources.entries()) {
      const sourcePath = stepSectionInputPath(index)
      cleanupVirtualFile(openCascade, sourcePath)
      writeVirtualFile(openCascade, sourcePath, source.stepText)
      sourceShapes.push(applyCADOperationsToShape(openCascade, importStepShapeFromFile(openCascade, sourcePath, source), source.operations))
    }
    const sourceShape = sourceShapes.length === 1 ? sourceShapes[0] : compoundShapes(openCascade, sourceShapes)
    const plane = new openCascade.gp_Pln_3(
      new openCascade.gp_Pnt_3(input.plane.origin[0], input.plane.origin[1], input.plane.origin[2]),
      new openCascade.gp_Dir_4(input.plane.normal[0], input.plane.normal[1], input.plane.normal[2]),
    )
    const sectionBuilder = new openCascade.BRepAlgoAPI_Section_5(sourceShape, plane, false)
    sectionBuilder.Build(new openCascade.Message_ProgressRange_1())
    if (!sectionBuilder.IsDone()) {
      throw new Error('OpenCascade section operation failed')
    }
    const sectionShape = sectionBuilder.Shape()
    const edgeCount = countShapeEdges(openCascade, sectionShape)
    if (edgeCount === 0) {
      return { status: 'empty', edgeCount: 0, exportedStepText: '' }
    }
    return { status: 'ready', edgeCount, exportedStepText: exportShapeToStep(openCascade, sectionShape) }
  } finally {
    input.sources.forEach((_source, index) => cleanupVirtualFile(openCascade, stepSectionInputPath(index)))
    cleanupVirtualFile(openCascade, outputStepPath)
  }
}

export async function runShapeInspectionWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelShapeInspectionInput,
): Promise<CadKernelShapeInspectionResult> {
  if (input.sources.length === 0) {
    throw new Error('Shape inspection requires at least one source')
  }
  const targetShapes: any[] = []
  try {
    for (const [index, source] of input.sources.entries()) {
      const sourcePath = stepInspectionInputPath(index)
      cleanupVirtualFile(openCascade, sourcePath)
      writeVirtualFile(openCascade, sourcePath, source.stepText)
      targetShapes.push(
        applyCADOperationsToShape(
          openCascade,
          importStepShapeFromFile(openCascade, sourcePath, source),
          source.operations,
        ),
      )
    }
    const targets = targetShapes.map((shape, index) => {
      const source = input.sources[index]
      if (!source) {
        throw new Error('Shape inspection source scope is unavailable')
      }
      const operationsSignature = createCADOperationsSignature(source.operations ?? [])
      return {
        referenceScope: { ...source.referenceScope, operationsSignature },
        ...measureShapeProperties(openCascade, shape),
        references: enumerateGeometricReferences(openCascade, shape, source, operationsSignature),
      }
    })
    const totalShape = targetShapes.length === 1 ? targetShapes[0] : compoundShapes(openCascade, targetShapes)
    return {
      derivation: 'occt-brep-properties',
      targets,
      totals: measureShapeProperties(openCascade, totalShape),
    }
  } finally {
    input.sources.forEach((_source, index) => cleanupVirtualFile(openCascade, stepInspectionInputPath(index)))
  }
}

function createCADOperationsSignature(operations: readonly CadKernelOperation[]) {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(operations))))}`
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

function stepSectionInputPath(index: number) {
  return `/litecad-section-input-${index}.step`
}

function stepInspectionInputPath(index: number) {
  return `/litecad-inspection-input-${index}.step`
}

function measureShapeProperties(openCascade: OpenCascadeModule, shape: any): CadKernelShapeProperties {
  const volumeProperties = new openCascade.GProp_GProps_1()
  const surfaceProperties = new openCascade.GProp_GProps_1()
  const linearProperties = new openCascade.GProp_GProps_1()
  try {
    openCascade.BRepGProp.VolumeProperties_1(shape, volumeProperties, true, false, false)
    openCascade.BRepGProp.SurfaceProperties_1(shape, surfaceProperties, false, false)
    openCascade.BRepGProp.LinearProperties(shape, linearProperties, true, false)
    const volume = normalizedMeasure(volumeProperties.Mass())
    const surfaceArea = normalizedMeasure(surfaceProperties.Mass())
    const edgeLength = normalizedMeasure(linearProperties.Mass())
    const centerSource = volume > 0 ? volumeProperties : surfaceArea > 0 ? surfaceProperties : linearProperties
    const center = centerSource.CentreOfMass()
    return {
      volume,
      surfaceArea,
      edgeLength,
      centerOfMass: [center.X(), center.Y(), center.Z()],
      solidCount: countShapeType(openCascade, shape, openCascade.TopAbs_ShapeEnum.TopAbs_SOLID),
      faceCount: countShapeType(openCascade, shape, openCascade.TopAbs_ShapeEnum.TopAbs_FACE),
      edgeCount: countShapeType(openCascade, shape, openCascade.TopAbs_ShapeEnum.TopAbs_EDGE),
    }
  } finally {
    volumeProperties.delete()
    surfaceProperties.delete()
    linearProperties.delete()
  }
}

function enumerateGeometricReferences(
  openCascade: OpenCascadeModule,
  shape: any,
  source: CadKernelShapeInspectionSource,
  operationsSignature: string,
): CadKernelGeometricReference[] {
  const references: CadKernelGeometricReference[] = []
  const scope = [
    encodeURIComponent(source.referenceScope.occurrenceId),
    encodeURIComponent(source.referenceScope.modelRevisionId),
    encodeURIComponent(operationsSignature),
  ].join(':')
  const append = (kind: 'face' | 'edge', shapeType: number, property: 'surface' | 'linear') => {
    const shapes = exploreUniqueShapes(openCascade, shape, shapeType)
    shapes.forEach((currentShape, shapeIndex) => {
      const properties = new openCascade.GProp_GProps_1()
      try {
        if (property === 'surface') {
          openCascade.BRepGProp.SurfaceProperties_1(currentShape, properties, false, false)
        } else {
          openCascade.BRepGProp.LinearProperties(currentShape, properties, false, false)
        }
        references.push({
          id: `topology:${scope}:${kind}:${shapeIndex + 1}`,
          kind,
          index: shapeIndex + 1,
          measure: normalizedMeasure(properties.Mass()),
        })
      } finally {
        properties.delete()
      }
    })
  }
  append('face', openCascade.TopAbs_ShapeEnum.TopAbs_FACE, 'surface')
  append('edge', openCascade.TopAbs_ShapeEnum.TopAbs_EDGE, 'linear')
  return references
}

function countShapeType(openCascade: OpenCascadeModule, shape: any, shapeType: number) {
  return exploreUniqueShapes(openCascade, shape, shapeType).length
}

function exploreUniqueShapes(openCascade: OpenCascadeModule, shape: any, shapeType: number): any[] {
  const explorer = new openCascade.TopExp_Explorer_1()
  const shapes: any[] = []
  for (
    explorer.Init(shape, shapeType, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE);
    explorer.More();
    explorer.Next()
  ) {
    const candidate = explorer.Current()
    if (!shapes.some((existing) => candidate.IsSame(existing))) {
      shapes.push(candidate)
    }
  }
  return shapes
}

function normalizedMeasure(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error('OpenCascade shape inspection produced a non-finite property')
  }
  return Math.abs(value) < 1e-12 ? 0 : Math.abs(value)
}

function countShapeEdges(openCascade: OpenCascadeModule, shape: any) {
  const explorer = new openCascade.TopExp_Explorer_1()
  let edgeCount = 0
  for (
    explorer.Init(shape, openCascade.TopAbs_ShapeEnum.TopAbs_EDGE, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE);
    explorer.More();
    explorer.Next()
  ) {
    edgeCount += 1
  }
  return edgeCount
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
