import { Outlet, NavLink } from 'react-router-dom'

// MainLayout provides the top navigation bar and content area.
function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 h-14 flex items-center justify-between px-6 border-b bg-background">
        <NavLink to="/" className="text-xl font-semibold text-foreground no-underline">
          App
        </NavLink>
        <nav className="flex items-center gap-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `text-sm no-underline ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`
            }
          >
            Home
          </NavLink>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="py-4 px-6 border-t text-center text-xs text-muted-foreground">
        Built with Go + React
      </footer>
    </div>
  )
}

export default MainLayout
