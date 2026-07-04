import { useQuery } from '@tanstack/react-query'
import { Outlet, NavLink } from 'react-router-dom'
import { UserRound } from 'lucide-react'

import { fetchCurrentUser } from 'src/api/auth'

function MainLayout() {
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await fetchCurrentUser()).data.user,
    retry: false,
    staleTime: 30_000,
  })
  const currentUser = currentUserQuery.data

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-[#171814]">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-[#d9d3c2] bg-[#f7f5ef]/92 px-5 backdrop-blur">
        <NavLink to="/" className="font-mono text-lg font-semibold lowercase text-[#171814] no-underline">
          litecad
        </NavLink>
        <nav className="flex items-center gap-2">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `rounded-sm px-3 py-1.5 text-sm no-underline transition ${isActive ? 'bg-[#171814] text-[#f7f5ef]' : 'text-[#5f6259] hover:bg-[#e8e1d0] hover:text-[#171814]'}`
            }
          >
            Studio
          </NavLink>
          {currentUser ? (
            <div className="inline-flex h-9 max-w-[180px] items-center gap-2 rounded-sm border border-[#cfc6b2] bg-[#fcfaf3] px-3 text-sm font-medium text-[#303329]">
              <UserRound className="size-4 shrink-0 text-[#52625a]" />
              <span className="truncate">{currentUser.name}</span>
            </div>
          ) : currentUserQuery.isPending ? null : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `rounded-sm px-3 py-1.5 text-sm no-underline transition ${isActive ? 'bg-[#171814] text-[#f7f5ef]' : 'text-[#5f6259] hover:bg-[#e8e1d0] hover:text-[#171814]'}`
                }
              >
                Login
              </NavLink>
              <NavLink
                to="/register"
                className={({ isActive }) =>
                  `rounded-sm border px-3 py-1.5 text-sm font-medium no-underline transition ${isActive ? 'border-[#171814] bg-[#171814] text-[#f7f5ef]' : 'border-[#cfc6b2] text-[#303329] hover:border-[#52625a]'}`
                }
              >
                Register
              </NavLink>
            </>
          )}
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout
