import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useProjectWorkbenchViewControls } from './use-project-workbench-view-controls'
import { createViewOrientationChangeEvent, setViewEventName } from './view-events'
import { initialViewOrientation } from './view-orientation'

describe('useProjectWorkbenchViewControls', () => {
  it('starts from the default isometric orientation', () => {
    const { result } = renderHook(() => useProjectWorkbenchViewControls())

    expect(result.current.animateViewCubeOrientation).toBe(false)
    expect(result.current.viewOrientation).toEqual(initialViewOrientation)
  })

  it('applies explicit canvas orientations and dispatches preview events', () => {
    const previewListener = vi.fn()
    const previewElement = document.createElement('div')
    previewElement.setAttribute('data-model-preview', '')
    previewElement.addEventListener(setViewEventName, previewListener)
    document.body.append(previewElement)
    const { result } = renderHook(() => useProjectWorkbenchViewControls())

    act(() => result.current.applyCanvasOrientation({ yaw: 90, pitch: 12 }))

    expect(result.current.viewOrientation).toEqual({ yaw: 90, pitch: 12 })
    expect(previewListener).toHaveBeenCalledTimes(1)
    previewElement.remove()
  })

  it('accepts model preview orientation events and disables ViewCube animation', () => {
    const { result } = renderHook(() => useProjectWorkbenchViewControls())

    act(() => result.current.applyCanvasOrientation({ yaw: 120, pitch: 20 }))
    expect(result.current.animateViewCubeOrientation).toBe(true)

    act(() => window.dispatchEvent(createViewOrientationChangeEvent({ yaw: 180, pitch: 30 })))

    expect(result.current.animateViewCubeOrientation).toBe(false)
    expect(result.current.viewOrientation).toEqual({ yaw: 180, pitch: 30 })
  })

  it('steps and flips relative to the current orientation', () => {
    const { result } = renderHook(() => useProjectWorkbenchViewControls())

    act(() => result.current.stepCanvasOrientation({ horizontal: 45 }))
    expect(result.current.viewOrientation.rotationStep).toEqual({ horizontal: 45 })
    expect(result.current.viewOrientation.yaw).not.toBe(initialViewOrientation.yaw)

    act(() => result.current.flipCanvasOrientation())
    expect(result.current.viewOrientation.rotationStep).toEqual({ horizontal: 180 })
  })
})
