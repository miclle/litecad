import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { ProjectCoverPreview } from './index'
import ProjectsView from './index'
import { createProject, fetchProjects } from 'src/api/projects'

vi.mock('src/api/projects', () => ({
  createProject: vi.fn(),
  fetchProjects: vi.fn(),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProjectCoverPreview', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('renders a static snapshot image without mounting the 3D preview', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(
        <ProjectCoverPreview
          cardIndex={0}
          models={[]}
          snapshot={{
            url: '/api/v1/projects/prj_01test/thumbnail?revision=3',
            status: 'ready',
            revision: 3,
            width: 640,
            height: 360,
            updated_at: '2026-07-09T00:00:00Z',
          }}
        />,
      )
    })

    const image = document.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/api/v1/projects/prj_01test/thumbnail?revision=3')
    expect(image?.getAttribute('loading')).toBe('lazy')
    expect(document.querySelector('[data-model-preview]')).toBeNull()
    expect(document.querySelector('canvas')).toBeNull()
  })
})

describe('ProjectsView', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  test('creates a project and navigates to its detail route', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchProjects).mockResolvedValue({ data: { projects: [] } } as unknown as Awaited<ReturnType<typeof fetchProjects>>)
    vi.mocked(createProject).mockResolvedValue({
      data: {
        project: {
          id: 'prj_created',
          name: 'Bracket study',
          description: '',
          thumbnail: { model_count: 0, models: [] },
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      },
    } as unknown as Awaited<ReturnType<typeof createProject>>)

    const router = createProjectsRouter()
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(router.element)
    })

    expect(await screenText('Start a project library')).toBeTruthy()
    await user.click(document.querySelector('button[type="button"]') as HTMLButtonElement)
    await user.type(document.querySelector('input[required]') as HTMLInputElement, 'Bracket study')
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)

    await waitForPath(router.router, '/projects/prj_created')
    expect(createProject).toHaveBeenCalledWith({ name: 'Bracket study', description: '' })
  })

  test('shows a deliberate error state when projects fail to load', async () => {
    vi.mocked(fetchProjects).mockRejectedValue(new Error('network down'))

    const router = createProjectsRouter()
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(router.element)
    })

    expect(await screenText('Unable to load projects')).toBeTruthy()
    expect(document.body.textContent).toContain('Check your session and try refreshing the page.')
  })
})

function createProjectsRouter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ currentUser: { id: 'usr_test', name: 'Ada', email: 'ada@example.com' } }} />,
        children: [
          { path: '/projects', element: <ProjectsView /> },
          { path: '/projects/:projectId', element: <div>Project detail route</div> },
        ],
      },
    ],
    { initialEntries: ['/projects'] },
  )

  return {
    router,
    element: (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
  }
}

async function waitForPath(router: ReturnType<typeof createMemoryRouter>, pathname: string) {
  for (let index = 0; index < 20; index += 1) {
    if (router.state.location.pathname === pathname) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    })
  }
  throw new Error(`router path = ${router.state.location.pathname}, want ${pathname}`)
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
