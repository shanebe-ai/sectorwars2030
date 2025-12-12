/**
 * Trade Offer Modal Component
 *
 * Modal for creating a new trade offer to another player.
 * Allows initiator to specify what they offer and what they request.
 */

import React, { useState } from 'react';

interface TradeOfferModalProps {
  playerId: number;
  recipientPlayerId: number;
  recipientName: string;
  currentSectorId: number;
  playerCredits: number;
  playerCargo: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  token: string;
  onTradeCreated: () => void;
  onClose: () => void;
}

const TradeOfferModal: React.FC<TradeOfferModalProps> = ({
  playerId,
  recipientPlayerId,
  recipientName,
  currentSectorId,
  playerCredits,
  playerCargo,
  token,
  onTradeCreated,
  onClose,
}) => {
  // Offers (what initiator gives)
  const [offerFuel, setOfferFuel] = useState(0);
  const [offerOrganics, setOfferOrganics] = useState(0);
  const [offerEquipment, setOfferEquipment] = useState(0);
  const [offerCredits, setOfferCredits] = useState(0);

  // Requests (what initiator wants)
  const [requestFuel, setRequestFuel] = useState(0);
  const [requestOrganics, setRequestOrganics] = useState(0);
  const [requestEquipment, setRequestEquipment] = useState(0);
  const [requestCredits, setRequestCredits] = useState(0);

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Validation
  const hasOffers = offerFuel > 0 || offerOrganics > 0 || offerEquipment > 0 || offerCredits > 0;
  const hasRequests = requestFuel > 0 || requestOrganics > 0 || requestEquipment > 0 || requestCredits > 0;

  const exceedsCredits = offerCredits > playerCredits;
  const exceedsFuel = offerFuel > playerCargo.fuel;
  const exceedsOrganics = offerOrganics > playerCargo.organics;
  const exceedsEquipment = offerEquipment > playerCargo.equipment;

  const isValid = hasOffers && hasRequests && !exceedsCredits && !exceedsFuel && !exceedsOrganics && !exceedsEquipment;

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:3000/api/player-trading/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          initiatorPlayerId: playerId,
          recipientPlayerId,
          sectorId: currentSectorId,
          offers: {
            fuel: offerFuel,
            organics: offerOrganics,
            equipment: offerEquipment,
            credits: offerCredits,
          },
          requests: {
            fuel: requestFuel,
            organics: requestOrganics,
            equipment: requestEquipment,
            credits: requestCredits,
          },
          message,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Trade offer created successfully!');
        setTimeout(() => {
          onTradeCreated();
        }, 1500);
      } else {
        setError(data.error || 'Failed to create trade offer');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
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
          border: '2px solid #00ff00',
          borderRadius: '8px',
          padding: '30px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#00ff00',
          fontFamily: 'Courier New, monospace',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#00ffff' }}>
          Create Trade Offer to {recipientName}
        </h2>

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

        {success && (
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
            {success}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          {/* What you offer */}
          <div style={{ border: '1px solid #00ff00', borderRadius: '4px', padding: '15px' }}>
            <h3 style={{ marginBottom: '15px', color: '#ffff00' }}>You Offer:</h3>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Fuel (have: {playerCargo.fuel})
              </label>
              <input
                type="number"
                min="0"
                max={playerCargo.fuel}
                value={offerFuel}
                onChange={(e) => setOfferFuel(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: `1px solid ${exceedsFuel ? '#ff0000' : '#00ff00'}`,
                  borderRadius: '4px',
                  color: '#00ff00',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Organics (have: {playerCargo.organics})
              </label>
              <input
                type="number"
                min="0"
                max={playerCargo.organics}
                value={offerOrganics}
                onChange={(e) => setOfferOrganics(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: `1px solid ${exceedsOrganics ? '#ff0000' : '#00ff00'}`,
                  borderRadius: '4px',
                  color: '#00ff00',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Equipment (have: {playerCargo.equipment})
              </label>
              <input
                type="number"
                min="0"
                max={playerCargo.equipment}
                value={offerEquipment}
                onChange={(e) => setOfferEquipment(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: `1px solid ${exceedsEquipment ? '#ff0000' : '#00ff00'}`,
                  borderRadius: '4px',
                  color: '#00ff00',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>

            <div style={{ marginBottom: '0' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Credits (have: {playerCredits.toLocaleString()})
              </label>
              <input
                type="number"
                min="0"
                max={playerCredits}
                value={offerCredits}
                onChange={(e) => setOfferCredits(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: `1px solid ${exceedsCredits ? '#ff0000' : '#00ff00'}`,
                  borderRadius: '4px',
                  color: '#00ff00',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>
          </div>

          {/* What you want */}
          <div style={{ border: '1px solid #00ffff', borderRadius: '4px', padding: '15px' }}>
            <h3 style={{ marginBottom: '15px', color: '#00ffff' }}>You Request:</h3>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Fuel</label>
              <input
                type="number"
                min="0"
                value={requestFuel}
                onChange={(e) => setRequestFuel(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: '1px solid #00ffff',
                  borderRadius: '4px',
                  color: '#00ffff',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Organics</label>
              <input
                type="number"
                min="0"
                value={requestOrganics}
                onChange={(e) => setRequestOrganics(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: '1px solid #00ffff',
                  borderRadius: '4px',
                  color: '#00ffff',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Equipment</label>
              <input
                type="number"
                min="0"
                value={requestEquipment}
                onChange={(e) => setRequestEquipment(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: '1px solid #00ffff',
                  borderRadius: '4px',
                  color: '#00ffff',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>

            <div style={{ marginBottom: '0' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Credits</label>
              <input
                type="number"
                min="0"
                value={requestCredits}
                onChange={(e) => setRequestCredits(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#000',
                  border: '1px solid #00ffff',
                  borderRadius: '4px',
                  color: '#00ffff',
                  fontFamily: 'Courier New, monospace',
                }}
              />
            </div>
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Optional Message (max 500 chars)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.substring(0, 500))}
            placeholder="Add a message to your trade offer..."
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#000',
              border: '1px solid #00ff00',
              borderRadius: '4px',
              color: '#00ff00',
              fontFamily: 'Courier New, monospace',
              minHeight: '80px',
              resize: 'vertical',
            }}
          />
          <div style={{ textAlign: 'right', fontSize: '12px', marginTop: '5px', color: '#888' }}>
            {message.length}/500
          </div>
        </div>

        {/* Validation warnings */}
        {!hasOffers && (
          <div style={{ padding: '10px', marginBottom: '10px', backgroundColor: '#440', color: '#ff6600' }}>
            You must offer at least one resource
          </div>
        )}
        {!hasRequests && (
          <div style={{ padding: '10px', marginBottom: '10px', backgroundColor: '#440', color: '#ff6600' }}>
            You must request at least one resource
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#444',
              border: '1px solid #888',
              borderRadius: '4px',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'Courier New, monospace',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            style={{
              padding: '10px 20px',
              backgroundColor: isValid && !loading ? '#004400' : '#222',
              border: `1px solid ${isValid && !loading ? '#00ff00' : '#444'}`,
              borderRadius: '4px',
              color: isValid && !loading ? '#00ff00' : '#666',
              cursor: isValid && !loading ? 'pointer' : 'not-allowed',
              fontFamily: 'Courier New, monospace',
              fontSize: '14px',
            }}
          >
            {loading ? 'Creating...' : 'Create Offer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TradeOfferModal;
