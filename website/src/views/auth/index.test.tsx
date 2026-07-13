import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { loginAccount, registerAccount } from 'src/api/auth'
import AuthView from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('src/api/auth', () => ({
  loginAccount: vi.fn(),
  registerAccount: vi.fn(),
}))

describe('AuthView', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  test('returns to the protected route after login', async () => {
    const user = userEvent.setup()
    vi.mocked(loginAccount).mockResolvedValue({
      data: {
        user: {
          id: 'usr_test',
          name: 'Ada',
          email: 'ada@example.com',
        },
      },
    } as Awaited<ReturnType<typeof loginAccount>>)

    const router = createMemoryRouter(
      [
        { path: '/login', element: <AuthView /> },
        { path: '/projects/:projectId', element: <div>Protected project loaded</div> },
      ],
      { initialEntries: [{ pathname: '/login', state: { from: '/projects/prj_01test' } }] },
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    })

    await user.type(document.querySelector('input[type="email"]') as HTMLInputElement, 'ada@example.com')
    await user.type(document.querySelector('input[type="password"]') as HTMLInputElement, 'password123')
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)

    await waitForPath(router, '/projects/prj_01test')
    expect(loginAccount).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'password123' })
    expect(registerAccount).not.toHaveBeenCalled()
  })

  test('ignores non-app redirect targets after login', async () => {
    const user = userEvent.setup()
    vi.mocked(loginAccount).mockResolvedValue({
      data: {
        user: {
          id: 'usr_test',
          name: 'Ada',
          email: 'ada@example.com',
        },
      },
    } as Awaited<ReturnType<typeof loginAccount>>)

    const router = createMemoryRouter(
      [
        { path: '/', element: <div>Studio home</div> },
        { path: '/login', element: <AuthView /> },
      ],
      { initialEntries: [{ pathname: '/login', state: { from: 'https://example.com/phish' } }] },
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    })

    await user.type(document.querySelector('input[type="email"]') as HTMLInputElement, 'ada@example.com')
    await user.type(document.querySelector('input[type="password"]') as HTMLInputElement, 'password123')
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)

    await waitForPath(router, '/')
  })
})

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
