import { describe, expect, it, vi } from 'vitest'

import { createOpenCascadeLoader } from './opencascade-step'

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
