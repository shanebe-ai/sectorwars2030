import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface SeasonInfo {
  id: number;
  seasonNumber: number;
  name: string;
  status: 'active' | 'ended';
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
}

interface SeasonStanding {
  rank: number;
  username: string | null;
  corpName: string;
  networth: number;
}

interface SeasonsResponse {
  available: boolean;
  current: SeasonInfo | null;
  hallOfFame: Array<{ season: SeasonInfo; standings: SeasonStanding[] }>;
  serverTime: string;
}

// "12d 4h", "5h 20m", "under 1m"
const formatTimeLeft = (ms: number) => {
  if (ms <= 0) return 'ending now';
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return mins > 0 ? `${mins}m` : 'under 1m';
};

interface LeaderboardPanelProps {
  universeId: number;
  token: string;
  onClose: () => void;
}

export default function LeaderboardPanel({ universeId, token, onClose }: LeaderboardPanelProps) {
  const [category, setCategory] = useState<'networth' | 'experience' | 'kills' | 'planets' | 'hall'>('networth');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seasons, setSeasons] = useState<SeasonsResponse | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    // Seasons are optional: if the call fails the panel works as before.
    fetch(`${API_URL}/api/seasons/universe/${universeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SeasonsResponse | null) => {
        if (data && data.available) {
          setSeasons(data);
          setClockOffset(new Date(data.serverTime).getTime() - Date.now());
        }
      })
      .catch(() => {});
  }, [universeId]);

  useEffect(() => {
    loadLeaderboard();
  }, [category]);

  const loadLeaderboard = async () => {
    if (category === 'hall') {
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${API_URL}/api/leaderboard/${universeId}?category=${category}&limit=50`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data.leaderboard);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load leaderboard');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return '#FFD700'; // Gold
    if (rank === 2) return '#C0C0C0'; // Silver
    if (rank === 3) return '#CD7F32'; // Bronze
    return 'var(--neon-cyan)';
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#0a0a0a',
        border: '2px solid var(--neon-cyan)',
        boxShadow: '0 0 30px rgba(0, 255, 255, 0.5)',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--neon-cyan)',
          background: 'rgba(0, 255, 255, 0.05)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '15px'
          }}>
            <h2 style={{ margin: 0, color: 'var(--neon-cyan)', fontSize: '20px' }}>
              🏆 LEADERBOARD
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--neon-pink)',
                color: 'var(--neon-pink)',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕ CLOSE
            </button>
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {['networth', 'experience', 'kills', 'planets'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat as any)}
                style={{
                  padding: '8px 16px',
                  background: category === cat ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
                  border: `1px solid ${category === cat ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.3)'}`,
                  color: category === cat ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.6)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  fontWeight: category === cat ? 'bold' : 'normal'
                }}
              >
                {cat === 'networth' && '💰 Net Worth'}
                {cat === 'experience' && '⭐ Experience'}
                {cat === 'kills' && '⚔️ Kills'}
                {cat === 'planets' && '🌍 Planets'}
              </button>
            ))}
            {seasons && (
              <button
                onClick={() => setCategory('hall')}
                style={{
                  padding: '8px 16px',
                  background: category === 'hall' ? 'rgba(255, 215, 0, 0.15)' : 'transparent',
                  border: `1px solid ${category === 'hall' ? '#FFD700' : 'rgba(255, 215, 0, 0.4)'}`,
                  color: category === 'hall' ? '#FFD700' : 'rgba(255, 215, 0, 0.7)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  fontWeight: category === 'hall' ? 'bold' : 'normal'
                }}
              >
                🏛 Hall of Fame
              </button>
            )}
          </div>

          {seasons && (
            <div data-testid="season-strip" style={{
              marginTop: '12px',
              fontSize: '12px',
              color: seasons.current ? 'var(--neon-yellow)' : 'var(--text-secondary)'
            }}>
              {seasons.current
                ? `◆ ${seasons.current.name.toUpperCase()} · ENDS IN ${formatTimeLeft(new Date(seasons.current.endsAt).getTime() - (Date.now() + clockOffset)).toUpperCase()} · FINAL NET WORTH RANKS GO TO THE HALL OF FAME`
                : '◇ NO SEASON RUNNING'}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {category === 'hall' && seasons && (
            <div data-testid="hall-of-fame">
              {seasons.hallOfFame.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
                  No finished seasons yet. Champions appear here when a season ends.
                </div>
              )}
              {seasons.hallOfFame.map(({ season, standings }) => (
                <div key={season.id} style={{
                  border: '1px solid rgba(255, 215, 0, 0.3)',
                  padding: '12px 16px',
                  marginBottom: '12px'
                }}>
                  <div style={{ color: '#FFD700', fontWeight: 'bold', marginBottom: '8px' }}>
                    {season.name.toUpperCase()}
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: '11px', marginLeft: '10px' }}>
                      ended {new Date(season.endedAt || season.endsAt).toLocaleDateString()}
                    </span>
                  </div>
                  {standings.length === 0 && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>No ranked traders</div>
                  )}
                  {standings.map((s) => (
                    <div key={s.rank} style={{ display: 'flex', gap: '12px', fontSize: '13px', padding: '3px 0' }}>
                      <span style={{ color: getRankColor(s.rank), width: '28px' }}>
                        {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                      </span>
                      <span style={{ color: 'var(--neon-purple)', flex: 1 }}>{s.corpName}</span>
                      <span style={{ color: 'var(--neon-green)' }}>{s.username}</span>
                      <span style={{ color: 'var(--neon-yellow)', minWidth: '70px', textAlign: 'right' }}>
                        ₡{formatNumber(Number(s.networth))}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {category !== 'hall' && loading && (
            <div style={{ textAlign: 'center', color: 'var(--neon-cyan)', padding: '40px' }}>
              Loading...
            </div>
          )}

          {category !== 'hall' && error && (
            <div style={{ color: 'var(--neon-pink)', padding: '20px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {category !== 'hall' && !loading && !error && leaderboard.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
              No players found
            </div>
          )}

          {category !== 'hall' && !loading && !error && leaderboard.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid rgba(0, 255, 255, 0.3)',
                  color: 'var(--neon-cyan)',
                  fontSize: '12px'
                }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>RANK</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>PLAYER</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>CORP</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>SHIP</th>
                  {category === 'networth' && <th style={{ padding: '10px', textAlign: 'right' }}>NET WORTH</th>}
                  {category === 'experience' && <th style={{ padding: '10px', textAlign: 'right' }}>EXPERIENCE</th>}
                  {category === 'kills' && (
                    <>
                      <th style={{ padding: '10px', textAlign: 'right' }}>KILLS</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>DEATHS</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>K/D</th>
                    </>
                  )}
                  {category === 'planets' && (
                    <>
                      <th style={{ padding: '10px', textAlign: 'right' }}>PLANETS</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>COLONISTS</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr key={entry.id} style={{
                    borderBottom: '1px solid rgba(0, 255, 255, 0.1)',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}>
                    <td style={{
                      padding: '10px',
                      fontWeight: 'bold',
                      color: getRankColor(entry.rank)
                    }}>
                      {entry.rank === 1 && '🥇'}
                      {entry.rank === 2 && '🥈'}
                      {entry.rank === 3 && '🥉'}
                      {entry.rank > 3 && `#${entry.rank}`}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--neon-green)' }}>
                      {entry.username}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--neon-purple)' }}>
                      {entry.corp_name}
                    </td>
                    <td style={{ padding: '10px', fontSize: '11px', opacity: 0.8 }}>
                      {entry.ship_type}
                    </td>
                    {category === 'networth' && (
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--neon-yellow)' }}>
                        ₡{formatNumber(Number(entry.networth))}
                      </td>
                    )}
                    {category === 'experience' && (
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--neon-yellow)' }}>
                        {formatNumber(Number(entry.experience))}
                      </td>
                    )}
                    {category === 'kills' && (
                      <>
                        <td style={{ padding: '10px', textAlign: 'right', color: 'var(--neon-green)' }}>
                          {entry.kills}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', color: 'var(--neon-pink)' }}>
                          {entry.deaths}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', color: 'var(--neon-cyan)' }}>
                          {entry.kd_ratio}
                        </td>
                      </>
                    )}
                    {category === 'planets' && (
                      <>
                        <td style={{ padding: '10px', textAlign: 'right', color: 'var(--neon-green)' }}>
                          {entry.planet_count}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', color: 'var(--neon-cyan)' }}>
                          {formatNumber(Number(entry.total_colonists || 0))}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
