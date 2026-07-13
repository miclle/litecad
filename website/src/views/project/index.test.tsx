import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { fetchProject } from 'src/api/projects'
import ProjectView from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('src/api/projects', () => ({
  addProjectCADModelBoxUnion: vi.fn(),
  createProjectAgentConversation: vi.fn(),
  deleteProjectCADNode: vi.fn(),
  fetchProject: vi.fn(),
  fetchProjectAgentConversationMessages: vi.fn(),
  fetchProjectAgentConversations: vi.fn(),
  fetchProjectCADDocument: vi.fn(),
  fetchProjectCADHistory: vi.fn(),
  fetchProjectModelPreview: vi.fn(),
  fetchProjectModelPreviewArtifact: vi.fn(),
  fetchProjectModelSource: vi.fn(),
  fetchProjectModels: vi.fn(),
  fetchProjectParametricArtifacts: vi.fn(),
  redoProjectCADDocument: vi.fn(),
  runProjectAgentParametric: vi.fn(),
  saveProjectParametricArtifactModel: vi.fn(),
  sendProjectAgentConversationMessage: vi.fn(),
  undoProjectCADDocument: vi.fn(),
  updateProjectCADModelTransform: vi.fn(),
  updateProjectCADNodeTransform: vi.fn(),
  updateProjectParametricArtifact: vi.fn(),
  updateProjectParametricModelParameters: vi.fn(),
  uploadProjectModel: vi.fn(),
  uploadProjectThumbnailSnapshot: vi.fn(),
}))

describe('ProjectView', () => {
  afterEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    document.body.innerHTML = ''
  })

  test('shows the project opening state while detail data is loading', async () => {
    vi.mocked(fetchProject).mockReturnValue(new Promise(() => undefined) as ReturnType<typeof fetchProject>)

    renderProjectView()

    expect(await screenText('Opening project')).toBeTruthy()
  })

  test('shows a deliberate project unavailable state when detail loading fails', async () => {
    vi.mocked(fetchProject).mockRejectedValue(new Error('not found'))

    renderProjectView()

    expect(await screenText('Project unavailable')).toBeTruthy()
    expect(document.body.textContent).toContain('This project could not be loaded.')
  })
})

function renderProjectView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '/projects/:projectId', element: <ProjectView /> }], {
    initialEntries: ['/projects/prj_01test'],
  })
  const host = document.createElement('div')
  document.body.appendChild(host)

  act(() => {
    createRoot(host).render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  })
}

async function screenText(text: string) {
  for (let index = 0; index < 20; index += 1) {
    if (document.body.textContent?.includes(text)) {
      return true
    }
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    })
  }
  return false
}
