import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface CombatRound {
  round: number;
  attackerFighters: number;
  defenderFighters: number;
  attackerShields: number;
  defenderShields: number;
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  description: string;
}

interface CombatResult {
  winner: 'attacker' | 'defender' | 'draw';
  rounds: number;
  attackerFightersLost: number;
  defenderFightersLost: number;
  attackerShieldsLost: number;
  defenderShieldsLost: number;
  defenderDestroyed: boolean;
  attackerDestroyed: boolean;
  creditsLooted: number;
  creditsLostByAttacker: number;
  cargoLooted: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  cargoLostByAttacker: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  colonistsLostAttacker: number;
  colonistsLostDefender: number;
  attackerEscapeSector: number | null;
  defenderEscapeSector: number | null;
  message: string;
  combatLog: CombatRound[];
}

interface Target {
  id: number;
  corpName: string;
  username: string;
  shipType: string;
  fighters: number;
  shields: number;
  alignment: number;
  inSafeZone: boolean;
}

interface CombatPanelProps {
  target: Target;
  token: string;
  currentPlayerId: number;
  onClose: () => void;
  onCombatComplete: (player: any) => void;
}

export default function CombatPanel({ 
  target, 
  token, 
  currentPlayerId,
  onClose, 
  onCombatComplete 
}: CombatPanelProps) {
  const [attacking, setAttacking] = useState(false);
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [error, setError] = useState('');
  const [displayedRound, setDisplayedRound] = useState(0);
  const [animating, setAnimating] = useState(false);

  // Animate through combat rounds
  useEffect(() => {
    if (combatResult && combatResult.combatLog.length > 0 && displayedRound < combatResult.combatLog.length) {
      setAnimating(true);
      const timer = setTimeout(() => {
        setDisplayedRound(prev => prev + 1);
      }, 800);
      return () => clearTimeout(timer);
    } else if (combatResult && displayedRound >= combatResult.combatLog.length) {
      setAnimating(false);
    }
  }, [combatResult, displayedRound]);

  const executeAttack = async () => {
    setAttacking(true);
    setError('');
    setCombatResult(null);
    setDisplayedRound(0);

    try {
      const response = await fetch(`${API_URL}/api/combat/attack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ targetId: target.id }),
      });

      const data = await response.json();

      if (response.ok) {
        setCombatResult(data.combat);
        onCombatComplete(data.player);
        
        // If attacker was destroyed, close panel after showing escape pod message
        if (data.combat.attackerDestroyed) {
          setTimeout(() => {
            onClose();
          }, 6000); // Show escape pod message for 6 seconds then close
        }
      } else {
        setError(data.error || 'Attack failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setAttacking(false);
    }
  };

  // Get current round stats for display
  const currentRound = combatResult?.combatLog[displayedRound - 1];
  const initialAttackerFighters = combatResult?.combatLog[0]?.attackerFighters || 0;
  const initialDefenderFighters = combatResult?.combatLog[0]?.defenderFighters || 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.95)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-primary)',
        border: '2px solid var(--neon-pink)',
        width: '90%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 0 40px rgba(255, 20, 147, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '15px 20px',
          borderBottom: '1px solid var(--neon-pink)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 20, 147, 0.1)'
        }}>
          <div style={{
            color: 'var(--neon-pink)',
            fontSize: '18px',
            fontWeight: 'bold',
            letterSpacing: '2px'
          }}>
            ⚔ COMBAT SYSTEM ⚔
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--neon-pink)',
              color: 'var(--neon-pink)',
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ✕ CLOSE
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Pre-Combat: Target Info */}
          {!combatResult && !attacking && (
            <>
              <div style={{
                textAlign: 'center',
                marginBottom: '25px'
              }}>
                <div style={{
                  color: 'var(--neon-pink)',
                  fontSize: '14px',
                  marginBottom: '15px',
                  letterSpacing: '3px'
                }}>
                  ═══ TARGET ACQUIRED ═══
                </div>

                {/* ASCII Art Ships */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                  margin: '30px 0',
                  fontFamily: 'monospace'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--neon-green)', fontSize: '24px' }}>
                      &gt;===⊃
                    </div>
                    <div style={{ color: 'var(--neon-green)', fontSize: '12px', marginTop: '5px' }}>
                      YOUR SHIP
                    </div>
                  </div>

                  <div style={{
                    color: 'var(--neon-yellow)',
                    fontSize: '24px',
                    animation: 'pulse 0.5s ease-in-out infinite alternate'
                  }}>
                    ⚡ VS ⚡
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--neon-pink)', fontSize: '24px' }}>
                      ⊂===&lt;
                    </div>
                    <div style={{ color: 'var(--neon-pink)', fontSize: '12px', marginTop: '5px' }}>
                      ENEMY SHIP
                    </div>
                  </div>
                </div>
              </div>

              {/* Target Stats */}
              <div style={{
                background: 'rgba(255, 20, 147, 0.05)',
                border: '1px solid var(--neon-pink)',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <div style={{
                  color: 'var(--neon-cyan)',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '15px'
                }}>
                  {target.corpName}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  fontSize: '14px'
                }}>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Pilot: <span style={{ color: 'var(--text-primary)' }}>{target.username}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Ship: <span style={{ color: 'var(--text-primary)' }}>{target.shipType}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Fighters: <span style={{ color: 'var(--neon-pink)' }}>{target.fighters}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Shields: <span style={{ color: 'var(--neon-cyan)' }}>{target.shields}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Alignment: <span style={{ 
                      color: target.alignment >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)' 
                    }}>{target.alignment}</span>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div style={{
                background: 'rgba(255, 255, 0, 0.05)',
                border: '1px solid var(--neon-yellow)',
                padding: '15px',
                marginBottom: '20px',
                color: 'var(--neon-yellow)',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                ⚠ WARNING: Combat costs 1 turn. If you lose, you may be destroyed!
              </div>

              {error && (
                <div style={{
                  background: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid var(--neon-pink)',
                  padding: '15px',
                  marginBottom: '20px',
                  color: 'var(--neon-pink)',
                  fontSize: '13px',
                  textAlign: 'center'
                }}>
                  ✗ {error}
                </div>
              )}

              {/* Attack Button */}
              <button
                onClick={executeAttack}
                disabled={attacking || target.inSafeZone}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: target.inSafeZone 
                    ? 'rgba(100, 100, 100, 0.2)' 
                    : 'rgba(255, 20, 147, 0.2)',
                  border: `2px solid ${target.inSafeZone ? 'gray' : 'var(--neon-pink)'}`,
                  color: target.inSafeZone ? 'gray' : 'var(--neon-pink)',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: target.inSafeZone ? 'not-allowed' : 'pointer',
                  letterSpacing: '2px'
                }}
              >
                {target.inSafeZone ? '🛡️ SAFE ZONE - COMBAT DISABLED' : '⚔ LAUNCH ATTACK ⚔'}
              </button>
            </>
          )}

          {/* Attacking Animation */}
          {attacking && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{
                fontSize: '24px',
                color: 'var(--neon-pink)',
                marginBottom: '20px',
                animation: 'pulse 0.3s ease-in-out infinite alternate'
              }}>
                ⚔ ENGAGING ENEMY ⚔
              </div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '20px',
                color: 'var(--neon-yellow)',
                animation: 'flash 0.2s ease-in-out infinite'
              }}>
                &gt;===⊃ ⚡⚡⚡ ⊂===&lt;
              </div>
              <div style={{
                marginTop: '20px',
                color: 'var(--neon-cyan)',
                fontSize: '14px'
              }}>
                Calculating combat results...
              </div>
            </div>
          )}

          {/* Combat Results */}
          {combatResult && (
            <>
              {/* Combat Animation */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--neon-cyan)',
                padding: '20px',
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                <div style={{
                  color: 'var(--neon-cyan)',
                  fontSize: '14px',
                  marginBottom: '15px',
                  letterSpacing: '2px'
                }}>
                  ═══ COMBAT LOG ═══
                </div>

                {/* ASCII Battle */}
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '18px',
                  margin: '20px 0',
                  display: 'flex',
                  justifyContent: 'space-around',
                  alignItems: 'center'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      color: combatResult.attackerDestroyed ? 'var(--neon-pink)' : 
                             combatResult.winner === 'attacker' ? 'var(--neon-green)' : 'var(--neon-yellow)',
                      fontSize: '24px'
                    }}>
                      {combatResult.attackerDestroyed ? '💥' : '&gt;===⊃'}
                    </div>
                    <div style={{ 
                      color: 'var(--neon-green)', 
                      fontSize: '12px', 
                      marginTop: '8px' 
                    }}>
                      Fighters: {currentRound?.attackerFighters ?? '...'}
                    </div>
                    <div style={{ 
                      color: 'var(--neon-cyan)', 
                      fontSize: '12px'
                    }}>
                      Shields: {currentRound?.attackerShields ?? '...'}
                    </div>
                  </div>

                  <div style={{
                    color: animating ? 'var(--neon-yellow)' : 'var(--text-secondary)',
                    fontSize: '16px'
                  }}>
                    {animating ? '⚡⚡⚡' : '---'}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      color: combatResult.defenderDestroyed ? 'var(--neon-pink)' :
                             combatResult.winner === 'defender' ? 'var(--neon-green)' : 'var(--neon-yellow)',
                      fontSize: '24px'
                    }}>
                      {combatResult.defenderDestroyed ? '💥' : '⊂===&lt;'}
                    </div>
                    <div style={{ 
                      color: 'var(--neon-pink)', 
                      fontSize: '12px', 
                      marginTop: '8px' 
                    }}>
                      Fighters: {currentRound?.defenderFighters ?? '...'}
                    </div>
                    <div style={{ 
                      color: 'var(--neon-cyan)', 
                      fontSize: '12px'
                    }}>
                      Shields: {currentRound?.defenderShields ?? '...'}
                    </div>
                  </div>
                </div>

                {/* Round Display */}
                {displayedRound > 0 && currentRound && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '10px',
                    marginTop: '15px',
                    fontSize: '12px',
                    color: 'var(--text-primary)'
                  }}>
                    <div style={{ color: 'var(--neon-yellow)', marginBottom: '5px' }}>
                      ROUND {currentRound.round}
                    </div>
                    <div>
                      You dealt <span style={{ color: 'var(--neon-green)' }}>{currentRound.attackerDamageDealt}</span> damage
                      {' • '}
                      Enemy dealt <span style={{ color: 'var(--neon-pink)' }}>{currentRound.defenderDamageDealt}</span> damage
                    </div>
                  </div>
                )}
              </div>

              {/* Final Results - Show after animation completes */}
              {!animating && (
                <>
                  {/* Victory/Defeat Banner */}
                  <div style={{
                    padding: '20px',
                    marginBottom: '20px',
                    textAlign: 'center',
                    background: combatResult.attackerDestroyed && combatResult.defenderDestroyed
                      ? 'rgba(255, 100, 0, 0.1)'
                      : combatResult.attackerDestroyed
                      ? 'rgba(255, 0, 0, 0.2)'
                      : combatResult.winner === 'attacker' 
                      ? 'rgba(0, 255, 0, 0.1)' 
                      : combatResult.winner === 'defender'
                      ? 'rgba(255, 0, 0, 0.1)'
                      : 'rgba(255, 255, 0, 0.1)',
                    border: `2px solid ${
                      combatResult.attackerDestroyed && combatResult.defenderDestroyed
                        ? 'orange'
                        : combatResult.attackerDestroyed
                        ? 'var(--neon-pink)'
                        : combatResult.winner === 'attacker' 
                        ? 'var(--neon-green)' 
                        : combatResult.winner === 'defender'
                        ? 'var(--neon-pink)'
                        : 'var(--neon-yellow)'
                    }`
                  }}>
                    <div style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: combatResult.attackerDestroyed && combatResult.defenderDestroyed
                        ? 'orange'
                        : combatResult.attackerDestroyed
                        ? 'var(--neon-pink)'
                        : combatResult.winner === 'attacker' 
                        ? 'var(--neon-green)' 
                        : combatResult.winner === 'defender'
                        ? 'var(--neon-pink)'
                        : 'var(--neon-yellow)',
                      marginBottom: '10px'
                    }}>
                      {combatResult.attackerDestroyed && combatResult.defenderDestroyed
                        ? '💥 MUTUAL DESTRUCTION 💥'
                        : combatResult.attackerDestroyed
                        ? '💀 YOU WERE DESTROYED 💀'
                        : combatResult.winner === 'attacker' 
                        ? '⚔ VICTORY! ⚔' 
                        : combatResult.winner === 'defender'
                        ? '💀 DEFEAT 💀'
                        : '⚖ DRAW ⚖'}
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                      {combatResult.message}
                    </div>
                    {combatResult.attackerDestroyed && (
                      <div style={{ 
                        color: 'var(--neon-cyan)', 
                        fontSize: '14px', 
                        marginTop: '15px',
                        fontWeight: 'bold',
                        padding: '10px',
                        background: 'rgba(0, 200, 255, 0.1)',
                        border: '1px solid var(--neon-cyan)'
                      }}>
                        🚀 ESCAPE POD DEPLOYED 🚀
                        <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 'normal' }}>
                          {combatResult.attackerEscapeSector 
                            ? `Your escape pod has warped to Sector ${combatResult.attackerEscapeSector}...`
                            : 'Your escape pod has warped to safety...'}
                        </div>
                        <div style={{ marginTop: '5px', fontSize: '11px', fontStyle: 'italic', opacity: 0.8 }}>
                          You are now in an escape pod. Upgrade your ship at a StarDock to continue.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Combat Stats */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '15px',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      background: 'rgba(0, 255, 0, 0.05)',
                      border: '1px solid var(--neon-green)',
                      padding: '15px'
                    }}>
                      <div style={{ color: 'var(--neon-green)', marginBottom: '10px', fontWeight: 'bold' }}>
                        YOUR LOSSES
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        <div>Fighters: -{combatResult.attackerFightersLost}</div>
                        <div>Shields: -{combatResult.attackerShieldsLost}</div>
                      </div>
                    </div>

                    <div style={{
                      background: 'rgba(255, 20, 147, 0.05)',
                      border: '1px solid var(--neon-pink)',
                      padding: '15px'
                    }}>
                      <div style={{ color: 'var(--neon-pink)', marginBottom: '10px', fontWeight: 'bold' }}>
                        ENEMY LOSSES
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        <div>Fighters: -{combatResult.defenderFightersLost}</div>
                        <div>Shields: -{combatResult.defenderShieldsLost}</div>
                        {combatResult.defenderDestroyed && (
                          <div style={{ color: 'var(--neon-pink)', marginTop: '5px' }}>
                            💥 SHIP DESTROYED
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Loot - Victory */}
                  {combatResult.defenderDestroyed && !combatResult.attackerDestroyed && (
                    <div style={{
                      background: 'rgba(255, 215, 0, 0.1)',
                      border: '1px solid var(--neon-yellow)',
                      padding: '15px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ color: 'var(--neon-yellow)', marginBottom: '10px', fontWeight: 'bold' }}>
                        💰 LOOT ACQUIRED
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '8px',
                        fontSize: '13px',
                        color: 'var(--text-primary)'
                      }}>
                        <div>Credits: +₡{combatResult.creditsLooted.toLocaleString()}</div>
                        <div>Fuel: +{combatResult.cargoLooted.fuel}</div>
                        <div>Organics: +{combatResult.cargoLooted.organics}</div>
                        <div>Equipment: +{combatResult.cargoLooted.equipment}</div>
                      </div>
                    </div>
                  )}

                  {/* Losses - Defeat */}
                  {combatResult.attackerDestroyed && (
                    <div style={{
                      background: 'rgba(255, 0, 0, 0.1)',
                      border: '1px solid var(--neon-pink)',
                      padding: '15px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ color: 'var(--neon-pink)', marginBottom: '10px', fontWeight: 'bold' }}>
                        💀 LOSSES
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '8px',
                        fontSize: '13px',
                        color: 'var(--text-primary)'
                      }}>
                        <div>Credits: -₡{combatResult.creditsLostByAttacker.toLocaleString()}</div>
                        <div>Fuel: -{combatResult.cargoLostByAttacker.fuel}</div>
                        <div>Organics: -{combatResult.cargoLostByAttacker.organics}</div>
                        <div>Equipment: -{combatResult.cargoLostByAttacker.equipment}</div>
                        <div style={{ gridColumn: 'span 2', color: 'var(--neon-pink)', marginTop: '5px' }}>
                          Ship destroyed • Escape Pod warped to Sector {combatResult.attackerEscapeSector}
                        </div>
                      </div>
                      {combatResult.colonistsLostAttacker > 0 && (
                        <div style={{
                          marginTop: '15px',
                          padding: '10px',
                          background: 'rgba(100, 100, 255, 0.1)',
                          border: '1px solid #6666ff',
                          color: '#aaaaff',
                          fontSize: '12px',
                          textAlign: 'center'
                        }}>
                          ❄️ {combatResult.colonistsLostAttacker} cargo holds of colonists have frozen to death in space... ❄️
                        </div>
                      )}
                    </div>
                  )}

                  {/* Colonist deaths for defender (shown to attacker as victory bonus) */}
                  {combatResult.defenderDestroyed && combatResult.colonistsLostDefender > 0 && (
                    <div style={{
                      background: 'rgba(100, 100, 255, 0.05)',
                      border: '1px solid #6666ff',
                      padding: '10px',
                      marginBottom: '20px',
                      color: '#aaaaff',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}>
                      ❄️ {combatResult.colonistsLostDefender} enemy colonists froze to death in the wreckage... ❄️
                    </div>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={onClose}
                    style={{
                      width: '100%',
                      padding: '15px',
                      background: 'rgba(0, 255, 255, 0.2)',
                      border: '2px solid var(--neon-cyan)',
                      color: 'var(--neon-cyan)',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      letterSpacing: '1px'
                    }}
                  >
                    ► RETURN TO SECTOR
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          from { opacity: 0.7; }
          to { opacity: 1; }
        }
        @keyframes flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

