import { useCallback, useEffect, useEffectEvent, useState, type Dispatch, type SetStateAction } from 'react'

export const defaultLeftPanelWidth = 270
export const defaultAiChatPanelWidth = 420
export const leftPanelMinWidth = 220
export const leftPanelMaxWidth = 440
export const aiChatPanelMinWidth = 340
export const projectWorkspacePreferencesStorageKey = 'litecad:project-workspace-preferences'
const preferencesPersistenceDelayMs = 120

type ProjectWorkspacePreferences = {
  version: 1
  isLeftPanelCollapsed: boolean
  isAiChatOpen: boolean
  leftPanelWidth: number
  aiChatPanelWidth: number
}

const defaultPreferences: ProjectWorkspacePreferences = {
  version: 1,
  isLeftPanelCollapsed: false,
  isAiChatOpen: false,
  leftPanelWidth: defaultLeftPanelWidth,
  aiChatPanelWidth: defaultAiChatPanelWidth,
}

function readProjectWorkspacePreferences(): ProjectWorkspacePreferences {
  if (typeof window === 'undefined') {
    return defaultPreferences
  }

  try {
    const storedValue = window.localStorage.getItem(projectWorkspacePreferencesStorageKey)
    if (!storedValue) {
      return defaultPreferences
    }

    const parsedValue = JSON.parse(storedValue) as Record<string, unknown>
    if (parsedValue.version !== 1) {
      return defaultPreferences
    }

    return {
      version: 1,
      isLeftPanelCollapsed:
        typeof parsedValue.isLeftPanelCollapsed === 'boolean'
          ? parsedValue.isLeftPanelCollapsed
          : defaultPreferences.isLeftPanelCollapsed,
      isAiChatOpen: typeof parsedValue.isAiChatOpen === 'boolean' ? parsedValue.isAiChatOpen : defaultPreferences.isAiChatOpen,
      leftPanelWidth: clampStoredWidth(parsedValue.leftPanelWidth, defaultPreferences.leftPanelWidth, leftPanelMinWidth, leftPanelMaxWidth),
      aiChatPanelWidth: clampStoredWidth(parsedValue.aiChatPanelWidth, defaultPreferences.aiChatPanelWidth, aiChatPanelMinWidth),
    }
  } catch {
    return defaultPreferences
  }
}

function clampStoredWidth(value: unknown, fallback: number, min: number, max = Number.POSITIVE_INFINITY) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(Math.max(value, min), max)
}

function resolveStateAction<T>(action: SetStateAction<T>, currentValue: T) {
  return typeof action === 'function' ? (action as (value: T) => T)(currentValue) : action
}

function persistProjectWorkspacePreferences(preferences: ProjectWorkspacePreferences) {
  try {
    window.localStorage.setItem(projectWorkspacePreferencesStorageKey, JSON.stringify(preferences))
  } catch {
    // Storage can be disabled or full; the workspace remains usable with in-memory state.
  }
}

export function useProjectWorkspacePreferences() {
  const [preferences, setPreferences] = useState(readProjectWorkspacePreferences)
  const flushPreferences = useEffectEvent(() => persistProjectWorkspacePreferences(preferences))

  useEffect(() => {
    const timeoutID = window.setTimeout(() => persistProjectWorkspacePreferences(preferences), preferencesPersistenceDelayMs)
    return () => window.clearTimeout(timeoutID)
  }, [preferences])

  useEffect(() => {
    const handlePageHide = () => flushPreferences()
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [])

  const setIsLeftPanelCollapsed: Dispatch<SetStateAction<boolean>> = useCallback(
    (action) =>
      setPreferences((currentPreferences) => ({
        ...currentPreferences,
        isLeftPanelCollapsed: resolveStateAction(action, currentPreferences.isLeftPanelCollapsed),
      })),
    [],
  )
  const setIsAiChatOpen: Dispatch<SetStateAction<boolean>> = useCallback(
    (action) =>
      setPreferences((currentPreferences) => ({
        ...currentPreferences,
        isAiChatOpen: resolveStateAction(action, currentPreferences.isAiChatOpen),
      })),
    [],
  )
  const setLeftPanelWidth: Dispatch<SetStateAction<number>> = useCallback(
    (action) =>
      setPreferences((currentPreferences) => ({
        ...currentPreferences,
        leftPanelWidth: resolveStateAction(action, currentPreferences.leftPanelWidth),
      })),
    [],
  )
  const setAiChatPanelWidth: Dispatch<SetStateAction<number>> = useCallback(
    (action) =>
      setPreferences((currentPreferences) => ({
        ...currentPreferences,
        aiChatPanelWidth: resolveStateAction(action, currentPreferences.aiChatPanelWidth),
      })),
    [],
  )

  return {
    ...preferences,
    setIsLeftPanelCollapsed,
    setIsAiChatOpen,
    setLeftPanelWidth,
    setAiChatPanelWidth,
  }
}
