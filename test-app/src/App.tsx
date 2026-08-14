import { useEffect, useState } from 'react'
import './App.css'

const AUTH_FRONTEND_URL =
  import.meta.env.VITE_AUTH_FRONTEND_URL ?? 'http://localhost:3430'
const AUTH_BACKEND_URL =
  import.meta.env.VITE_AUTH_BACKEND_URL ?? 'http://localhost:4000'
/** Which registered application this consumer is. */
const APPLICATION_SLUG = import.meta.env.VITE_AUTH_APP_SLUG ?? 'demo'

const STATE_STORAGE_KEY = 'auth-demo-state'

interface VerifiedPayload {
  sub: string
  app: string
  provider: string
  username: string | null
  email: string | null
  email_verified: boolean
  avatar: string | null
  exp: number
}

/** Human text for the error codes the auth service can bounce back with. */
const ERROR_MESSAGES: Record<string, string> = {
  email_already_registered:
    'That email is already registered here through a different provider.',
  user_blocked: 'This account has been blocked.',
  invalid_state: 'The sign-in link expired. Please try again.',
  provider_error: 'The provider could not complete the sign-in.',
}

function App() {
  const [user, setUser] = useState<VerifiedPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const returnedState = params.get('state')
    const failure = params.get('error')

    const clearUrl = () =>
      window.history.replaceState({}, document.title, window.location.pathname)

    if (failure) {
      setError(ERROR_MESSAGES[failure] ?? `Sign-in failed (${failure})`)
      clearUrl()
      setChecking(false)
      return
    }

    if (!token) {
      setChecking(false)
      return
    }

    // The service echoes our state back untouched; it is ours to verify, and
    // the OAuth-level CSRF protection is handled server-side.
    const expectedState = sessionStorage.getItem(STATE_STORAGE_KEY)
    sessionStorage.removeItem(STATE_STORAGE_KEY)

    if (!expectedState || expectedState !== returnedState) {
      setError('Sign-in response did not match this browser session.')
      clearUrl()
      setChecking(false)
      return
    }

    // Verified by the service rather than merely decoded: a client-side decode
    // proves nothing about the signature.
    fetch(`${AUTH_BACKEND_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, application: APPLICATION_SLUG }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Token rejected by the auth service')
        }
        const body = (await response.json()) as { payload: VerifiedPayload }
        setUser(body.payload)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Verification failed')
      })
      .finally(() => {
        clearUrl()
        setChecking(false)
      })
  }, [])

  const handleLogin = () => {
    const state = crypto.randomUUID()
    sessionStorage.setItem(STATE_STORAGE_KEY, state)

    const redirectUri = window.location.href.split('?')[0]
    const url = new URL(AUTH_FRONTEND_URL)
    url.searchParams.set('app', APPLICATION_SLUG)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)

    window.location.href = url.toString()
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {checking ? (
        <p>Checking sign-in…</p>
      ) : user ? (
        <div style={{ textAlign: 'center' }}>
          {user.avatar ? (
            <img
              src={user.avatar}
              alt="Avatar"
              style={{
                borderRadius: '50%',
                width: 120,
                height: 120,
                objectFit: 'cover',
                marginBottom: 20,
              }}
            />
          ) : (
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: '#ccc',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
              }}
            >
              {(user.username ?? user.email ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <h1>Welcome, {user.username ?? user.email ?? 'friend'}!</h1>
          <p style={{ color: '#666' }}>User ID: {user.sub}</p>
          <p style={{ color: '#666' }}>Email: {user.email ?? '—'}</p>
          <p style={{ color: '#666' }}>Signed in with: {user.provider}</p>
          <button
            type="button"
            onClick={() => setUser(null)}
            style={{ marginTop: 20, padding: '10px 20px', cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <h1>Test Application</h1>
          <p>Login to see your profile</p>
          {error && <p style={{ color: '#c00' }}>{error}</p>}
          <button
            type="button"
            onClick={handleLogin}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Login with Auth Service
          </button>
        </div>
      )}
    </div>
  )
}

export default App
