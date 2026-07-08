import { describe, expect, it, vi } from 'vitest'

import { applyCADOperationsToShape, createOpenCascadeLoader, runStepAssemblyExportWithKernel } from './opencascade-step'

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
