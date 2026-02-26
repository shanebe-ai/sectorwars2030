import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config/api';

interface PlayerSearchResult {
  username: string;
  playerId: number;
  corpId: number | null;
  corpName: string | null;
}

interface PlayerSearchPanelProps {
  token: string;
  universeId: number;
  onClose: () => void;
  onMessagePlayer?: (playerId: number, username: string) => void;
}

export default function PlayerSearchPanel({ token, universeId, onClose, onMessagePlayer }: PlayerSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  const searchPlayers = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await fetch(
        `${API_URL}/api/players/search?q=${encodeURIComponent(query)}&universeId=${universeId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      if (response.ok) {
        setSearchResults(data.players || []);
        if (data.players?.length === 0) {
          setError('No players found');
        }
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setError('');

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search (300ms debounce)
    const timeout = setTimeout(() => {
      searchPlayers(value);
    }, 300);

    setSearchTimeout(timeout);
  };

  const handleSelectPlayer = (player: PlayerSearchResult) => {
    if (onMessagePlayer) {
      onMessagePlayer(player.playerId, player.username);
      onClose();
    }
  };

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    }}>
      <div className="cyberpunk-panel" style={{
        width: '90%',
        maxWidth: '500px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div className="panel-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px 20px',
          borderBottom: '1px solid var(--neon-cyan)'
        }}>
          <h2 style={{ margin: 0, color: 'var(--neon-cyan)', fontSize: '18px' }}>
            🔍 PLAYER SEARCH
          </h2>
          <button
            onClick={onClose}
            className="cyberpunk-close-button"
            style={{
              background: 'transparent',
              border: '1px solid var(--neon-pink)',
              color: 'var(--neon-pink)',
              width: '30px',
              height: '30px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div style={{ padding: '20px' }}>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Enter player name (min 2 characters)..."
            className="cyberpunk-input"
            style={{
              width: '100%',
              padding: '12px 15px',
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--neon-cyan)',
              color: 'var(--neon-cyan)',
              fontSize: '14px',
              fontFamily: 'monospace',
              outline: 'none'
            }}
          />
          {loading && (
            <div style={{
              marginTop: '10px',
              color: 'var(--neon-yellow)',
              fontSize: '13px'
            }}>
              Searching...
            </div>
          )}
          {error && !loading && (
            <div style={{
              marginTop: '10px',
              color: 'var(--neon-pink)',
              fontSize: '13px'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Results List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 20px 20px'
        }}>
          {searchResults.length > 0 && (
            <div style={{
              border: '1px solid var(--neon-cyan)',
              background: 'rgba(0, 0, 0, 0.5)'
            }}>
              {searchResults.map((player, index) => (
                <div
                  key={player.playerId}
                  onClick={() => handleSelectPlayer(player)}
                  style={{
                    padding: '15px',
                    borderBottom: index < searchResults.length - 1 ? '1px solid rgba(0, 255, 255, 0.2)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 255, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{
                        color: 'var(--neon-cyan)',
                        fontSize: '15px',
                        fontWeight: 'bold'
                      }}>
                        {player.username}
                      </div>
                      {player.corpName && (
                        <div style={{
                          fontSize: '12px',
                          color: 'var(--neon-pink)',
                          marginTop: '4px'
                        }}>
                          ★ {player.corpName}
                        </div>
                      )}
                      {!player.corpName && (
                        <div style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          marginTop: '4px'
                        }}>
                          Independent
                        </div>
                      )}
                    </div>
                    <div style={{
                      color: 'var(--neon-green)',
                      fontSize: '12px'
                    }}>
                      Click to message →
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && searchResults.length === 0 && !loading && !error && (
            <div style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              padding: '30px',
              fontSize: '14px'
            }}>
              No players found matching "{searchQuery}"
            </div>
          )}

          {searchQuery.length < 2 && (
            <div style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              padding: '30px',
              fontSize: '14px'
            }}>
              Type at least 2 characters to search
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(0, 255, 255, 0.2)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          textAlign: 'center'
        }}>
          Press ESC to close • Click a player to send them a message
        </div>
      </div>
    </div>
  );
}
