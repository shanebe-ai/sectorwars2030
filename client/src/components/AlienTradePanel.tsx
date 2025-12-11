/**
 * Alien Trading Panel
 * Displays active trade offers from alien ships and allows accepting, robbing, or canceling trades
 */

import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';
import type { AlienTradeOffer } from '../../../shared/types';

interface AlienTradePanelProps {
  playerId: number;
  alienShipId: number;
  alienName: string;
  alienRace: string;
  token: string;
  onTradeComplete: (updatedPlayer: any) => void;
  onClose: () => void;
}

export default function AlienTradePanel({
  playerId,
  alienShipId,
  alienName,
  alienRace,
  token,
  onTradeComplete,
  onClose,
}: AlienTradePanelProps) {
  const [offers, setOffers] = useState<AlienTradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [combatResult, setCombatResult] = useState<any | null>(null);

  useEffect(() => {
    loadOffers();
  }, [playerId]);

  const loadOffers = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/api/alien-trading/offers/${playerId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        // Filter to only show offers for this alien ship
        const alienOffers = data.offers.filter((o: AlienTradeOffer) => o.alienShipId === alienShipId);
        setOffers(alienOffers);
      } else {
        setError(data.error || 'Failed to load trade offers');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const acceptTrade = async (offerId: number) => {
    setProcessing(offerId);
    setError('');
    setResult(null);
    setCombatResult(null);

    try {
      const response = await fetch(`${API_URL}/api/alien-trading/accept/${offerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ playerId }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data.message || 'Trade completed successfully!');
        if (data.player) {
          onTradeComplete(data.player);
        }
        // Reload offers to refresh the list
        await loadOffers();
      } else {
        setError(data.error || 'Trade failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const attemptRobbery = async (offerId: number) => {
    if (!confirm('Warning: Attempting to rob an alien trader has only a 20% success rate and 80% chance of triggering combat with a penalty. Continue?')) {
      return;
    }

    setProcessing(offerId);
    setError('');
    setResult(null);
    setCombatResult(null);

    try {
      const response = await fetch(`${API_URL}/api/alien-trading/rob/${offerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ playerId }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.outcome === 'robbery_success') {
          setResult(`🎉 ${data.message}`);
          if (data.player) {
            onTradeComplete(data.player);
          }
        } else if (data.outcome === 'robbery_combat') {
          setResult(`⚔️ ${data.message}`);
          setCombatResult(data.combatResult);
          if (data.combatResult?.player) {
            onTradeComplete(data.combatResult.player);
          }
        }
        // Reload offers
        await loadOffers();
      } else {
        setError(data.error || 'Robbery attempt failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const cancelTrade = async (offerId: number) => {
    setProcessing(offerId);
    setError('');
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/alien-trading/cancel/${offerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ playerId }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult('Trade offer cancelled');
        await loadOffers();
      } else {
        setError(data.error || 'Failed to cancel trade');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const formatExpiry = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (diff < 0) return 'EXPIRED';
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1a0033 0%, #0a0015 100%)',
            border: '2px solid #9d00ff',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            color: 'var(--text-primary)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ textAlign: 'center', color: '#00ffff' }}>Loading trade offers...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1a0033 0%, #0a0015 100%)',
          border: '2px solid #9d00ff',
          padding: '30px',
          maxWidth: '700px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: 'var(--text-primary)',
          margin: '20px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#9d00ff',
              marginBottom: '10px',
            }}
          >
            👽 ALIEN TRADING - {alienName}
          </div>
          <div style={{ fontSize: '14px', color: '#00ffff' }}>
            Race: {alienRace}
          </div>
        </div>

        {/* Error/Result Messages */}
        {error && (
          <div
            style={{
              padding: '15px',
              background: 'rgba(255, 0, 0, 0.2)',
              border: '1px solid #ff0000',
              color: '#ff6666',
              marginBottom: '20px',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div
            style={{
              padding: '15px',
              background: 'rgba(0, 255, 0, 0.1)',
              border: '1px solid #00ff00',
              color: '#00ff00',
              marginBottom: '20px',
              fontSize: '14px',
            }}
          >
            {result}
          </div>
        )}

        {/* Combat Result */}
        {combatResult && (
          <div
            style={{
              padding: '15px',
              background: 'rgba(255, 0, 153, 0.1)',
              border: '2px solid #ff0099',
              marginBottom: '20px',
            }}
          >
            <div style={{ color: '#ff0099', fontWeight: 'bold', marginBottom: '10px' }}>
              ⚔️ COMBAT RESULT
            </div>
            <div style={{ fontSize: '13px' }}>
              <div style={{ color: combatResult.outcome === 'victory' ? '#00ff00' : '#ff0000', fontWeight: 'bold' }}>
                {combatResult.outcome === 'victory' ? '🎉 VICTORY!' : '💀 DEFEAT'}
              </div>
              {combatResult.log && combatResult.log.map((entry: string, i: number) => (
                <div key={i} style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade Offers */}
        {offers.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: '#999',
              fontSize: '14px',
            }}
          >
            No active trade offers from this alien.
          </div>
        ) : (
          <div>
            {offers.map((offer) => {
              const isExpired = offer.status === 'expired' || new Date(offer.expiresAt) < new Date();
              const isPending = offer.status === 'pending' && !isExpired;

              return (
                <div
                  key={offer.id}
                  style={{
                    padding: '15px',
                    background: isPending
                      ? 'rgba(157, 0, 255, 0.1)'
                      : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${isPending ? '#9d00ff' : '#666'}`,
                    marginBottom: '15px',
                    opacity: isPending ? 1 : 0.6,
                  }}
                >
                  {/* Status and Timer */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      fontSize: '12px',
                    }}
                  >
                    <div
                      style={{
                        color: isPending ? '#00ff00' : '#999',
                        fontWeight: 'bold',
                      }}
                    >
                      {offer.status.toUpperCase()}
                    </div>
                    {isPending && (
                      <div style={{ color: '#ff9900', fontWeight: 'bold' }}>
                        ⏱️ {formatExpiry(offer.expiresAt)}
                      </div>
                    )}
                  </div>

                  {/* Price Modifier Info */}
                  <div style={{ marginBottom: '10px', fontSize: '12px' }}>
                    <span style={{ color: '#00ffff' }}>Alignment Bonus:</span>{' '}
                    <span
                      style={{
                        color: offer.priceModifier < 1 ? '#00ff00' : offer.priceModifier > 1 ? '#ff0000' : '#ffffff',
                        fontWeight: 'bold',
                      }}
                    >
                      {offer.priceModifier < 1 ? '↓' : offer.priceModifier > 1 ? '↑' : '='}{' '}
                      {((1 - offer.priceModifier) * 100).toFixed(0)}%{' '}
                      {offer.priceModifier < 1 ? 'better' : offer.priceModifier > 1 ? 'worse' : 'neutral'}
                    </span>
                  </div>

                  {/* Trade Details */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '15px',
                      marginBottom: '15px',
                    }}
                  >
                    {/* Alien Offers */}
                    <div
                      style={{
                        padding: '10px',
                        background: 'rgba(0, 255, 0, 0.05)',
                        border: '1px solid rgba(0, 255, 0, 0.3)',
                      }}
                    >
                      <div style={{ color: '#00ff00', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                        📦 ALIEN OFFERS
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        {offer.alienOffersCredits > 0 && (
                          <div>💰 {offer.alienOffersCredits.toLocaleString()} credits</div>
                        )}
                        {offer.alienOffersFuel > 0 && (
                          <div>⛽ {offer.alienOffersFuel.toLocaleString()} fuel</div>
                        )}
                        {offer.alienOffersOrganics > 0 && (
                          <div>🌿 {offer.alienOffersOrganics.toLocaleString()} organics</div>
                        )}
                        {offer.alienOffersEquipment > 0 && (
                          <div>⚙️ {offer.alienOffersEquipment.toLocaleString()} equipment</div>
                        )}
                      </div>
                    </div>

                    {/* Alien Requests */}
                    <div
                      style={{
                        padding: '10px',
                        background: 'rgba(255, 0, 153, 0.05)',
                        border: '1px solid rgba(255, 0, 153, 0.3)',
                      }}
                    >
                      <div style={{ color: '#ff0099', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                        🤝 ALIEN REQUESTS
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        {offer.alienRequestsCredits > 0 && (
                          <div>💰 {offer.alienRequestsCredits.toLocaleString()} credits</div>
                        )}
                        {offer.alienRequestsFuel > 0 && (
                          <div>⛽ {offer.alienRequestsFuel.toLocaleString()} fuel</div>
                        )}
                        {offer.alienRequestsOrganics > 0 && (
                          <div>🌿 {offer.alienRequestsOrganics.toLocaleString()} organics</div>
                        )}
                        {offer.alienRequestsEquipment > 0 && (
                          <div>⚙️ {offer.alienRequestsEquipment.toLocaleString()} equipment</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {isPending && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => acceptTrade(offer.id)}
                        disabled={processing === offer.id}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: processing === offer.id ? '#666' : 'linear-gradient(135deg, #00ff00 0%, #00cc00 100%)',
                          color: '#000',
                          border: 'none',
                          cursor: processing === offer.id ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          opacity: processing === offer.id ? 0.5 : 1,
                        }}
                      >
                        {processing === offer.id ? 'PROCESSING...' : '✅ ACCEPT TRADE'}
                      </button>
                      <button
                        onClick={() => attemptRobbery(offer.id)}
                        disabled={processing === offer.id}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: processing === offer.id ? '#666' : 'linear-gradient(135deg, #ff0066 0%, #9d00ff 100%)',
                          color: 'white',
                          border: 'none',
                          cursor: processing === offer.id ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          opacity: processing === offer.id ? 0.5 : 1,
                        }}
                      >
                        {processing === offer.id ? 'PROCESSING...' : '💀 ROB (20%)'}
                      </button>
                      <button
                        onClick={() => cancelTrade(offer.id)}
                        disabled={processing === offer.id}
                        style={{
                          padding: '10px 15px',
                          background: processing === offer.id ? '#666' : '#333',
                          color: '#999',
                          border: '1px solid #666',
                          cursor: processing === offer.id ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          opacity: processing === offer.id ? 0.5 : 1,
                        }}
                      >
                        ❌
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info Box */}
        <div
          style={{
            padding: '15px',
            background: 'rgba(0, 255, 255, 0.05)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            fontSize: '12px',
            color: '#00ffff',
            marginTop: '20px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>ℹ️ TRADING INFO</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>
            • Offers expire after 5 minutes<br />
            • Alignment affects pricing (friendlier aliens = better prices)<br />
            • Robbery has 20% success rate, 80% triggers combat with penalty<br />
            • You cannot rob corporation members
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '12px',
            background: 'linear-gradient(135deg, #333 0%, #1a1a1a 100%)',
            color: '#00ffff',
            border: '1px solid #00ffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
