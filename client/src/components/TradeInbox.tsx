/**
 * Trade Inbox Component
 *
 * Displays incoming trade offers where the player is the recipient.
 * Allows accepting, robbing, or rejecting offers.
 */

import React, { useState, useEffect } from 'react';
import type { PlayerTradeOffer } from '../../../shared/types';

interface TradeInboxProps {
  playerId: number;
  currentSectorId: number;
  playerCredits: number;
  playerCargo: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  token: string;
  onTradeComplete: (updatedPlayer: any) => void;
  onClose: () => void;
}

const TradeInbox: React.FC<TradeInboxProps> = ({
  playerId,
  currentSectorId,
  playerCredits,
  playerCargo,
  token,
  onTradeComplete,
  onClose,
}) => {
  const [offers, setOffers] = useState<PlayerTradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [combatResult, setCombatResult] = useState<any | null>(null);

  const loadOffers = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`http://localhost:3000/api/player-trading/inbox/${playerId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setOffers(data.offers);
      } else {
        setError(data.error || 'Failed to load inbox');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOffers();
    // Refresh every 30 seconds
    const interval = setInterval(loadOffers, 30000);
    return () => clearInterval(interval);
  }, [playerId]);

  const formatExpiry = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();

    if (diff < 0) return 'EXPIRED';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const acceptOffer = async (offerId: number) => {
    setProcessing(offerId);
    setError('');
    setResult(null);
    setCombatResult(null);

    try {
      const response = await fetch(`http://localhost:3000/api/player-trading/accept/${offerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ playerId }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data.message);
        if (data.player) {
          onTradeComplete(data.player);
        }
        await loadOffers();
      } else {
        setError(data.error || 'Failed to accept trade');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const attemptRobbery = async (offerId: number) => {
    if (!confirm('Robbery: 25% success rate, 75% triggers combat. Corporation members CANNOT rob each other. Continue?')) {
      return;
    }

    setProcessing(offerId);
    setError('');
    setResult(null);
    setCombatResult(null);

    try {
      const response = await fetch(`http://localhost:3000/api/player-trading/rob/${offerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ playerId }),
      });

      const data = await response.json();

      if (data.outcome === 'robbery_success') {
        setResult(data.message);
        if (data.player) {
          onTradeComplete(data.player);
        }
      } else if (data.outcome === 'robbery_combat') {
        setResult(data.message);
        setCombatResult(data.combatResult);
      } else {
        setError(data.error || data.message);
      }

      await loadOffers();
    } catch (err) {
      setError('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const rejectOffer = async (offerId: number) => {
    if (!confirm('Reject this trade offer?')) {
      return;
    }

    setProcessing(offerId);
    setError('');
    setResult(null);

    try {
      const response = await fetch(`http://localhost:3000/api/player-trading/cancel/${offerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ playerId }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult('Trade offer rejected');
        await loadOffers();
      } else {
        setError(data.error || 'Failed to reject offer');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#000',
          border: '2px solid #00ffff',
          borderRadius: '8px',
          padding: '30px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#00ff00',
          fontFamily: 'Courier New, monospace',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#00ffff', margin: 0 }}>Trade Inbox</h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#444',
              border: '1px solid #888',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'Courier New, monospace',
            }}
          >
            Close
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px',
              marginBottom: '20px',
              backgroundColor: '#400',
              border: '1px solid #ff0000',
              borderRadius: '4px',
              color: '#ff0000',
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div
            style={{
              padding: '10px',
              marginBottom: '20px',
              backgroundColor: '#040',
              border: '1px solid #00ff00',
              borderRadius: '4px',
              color: '#00ff00',
            }}
          >
            {result}
          </div>
        )}

        {combatResult && (
          <div
            style={{
              padding: '10px',
              marginBottom: '20px',
              backgroundColor: '#440',
              border: '1px solid #ff6600',
              borderRadius: '4px',
              color: '#ff6600',
            }}
          >
            <strong>Combat Result:</strong> {combatResult.message || 'Combat occurred'}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#00ffff' }}>
            Loading offers...
          </div>
        ) : offers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            No incoming trade offers
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {offers.map((offer) => {
              const sameSector = offer.sector_id === currentSectorId;
              const canAfford =
                offer.initiator_requests_fuel <= playerCargo.fuel &&
                offer.initiator_requests_organics <= playerCargo.organics &&
                offer.initiator_requests_equipment <= playerCargo.equipment &&
                offer.initiator_requests_credits <= playerCredits;

              return (
                <div
                  key={offer.id}
                  style={{
                    border: '1px solid #00ffff',
                    borderRadius: '4px',
                    padding: '15px',
                    backgroundColor: '#001111',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <strong style={{ color: '#ffff00' }}>From: {offer.initiator_name}</strong>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        Sector: {offer.sector_name} {!sameSector && <span style={{ color: '#ff6600' }}>(DIFFERENT SECTOR!)</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px', color: '#888' }}>
                      Expires: <span style={{ color: '#00ffff' }}>{formatExpiry(offer.expires_at)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ color: '#ffff00', marginBottom: '5px', fontWeight: 'bold' }}>They Offer:</div>
                      {offer.initiator_offers_fuel > 0 && <div>Fuel: {offer.initiator_offers_fuel}</div>}
                      {offer.initiator_offers_organics > 0 && <div>Organics: {offer.initiator_offers_organics}</div>}
                      {offer.initiator_offers_equipment > 0 && <div>Equipment: {offer.initiator_offers_equipment}</div>}
                      {offer.initiator_offers_credits > 0 && <div>Credits: {offer.initiator_offers_credits.toLocaleString()}</div>}
                    </div>

                    <div>
                      <div style={{ color: '#00ffff', marginBottom: '5px', fontWeight: 'bold' }}>They Want:</div>
                      {offer.initiator_requests_fuel > 0 && (
                        <div style={{ color: offer.initiator_requests_fuel <= playerCargo.fuel ? '#00ff00' : '#ff0000' }}>
                          Fuel: {offer.initiator_requests_fuel}
                        </div>
                      )}
                      {offer.initiator_requests_organics > 0 && (
                        <div style={{ color: offer.initiator_requests_organics <= playerCargo.organics ? '#00ff00' : '#ff0000' }}>
                          Organics: {offer.initiator_requests_organics}
                        </div>
                      )}
                      {offer.initiator_requests_equipment > 0 && (
                        <div style={{ color: offer.initiator_requests_equipment <= playerCargo.equipment ? '#00ff00' : '#ff0000' }}>
                          Equipment: {offer.initiator_requests_equipment}
                        </div>
                      )}
                      {offer.initiator_requests_credits > 0 && (
                        <div style={{ color: offer.initiator_requests_credits <= playerCredits ? '#00ff00' : '#ff0000' }}>
                          Credits: {offer.initiator_requests_credits.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {offer.message && (
                    <div
                      style={{
                        padding: '10px',
                        marginBottom: '10px',
                        backgroundColor: '#111',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        fontStyle: 'italic',
                        color: '#888',
                      }}
                    >
                      "{offer.message}"
                    </div>
                  )}

                  {!sameSector && (
                    <div style={{ padding: '10px', marginBottom: '10px', backgroundColor: '#440', color: '#ff6600' }}>
                      WARNING: Players must be in the same sector to complete trade
                    </div>
                  )}

                  {!canAfford && sameSector && (
                    <div style={{ padding: '10px', marginBottom: '10px', backgroundColor: '#400', color: '#ff0000' }}>
                      You don't have the requested resources
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => rejectOffer(offer.id)}
                      disabled={processing === offer.id}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#440',
                        border: '1px solid #ff6600',
                        borderRadius: '4px',
                        color: '#ff6600',
                        cursor: processing === offer.id ? 'not-allowed' : 'pointer',
                        fontFamily: 'Courier New, monospace',
                      }}
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => attemptRobbery(offer.id)}
                      disabled={processing === offer.id || !sameSector}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#440',
                        border: '1px solid #9d00ff',
                        borderRadius: '4px',
                        color: '#9d00ff',
                        cursor: processing === offer.id || !sameSector ? 'not-allowed' : 'pointer',
                        fontFamily: 'Courier New, monospace',
                      }}
                    >
                      Rob (25%)
                    </button>
                    <button
                      onClick={() => acceptOffer(offer.id)}
                      disabled={processing === offer.id || !canAfford || !sameSector}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: canAfford && sameSector && processing !== offer.id ? '#004400' : '#222',
                        border: `1px solid ${canAfford && sameSector && processing !== offer.id ? '#00ff00' : '#444'}`,
                        borderRadius: '4px',
                        color: canAfford && sameSector && processing !== offer.id ? '#00ff00' : '#666',
                        cursor: canAfford && sameSector && processing !== offer.id ? 'pointer' : 'not-allowed',
                        fontFamily: 'Courier New, monospace',
                      }}
                    >
                      Accept
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeInbox;
