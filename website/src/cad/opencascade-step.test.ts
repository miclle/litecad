/// <reference types="node" />

import { describe, expect, it, vi } from 'vitest'
import initReplicadOpenCascade from 'replicad-opencascadejs'

import {
  applyCADOperationsToShape,
  createOpenCascadeLoader,
  runFeatureDSLPreviewWithKernel,
  runFeatureDSLExportWithKernel,
  runStepAssemblyExportWithKernel,
} from './opencascade-step'

describe('createOpenCascadeLoader', () => {
  it('loads the OpenCascade factory with an explicit Vite wasm URL', async () => {
    const openCascade = {
      FS: {
        createDataFile: vi.fn(),
        readFile: vi.fn(),
        unlink: vi.fn(),
      },
    }
    const initOpenCascade = vi.fn(async (options?: { locateFile?: (path: string) => string }) => {
      void options
      return openCascade
    })

    const loadOpenCascade = createOpenCascadeLoader(initOpenCascade, '/assets/replicad_single.wasm')
    const loaded = await loadOpenCascade()

    expect(loaded).toBe(openCascade)
    expect(initOpenCascade).toHaveBeenCalledOnce()
    const options = initOpenCascade.mock.calls[0]?.[0]
    expect(options).toBeDefined()
    expect(options?.locateFile).toBeDefined()
    const locateFile = options?.locateFile
    if (!locateFile) {
      throw new Error('expected locateFile to be configured')
    }
    expect(locateFile('replicad_single.wasm')).toBe('/assets/replicad_single.wasm')
    expect(locateFile('other.data')).toBe('other.data')
  })
})

