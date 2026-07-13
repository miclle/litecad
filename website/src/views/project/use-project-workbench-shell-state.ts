import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  aiChatPanelMinWidth,
  defaultAiChatPanelWidth,
  leftPanelMaxWidth,
  leftPanelMinWidth,
  useProjectWorkspacePreferences,
} from './use-project-workspace-preferences'

const aiChatPanelMaxWidthRatio = 0.5
const aiChatPanelTransitionMs = 220

function clampPanelWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(width, minWidth), maxWidth)
}

function getAiChatPanelMaxWidth() {
  if (typeof window === 'undefined') {
    return Math.max(defaultAiChatPanelWidth, aiChatPanelMinWidth)
  }
  return Math.max(Math.floor(window.innerWidth * aiChatPanelMaxWidthRatio), aiChatPanelMinWidth)
}

export function useProjectWorkbenchShellState() {
  const {
    aiChatPanelWidth,
    isAiChatOpen,
    isLeftPanelCollapsed,
    leftPanelWidth,
    setAiChatPanelWidth,
    setIsAiChatOpen,
    setIsLeftPanelCollapsed,
    setLeftPanelWidth,
  } = useProjectWorkspacePreferences()
  const [isAiChatColumnVisible, setIsAiChatColumnVisible] = useState(isAiChatOpen)
  const [isAiChatTransitioning, setIsAiChatTransitioning] = useState(false)
  const [isAiChatPanelResizing, setIsAiChatPanelResizing] = useState(false)
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false)
  const [isStepExportOpen, setIsStepExportOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [aiChatPanelMaxWidth, setAiChatPanelMaxWidth] = useState(getAiChatPanelMaxWidth)
  const aiChatTransitionTimerRef = useRef<number | undefined>(undefined)

  const handleCADDocumentConflict = useCallback(() => setIsHistoryOpen(true), [])

  useEffect(() => {
    const syncAiChatPanelMaxWidth = () => {
      const nextMaxWidth = getAiChatPanelMaxWidth()

      setAiChatPanelMaxWidth(nextMaxWidth)
      setAiChatPanelWidth((currentWidth) => clampPanelWidth(currentWidth, aiChatPanelMinWidth, nextMaxWidth))
    }

    syncAiChatPanelMaxWidth()
    window.addEventListener('resize', syncAiChatPanelMaxWidth)
    return () => window.removeEventListener('resize', syncAiChatPanelMaxWidth)
  }, [setAiChatPanelWidth])

  const openAiChat = useCallback(() => {
    if (aiChatTransitionTimerRef.current !== undefined) {
      window.clearTimeout(aiChatTransitionTimerRef.current)
    }

    setIsAiChatTransitioning(true)
    setIsAiChatColumnVisible(true)
    setIsAiChatOpen(true)
    aiChatTransitionTimerRef.current = window.setTimeout(() => {
      setIsAiChatTransitioning(false)
      aiChatTransitionTimerRef.current = undefined
    }, aiChatPanelTransitionMs)
  }, [setIsAiChatOpen])

  const closeAiChat = useCallback(() => {
    if (aiChatTransitionTimerRef.current !== undefined) {
      window.clearTimeout(aiChatTransitionTimerRef.current)
    }

    setIsAiChatTransitioning(true)
    setIsAiChatOpen(false)
    setIsAiChatColumnVisible(false)
    aiChatTransitionTimerRef.current = window.setTimeout(() => {
      setIsAiChatTransitioning(false)
      aiChatTransitionTimerRef.current = undefined
    }, aiChatPanelTransitionMs)
  }, [setIsAiChatOpen])

  const toggleAiChat = useCallback(() => {
    if (isAiChatOpen) {
      closeAiChat()
      return
    }

    openAiChat()
  }, [closeAiChat, isAiChatOpen, openAiChat])

  useEffect(() => {
    return () => {
      if (aiChatTransitionTimerRef.current !== undefined) {
        window.clearTimeout(aiChatTransitionTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isAiChatOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAiChat()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeAiChat, isAiChatOpen])

  const canvasStatusLeftOffset = isLeftPanelCollapsed ? 16 : leftPanelWidth + 32
  const canvasRightOffset = 20
  const cadWorkspaceMinWidth = (isLeftPanelCollapsed ? 196 : leftPanelWidth) + 260
  const workspaceGridStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: isAiChatColumnVisible
          ? `minmax(${cadWorkspaceMinWidth}px, 1fr) ${aiChatPanelWidth}px`
          : 'minmax(0, 1fr) 0px',
      }) as CSSProperties,
    [aiChatPanelWidth, cadWorkspaceMinWidth, isAiChatColumnVisible],
  )

  const startLeftPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = leftPanelWidth
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX
        setLeftPanelWidth(clampPanelWidth(startWidth + deltaX, leftPanelMinWidth, leftPanelMaxWidth))
      }

      const handlePointerUp = () => {
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [leftPanelWidth, setLeftPanelWidth],
  )

  const startAiChatPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = aiChatPanelWidth
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect

      setIsAiChatPanelResizing(true)
      setIsAiChatTransitioning(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = startX - moveEvent.clientX
        setAiChatPanelWidth(clampPanelWidth(startWidth + deltaX, aiChatPanelMinWidth, aiChatPanelMaxWidth))
      }

      const handlePointerUp = () => {
        setIsAiChatPanelResizing(false)
        setIsAiChatTransitioning(false)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [aiChatPanelMaxWidth, aiChatPanelWidth, setAiChatPanelWidth],
  )

  return {
    aiChatPanelMaxWidth,
    aiChatPanelWidth,
    canvasRightOffset,
    canvasStatusLeftOffset,
    closeAiChat,
    handleCADDocumentConflict,
    isAiChatOpen,
    isAiChatPanelResizing,
    isAiChatTransitioning,
    isHistoryOpen,
    isLeftPanelCollapsed,
    isProjectInfoOpen,
    isStepExportOpen,
    leftPanelWidth,
    setIsHistoryOpen,
    setIsLeftPanelCollapsed,
    setIsProjectInfoOpen,
    setIsStepExportOpen,
    startAiChatPanelResize,
    startLeftPanelResize,
    toggleAiChat,
    workspaceGridStyle,
  }
}
