import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  projectWorkspacePreferencesStorageKey,
  useProjectWorkspacePreferences,
} from './use-project-workspace-preferences'

describe('useProjectWorkspacePreferences', () => {
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
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('uses the current workspace defaults when no preferences are stored', () => {
    const { result } = renderHook(() => useProjectWorkspacePreferences())

    expect(result.current.isLeftPanelCollapsed).toBe(false)
    expect(result.current.isAiChatOpen).toBe(false)
    expect(result.current.leftPanelWidth).toBe(270)
    expect(result.current.aiChatPanelWidth).toBe(420)
  })

  it('restores valid panel visibility and widths from local storage', () => {
    window.localStorage.setItem(
      projectWorkspacePreferencesStorageKey,
      JSON.stringify({
        version: 1,
        isLeftPanelCollapsed: true,
        isAiChatOpen: true,
        leftPanelWidth: 360,
        aiChatPanelWidth: 510,
      }),
    )

    const { result } = renderHook(() => useProjectWorkspacePreferences())

    expect(result.current.isLeftPanelCollapsed).toBe(true)
    expect(result.current.isAiChatOpen).toBe(true)
    expect(result.current.leftPanelWidth).toBe(360)
    expect(result.current.aiChatPanelWidth).toBe(510)
  })

  it('falls back field by field when stored preferences are malformed', () => {
    window.localStorage.setItem(
      projectWorkspacePreferencesStorageKey,
      JSON.stringify({
        version: 1,
        isLeftPanelCollapsed: 'yes',
        isAiChatOpen: true,
        leftPanelWidth: null,
        aiChatPanelWidth: Number.NaN,
      }),
    )

    const { result } = renderHook(() => useProjectWorkspacePreferences())

    expect(result.current.isLeftPanelCollapsed).toBe(false)
    expect(result.current.isAiChatOpen).toBe(true)
    expect(result.current.leftPanelWidth).toBe(270)
    expect(result.current.aiChatPanelWidth).toBe(420)
  })

  it('clamps restored widths to safe static panel bounds', () => {
    window.localStorage.setItem(
      projectWorkspacePreferencesStorageKey,
      JSON.stringify({
        version: 1,
        isLeftPanelCollapsed: false,
        isAiChatOpen: true,
        leftPanelWidth: 900,
        aiChatPanelWidth: 100,
      }),
    )

    const { result } = renderHook(() => useProjectWorkspacePreferences())

    expect(result.current.leftPanelWidth).toBe(440)
    expect(result.current.aiChatPanelWidth).toBe(340)
  })

  it('persists panel changes for the next page load', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useProjectWorkspacePreferences())

      act(() => vi.advanceTimersByTime(120))
      expect(JSON.parse(window.localStorage.getItem(projectWorkspacePreferencesStorageKey) ?? '{}')).toEqual({
        version: 1,
        isLeftPanelCollapsed: false,
        isAiChatOpen: false,
        leftPanelWidth: 270,
        aiChatPanelWidth: 420,
      })

      act(() => {
        result.current.setIsLeftPanelCollapsed(true)
        result.current.setIsAiChatOpen(true)
        result.current.setLeftPanelWidth(340)
        result.current.setAiChatPanelWidth((currentWidth) => currentWidth + 60)
      })

      act(() => vi.advanceTimersByTime(119))
      expect(JSON.parse(window.localStorage.getItem(projectWorkspacePreferencesStorageKey) ?? '{}').leftPanelWidth).toBe(270)

      act(() => vi.advanceTimersByTime(1))
      expect(JSON.parse(window.localStorage.getItem(projectWorkspacePreferencesStorageKey) ?? '{}')).toEqual({
        version: 1,
        isLeftPanelCollapsed: true,
        isAiChatOpen: true,
        leftPanelWidth: 340,
        aiChatPanelWidth: 480,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes the latest preferences when the page is leaving', async () => {
    const { result } = renderHook(() => useProjectWorkspacePreferences())

    await waitFor(() => {
      expect(window.localStorage.getItem(projectWorkspacePreferencesStorageKey)).not.toBeNull()
    })

    act(() => {
      result.current.setLeftPanelWidth(380)
    })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(JSON.parse(window.localStorage.getItem(projectWorkspacePreferencesStorageKey) ?? '{}').leftPanelWidth).toBe(380)
  })
})
