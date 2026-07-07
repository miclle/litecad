import type { CADBoxFeature } from 'src/types/project'

export type BoxFeatureDraft = {
  originX: string
  originY: string
  originZ: string
  sizeX: string
  sizeY: string
  sizeZ: string
}

export function defaultBoxFeatureDraft(): BoxFeatureDraft {
  return {
    originX: '0',
    originY: '0',
    originZ: '0',
    sizeX: '10',
    sizeY: '10',
    sizeZ: '10',
  }
}

export function boxFeatureDraftFromCADBoxFeature(box: CADBoxFeature): BoxFeatureDraft {
  return {
    originX: String(box.origin[0] ?? 0),
    originY: String(box.origin[1] ?? 0),
    originZ: String(box.origin[2] ?? 0),
    sizeX: String(box.size[0] ?? 10),
    sizeY: String(box.size[1] ?? 10),
    sizeZ: String(box.size[2] ?? 10),
  }
}

export function parseBoxFeatureDraft(draft: BoxFeatureDraft): CADBoxFeature | null {
  const box = {
    origin: [Number(draft.originX), Number(draft.originY), Number(draft.originZ)] as const,
    size: [Number(draft.sizeX), Number(draft.sizeY), Number(draft.sizeZ)] as const,
  }
  if (!box.origin.every(Number.isFinite) || !box.size.every((value) => Number.isFinite(value) && value > 0)) {
    return null
  }
  return box
}
