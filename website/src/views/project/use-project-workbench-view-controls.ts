import { useEffect, useState } from 'react'

import {
  dispatchModelPreviewSetViewEvent,
  normalizeViewOrientation,
  orientationFromEvent,
  viewOrientationChangeEventName,
} from './view-events'
import {
  initialViewOrientation,
  orientationDistance,
  rotateOrientation,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'

export function useProjectWorkbenchViewControls() {
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)

  useEffect(() => {
    const handleViewOrientationChange = (event: Event) => {
      const nextOrientation = orientationFromEvent(event)
      if (!nextOrientation) {
        return
      }
      setAnimateViewCubeOrientation(false)
      setViewOrientation((currentOrientation) =>
        orientationDistance(currentOrientation, nextOrientation) < 0.2 ? currentOrientation : nextOrientation,
      )
    }

    window.addEventListener(viewOrientationChangeEventName, handleViewOrientationChange)
    return () => window.removeEventListener(viewOrientationChangeEventName, handleViewOrientationChange)
  }, [])

  const applyCanvasOrientation = (orientation: ViewOrientation) => {
    const nextOrientation = normalizeViewOrientation(orientation) ?? initialViewOrientation
    setAnimateViewCubeOrientation(true)
    setViewOrientation(nextOrientation)
    dispatchModelPreviewSetViewEvent(nextOrientation)
  }

  const stepCanvasOrientation = (step: ViewRotationStep) => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, step), rotationStep: step })
  }

  const flipCanvasOrientation = () => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, { horizontal: 180 }), rotationStep: { horizontal: 180 } })
  }

  return {
    animateViewCubeOrientation,
    applyCanvasOrientation,
    flipCanvasOrientation,
    stepCanvasOrientation,
    viewOrientation,
  }
}
