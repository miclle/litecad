import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'

import { ProjectWorkbenchLayout } from './project-workbench-layout'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProjectWorkbenchLayout', () => {
  it('renders the workbench slots in the expected shell regions', () => {
    renderLayout()

    expect(document.querySelector('header')?.textContent).toContain('topbar slot')
    expect(document.querySelector('main')?.textContent).toContain('canvas slot')
    expect(document.querySelector('main')?.textContent).toContain('left panel slot')
    expect(document.body.textContent).toContain('assistant slot')
  })

  it('keeps grid transition disabled while the Assistant panel is resizing', () => {
    renderLayout({ isAiChatPanelResizing: true })

    const shell = document.body.firstElementChild?.firstElementChild
    expect(shell?.className).not.toContain('transition-[grid-template-columns]')
  })
})

function renderLayout({ isAiChatPanelResizing = false } = {}) {
  const host = document.createElement('div')
  document.body.replaceChildren(host)

  act(() => {
    createRoot(host).render(
      <ProjectWorkbenchLayout
        assistantPanel={<section>assistant slot</section>}
        canvas={<section>canvas slot</section>}
        isAiChatPanelResizing={isAiChatPanelResizing}
        leftPanel={<aside>left panel slot</aside>}
        topbar={<nav>topbar slot</nav>}
        workspaceGridStyle={{ gridTemplateColumns: '1fr 320px' }}
      />,
    )
  })
  return host
}
