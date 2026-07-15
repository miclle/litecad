import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { fetchCurrentUser, logoutAccount } from 'src/api/auth'
import MainLayout from './MainLayout'

vi.mock('src/api/auth', () => ({
  fetchCurrentUser: vi.fn(),
  logoutAccount: vi.fn(),
}))

const currentUserResponse = {
  data: {
    user: {
      id: 'usr_01test',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    },
  },
} as Awaited<ReturnType<typeof fetchCurrentUser>>

describe('MainLayout', () => {
  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  test('shows the signed-in account menu instead of login and register links', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(currentUserResponse)

    renderLayout()

    const accountTrigger = await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' })
    expect(accountTrigger.className).toContain('size-9')
    expect(accountTrigger.className).not.toContain('border-border')
    expect(within(accountTrigger).queryByText('Ada Lovelace')).toBeNull()
    expect(accountTrigger.querySelector('[data-slot="avatar"]')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Login' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Register' })).toBeNull()
  })

  test('presents a compact account card with project navigation and sign out', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentUser).mockResolvedValue(currentUserResponse)

    renderLayout()

    await user.click(await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' }))

    const accountMenu = screen.getByRole('dialog', { name: 'Ada Lovelace' })
    expect(accountMenu.className).toContain('w-72')
    expect(accountMenu.className).toContain('p-0')
    const avatar = accountMenu.querySelector('[data-slot="avatar"]')
    expect(avatar).toBeTruthy()
    expect(avatar?.getAttribute('data-size')).toBe('xl')
    expect(avatar?.className).toContain('size-12')
    expect(within(avatar as HTMLElement).getByText('AL')).toBeTruthy()
    const dividers = accountMenu.querySelectorAll('[data-account-divider]')
    expect(dividers).toHaveLength(2)
    expect(dividers[0]?.getAttribute('data-account-divider')).toBe('identity')
    expect(dividers[1]?.getAttribute('data-account-divider')).toBe('session')
    for (const divider of dividers) {
      expect(divider.className).toContain('bg-foreground/20')
      expect(divider.parentElement?.className).toContain('px-3')
    }
    expect(within(accountMenu).getByRole('link', { name: 'Create project' }).getAttribute('href')).toBe('/projects?create=1')
    expect(within(accountMenu).getByRole('link', { name: 'My projects' }).getAttribute('href')).toBe('/projects')
    expect(within(accountMenu).getByRole('button', { name: 'Sign out' }).className).toContain('h-10')
  })

  test('navigates to project destinations and closes the account menu', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentUser).mockResolvedValue(currentUserResponse)

    const { router } = renderLayout()

    const accountTrigger = await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' })
    await user.click(accountTrigger)
    await user.click(screen.getByRole('link', { name: 'Create project' }))

    expect(router.state.location.pathname).toBe('/projects')
    expect(router.state.location.search).toBe('?create=1')
    expect(screen.queryByRole('dialog', { name: 'Ada Lovelace' })).toBeNull()

    await user.click(accountTrigger)
    await user.click(screen.getByRole('link', { name: 'My projects' }))

    expect(router.state.location.pathname).toBe('/projects')
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('dialog', { name: 'Ada Lovelace' })).toBeNull()
  })

  test('opens without preselecting the sign-out action', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentUser).mockResolvedValue(currentUserResponse)

    renderLayout()

    await user.click(await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' }))

    expect(document.activeElement).not.toBe(screen.getByRole('link', { name: 'Create project' }))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Sign out' }))
  })

  test('moves focus into the menu when opened from the keyboard', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentUser).mockResolvedValue(currentUserResponse)

    renderLayout()

    const accountTrigger = await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' })
    accountTrigger.focus()
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Create project' }))
  })

  test('signs out from the projects page and clears account-scoped cache data', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentUser).mockResolvedValue(currentUserResponse)
    vi.mocked(logoutAccount).mockResolvedValue({ data: { ok: true } } as Awaited<ReturnType<typeof logoutAccount>>)

    const { queryClient, router } = renderLayout('/projects')
    queryClient.setQueryData(['projects'], [{ id: 'prj_cached' }])
    queryClient.setQueryData(['project-agent-conversations', 'prj_cached'], [{ id: 'conv_cached' }])

    await user.click(await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' }))
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(logoutAccount).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(['auth', 'me'])).toBeNull()
    expect(queryClient.getQueryData(['projects'])).toBeUndefined()
    expect(queryClient.getQueryData(['project-agent-conversations', 'prj_cached'])).toBeUndefined()
  })

  test('does not restore stale account data when an auth refetch finishes after logout', async () => {
    const user = userEvent.setup()
    let resolveBackgroundFetch!: (response: typeof currentUserResponse) => void
    const backgroundFetch = new Promise<typeof currentUserResponse>((resolve) => {
      resolveBackgroundFetch = resolve
    })
    vi.mocked(fetchCurrentUser)
      .mockResolvedValueOnce(currentUserResponse)
      .mockReturnValueOnce(backgroundFetch)
    vi.mocked(logoutAccount).mockResolvedValue({ data: { ok: true } } as Awaited<ReturnType<typeof logoutAccount>>)

    const { queryClient, router } = renderLayout('/projects')

    await user.click(await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' }))
    const refetchPromise = queryClient.refetchQueries({ queryKey: ['auth', 'me'] })
    await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    resolveBackgroundFetch(currentUserResponse)
    await refetchPromise

    expect(queryClient.getQueryData(['auth', 'me'])).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open account menu for Ada Lovelace' })).toBeNull()
  })

  test('keeps the account signed in when logout fails', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentUser).mockResolvedValue(currentUserResponse)
    vi.mocked(logoutAccount).mockRejectedValue(new Error('network down'))

    const { router } = renderLayout('/projects')

    await user.click(await screen.findByRole('button', { name: 'Open account menu for Ada Lovelace' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to sign out. Try again.')
    expect(router.state.location.pathname).toBe('/projects')
    expect(screen.getByRole('button', { name: 'Open account menu for Ada Lovelace' })).toBeTruthy()
  })
})

function renderLayout(initialEntry = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <MainLayout />,
        children: [
          { index: true, element: <div>Studio page</div> },
          { path: 'projects', element: <div>Projects page</div> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  )
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router }
}
