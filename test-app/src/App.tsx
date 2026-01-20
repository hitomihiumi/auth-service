import { useState, useEffect } from 'react'
import './App.css'
import { jwtDecode } from "jwt-decode";

interface UserPayload {
  username: string;
  avatar?: string;
  sub: string;
  email: string;
}

function App() {
  const [user, setUser] = useState<UserPayload | null>(null);

  useEffect(() => {
    // Check for token in URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      try {
        const decoded = jwtDecode<UserPayload>(token);
        setUser(decoded);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error("Invalid token", e);
      }
    }
  }, []);

  const handleLogin = () => {
    // Redirect to Auth Service
    const callbackUrl = window.location.href.split('?')[0]; // Current URL without params
    window.location.href = `http://localhost:3000?callbackUrl=${callbackUrl}`;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      {user ? (
        <div style={{ textAlign: 'center' }}>
          {user.avatar ? (
             <img
              src={user.avatar}
              alt="Avatar"
              style={{ borderRadius: '50%', width: 120, height: 120, objectFit: 'cover', marginBottom: 20 }}
             />
          ) : (
             <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#ccc', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                {user.username.charAt(0).toUpperCase()}
             </div>
          )}
          <h1>Welcome, {user.username}!</h1>
          <p style={{ color: '#666' }}>User ID: {user.sub}</p>
          <p style={{ color: '#666' }}>email: {user.email}</p>
          <button
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
          <button
            onClick={handleLogin}
            style={{ marginTop: 20, padding: '10px 20px', cursor: 'pointer', fontSize: '16px' }}
          >
            Login with Auth Service
          </button>
        </div>
      )}
    </div>
  )
}

export default App
