import { describe, expect, it, vi } from 'vitest'

import {
  applyCADOperationsToShape,
  createOpenCascadeLoader,
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
