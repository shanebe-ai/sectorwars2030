/**
 * Alien Communications Panel
 * Read-only channel for monitoring alien network traffic
 * Unlocked after visiting an alien planet sector
 */

import { useState, useEffect } from 'react';
import type { AlienCommunication, AlienCommsResponse } from '../../../shared/types';
import '../styles/cyberpunk.css';

interface AlienCommsPanelProps {
  onClose: () => void;
}

export default function AlienCommsPanel({ onClose }: AlienCommsPanelProps) {
  const [communications, setCommunications] = useState<AlienCommunication[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommunications();
  }, []);

  const loadCommunications = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/aliens/comms`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data: AlienCommsResponse = await response.json();
        setUnlocked(data.unlocked);
        setCommunications(data.communications);
      }
    } catch (error) {
      console.error('Error loading alien communications:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case 'encounter': return '#00ff00'; // Green
      case 'combat': return '#ff0099'; // Pink
      case 'death': return '#ff0000'; // Red
      case 'escape_pod': return '#ff9900'; // Orange
      case 'sector_entry': return '#00ffff'; // Cyan
      case 'planet_attack': return '#ff0000'; // Red
      case 'threat': return '#ff0099'; // Pink
      default: return '#ffffff'; // White
    }
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'encounter': return '👁️';
      case 'combat': return '⚔️';
      case 'death': return '💀';
      case 'escape_pod': return '🚀';
      case 'sector_entry': return '📡';
      case 'planet_attack': return '🌍';
      case 'threat': return '⚠️';
      default: return '📻';
    }
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }} onClick={onClose}>
        <div className="cyberpunk-panel" style={{
          width: '90%',
          maxWidth: '700px',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }} onClick={(e) => e.stopPropagation()}>
          <div className="panel-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>🛸 ALIEN COMMUNICATIONS</span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--neon-pink)',
                fontSize: '20px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: '#00ff00' }}>⟳ Scanning frequencies...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }} onClick={onClose}>
        <div className="cyberpunk-panel" style={{
          width: '90%',
          maxWidth: '700px',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }} onClick={(e) => e.stopPropagation()}>
          <div className="panel-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>🛸 ALIEN COMMUNICATIONS</span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--neon-pink)',
                fontSize: '20px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{
              border: '2px solid #ff0099',
              borderRadius: '8px',
              padding: '2rem',
              background: 'rgba(255, 0, 153, 0.1)'
            }}>
              <h3 style={{ color: '#ff0099', marginBottom: '1rem' }}>🔒 CHANNEL LOCKED</h3>
              <p style={{ color: '#ffffff', marginBottom: '1rem' }}>
                This frequency is encrypted and cannot be accessed.
              </p>
              <p style={{ color: '#00ffff', fontSize: '0.9rem' }}>
                Hint: Alien communications can be intercepted after encountering<br/>
                an alien-controlled sector. Explore the universe to find them.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div className="cyberpunk-panel" style={{
        width: '90%',
        maxWidth: '700px',
        maxHeight: '85vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={(e) => e.stopPropagation()}>
        <div className="panel-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: '#9d00ff' }}>🛸 ALIEN COMMUNICATIONS [READ-ONLY]</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--neon-pink)',
              fontSize: '20px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {/* Info banner */}
          <div style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid #00ffff',
            borderRadius: '4px',
            padding: '0.75rem',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            color: '#00ffff'
          }}>
            <strong>ℹ️ INTERCEPTED TRANSMISSIONS:</strong> You are monitoring the alien communications network.
            This channel is read-only. All alien activity in this universe will appear here.
          </div>

          {/* Communications feed */}
          <div style={{
            maxHeight: '500px',
            overflowY: 'auto',
            border: '2px solid #9d00ff',
            borderRadius: '8px',
            padding: '1rem',
            background: 'rgba(0, 0, 0, 0.5)'
          }}>
            {communications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                <p>📡 No transmissions detected yet.</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  Alien activity will appear here as it happens.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {communications.map((comm) => (
                  <div
                    key={comm.id}
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: `1px solid ${getMessageTypeColor(comm.messageType)}`,
                      borderRadius: '4px',
                      padding: '0.75rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Header with type and timestamp */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                      fontSize: '0.8rem'
                    }}>
                      <span style={{ color: getMessageTypeColor(comm.messageType) }}>
                        {getMessageTypeIcon(comm.messageType)} {comm.messageType.toUpperCase().replace('_', ' ')}
                        {comm.alienRace && ` - ${comm.alienRace}`}
                      </span>
                      <span style={{ color: '#888' }}>
                        {formatTimestamp(comm.createdAt)}
                      </span>
                    </div>

                    {/* Message */}
                    <div style={{
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      lineHeight: '1.4',
                      fontFamily: 'monospace'
                    }}>
                      {comm.message}
                    </div>

                    {/* Sector reference */}
                    {comm.sectorNumber && (
                      <div style={{
                        marginTop: '0.5rem',
                        fontSize: '0.75rem',
                        color: '#00ff00'
                      }}>
                        📍 Sector {comm.sectorNumber}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer stats */}
          <div style={{
            marginTop: '1rem',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: '#888'
          }}>
            {communications.length > 0 && (
              <p>{communications.length} transmission{communications.length !== 1 ? 's' : ''} intercepted</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
