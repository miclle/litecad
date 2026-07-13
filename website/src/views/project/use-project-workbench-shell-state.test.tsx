import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'

describe('useProjectWorkbenchShellState', () => {
  beforeAll(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    setWindowInnerWidth(1200)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    window.localStorage.clear()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('derives default workbench shell layout from local presentation preferences', () => {
    const { result } = renderHook(() => useProjectWorkbenchShellState())

    expect(result.current.isAiChatOpen).toBe(false)
    expect(result.current.isHistoryOpen).toBe(false)
    expect(result.current.isProjectInfoOpen).toBe(false)
    expect(result.current.isStepExportOpen).toBe(false)
    expect(result.current.leftPanelWidth).toBe(270)
    expect(result.current.aiChatPanelWidth).toBe(420)
    expect(result.current.aiChatPanelMaxWidth).toBe(600)
    expect(result.current.canvasStatusLeftOffset).toBe(302)
    expect(result.current.canvasRightOffset).toBe(20)
    expect(result.current.workspaceGridStyle.gridTemplateColumns).toBe('minmax(0, 1fr) 0px')
  })

  it('opens History when a CAD document command reports a revision conflict', () => {
    const { result } = renderHook(() => useProjectWorkbenchShellState())

    act(() => result.current.handleCADDocumentConflict())

    expect(result.current.isHistoryOpen).toBe(true)
  })

  it('toggles the Assistant column and closes it from Escape', () => {
    const { result } = renderHook(() => useProjectWorkbenchShellState())

    act(() => result.current.toggleAiChat())

    expect(result.current.isAiChatOpen).toBe(true)
    expect(result.current.isAiChatTransitioning).toBe(true)
    expect(result.current.workspaceGridStyle.gridTemplateColumns).toBe('minmax(530px, 1fr) 420px')

    act(() => vi.advanceTimersByTime(220))
    expect(result.current.isAiChatTransitioning).toBe(false)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

    expect(result.current.isAiChatOpen).toBe(false)
    expect(result.current.isAiChatTransitioning).toBe(true)
    expect(result.current.workspaceGridStyle.gridTemplateColumns).toBe('minmax(0, 1fr) 0px')
  })

  it('resizes and restores the left panel drag state', () => {
    const { result } = renderHook(() => useProjectWorkbenchShellState())
    document.body.style.cursor = 'default'
    document.body.style.userSelect = 'text'

    act(() => result.current.startLeftPanelResize(pointerDownEvent(270)))
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 420 })))
    expect(result.current.leftPanelWidth).toBe(420)

    act(() => window.dispatchEvent(new MouseEvent('pointerup')))
    expect(document.body.style.cursor).toBe('default')
    expect(document.body.style.userSelect).toBe('text')
  })

  it('resizes the Assistant column within the current viewport bounds', () => {
    const { result } = renderHook(() => useProjectWorkbenchShellState())

    act(() => result.current.startAiChatPanelResize(pointerDownEvent(500)))
    expect(result.current.isAiChatPanelResizing).toBe(true)
    expect(result.current.isAiChatTransitioning).toBe(true)

    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 280 })))
    expect(result.current.aiChatPanelWidth).toBe(600)

    act(() => window.dispatchEvent(new MouseEvent('pointerup')))
    expect(result.current.isAiChatPanelResizing).toBe(false)
    expect(result.current.isAiChatTransitioning).toBe(false)
  })
})

function setWindowInnerWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
}

function pointerDownEvent(clientX: number) {
  return {
    clientX,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLDivElement>
}
