import { describe, expect, it, vi } from 'vitest'

import { applyCADOperationsToShape, createOpenCascadeLoader } from './opencascade-step'

describe('createOpenCascadeLoader', () => {
  it('loads the OpenCascade factory with an explicit Vite wasm URL', async () => {
    const openCascade = {
      FS: {
        createDataFile: vi.fn(),
        readFile: vi.fn(),
        unlink: vi.fn(),
      },
    }
    const initOpenCascade = vi.fn(async (_options?: { locateFile?: (path: string) => string }) => openCascade)

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
})
