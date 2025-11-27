import { useState, useEffect } from 'react';
import CreateUniverseModal from './CreateUniverseModal';
import { API_URL } from '../config/api';

interface Universe {
  id: number;
  name: string;
  description: string;
  max_sectors: number;
  max_players: number;
  turns_per_day: number;
  starting_credits: number;
  starting_ship_type: string;
  is_active: boolean;
  created_at: string;
  total_sectors: string;
  ports_count: string;
  players_count: string;
}

interface UniverseDashboardProps {
  token: string;
  user: any;
  onLogout: () => void;
}

export default function UniverseDashboard({ token, user, onLogout }: UniverseDashboardProps) {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState('');

  const fetchUniverses = async () => {
    try {
      const response = await fetch(`${API_URL}/api/universes`);
      const data = await response.json();
      setUniverses(data.universes || []);
    } catch (err: any) {
      setError('Failed to load universes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUniverses();
  }, []);

  const handleDelete = async (universeId: number, name: string) => {
    if (!confirm(`Delete universe "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/universes/${universeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        fetchUniverses();
      } else {
        const data = await response.json();
        alert('Delete failed: ' + data.error);
      }
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-black)' }}>
      <div className="admin-header">
        <div className="admin-title">TradeWars 2030 - Admin Panel</div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span style={{ color: 'var(--neon-cyan)', fontSize: '14px' }}>
            ADMIN: {user.username}
          </span>
          <button onClick={onLogout} className="cyberpunk-button cyberpunk-button-danger" style={{ padding: '8px 16px' }}>
            ◄ LOGOUT
          </button>
        </div>
      </div>

      <div className="admin-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h2 style={{ color: 'var(--neon-purple)', fontSize: '28px', textTransform: 'uppercase', letterSpacing: '3px' }}>
            ► Universe Management
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="cyberpunk-button cyberpunk-button-success"
            style={{ padding: '12px 24px', fontSize: '16px' }}
          >
            + CREATE UNIVERSE
          </button>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--neon-purple)' }}>
            <span className="loading-spinner" style={{ fontSize: '48px' }}>⟳</span>
            <p style={{ marginTop: '20px' }}>LOADING UNIVERSES...</p>
          </div>
        ) : universes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">◯</div>
            <h3>No Universes Created</h3>
            <p>Create your first universe to get started</p>
          </div>
        ) : (
          <div className="universe-grid">
            {universes.map((universe) => (
              <div key={universe.id} className="universe-card">
                <div className="universe-card-header">
                  <div>
                    <div className="universe-name">{universe.name}</div>
                    <div style={{ color: 'var(--neon-purple)', fontSize: '12px', opacity: 0.7 }}>
                      {universe.description || 'No description'}
                    </div>
                  </div>
                  <div style={{
                    background: universe.is_active ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)',
                    border: `1px solid ${universe.is_active ? 'var(--neon-green)' : 'var(--neon-pink)'}`,
                    color: universe.is_active ? 'var(--neon-green)' : 'var(--neon-pink)',
                    padding: '4px 8px',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}>
                    {universe.is_active ? '● ACTIVE' : '○ INACTIVE'}
                  </div>
                </div>

                <div className="universe-stats">
                  <div className="stat-row">
                    <span className="stat-row-label">SECTORS:</span>
                    <span className="stat-row-value">{universe.total_sectors} / {universe.max_sectors}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">PORTS:</span>
                    <span className="stat-row-value">{universe.ports_count}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">PLAYERS:</span>
                    <span className="stat-row-value">{universe.players_count} / {universe.max_players}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">TURNS/DAY:</span>
                    <span className="stat-row-value">{universe.turns_per_day}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">STARTING SHIP:</span>
                    <span className="stat-row-value">{universe.starting_ship_type.toUpperCase()}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">CREATED:</span>
                    <span className="stat-row-value">{new Date(universe.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="action-buttons">
                  <button
                    onClick={() => handleDelete(universe.id, universe.name)}
                    className="cyberpunk-button cyberpunk-button-danger"
                    style={{ flex: 1, padding: '10px', fontSize: '12px' }}
                  >
                    ✗ DELETE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateUniverseModal
          token={token}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchUniverses();
          }}
        />
      )}
    </div>
  );
}
