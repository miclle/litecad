import { useEffect, useState } from 'react'
import { hello } from 'src/api/hello'

// Home is the landing page that demonstrates the API connection.
function Home() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    hello()
      .then((res) => setMessage(res.data.message))
      .catch(() => setMessage('Failed to connect to API'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-112px)]">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">
          Goblet
        </h1>
        <p className="text-muted-foreground">
          {loading ? 'Connecting to API...' : message}
        </p>
        <p className="text-sm text-muted-foreground">
          A single binary serving both the API and the SPA.
        </p>
      </div>
    </div>
  )
}

export default Home
