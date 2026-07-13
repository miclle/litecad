import type * as THREE from 'three'

export const viewCubeRendererOptions = {
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
} satisfies ConstructorParameters<typeof THREE.WebGLRenderer>[0]
