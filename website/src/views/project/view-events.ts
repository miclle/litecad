import { createOrientation, isViewOrientation, type ViewOrientation } from './view-orientation'

export const modelPreviewSelector = '[data-model-preview]'
export const setViewEventName = 'litecad:set-view'
export const resetViewEventName = 'litecad:reset-view'
export const viewOrientationChangeEventName = 'litecad:view-orientation-change'

export type ViewOrientationEventDetail = {
  orientation: ViewOrientation
}

export const normalizeViewOrientation = (orientation: unknown): ViewOrientation | null => {
  if (!isViewOrientation(orientation)) {
    return null
  }
  return {
    ...createOrientation(orientation.yaw, orientation.pitch),
    ...(orientation.direction ? { direction: orientation.direction } : {}),
    ...(orientation.rotationStep ? { rotationStep: orientation.rotationStep } : {}),
    ...(orientation.up ? { up: orientation.up } : {}),
  }
}

export const orientationFromEvent = (event: Event): ViewOrientation | null =>
  normalizeViewOrientation((event as CustomEvent<{ orientation?: unknown }>).detail?.orientation)

export const createSetViewEvent = (orientation: ViewOrientation) =>
  new CustomEvent<ViewOrientationEventDetail>(setViewEventName, { detail: { orientation } })

export const createViewOrientationChangeEvent = (orientation: ViewOrientation) =>
  new CustomEvent<ViewOrientationEventDetail>(viewOrientationChangeEventName, { detail: { orientation } })
