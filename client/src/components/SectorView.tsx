import { useState, useEffect } from 'react';
import PortTradingPanel from './PortTradingPanel';

interface Warp {
  destination: number;
  isTwoWay: boolean;
}

interface Player {
  id: number;
  corpName: string;
  shipType: string;
  alignment: number;
  fighters: number;
  username: string;
}

interface Planet {
  id: number;
  name: string;
  ownerId: number | null;
  ownerName: string | null;
}

interface Sector {
  sectorNumber: number;
  name: string | null;
  portType: string | null;
  hasPort: boolean;
  portClass: number;
  hasPlanet: boolean;
  hasBeacon: boolean;
  fightersCount: number;
  minesCount: number;
  warps: Warp[];
  players: Player[];
  planets: Planet[];
}

interface PlayerData {
  id: number;
  credits: number;
  turnsRemaining: number;
  shipHoldsMax: number;
  cargoFuel: number;
  cargoOrganics: number;
  cargoEquipment: number;
}

interface SectorViewProps {
  currentSector: number;
  token: string;
  currentPlayerId: number;
  player: PlayerData;
  onSectorChange: (player: any) => void;
}

export default function SectorView({ currentSector, token, currentPlayerId, player, onSectorChange }: SectorViewProps) {
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [showTrading, setShowTrading] = useState(false);

  useEffect(() => {
    loadSectorDetails();
  }, [currentSector]);

  const loadSectorDetails = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`http://localhost:3000/api/sectors/${currentSector}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setSector(data.sector);
      } else {
        setError(data.error || 'Failed to load sector');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const moveToSector = async (destination: number) => {
    if (moving) return;

    setMoving(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3000/api/sectors/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          destinationSector: destination,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Update parent with new player data
        onSectorChange(data.player);
      } else {
        setError(data.error || 'Failed to move');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setMoving(false);
    }
  };

  if (loading) {
    return (
      <div className="cyberpunk-panel">
        <div className="panel-header">► SECTOR SCAN</div>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neon-cyan)' }}>
          ⟳ SCANNING SECTOR {currentSector}...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cyberpunk-panel">
        <div className="panel-header">► SECTOR SCAN</div>
        <div className="error-message" style={{ margin: '20px' }}>
          ✗ {error}
        </div>
        <button onClick={loadSectorDetails} className="cyberpunk-button" style={{ margin: '0 20px 20px' }}>
          ⟳ RETRY SCAN
        </button>
      </div>
    );
  }

  if (!sector) return null;

  // Port ASCII art based on type
  const getPortArt = (portType: string) => {
    const portChars: { [key: string]: string } = {
      'BBS': '[$]', // Buys fuel, equipment, organics
      'BSB': '[¥]', // Buys fuel, organics, sells equipment
      'SBB': '[€]', // Sells fuel, buys equipment, organics
      'SSB': '[£]', // Sells fuel, equipment, buys organics
      'SBS': '[₿]', // Sells fuel, buys equipment, sells organics
      'BSS': '[₽]', // Buys fuel, sells equipment, organics
      'SSS': '[◊]', // Sells all
      'BBB': '[■]', // Buys all
    };
    return portChars[portType] || '[?]';
  };

  return (
    <div className="cyberpunk-panel">
      <div className="panel-header">
        ► SECTOR {sector.sectorNumber} {sector.name ? `- ${sector.name.toUpperCase()}` : ''}
      </div>

      <div style={{ padding: '20px' }}>
        {/* ASCII Art Sector Visualization */}
        <div style={{
          background: 'rgba(0, 255, 255, 0.05)',
          border: '1px solid var(--neon-cyan)',
          padding: '20px',
          marginBottom: '20px',
          fontFamily: 'monospace',
          fontSize: '14px',
          lineHeight: '1.4'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '15px' }}>
            <div style={{ color: 'var(--neon-cyan)', fontSize: '12px', marginBottom: '5px' }}>
              ═══════════ SECTOR SCAN ═══════════
            </div>
            <div style={{ color: 'var(--neon-green)', fontSize: '20px', letterSpacing: '4px' }}>
              {sector.hasPort ? getPortArt(sector.portType!) : sector.hasPlanet ? '(◉)' : '[ ]'}
            </div>
            <div style={{ color: 'var(--neon-cyan)', fontSize: '12px', marginTop: '5px' }}>
              Sector {sector.sectorNumber}
            </div>
          </div>

          {/* Ship ASCII */}
          <div style={{ textAlign: 'center', margin: '15px 0', color: 'var(--neon-yellow)' }}>
            <div style={{ fontSize: '16px' }}>&gt;===&gt;</div>
            <div style={{ fontSize: '10px', marginTop: '3px' }}>YOUR SHIP</div>
          </div>

          {/* Warp connections visual */}
          {sector.warps.length > 0 && (
            <div style={{ marginTop: '15px', color: 'var(--neon-green)', fontSize: '12px' }}>
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                ─── WARP CONNECTIONS ───
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                gap: '8px',
                justifyItems: 'center'
              }}>
                {sector.warps.map((warp, idx) => (
                  <div key={idx} style={{ color: 'var(--neon-cyan)' }}>
                    [{warp.destination}]
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sector Details */}
        <div style={{ marginBottom: '20px' }}>
          {sector.hasPort && (
            <div style={{
              padding: '15px',
              background: 'rgba(0, 255, 0, 0.05)',
              border: '1px solid var(--neon-green)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-green)', fontWeight: 'bold', marginBottom: '8px' }}>
                ► TRADING PORT DETECTED
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                <div>Type: {sector.portType}</div>
                <div>Class: {sector.portClass}</div>
                <div style={{ marginTop: '5px', fontSize: '12px', opacity: 0.7 }}>
                  B=Buys, S=Sells • Order: Fuel, Organics, Equipment
                </div>
              </div>
              <button
                onClick={() => setShowTrading(true)}
                className="cyberpunk-button"
                style={{
                  marginTop: '12px',
                  width: '100%',
                  background: 'rgba(0, 255, 0, 0.2)',
                  borderColor: 'var(--neon-green)',
                  color: 'var(--neon-green)',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                ► DOCK AT PORT
              </button>
            </div>
          )}

          {sector.planets && sector.planets.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(138, 43, 226, 0.05)',
              border: '1px solid var(--neon-purple)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-purple)', fontWeight: 'bold', marginBottom: '10px' }}>
                ► PLANETS IN SECTOR ({sector.planets.length})
              </div>
              {sector.planets.map(planet => (
                <div key={planet.id} style={{
                  padding: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  marginBottom: '5px',
                  fontSize: '13px',
                  color: 'var(--text-primary)'
                }}>
                  <div style={{ color: 'var(--neon-purple)' }}>
                    {planet.name}
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.8 }}>
                    {planet.ownerName ? `Owner: ${planet.ownerName}` : 'Unclaimed'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sector.hasBeacon && (
            <div style={{
              padding: '10px',
              background: 'rgba(255, 255, 0, 0.05)',
              border: '1px solid var(--neon-yellow)',
              marginBottom: '15px',
              color: 'var(--neon-yellow)',
              fontSize: '13px'
            }}>
              ► Navigation Beacon Active
            </div>
          )}

          {sector.fightersCount > 0 && (
            <div style={{
              padding: '10px',
              background: 'rgba(255, 20, 147, 0.05)',
              border: '1px solid var(--neon-pink)',
              marginBottom: '15px',
              color: 'var(--neon-pink)',
              fontSize: '13px'
            }}>
              ⚠ {sector.fightersCount} Deployed Fighters
            </div>
          )}

          {sector.minesCount > 0 && (
            <div style={{
              padding: '10px',
              background: 'rgba(255, 20, 147, 0.05)',
              border: '1px solid var(--neon-pink)',
              marginBottom: '15px',
              color: 'var(--neon-pink)',
              fontSize: '13px'
            }}>
              ⚠ {sector.minesCount} Space Mines
            </div>
          )}

          {sector.players.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(255, 20, 147, 0.05)',
              border: '1px solid var(--neon-pink)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', marginBottom: '10px' }}>
                ► SHIPS IN SECTOR ({sector.players.length})
              </div>
              {sector.players.map(p => (
                <div key={p.id} style={{
                  padding: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  marginBottom: '5px',
                  fontSize: '13px',
                  color: 'var(--text-primary)'
                }}>
                  <div style={{ color: 'var(--neon-cyan)' }}>
                    {p.corpName}{p.id === currentPlayerId && <span style={{ color: 'var(--neon-green)', marginLeft: '8px' }}>(me)</span>}
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.8 }}>
                    {p.shipType.toUpperCase()} • Pilot: {p.username}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Movement Options */}
        {sector.warps.length > 0 && (
          <div>
            <div style={{
              color: 'var(--neon-green)',
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '10px'
            }}>
              ► Available Warps
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '10px'
            }}>
              {sector.warps.map((warp, idx) => (
                <button
                  key={idx}
                  onClick={() => moveToSector(warp.destination)}
                  disabled={moving}
                  className="cyberpunk-button"
                  style={{
                    background: 'rgba(0, 255, 0, 0.1)',
                    borderColor: 'var(--neon-green)',
                    color: 'var(--neon-green)',
                    padding: '12px'
                  }}
                >
                  {moving ? '⟳' : '►'} SECTOR {warp.destination}
                </button>
              ))}
            </div>
          </div>
        )}

        {moving && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid var(--neon-cyan)',
            textAlign: 'center',
            color: 'var(--neon-cyan)'
          }}>
            ⟳ ENGAGING WARP DRIVE...
          </div>
        )}
      </div>

      {/* Port Trading Panel */}
      {showTrading && sector?.hasPort && (
        <PortTradingPanel
          sectorNumber={currentSector}
          token={token}
          player={{
            credits: player.credits,
            cargoFuel: player.cargoFuel,
            cargoOrganics: player.cargoOrganics,
            cargoEquipment: player.cargoEquipment,
            turnsRemaining: player.turnsRemaining,
            shipHoldsMax: player.shipHoldsMax,
          }}
          onTradeComplete={(updatedPlayer) => {
            onSectorChange({
              ...player,
              id: player.id,
              credits: updatedPlayer.credits,
              turnsRemaining: updatedPlayer.turnsRemaining,
              cargoFuel: updatedPlayer.cargoFuel,
              cargoOrganics: updatedPlayer.cargoOrganics,
              cargoEquipment: updatedPlayer.cargoEquipment,
            });
          }}
          onClose={() => setShowTrading(false)}
        />
      )}
    </div>
  );
}
