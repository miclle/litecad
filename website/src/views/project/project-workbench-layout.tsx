import type { CSSProperties, ReactNode } from 'react'

type ProjectWorkbenchLayoutProps = {
  assistantPanel: ReactNode
  canvas: ReactNode
  isAiChatPanelResizing: boolean
  leftPanel: ReactNode
  topbar: ReactNode
  workspaceGridStyle: CSSProperties
}

export function ProjectWorkbenchLayout({
  assistantPanel,
  canvas,
  isAiChatPanelResizing,
  leftPanel,
  topbar,
  workspaceGridStyle,
}: ProjectWorkbenchLayoutProps) {
  return (
    <div
      className={`grid min-h-screen overflow-x-auto overflow-y-hidden bg-[#f8fafc] text-[#0f172a] motion-reduce:transition-none ${
        isAiChatPanelResizing ? '' : 'transition-[grid-template-columns] duration-[220ms] ease-out'
      }`}
      style={workspaceGridStyle}
    >
      <div className="grid min-h-screen min-w-0 grid-rows-[56px_minmax(0,1fr)] bg-[#f8fafc]">
        <header className="relative z-50 flex items-center justify-between border-b border-[#e2e8f0] bg-[#f8fafc]/92 px-3 backdrop-blur">
          {topbar}
        </header>

        <main className="min-h-0 overflow-x-auto overflow-y-hidden bg-[#f8fafc]">
          <div className="relative h-full min-h-0 overflow-hidden bg-[#f8fafc]">
            {canvas}
            {leftPanel}
          </div>
        </main>
      </div>

      <div className="h-screen min-w-0 overflow-hidden">{assistantPanel}</div>
    </div>
  )
}
