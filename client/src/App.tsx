import { useState, useEffect } from 'react';
import Login from './components/Login';
import PlayerInitialization from './components/PlayerInitialization';
import GameDashboard from './components/GameDashboard';
import UniversePicker, { type OwnedPlayer } from './components/UniversePicker';
import { ThemeProvider } from './themes/ThemeContext';
import TerminalShell from './components/bbs/TerminalShell';
import { API_URL } from './config/api';
import './App.css';
import './styles/bbs-terminal.css';
import './styles/mobile-cyberpunk.css';
import './styles/mobile-ux.css';

// The player id a token is scoped to, if any (see the server's
// utils/activePlayer.ts). Only read for routing; the server checks it.
const tokenPlayerId = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.playerId === 'number' ? payload.playerId : null;
  } catch {
    return null;
  }
};

type View = 'game' | 'picker' | 'create';

function AppContent() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [player, setPlayer] = useState<any>(null);
  const [players, setPlayers] = useState<OwnedPlayer[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<number | null>(null);
  const [view, setView] = useState<View>('create');
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

  const storeToken = (authToken: string) => {
    setToken(authToken);
    localStorage.setItem('token', authToken);
  };

  // Load the user's players and decide where to land:
  // no players -> create one; one player -> play it; several -> play
  // the one the token is scoped to, or show the picker if none is.
  const checkForPlayer = async (authToken: string, forcePicker = false) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/players`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.players && data.players.length > 0) {
        const owned: OwnedPlayer[] = data.players;
        setPlayers(owned);
        setActivePlayerId(data.activePlayerId ?? owned[0].id);
        const scoped = tokenPlayerId(authToken);
        const scopedPlayer = scoped !== null ? owned.find((p) => p.id === scoped) : undefined;
        if (!forcePicker && owned.length === 1) {
          setPlayer(owned[0]);
          setView('game');
        } else if (!forcePicker && scopedPlayer) {
          setPlayer(scopedPlayer);
          setView('game');
        } else {
          setPlayer(null);
          setView('picker');
        }
      } else {
        setPlayers([]);
        setPlayer(null);
        setView('create');
      }
    } catch (err) {
      console.error('Failed to check for player:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (authToken: string, userData: any) => {
    storeToken(authToken);
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    // Check if user has a player
    checkForPlayer(authToken);
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setPlayer(null);
    setPlayers([]);
    setView('create');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const handlePlayerCreated = (newPlayer: any, newToken?: string) => {
    if (newToken) {
      // The server scoped the new token to the new player; reload the
      // full player list so the picker knows about it too.
      storeToken(newToken);
      checkForPlayer(newToken);
      return;
    }
    setPlayer(newPlayer);
    setView('game');
  };

  const handlePlayerSelected = (newToken: string) => {
    storeToken(newToken);
    checkForPlayer(newToken);
  };

  const handleSwitchUniverse = () => {
    checkForPlayer(token, true);
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

  // Several ships: pick one, or join another universe
  if (view === 'picker' && players.length > 0) {
    return (
      <UniversePicker
        token={token}
        players={players}
        activePlayerId={activePlayerId}
        onSelected={handlePlayerSelected}
        onJoinNew={() => setView('create')}
        onLogout={handleLogout}
      />
    );
  }

  // Logged in but no player yet, or joining another universe
  if (!player || view === 'create') {
    return (
      <PlayerInitialization
        token={token}
        onComplete={handlePlayerCreated}
        onLogout={players.length > 0 ? () => setView('picker') : handleLogout}
        excludeUniverseIds={players.map((p) => p.universeId)}
      />
    );
  }

  // Logged in with player
  return (
    <GameDashboard
      key={player.id}
      player={player}
      token={token}
      onLogout={handleLogout}
      onSwitchUniverse={handleSwitchUniverse}
    />
  );
}

function App() {
  return (
    <ThemeProvider>
      <TerminalShell>
        <AppContent />
      </TerminalShell>
    </ThemeProvider>
  );
}

export default App;
