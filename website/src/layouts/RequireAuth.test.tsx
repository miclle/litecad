import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchCurrentUser } from 'src/api/auth'
import { RequireAuth } from './RequireAuth'

vi.mock('src/api/auth', () => ({
  fetchCurrentUser: vi.fn(),
}))

function renderRequireAuth(initialPath = '/projects') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <RequireAuth>
          <div>Protected project area</div>
        </RequireAuth>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RequireAuth', () => {
  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('renders protected content when the current user is available', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue({
      data: {
        user: {
          id: 'usr_01test',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      },
    } as Awaited<ReturnType<typeof fetchCurrentUser>>)

    renderRequireAuth()

    expect(await screen.findByText('Protected project area')).toBeTruthy()
  })

  it('shows an account-required state with the original route as login state', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValue(Object.assign(new Error('unauthorized'), { response: { status: 401 } }))

    renderRequireAuth('/projects/prj_01test')

    expect(await screen.findByText('Sign in to open projects.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Checking session')).toBeNull())

    const signInLink = screen.getByRole('link', { name: /sign in/i }) as HTMLAnchorElement
    expect(signInLink.getAttribute('href')).toBe('/login')
    expect(screen.queryByText('Protected project area')).toBeNull()
  })
})
