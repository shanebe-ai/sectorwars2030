import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface CommodityInfo {
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
}

interface Port {
  sectorNumber: number;
  portType: string;
  portClass: number;
  commodities: {
    fuel: CommodityInfo;
    organics: CommodityInfo;
    equipment: CommodityInfo;
  };
}

interface PlayerCargo {
  credits: number;
  cargoFuel: number;
  cargoOrganics: number;
  cargoEquipment: number;
  turnsRemaining: number;
  shipHoldsMax: number;
}

interface PortTradingPanelProps {
  sectorNumber: number;
  token: string;
  player: PlayerCargo;
  onTradeComplete: (updatedPlayer: any) => void;
  onClose: () => void;
}

export default function PortTradingPanel({
  sectorNumber,
  token,
  player: initialPlayer,
  onTradeComplete,
  onClose,
}: PortTradingPanelProps) {
  const [port, setPort] = useState<Port | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trading, setTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerCargo>(initialPlayer);
  const [quantities, setQuantities] = useState({
    fuel: 0,
    organics: 0,
    equipment: 0,
  });
  const [colonistQty, setColonistQty] = useState(0);
  const [buyingColonists, setBuyingColonists] = useState(false);

  useEffect(() => {
    loadPortInfo();
  }, [sectorNumber]);

  const loadPortInfo = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/api/ports/${sectorNumber}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setPort(data.port);
      } else {
        setError(data.error || 'Failed to load port');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const executeTrade = async (commodity: 'fuel' | 'organics' | 'equipment') => {
    if (trading || !port) return;

    const quantity = quantities[commodity];
    if (quantity <= 0) {
      setError('Enter a quantity to trade');
      return;
    }

    setTrading(true);
    setError('');
    setTradeResult(null);

    const action = port.commodities[commodity].action;

    try {
      const response = await fetch(`${API_URL}/api/ports/trade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          commodity,
          action,
          quantity,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTradeResult(
          `${action === 'buy' ? 'Bought' : 'Sold'} ${data.quantity} ${commodity} for ₡${data.totalCost.toLocaleString()} credits`
        );
        // Update port quantity
        setPort((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            commodities: {
              ...prev.commodities,
              [commodity]: {
                ...prev.commodities[commodity],
                quantity: data.portQuantityRemaining,
              },
            },
          };
        });
        // Update local player state
        setPlayer({
          credits: data.player.credits,
          cargoFuel: data.player.cargoFuel,
          cargoOrganics: data.player.cargoOrganics,
          cargoEquipment: data.player.cargoEquipment,
          turnsRemaining: data.player.turnsRemaining,
          shipHoldsMax: data.player.shipHoldsMax,
        });
        // Reset quantity input
        setQuantities((prev) => ({ ...prev, [commodity]: 0 }));
        // Update parent with new player data
        onTradeComplete(data.player);
      } else {
        setError(data.error || 'Trade failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setTrading(false);
    }
  };

  const buyColonists = async () => {
    if (buyingColonists || colonistQty <= 0) return;

    setBuyingColonists(true);
    setError('');
    setTradeResult(null);

    try {
      const response = await fetch(`${API_URL}/api/ports/colonists/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity: colonistQty }),
      });

      const data = await response.json();

      if (response.ok) {
        setTradeResult(`Purchased ${data.quantity} colonists for ₡${data.totalCost.toLocaleString()} credits`);
        setColonistQty(0);
        // Refresh player data with updated player info
        if (data.player) {
          onTradeComplete(data.player);
        }
      } else {
        setError(data.error || 'Failed to purchase colonists');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setBuyingColonists(false);
    }
  };

  const setMaxQuantity = (commodity: 'fuel' | 'organics' | 'equipment') => {
    if (!port) return;

    const info = port.commodities[commodity];
    const cargoUsed = player.cargoFuel + player.cargoOrganics + player.cargoEquipment;
    const cargoSpace = player.shipHoldsMax - cargoUsed;

    let maxQty: number;
    if (info.action === 'buy') {
      // Max we can buy: min(cargo space, port stock, what we can afford)
      const affordable = Math.floor(player.credits / info.price);
      maxQty = Math.min(cargoSpace, info.quantity, affordable);
    } else {
      // Max we can sell: our cargo of this type
      const playerCargo =
        commodity === 'fuel'
          ? player.cargoFuel
          : commodity === 'organics'
            ? player.cargoOrganics
            : player.cargoEquipment;
      maxQty = playerCargo;
    }

    setQuantities((prev) => ({ ...prev, [commodity]: Math.max(0, maxQty) }));
  };

  const cargoUsed = player.cargoFuel + player.cargoOrganics + player.cargoEquipment;

  if (loading) {
    return (
      <div className="port-trading-overlay">
        <div className="port-trading-panel">
          <div className="port-header">► PORT INTERFACE</div>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neon-cyan)' }}>
            ⟳ ESTABLISHING COMM LINK...
          </div>
        </div>
      </div>
    );
  }

  if (error && !port) {
    return (
      <div className="port-trading-overlay">
        <div className="port-trading-panel">
          <div className="port-header">► PORT INTERFACE</div>
          <div className="error-message" style={{ margin: '20px' }}>
            ✗ {error}
          </div>
          <button onClick={onClose} className="cyberpunk-button" style={{ margin: '0 20px 20px' }}>
            ◄ CLOSE
          </button>
        </div>
      </div>
    );
  }

  if (!port) return null;

  const commodities: Array<'fuel' | 'organics' | 'equipment'> = ['fuel', 'organics', 'equipment'];

  const getCommodityColor = (commodity: string) => {
    switch (commodity) {
      case 'fuel':
        return '#ff6b35';
      case 'organics':
        return '#7bed9f';
      case 'equipment':
        return '#70a1ff';
      default:
        return 'var(--neon-cyan)';
    }
  };

  const getCommodityIcon = (commodity: string) => {
    switch (commodity) {
      case 'fuel':
        return '⚡';
      case 'organics':
        return '🌿';
      case 'equipment':
        return '⚙';
      default:
        return '•';
    }
  };

  return (
    <div className="port-trading-overlay">
      <div className="port-trading-panel">
        {/* Header */}
        <div className="port-header">
          <span>► TRADING PORT [{port.portType}]</span>
          <span style={{ fontSize: '12px', opacity: 0.7 }}>SECTOR {port.sectorNumber}</span>
        </div>

        {/* Port ASCII Art */}
        <div
          style={{
            textAlign: 'center',
            padding: '20px',
            background: 'rgba(0, 0, 0, 0.5)',
            borderBottom: '1px solid var(--neon-green)',
          }}
        >
          <pre
            style={{
              color: 'var(--neon-green)',
              fontSize: '10px',
              lineHeight: '1.2',
              margin: 0,
            }}
          >
            {`
    ╔═══════════════════════╗
    ║   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   ║
    ║  ╔═══════════════╗  ║
    ║  ║ TRADING PORT  ║  ║
    ║  ║  CLASS ${String(port.portClass).padStart(2, ' ')}     ║  ║
    ║  ╚═══════════════╝  ║
    ║ ═══╤═══════════╤═══ ║
    ╚════╧═══════════╧════╝
            `}
          </pre>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            B=Port Buys (you sell) • S=Port Sells (you buy)
          </div>
        </div>

        {/* Player Status Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            padding: '15px',
            background: 'rgba(0, 255, 255, 0.05)',
            borderBottom: '1px solid var(--neon-cyan)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--neon-green)', marginBottom: '4px' }}>
              CREDITS
            </div>
            <div style={{ fontSize: '18px', color: 'var(--neon-yellow)' }}>
              ₡{player.credits.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--neon-green)', marginBottom: '4px' }}>
              CARGO
            </div>
            <div style={{ fontSize: '18px', color: 'var(--neon-cyan)' }}>
              {cargoUsed}/{player.shipHoldsMax}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--neon-green)', marginBottom: '4px' }}>
              TURNS
            </div>
            <div style={{ fontSize: '18px', color: 'var(--neon-purple)' }}>
              {player.turnsRemaining}
            </div>
          </div>
        </div>

        {/* Trade Result */}
        {tradeResult && (
          <div
            style={{
              padding: '10px 20px',
              background: 'rgba(0, 255, 0, 0.1)',
              borderBottom: '1px solid var(--neon-green)',
              color: 'var(--neon-green)',
              textAlign: 'center',
              fontSize: '14px',
            }}
          >
            ✓ {tradeResult}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              padding: '10px 20px',
              background: 'rgba(255, 20, 147, 0.1)',
              borderBottom: '1px solid var(--neon-pink)',
              color: 'var(--neon-pink)',
              textAlign: 'center',
              fontSize: '14px',
            }}
          >
            ✗ {error}
          </div>
        )}

        {/* Commodities */}
        <div style={{ padding: '20px' }}>
          {commodities.map((commodity) => {
            const info = port.commodities[commodity];
            const playerCargo =
              commodity === 'fuel'
                ? player.cargoFuel
                : commodity === 'organics'
                  ? player.cargoOrganics
                  : player.cargoEquipment;

            return (
              <div
                key={commodity}
                style={{
                  marginBottom: '20px',
                  padding: '15px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${getCommodityColor(commodity)}`,
                }}
              >
                {/* Commodity Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: '16px',
                        color: getCommodityColor(commodity),
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                      }}
                    >
                      {getCommodityIcon(commodity)} {commodity}
                    </span>
                    <span
                      style={{
                        marginLeft: '10px',
                        padding: '2px 8px',
                        background:
                          info.action === 'buy'
                            ? 'rgba(0, 255, 0, 0.2)'
                            : 'rgba(255, 255, 0, 0.2)',
                        color: info.action === 'buy' ? 'var(--neon-green)' : 'var(--neon-yellow)',
                        fontSize: '11px',
                        borderRadius: '3px',
                      }}
                    >
                      {info.action === 'buy' ? 'YOU BUY' : 'YOU SELL'}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    ₡{info.price} credits/unit
                  </div>
                </div>

                {/* Stats */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginBottom: '12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>Port Stock: {info.quantity.toLocaleString()}</span>
                  <span>Your Cargo: {playerCargo}</span>
                </div>

                {/* Trade Controls */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    value={quantities[commodity]}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [commodity]: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: `1px solid ${getCommodityColor(commodity)}`,
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      textAlign: 'center',
                    }}
                    placeholder="Quantity"
                  />
                  <button
                    onClick={() => setMaxQuantity(commodity)}
                    style={{
                      padding: '10px 15px',
                      background: 'rgba(0, 255, 255, 0.1)',
                      border: '1px solid var(--neon-cyan)',
                      color: 'var(--neon-cyan)',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    MAX
                  </button>
                  <button
                    onClick={() => executeTrade(commodity)}
                    disabled={trading || quantities[commodity] <= 0}
                    style={{
                      padding: '10px 20px',
                      background:
                        info.action === 'buy'
                          ? 'rgba(0, 255, 0, 0.2)'
                          : 'rgba(255, 255, 0, 0.2)',
                      border: `1px solid ${info.action === 'buy' ? 'var(--neon-green)' : 'var(--neon-yellow)'}`,
                      color: info.action === 'buy' ? 'var(--neon-green)' : 'var(--neon-yellow)',
                      cursor: trading || quantities[commodity] <= 0 ? 'not-allowed' : 'pointer',
                      opacity: trading || quantities[commodity] <= 0 ? 0.5 : 1,
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {trading ? '⟳' : info.action === 'buy' ? '► BUY' : '► SELL'}
                  </button>
                </div>

                {/* Cost Preview */}
                {quantities[commodity] > 0 && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      textAlign: 'center',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Total:{' '}
                    <span style={{ color: 'var(--neon-yellow)' }}>
                      ₡{(quantities[commodity] * info.price).toLocaleString()} credits
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Colonist Purchasing - Only at trading ports (not StarDocks) */}
        {port.portType !== 'STARDOCK' && (
          <div style={{ 
            padding: '15px 20px',
            borderTop: '1px solid rgba(138, 43, 226, 0.3)',
            background: 'rgba(138, 43, 226, 0.05)'
          }}>
            <div style={{ 
              color: 'var(--neon-purple)', 
              fontWeight: 'bold', 
              marginBottom: '10px',
              fontSize: '14px'
            }}>
              👥 COLONIST RECRUITMENT
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: 'rgba(138, 43, 226, 0.8)', 
              marginBottom: '10px' 
            }}>
              Recruit colonists to transport to your planets. Price: ₡100 each
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="number"
                value={colonistQty || ''}
                onChange={(e) => setColonistQty(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="Quantity..."
                min="0"
                max="1000"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid var(--neon-purple)',
                  color: 'var(--neon-purple)',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                }}
              />
              <button
                onClick={() => {
                  const affordable = Math.floor(player.credits / 100);
                  const spaceAvailable = player.shipHoldsMax - cargoUsed;
                  setColonistQty(Math.min(1000, affordable, spaceAvailable));
                }}
                className="cyberpunk-button"
                style={{
                  padding: '8px 12px',
                  background: 'rgba(138, 43, 226, 0.2)',
                  borderColor: 'var(--neon-purple)',
                  color: 'var(--neon-purple)',
                  fontSize: '12px',
                }}
              >
                MAX
              </button>
              <button
                onClick={buyColonists}
                disabled={buyingColonists || colonistQty <= 0}
                className="cyberpunk-button"
                style={{
                  padding: '8px 16px',
                  background: 'rgba(138, 43, 226, 0.2)',
                  borderColor: 'var(--neon-purple)',
                  color: 'var(--neon-purple)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                {buyingColonists ? '⟳' : '► RECRUIT'}
              </button>
            </div>
            {colonistQty > 0 && (
              <div style={{ 
                marginTop: '8px', 
                fontSize: '12px', 
                color: 'var(--neon-yellow)',
                textAlign: 'center'
              }}>
                Cost: ₡{(colonistQty * 100).toLocaleString()} credits
              </div>
            )}
          </div>
        )}

        {/* Close Button */}
        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={onClose}
            className="cyberpunk-button"
            style={{
              width: '100%',
              background: 'rgba(255, 20, 147, 0.1)',
              borderColor: 'var(--neon-pink)',
              color: 'var(--neon-pink)',
            }}
          >
            ◄ UNDOCK FROM PORT
          </button>
        </div>
      </div>

      <style>{`
        .port-trading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .port-trading-panel {
          background: #0a0a0a;
          border: 2px solid var(--neon-green);
          max-width: 600px;
          width: 95%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
        }

        .port-header {
          background: rgba(0, 255, 0, 0.1);
          padding: 15px 20px;
          border-bottom: 1px solid var(--neon-green);
          color: var(--neon-green);
          font-weight: bold;
          font-size: 16px;
          text-transform: uppercase;
          letter-spacing: 2px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .port-trading-panel input:focus {
          outline: none;
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }

        .port-trading-panel button:hover:not(:disabled) {
          filter: brightness(1.2);
        }
      `}</style>
    </div>
  );
}

