import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config/api';

interface ShipLogEntry {
  id: number;
  player_id: number;
  universe_id: number;
  sector_number: number;
  log_type: 'SOL' | 'PLANET' | 'PORT' | 'DEAD_END' | 'STARDOCK' | 'MANUAL';
  port_type?: string;
  planet_name?: string;
  sector_name?: string;
  note?: string;
  is_manual: boolean;
  is_read: boolean;
  discovered_at: string;
}

interface LogStats {
  total: number;
  ports: number;
  planets: number;
  deadEnds: number;
  stardocks: number;
  manual: number;
}

interface ShipLogPanelProps {
  token: string;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

type FilterType = 'ALL' | 'SOL' | 'PLANET' | 'PORT' | 'DEAD_END' | 'STARDOCK' | 'MANUAL';
type SortType = 'date' | 'sector';

const LOG_TYPE_COLORS: Record<string, string> = {
  SOL: 'var(--neon-yellow)',
  PLANET: 'var(--neon-green)',
  PORT: 'var(--neon-cyan)',
  DEAD_END: 'var(--neon-red)',
  STARDOCK: 'var(--neon-purple)',
  MANUAL: 'var(--neon-pink)'
};

const LOG_TYPE_ICONS: Record<string, string> = {
  SOL: '☀',
  PLANET: '🌍',
  PORT: '🏪',
  DEAD_END: '⚠',
  STARDOCK: '🚀',
  MANUAL: '📝'
};

export const ShipLogPanel: React.FC<ShipLogPanelProps> = ({ token, onClose, onUnreadCountChange }) => {
  const [logs, setLogs] = useState<ShipLogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sortBy, setSortBy] = useState<SortType>('date');
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteSector, setNewNoteSector] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletingNote, setDeletingNote] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/shiplogs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setLogs(data.logs);
        setStats(data.stats);
      } else {
        setError(data.error || 'Failed to load ship logs');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadLogs();
    // Mark logs as read when panel opens
    markLogsAsRead();
  }, [loadLogs]);

  const markLogsAsRead = async () => {
    try {
      await fetch(`${API_URL}/api/shiplogs/mark-read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Update unread count in parent component
      if (onUnreadCountChange) {
        onUnreadCountChange(0);
      }
    } catch (err) {
      // Silent fail
    }
  };

  const handleAddNote = async () => {
    const sectorNum = parseInt(newNoteSector);
    if (isNaN(sectorNum) || sectorNum < 1) {
      setError('Please enter a valid sector number');
      return;
    }
    if (!newNoteText.trim()) {
      setError('Please enter a note');
      return;
    }

    try {
      setAddingNote(true);
      setError('');
      const response = await fetch(`${API_URL}/api/shiplogs/note`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sectorNumber: sectorNum,
          note: newNoteText.trim()
        })
      });
      const data = await response.json();
      if (response.ok) {
        setNewNoteSector('');
        setNewNoteText('');
        setShowAddNote(false);
        loadLogs();
      } else {
        setError(data.error || 'Failed to add note');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (logId: number) => {
    setDeletingNote(true);
    try {
      const response = await fetch(`${API_URL}/api/shiplogs/${logId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setDeleteConfirmId(null);
        loadLogs();
      } else {
        setError(data.error || 'Failed to delete note');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setDeletingNote(false);
    }
  };

  const filteredLogs = filter === 'ALL'
    ? logs
    : filter === 'PLANET'
      ? logs.filter(log => log.log_type === 'PLANET' || log.log_type === 'SOL')
      : logs.filter(log => log.log_type === filter);

  // Sort logs based on selected sort type
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    if (sortBy === 'sector') {
      return a.sector_number - b.sector_number;
    } else {
      // Sort by date (newest first)
      return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
    }
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getLogDescription = (log: ShipLogEntry): string => {
    switch (log.log_type) {
      case 'SOL':
        return 'Home Sector - Earth';
      case 'PLANET':
        return log.planet_name || 'Unknown Planet';
      case 'PORT':
        return `Port Type: ${log.port_type}`;
      case 'STARDOCK':
        return 'StarDock - Ship Dealer';
      case 'DEAD_END':
        return 'Dead End Sector';
      case 'MANUAL':
        return log.note || 'Note';
      default:
        return log.note || '';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        backgroundColor: 'var(--bg-secondary)',
        border: '2px solid var(--neon-cyan)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 30px rgba(0, 255, 255, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '15px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h2 style={{ 
              color: 'var(--neon-cyan)', 
              margin: 0,
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              letterSpacing: '2px'
            }}>
              📋 SHIP LOG
            </h2>
            {stats && (
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                {stats.total} entries
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--neon-red)',
              color: 'var(--neon-red)',
              padding: '5px 15px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)'
            }}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
            fontSize: '13px'
          }}>
            <span style={{ color: LOG_TYPE_COLORS.PLANET }}>
              {LOG_TYPE_ICONS.PLANET} Planets: {stats.planets}
            </span>
            <span style={{ color: LOG_TYPE_COLORS.PORT }}>
              {LOG_TYPE_ICONS.PORT} Ports: {stats.ports}
            </span>
            <span style={{ color: LOG_TYPE_COLORS.STARDOCK }}>
              {LOG_TYPE_ICONS.STARDOCK} StarDocks: {stats.stardocks}
            </span>
            <span style={{ color: LOG_TYPE_COLORS.DEAD_END }}>
              {LOG_TYPE_ICONS.DEAD_END} Dead Ends: {stats.deadEnds}
            </span>
            <span style={{ color: LOG_TYPE_COLORS.MANUAL }}>
              {LOG_TYPE_ICONS.MANUAL} Notes: {stats.manual}
            </span>
          </div>
        )}

        {/* Filter & Add Note */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {(['ALL', 'PLANET', 'PORT', 'STARDOCK', 'DEAD_END', 'MANUAL'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 10px',
                  border: `1px solid ${filter === f ? 'var(--neon-cyan)' : 'var(--border-color)'}`,
                  backgroundColor: filter === f ? 'rgba(0, 255, 255, 0.1)' : 'transparent',
                  color: filter === f ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px'
                }}
              >
                {f === 'ALL' ? 'ALL' : `${LOG_TYPE_ICONS[f]} ${f.replace('_', ' ')}`}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                onClick={() => setSortBy('date')}
                style={{
                  padding: '5px 10px',
                  border: `1px solid ${sortBy === 'date' ? 'var(--neon-purple)' : 'var(--border-color)'}`,
                  backgroundColor: sortBy === 'date' ? 'rgba(138, 43, 226, 0.1)' : 'transparent',
                  color: sortBy === 'date' ? 'var(--neon-purple)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px'
                }}
              >
                📅 DATE
              </button>
              <button
                onClick={() => setSortBy('sector')}
                style={{
                  padding: '5px 10px',
                  border: `1px solid ${sortBy === 'sector' ? 'var(--neon-purple)' : 'var(--border-color)'}`,
                  backgroundColor: sortBy === 'sector' ? 'rgba(138, 43, 226, 0.1)' : 'transparent',
                  color: sortBy === 'sector' ? 'var(--neon-purple)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px'
                }}
              >
                🔢 SECTOR
              </button>
            </div>
            <button
              onClick={() => setShowAddNote(!showAddNote)}
              style={{
                padding: '5px 15px',
                border: '1px solid var(--neon-green)',
                backgroundColor: showAddNote ? 'rgba(0, 255, 0, 0.1)' : 'transparent',
                color: 'var(--neon-green)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px'
              }}
            >
              ➕ ADD NOTE
            </button>
          </div>
        </div>

        {/* Add Note Form */}
        {showAddNote && (
          <div style={{
            padding: '15px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'rgba(0, 255, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '5px' }}>
                  SECTOR #
                </label>
                <input
                  type="number"
                  value={newNoteSector}
                  onChange={(e) => setNewNoteSector(e.target.value)}
                  placeholder="123"
                  style={{
                    width: '80px',
                    padding: '8px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '5px' }}>
                  NOTE
                </label>
                <input
                  type="text"
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Enter your note..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '19px' }}>
                <button
                  onClick={handleAddNote}
                  disabled={addingNote}
                  style={{
                    padding: '8px 20px',
                    border: '1px solid var(--neon-green)',
                    backgroundColor: 'rgba(0, 255, 0, 0.2)',
                    color: 'var(--neon-green)',
                    cursor: addingNote ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  {addingNote ? 'SAVING...' : 'SAVE'}
                </button>
                <button
                  onClick={() => {
                    setShowAddNote(false);
                    setNewNoteSector('');
                    setNewNoteText('');
                    setError('');
                  }}
                  style={{
                    padding: '8px 20px',
                    border: '1px solid var(--text-secondary)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={{
            padding: '10px 20px',
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            borderBottom: '1px solid var(--neon-red)',
            color: 'var(--neon-red)',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Log Entries */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 20px'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading ship log...
            </div>
          ) : sortedLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              {filter === 'ALL'
                ? 'No discoveries yet. Start exploring!'
                : `No ${filter.replace('_', ' ').toLowerCase()} entries found.`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sortedLogs.map(log => (
                <div
                  key={log.id}
                  style={{
                    padding: '12px 15px',
                    border: `1px solid ${LOG_TYPE_COLORS[log.log_type]}`,
                    borderLeft: `4px solid ${LOG_TYPE_COLORS[log.log_type]}`,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                    <span style={{ 
                      fontSize: '20px',
                      minWidth: '30px',
                      textAlign: 'center'
                    }}>
                      {LOG_TYPE_ICONS[log.log_type]}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ 
                          color: 'var(--neon-cyan)', 
                          fontWeight: 'bold',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          Sector {log.sector_number}
                        </span>
                        <span style={{ 
                          color: LOG_TYPE_COLORS[log.log_type],
                          fontSize: '11px',
                          padding: '2px 6px',
                          border: `1px solid ${LOG_TYPE_COLORS[log.log_type]}`,
                          borderRadius: '3px'
                        }}>
                          {log.log_type.replace('_', ' ')}
                        </span>
                      </div>
                      <div style={{ 
                        color: 'var(--text-primary)', 
                        fontSize: '14px',
                        marginTop: '4px' 
                      }}>
                        {getLogDescription(log)}
                      </div>
                      {log.sector_name && log.log_type !== 'SOL' && (
                        <div style={{ 
                          color: 'var(--text-secondary)', 
                          fontSize: '12px',
                          marginTop: '2px' 
                        }}>
                          {log.sector_name}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ 
                      color: 'var(--text-secondary)', 
                      fontSize: '12px',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatDate(log.discovered_at)}
                    </span>
                    {log.is_manual && (
                      deleteConfirmId === log.id ? (
                        <div style={{
                          display: 'flex',
                          gap: '4px',
                          alignItems: 'center',
                          padding: '4px',
                          background: 'rgba(255, 0, 0, 0.1)',
                          border: '1px solid var(--neon-red)',
                          borderRadius: '3px'
                        }}>
                          <span style={{ fontSize: '10px', color: 'var(--neon-red)', marginRight: '4px' }}>
                            Delete?
                          </span>
                          <button
                            onClick={() => handleDeleteNote(log.id)}
                            disabled={deletingNote}
                            style={{
                              background: 'rgba(255, 0, 0, 0.2)',
                              border: '1px solid var(--neon-red)',
                              color: 'var(--neon-red)',
                              padding: '2px 6px',
                              cursor: deletingNote ? 'not-allowed' : 'pointer',
                              fontSize: '9px',
                              fontFamily: 'var(--font-mono)'
                            }}
                          >
                            {deletingNote ? '...' : 'YES'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={deletingNote}
                            style={{
                              background: 'rgba(100, 100, 100, 0.2)',
                              border: '1px solid #666',
                              color: '#666',
                              padding: '2px 6px',
                              cursor: deletingNote ? 'not-allowed' : 'pointer',
                              fontSize: '9px',
                              fontFamily: 'var(--font-mono)'
                            }}
                          >
                            NO
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(log.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--neon-red)',
                            color: 'var(--neon-red)',
                            padding: '3px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)'
                          }}
                          title="Delete this note"
                        >
                          🗑
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border-color)',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          textAlign: 'center'
        }}>
          Ship log persists across ship changes • Auto-logged when visiting sectors
        </div>
      </div>
    </div>
  );
};

export default ShipLogPanel;

