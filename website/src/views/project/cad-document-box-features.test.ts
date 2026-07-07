import { describe, expect, test } from 'vitest'

import { boxFeatureDraftFromCADBoxFeature, defaultBoxFeatureDraft, parseBoxFeatureDraft } from './cad-document-box-features'

describe('CAD document box feature drafts', () => {
  test('creates a default positive box feature draft', () => {
    expect(defaultBoxFeatureDraft()).toEqual({
      originX: '0',
      originY: '0',
      originZ: '0',
      sizeX: '10',
      sizeY: '10',
      sizeZ: '10',
    })
  })

  test('parses finite origin and positive size values', () => {
    expect(
      parseBoxFeatureDraft({
        originX: '2',
        originY: '-1',
        originZ: '4',
        sizeX: '8',
        sizeY: '6',
        sizeZ: '3',
      }),
    ).toEqual({
      origin: [2, -1, 4],
      size: [8, 6, 3],
    })
  })

  test('rejects non-positive box sizes', () => {
    expect(
      parseBoxFeatureDraft({
        originX: '0',
        originY: '0',
        originZ: '0',
        sizeX: '8',
        sizeY: '0',
        sizeZ: '3',
      }),
    ).toBeNull()
  })

  test('formats an existing box feature into editable inputs', () => {
    expect(
      boxFeatureDraftFromCADBoxFeature({
        origin: [2, -1, 4],
        size: [8, 6, 3],
      }),
    ).toEqual({
      originX: '2',
      originY: '-1',
      originZ: '4',
      sizeX: '8',
      sizeY: '6',
      sizeZ: '3',
    })
  })
})
