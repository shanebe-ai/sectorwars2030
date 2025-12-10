import { useEffect, useState } from 'react';

interface CombatNotificationProps {
  notification: {
    type: 'attacked' | 'defended';
    attacker?: string;
    defender?: string;
    attackerShip?: string;
    defenderShip?: string;
    sector: number;
    result: 'victory' | 'defeat';
    destroyed: boolean;
    escapeSector?: number;
    creditsLost?: number;
    creditsLooted?: number;
    timestamp: string;
  };
  onClose: () => void;
}

export default function CombatNotification({ notification, onClose }: CombatNotificationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Auto-close after 10 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for fade animation
    }, 10000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const isVictory = notification.result === 'victory';
  const opponent = notification.type === 'defended' ? notification.attacker : notification.defender;
  const opponentShip = notification.type === 'defended' ? notification.attackerShip : notification.defenderShip;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: isVictory ? 'rgba(0, 255, 0, 0.95)' : 'rgba(255, 0, 102, 0.95)',
      border: `2px solid ${isVictory ? '#00ff00' : '#ff0066'}`,
      borderRadius: '8px',
      padding: '20px',
      maxWidth: '400px',
      boxShadow: `0 0 20px ${isVictory ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 102, 0.5)'}`,
      zIndex: 2000,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s ease-out',
      color: '#000',
      fontWeight: 'bold'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div style={{ fontSize: '18px' }}>
          {notification.type === 'defended' && (isVictory ? '🛡️ DEFENDED!' : '⚔️ ATTACKED!')}
          {notification.type === 'attacked' && (isVictory ? '⚔️ VICTORY!' : '💀 DEFEAT!')}
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onClose, 300);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#000',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            lineHeight: '1'
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: '14px', marginBottom: '8px' }}>
        {notification.type === 'defended' ? 'Attacked by' : 'Attacked'}: <strong>{opponent}</strong>
      </div>

      <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '8px' }}>
        Ship: {opponentShip} • Sector {notification.sector}
      </div>

      {notification.destroyed && notification.escapeSector && (
        <div style={{ fontSize: '13px', marginTop: '10px', padding: '8px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '4px' }}>
          💀 Ship destroyed! Escape pod to Sector {notification.escapeSector}
        </div>
      )}

      {notification.creditsLost && notification.creditsLost > 0 && (
        <div style={{ fontSize: '13px', marginTop: '8px' }}>
          💸 Credits lost: ₡{notification.creditsLost.toLocaleString()}
        </div>
      )}

      {notification.creditsLooted && notification.creditsLooted > 0 && (
        <div style={{ fontSize: '13px', marginTop: '8px' }}>
          💰 Credits looted: ₡{notification.creditsLooted.toLocaleString()}
        </div>
      )}
    </div>
  );
}
