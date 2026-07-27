import axios from 'axios'

// client is the pre-configured axios instance for API calls.
const client = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
})

type RedirectLocation = Pick<Location, 'assign' | 'pathname'>

export function redirectToLoginOnUnauthorized(
  status: unknown,
  requestURL?: string,
  location: RedirectLocation = window.location,
) {
  if (status !== 401) {
    return
  }
  const isCurrentUserProbe = requestURL === '/auth/me'
  if (!isCurrentUserProbe && location.pathname !== '/login' && location.pathname !== '/register') {
    location.assign('/login')
  }
}

// Intercept 401 responses to redirect to login page.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    redirectToLoginOnUnauthorized(error.response?.status, error.config?.url)
    return Promise.reject(error)
  },
)

export default client
