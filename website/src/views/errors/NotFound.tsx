import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// NotFound is the 404 error page.
function NotFound() {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <p className="text-muted-foreground">{t('notFound.title')}</p>
        <NavLink to="/" className="text-primary hover:underline text-sm">
          {t('notFound.backHome')}
        </NavLink>
      </div>
    </div>
  )
}

export default NotFound
