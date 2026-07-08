import type { CADTranslation } from './cad-document-transforms'

export type PreviewTranslation = {
  x: number
  y: number
  z: number
}

export function cadTranslationDeltaToPreviewTranslation(
  translation: CADTranslation,
  shouldOrientCADPreview: boolean,
): PreviewTranslation {
  if (!shouldOrientCADPreview) {
    return { x: translation.x, y: translation.y, z: translation.z }
  }
  return { x: translation.x, y: translation.z, z: -translation.y }
}

export function previewTranslationDeltaToCADTranslation(
  previewTranslation: PreviewTranslation,
  baseTranslation: CADTranslation,
  shouldOrientCADPreview: boolean,
): CADTranslation {
  if (!shouldOrientCADPreview) {
    return {
      x: baseTranslation.x + previewTranslation.x,
      y: baseTranslation.y + previewTranslation.y,
      z: baseTranslation.z + previewTranslation.z,
    }
  }
  return {
    x: baseTranslation.x + previewTranslation.x,
    y: baseTranslation.y - previewTranslation.z,
    z: baseTranslation.z + previewTranslation.y,
  }
}
