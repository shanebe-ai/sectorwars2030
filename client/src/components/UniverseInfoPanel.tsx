import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface UniverseInfoPanelProps {
  universeId: number;
  token: string;
  onClose: () => void;
}

export default function UniverseInfoPanel({ universeId, token, onClose }: UniverseInfoPanelProps) {
  const [universe, setUniverse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUniverseInfo();
  }, []);

  const loadUniverseInfo = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${API_URL}/api/universes/${universeId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUniverse(data.universe);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load universe info');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  // Calculate TerraSpace size (2% of sectors, minimum 10)
  const terraSpaceSize = universe ? Math.max(10, Math.floor(universe.max_sectors * 0.02)) : 10;

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
        border: '2px solid var(--neon-purple)',
        boxShadow: '0 0 30px rgba(147, 51, 234, 0.5)',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--neon-purple)',
          background: 'rgba(147, 51, 234, 0.05)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, color: 'var(--neon-purple)', fontSize: '20px' }}>
              ℹ UNIVERSE INFORMATION
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--neon-purple)',
                color: 'var(--neon-purple)',
                padding: '5px 15px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          padding: '30px',
          overflowY: 'auto',
          flex: 1
        }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--neon-purple)', padding: '40px' }}>
              Loading universe information...
            </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(255, 50, 50, 0.1)',
              border: '1px solid var(--neon-pink)',
              color: 'var(--neon-pink)',
              padding: '15px',
              marginBottom: '20px'
            }}>
              ⚠ {error}
            </div>
          )}

          {universe && !loading && (
            <div style={{ color: 'var(--text-primary)' }}>
              {/* Universe Name */}
              <div style={{
                marginBottom: '30px',
                textAlign: 'center'
              }}>
                <h1 style={{
                  color: 'var(--neon-purple)',
                  fontSize: '32px',
                  margin: '0 0 10px 0',
                  textTransform: 'uppercase',
                  letterSpacing: '3px',
                  textShadow: '0 0 10px rgba(147, 51, 234, 0.8)'
                }}>
                  {universe.name}
                </h1>
                {universe.description && (
                  <p style={{
                    color: 'var(--neon-cyan)',
                    fontSize: '14px',
                    margin: 0,
                    fontStyle: 'italic'
                  }}>
                    "{universe.description}"
                  </p>
                )}
              </div>

              {/* Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px',
                marginBottom: '30px'
              }}>
                <div style={{
                  background: 'rgba(147, 51, 234, 0.1)',
                  border: '1px solid var(--neon-purple)',
                  padding: '15px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--neon-green)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '8px'
                  }}>
                    Total Sectors
                  </div>
                  <div style={{
                    fontSize: '28px',
                    color: 'var(--neon-purple)',
                    fontWeight: 'bold'
                  }}>
                    {universe.stats?.total_sectors?.toLocaleString() || universe.max_sectors.toLocaleString()}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(0, 255, 255, 0.1)',
                  border: '1px solid var(--neon-cyan)',
                  padding: '15px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--neon-green)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '8px'
                  }}>
                    Active Players
                  </div>
                  <div style={{
                    fontSize: '28px',
                    color: 'var(--neon-cyan)',
                    fontWeight: 'bold'
                  }}>
                    {universe.stats?.players_count || 0} / {universe.max_players}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(0, 255, 0, 0.1)',
                  border: '1px solid var(--neon-green)',
                  padding: '15px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--neon-green)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '8px'
                  }}>
                    Turns Per Day
                  </div>
                  <div style={{
                    fontSize: '28px',
                    color: 'var(--neon-green)',
                    fontWeight: 'bold'
                  }}>
                    {universe.turns_per_day.toLocaleString()}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255, 215, 0, 0.1)',
                  border: '1px solid var(--neon-yellow)',
                  padding: '15px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--neon-green)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '8px'
                  }}>
                    Trading Ports
                  </div>
                  <div style={{
                    fontSize: '28px',
                    color: 'var(--neon-yellow)',
                    fontWeight: 'bold'
                  }}>
                    {universe.stats?.ports_count || 0}
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--neon-purple)',
                padding: '20px'
              }}>
                <h3 style={{
                  color: 'var(--neon-purple)',
                  fontSize: '16px',
                  marginTop: 0,
                  marginBottom: '15px',
                  textTransform: 'uppercase',
                  letterSpacing: '2px'
                }}>
                  ► Universe Details
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--neon-cyan)' }}>TerraSpace Safe Zone:</span>
                    <span style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>
                      Sectors 1 - {terraSpaceSize}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--neon-cyan)' }}>Starting Credits:</span>
                    <span style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>
                      ₡{universe.starting_credits.toLocaleString()}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--neon-cyan)' }}>Starting Ship:</span>
                    <span style={{ color: 'var(--neon-green)', fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {universe.starting_ship_type}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--neon-cyan)' }}>Dead-End Sectors:</span>
                    <span style={{ color: universe.allow_dead_ends ? 'var(--neon-yellow)' : 'var(--text-secondary)', fontWeight: 'bold' }}>
                      {universe.allow_dead_ends ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--neon-cyan)' }}>Created:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {new Date(universe.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div style={{
                marginTop: '20px',
                padding: '15px',
                background: 'rgba(147, 51, 234, 0.05)',
                border: '1px solid var(--neon-purple)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.6'
              }}>
                <strong style={{ color: 'var(--neon-purple)' }}>TIP:</strong> The TerraSpace safe zone
                protects new players from aggressive aliens. Explore sectors beyond TerraSpace to
                find trading opportunities, planets to colonize, and strategic territory to control.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
