import type { CadKernelMesh, CadKernelOperation } from './kernel-protocol'
import initReplicadOpenCascade from 'replicad-opencascadejs'
import replicadWasmUrl from 'replicad-opencascadejs/src/replicad_single.wasm?url'

export type CadKernelStepRoundTripInput = {
  filename: string
  stepText: string
  operations?: CadKernelOperation[]
}

export type CadKernelStepPreviewInput = CadKernelStepRoundTripInput

export type CadKernelStepPreviewResult = {
  mesh: CadKernelMesh
}

export type CadKernelStepRoundTripResult = {
  mesh: CadKernelMesh
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

export async function runOpenCascadeStepPreview(input: CadKernelStepPreviewInput) {
  const openCascade = await loadOpenCascade()
  return runStepPreviewWithKernel(openCascade, input)
}

export async function runStepPreviewWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelStepPreviewInput,
): Promise<CadKernelStepPreviewResult> {
  cleanupVirtualFile(openCascade, inputStepPath)
  writeVirtualFile(openCascade, inputStepPath, input.stepText)

  try {
    const shape = applyCADOperationsToShape(openCascade, importStepShape(openCascade, input), input.operations)
    return { mesh: tessellateShape(openCascade, shape) }
  } finally {
    cleanupVirtualFile(openCascade, inputStepPath)
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

export function applyCADOperationsToShape(
  openCascade: OpenCascadeModule,
  sourceShape: any,
  operations: readonly CadKernelOperation[] = [],
) {
  return operations.reduce((shape, operation) => {
    if (operation.type !== 'transform') {
      throw new Error(`Unsupported CAD operation: ${operation.type}`)
    }
    return transformShape(openCascade, shape, operation.matrix)
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

function importStepShape(openCascade: OpenCascadeModule, input: CadKernelStepRoundTripInput) {
  const reader = new openCascade.STEPControl_Reader_1()
  const readResult = reader.ReadFile(inputStepName)
  if (readResult !== openCascade.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error(`STEP import failed for ${input.filename}`)
  }

  const rootCount = reader.TransferRoots(new openCascade.Message_ProgressRange_1())
  if (rootCount <= 0) {
    throw new Error(`STEP import produced no transferable roots for ${input.filename}`)
  }

  return reader.OneShape()
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