describe('runOpenCascadeFeatureDSLPreview', () => {
  it('tessellates ellipsoid and ellipse extrude features with non-circular bounds', async () => {
    const loadOpenCascade = createOpenCascadeLoader(
      initReplicadOpenCascade as unknown as Parameters<typeof createOpenCascadeLoader>[0],
      `${process.cwd()}/node_modules/replicad-opencascadejs/src/replicad_single.wasm`,
    )
    const openCascade = await loadOpenCascade()

    const ellipsoid = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'ellipsoid.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [{ id: 'ellipsoid', type: 'ellipsoid', origin: [0, 0, 0], diameter_x: 30, diameter_y: 20, diameter_z: 50 }],
      },
      parameterValues: {},
    })
    const ellipseExtrude = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'ellipse-extrude.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [{ id: 'post', type: 'ellipse_extrude', origin: [0, 0, 0], diameter_x: 30, diameter_y: 20, height: 50 }],
      },
      parameterValues: {},
    })

    expect(meshSize(ellipsoid.mesh)).toEqual({
      x: expect.closeTo(30, 1),
      y: expect.closeTo(20, 1),
      z: expect.closeTo(50, 1),
    })
    expect(meshSize(ellipseExtrude.mesh)).toEqual({
      x: expect.closeTo(30, 1),
      y: expect.closeTo(20, 1),
      z: expect.closeTo(50, 1),
    })
  }, 30000)

  it('cuts ellipsoid features as solid geometry', async () => {
    const loadOpenCascade = createOpenCascadeLoader(
      initReplicadOpenCascade as unknown as Parameters<typeof createOpenCascadeLoader>[0],
      `${process.cwd()}/node_modules/replicad-opencascadejs/src/replicad_single.wasm`,
    )
    const openCascade = await loadOpenCascade()

    const ellipsoid = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'ellipsoid.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [{ id: 'ellipsoid', type: 'ellipsoid', origin: [0, 0, 0], diameter_x: 36, diameter_y: 24, diameter_z: 36 }],
      },
      parameterValues: {},
    })
    const cutEllipsoid = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'ellipsoid-cut.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [
          { id: 'ellipsoid', type: 'ellipsoid', origin: [0, 0, 0], diameter_x: 36, diameter_y: 24, diameter_z: 36 },
          { id: 'through_hole', type: 'cylinder_cut', origin: [0, 0, -18], diameter: 8, depth: 36 },
        ],
      },
      parameterValues: {},
    })

    expect(cutEllipsoid.mesh.positions.length).toBeGreaterThan(ellipsoid.mesh.positions.length)
  }, 30000)

  it('applies feature transforms with scale, rotate, and translate', async () => {
    const loadOpenCascade = createOpenCascadeLoader(
      initReplicadOpenCascade as unknown as Parameters<typeof createOpenCascadeLoader>[0],
      `${process.cwd()}/node_modules/replicad-opencascadejs/src/replicad_single.wasm`,
    )
    const openCascade = await loadOpenCascade()

    const transformedBox = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'transformed-box.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [
          {
            id: 'transformed_box',
            type: 'box',
            origin: [0, 0, 0],
            size: [10, 20, 4],
            transform: {
              scale: [2, 0.5, 3],
              rotate: { axis: [0, 0, 1], angle_degrees: 90 },
              translate: [30, -5, 2],
            },
          },
        ],
      },
      parameterValues: {},
    })

    const bounds = meshBounds(transformedBox.mesh)
    expect(bounds.minX).toBeCloseTo(20, 1)
    expect(bounds.maxX).toBeCloseTo(30, 1)
    expect(bounds.minY).toBeCloseTo(-5, 1)
    expect(bounds.maxY).toBeCloseTo(15, 1)
    expect(bounds.minZ).toBeCloseTo(2, 1)
    expect(bounds.maxZ).toBeCloseTo(14, 1)
  }, 30000)

  it('applies non-uniform feature scale to curved primitives', async () => {
    const loadOpenCascade = createOpenCascadeLoader(
      initReplicadOpenCascade as unknown as Parameters<typeof createOpenCascadeLoader>[0],
      `${process.cwd()}/node_modules/replicad-opencascadejs/src/replicad_single.wasm`,
    )
    const openCascade = await loadOpenCascade()

    const scaledSphere = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'scaled-sphere.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [
          {
            id: 'scaled_sphere',
            type: 'sphere',
            origin: [0, 0, 0],
            diameter: 20,
            transform: { scale: [1, 2, 0.5] },
          },
        ],
      },
      parameterValues: {},
    })

    const scaledExtrude = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'scaled-circle-extrude.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [
          {
            id: 'scaled_circle_extrude',
            type: 'extrude',
            origin: [0, 0, 0],
            sketch: { type: 'circle', diameter: 20 },
            height: 8,
            transform: { scale: [1, 2, 3] },
          },
        ],
      },
      parameterValues: {},
    })

    expect(meshSize(scaledSphere.mesh).x).toBeCloseTo(20, 0)
    expect(meshSize(scaledSphere.mesh).y).toBeCloseTo(40, 0)
    expect(meshSize(scaledSphere.mesh).z).toBeCloseTo(10, 0)
    expect(meshSize(scaledExtrude.mesh).x).toBeCloseTo(20, 1)
    expect(meshSize(scaledExtrude.mesh).y).toBeCloseTo(40, 1)
    expect(meshSize(scaledExtrude.mesh).z).toBeCloseTo(24, 1)
  }, 30000)

  it('positions directed sketch extrudes after applying Z scale', async () => {
    const loadOpenCascade = createOpenCascadeLoader(
      initReplicadOpenCascade as unknown as Parameters<typeof createOpenCascadeLoader>[0],
      `${process.cwd()}/node_modules/replicad-opencascadejs/src/replicad_single.wasm`,
    )
    const openCascade = await loadOpenCascade()

    const symmetricExtrude = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'scaled-symmetric-extrude.lcad.json',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [
          {
            id: 'scaled_symmetric_extrude',
            type: 'extrude',
            origin: [0, 0, 0],
            sketch: { type: 'rectangle', size: [10, 10] },
            height: 10,
            direction: 'symmetric',
            transform: { scale: [1, 1, 2] },
          },
        ],
      },
      parameterValues: {},
    })

    const bounds = meshBounds(symmetricExtrude.mesh)
    expect(bounds.minZ).toBeCloseTo(-10, 1)
    expect(bounds.maxZ).toBeCloseTo(10, 1)
  }, 30000)
})

function meshSize(mesh: { positions: readonly number[] }) {
  const bounds = meshBounds(mesh)
  return {
    x: bounds.maxX - bounds.minX,
    y: bounds.maxY - bounds.minY,
    z: bounds.maxZ - bounds.minZ,
  }
}

function meshBounds(mesh: { positions: readonly number[] }) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  }
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const x = mesh.positions[index] ?? 0
    const y = mesh.positions[index + 1] ?? 0
    const z = mesh.positions[index + 2] ?? 0
    bounds.minX = Math.min(bounds.minX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.minZ = Math.min(bounds.minZ, z)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.maxY = Math.max(bounds.maxY, y)
    bounds.maxZ = Math.max(bounds.maxZ, z)
  }
  return bounds
}

