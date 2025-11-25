import { useState } from 'react'
import AdminLogin from './components/AdminLogin'
import UniverseDashboard from './components/UniverseDashboard'
import './App.css'

function App() {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)

  const handleLogin = (authToken: string, authUser: any) => {
    setToken(authToken)
    setUser(authUser)
  }

  const handleLogout = () => {
    setToken(null)
    setUser(null)
  }

  if (!token || !user) {
    return <AdminLogin onLogin={handleLogin} />
  }

  return <UniverseDashboard token={token} user={user} onLogout={handleLogout} />
}

export default App
