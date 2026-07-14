import { createRef } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { ProjectTopbar } from './project-topbar'
import type { Project } from 'src/types/project'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProjectTopbar', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  test('renders project controls and toggles the Assistant panel', async () => {
    const user = userEvent.setup()
    const onToggleAiChat = vi.fn()

    renderTopbar({ onToggleAiChat })

    expect(document.body.textContent).toContain('Demo bracket')
    expect(document.querySelector('a[aria-label="All projects"]')?.getAttribute('href')).toBe('/projects')
    expect(document.querySelector('button[aria-label="Project info"]')).toBeTruthy()
    expect(document.querySelector('button[aria-label="Import model"]')).toBeTruthy()

    await user.click(document.querySelector('button[aria-label="Toggle Assistant"]') as HTMLButtonElement)

    expect(onToggleAiChat).toHaveBeenCalledTimes(1)
  })
})

function renderTopbar(overrides: Partial<Parameters<typeof ProjectTopbar>[0]> = {}) {
  const fileInputRef = createRef<HTMLInputElement>()
  const project: Project = {
    id: 'prj_demo',
    name: 'Demo bracket',
    description: 'A small project',
    thumbnail: { model_count: 0, models: [] },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
  const host = document.createElement('div')
  document.body.appendChild(host)

  act(() => {
    createRoot(host).render(
      <MemoryRouter>
        <ProjectTopbar
          canRedo={false}
          canUndo={false}
          documentDetails={[{ label: 'Models', value: 0 }]}
          fileInputRef={fileInputRef}
          hasNextHistoryPage={false}
          historyEntries={[]}
          historyError=""
          isAiChatOpen={false}
          isHistoryFetchingNextPage={false}
          isHistoryLoading={false}
          isHistoryLoadError={false}
          isHistoryMutationPending={false}
          isHistoryOpen={false}
          isProjectInfoOpen={false}
          isStepExportOpen={false}
          isUploading={false}
          exportArtifacts={[]}
          isExportHistoryError={false}
          isExportHistoryLoading={false}
          onDownloadExportArtifact={vi.fn()}
          onFetchNextHistoryPage={vi.fn()}
          onHistoryAction={vi.fn()}
          onHistoryOpenChange={vi.fn()}
          onModelFileChange={vi.fn()}
          onProjectInfoOpenChange={vi.fn()}
          onStepExport={vi.fn()}
          onStepExportOpenChange={vi.fn()}
          onStepExportSelectAll={vi.fn()}
          onStepExportToggleTarget={vi.fn()}
          onToggleAiChat={vi.fn()}
          previewSummary={{ sourceBody: 'Ready for import.', sourceLabel: 'No models' }}
          project={project}
          projectDescription="A small project"
          selectedStepExportTargetIds={new Set()}
          stepExportDisabled
          stepExportTargets={[]}
          {...overrides}
        />
      </MemoryRouter>,
    )
  })
}
