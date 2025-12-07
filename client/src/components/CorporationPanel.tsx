import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface CorporationMember {
  memberId: number;
  playerId: number;
  username: string;
  email: string;
  rank: 'founder' | 'officer' | 'member';
  shipType: string;
  alignment: number;
  kills: number;
  deaths: number;
  credits: number;
  joinedAt: string;
}

interface CorporationDetails {
  id: number;
  name: string;
  founderId: number;
  founderUsername: string;
  universeId: number;
  createdAt: string;
  members: CorporationMember[];
}

interface PlayerSearchResult {
  username: string;
  playerId: number;
  corpId: number | null;
  corpName: string | null;
}

interface CorporationPanelProps {
  token: string;
  onClose: () => void;
  playerId: number;
  corpId: number | null;
  corpName: string;
  universeId: number;
}

export default function CorporationPanel({ token, onClose, playerId, corpId, corpName, universeId }: CorporationPanelProps) {
  const [view, setView] = useState<'details' | 'invite' | 'messages'>('details');
  const [corporation, setCorporation] = useState<CorporationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Invite form
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);

  // Autocomplete
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Confirmation dialogs
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDisbandConfirm, setShowDisbandConfirm] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ playerId: number; username: string } | null>(null);
  const [rankChangeTarget, setRankChangeTarget] = useState<{ playerId: number; username: string; newRank: 'member' | 'officer' } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{ playerId: number; username: string } | null>(null);

  useEffect(() => {
    if (corpId) {
      loadCorporationDetails();
    } else {
      setLoading(false);
    }
  }, [corpId]);

  const loadCorporationDetails = async () => {
    if (!corpId) return;

    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/corporations/${corpId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setCorporation(data);
      } else {
        setError(data.error || 'Failed to load corporation details');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveCorporation = async () => {
    try {
      setError('');
      setShowLeaveConfirm(false);
      const response = await fetch(`${API_URL}/api/corporations/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('You have left the corporation. Refreshing...');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(data.error || 'Failed to leave corporation');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleDisbandCorporation = async () => {
    try {
      setError('');
      setShowDisbandConfirm(false);
      const response = await fetch(`${API_URL}/api/corporations/disband`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Corporation disbanded. Refreshing...');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(data.error || 'Failed to disband corporation');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const searchPlayers = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/players/search?q=${encodeURIComponent(query)}&universeId=${universeId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      if (response.ok) {
        setSearchResults(data.players || []);
        setShowSuggestions(true);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleUsernameChange = (value: string) => {
    setInviteUsername(value);

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    const timeout = setTimeout(() => {
      searchPlayers(value);
    }, 300); // 300ms debounce

    setSearchTimeout(timeout);
  };

  const handleSelectPlayer = (username: string) => {
    setInviteUsername(username);
    setShowSuggestions(false);
    setSearchResults([]);
  };

  const handleInvitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim()) return;

    try {
      setInviting(true);
      setError('');
      setSuccess('');
      setShowSuggestions(false);
      const response = await fetch(`${API_URL}/api/corporations/invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: inviteUsername.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`Invitation sent to ${data.targetPlayer}`);
        setInviteUsername('');
      } else {
        setError(data.error || 'Failed to send invitation');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setInviting(false);
    }
  };

  const handleKickMember = async () => {
    if (!kickTarget) return;

    try {
      setError('');
      setSuccess('');
      const response = await fetch(`${API_URL}/api/corporations/kick`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetPlayerId: kickTarget.playerId })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`${kickTarget.username} has been removed from the corporation`);
        setKickTarget(null);
        loadCorporationDetails(); // Reload to update member list
      } else {
        setError(data.error || 'Failed to kick member');
        setKickTarget(null);
      }
    } catch (err) {
      setError('Network error');
      setKickTarget(null);
    }
  };

  const handleChangeRank = async () => {
    if (!rankChangeTarget) return;

    try {
      setError('');
      setSuccess('');
      const response = await fetch(`${API_URL}/api/corporations/change-rank`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetPlayerId: rankChangeTarget.playerId, newRank: rankChangeTarget.newRank })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`${rankChangeTarget.username} is now a ${rankChangeTarget.newRank}`);
        setRankChangeTarget(null);
        loadCorporationDetails(); // Reload to update member list
      } else {
        setError(data.error || 'Failed to change rank');
        setRankChangeTarget(null);
      }
    } catch (err) {
      setError('Network error');
      setRankChangeTarget(null);
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTarget) return;

    try {
      setError('');
      setSuccess('');
      const response = await fetch(`${API_URL}/api/corporations/transfer-ownership`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newFounderId: transferTarget.playerId })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`Ownership transferred to ${transferTarget.username}`);
        setTransferTarget(null);
        loadCorporationDetails(); // Reload to update ranks
      } else {
        setError(data.error || 'Failed to transfer ownership');
        setTransferTarget(null);
      }
    } catch (err) {
      setError('Network error');
      setTransferTarget(null);
    }
  };

  const getRankBadge = (rank: string) => {
    switch (rank) {
      case 'founder':
        return <span style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>★ FOUNDER</span>;
      case 'officer':
        return <span style={{ color: 'var(--neon-cyan)' }}>◆ OFFICER</span>;
      default:
        return <span style={{ color: 'var(--text-primary)' }}>• MEMBER</span>;
    }
  };

  const canInvite = corporation?.members.find(m => m.playerId === playerId)?.rank in { founder: 1, officer: 1 };
  const isFounder = corporation?.members.find(m => m.playerId === playerId)?.rank === 'founder';
  const myRank = corporation?.members.find(m => m.playerId === playerId)?.rank;

  // Not in a corporation
  if (!corpId || !corpName) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="cyberpunk-panel" style={{ maxWidth: '600px', width: '90%' }}>
          <div className="panel-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>► CORPORATION MANAGEMENT</span>
            <button
              onClick={onClose}
              className="cyberpunk-close-button"
            >
              ✕
            </button>
          </div>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>
              You are not currently a member of any corporation.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Check your messages for corporation invitations.
            </p>
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
      background: 'rgba(0, 0, 0, 0.95)',
      zIndex: 1000,
      overflow: 'auto',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div className="cyberpunk-panel">
          <div className="panel-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>► CORPORATION: {corpName}</span>
            <button
              onClick={onClose}
              className="cyberpunk-close-button"
            >
              ✕
            </button>
          </div>

          {/* Navigation */}
          <div style={{
            display: 'flex',
            gap: '10px',
            padding: '15px',
            borderBottom: '1px solid var(--neon-cyan)'
          }}>
            <button
              className={`cyberpunk-button ${view === 'details' ? 'cyberpunk-button-primary' : ''}`}
              onClick={() => setView('details')}
              style={{ flex: 1 }}
            >
              MEMBERS
            </button>
            {canInvite && (
              <button
                className={`cyberpunk-button ${view === 'invite' ? 'cyberpunk-button-primary' : ''}`}
                onClick={() => setView('invite')}
                style={{ flex: 1 }}
              >
                INVITE
              </button>
            )}
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="error-message" style={{ margin: '15px' }}>
              ✗ {error}
            </div>
          )}
          {success && (
            <div className="success-message" style={{ margin: '15px' }}>
              ✓ {success}
            </div>
          )}

          {/* Confirmation Dialogs */}
          {kickTarget && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                background: 'var(--bg-dark)',
                border: '2px solid var(--neon-pink)',
                padding: '30px',
                maxWidth: '500px',
                width: '90%'
              }}>
                <div style={{
                  color: 'var(--neon-pink)',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  marginBottom: '20px',
                  textAlign: 'center'
                }}>
                  ⚠ KICK MEMBER
                </div>
                <div style={{
                  color: 'var(--text-primary)',
                  marginBottom: '25px',
                  textAlign: 'center'
                }}>
                  Are you sure you want to kick <span style={{ color: 'var(--neon-cyan)' }}>{kickTarget.username}</span> from the corporation?
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleKickMember}
                    className="cyberpunk-button cyberpunk-button-danger"
                    style={{ flex: 1 }}
                  >
                    YES, KICK
                  </button>
                  <button
                    onClick={() => setKickTarget(null)}
                    className="cyberpunk-button"
                    style={{ flex: 1 }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          )}

          {rankChangeTarget && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                background: 'var(--bg-dark)',
                border: '2px solid var(--neon-cyan)',
                padding: '30px',
                maxWidth: '500px',
                width: '90%'
              }}>
                <div style={{
                  color: 'var(--neon-cyan)',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  marginBottom: '20px',
                  textAlign: 'center'
                }}>
                  {rankChangeTarget.newRank === 'officer' ? '▲ PROMOTE MEMBER' : '▼ DEMOTE OFFICER'}
                </div>
                <div style={{
                  color: 'var(--text-primary)',
                  marginBottom: '25px',
                  textAlign: 'center'
                }}>
                  Change <span style={{ color: 'var(--neon-cyan)' }}>{rankChangeTarget.username}</span>'s rank to <span style={{ color: 'var(--neon-yellow)' }}>{rankChangeTarget.newRank.toUpperCase()}</span>?
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleChangeRank}
                    className="cyberpunk-button"
                    style={{ flex: 1 }}
                  >
                    CONFIRM
                  </button>
                  <button
                    onClick={() => setRankChangeTarget(null)}
                    className="cyberpunk-button"
                    style={{ flex: 1 }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          )}

          {transferTarget && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                background: 'var(--bg-dark)',
                border: '2px solid var(--neon-yellow)',
                padding: '30px',
                maxWidth: '500px',
                width: '90%'
              }}>
                <div style={{
                  color: 'var(--neon-yellow)',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  marginBottom: '20px',
                  textAlign: 'center'
                }}>
                  ⚠ TRANSFER OWNERSHIP
                </div>
                <div style={{
                  color: 'var(--text-primary)',
                  marginBottom: '25px',
                  textAlign: 'center'
                }}>
                  Transfer ownership to <span style={{ color: 'var(--neon-cyan)' }}>{transferTarget.username}</span>?
                  <br/><br/>
                  <span style={{ color: 'var(--neon-pink)', fontSize: '14px' }}>
                    You will become an officer and lose founder privileges.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleTransferOwnership}
                    className="cyberpunk-button"
                    style={{ flex: 1, background: 'rgba(255, 255, 0, 0.2)' }}
                  >
                    TRANSFER
                  </button>
                  <button
                    onClick={() => setTransferTarget(null)}
                    className="cyberpunk-button"
                    style={{ flex: 1 }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div style={{ padding: '20px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-cyan)' }}>
                ⟳ LOADING...
              </div>
            ) : view === 'details' && corporation ? (
              <>
                {/* Corporation Info */}
                <div style={{
                  marginBottom: '30px',
                  padding: '15px',
                  background: 'rgba(0, 255, 255, 0.05)',
                  border: '1px solid var(--neon-cyan)'
                }}>
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Founder:</span>{' '}
                    <span style={{ color: 'var(--neon-yellow)' }}>{corporation.founderUsername}</span>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Members:</span>{' '}
                    <span style={{ color: 'var(--neon-cyan)' }}>{corporation.members.length}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Your Rank:</span>{' '}
                    {getRankBadge(myRank || 'member')}
                  </div>
                </div>

                {/* Members List */}
                <h3 style={{ color: 'var(--neon-green)', marginBottom: '15px' }}>► MEMBERS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {corporation.members.map(member => (
                    <div
                      key={member.memberId}
                      style={{
                        padding: '15px',
                        background: member.playerId === playerId
                          ? 'rgba(0, 255, 255, 0.1)'
                          : 'rgba(255, 255, 255, 0.02)',
                        border: member.playerId === playerId
                          ? '1px solid var(--neon-cyan)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: '5px' }}>
                          <span style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>
                            {member.username}
                          </span>
                          {member.playerId === playerId && (
                            <span style={{ color: 'var(--neon-cyan)', marginLeft: '10px', fontSize: '12px' }}>
                              (You)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {getRankBadge(member.rank)} • {member.shipType} • {member.kills} kills / {member.deaths} deaths
                        </div>
                      </div>

                      {/* Actions for other members */}
                      {member.playerId !== playerId && (
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {/* Founder can promote/demote and kick */}
                          {isFounder && member.rank !== 'founder' && (
                            <>
                              {member.rank === 'member' && (
                                <button
                                  className="cyberpunk-button"
                                  onClick={() => setRankChangeTarget({ playerId: member.playerId, username: member.username, newRank: 'officer' })}
                                  style={{ fontSize: '12px', padding: '5px 10px' }}
                                >
                                  PROMOTE
                                </button>
                              )}
                              {member.rank === 'officer' && (
                                <button
                                  className="cyberpunk-button"
                                  onClick={() => setRankChangeTarget({ playerId: member.playerId, username: member.username, newRank: 'member' })}
                                  style={{ fontSize: '12px', padding: '5px 10px' }}
                                >
                                  DEMOTE
                                </button>
                              )}
                              <button
                                className="cyberpunk-button"
                                onClick={() => setKickTarget({ playerId: member.playerId, username: member.username })}
                                style={{ fontSize: '12px', padding: '5px 10px', background: 'rgba(255, 0, 0, 0.2)' }}
                              >
                                KICK
                              </button>
                              <button
                                className="cyberpunk-button"
                                onClick={() => setTransferTarget({ playerId: member.playerId, username: member.username })}
                                style={{ fontSize: '12px', padding: '5px 10px', background: 'rgba(255, 255, 0, 0.1)' }}
                              >
                                TRANSFER
                              </button>
                            </>
                          )}

                          {/* Officers can kick members */}
                          {myRank === 'officer' && member.rank === 'member' && (
                            <button
                              className="cyberpunk-button"
                              onClick={() => setKickTarget({ playerId: member.playerId, username: member.username })}
                              style={{ fontSize: '12px', padding: '5px 10px', background: 'rgba(255, 0, 0, 0.2)' }}
                            >
                              KICK
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : view === 'invite' && canInvite ? (
              <div>
                <h3 style={{ color: 'var(--neon-green)', marginBottom: '15px' }}>► INVITE PLAYER</h3>
                <form onSubmit={handleInvitePlayer}>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label className="form-label">Player Username</label>
                    <input
                      type="text"
                      className="cyberpunk-input"
                      placeholder="Type to search_"
                      value={inviteUsername}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      onFocus={() => {
                        if (inviteUsername.length >= 2) {
                          setShowSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      required
                      autoFocus
                      disabled={inviting}
                    />

                    {/* Autocomplete suggestions */}
                    {showSuggestions && searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'rgba(0, 0, 0, 0.95)',
                        border: '1px solid var(--neon-cyan)',
                        borderTop: 'none',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000,
                      }}>
                        {searchResults.map((result) => (
                          <div
                            key={result.playerId}
                            onClick={() => handleSelectPlayer(result.username)}
                            style={{
                              padding: '10px',
                              borderBottom: '1px solid rgba(0, 255, 255, 0.2)',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ color: 'var(--neon-cyan)' }}>
                              {result.username}
                            </div>
                            {result.corpName && (
                              <div style={{
                                fontSize: '0.85em',
                                color: 'var(--neon-pink)',
                                marginTop: '3px'
                              }}>
                                Currently in: {result.corpName}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="form-hint">
                      Player must be in the same universe. If they're already in a corp, they must leave it before accepting your invitation.
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="cyberpunk-button cyberpunk-button-success"
                    disabled={inviting || !inviteUsername.trim()}
                    style={{ width: '100%', marginTop: '20px' }}
                  >
                    {inviting ? '⟳ SENDING...' : 'SEND INVITATION ►'}
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          {/* Footer Actions */}
          <div style={{
            padding: '15px',
            borderTop: '1px solid var(--neon-cyan)'
          }}>
            {isFounder ? (
              // Founder options
              <>
                {!showDisbandConfirm ? (
                  <button
                    onClick={() => setShowDisbandConfirm(true)}
                    className="cyberpunk-button cyberpunk-button-danger"
                    style={{ width: '100%' }}
                  >
                    DISBAND CORPORATION
                  </button>
                ) : (
                  <div style={{
                    border: '2px solid var(--neon-red)',
                    padding: '15px',
                    background: 'rgba(255, 0, 102, 0.1)'
                  }}>
                    <div style={{
                      color: 'var(--neon-red)',
                      marginBottom: '15px',
                      textAlign: 'center',
                      fontWeight: 'bold'
                    }}>
                      ⚠ DISBAND CORPORATION?
                    </div>
                    <div style={{
                      color: 'var(--text-primary)',
                      marginBottom: '15px',
                      textAlign: 'center',
                      fontSize: '14px'
                    }}>
                      This will permanently delete {corpName} and remove all members. This action cannot be undone!
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={handleDisbandCorporation}
                        className="cyberpunk-button cyberpunk-button-danger"
                        style={{ flex: 1 }}
                      >
                        YES, DISBAND
                      </button>
                      <button
                        onClick={() => setShowDisbandConfirm(false)}
                        className="cyberpunk-button"
                        style={{ flex: 1 }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
                <div style={{
                  marginTop: '10px',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}>
                  To leave, transfer ownership first
                </div>
              </>
            ) : (
              // Regular member options
              <>
                {!showLeaveConfirm ? (
                  <button
                    onClick={() => setShowLeaveConfirm(true)}
                    className="cyberpunk-button cyberpunk-button-danger"
                    style={{ width: '100%' }}
                  >
                    LEAVE CORPORATION
                  </button>
                ) : (
                  <div style={{
                    border: '2px solid var(--neon-pink)',
                    padding: '15px',
                    background: 'rgba(255, 20, 147, 0.1)'
                  }}>
                    <div style={{
                      color: 'var(--neon-pink)',
                      marginBottom: '15px',
                      textAlign: 'center',
                      fontWeight: 'bold'
                    }}>
                      ⚠ ARE YOU SURE?
                    </div>
                    <div style={{
                      color: 'var(--text-primary)',
                      marginBottom: '15px',
                      textAlign: 'center',
                      fontSize: '14px'
                    }}>
                      You will be removed from {corpName} and lose all member privileges.
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={handleLeaveCorporation}
                        className="cyberpunk-button cyberpunk-button-danger"
                        style={{ flex: 1 }}
                      >
                        YES, LEAVE
                      </button>
                      <button
                        onClick={() => setShowLeaveConfirm(false)}
                        className="cyberpunk-button"
                        style={{ flex: 1 }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
