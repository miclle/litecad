import { describe, expect, test } from 'vitest'

import {
  createSetViewEvent,
  modelPreviewSelector,
  normalizeViewOrientation,
  setViewEventName,
  viewOrientationChangeEventName,
} from './view-events'

describe('view event helpers', () => {
  test('exposes stable model preview event names and selector', () => {
    expect(modelPreviewSelector).toBe('[data-model-preview]')
    expect(setViewEventName).toBe('litecad:set-view')
    expect(viewOrientationChangeEventName).toBe('litecad:view-orientation-change')
  })

  test('normalizes event orientation payloads', () => {
    expect(normalizeViewOrientation({ yaw: -45, pitch: 120 })).toEqual({ yaw: 315, pitch: 89 })
    expect(normalizeViewOrientation({ yaw: Number.NaN, pitch: 0 })).toBeNull()
  })

  test('creates typed set-view events', () => {
    const event = createSetViewEvent({ yaw: 0, pitch: 0 })

    expect(event.type).toBe(setViewEventName)
    expect(event.detail.orientation).toEqual({ yaw: 0, pitch: 0 })
  })
})
