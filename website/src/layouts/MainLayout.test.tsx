import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import MainLayout from './MainLayout'
import { fetchCurrentUser } from 'src/api/auth'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('src/api/auth', () => ({
  fetchCurrentUser: vi.fn(),
}))

describe('MainLayout', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  test('shows the signed-in user instead of login and register links', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue({
      data: {
        user: {
          id: 'usr_01test',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      },
    } as Awaited<ReturnType<typeof fetchCurrentUser>>)

    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <MainLayout />,
          children: [{ index: true, element: <div>Studio page</div> }],
        },
      ],
      { initialEntries: ['/'] },
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    })

    expect(await screenText('Ada Lovelace')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Login')
    expect(document.body.textContent).not.toContain('Register')
  })
})

async function screenText(text: string) {
  for (let index = 0; index < 10; index += 1) {
    if (document.body.textContent?.includes(text)) {
      return true
    }
    await act(async () => {
      await Promise.resolve()
    })
  }
  return false
}
