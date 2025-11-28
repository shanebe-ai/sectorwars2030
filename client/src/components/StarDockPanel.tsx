import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface Ship {
  id: number;
  name: string;
  displayName: string;
  holds: number;
  fightersMax: number;
  shieldsMax: number;
  minesMax: number;
  genesisMax: number;
  cost: number;
  netCost: number;
  description: string;
  canAfford: boolean;
  isCurrentShip: boolean;
}

interface StardockInfo {
  sectorNumber: number;
  name: string;
  ships: Ship[];
  fighterPrice: number;
  shieldPrice: number;
  tradeInValue: number;
  player: {
    credits: number;
    currentShip: string;
    fighters: number;
    fightersMax: number;
    shields: number;
    shieldsMax: number;
  };
}

interface StarDockPanelProps {
  sectorNumber: number;
  token: string;
  onClose: () => void;
  onPurchase: (updatedPlayer: any) => void;
}

export default function StarDockPanel({ sectorNumber, token, onClose, onPurchase }: StarDockPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stardock, setStardock] = useState<StardockInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'ships' | 'equipment'>('ships');
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState('');
  const [fighterQty, setFighterQty] = useState(0);
  const [shieldQty, setShieldQty] = useState(0);

  useEffect(() => {
    loadStardockInfo();
  }, [sectorNumber]);

  const loadStardockInfo = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/stardock`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setStardock(data);
      } else {
        setError(data.error || 'Failed to load StarDock');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const purchaseShip = async (shipName: string) => {
    try {
      setPurchasing(true);
      setMessage('');
      const response = await fetch(`${API_URL}/api/stardock/ship`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ shipName })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        loadStardockInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase ship');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const purchaseFighters = async () => {
    if (fighterQty <= 0) return;
    try {
      setPurchasing(true);
      setMessage('');
      const response = await fetch(`${API_URL}/api/stardock/fighters`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quantity: fighterQty })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setFighterQty(0);
        loadStardockInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase fighters');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const purchaseShields = async () => {
    if (shieldQty <= 0) return;
    try {
      setPurchasing(true);
      setMessage('');
      const response = await fetch(`${API_URL}/api/stardock/shields`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quantity: shieldQty })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setShieldQty(0);
        loadStardockInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase shields');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  };

  const panelStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(20, 20, 40, 0.98) 0%, rgba(10, 10, 30, 0.98) 100%)',
    border: '2px solid var(--neon-cyan)',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: '25px',
    boxShadow: '0 0 40px rgba(0, 255, 255, 0.3), inset 0 0 60px rgba(0, 255, 255, 0.05)'
  };

  if (loading) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-cyan)' }}>
            Loading StarDock...
          </div>
        </div>
      </div>
    );
  }

  if (error && !stardock) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-pink)' }}>
            {error}
          </div>
          <button onClick={onClose} className="cyberpunk-button" style={{ width: '100%', marginTop: '20px' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!stardock) return null;

  const maxFighters = stardock.player.fightersMax - stardock.player.fighters;
  const maxShields = stardock.player.shieldsMax - stardock.player.shields;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--neon-cyan)',
          paddingBottom: '15px',
          marginBottom: '20px'
        }}>
          <div>
            <h2 style={{ color: 'var(--neon-cyan)', margin: 0, fontFamily: 'monospace' }}>
              🚀 {stardock.name || 'STARDOCK'}
            </h2>
            <div style={{ color: 'rgba(0, 255, 255, 0.7)', fontSize: '12px', marginTop: '5px' }}>
              Sector {stardock.sectorNumber} • Ships, Fighters & Shields
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 100, 0, 0.2)',
              border: '1px solid #ff6400',
              color: '#ff6400',
              padding: '8px 20px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontWeight: 'bold'
            }}
          >
            ✕ UNDOCK
          </button>
        </div>

        {/* Player Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '10px',
          marginBottom: '20px',
          padding: '15px',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(0, 255, 255, 0.2)'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>CREDITS</div>
            <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
              ₡{stardock.player.credits.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>SHIP</div>
            <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {stardock.player.currentShip}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>TRADE-IN VALUE</div>
            <div style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>
              ₡{stardock.tradeInValue.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>FIGHTERS</div>
            <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold' }}>
              {stardock.player.fighters}/{stardock.player.fightersMax}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>SHIELDS</div>
            <div style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>
              {stardock.player.shields}/{stardock.player.shieldsMax}
            </div>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div style={{
            padding: '10px 15px',
            background: 'rgba(0, 255, 0, 0.1)',
            border: '1px solid var(--neon-green)',
            color: 'var(--neon-green)',
            marginBottom: '15px',
            fontSize: '13px'
          }}>
            ✓ {message}
          </div>
        )}
        {error && (
          <div style={{
            padding: '10px 15px',
            background: 'rgba(255, 0, 100, 0.1)',
            border: '1px solid var(--neon-pink)',
            color: 'var(--neon-pink)',
            marginBottom: '15px',
            fontSize: '13px'
          }}>
            ✕ {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {(['ships', 'equipment'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 25px',
                background: activeTab === tab ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                border: `1px solid ${activeTab === tab ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.3)'}`,
                color: activeTab === tab ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.6)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}
            >
              {tab === 'ships' ? '🚀 Ships' : '⚔️ Equipment'}
            </button>
          ))}
        </div>

        {/* Ships Tab */}
        {activeTab === 'ships' && (
          <div style={{ display: 'grid', gap: '15px' }}>
            {stardock.ships.map(ship => (
              <div
                key={ship.id}
                style={{
                  padding: '15px',
                  background: ship.isCurrentShip ? 'rgba(0, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${ship.isCurrentShip ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.2)'}`,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '15px',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{
                    color: ship.isCurrentShip ? 'var(--neon-cyan)' : 'var(--text-primary)',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    marginBottom: '5px'
                  }}>
                    {ship.displayName}
                    {ship.isCurrentShip && (
                      <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--neon-green)' }}>
                        [CURRENT]
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                    {ship.description}
                  </div>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                    <span>📦 Holds: <strong>{ship.holds}</strong></span>
                    <span>⚔️ Fighters: <strong>{ship.fightersMax}</strong></span>
                    <span>🛡️ Shields: <strong>{ship.shieldsMax}</strong></span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: '150px' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>
                    List: ₡{ship.cost.toLocaleString()}
                  </div>
                  <div style={{
                    color: ship.canAfford ? 'var(--neon-green)' : 'var(--neon-pink)',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    marginBottom: '10px'
                  }}>
                    {ship.isCurrentShip ? 'OWNED' : (
                      <>
                        Net: ₡{ship.netCost.toLocaleString()}
                        {ship.netCost < ship.cost && (
                          <div style={{ fontSize: '10px', color: 'var(--neon-green)' }}>
                            (Save ₡{(ship.cost - ship.netCost).toLocaleString()})
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => purchaseShip(ship.name)}
                    disabled={purchasing || ship.isCurrentShip || !ship.canAfford}
                    style={{
                      padding: '8px 20px',
                      background: ship.isCurrentShip ? 'rgba(100, 100, 100, 0.3)' :
                        ship.canAfford ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 100, 0.2)',
                      border: `1px solid ${ship.isCurrentShip ? '#666' :
                        ship.canAfford ? 'var(--neon-green)' : 'var(--neon-pink)'}`,
                      color: ship.isCurrentShip ? '#666' :
                        ship.canAfford ? 'var(--neon-green)' : 'var(--neon-pink)',
                      cursor: ship.isCurrentShip || !ship.canAfford ? 'not-allowed' : 'pointer',
                      fontFamily: 'monospace',
                      fontWeight: 'bold'
                    }}
                  >
                    {ship.isCurrentShip ? 'CURRENT' : ship.canAfford ? 'TRADE IN & BUY' : 'INSUFFICIENT'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Equipment Tab */}
        {activeTab === 'equipment' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Fighters */}
            <div style={{
              padding: '20px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 20, 147, 0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px'
              }}>
                <div>
                  <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', fontSize: '16px' }}>
                    ⚔️ FIGHTERS
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    Combat drones for attack and defense
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                    ₡{stardock.fighterPrice}/each
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    Space: {maxFighters} available
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="number"
                  value={fighterQty || ''}
                  onChange={e => setFighterQty(Math.max(0, Math.min(maxFighters, parseInt(e.target.value) || 0)))}
                  placeholder="Quantity..."
                  min="0"
                  max={maxFighters}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-pink)',
                    color: 'var(--neon-pink)',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  onClick={() => setFighterQty(Math.min(maxFighters, Math.floor(stardock.player.credits / stardock.fighterPrice)))}
                  style={{
                    padding: '10px 15px',
                    background: 'rgba(255, 20, 147, 0.2)',
                    border: '1px solid var(--neon-pink)',
                    color: 'var(--neon-pink)',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}
                >
                  MAX
                </button>
                <button
                  onClick={purchaseFighters}
                  disabled={purchasing || fighterQty <= 0}
                  style={{
                    padding: '10px 20px',
                    background: fighterQty > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${fighterQty > 0 ? 'var(--neon-green)' : '#666'}`,
                    color: fighterQty > 0 ? 'var(--neon-green)' : '#666',
                    cursor: fighterQty > 0 ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontWeight: 'bold'
                  }}
                >
                  BUY (₡{(fighterQty * stardock.fighterPrice).toLocaleString()})
                </button>
              </div>
            </div>

            {/* Shields */}
            <div style={{
              padding: '20px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(0, 255, 0, 0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px'
              }}>
                <div>
                  <div style={{ color: 'var(--neon-green)', fontWeight: 'bold', fontSize: '16px' }}>
                    🛡️ SHIELDS
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    Defensive barriers to absorb damage
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                    ₡{stardock.shieldPrice}/each
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    Space: {maxShields} available
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="number"
                  value={shieldQty || ''}
                  onChange={e => setShieldQty(Math.max(0, Math.min(maxShields, parseInt(e.target.value) || 0)))}
                  placeholder="Quantity..."
                  min="0"
                  max={maxShields}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  onClick={() => setShieldQty(Math.min(maxShields, Math.floor(stardock.player.credits / stardock.shieldPrice)))}
                  style={{
                    padding: '10px 15px',
                    background: 'rgba(0, 255, 0, 0.2)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}
                >
                  MAX
                </button>
                <button
                  onClick={purchaseShields}
                  disabled={purchasing || shieldQty <= 0}
                  style={{
                    padding: '10px 20px',
                    background: shieldQty > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${shieldQty > 0 ? 'var(--neon-green)' : '#666'}`,
                    color: shieldQty > 0 ? 'var(--neon-green)' : '#666',
                    cursor: shieldQty > 0 ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontWeight: 'bold'
                  }}
                >
                  BUY (₡{(shieldQty * stardock.shieldPrice).toLocaleString()})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

