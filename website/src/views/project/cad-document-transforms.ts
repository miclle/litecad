import type { CADTransform } from 'src/types/project'

export type CADTranslation = {
  x: number
  y: number
  z: number
}

const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

export function translationFromCADTransform(transform?: CADTransform): CADTranslation {
  const matrix = transform?.matrix ?? identityMatrix
  return {
    x: matrix[3] ?? 0,
    y: matrix[7] ?? 0,
    z: matrix[11] ?? 0,
  }
}

export function cadTransformWithTranslation(transform: CADTransform | undefined, translation: CADTranslation): CADTransform {
  const matrix = [...(transform?.matrix ?? identityMatrix)]
  matrix[3] = translation.x
  matrix[7] = translation.y
  matrix[11] = translation.z
  matrix[12] = 0
  matrix[13] = 0
  matrix[14] = 0
  matrix[15] = 1
  return { matrix }
}
