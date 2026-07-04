import { Outlet, NavLink } from 'react-router-dom'

function MainLayout() {
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
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout
