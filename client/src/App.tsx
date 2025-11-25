import { useState } from 'react';
import Login from './components/Login';
import './App.css';

function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>('');

  const handleLogin = (authToken: string, userData: any) => {
    setToken(authToken);
    setUser(userData);
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="cyberpunk-container">
      <div className="cyberpunk-panel" style={{ margin: '40px auto', maxWidth: '800px' }}>
        <div className="panel-header">
          ► COMMAND CENTER
        </div>

        <div style={{ padding: '20px' }}>
          <div className="neon-text-green" style={{ marginBottom: '20px' }}>
            Welcome, Captain {user.username}!
          </div>

          <div className="neon-text" style={{ marginBottom: '20px' }}>
            ╔════════════════════════════════════════════════╗
            ║  SYSTEM STATUS: ONLINE                         ║
            ║  USER ID: {user.id.toString().padStart(6, '0')}                                 ║
            ║  RANK: {user.isAdmin ? 'ADMINISTRATOR' : 'PILOT'}                        ║
            ║  EMAIL: {user.email.padEnd(30, ' ')}   ║
            ╚════════════════════════════════════════════════╝
          </div>

          <div className="neon-text-green">
            <p>► Game features coming soon...</p>
            <p>► Universe navigation</p>
            <p>► Trading system</p>
            <p>► Combat mechanics</p>
          </div>

          <button
            onClick={handleLogout}
            className="cyberpunk-button cyberpunk-button-danger"
            style={{ marginTop: '30px' }}
          >
            ◄ LOGOUT
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
