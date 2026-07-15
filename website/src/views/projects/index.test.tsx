import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { ProjectCoverPreview } from './index'
import ProjectsView from './index'
import { createProject, deleteProject, fetchProjects, updateProject } from 'src/api/projects'

vi.mock('src/api/projects', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  fetchProjects: vi.fn(),
  updateProject: vi.fn(),
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
    await user.type(await elementBySelector<HTMLInputElement>('input[required]'), 'Bracket study')
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)

    await waitForPath(router.router, '/projects/prj_created')
    expect(createProject).toHaveBeenCalledWith({ name: 'Bracket study', description: '' })
  })

  test('opens the create form from the account-menu URL and clears the request when closed', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchProjects).mockResolvedValue({ data: { projects: [] } } as unknown as Awaited<ReturnType<typeof fetchProjects>>)

    const router = createProjectsRouter('/projects?create=1')
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(router.element)
    })

    expect(await screenText('New project')).toBeTruthy()
    expect(document.querySelector('input[required]')).toBeTruthy()

    await user.click(document.querySelector('button[aria-label="Close"]') as HTMLButtonElement)

    await waitForSearch(router.router, '')
    expect(document.querySelector('input[required]')).toBeNull()
  })

  test('does not reopen the create form after returning from a newly created project', async () => {
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

    const router = createProjectsRouter('/projects?create=1')
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(router.element)
    })

    await user.type(await elementBySelector<HTMLInputElement>('input[required]'), 'Bracket study')
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)
    await waitForPath(router.router, '/projects/prj_created')

    await act(async () => {
      await router.router.navigate(-1)
    })

    await waitForPath(router.router, '/projects')
    await waitForSearch(router.router, '')
    expect(document.querySelector('input[required]')).toBeNull()
  })

  test('renames a project from its project card', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchProjects).mockResolvedValue({
      data: {
        projects: [
          {
            id: 'prj_existing',
            name: 'Bracket study',
            description: 'Original note',
            thumbnail: { model_count: 0, models: [] },
            created_at: '2026-07-13T00:00:00Z',
            updated_at: '2026-07-13T00:00:00Z',
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof fetchProjects>>)
    vi.mocked(updateProject).mockResolvedValue({
      data: {
        project: {
          id: 'prj_existing',
          name: 'Wall bracket v2',
          description: 'Updated note',
          thumbnail: { model_count: 0, models: [] },
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:05:00Z',
        },
      },
    } as unknown as Awaited<ReturnType<typeof updateProject>>)

    const router = createProjectsRouter()
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(router.element)
    })

    expect(await screenText('Bracket study')).toBeTruthy()
    await user.click(document.querySelector('button[aria-label="Rename Bracket study"]') as HTMLButtonElement)
    await user.clear(document.querySelector('input[required]') as HTMLInputElement)
    await user.type(document.querySelector('input[required]') as HTMLInputElement, 'Wall bracket v2')
    await user.clear(document.querySelector('textarea') as HTMLTextAreaElement)
    await user.type(document.querySelector('textarea') as HTMLTextAreaElement, 'Updated note')
    await user.click(buttonByText('Save changes'))

    expect(updateProject).toHaveBeenCalledWith('prj_existing', {
      name: 'Wall bracket v2',
      description: 'Updated note',
    })
  })

  test('deletes a project from its project card', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchProjects).mockResolvedValue({
      data: {
        projects: [
          {
            id: 'prj_existing',
            name: 'Bracket study',
            description: '',
            thumbnail: { model_count: 0, models: [] },
            created_at: '2026-07-13T00:00:00Z',
            updated_at: '2026-07-13T00:00:00Z',
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof fetchProjects>>)
    vi.mocked(deleteProject).mockResolvedValue({} as Awaited<ReturnType<typeof deleteProject>>)

    const router = createProjectsRouter()
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(router.element)
    })

    expect(await screenText('Bracket study')).toBeTruthy()
    await user.click(document.querySelector('button[aria-label="Delete Bracket study"]') as HTMLButtonElement)
    await user.click(buttonByText('Delete'))

    expect(deleteProject).toHaveBeenCalledWith('prj_existing')
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

function createProjectsRouter(initialEntry = '/projects') {
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
    { initialEntries: [initialEntry] },
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

async function waitForSearch(router: ReturnType<typeof createMemoryRouter>, search: string) {
  for (let index = 0; index < 20; index += 1) {
    if (router.state.location.search === search) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    })
  }
  throw new Error(`router search = ${router.state.location.search}, want ${search}`)
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

async function elementBySelector<ElementType extends Element>(selector: string) {
  for (let index = 0; index < 20; index += 1) {
    const element = document.querySelector<ElementType>(selector)
    if (element) {
      return element
    }
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    })
  }
  throw new Error(`element not found: ${selector}`)
}

function buttonByText(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(text))
  if (!button) {
    throw new Error(`button not found: ${text}`)
  }
  return button as HTMLButtonElement
}
