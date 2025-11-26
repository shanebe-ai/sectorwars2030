import { useState, useEffect } from 'react';

interface Message {
  id: number;
  senderId: number | null;
  recipientId: number;
  senderName: string;
  subject: string | null;
  body: string;
  isRead: boolean;
  sentAt: string;
}

interface PlayerInSector {
  id: number;
  corpName: string;
}

interface MessagingPanelProps {
  token: string;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export default function MessagingPanel({ token, onClose, onUnreadCountChange }: MessagingPanelProps) {
  const [view, setView] = useState<'inbox' | 'sent' | 'compose' | 'read'>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [playersInSector, setPlayersInSector] = useState<PlayerInSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Compose form state
  const [recipientId, setRecipientId] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadInbox();
    loadPlayersInSector();
  }, []);

  const loadInbox = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('http://localhost:3000/api/messages/inbox', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
        const unreadCount = data.messages.filter((m: Message) => !m.isRead).length;
        onUnreadCountChange?.(unreadCount);
      } else {
        setError(data.error || 'Failed to load messages');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const loadSentMessages = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('http://localhost:3000/api/messages/sent', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
      } else {
        setError(data.error || 'Failed to load messages');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const loadPlayersInSector = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/messages/players-in-sector', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setPlayersInSector(data.players);
      }
    } catch (err) {
      // Silent fail - not critical
    }
  };

  const handleViewChange = (newView: 'inbox' | 'sent' | 'compose') => {
    setView(newView);
    setSelectedMessage(null);
    setError('');
    setSuccess('');
    if (newView === 'inbox') {
      loadInbox();
    } else if (newView === 'sent') {
      loadSentMessages();
    } else if (newView === 'compose') {
      setRecipientId('');
      setSubject('');
      setBody('');
    }
  };

  const openMessage = async (message: Message) => {
    setSelectedMessage(message);
    setView('read');

    // Mark as read if in inbox and unread
    if (!message.isRead) {
      try {
        await fetch(`http://localhost:3000/api/messages/${message.id}/read`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        // Update local state
        setMessages(prev => prev.map(m => 
          m.id === message.id ? { ...m, isRead: true } : m
        ));
        // Update unread count
        const newUnreadCount = messages.filter(m => !m.isRead && m.id !== message.id).length;
        onUnreadCountChange?.(newUnreadCount);
      } catch (err) {
        // Silent fail
      }
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientId || !body.trim()) return;

    setSending(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:3000/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientId: Number(recipientId),
          subject: subject.trim() || null,
          body: body.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Message sent!');
        setRecipientId('');
        setSubject('');
        setBody('');
        setTimeout(() => {
          handleViewChange('sent');
        }, 1000);
      } else {
        setError(data.error || 'Failed to send message');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (messageId: number) => {
    try {
      const response = await fetch(`http://localhost:3000/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
        if (selectedMessage?.id === messageId) {
          setSelectedMessage(null);
          setView('inbox');
        }
      }
    } catch (err) {
      setError('Failed to delete message');
    }
  };

  const handleReply = (message: Message) => {
    setView('compose');
    // We need to get the sender's player ID - for now we'll need to look it up
    // For simplicity, we'll show compose form and user can select recipient
    setSubject(`RE: ${message.subject || '(no subject)'}`);
    setBody(`\n\n--- Original Message from ${message.senderName} ---\n${message.body}`);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

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
        maxWidth: '700px',
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div className="panel-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>► SHIP COMMUNICATIONS</span>
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

        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--neon-cyan)',
          padding: '0 20px'
        }}>
          <button
            onClick={() => handleViewChange('inbox')}
            style={{
              padding: '12px 20px',
              background: view === 'inbox' ? 'rgba(0, 255, 255, 0.1)' : 'transparent',
              border: 'none',
              borderBottom: view === 'inbox' ? '2px solid var(--neon-cyan)' : '2px solid transparent',
              color: view === 'inbox' ? 'var(--neon-cyan)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              textTransform: 'uppercase'
            }}
          >
            ◄ INBOX
          </button>
          <button
            onClick={() => handleViewChange('sent')}
            style={{
              padding: '12px 20px',
              background: view === 'sent' ? 'rgba(0, 255, 255, 0.1)' : 'transparent',
              border: 'none',
              borderBottom: view === 'sent' ? '2px solid var(--neon-cyan)' : '2px solid transparent',
              color: view === 'sent' ? 'var(--neon-cyan)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              textTransform: 'uppercase'
            }}
          >
            ► SENT
          </button>
          <button
            onClick={() => handleViewChange('compose')}
            style={{
              padding: '12px 20px',
              background: view === 'compose' ? 'rgba(0, 255, 0, 0.1)' : 'transparent',
              border: 'none',
              borderBottom: view === 'compose' ? '2px solid var(--neon-green)' : '2px solid transparent',
              color: view === 'compose' ? 'var(--neon-green)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              textTransform: 'uppercase'
            }}
          >
            + COMPOSE
          </button>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px'
        }}>
          {/* Error/Success Messages */}
          {error && (
            <div className="error-message" style={{ marginBottom: '15px' }}>
              ✗ {error}
            </div>
          )}
          {success && (
            <div style={{
              padding: '10px 15px',
              background: 'rgba(0, 255, 0, 0.1)',
              border: '1px solid var(--neon-green)',
              color: 'var(--neon-green)',
              marginBottom: '15px'
            }}>
              ✓ {success}
            </div>
          )}

          {/* Loading State */}
          {loading && (view === 'inbox' || view === 'sent') && (
            <div style={{ textAlign: 'center', color: 'var(--neon-cyan)', padding: '40px' }}>
              ⟳ LOADING TRANSMISSIONS...
            </div>
          )}

          {/* Message List (Inbox/Sent) */}
          {!loading && (view === 'inbox' || view === 'sent') && (
            <>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
                  {view === 'inbox' ? '◇ No messages in your ship computer' : '◇ No sent messages'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      onClick={() => openMessage(msg)}
                      style={{
                        padding: '15px',
                        background: msg.isRead ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 255, 255, 0.1)',
                        border: `1px solid ${msg.isRead ? 'var(--text-secondary)' : 'var(--neon-cyan)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '5px'
                      }}>
                        <span style={{
                          color: msg.isRead ? 'var(--text-primary)' : 'var(--neon-cyan)',
                          fontWeight: msg.isRead ? 'normal' : 'bold'
                        }}>
                          {!msg.isRead && '● '}{msg.senderName}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          {formatDate(msg.sentAt)}
                        </span>
                      </div>
                      <div style={{
                        color: 'var(--text-secondary)',
                        fontSize: '13px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {msg.subject || '(no subject)'} - {msg.body.substring(0, 50)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Read Message View */}
          {view === 'read' && selectedMessage && (
            <div>
              <button
                onClick={() => handleViewChange('inbox')}
                className="cyberpunk-button"
                style={{
                  marginBottom: '15px',
                  padding: '8px 15px',
                  fontSize: '12px'
                }}
              >
                ◄ BACK TO INBOX
              </button>

              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--neon-cyan)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '15px',
                  paddingBottom: '15px',
                  borderBottom: '1px solid var(--neon-cyan)'
                }}>
                  <div>
                    <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold' }}>
                      FROM: {selectedMessage.senderName}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {formatDate(selectedMessage.sentAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleReply(selectedMessage)}
                      className="cyberpunk-button"
                      style={{
                        padding: '8px 15px',
                        fontSize: '12px',
                        background: 'rgba(0, 255, 0, 0.1)',
                        borderColor: 'var(--neon-green)',
                        color: 'var(--neon-green)'
                      }}
                    >
                      ↩ REPLY
                    </button>
                    <button
                      onClick={() => handleDelete(selectedMessage.id)}
                      className="cyberpunk-button"
                      style={{
                        padding: '8px 15px',
                        fontSize: '12px',
                        background: 'rgba(255, 20, 147, 0.1)',
                        borderColor: 'var(--neon-pink)',
                        color: 'var(--neon-pink)'
                      }}
                    >
                      ✕ DELETE
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <div style={{ color: 'var(--neon-green)', fontSize: '12px', marginBottom: '5px' }}>
                    SUBJECT:
                  </div>
                  <div style={{ color: 'var(--text-primary)' }}>
                    {selectedMessage.subject || '(no subject)'}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--neon-green)', fontSize: '12px', marginBottom: '5px' }}>
                    MESSAGE:
                  </div>
                  <div style={{
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.6'
                  }}>
                    {selectedMessage.body}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Compose View */}
          {view === 'compose' && (
            <form onSubmit={handleSend}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  color: 'var(--neon-green)',
                  fontSize: '12px',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }}>
                  TO:
                </label>
                {playersInSector.length > 0 ? (
                  <select
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value ? Number(e.target.value) : '')}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid var(--neon-cyan)',
                      color: 'var(--text-primary)',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">-- Select recipient --</option>
                    {playersInSector.map(p => (
                      <option key={p.id} value={p.id}>{p.corpName}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    padding: '15px',
                    background: 'rgba(255, 20, 147, 0.1)',
                    border: '1px solid var(--neon-pink)',
                    color: 'var(--neon-pink)',
                    fontSize: '13px'
                  }}>
                    ⚠ No other ships detected in this sector. Move to a sector with other players to send messages.
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  color: 'var(--neon-green)',
                  fontSize: '12px',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }}>
                  SUBJECT (OPTIONAL):
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  placeholder="Enter subject..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-cyan)',
                    color: 'var(--text-primary)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  color: 'var(--neon-green)',
                  fontSize: '12px',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }}>
                  MESSAGE:
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  maxLength={2000}
                  rows={8}
                  placeholder="Enter your message..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-cyan)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    resize: 'vertical',
                    minHeight: '150px'
                  }}
                />
                <div style={{
                  textAlign: 'right',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginTop: '5px'
                }}>
                  {body.length}/2000
                </div>
              </div>

              <button
                type="submit"
                disabled={sending || !recipientId || !body.trim()}
                className="cyberpunk-button"
                style={{
                  width: '100%',
                  padding: '15px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  background: 'rgba(0, 255, 0, 0.2)',
                  borderColor: 'var(--neon-green)',
                  color: 'var(--neon-green)',
                  opacity: (sending || !recipientId || !body.trim()) ? 0.5 : 1
                }}
              >
                {sending ? '⟳ TRANSMITTING...' : '► SEND TRANSMISSION'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

