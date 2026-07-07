import type { CadKernelMesh } from './kernel-protocol'

export type CadKernelStepRoundTripInput = {
  filename: string
  stepText: string
}

export type CadKernelStepRoundTripResult = {
  mesh: CadKernelMesh
  exportedStepText: string
}

type OpenCascadeModule = Record<string, any> & {
  FS: {
    createDataFile: (
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
  initOpenCascade: () => Promise<OpenCascadeModule>
}

const inputStepPath = '/litecad-input.step'
const outputStepPath = '/litecad-output.step'

export async function loadOpenCascade(): Promise<OpenCascadeModule> {
  const module = (await import('opencascade.js')) as unknown as OpenCascadeFactoryModule
  return module.initOpenCascade()
}

export async function runOpenCascadeStepRoundTrip(input: CadKernelStepRoundTripInput) {
  const openCascade = await loadOpenCascade()
  return runStepRoundTripWithKernel(openCascade, input)
}

export async function runStepRoundTripWithKernel(
  openCascade: OpenCascadeModule,
  input: CadKernelStepRoundTripInput,
): Promise<CadKernelStepRoundTripResult> {
  cleanupVirtualFile(openCascade, inputStepPath)
  cleanupVirtualFile(openCascade, outputStepPath)
  openCascade.FS.createDataFile('/', inputStepPath.slice(1), input.stepText, true, true)

  try {
    const reader = new openCascade.STEPControl_Reader_1()
    const readResult = reader.ReadFile(inputStepPath)
    if (readResult !== openCascade.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(`STEP import failed for ${input.filename}`)
    }

    const rootCount = reader.TransferRoots(new openCascade.Message_ProgressRange_1())
    if (rootCount <= 0) {
      throw new Error(`STEP import produced no transferable roots for ${input.filename}`)
    }

    const shape = reader.OneShape()
    const mesh = tessellateShape(openCascade, shape)
    const exportedStepText = exportStep(openCascade, shape)
    return { mesh, exportedStepText }
  } finally {
    cleanupVirtualFile(openCascade, inputStepPath)
    cleanupVirtualFile(openCascade, outputStepPath)
  }
}

function cleanupVirtualFile(openCascade: OpenCascadeModule, path: string) {
  try {
    openCascade.FS.unlink(path)
  } catch {
    // Missing virtual files are expected between independent smoke runs.
  }
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

function exportStep(openCascade: OpenCascadeModule, shape: any): string {
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

  const writeStatus = writer.Write(outputStepPath)
  if (writeStatus !== openCascade.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error('STEP export write failed')
  }

  return String(openCascade.FS.readFile(outputStepPath, { encoding: 'utf8' }))
}
