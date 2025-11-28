import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface CitadelInfo {
  level: number;
  name: string;
  cost: number;
  description: string;
  features: string[];
}

interface Planet {
  id: number;
  universeId: number;
  sectorId: number;
  sectorNumber: number;
  name: string;
  ownerId: number | null;
  ownerName: string | null;
  colonists: number;
  fighters: number;
  ore: number;
  fuel: number;
  organics: number;
  equipment: number;
  credits: number;
  productionType: 'fuel' | 'organics' | 'equipment' | 'balanced';
  citadelLevel: number;
  lastProduction: string;
  createdAt: string;
  isClaimable: boolean;
  citadelInfo: CitadelInfo;
  nextCitadelUpgrade: CitadelInfo | null;
}

interface Player {
  id: number;
  credits: number;
  turnsRemaining: number;
  fuel: number;
  organics: number;
  equipment: number;
  colonists: number;
  ship_holds_max: number;
  fighters: number;
  ship_fighters_max: number;
}

interface PlanetManagementPanelProps {
  planetId: number;
  player: Player;
  token: string;
  onClose: () => void;
  onPlayerUpdate: (player: any) => void;
}

export default function PlanetManagementPanel({ 
  planetId, 
  player, 
  token, 
  onClose,
  onPlayerUpdate 
}: PlanetManagementPanelProps) {
  const [planet, setPlanet] = useState<Planet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'resources' | 'colonists' | 'fighters' | 'citadel'>('overview');
  
  // Input states
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedResource, setSelectedResource] = useState<'fuel' | 'organics' | 'equipment'>('fuel');

  const fetchPlanet = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/planets/${planetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPlanet(data);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to load planet');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanet();
  }, [planetId]);

  const handleClaim = async () => {
    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/claim`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        setPlanet(data.planet);
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleSetProduction = async (productionType: string) => {
    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/production`, {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ productionType })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        fetchPlanet();
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleDepositColonists = async () => {
    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/colonists/deposit`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        setDepositAmount('');
        fetchPlanet();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onPlayerUpdate(playerData.player);
        }
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleWithdrawResources = async () => {
    const amount = parseInt(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/resources/withdraw`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resource: selectedResource, amount })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        setWithdrawAmount('');
        fetchPlanet();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onPlayerUpdate(playerData.player);
        }
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleDepositResources = async () => {
    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/resources/deposit`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resource: selectedResource, amount })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        setDepositAmount('');
        fetchPlanet();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onPlayerUpdate(playerData.player);
        }
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleDepositFighters = async () => {
    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/fighters/deposit`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        setDepositAmount('');
        fetchPlanet();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onPlayerUpdate(playerData.player);
        }
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleWithdrawFighters = async () => {
    const amount = parseInt(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/fighters/withdraw`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        setWithdrawAmount('');
        fetchPlanet();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onPlayerUpdate(playerData.player);
        }
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleUpgradeCitadel = async () => {
    try {
      const response = await fetch(`${API_URL}/api/planets/${planetId}/citadel/upgrade`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        fetchPlanet();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onPlayerUpdate(playerData.player);
        }
        setError('');
      } else {
        setError(data.error);
        setSuccess('');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-cyan)' }}>
            ⟳ Loading planet data...
          </div>
        </div>
      </div>
    );
  }

  if (!planet) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-pink)' }}>
            {error || 'Planet not found'}
          </div>
          <button onClick={onClose} className="cyberpunk-button" style={{ width: '100%', marginTop: '20px' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const isOwner = planet.ownerId === player.id;
  const canManage = isOwner;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: '700px',
          background: 'linear-gradient(135deg, rgba(0, 20, 0, 0.98), rgba(0, 40, 20, 0.95))',
          border: '2px solid var(--neon-green)',
          boxShadow: '0 0 30px rgba(0, 255, 0, 0.3)'
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: '1px solid var(--neon-green)',
          paddingBottom: '15px',
          marginBottom: '20px'
        }}>
          <div>
            <h2 style={{ color: 'var(--neon-green)', margin: 0, fontFamily: 'monospace' }}>
              🌍 {planet.name}
            </h2>
            <div style={{ color: 'rgba(0, 255, 0, 0.7)', fontSize: '12px', marginTop: '5px' }}>
              Sector {planet.sectorNumber} • {planet.ownerName ? `Owner: ${planet.ownerName}` : 'Unclaimed'}
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--neon-pink)',
              color: 'var(--neon-pink)',
              padding: '5px 15px',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div style={{
            background: 'rgba(255, 0, 100, 0.2)',
            border: '1px solid var(--neon-pink)',
            padding: '10px',
            marginBottom: '15px',
            color: 'var(--neon-pink)',
            fontFamily: 'monospace'
          }}>
            ⚠ {error}
          </div>
        )}
        {success && (
          <div style={{
            background: 'rgba(0, 255, 0, 0.2)',
            border: '1px solid var(--neon-green)',
            padding: '10px',
            marginBottom: '15px',
            color: 'var(--neon-green)',
            fontFamily: 'monospace'
          }}>
            ✓ {success}
          </div>
        )}

        {/* Claim Button for unclaimed planets */}
        {planet.isClaimable && !isOwner && (
          <button
            onClick={handleClaim}
            className="cyberpunk-button"
            style={{
              width: '100%',
              padding: '15px',
              marginBottom: '20px',
              background: 'rgba(0, 255, 0, 0.2)',
              borderColor: 'var(--neon-green)',
              color: 'var(--neon-green)',
              fontSize: '16px'
            }}
          >
            🚀 CLAIM THIS PLANET
          </button>
        )}

        {/* Tabs */}
        {canManage && (
          <div style={{ 
            display: 'flex', 
            gap: '5px', 
            marginBottom: '20px',
            flexWrap: 'wrap'
          }}>
            {(['overview', 'resources', 'colonists', 'fighters', 'citadel'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setDepositAmount('');
                  setWithdrawAmount('');
                  setError('');
                  setSuccess('');
                }}
                style={{
                  padding: '8px 16px',
                  background: activeTab === tab ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)',
                  border: `1px solid ${activeTab === tab ? 'var(--neon-green)' : 'rgba(0, 255, 0, 0.3)'}`,
                  color: activeTab === tab ? 'var(--neon-green)' : 'rgba(0, 255, 0, 0.7)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  fontSize: '12px'
                }}
              >
                {tab === 'overview' && '📊'} 
                {tab === 'resources' && '📦'} 
                {tab === 'colonists' && '👥'} 
                {tab === 'fighters' && '✈️'} 
                {tab === 'citadel' && '🏰'} 
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Overview Tab */}
        {(activeTab === 'overview' || !canManage) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div style={{ 
              background: 'rgba(0, 0, 0, 0.5)', 
              border: '1px solid rgba(0, 255, 0, 0.3)',
              padding: '15px'
            }}>
              <h3 style={{ color: 'var(--neon-cyan)', margin: '0 0 10px 0', fontSize: '14px' }}>
                📊 STATISTICS
              </h3>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--neon-green)' }}>
                <div>Colonists: {planet.colonists.toLocaleString()}</div>
                <div>Fighters: {planet.fighters.toLocaleString()}</div>
                <div>Treasury: ₡{planet.credits.toLocaleString()}</div>
                <div>Production: {planet.productionType.toUpperCase()}</div>
              </div>
            </div>
            
            <div style={{ 
              background: 'rgba(0, 0, 0, 0.5)', 
              border: '1px solid rgba(0, 255, 0, 0.3)',
              padding: '15px'
            }}>
              <h3 style={{ color: 'var(--neon-cyan)', margin: '0 0 10px 0', fontSize: '14px' }}>
                📦 RESOURCES
              </h3>
              <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                <div style={{ color: '#FFA500' }}>⛽ Fuel: {planet.fuel.toLocaleString()}</div>
                <div style={{ color: '#00FF00' }}>🌿 Organics: {planet.organics.toLocaleString()}</div>
                <div style={{ color: '#00BFFF' }}>⚙️ Equipment: {planet.equipment.toLocaleString()}</div>
              </div>
            </div>
            
            <div style={{ 
              background: 'rgba(0, 0, 0, 0.5)', 
              border: '1px solid rgba(0, 255, 0, 0.3)',
              padding: '15px',
              gridColumn: '1 / -1'
            }}>
              <h3 style={{ color: 'var(--neon-cyan)', margin: '0 0 10px 0', fontSize: '14px' }}>
                🏰 CITADEL
              </h3>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--neon-green)' }}>
                <div>Level: {planet.citadelLevel} - {planet.citadelInfo.name}</div>
                <div style={{ marginTop: '5px', color: 'rgba(0, 255, 0, 0.7)' }}>
                  {planet.citadelInfo.description}
                </div>
                {planet.citadelInfo.features.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    Features: {planet.citadelInfo.features.join(', ')}
                  </div>
                )}
              </div>
            </div>

            {/* Production Type Selector (owner only) */}
            {canManage && (
              <div style={{ 
                background: 'rgba(0, 0, 0, 0.5)', 
                border: '1px solid rgba(0, 255, 0, 0.3)',
                padding: '15px',
                gridColumn: '1 / -1'
              }}>
                <h3 style={{ color: 'var(--neon-cyan)', margin: '0 0 10px 0', fontSize: '14px' }}>
                  🏭 PRODUCTION TYPE
                </h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {(['fuel', 'organics', 'equipment', 'balanced'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => handleSetProduction(type)}
                      style={{
                        padding: '8px 16px',
                        background: planet.productionType === type ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)',
                        border: `1px solid ${planet.productionType === type ? 'var(--neon-green)' : 'rgba(0, 255, 0, 0.3)'}`,
                        color: planet.productionType === type ? 'var(--neon-green)' : 'rgba(0, 255, 0, 0.7)',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resources Tab */}
        {activeTab === 'resources' && canManage && (
          <div style={{ display: 'grid', gap: '15px' }}>
            <div style={{ 
              background: 'rgba(0, 0, 0, 0.5)', 
              border: '1px solid rgba(0, 255, 0, 0.3)',
              padding: '15px'
            }}>
              <h3 style={{ color: 'var(--neon-cyan)', margin: '0 0 15px 0', fontSize: '14px' }}>
                SELECT RESOURCE
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['fuel', 'organics', 'equipment'] as const).map(res => (
                  <button
                    key={res}
                    onClick={() => setSelectedResource(res)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: selectedResource === res ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)',
                      border: `1px solid ${selectedResource === res ? 'var(--neon-green)' : 'rgba(0, 255, 0, 0.3)'}`,
                      color: selectedResource === res ? 'var(--neon-green)' : 'rgba(0, 255, 0, 0.7)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase'
                    }}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ 
                background: 'rgba(0, 0, 0, 0.5)', 
                border: '1px solid rgba(0, 255, 0, 0.3)',
                padding: '15px'
              }}>
                <h4 style={{ color: 'var(--neon-green)', margin: '0 0 10px 0' }}>
                  DEPOSIT FROM SHIP
                </h4>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', marginBottom: '10px', color: 'rgba(0, 255, 0, 0.7)' }}>
                  Ship has: {(player as any)[selectedResource] || 0} {selectedResource}
                </div>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  placeholder="Amount..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    fontFamily: 'monospace',
                    marginBottom: '10px'
                  }}
                />
                <button
                  onClick={handleDepositResources}
                  className="cyberpunk-button"
                  style={{ width: '100%' }}
                >
                  ▼ DEPOSIT
                </button>
              </div>

              <div style={{ 
                background: 'rgba(0, 0, 0, 0.5)', 
                border: '1px solid rgba(0, 255, 0, 0.3)',
                padding: '15px'
              }}>
                <h4 style={{ color: 'var(--neon-green)', margin: '0 0 10px 0' }}>
                  WITHDRAW TO SHIP
                </h4>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', marginBottom: '10px', color: 'rgba(0, 255, 0, 0.7)' }}>
                  Planet has: {(planet as any)[selectedResource] || 0} {selectedResource}
                </div>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  placeholder="Amount..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    fontFamily: 'monospace',
                    marginBottom: '10px'
                  }}
                />
                <button
                  onClick={handleWithdrawResources}
                  className="cyberpunk-button"
                  style={{ width: '100%' }}
                >
                  ▲ WITHDRAW
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Colonists Tab */}
        {activeTab === 'colonists' && canManage && (
          <div style={{ 
            background: 'rgba(0, 0, 0, 0.5)', 
            border: '1px solid rgba(0, 255, 0, 0.3)',
            padding: '15px'
          }}>
            <h3 style={{ color: 'var(--neon-cyan)', margin: '0 0 15px 0', fontSize: '14px' }}>
              👥 COLONIST MANAGEMENT
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '15px' }}>
              <div style={{ fontFamily: 'monospace' }}>
                <div style={{ color: 'rgba(0, 255, 0, 0.7)', fontSize: '12px' }}>On Ship:</div>
                <div style={{ color: 'var(--neon-green)', fontSize: '20px' }}>
                  {player.colonists?.toLocaleString() || 0}
                </div>
              </div>
              <div style={{ fontFamily: 'monospace' }}>
                <div style={{ color: 'rgba(0, 255, 0, 0.7)', fontSize: '12px' }}>On Planet:</div>
                <div style={{ color: 'var(--neon-green)', fontSize: '20px' }}>
                  {planet.colonists.toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <input
                type="number"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                placeholder="Amount to deposit..."
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'rgba(0, 0, 0, 0.8)',
                  border: '1px solid var(--neon-green)',
                  color: 'var(--neon-green)',
                  fontFamily: 'monospace',
                  marginBottom: '10px'
                }}
              />
              <button
                onClick={handleDepositColonists}
                className="cyberpunk-button"
                style={{ width: '100%' }}
              >
                ▼ DEPOSIT COLONISTS TO PLANET
              </button>
            </div>

            <div style={{ 
              background: 'rgba(0, 255, 0, 0.1)', 
              padding: '10px', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: 'rgba(0, 255, 0, 0.8)'
            }}>
              💡 More colonists = more resource production! Buy colonists at trading ports.
            </div>
          </div>
        )}

        {/* Fighters Tab */}
        {activeTab === 'fighters' && canManage && (
          <div style={{ display: 'grid', gap: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ 
                background: 'rgba(0, 0, 0, 0.5)', 
                border: '1px solid rgba(0, 255, 0, 0.3)',
                padding: '15px'
              }}>
                <h4 style={{ color: 'var(--neon-green)', margin: '0 0 10px 0' }}>
                  DEPLOY TO PLANET
                </h4>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', marginBottom: '10px', color: 'rgba(0, 255, 0, 0.7)' }}>
                  Ship fighters: {player.fighters || 0}
                </div>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  placeholder="Amount..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    fontFamily: 'monospace',
                    marginBottom: '10px'
                  }}
                />
                <button
                  onClick={handleDepositFighters}
                  className="cyberpunk-button"
                  style={{ width: '100%' }}
                >
                  ▼ DEPLOY FIGHTERS
                </button>
              </div>

              <div style={{ 
                background: 'rgba(0, 0, 0, 0.5)', 
                border: '1px solid rgba(0, 255, 0, 0.3)',
                padding: '15px'
              }}>
                <h4 style={{ color: 'var(--neon-green)', margin: '0 0 10px 0' }}>
                  RETRIEVE FROM PLANET
                </h4>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', marginBottom: '10px', color: 'rgba(0, 255, 0, 0.7)' }}>
                  Planet fighters: {planet.fighters.toLocaleString()}
                </div>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  placeholder="Amount..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    fontFamily: 'monospace',
                    marginBottom: '10px'
                  }}
                />
                <button
                  onClick={handleWithdrawFighters}
                  className="cyberpunk-button"
                  style={{ width: '100%' }}
                >
                  ▲ RETRIEVE FIGHTERS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Citadel Tab */}
        {activeTab === 'citadel' && canManage && (
          <div style={{ 
            background: 'rgba(0, 0, 0, 0.5)', 
            border: '1px solid rgba(0, 255, 0, 0.3)',
            padding: '15px'
          }}>
            <h3 style={{ color: 'var(--neon-cyan)', margin: '0 0 15px 0', fontSize: '14px' }}>
              🏰 CITADEL DEFENSES
            </h3>

            <div style={{ 
              background: 'rgba(0, 255, 0, 0.1)', 
              padding: '15px',
              marginBottom: '20px',
              fontFamily: 'monospace'
            }}>
              <div style={{ color: 'var(--neon-green)', fontSize: '18px', marginBottom: '5px' }}>
                Level {planet.citadelLevel}: {planet.citadelInfo.name}
              </div>
              <div style={{ color: 'rgba(0, 255, 0, 0.7)', fontSize: '13px' }}>
                {planet.citadelInfo.description}
              </div>
              {planet.citadelInfo.features.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '12px' }}>
                  <div style={{ color: 'var(--neon-cyan)' }}>Active Features:</div>
                  <ul style={{ margin: '5px 0', paddingLeft: '20px', color: 'var(--neon-green)' }}>
                    {planet.citadelInfo.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {planet.nextCitadelUpgrade ? (
              <div>
                <div style={{ 
                  fontFamily: 'monospace', 
                  marginBottom: '15px',
                  color: 'rgba(0, 255, 0, 0.8)'
                }}>
                  <div style={{ marginBottom: '5px' }}>
                    Next Level: <span style={{ color: 'var(--neon-cyan)' }}>{planet.nextCitadelUpgrade.name}</span>
                  </div>
                  <div style={{ marginBottom: '5px' }}>
                    Cost: <span style={{ color: 'var(--neon-yellow)' }}>₡{planet.nextCitadelUpgrade.cost.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(0, 255, 0, 0.6)' }}>
                    {planet.nextCitadelUpgrade.description}
                  </div>
                </div>
                <button
                  onClick={handleUpgradeCitadel}
                  className="cyberpunk-button"
                  style={{ 
                    width: '100%',
                    padding: '12px',
                    background: player.credits >= planet.nextCitadelUpgrade.cost 
                      ? 'rgba(0, 255, 0, 0.2)' 
                      : 'rgba(100, 100, 100, 0.2)',
                    borderColor: player.credits >= planet.nextCitadelUpgrade.cost 
                      ? 'var(--neon-green)' 
                      : 'gray',
                    color: player.credits >= planet.nextCitadelUpgrade.cost 
                      ? 'var(--neon-green)' 
                      : 'gray'
                  }}
                  disabled={player.credits < planet.nextCitadelUpgrade.cost}
                >
                  ⬆ UPGRADE CITADEL (₡{planet.nextCitadelUpgrade.cost.toLocaleString()})
                </button>
                {player.credits < planet.nextCitadelUpgrade.cost && (
                  <div style={{ 
                    marginTop: '10px', 
                    color: 'var(--neon-pink)', 
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    textAlign: 'center'
                  }}>
                    Insufficient credits (need ₡{(planet.nextCitadelUpgrade.cost - player.credits).toLocaleString()} more)
                  </div>
                )}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                color: 'var(--neon-cyan)',
                fontFamily: 'monospace',
                padding: '20px'
              }}>
                🏆 MAXIMUM CITADEL LEVEL ACHIEVED
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

