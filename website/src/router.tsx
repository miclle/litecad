import type { RouteObject } from 'react-router-dom'

import MainLayout from 'src/layouts/MainLayout'
import Home from 'src/views/home'
import AuthView from 'src/views/auth'
import NotFound from 'src/views/errors/NotFound'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'login', element: <AuthView /> },
      { path: 'register', element: <AuthView /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]

export default routes
