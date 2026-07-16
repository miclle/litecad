import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { APP_NAME, AppContext } from 'src/context/app'
import { queryClient } from 'src/lib/query-client'
import routes from './router'

const router = createBrowserRouter(routes)

// App is the root component wrapping providers and the router.
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={{ appName: APP_NAME }}>
        <RouterProvider router={router} />
      </AppContext.Provider>
    </QueryClientProvider>
  )
}

export default App