describe('applyCADOperationsToShape', () => {
  it('replays transform operations through OpenCascade shape transforms', () => {
    const sourceShape = { name: 'source-shape' }
    const transformedShape = { name: 'transformed-shape' }
    const setValues = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(),
        unlink: vi.fn(),
      },
      gp_Trsf_1: vi.fn(function gpTrsf(this: { SetValues: typeof setValues }) {
        this.SetValues = setValues
      }),
      BRepBuilderAPI_Transform_2: vi.fn(function transformBuilder(
        this: { Shape: () => unknown },
        shape: unknown,
        transform: unknown,
        copy: boolean,
      ) {
        expect(shape).toBe(sourceShape)
        expect(transform).toBeDefined()
        expect(copy).toBe(true)
        this.Shape = () => transformedShape
      }),
    }

    expect(
      applyCADOperationsToShape(openCascade, sourceShape, [
        {
          id: 'op_01test',
          type: 'transform',
          modelId: 'mdl_01test',
          matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1],
        },
      ]),
    ).toBe(transformedShape)
    expect(setValues).toHaveBeenCalledWith(1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8)
  })

  it('replays box-union operations through OpenCascade boolean fuse', () => {
    const sourceShape = { name: 'source-shape' }
    const boxShape = { name: 'box-shape' }
    const fusedShape = { name: 'fused-shape' }
    const buildBox = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(),
        unlink: vi.fn(),
      },
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakeBox_3: vi.fn(function makeBox(
        this: { Build: typeof buildBox; Shape: () => unknown },
        origin: unknown,
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect(origin).toBeDefined()
        expect([sizeX, sizeY, sizeZ]).toEqual([8, 6, 3])
        this.Build = buildBox
        this.Shape = () => boxShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
      BRepAlgoAPI_Fuse_3: vi.fn(function fuse(this: { Shape: () => unknown }, first: unknown, second: unknown) {
        expect(first).toBe(sourceShape)
        expect(second).toBe(boxShape)
        this.Shape = () => fusedShape
      }),
    }

    expect(
      applyCADOperationsToShape(openCascade, sourceShape, [
        {
          id: 'op_box',
          type: 'box-union',
          modelId: 'mdl_01test',
          box: {
            origin: [2, -1, 4],
            size: [8, 6, 3],
          },
        },
      ]),
    ).toBe(fusedShape)
    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(2, -1, 4)
    expect(buildBox).toHaveBeenCalledOnce()
  })
})

describe('runStepAssemblyExportWithKernel', () => {
  it('imports selected STEP sources into one compound shape before writing STEP', async () => {
    const firstShape = { name: 'first-shape' }
    const secondShape = { name: 'second-shape' }
    const compoundShape = { name: 'compound-shape' }
    const readerShapes = [firstShape, secondShape]
    const unlink = vi.fn()
    const writeFile = vi.fn()
    const addShape = vi.fn()
    const makeCompound = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        writeFile,
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink,
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Reader_1: vi.fn(function reader(this: {
        ReadFile: (filename: string) => number
        TransferRoots: () => number
        OneShape: () => unknown
      }) {
        const shape = readerShapes.shift()
        this.ReadFile = vi.fn(() => 1)
        this.TransferRoots = vi.fn(() => 1)
        this.OneShape = () => shape
      }),
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
      TopoDS_Compound: vi.fn(function compound(this: { name: string }) {
        this.name = compoundShape.name
      }),
      TopoDS_Builder: vi.fn(function builder(this: {
        MakeCompound: typeof makeCompound
        Add: typeof addShape
      }) {
        this.MakeCompound = makeCompound
        this.Add = addShape
      }),
    }

    const result = await runStepAssemblyExportWithKernel(openCascade, {
      filename: 'assembly.step',
      sources: [
        { filename: 'part-a.step', stepText: 'ISO-10303-21;' },
        { filename: 'part-b.step', stepText: 'ISO-10303-21;' },
      ],
    })

    expect(writeFile).toHaveBeenCalledWith('/litecad-assembly-input-0.step', 'ISO-10303-21;')
    expect(writeFile).toHaveBeenCalledWith('/litecad-assembly-input-1.step', 'ISO-10303-21;')
    expect(makeCompound).toHaveBeenCalledOnce()
    expect(addShape).toHaveBeenCalledWith(expect.anything(), firstShape)
    expect(addShape).toHaveBeenCalledWith(expect.anything(), secondShape)
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({ name: compoundShape.name }),
      0,
      true,
      expect.anything(),
    )
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
    expect(unlink).toHaveBeenCalledWith('/litecad-assembly-input-0.step')
    expect(unlink).toHaveBeenCalledWith('/litecad-assembly-input-1.step')
  })
})

