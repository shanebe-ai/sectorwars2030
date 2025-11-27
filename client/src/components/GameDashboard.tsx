import { useState, useEffect } from 'react';
import SectorView from './SectorView';
import MessagingPanel from './MessagingPanel';
import ShipLogPanel from './ShipLogPanel';
import { API_URL } from '../config/api';

interface GameDashboardProps {
  player: any;
  token: string;
  onLogout: () => void;
}

export default function GameDashboard({ player: initialPlayer, token, onLogout }: GameDashboardProps) {
  const [player, setPlayer] = useState(initialPlayer);
  const [showMessaging, setShowMessaging] = useState(false);
  const [showShipLog, setShowShipLog] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadLogCount, setUnreadLogCount] = useState(0);

  // Fetch unread message and log counts on mount
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      try {
        const [messagesRes, logsRes] = await Promise.all([
          fetch(`${API_URL}/api/messages/unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API_URL}/api/shiplogs/unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);
        const messagesData = await messagesRes.json();
        const logsData = await logsRes.json();
        if (messagesRes.ok) {
          setUnreadMessageCount(messagesData.unreadCount);
        }
        if (logsRes.ok) {
          setUnreadLogCount(logsData.unreadCount);
        }
      } catch (err) {
        // Silent fail
      }
    };
    fetchUnreadCounts();
  }, [token]);

  const handleSectorChange = (updatedPlayer: any) => {
    setPlayer(updatedPlayer);
  };
  return (
    <div className="cyberpunk-container">
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px',
          borderBottom: '2px solid var(--neon-cyan)',
          marginBottom: '30px'
        }}>
          <div>
            <h1 style={{
              color: 'var(--neon-cyan)',
              fontSize: '28px',
              textTransform: 'uppercase',
              letterSpacing: '3px',
              marginBottom: '5px'
            }}>
              ► {player.corpName}
            </h1>
            <div style={{ color: 'var(--neon-green)', fontSize: '14px' }}>
              {player.shipType.toUpperCase()} • SECTOR {player.currentSector}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowShipLog(true)}
              className="cyberpunk-button"
              style={{
                background: 'rgba(0, 255, 0, 0.1)',
                borderColor: 'var(--neon-green)',
                color: 'var(--neon-green)',
                position: 'relative'
              }}
            >
              📋 LOG
              {unreadLogCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: 'var(--neon-pink)',
                  color: '#000',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}>
                  {unreadLogCount > 9 ? '9+' : unreadLogCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowMessaging(true)}
              className="cyberpunk-button"
              style={{
                background: 'rgba(0, 255, 255, 0.1)',
                borderColor: 'var(--neon-cyan)',
                color: 'var(--neon-cyan)',
                position: 'relative'
              }}
            >
              ✉ COMMS
              {unreadMessageCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: 'var(--neon-pink)',
                  color: '#000',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}>
                  {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                </span>
              )}
            </button>
            <button onClick={onLogout} className="cyberpunk-button" style={{
              background: 'rgba(255, 20, 147, 0.1)',
              borderColor: 'var(--neon-pink)',
              color: 'var(--neon-pink)'
            }}>
              ◄ LOGOUT
            </button>
          </div>
        </div>

        {/* Player Stats */}
        <div className="cyberpunk-panel" style={{ marginBottom: '30px' }}>
          <div className="panel-header">► SHIP STATUS</div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            padding: '10px 0'
          }}>
            <div className="stat-box">
              <div className="stat-box-label">CREDITS</div>
              <div className="stat-box-value">₡{player.credits.toLocaleString()}</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-label">TURNS REMAINING</div>
              <div className="stat-box-value">{player.turnsRemaining}</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-label">CARGO HOLDS</div>
              <div className="stat-box-value">{player.shipHoldsMax}</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-label">FIGHTERS</div>
              <div className="stat-box-value">{player.shipFighters}</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-label">SHIELDS</div>
              <div className="stat-box-value">{player.shipShields}</div>
            </div>
          </div>
        </div>

        {/* Cargo Display */}
        <div className="cyberpunk-panel" style={{ marginBottom: '30px' }}>
          <div className="panel-header">► CARGO MANIFEST</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px',
            padding: '10px 0'
          }}>
            <div className="cargo-box" style={{ borderColor: '#ff6b35' }}>
              <div className="cargo-label" style={{ color: '#ff6b35' }}>⚡ FUEL</div>
              <div className="cargo-value">{player.cargoFuel || 0}</div>
            </div>
            <div className="cargo-box" style={{ borderColor: '#7bed9f' }}>
              <div className="cargo-label" style={{ color: '#7bed9f' }}>🌿 ORGANICS</div>
              <div className="cargo-value">{player.cargoOrganics || 0}</div>
            </div>
            <div className="cargo-box" style={{ borderColor: '#70a1ff' }}>
              <div className="cargo-label" style={{ color: '#70a1ff' }}>⚙ EQUIPMENT</div>
              <div className="cargo-value">{player.cargoEquipment || 0}</div>
            </div>
            <div className="cargo-box" style={{ borderColor: 'var(--neon-cyan)' }}>
              <div className="cargo-label" style={{ color: 'var(--neon-cyan)' }}>TOTAL USED</div>
              <div className="cargo-value">
                {(player.cargoFuel || 0) + (player.cargoOrganics || 0) + (player.cargoEquipment || 0)}/{player.shipHoldsMax}
              </div>
            </div>
          </div>
        </div>

        {/* Sector Navigation */}
        <SectorView
          currentSector={player.currentSector}
          token={token}
          currentPlayerId={player.id}
          player={{
            id: player.id,
            credits: player.credits,
            turnsRemaining: player.turnsRemaining,
            shipHoldsMax: player.shipHoldsMax,
            cargoFuel: player.cargoFuel || 0,
            cargoOrganics: player.cargoOrganics || 0,
            cargoEquipment: player.cargoEquipment || 0,
          }}
          onSectorChange={handleSectorChange}
        />
      </div>

      {/* Messaging Panel */}
      {showMessaging && (
        <MessagingPanel
          token={token}
          onClose={() => setShowMessaging(false)}
          onUnreadCountChange={setUnreadMessageCount}
        />
      )}

      {showShipLog && (
        <ShipLogPanel
          token={token}
          onClose={() => setShowShipLog(false)}
          onUnreadCountChange={setUnreadLogCount}
        />
      )}

      <style>{`
        .stat-box {
          text-align: center;
          padding: 15px;
          background: rgba(0, 255, 255, 0.05);
          border: 1px solid var(--neon-cyan);
        }

        .stat-box-label {
          font-size: 12px;
          color: var(--neon-green);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }

        .stat-box-value {
          font-size: 24px;
          color: var(--neon-cyan);
          font-weight: bold;
        }

        .cargo-box {
          text-align: center;
          padding: 12px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--neon-cyan);
        }

        .cargo-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .cargo-value {
          font-size: 20px;
          color: var(--text-primary);
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
