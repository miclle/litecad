import { afterEach, describe, expect, test, vi } from 'vitest'
import * as THREE from 'three'

import { createCanvasLabelTexture, createViewCubeFaceTexture } from './view-cube-textures'

const mockCanvasContext = () => {
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    font: '',
    lineJoin: '',
    lineWidth: 0,
    measureText: vi.fn((text: string) => ({ width: text.length * 24 })),
    strokeStyle: '',
    strokeText: vi.fn(),
    textAlign: '',
    textBaseline: '',
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  return context
}

describe('view cube textures', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('creates compact canvas label textures', () => {
    mockCanvasContext()

    const texture = createCanvasLabelTexture({
      color: '#ff0000',
      fontSize: 54,
      height: 96,
      label: 'X',
      width: 96,
    })

    expect(texture).toBeInstanceOf(THREE.CanvasTexture)
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(texture.image.width).toBe(96)
    expect(texture.image.height).toBe(96)
  })

  test('creates high-resolution view cube face textures', () => {
    const context = mockCanvasContext()

    const texture = createViewCubeFaceTexture({
      background: 0xd7ddcc,
      color: '#141714',
      label: 'FRONT',
    })

    expect(texture).toBeInstanceOf(THREE.CanvasTexture)
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(texture.anisotropy).toBe(4)
    expect(texture.image.width).toBe(512)
    expect(texture.image.height).toBe(512)
    expect(context.measureText).toHaveBeenCalled()
  })
})
