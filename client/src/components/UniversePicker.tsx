import { useState } from 'react';
import { API_URL } from '../config/api';

// Universe picker: shown when a user owns players in more than one
// universe (for example after a new season starts in a fresh universe).
// Picking a ship asks the server for a token scoped to that player;
// every later request then acts as that ship.

export interface OwnedPlayer {
  id: number;
  corpName: string;
  universeId: number;
  universeName: string;
  currentSector: number;
  credits: number;
  shipType: string;
  isAlive: boolean;
  universeSeason?: string | null;
  universeSeasonEndsAt?: string | null;
}

interface UniversePickerProps {
  token: string;
  players: OwnedPlayer[];
  activePlayerId: number | null;
  onSelected: (token: string, playerId: number) => void;
  onJoinNew: () => void;
  onLogout: () => void;
}

const daysLeft = (endsAt?: string | null): string | null => {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const days = Math.ceil(ms / (24 * 3600 * 1000));
  return days === 1 ? '1 day left' : `${days} days left`;
};

export default function UniversePicker({
  token,
  players,
  activePlayerId,
  onSelected,
  onJoinNew,
  onLogout,
}: UniversePickerProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handlePlay = async (playerId: number) => {
    setBusyId(playerId);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/players/${playerId}/select`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.token) {
        onSelected(data.token, playerId);
      } else {
        setError(data.error || 'Could not switch to that ship');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="cyberpunk-container">
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div className="cyberpunk-panel">
          <div className="panel-header">► YOUR SHIPS</div>
          <p style={{ marginBottom: '20px', color: 'var(--neon-green)', fontSize: '14px' }}>
            You fly one ship per universe. Pick one to play, or join another universe.
          </p>

          {error && <div className="error-message">{error}</div>}

          <div className="universe-list">
            {players.map((p) => {
              const left = daysLeft(p.universeSeasonEndsAt);
              return (
                <div
                  key={p.id}
                  className={`universe-item ${p.id === activePlayerId ? 'selected' : ''}`}
                  data-testid={`picker-player-${p.id}`}
                >
                  <div className="universe-item-header">
                    <div>
                      <div className="universe-item-name">{p.universeName}</div>
                      <div className="universe-item-description">
                        {p.corpName}
                        {p.universeSeason ? ` · ${p.universeSeason}${left ? `, ${left}` : ''}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cyberpunk-button cyberpunk-button-primary"
                      disabled={busyId !== null}
                      onClick={() => handlePlay(p.id)}
                    >
                      {busyId === p.id ? 'DOCKING...' : 'PLAY ►'}
                    </button>
                  </div>
                  <div className="universe-item-stats">
                    <div className="stat-item">
                      <span className="stat-label">SHIP:</span>
                      <span className="stat-value">{p.shipType}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">SECTOR:</span>
                      <span className="stat-value">{p.currentSector}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">CREDITS:</span>
                      <span className="stat-value">{Number(p.credits || 0).toLocaleString()}</span>
                    </div>
                    {!p.isAlive && (
                      <div className="stat-item">
                        <span className="stat-label">STATUS:</span>
                        <span className="stat-value" style={{ color: 'var(--neon-pink)' }}>ESCAPE POD</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="button-row" style={{ marginTop: '30px' }}>
            <button onClick={onLogout} className="cyberpunk-button" style={{ flex: 1 }}>
              ◄ LOGOUT
            </button>
            <button
              onClick={onJoinNew}
              className="cyberpunk-button cyberpunk-button-primary"
              style={{ flex: 1 }}
            >
              + JOIN ANOTHER UNIVERSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
