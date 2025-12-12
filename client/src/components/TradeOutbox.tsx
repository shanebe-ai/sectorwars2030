/**
 * Trade Outbox Component
 *
 * Displays outgoing trade offers where the player is the initiator.
 * Allows cancelling pending offers.
 */

import React, { useState, useEffect } from 'react';
import type { PlayerTradeOffer } from '../../../shared/types';

interface TradeOutboxProps {
  playerId: number;
  token: string;
  onOfferCancelled: () => void;
  onClose: () => void;
}

const TradeOutbox: React.FC<TradeOutboxProps> = ({
  playerId,
  token,
  onOfferCancelled,
  onClose,
}) => {
  const [offers, setOffers] = useState<PlayerTradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const loadOffers = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`http://localhost:3000/api/player-trading/outbox/${playerId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setOffers(data.offers);
      } else {
        setError(data.error || 'Failed to load outbox');
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

  const cancelOffer = async (offerId: number) => {
    if (!confirm('Cancel this trade offer?')) {
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
        setResult('Trade offer cancelled');
        onOfferCancelled();
        await loadOffers();
      } else {
        setError(data.error || 'Failed to cancel offer');
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
          border: '2px solid #ffff00',
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
          <h2 style={{ color: '#ffff00', margin: 0 }}>Trade Outbox</h2>
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

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#ffff00' }}>
            Loading offers...
          </div>
        ) : offers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            No outgoing trade offers
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {offers.map((offer) => (
              <div
                key={offer.id}
                style={{
                  border: '1px solid #ffff00',
                  borderRadius: '4px',
                  padding: '15px',
                  backgroundColor: '#111100',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <strong style={{ color: '#ffff00' }}>To: {offer.recipient_name}</strong>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      Sector: {offer.sector_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      Status: <span style={{ color: offer.status === 'pending' ? '#00ff00' : '#ff6600' }}>
                        {offer.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#888' }}>
                    {offer.status === 'pending' && (
                      <>
                        Expires: <span style={{ color: '#ffff00' }}>{formatExpiry(offer.expires_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ color: '#ffff00', marginBottom: '5px', fontWeight: 'bold' }}>You Offered:</div>
                    {offer.initiator_offers_fuel > 0 && <div>Fuel: {offer.initiator_offers_fuel}</div>}
                    {offer.initiator_offers_organics > 0 && <div>Organics: {offer.initiator_offers_organics}</div>}
                    {offer.initiator_offers_equipment > 0 && <div>Equipment: {offer.initiator_offers_equipment}</div>}
                    {offer.initiator_offers_credits > 0 && <div>Credits: {offer.initiator_offers_credits.toLocaleString()}</div>}
                  </div>

                  <div>
                    <div style={{ color: '#00ffff', marginBottom: '5px', fontWeight: 'bold' }}>You Requested:</div>
                    {offer.initiator_requests_fuel > 0 && <div>Fuel: {offer.initiator_requests_fuel}</div>}
                    {offer.initiator_requests_organics > 0 && <div>Organics: {offer.initiator_requests_organics}</div>}
                    {offer.initiator_requests_equipment > 0 && <div>Equipment: {offer.initiator_requests_equipment}</div>}
                    {offer.initiator_requests_credits > 0 && <div>Credits: {offer.initiator_requests_credits.toLocaleString()}</div>}
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

                {offer.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => cancelOffer(offer.id)}
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
                      {processing === offer.id ? 'Cancelling...' : 'Cancel Offer'}
                    </button>
                  </div>
                )}

                {offer.status !== 'pending' && (
                  <div style={{ padding: '10px', backgroundColor: '#222', color: '#888', borderRadius: '4px', textAlign: 'center' }}>
                    This offer has been {offer.status}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeOutbox;
