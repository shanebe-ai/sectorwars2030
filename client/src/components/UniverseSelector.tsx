import { useState, useEffect } from 'react';

interface Universe {
  id: number;
  name: string;
  description: string;
  max_sectors: number;
  max_players: number;
  turns_per_day: number;
  starting_credits: number;
  is_active: boolean;
  total_sectors: string;
  ports_count: string;
  players_count: string;
}

interface UniverseSelectorProps {
  onSelect: (universeId: number) => void;
  onCancel: () => void;
}

export default function UniverseSelector({ onSelect, onCancel }: UniverseSelectorProps) {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    fetchUniverses();
  }, []);

  const fetchUniverses = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/universes');
      const data = await response.json();

      // Only show active universes
      const activeUniverses = (data.universes || []).filter((u: Universe) => u.is_active);
      setUniverses(activeUniverses);
    } catch (err: any) {
      setError('Failed to load universes');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (selectedId) {
      onSelect(selectedId);
    }
  };

  return (
    <div className="cyberpunk-container">
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div className="cyberpunk-panel">
          <div className="panel-header">
            ► SELECT UNIVERSE
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '48px', color: 'var(--neon-cyan)' }}>⟳</div>
              <p style={{ marginTop: '20px', color: 'var(--neon-cyan)' }}>
                SCANNING UNIVERSES...
              </p>
            </div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : universes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-cyan)' }}>
              <p>No active universes available.</p>
              <p style={{ marginTop: '10px', fontSize: '14px', opacity: 0.7 }}>
                Contact an administrator to create a universe.
              </p>
            </div>
          ) : (
            <>
              <p style={{ marginBottom: '20px', color: 'var(--neon-green)', fontSize: '14px' }}>
                Choose a universe to begin your trading career:
              </p>

              <div className="universe-list">
                {universes.map((universe) => {
                  const playersFull = parseInt(universe.players_count) >= universe.max_players;
                  const isSelected = selectedId === universe.id;

                  return (
                    <div
                      key={universe.id}
                      className={`universe-item ${isSelected ? 'selected' : ''} ${playersFull ? 'disabled' : ''}`}
                      onClick={() => !playersFull && setSelectedId(universe.id)}
                      style={{
                        opacity: playersFull ? 0.5 : 1,
                        cursor: playersFull ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <div className="universe-item-header">
                        <div>
                          <div className="universe-item-name">{universe.name}</div>
                          {universe.description && (
                            <div className="universe-item-description">
                              {universe.description}
                            </div>
                          )}
                        </div>
                        {playersFull && (
                          <div className="universe-status-badge" style={{
                            background: 'rgba(255, 20, 147, 0.2)',
                            color: 'var(--neon-pink)',
                            border: '1px solid var(--neon-pink)'
                          }}>
                            ✗ FULL
                          </div>
                        )}
                      </div>

                      <div className="universe-item-stats">
                        <div className="stat-item">
                          <span className="stat-label">PLAYERS:</span>
                          <span className="stat-value">{universe.players_count} / {universe.max_players}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">SECTORS:</span>
                          <span className="stat-value">{universe.total_sectors}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">PORTS:</span>
                          <span className="stat-value">{universe.ports_count}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">TURNS/DAY:</span>
                          <span className="stat-value">{universe.turns_per_day}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="button-row" style={{ marginTop: '30px' }}>
                <button
                  onClick={onCancel}
                  className="cyberpunk-button"
                  style={{ flex: 1 }}
                >
                  ◄ BACK
                </button>
                <button
                  onClick={handleContinue}
                  className="cyberpunk-button cyberpunk-button-primary"
                  disabled={!selectedId}
                  style={{ flex: 1 }}
                >
                  CONTINUE ►
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
