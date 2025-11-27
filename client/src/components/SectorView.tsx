import { useState, useEffect } from 'react';
import PortTradingPanel from './PortTradingPanel';
import { API_URL } from '../config/api';

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
  const [previousSector, setPreviousSector] = useState<number | null>(() => {
    const stored = localStorage.getItem(`previousSector_${player.id}`);
    return stored ? parseInt(stored) : null;
  });
  const [visitedSectors, setVisitedSectors] = useState<Set<number>>(() => {
    const stored = localStorage.getItem(`visitedSectors_${player.id}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [misfireAlert, setMisfireAlert] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    loadSectorDetails();
    // Mark current sector as visited
    setVisitedSectors(prev => {
      const newSet = new Set(prev);
      newSet.add(currentSector);
      localStorage.setItem(`visitedSectors_${player.id}`, JSON.stringify([...newSet]));
      return newSet;
    });
  }, [currentSector]);

  const loadSectorDetails = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/api/sectors/${currentSector}`, {
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

    // Track the sector we're leaving as the previous sector
    setPreviousSector(currentSector);
    localStorage.setItem(`previousSector_${player.id}`, currentSector.toString());

    setMoving(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/sectors/move`, {
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
        // Check for warp misfire
        if (data.misfired && data.misfireMessage) {
          setMisfireAlert(data.misfireMessage);
          setShaking(true);
          // Stop shaking after 3 seconds (alert stays visible until next warp)
          setTimeout(() => setShaking(false), 3000);
        } else {
          // Clear any previous misfire alert on successful warp
          setMisfireAlert(null);
        }
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
    <div className={`cyberpunk-panel ${shaking ? 'shake' : ''}`}>
      <div className="panel-header">
        ► SECTOR {sector.sectorNumber} {sector.name ? `- ${sector.name.toUpperCase()}` : ''}
      </div>

      {/* Misfire Alert */}
      {misfireAlert && (
        <div style={{
          margin: '20px 20px 0 20px',
          padding: '15px',
          background: 'rgba(255, 0, 0, 0.2)',
          border: '2px solid var(--neon-pink)',
          color: 'var(--neon-pink)',
          fontWeight: 'bold',
          fontSize: '14px',
          textAlign: 'center',
          animation: 'pulse 0.5s ease-in-out infinite alternate',
          boxShadow: '0 0 20px rgba(255, 20, 147, 0.5)'
        }}>
          {misfireAlert}
        </div>
      )}

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
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'center'
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
              {(() => {
                // Sort warps: previous sector first, then the rest
                const sortedWarps = [...sector.warps].sort((a, b) => {
                  if (a.destination === previousSector) return -1;
                  if (b.destination === previousSector) return 1;
                  return 0;
                });

                return sortedWarps.map((warp, idx) => {
                  const isVisited = visitedSectors.has(warp.destination);
                  const isPrevious = warp.destination === previousSector;

                  return (
                    <button
                      key={idx}
                      onClick={() => moveToSector(warp.destination)}
                      disabled={moving}
                      className="cyberpunk-button"
                      style={{
                        background: 'rgba(0, 255, 0, 0.1)',
                        borderColor: isVisited ? 'rgba(0, 100, 0, 0.9)' : 'var(--neon-green)',
                        borderWidth: '1px',
                        color: 'var(--neon-green)',
                        padding: '12px'
                      }}
                    >
                      {moving ? '⟳' : isPrevious ? '◄' : '►'} SECTOR {warp.destination}
                    </button>
                  );
                });
              })()}
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
          onTradeComplete={async (_updatedPlayer) => {
            // Fetch the full updated player data from server
            try {
              const response = await fetch(`${API_URL}/api/players/${player.id}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                const data = await response.json();
                onSectorChange(data.player);
              }
            } catch (err) {
              console.error('Failed to refresh player data:', err);
            }
          }}
          onClose={() => setShowTrading(false)}
        />
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-10px) translateY(-5px); }
          20% { transform: translateX(10px) translateY(5px); }
          30% { transform: translateX(-10px) translateY(-5px); }
          40% { transform: translateX(10px) translateY(5px); }
          50% { transform: translateX(-10px) translateY(-5px); }
          60% { transform: translateX(10px) translateY(5px); }
          70% { transform: translateX(-10px) translateY(-5px); }
          80% { transform: translateX(10px) translateY(5px); }
          90% { transform: translateX(-10px) translateY(-5px); }
        }

        @keyframes pulse {
          from {
            opacity: 0.8;
            box-shadow: 0 0 20px rgba(255, 20, 147, 0.5);
          }
          to {
            opacity: 1;
            box-shadow: 0 0 30px rgba(255, 20, 147, 0.8);
          }
        }

        .shake {
          animation: shake 0.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
