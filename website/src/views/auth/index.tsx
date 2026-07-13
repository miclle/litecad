import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BadgeCheck, LockKeyhole, Mail, UserRound } from 'lucide-react'
import axios from 'axios'

import { loginAccount, registerAccount } from 'src/api/auth'
import type { AuthResponse } from 'src/types/auth'

type AuthLocationState = {
  from?: string
}

function AuthView() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isRegister = location.pathname === '/register'
  const locationState = location.state as AuthLocationState | null
  const redirectPath =
    typeof locationState?.from === 'string' && locationState.from.startsWith('/') && !locationState.from.startsWith('//')
      ? locationState.from
      : '/'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const response = isRegister
        ? await registerAccount({ name, email, password })
        : await loginAccount({ email, password })
      return response.data
    },
    onSuccess: (data: AuthResponse) => {
      setErrorMessage('')
      queryClient.setQueryData(['auth', 'me'], data.user)
      navigate(redirectPath, { replace: true, state: { signedInUser: data.user.name } })
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setErrorMessage('This email is already registered.')
        return
      }
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setErrorMessage('The email or password is incorrect.')
        return
      }
      setErrorMessage('Please check the account details and try again.')
    },
  })

  const submitLabel = useMemo(() => {
    if (mutation.isPending) {
      return isRegister ? 'Creating account' : 'Signing in'
    }
    return isRegister ? 'Create account' : 'Sign in'
  }, [isRegister, mutation.isPending])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    mutation.mutate()
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#f7f5ef] px-5 py-8 lg:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 border border-[#cfc6b2] bg-[#fcfaf3] px-3 py-2 font-mono text-xs uppercase text-[#7a6c52]">
            <LockKeyhole className="size-4" />
            Account access
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-[#171814] sm:text-5xl">
            {isRegister ? 'Create your LiteCAD workspace account.' : 'Return to your LiteCAD workspace.'}
          </h1>
          <p className="mt-5 text-base leading-7 text-[#55594f]">
            {isRegister
              ? 'Start with a named account so design briefs, model previews, and future exports have a clear owner.'
              : 'Sign in to continue from the studio shell and keep account-scoped work ready for the next CAD loop.'}
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-[#d8cfbc] bg-[#d8cfbc] sm:grid-cols-3">
            {['Identity', 'Session', 'Studio'].map((item, index) => (
              <div className="bg-[#fcfaf3] p-4" key={item}>
                <div className="flex items-center justify-between">
                  <BadgeCheck className="size-4 text-[#52625a]" />
                  <span className="font-mono text-xs text-[#9b8c6f]">0{index + 1}</span>
                </div>
                <p className="mt-5 text-sm font-semibold text-[#171814]">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[#d8cfbc] bg-[#fcfaf3] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-[#d9d3c2] pb-4">
            <div>
              <p className="font-mono text-xs uppercase text-[#7a6c52]">{isRegister ? 'Register' : 'Login'}</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#171814]">
                {isRegister ? 'New account' : 'Existing account'}
              </h2>
            </div>
            <Link
              className="rounded-sm border border-[#cfc6b2] px-3 py-1.5 text-sm font-medium text-[#303329] no-underline transition hover:border-[#52625a]"
              to={isRegister ? '/login' : '/register'}
            >
              {isRegister ? 'Sign in' : 'Register'}
            </Link>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            {isRegister && (
              <label className="grid gap-2 text-sm font-medium text-[#303329]">
                Name
                <span className="flex h-12 items-center gap-3 rounded-md border border-[#cfc6b2] bg-white px-3 focus-within:border-[#52625a]">
                  <UserRound className="size-4 text-[#7a6c52]" />
                  <input
                    autoComplete="name"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                    required
                    value={name}
                  />
                </span>
              </label>
            )}

            <label className="grid gap-2 text-sm font-medium text-[#303329]">
              Email
              <span className="flex h-12 items-center gap-3 rounded-md border border-[#cfc6b2] bg-white px-3 focus-within:border-[#52625a]">
                <Mail className="size-4 text-[#7a6c52]" />
                <input
                  autoComplete="email"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>

            <label className="grid gap-2 text-sm font-medium text-[#303329]">
              Password
              <span className="flex h-12 items-center gap-3 rounded-md border border-[#cfc6b2] bg-white px-3 focus-within:border-[#52625a]">
                <LockKeyhole className="size-4 text-[#7a6c52]" />
                <input
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>

            {errorMessage && (
              <p className="rounded-md border border-[#d9a9a1] bg-[#fff2ef] px-3 py-2 text-sm text-[#8a2f24]">
                {errorMessage}
              </p>
            )}

            <button
              className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#171814] px-5 text-sm font-semibold text-[#f7f5ef] transition hover:bg-[#303329] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={mutation.isPending}
              type="submit"
            >
              {submitLabel}
              <ArrowRight className="size-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

export default AuthView
