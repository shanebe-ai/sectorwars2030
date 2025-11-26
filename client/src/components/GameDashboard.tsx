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
