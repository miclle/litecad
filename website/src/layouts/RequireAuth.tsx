import { useQuery } from '@tanstack/react-query'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchCurrentUser } from 'src/api/auth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await fetchCurrentUser()).data.user,
    retry: false,
    staleTime: 30_000,
  })

  if (currentUserQuery.isPending) {
    return (
      <div className="grid min-h-[calc(100vh-56px)] place-items-center bg-[#f7f5ef] px-5 text-center">
        <div>
          <div className="font-mono text-xs uppercase tracking-normal text-[#7a6c52]">{t('auth.checkingTitle')}</div>
          <p className="mt-3 text-sm text-[#55594f]">{t('auth.checkingBody')}</p>
        </div>
      </div>
    )
  }

  if (!currentUserQuery.data) {
    return (
      <div className="grid min-h-[calc(100vh-56px)] place-items-center bg-[#f7f5ef] px-5">
        <section className="w-full max-w-[520px] rounded-md border border-[#d8cfbc] bg-[#fcfaf3] p-5 text-[#171814] shadow-sm">
          <div className="inline-flex items-center gap-2 border border-[#cfc6b2] bg-white px-3 py-2 font-mono text-xs uppercase text-[#7a6c52]">
            <LockKeyhole className="size-4" />
            {t('auth.requiredEyebrow')}
          </div>
          <h1 className="mt-5 text-2xl font-semibold">{t('auth.requiredTitle')}</h1>
          <p className="mt-3 text-sm leading-6 text-[#55594f]">{t('auth.requiredBody')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#171814] px-4 text-sm font-semibold text-[#f7f5ef] no-underline transition hover:bg-[#303329]"
              state={{ from: returnTo }}
              to="/login"
            >
              {t('common.signIn')}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfc6b2] px-4 text-sm font-medium text-[#303329] no-underline transition hover:border-[#52625a]"
              state={{ from: returnTo }}
              to="/register"
            >
              {t('common.register')}
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return children
}
