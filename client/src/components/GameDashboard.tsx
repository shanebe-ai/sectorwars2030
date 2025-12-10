import { useState, useEffect } from 'react';
import SectorView from './SectorView';
import MessagingPanel from './MessagingPanel';
import ShipLogPanel from './ShipLogPanel';
import CorporationPanel from './CorporationPanel';
import LeaderboardPanel from './LeaderboardPanel';
import CombatNotification from './CombatNotification';
import { API_URL } from '../config/api';
import { useSocketNotifications } from '../hooks/useSocketNotifications';

interface GameDashboardProps {
  player: any;
  token: string;
  onLogout: () => void;
}

export default function GameDashboard({ player: initialPlayer, token, onLogout }: GameDashboardProps) {
  const [player, setPlayer] = useState(initialPlayer);
  const [showMessaging, setShowMessaging] = useState(false);
  const [showShipLog, setShowShipLog] = useState(false);
  const [showCorporation, setShowCorporation] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadLogCount, setUnreadLogCount] = useState(0);
  const [loginNotification, setLoginNotification] = useState<any>(null);
  const [sectorRefreshKey, setSectorRefreshKey] = useState(0);

  // Fetch unread message and log counts
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

  // WebSocket notifications for sector events
  const { notifications, combatNotification, dismissNotification, dismissCombatNotification } = useSocketNotifications({
    universeId: player?.universeId || null,
    sectorNumber: player?.currentSector || null,
    playerId: player?.id || null,
    enabled: !!player,
    onNewBroadcast: fetchUnreadCounts,
    onSectorActivity: () => {
      // Increment refresh key to trigger sector reload
      setSectorRefreshKey(prev => prev + 1);
    }
  });

  // Check for escape pod notification on mount
  useEffect(() => {
    const checkPlayerStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.notification) {
            setLoginNotification(data.notification);
            // Auto-dismiss after 15 seconds
            setTimeout(() => setLoginNotification(null), 15000);
          }
          // Update player data
          if (data.player) {
            setPlayer(data.player);
          }
        }
      } catch (err) {
        console.error('Error checking player status:', err);
      }
    };
    checkPlayerStatus();
  }, []);

  // Fetch unread message and log counts on mount
  useEffect(() => {
    fetchUnreadCounts();
  }, [token]);

  const handleSectorChange = (updatedPlayer: any) => {
    // Merge with existing player state to preserve all fields
    setPlayer((prevPlayer: any) => ({
      ...prevPlayer,
      ...updatedPlayer
    }));
  };
  return (
    <div className="cyberpunk-container">
      {/* Login Notification (Escape Pod Alert) */}
      {loginNotification && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
          background: 'rgba(255, 50, 50, 0.98)',
          border: '3px solid var(--neon-pink)',
          padding: '30px',
          maxWidth: '600px',
          boxShadow: '0 0 40px rgba(255, 20, 147, 0.8)',
          animation: 'pulse 2s infinite'
        }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setLoginNotification(null)}
              style={{
                position: 'absolute',
                top: '-15px',
                right: '-15px',
                background: 'var(--neon-pink)',
                color: '#000',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ✕
            </button>
            <h2 style={{ color: '#fff', marginTop: 0, textShadow: '0 0 10px #fff' }}>
              {loginNotification.title}
            </h2>
            <p style={{ color: '#fff', fontSize: '16px', lineHeight: '1.6' }}>
              {loginNotification.message}
            </p>
            <p style={{ color: '#ffcccc', fontSize: '12px', marginTop: '15px' }}>
              Time: {new Date(loginNotification.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Real-time Sector Notifications */}
      {notifications.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '400px'
        }}>
          {notifications.map(notification => (
            <div
              key={notification.id}
              style={{
                padding: '12px 40px 12px 15px',
                background: notification.type === 'combat_occurred' 
                  ? 'rgba(255, 20, 147, 0.95)' 
                  : notification.type === 'ship_entered'
                  ? 'rgba(255, 200, 0, 0.95)'
                  : notification.type === 'escape_pod_arrived'
                  ? 'rgba(255, 100, 0, 0.95)'
                  : notification.type === 'beacon_message'
                  ? 'rgba(0, 200, 255, 0.95)'
                  : 'rgba(0, 200, 200, 0.95)',
                border: `2px solid ${
                  notification.type === 'combat_occurred' 
                    ? 'var(--neon-pink)' 
                    : notification.type === 'ship_entered'
                    ? 'var(--neon-yellow)'
                    : notification.type === 'beacon_message'
                    ? 'var(--neon-cyan)'
                    : 'var(--neon-cyan)'
                }`,
                color: '#000',
                fontSize: '13px',
                fontWeight: 'bold',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                animation: 'slideIn 0.3s ease-out',
                position: 'relative'
              }}
            >
              {notification.message}
              <button
                onClick={() => dismissNotification(notification.id)}
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: '16px',
                  opacity: 0.7
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

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
            <button
              onClick={() => setShowCorporation(true)}
              className="cyberpunk-button"
              style={{
                background: 'rgba(255, 215, 0, 0.1)',
                borderColor: 'var(--neon-yellow)',
                color: 'var(--neon-yellow)'
              }}
            >
              ★ CORP
            </button>
            <button
              onClick={() => setShowLeaderboard(true)}
              className="cyberpunk-button"
              style={{
                background: 'rgba(255, 215, 0, 0.1)',
                borderColor: 'var(--neon-yellow)',
                color: 'var(--neon-yellow)'
              }}
            >
              🏆 RANKINGS
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
            <div className="cargo-box" style={{ borderColor: '#9b59b6' }}>
              <div className="cargo-label" style={{ color: '#9b59b6' }}>👥 COLONISTS</div>
              <div className="cargo-value">{player.colonists || 0}</div>
            </div>
            <div className="cargo-box" style={{ borderColor: 'var(--neon-cyan)' }}>
              <div className="cargo-label" style={{ color: 'var(--neon-cyan)' }}>TOTAL USED</div>
              <div className="cargo-value">
                {(player.cargoFuel || 0) + (player.cargoOrganics || 0) + (player.cargoEquipment || 0) + (player.colonists || 0)}/{player.shipHoldsMax}
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
            shipType: player.shipType,
            shipFighters: player.shipFighters,
            shipShields: player.shipShields,
            shipMines: player.shipMines,
            shipBeacons: player.shipBeacons,
            shipGenesis: player.shipGenesis,
            shipFightersMax: player.shipFightersMax,
            shipShieldsMax: player.shipShieldsMax,
            cargoFuel: player.cargoFuel || 0,
            cargoOrganics: player.cargoOrganics || 0,
            cargoEquipment: player.cargoEquipment || 0,
            colonists: player.colonists || 0,
          }}
          onSectorChange={handleSectorChange}
          refreshKey={sectorRefreshKey}
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

      {showCorporation && (
        <CorporationPanel
          token={token}
          onClose={() => setShowCorporation(false)}
          playerId={player.id}
          corpId={player.corpId || null}
          corpName={player.corpName || ''}
          universeId={player.universeId}
        />
      )}

      {showLeaderboard && (
        <LeaderboardPanel
          universeId={player.universeId}
          token={token}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {combatNotification && (
        <CombatNotification
          notification={combatNotification}
          onClose={dismissCombatNotification}
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