describe('runFeatureDSLExportWithKernel', () => {
  it('builds a parameterized box feature before writing STEP', async () => {
    const boxShape = { name: 'box-shape' }
    const buildBox = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      BRepPrimAPI_MakeBox_2: vi.fn(function makeBox(
        this: { Build: typeof buildBox; Shape: () => unknown },
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect([sizeX, sizeY, sizeZ]).toEqual([96, 40, 6])
        this.Build = buildBox
        this.Shape = () => boxShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'generated.step',
      parameterValues: { width: 96 },
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          width: { type: 'number', default: 80, min: 20, max: 200 },
        },
        features: [{ id: 'base', type: 'box', size: ['width', 40, 6] }],
      },
    })

    expect(buildBox).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(boxShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('builds a rectangular sketch extrude before writing STEP', async () => {
    const extrudeShape = { name: 'extrude-shape' }
    const buildExtrude = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakeBox_3: vi.fn(function makeBoxAtOrigin(
        this: { Build: typeof buildExtrude; Shape: () => unknown },
        origin: unknown,
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect(origin).toBeDefined()
        expect([sizeX, sizeY, sizeZ]).toEqual([96, 48, 8])
        this.Build = buildExtrude
        this.Shape = () => extrudeShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'extruded-bracket.step',
      parameterValues: { width: 96, depth: 48, thickness: 8 },
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          width: { type: 'number', default: 80, min: 20, max: 200 },
          depth: { type: 'number', default: 40 },
          thickness: { type: 'number', default: 6 },
        },
        features: [
          {
            id: 'base',
            type: 'extrude',
            origin: [2, 3, 4],
            sketch: { type: 'rectangle', size: ['width', 'depth'] },
            height: 'thickness',
          },
        ],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(2, 3, 4)
    expect(buildExtrude).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(extrudeShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('applies sketch extrusion direction before writing STEP', async () => {
    const extrudeShape = { name: 'directed-extrude-shape' }
    const buildExtrude = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakeBox_3: vi.fn(function makeBoxAtOrigin(
        this: { Build: typeof buildExtrude; Shape: () => unknown },
        origin: unknown,
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect(origin).toBeDefined()
        expect([sizeX, sizeY, sizeZ]).toEqual([80, 40, 6])
        this.Build = buildExtrude
        this.Shape = () => extrudeShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'negative-extrude.step',
      document: {
        version: 1,
        unit: 'millimetre',
        features: [
          {
            id: 'base',
            type: 'extrude',
            origin: [2, 3, 4],
            sketch: { type: 'rectangle', size: [80, 40] },
            height: 6,
            direction: 'negative',
          },
        ],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(2, 3, -2)
    expect(buildExtrude).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(extrudeShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('subtracts rectangular sketch cut extrudes before writing STEP', async () => {
    const baseShape = { name: 'base-shape' }
    const cutterShape = { name: 'extrude-cutter-shape' }
    const cutShape = { name: 'extrude-cut-shape' }
    const buildBase = vi.fn()
    const buildCutter = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakeBox_2: vi.fn(function makeBox(
        this: { Build: typeof buildBase; Shape: () => unknown },
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect([sizeX, sizeY, sizeZ]).toEqual([80, 40, 6])
        this.Build = buildBase
        this.Shape = () => baseShape
      }),
      BRepPrimAPI_MakeBox_3: vi.fn(function makeBoxAtOrigin(
        this: { Build: typeof buildCutter; Shape: () => unknown },
        origin: unknown,
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect(origin).toBeDefined()
        expect([sizeX, sizeY, sizeZ]).toEqual([20, 10, 9])
        this.Build = buildCutter
        this.Shape = () => cutterShape
      }),
      BRepAlgoAPI_Cut_3: vi.fn(function cut(this: { Shape: () => unknown }, base: unknown, cutter: unknown) {
        expect(base).toBe(baseShape)
        expect(cutter).toBe(cutterShape)
        this.Shape = () => cutShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'extruded-slot.step',
      parameterValues: { slot_width: 10, cut_depth: 9 },
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          slot_width: { type: 'number', default: 12 },
          cut_depth: { type: 'number', default: 8 },
        },
        features: [
          { id: 'base', type: 'box', size: [80, 40, 6] },
          {
            id: 'slot',
            type: 'extrude_cut',
            origin: [30, 14, -1],
            sketch: { type: 'rectangle', size: [20, 'slot_width'] },
            depth: 'cut_depth',
          },
        ],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(30, 14, -1)
    expect(buildBase).toHaveBeenCalledOnce()
    expect(buildCutter).toHaveBeenCalledOnce()
    expect(openCascade.BRepAlgoAPI_Cut_3).toHaveBeenCalledWith(baseShape, cutterShape, expect.anything())
    expect(transfer).toHaveBeenCalledWith(cutShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('evaluates structured numeric expressions before writing STEP', async () => {
    const extrudeShape = { name: 'expression-shape' }
    const buildExtrude = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakeBox_3: vi.fn(function makeBoxAtOrigin(
        this: { Build: typeof buildExtrude; Shape: () => unknown },
        origin: unknown,
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect(origin).toBeDefined()
        expect([sizeX, sizeY, sizeZ]).toEqual([106, 40, 5])
        this.Build = buildExtrude
        this.Shape = () => extrudeShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'expression-bracket.step',
      parameterValues: { width: 100, clearance: 3 },
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          width: { type: 'number', default: 80, min: 20, max: 200 },
          clearance: { type: 'number', default: 2, min: 0, max: 10 },
        },
        features: [
          {
            id: 'base',
            type: 'extrude',
            origin: [{ op: 'sub', args: ['clearance', 1] }, 0, 0],
            sketch: {
              type: 'rectangle',
              size: [{ op: 'add', args: ['width', { op: 'mul', args: ['clearance', 2] }] }, 40],
            },
            height: { op: 'div', args: ['width', 20] },
          },
        ],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(2, 0, 0)
    expect(buildExtrude).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(extrudeShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('builds a circular sketch extrude before writing STEP', async () => {
    const extrudeShape = { name: 'circle-extrude-shape' }
    const buildCylinder = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Dir_4: vi.fn(function direction(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Ax2_3: vi.fn(function axis(this: { origin: unknown; direction: unknown }, origin: unknown, direction: unknown) {
        this.origin = origin
        this.direction = direction
      }),
      BRepPrimAPI_MakeCylinder_3: vi.fn(function makeCylinder(
        this: { Build: typeof buildCylinder; Shape: () => unknown },
        axis: unknown,
        radius: number,
        height: number,
      ) {
        expect(axis).toBeDefined()
        expect([radius, height]).toEqual([9, 8])
        this.Build = buildCylinder
        this.Shape = () => extrudeShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'round-boss.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          boss_diameter: { type: 'number', default: 18 },
        },
        features: [{ id: 'boss', type: 'extrude', origin: [2, 3, 4], sketch: { type: 'circle', diameter: 'boss_diameter' }, height: 8 }],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(2, 3, 4)
    expect(openCascade.gp_Dir_4).toHaveBeenCalledWith(0, 0, 1)
    expect(buildCylinder).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(extrudeShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('builds additive cylinder features along a provided axis before writing STEP', async () => {
    const cylinderShape = { name: 'cylinder-shape' }
    const buildCylinder = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Dir_4: vi.fn(function direction(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Ax2_3: vi.fn(function axis(this: { origin: unknown; direction: unknown }, origin: unknown, direction: unknown) {
        this.origin = origin
        this.direction = direction
      }),
      BRepPrimAPI_MakeCylinder_3: vi.fn(function makeCylinder(
        this: { Build: typeof buildCylinder; Shape: () => unknown },
        axis: unknown,
        radius: number,
        height: number,
      ) {
        expect(axis).toBeDefined()
        expect([radius, height]).toEqual([6, 14])
        this.Build = buildCylinder
        this.Shape = () => cylinderShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'boss.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          boss_radius: { type: 'number', default: 5 },
        },
        features: [{ id: 'boss', type: 'cylinder', origin: [4, 5, 6], axis: [1, 0, 0], radius: 'boss_radius', height: 14 }],
      },
      parameterValues: { boss_radius: 6 },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(4, 5, 6)
    expect(openCascade.gp_Dir_4).toHaveBeenCalledWith(1, 0, 0)
    expect(buildCylinder).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(cylinderShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('builds additive sphere features before writing STEP', async () => {
    const sphereShape = { name: 'sphere-shape' }
    const buildSphere = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakeSphere_5: vi.fn(function makeSphere(
        this: { Build: typeof buildSphere; Shape: () => unknown },
        center: unknown,
        radius: number,
      ) {
        expect(center).toBeDefined()
        expect(radius).toBe(17)
        this.Build = buildSphere
        this.Shape = () => sphereShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'ball.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          ball_diameter: { type: 'number', default: 30 },
        },
        features: [{ id: 'ball', type: 'sphere', origin: [4, 5, 6], diameter: 'ball_diameter' }],
      },
      parameterValues: { ball_diameter: 34 },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(4, 5, 6)
    expect(buildSphere).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(sphereShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('builds ellipsoid features from sewn triangular faces before writing STEP', async () => {
    const sewedShape = { name: 'sewed-ellipsoid-shape' }
    const ellipsoidShell = { name: 'ellipsoid-shell' }
    const ellipsoidSolid = { name: 'ellipsoid-solid' }
    const sewingAdd = vi.fn()
    const sewingPerform = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepBuilderAPI_MakeEdge_3: vi.fn(function makeEdge(this: { Edge: () => unknown }, first: unknown, second: unknown) {
        expect(first).toBeDefined()
        expect(second).toBeDefined()
        this.Edge = () => ({ kind: 'edge', first, second })
      }),
      BRepBuilderAPI_MakeWire_4: vi.fn(function makeWire(
        this: { Wire: () => unknown },
        first: unknown,
        second: unknown,
        third: unknown,
      ) {
        this.Wire = () => ({ kind: 'wire', edges: [first, second, third] })
      }),
      BRepBuilderAPI_MakeFace_15: vi.fn(function makeFace(this: { Face: () => unknown }, wire: unknown, onlyPlane: boolean) {
        expect(wire).toBeDefined()
        expect(onlyPlane).toBe(true)
        this.Face = () => ({ kind: 'face', wire })
      }),
      BRepBuilderAPI_Sewing: vi.fn(function sewing(this: {
        Add: typeof sewingAdd
        Perform: typeof sewingPerform
        SewedShape: () => unknown
      }) {
        this.Add = sewingAdd
        this.Perform = sewingPerform
        this.SewedShape = () => sewedShape
      }),
      TopoDS: {
        Shell_1: vi.fn((shape: unknown) => {
          expect(shape).toBe(sewedShape)
          return ellipsoidShell
        }),
      },
      ShapeFix_Solid_1: vi.fn(function shapeFixSolid(this: { SolidFromShell: (shell: unknown) => unknown }) {
        this.SolidFromShell = (shell: unknown) => {
          expect(shell).toBe(ellipsoidShell)
          return ellipsoidSolid
        }
      }),
      BRepLib: {
        OrientClosedSolid: vi.fn((solid: unknown) => {
          expect(solid).toBe(ellipsoidSolid)
          return true
        }),
      },
      BRepBuilderAPI_MakeSolid_3: vi.fn(function makeSolid(this: { Solid: () => unknown }, shell: unknown) {
        expect(shell).toBe(ellipsoidShell)
        this.Solid = () => ellipsoidSolid
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'ellipsoid.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          major: { type: 'number', default: 30 },
          minor: { type: 'number', default: 18 },
        },
        features: [
          {
            id: 'oval',
            type: 'ellipsoid',
            origin: [4, 5, 6],
            radius_x: { op: 'div', args: ['major', 2] },
            radius_y: { op: 'div', args: ['minor', 2] },
            radius_z: 20,
          },
        ],
      },
      parameterValues: { major: 34, minor: 16 },
    })

    const pointBounds = boundsFromPointCalls(openCascade.gp_Pnt_3.mock.calls)
    expect(pointBounds).toEqual({
      x: expect.closeTo(34, 6),
      y: expect.closeTo(16, 6),
      z: expect.closeTo(40, 6),
    })
    expect(sewingAdd).toHaveBeenCalled()
    expect(sewingPerform).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(ellipsoidSolid, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('builds ellipse extrude features from an ellipse face prism before writing STEP', async () => {
    const edge = { name: 'ellipse-edge' }
    const wire = { name: 'ellipse-wire' }
    const face = { name: 'ellipse-face' }
    const ovalShape = { name: 'ellipse-prism-shape' }
    const buildPrism = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Dir_4: vi.fn(function direction(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Ax2_2: vi.fn(function axis(this: { origin: unknown; normal: unknown; xDirection: unknown }, origin: unknown, normal: unknown, xDirection: unknown) {
        this.origin = origin
        this.normal = normal
        this.xDirection = xDirection
      }),
      gp_Elips_2: vi.fn(function ellipse(
        this: { axis: unknown; majorRadius: number; minorRadius: number },
        axis: unknown,
        majorRadius: number,
        minorRadius: number,
      ) {
        expect(axis).toBeDefined()
        this.axis = axis
        this.majorRadius = majorRadius
        this.minorRadius = minorRadius
      }),
      BRepBuilderAPI_MakeEdge_12: vi.fn(function makeEdge(this: { Edge: () => unknown }, ellipse: unknown) {
        expect(ellipse).toBeDefined()
        this.Edge = () => edge
      }),
      BRepBuilderAPI_MakeWire_2: vi.fn(function makeWire(this: { Wire: () => unknown }, edgeShape: unknown) {
        expect(edgeShape).toBe(edge)
        this.Wire = () => wire
      }),
      BRepBuilderAPI_MakeFace_15: vi.fn(function makeFace(this: { Face: () => unknown }, wireShape: unknown, onlyPlane: boolean) {
        expect(wireShape).toBe(wire)
        expect(onlyPlane).toBe(true)
        this.Face = () => face
      }),
      gp_Vec_4: vi.fn(function vector(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakePrism_1: vi.fn(function makePrism(
        this: { Build: typeof buildPrism; Shape: () => unknown },
        faceShape: unknown,
        vector: unknown,
        copy: boolean,
        canonize: boolean,
      ) {
        expect(faceShape).toBe(face)
        expect(vector).toBeDefined()
        expect(copy).toBe(false)
        expect(canonize).toBe(true)
        this.Build = buildPrism
        this.Shape = () => ovalShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'ellipse-extrude.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          major: { type: 'number', default: 30 },
          minor: { type: 'number', default: 18 },
          height: { type: 'number', default: 50 },
        },
        features: [
          {
            id: 'oval_post',
            type: 'ellipse_extrude',
            origin: [4, 5, 6],
            diameter_x: 'major',
            radius_y: { op: 'div', args: ['minor', 2] },
            height: 'height',
          },
        ],
      },
      parameterValues: { major: 34, minor: 16, height: 48 },
    })

    expect(openCascade.gp_Dir_4).toHaveBeenCalledWith(0, 0, 1)
    expect(openCascade.gp_Dir_4).toHaveBeenCalledWith(1, 0, 0)
    expect(openCascade.gp_Elips_2).toHaveBeenCalledWith(expect.anything(), 17, 8)
    expect(openCascade.gp_Vec_4).toHaveBeenCalledWith(0, 0, 48)
    expect(buildPrism).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(ovalShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('rejects cylinder axes that resolve to zero before building OCCT directions', async () => {
    const openCascade = {
      FS: {
        readFile: vi.fn(),
        unlink: vi.fn(),
      },
      gp_Dir_4: vi.fn(),
    }

    await expect(
      runFeatureDSLExportWithKernel(openCascade, {
        filename: 'bad-axis.step',
        document: {
          version: 1,
          unit: 'millimetre',
          parameters: {
            axis_x: { type: 'number', default: 0 },
          },
          features: [{ id: 'boss', type: 'cylinder', origin: [0, 0, 0], axis: ['axis_x', 0, 0], radius: 4, height: 8 }],
        },
      }),
    ).rejects.toThrow('Feature boss cylinder axis must be non-zero')
    expect(openCascade.gp_Dir_4).not.toHaveBeenCalled()
  })

  it('subtracts cylinder-cut features from the accumulated shape before writing STEP', async () => {
    const boxShape = { name: 'box-shape' }
    const cutterShape = { name: 'cutter-shape' }
    const cutShape = { name: 'cut-shape' }
    const buildBox = vi.fn()
    const buildCylinder = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      BRepPrimAPI_MakeBox_2: vi.fn(function makeBox(
        this: { Build: typeof buildBox; Shape: () => unknown },
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect([sizeX, sizeY, sizeZ]).toEqual([80, 40, 6])
        this.Build = buildBox
        this.Shape = () => boxShape
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Dir_4: vi.fn(function direction(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Ax2_3: vi.fn(function axis(this: { origin: unknown; direction: unknown }, origin: unknown, direction: unknown) {
        this.origin = origin
        this.direction = direction
      }),
      BRepPrimAPI_MakeCylinder_3: vi.fn(function makeCylinder(
        this: { Build: typeof buildCylinder; Shape: () => unknown },
        axis: unknown,
        radius: number,
        height: number,
      ) {
        expect(axis).toBeDefined()
        expect([radius, height]).toEqual([4, 8])
        this.Build = buildCylinder
        this.Shape = () => cutterShape
      }),
      BRepAlgoAPI_Cut_3: vi.fn(function cut(this: { Shape: () => unknown }, base: unknown, cutter: unknown) {
        expect(base).toBe(boxShape)
        expect(cutter).toBe(cutterShape)
        this.Shape = () => cutShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'plate-with-hole.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          hole_diameter: { type: 'number', default: 8 },
        },
        features: [
          { id: 'plate', type: 'box', size: [80, 40, 6] },
          { id: 'hole', type: 'cylinder_cut', origin: [40, 20, -1], diameter: 'hole_diameter', depth: 8 },
        ],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(40, 20, -1)
    expect(buildBox).toHaveBeenCalledOnce()
    expect(buildCylinder).toHaveBeenCalledOnce()
    expect(transfer).toHaveBeenCalledWith(cutShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('subtracts box-cut features from the accumulated shape before writing STEP', async () => {
    const plateShape = { name: 'plate-shape' }
    const cutterShape = { name: 'slot-cutter-shape' }
    const cutShape = { name: 'slot-cut-shape' }
    const buildPlate = vi.fn()
    const buildCutter = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      BRepPrimAPI_MakeBox_2: vi.fn(function makeBox(
        this: { Build: () => void; Shape: () => unknown },
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect([sizeX, sizeY, sizeZ]).toEqual([80, 40, 6])
        this.Build = buildPlate
        this.Shape = () => plateShape
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      BRepPrimAPI_MakeBox_3: vi.fn(function makeBoxAtOrigin(
        this: { Build: () => void; Shape: () => unknown },
        origin: unknown,
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect(origin).toBeDefined()
        expect([sizeX, sizeY, sizeZ]).toEqual([20, 10, 8])
        this.Build = buildCutter
        this.Shape = () => cutterShape
      }),
      BRepAlgoAPI_Cut_3: vi.fn(function cut(this: { Shape: () => unknown }, base: unknown, cutter: unknown) {
        expect(base).toBe(plateShape)
        expect(cutter).toBe(cutterShape)
        this.Shape = () => cutShape
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'plate-with-slot.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          slot_width: { type: 'number', default: 10 },
        },
        features: [
          { id: 'plate', type: 'box', size: [80, 40, 6] },
          { id: 'slot', type: 'box_cut', origin: [30, 15, -1], size: [20, 'slot_width', 8] },
        ],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(30, 15, -1)
    expect(buildPlate).toHaveBeenCalledOnce()
    expect(buildCutter).toHaveBeenCalledOnce()
    expect(openCascade.BRepAlgoAPI_Cut_3).toHaveBeenCalledWith(plateShape, cutterShape, expect.anything())
    expect(transfer).toHaveBeenCalledWith(cutShape, 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })

  it('expands repeated cylinder-cut features before writing STEP', async () => {
    const boxShape = { name: 'box-shape' }
    const cutterShapes = [{ name: 'cutter-a' }, { name: 'cutter-b' }]
    const cutShapes = [{ name: 'cut-a' }, { name: 'cut-b' }]
    const buildBox = vi.fn()
    const buildCylinder = vi.fn()
    const transfer = vi.fn()
    const write = vi.fn()
    const openCascade = {
      FS: {
        readFile: vi.fn(() => 'ISO-10303-21;\nEND-ISO-10303-21;'),
        unlink: vi.fn(),
      },
      IFSelect_ReturnStatus: {
        IFSelect_RetDone: 1,
      },
      STEPControl_StepModelType: {
        STEPControl_AsIs: 0,
      },
      STEPControl_Writer_1: vi.fn(function writer(this: {
        Transfer: typeof transfer
        Write: typeof write
      }) {
        this.Transfer = transfer.mockReturnValue(1)
        this.Write = write.mockReturnValue(1)
      }),
      BRepPrimAPI_MakeBox_2: vi.fn(function makeBox(
        this: { Build: typeof buildBox; Shape: () => unknown },
        sizeX: number,
        sizeY: number,
        sizeZ: number,
      ) {
        expect([sizeX, sizeY, sizeZ]).toEqual([80, 40, 6])
        this.Build = buildBox
        this.Shape = () => boxShape
      }),
      gp_Pnt_3: vi.fn(function point(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Dir_4: vi.fn(function direction(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }),
      gp_Ax2_3: vi.fn(function axis(this: { origin: unknown; direction: unknown }, origin: unknown, direction: unknown) {
        this.origin = origin
        this.direction = direction
      }),
      BRepPrimAPI_MakeCylinder_3: vi.fn(function makeCylinder(
        this: { Build: typeof buildCylinder; Shape: () => unknown },
        axis: unknown,
        radius: number,
        height: number,
      ) {
        expect(axis).toBeDefined()
        expect([radius, height]).toEqual([3, 8])
        const shape = cutterShapes[buildCylinder.mock.calls.length]
        this.Build = buildCylinder
        this.Shape = () => shape
      }),
      BRepAlgoAPI_Cut_3: vi.fn(function cut(this: { Shape: () => unknown }, base: unknown, cutter: unknown) {
        const callIndex = openCascade.BRepAlgoAPI_Cut_3.mock.calls.length - 1
        expect(base).toBe(callIndex === 0 ? boxShape : cutShapes[0])
        expect(cutter).toBe(cutterShapes[callIndex])
        this.Shape = () => cutShapes[callIndex]
      }),
      Message_ProgressRange_1: vi.fn(function progressRange() {}),
    }

    const result = await runFeatureDSLExportWithKernel(openCascade, {
      filename: 'plate-hole-pattern.step',
      document: {
        version: 1,
        unit: 'millimetre',
        parameters: {
          spacing: { type: 'number', default: 20 },
        },
        features: [
          { id: 'plate', type: 'box', size: [80, 40, 6] },
          { id: 'holes', type: 'cylinder_cut', origin: [20, 10, -1], diameter: 6, depth: 8, repeat: { count: 2, step: ['spacing', 0, 0] } },
        ],
      },
    })

    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(20, 10, -1)
    expect(openCascade.gp_Pnt_3).toHaveBeenCalledWith(40, 10, -1)
    expect(buildCylinder).toHaveBeenCalledTimes(2)
    expect(openCascade.BRepAlgoAPI_Cut_3).toHaveBeenCalledTimes(2)
    expect(transfer).toHaveBeenCalledWith(cutShapes[1], 0, true, expect.anything())
    expect(result.exportedStepText).toContain('END-ISO-10303-21')
  })
})

function boundsFromPointCalls(calls: Array<[number, number, number]>) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  }
  for (const [x, y, z] of calls) {
    bounds.minX = Math.min(bounds.minX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.minZ = Math.min(bounds.minZ, z)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.maxY = Math.max(bounds.maxY, y)
    bounds.maxZ = Math.max(bounds.maxZ, z)
  }
  return {
    x: bounds.maxX - bounds.minX,
    y: bounds.maxY - bounds.minY,
    z: bounds.maxZ - bounds.minZ,
  }
}
