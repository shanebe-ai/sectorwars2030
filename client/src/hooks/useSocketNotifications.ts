import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config/api';

export interface SectorNotification {
  id: string;
  type: 'ship_entered' | 'ship_left' | 'combat_occurred' | 'escape_pod_arrived' | 'cargo_dropped' | 'beacon_message' | 'mines_exploded' | 'mines_deployed' | 'beacon_launched' | 'beacon_attacked';
  message: string;
  details?: any;
  timestamp: Date;
}

interface UseSocketNotificationsProps {
  universeId: number | null;
  sectorNumber: number | null;
  playerId: number | null;
  enabled: boolean;
  onNewBroadcast?: () => void;
  onSectorActivity?: () => void; // Called when players enter/leave sector
}

export function useSocketNotifications({
  universeId,
  sectorNumber,
  playerId,
  enabled,
  onNewBroadcast,
  onSectorActivity
}: UseSocketNotificationsProps) {
  const [notifications, setNotifications] = useState<SectorNotification[]>([]);
  const [combatNotification, setCombatNotification] = useState<any | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const onNewBroadcastRef = useRef(onNewBroadcast);
  const onSectorActivityRef = useRef(onSectorActivity);

  // Keep the callback refs up to date
  useEffect(() => {
    onNewBroadcastRef.current = onNewBroadcast;
    onSectorActivityRef.current = onSectorActivity;
  }, [onNewBroadcast, onSectorActivity]);

  // Add a notification
  const addNotification = useCallback((notification: Omit<SectorNotification, 'id' | 'timestamp'>) => {
    const newNotification: SectorNotification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    
    setNotifications(prev => [newNotification, ...prev].slice(0, 20)); // Keep last 20
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
    }, 10000);
  }, []);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Dismiss a specific notification
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

useEffect(() => {
  // Allow connection with universe + player; sectorNumber can be missing (fallback to 1)
  if (!enabled || !universeId || !playerId) {
    return;
  }

    // Connect to WebSocket server
    const socket = io(API_URL.replace('/api', ''), {
      transports: ['websocket', 'polling']
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WS] Connected to server');
      setConnected(true);
      
      // Join the current sector room
      socket.emit('join_sector', {
        universeId,
        sectorNumber: sectorNumber || 1,
        playerId
      });
    });

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected from server');
      setConnected(false);
    });

    // Handle ship entering sector
    socket.on('ship_entered', (data: any) => {
      // Don't notify about ourselves
      if (data.playerId === playerId) return;

      addNotification({
        type: 'ship_entered',
        message: `⚡ ${data.corpName} (${data.shipType}) warped in from Sector ${data.fromSector}`,
        details: data
      });

      // Trigger sector refresh
      if (onSectorActivityRef.current) {
        onSectorActivityRef.current();
      }
    });

    // Handle ship leaving sector
    socket.on('ship_left', (data: any) => {
      if (data.playerId === playerId) return;

      addNotification({
        type: 'ship_left',
        message: `◄ ${data.corpName} warped to Sector ${data.toSector}`,
        details: data
      });

      // Trigger sector refresh
      if (onSectorActivityRef.current) {
        onSectorActivityRef.current();
      }
    });

    // Handle combat in sector
    socket.on('combat_occurred', (data: any) => {
      let message = `⚔️ COMBAT: ${data.attackerName} attacked ${data.defenderName}!`;
      
      if (data.attackerDestroyed && data.defenderDestroyed) {
        message += ' MUTUAL DESTRUCTION!';
      } else if (data.defenderDestroyed) {
        message += ` ${data.defenderName}'s ship was DESTROYED!`;
      } else if (data.attackerDestroyed) {
        message += ` ${data.attackerName}'s ship was DESTROYED!`;
      } else if (data.winner === 'defender') {
        message += ` ${data.attackerName} retreated!`;
      }
      
      addNotification({
        type: 'combat_occurred',
        message,
        details: data
      });
    });

    // Handle escape pod arriving
    socket.on('escape_pod_arrived', (data: any) => {
      const playerDisplay = data.playerCorp ? `${data.playerName} (${data.playerCorp})` : data.playerName;
      addNotification({
        type: 'escape_pod_arrived',
        message: `🚀 An escape pod carrying ${playerDisplay} arrived from Sector ${data.fromSector}`,
        details: data
      });
    });

    // Handle beacon messages
    socket.on('beacon_message', (data: any) => {
      addNotification({
        type: 'beacon_message',
        message: `📡 BEACON from ${data.ownerName}: "${data.message}"`,
        details: data
      });
    });

    // Handle mine explosions in sector
    socket.on('mines_exploded', (data: any) => {
      addNotification({
        type: 'mines_exploded',
        message: data.message || `💥 ${data.playerName} triggered mines!`,
        details: data
      });

      // Trigger sector refresh to update mine counts
      if (onSectorActivityRef.current) {
        onSectorActivityRef.current();
      }
    });

    // Handle mine deployment in sector
    socket.on('mines_deployed', (data: any) => {
      addNotification({
        type: 'mines_deployed',
        message: `💣 ${data.ownerName} deployed ${data.count} mines (${data.totalInSector} total)`,
        details: data
      });

      // Trigger sector refresh to show new mines
      if (onSectorActivityRef.current) {
        onSectorActivityRef.current();
      }
    });

    // Handle beacon launches
    socket.on('beacon_launched', (data: any) => {
      addNotification({
        type: 'beacon_launched',
        message: `📡 ${data.ownerName} launched a beacon`,
        details: data
      });

      // Trigger sector refresh to show new beacon
      if (onSectorActivityRef.current) {
        onSectorActivityRef.current();
      }
    });

    // Handle beacon attacks
    socket.on('beacon_attacked', (data: any) => {
      addNotification({
        type: 'beacon_attacked',
        message: `💥 ${data.attackerName} attacked a beacon owned by ${data.ownerName}!`,
        details: data
      });

      // Trigger sector refresh to update beacon status
      if (onSectorActivityRef.current) {
        onSectorActivityRef.current();
      }
    });

    // Handle new broadcast messages (TNN, combat reports, planet claims, etc.)
    socket.on('new_broadcast', (data: any) => {
      // Call the callback to refresh unread counts
      if (onNewBroadcastRef.current) {
        onNewBroadcastRef.current();
      }
    });

    // Handle personal combat notifications
    socket.on('combat_notification', (data: any) => {
      console.log('[WS] Combat notification received:', data);
      setCombatNotification(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, universeId, playerId, sectorNumber]); // Removed onNewBroadcast from deps - using ref instead

  // Update sector room when sector changes
  useEffect(() => {
    if (socketRef.current && connected && universeId && sectorNumber && playerId) {
      socketRef.current.emit('join_sector', {
        universeId,
        sectorNumber,
        playerId
      });
    }
  }, [sectorNumber, connected, universeId, playerId]);

  return {
    notifications,
    combatNotification,
    connected,
    clearNotifications,
    dismissNotification,
    dismissCombatNotification: () => setCombatNotification(null)
  };
}

