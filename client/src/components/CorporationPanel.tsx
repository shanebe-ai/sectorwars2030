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

interface CorporationPanelProps {
  token: string;
  onClose: () => void;
  playerId: number;
  corpId: number | null;
  corpName: string;
}

export default function CorporationPanel({ token, onClose, playerId, corpId, corpName }: CorporationPanelProps) {
  const [view, setView] = useState<'details' | 'invite' | 'messages'>('details');
  const [corporation, setCorporation] = useState<CorporationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Invite form
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);

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
    if (!confirm('Are you sure you want to leave this corporation?')) return;

    try {
      setError('');
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

  const handleInvitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim()) return;

    try {
      setInviting(true);
      setError('');
      setSuccess('');
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

  const handleKickMember = async (targetPlayerId: number, username: string) => {
    if (!confirm(`Are you sure you want to kick ${username} from the corporation?`)) return;

    try {
      setError('');
      setSuccess('');
      const response = await fetch(`${API_URL}/api/corporations/kick`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetPlayerId })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`${username} has been removed from the corporation`);
        loadCorporationDetails(); // Reload to update member list
      } else {
        setError(data.error || 'Failed to kick member');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleChangeRank = async (targetPlayerId: number, newRank: 'member' | 'officer', username: string) => {
    const action = newRank === 'officer' ? 'promote' : 'demote';
    if (!confirm(`Are you sure you want to ${action} ${username} to ${newRank}?`)) return;

    try {
      setError('');
      setSuccess('');
      const response = await fetch(`${API_URL}/api/corporations/change-rank`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetPlayerId, newRank })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`${username} is now a ${newRank}`);
        loadCorporationDetails(); // Reload to update member list
      } else {
        setError(data.error || 'Failed to change rank');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleTransferOwnership = async (newFounderId: number, username: string) => {
    if (!confirm(`Are you sure you want to transfer ownership to ${username}? You will become an officer.`)) return;

    try {
      setError('');
      setSuccess('');
      const response = await fetch(`${API_URL}/api/corporations/transfer-ownership`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newFounderId })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`Ownership transferred to ${username}`);
        loadCorporationDetails(); // Reload to update ranks
      } else {
        setError(data.error || 'Failed to transfer ownership');
      }
    } catch (err) {
      setError('Network error');
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
          <div className="panel-header">
            ► CORPORATION MANAGEMENT
          </div>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>
              You are not currently a member of any corporation.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Check your messages for corporation invitations.
            </p>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <button
              onClick={onClose}
              className="cyberpunk-button"
              style={{ width: '100%' }}
            >
              ◄ CLOSE
            </button>
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
          <div className="panel-header">
            ► CORPORATION: {corpName}
          </div>

          {/* Navigation */}
          <div style={{
            display: 'flex',
            gap: '10px',
            padding: '15px',
            borderBottom: '1px solid var(--neon-cyan)',
            opacity: 0.3
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
                                  onClick={() => handleChangeRank(member.playerId, 'officer', member.username)}
                                  style={{ fontSize: '12px', padding: '5px 10px' }}
                                >
                                  PROMOTE
                                </button>
                              )}
                              {member.rank === 'officer' && (
                                <button
                                  className="cyberpunk-button"
                                  onClick={() => handleChangeRank(member.playerId, 'member', member.username)}
                                  style={{ fontSize: '12px', padding: '5px 10px' }}
                                >
                                  DEMOTE
                                </button>
                              )}
                              <button
                                className="cyberpunk-button"
                                onClick={() => handleKickMember(member.playerId, member.username)}
                                style={{ fontSize: '12px', padding: '5px 10px', background: 'rgba(255, 0, 0, 0.2)' }}
                              >
                                KICK
                              </button>
                              <button
                                className="cyberpunk-button"
                                onClick={() => handleTransferOwnership(member.playerId, member.username)}
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
                              onClick={() => handleKickMember(member.playerId, member.username)}
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
                  <div className="form-group">
                    <label className="form-label">Player Username</label>
                    <input
                      type="text"
                      className="cyberpunk-input"
                      placeholder="Enter username_"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      required
                      autoFocus
                      disabled={inviting}
                    />
                    <div className="form-hint">
                      Player must be in the same universe and not already in a corporation
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="cyberpunk-button cyberpunk-button-primary"
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
            borderTop: '1px solid var(--neon-cyan)',
            opacity: 0.3,
            display: 'flex',
            gap: '10px'
          }}>
            <button
              onClick={onClose}
              className="cyberpunk-button"
              style={{ flex: 1 }}
            >
              ◄ CLOSE
            </button>
            {myRank !== 'founder' && (
              <button
                onClick={handleLeaveCorporation}
                className="cyberpunk-button"
                style={{ flex: 1, background: 'rgba(255, 0, 0, 0.2)' }}
              >
                LEAVE CORPORATION
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
