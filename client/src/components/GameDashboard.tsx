import { useState } from 'react';
import SectorView from './SectorView';

interface GameDashboardProps {
  player: any;
  token: string;
  onLogout: () => void;
}

export default function GameDashboard({ player: initialPlayer, token, onLogout }: GameDashboardProps) {
  const [player, setPlayer] = useState(initialPlayer);

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
          <button onClick={onLogout} className="cyberpunk-button" style={{
            background: 'rgba(255, 20, 147, 0.1)',
            borderColor: 'var(--neon-pink)',
            color: 'var(--neon-pink)'
          }}>
            ◄ LOGOUT
          </button>
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
              <div className="stat-box-value">{player.credits.toLocaleString()}</div>
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

        {/* Sector Navigation */}
        <SectorView
          currentSector={player.currentSector}
          token={token}
          onSectorChange={handleSectorChange}
        />
      </div>

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
      `}</style>
    </div>
  );
}
