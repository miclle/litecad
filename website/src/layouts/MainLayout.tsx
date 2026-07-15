import { useQuery } from '@tanstack/react-query'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { fetchCurrentUser } from 'src/api/auth'
import { AccountMenu } from 'src/components/AccountMenu'
import LanguageSwitcher from 'src/components/LanguageSwitcher'

function MainLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const isProjectsPage = location.pathname === '/projects'
  const isProjectDetailPage = /^\/projects\/[^/]+$/.test(location.pathname)
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await fetchCurrentUser()).data.user,
    retry: false,
    staleTime: 30_000,
  })
  const currentUser = currentUserQuery.data

  const openProjectDialog = () => {
    window.dispatchEvent(new CustomEvent('litecad:new-project'))
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-[#171814]">
      {!isProjectDetailPage && (
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-[#d9d3c2] bg-[#f7f5ef]/92 px-5 backdrop-blur">
          <NavLink to="/" className="font-mono text-lg font-semibold lowercase text-[#171814] no-underline">
            litecad
          </NavLink>
          <nav className="flex items-center gap-2">
            {isProjectsPage && (
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-sm bg-[#171814] px-3 text-sm font-semibold text-[#f7f5ef] transition hover:bg-[#303329]"
                onClick={openProjectDialog}
                type="button"
              >
                <Plus className="size-4" />
                {t('nav.newProject')}
              </button>
            )}
            <LanguageSwitcher />
            {currentUser ? (
              <AccountMenu />
            ) : currentUserQuery.isPending ? null : (
              <>
                <NavLink
                  to="/login"
                  className={({ isActive }) =>
                    `rounded-sm px-3 py-1.5 text-sm no-underline transition ${isActive ? 'bg-[#171814] text-[#f7f5ef]' : 'text-[#5f6259] hover:bg-[#e8e1d0] hover:text-[#171814]'}`
                  }
                >
                  {t('common.login')}
                </NavLink>
                <NavLink
                  to="/register"
                  className={({ isActive }) =>
                    `rounded-sm border px-3 py-1.5 text-sm font-medium no-underline transition ${isActive ? 'border-[#171814] bg-[#171814] text-[#f7f5ef]' : 'border-[#cfc6b2] text-[#303329] hover:border-[#52625a]'}`
                  }
                >
                  {t('common.register')}
                </NavLink>
              </>
            )}
          </nav>
        </header>
      )}

      <main>
        <Outlet context={{ currentUser }} />
      </main>
    </div>
  )
}

export default MainLayout
