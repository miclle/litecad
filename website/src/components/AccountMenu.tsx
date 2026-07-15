import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, LoaderCircle, LogOut, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { fetchCurrentUser, logoutAccount } from 'src/api/auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

function getAccountInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const firstWordInitial = Array.from(words[0] ?? '')[0] ?? ''
  const lastWordInitial = words.length > 1 ? (Array.from(words.at(-1) ?? '')[0] ?? '') : ''

  return `${firstWordInitial}${lastWordInitial}`.toLocaleUpperCase()
}

export function AccountMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await fetchCurrentUser()).data.user,
    retry: false,
    staleTime: 30_000,
  })
  const logoutMutation = useMutation({
    mutationFn: logoutAccount,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['auth', 'me'] })
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null)
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
      setOpen(false)
      navigate('/', { replace: true })
    },
  })
  const currentUser = currentUserQuery.data

  if (!currentUser) {
    return null
  }

  const menuLabel = t('account.menuLabel', { name: currentUser.name })
  const accountInitials = getAccountInitials(currentUser.name)

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          logoutMutation.reset()
        }
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button
            aria-label={menuLabel}
            className="rounded-full"
            size="icon-lg"
            type="button"
            variant="ghost"
          />
        }
      >
        <Avatar>
          <AvatarFallback>{accountInitials}</AvatarFallback>
        </Avatar>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t('account.menuTitle')}
        className="w-72 max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0"
        initialFocus={(openType) => openType === 'keyboard'}
        sideOffset={8}
      >
        <div className="flex min-w-0 items-center gap-3 px-4 py-4">
          <Avatar size="xl">
            <AvatarFallback>{accountInitials}</AvatarFallback>
          </Avatar>
          <PopoverHeader className="min-w-0 flex-1 gap-1">
            <PopoverTitle className="truncate">{currentUser.name}</PopoverTitle>
            <PopoverDescription className="truncate">{currentUser.email}</PopoverDescription>
          </PopoverHeader>
        </div>
        <div className="px-3">
          <Separator data-account-divider="identity" strength="strong" />
        </div>
        <nav aria-label={t('account.projectNavigation')} className="flex flex-col gap-1 p-2">
          <Link
            className={buttonVariants({ variant: 'ghost', className: 'h-10 w-full justify-start px-3' })}
            onClick={() => setOpen(false)}
            to="/projects?create=1"
          >
            <Plus data-icon="inline-start" />
            {t('account.createProject')}
          </Link>
          <Link
            className={buttonVariants({ variant: 'ghost', className: 'h-10 w-full justify-start px-3' })}
            onClick={() => setOpen(false)}
            to="/projects"
          >
            <LayoutGrid data-icon="inline-start" />
            {t('account.myProjects')}
          </Link>
        </nav>
        <div className="px-3">
          <Separator data-account-divider="session" strength="strong" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <Button
            className="h-10 w-full justify-start px-3"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            type="button"
            variant="ghost"
          >
            {logoutMutation.isPending ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <LogOut data-icon="inline-start" />
            )}
            {logoutMutation.isPending ? t('account.signingOut') : t('account.signOut')}
          </Button>
          {logoutMutation.isError ? (
            <p className="px-3 pb-1 text-sm text-destructive" role="alert">
              {t('account.signOutError')}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
