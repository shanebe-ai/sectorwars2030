import { useState, useEffect } from 'react';
import Login from './components/Login';
import PlayerInitialization from './components/PlayerInitialization';
import GameDashboard from './components/GameDashboard';
import { API_URL } from './config/api';
import './App.css';

function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      // Check if user has a player
      checkForPlayer(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const checkForPlayer = async (authToken: string) => {
    try {
      const response = await fetch(`${API_URL}/api/players`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.players && data.players.length > 0) {
        // User has at least one player, use the first one
        setPlayer(data.players[0]);
      }
    } catch (err) {
      console.error('Failed to check for player:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (authToken: string, userData: any) => {
    setToken(authToken);
    setUser(userData);
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
    // Check if user has a player
    checkForPlayer(authToken);
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setPlayer(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const handlePlayerCreated = (newPlayer: any) => {
    setPlayer(newPlayer);
  };

  // Loading state
  if (loading) {
    return (
      <div className="cyberpunk-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', color: 'var(--neon-cyan)' }}>⟳</div>
          <p style={{ marginTop: '20px', color: 'var(--neon-cyan)' }}>
            INITIALIZING SYSTEMS...
          </p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Logged in but no player
  if (!player) {
    return (
      <PlayerInitialization
        token={token}
        onComplete={handlePlayerCreated}
        onLogout={handleLogout}
      />
    );
  }

  // Logged in with player
  return (
    <GameDashboard
      player={player}
      token={token}
      onLogout={handleLogout}
    />
  );
}

export default App;
