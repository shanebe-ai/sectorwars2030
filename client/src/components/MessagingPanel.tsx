import { useState, useEffect } from 'react';
import type { Message, MessageType, KnownTrader, AlienCommunication, AlienCommsResponse } from '../../../shared/types';
import { API_URL } from '../config/api';

interface MessagingPanelProps {
  token: string;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export default function MessagingPanel({ token, onClose, onUnreadCountChange }: MessagingPanelProps) {
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const [view, setView] = useState<'inbox' | 'broadcasts' | 'corporate' | 'alien' | 'sent' | 'compose' | 'read'>('inbox');
  const [previousView, setPreviousView] = useState<'inbox' | 'broadcasts' | 'corporate' | 'alien' | 'sent'>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [knownTraders, setKnownTraders] = useState<KnownTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Unread counts per channel
  const [unreadCounts, setUnreadCounts] = useState({ inbox: 0, broadcasts: 0, corporate: 0 });
  
  // Corporation state (includes member count to hide corp chat if only 1 member)
  const [corporation, setCorporation] = useState<{ id: number; name: string; memberCount: number } | null>(null);
  
  // Alien comms state
  const [alienComms, setAlienComms] = useState<AlienCommunication[]>([]);
  const [alienCommsUnlocked, setAlienCommsUnlocked] = useState(false);

  // Compose form state
  const [messageType, setMessageType] = useState<MessageType>('DIRECT');
  const [recipientId, setRecipientId] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadInbox();
    loadKnownTraders();
    loadUnreadCounts();
    loadCorporation();
  }, []);

  const loadInbox = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/messages/inbox`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
        const unreadCount = data.messages.filter((m: Message) => !m.is_read).length;
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

  const loadBroadcasts = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/messages/broadcasts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
        // Server marks broadcasts as read, reload counts
        loadUnreadCounts();
      } else {
        setError(data.error || 'Failed to load broadcasts');
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
      const response = await fetch(`${API_URL}/api/messages/sent`, {
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

  const loadKnownTraders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/messages/known-traders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setKnownTraders(data.traders);
      }
    } catch (err) {
      // Silent fail - not critical
    }
  };

  const loadUnreadCounts = async () => {
    try {
      const response = await fetch(`${API_URL}/api/messages/unread-count`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok && data.counts) {
        setUnreadCounts(data.counts);
        onUnreadCountChange?.(data.unreadCount);
      }
    } catch (err) {
      // Silent fail
    }
  };

  const loadCorporation = async () => {
    try {
      const response = await fetch(`${API_URL}/api/messages/corporation`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setCorporation(data.corporation);
      }
    } catch (err) {
      // Silent fail
    }
  };

  const loadAlienComms = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/aliens/comms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data: AlienCommsResponse = await response.json();
      if (response.ok) {
        setAlienCommsUnlocked(data.unlocked);
        setAlienComms(data.communications);
      } else {
        setError(data.error || 'Failed to load alien communications');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const loadCorporateMessages = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/messages/corporate`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
        // Server marks corporate messages as read, reload counts
        loadUnreadCounts();
      } else {
        setError(data.error || 'Failed to load corporate messages');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewChange = (newView: typeof view) => {
    if (newView !== 'read' && newView !== 'compose') {
      setPreviousView(newView);
    }
    setView(newView);
    setError('');
    setSuccess('');
    setSelectedMessage(null);

    if (newView === 'inbox') {
      loadInbox();
    } else if (newView === 'broadcasts') {
      loadBroadcasts();
    } else if (newView === 'corporate') {
      loadCorporateMessages();
    } else if (newView === 'alien') {
      loadAlienComms();
    } else if (newView === 'sent') {
      loadSentMessages();
    } else if (newView === 'compose') {
      // Reset compose form
      setMessageType('DIRECT');
      setRecipientId('');
      setSubject('');
      setBody('');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (messageType === 'DIRECT' && !recipientId) {
      setError('Please select a recipient');
      return;
    }
    if (!body.trim()) {
      setError('Message cannot be empty');
      return;
    }

    setSending(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipientId: messageType === 'DIRECT' ? recipientId : undefined,
          subject: subject.trim() || undefined,
          body: body.trim(),
          messageType
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Message sent successfully');
        setSubject('');
        setBody('');
        setRecipientId('');
        // Reload unread counts (corporate messages show as unread until viewed)
        loadUnreadCounts();
        setTimeout(() => {
          setView('sent');
          loadSentMessages();
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

  const handleOpenMessage = async (message: Message) => {
    // Track where we came from so we can return there after delete
    if (view === 'inbox' || view === 'broadcasts' || view === 'sent') {
      setPreviousView(view);
    }
    setSelectedMessage(message);
    setView('read');

    // Mark as read if it's unread and a direct message to us
    if (!message.is_read && message.message_type === 'DIRECT') {
      try {
        await fetch(`${API_URL}/api/messages/${message.id}/read`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        // Update unread count
        loadInbox();
      } catch (err) {
        // Silent fail
      }
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      const response = await fetch(`${API_URL}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSuccess('Message deleted');
        // Return to the view we came from
        setView(previousView);
        setSelectedMessage(null);
        // Reload the appropriate list and update unread counts
        if (previousView === 'broadcasts') {
          loadBroadcasts();
        } else if (previousView === 'corporate') {
          loadCorporateMessages();
        } else if (previousView === 'sent') {
          loadSentMessages();
        } else {
          loadInbox();
        }
        loadUnreadCounts();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete message');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleAcceptInvitation = async (message: Message) => {
    // Extract corp ID from message body
    const corpIdMatch = message.body.match(/Corp ID: (\d+)/);
    if (!corpIdMatch) {
      setError('Could not find corporation ID in invitation');
      return;
    }

    const corpId = parseInt(corpIdMatch[1]);

    try {
      const response = await fetch(`${API_URL}/api/corporations/accept-invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ corpId })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`You have joined ${data.corpName}! Refreshing...`);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setError(data.error || 'Failed to accept invitation');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleReply = (message: Message) => {
    setView('compose');
    setMessageType('DIRECT');
    setRecipientId(message.sender_id || '');
    setSubject(`RE: ${message.subject || '(no subject)'}`);
    setBody(`\n\n--- Original Message from ${message.sender_name} ---\n${message.body}`);
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
        maxWidth: '800px',
        maxHeight: '85vh',
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
          padding: '0 20px',
          flexWrap: 'wrap'
        }}>
          <TabButton
            label="◄ INBOX"
            active={view === 'inbox'}
            onClick={() => handleViewChange('inbox')}
            badge={unreadCounts.inbox}
          />
          <TabButton
            label="◉ BROADCASTS"
            active={view === 'broadcasts'}
            onClick={() => handleViewChange('broadcasts')}
            badge={unreadCounts.broadcasts}
          />
          {corporation && (
            <TabButton
              label="★ CORPORATE"
              active={view === 'corporate'}
              onClick={() => handleViewChange('corporate')}
              color="purple"
              badge={unreadCounts.corporate}
            />
          )}
          <TabButton
            label="👽 ALIEN"
            active={view === 'alien'}
            onClick={() => handleViewChange('alien')}
            color="purple"
            style={{ color: alienCommsUnlocked ? '#9d00ff' : '#666' }}
          />
          <TabButton
            label="► SENT"
            active={view === 'sent'}
            onClick={() => handleViewChange('sent')}
          />
          <TabButton
            label="✎ COMPOSE"
            active={view === 'compose'}
            onClick={() => handleViewChange('compose')}
            color="green"
            style={{ marginLeft: 'auto' }}
          />
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px'
        }}>
          {error && (
            <div style={{ color: 'var(--neon-pink)', marginBottom: '15px', textAlign: 'center' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ color: 'var(--neon-green)', marginBottom: '15px', textAlign: 'center' }}>
              {success}
            </div>
          )}

          {view === 'inbox' && (
            <MessageList
              messages={messages}
              loading={loading}
              onOpenMessage={handleOpenMessage}
              type="inbox"
              formatDateTime={formatDateTime}
            />
          )}

          {view === 'broadcasts' && (
            <MessageList
              messages={messages}
              loading={loading}
              onOpenMessage={handleOpenMessage}
              type="broadcasts"
              formatDateTime={formatDateTime}
            />
          )}

          {view === 'corporate' && (
            <MessageList
              messages={messages}
              loading={loading}
              onOpenMessage={handleOpenMessage}
              type="corporate"
              formatDateTime={formatDateTime}
            />
          )}

          {view === 'alien' && (
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9d00ff' }}>
                  ⟳ Scanning frequencies...
                </div>
              ) : !alienCommsUnlocked ? (
                <div style={{
                  border: '2px solid #ff0099',
                  borderRadius: '8px',
                  padding: '2rem',
                  background: 'rgba(255, 0, 153, 0.1)',
                  textAlign: 'center'
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
              ) : (
                <div>
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
                  {alienComms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                      <p>📡 No transmissions detected yet.</p>
                      <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                        Alien activity will appear here as it happens.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {alienComms.map((comm) => {
                        const getMessageTypeColor = (type: string) => {
                          switch (type) {
                            case 'encounter': return '#00ff00';
                            case 'combat': return '#ff0099';
                            case 'death': return '#ff0000';
                            case 'escape_pod': return '#ff9900';
                            case 'sector_entry': return '#00ffff';
                            case 'planet_attack': return '#ff0000';
                            case 'threat': return '#ff0099';
                            default: return '#ffffff';
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
                        return (
                          <div
                            key={comm.id}
                            style={{
                              background: 'rgba(0, 0, 0, 0.5)',
                              border: `1px solid ${getMessageTypeColor(comm.messageType)}`,
                              borderRadius: '4px',
                              padding: '0.75rem'
                            }}
                          >
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
                            <div style={{
                              color: '#ffffff',
                              fontSize: '0.9rem',
                              lineHeight: '1.4',
                              fontFamily: 'monospace'
                            }}>
                              {comm.message}
                            </div>
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
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {view === 'sent' && (
            <MessageList
              messages={messages}
              loading={loading}
              onOpenMessage={handleOpenMessage}
              type="sent"
              formatDateTime={formatDateTime}
            />
          )}

          {view === 'compose' && (
            <ComposeForm
              messageType={messageType}
              setMessageType={setMessageType}
              recipientId={recipientId}
              setRecipientId={setRecipientId}
              subject={subject}
              setSubject={setSubject}
              body={body}
              setBody={setBody}
              knownTraders={knownTraders}
              sending={sending}
              onSubmit={handleSendMessage}
              corporation={corporation}
            />
          )}

          {view === 'read' && selectedMessage && (
            <MessageView
              message={selectedMessage}
              onReply={handleReply}
              onDelete={handleDeleteMessage}
              onAcceptInvitation={handleAcceptInvitation}
              onBack={() => setView(previousView)}
              previousView={previousView}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Tab Button Component
function TabButton({ label, active, onClick, color = 'cyan', style = {}, badge = 0 }: any) {
  const colorMap: Record<string, { active: string; rgb: string }> = {
    cyan: { active: 'var(--neon-cyan)', rgb: '0, 255, 255' },
    green: { active: 'var(--neon-green)', rgb: '0, 255, 0' },
    purple: { active: 'var(--neon-purple)', rgb: '157, 0, 255' }
  };
  const { active: activeColor, rgb } = colorMap[color] || colorMap.cyan;

  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 20px',
        background: active ? `rgba(${rgb}, 0.1)` : 'transparent',
        border: 'none',
        borderBottom: active ? `2px solid ${activeColor}` : '2px solid transparent',
        color: active ? activeColor : 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: '13px',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
        position: 'relative',
        ...style
      }}
    >
      {label}
      {badge > 0 && (
        <span style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          background: 'var(--neon-pink)',
          color: '#000',
          borderRadius: '50%',
          width: '18px',
          height: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 'bold'
        }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// Message List Component
function MessageList({ messages, loading, onOpenMessage, type, formatDateTime }: any) {
  if (loading) {
    return <div style={{ textAlign: 'center', color: 'var(--neon-cyan)' }}>Loading...</div>;
  }

  if (messages.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
        No messages
      </div>
    );
  }

  // Broadcast/Corporate chat-style rendering
  if (type === 'broadcasts' || type === 'corporate') {
    const isCorporate = type === 'corporate';
    const tagColor = isCorporate ? 'var(--neon-green)' : 'var(--neon-purple)';
    const tagLabel = isCorporate ? '[CORPORATE]' : '[BROADCAST]';
    const hoverBg = isCorporate ? 'rgba(0, 255, 0, 0.1)' : 'rgba(0, 255, 255, 0.1)';
    
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontFamily: 'monospace'
      }}>
        {messages.map((msg: Message) => (
          <div
            key={msg.id}
            onClick={() => onOpenMessage(msg)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px',
              transition: 'background 0.2s',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)'}
          >
            <div>
              <span style={{ color: tagColor, fontWeight: 'bold' }}>{tagLabel}</span>
              {' '}
              <span style={{ color: 'var(--neon-cyan)', fontWeight: 'bold' }}>{msg.sender_name || '[Unknown]'}</span>
              {' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                ({msg.sender_name === 'TerraCorp News Network' ? 'TNN' : (msg as any).sender_corp || '[Unknown Corp]'})
              </span>
              <span style={{ color: 'var(--text-primary)' }}>: {msg.body}</span>
            </div>
            <div style={{ whiteSpace: 'nowrap', marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '11px' }}>
              {formatDateTime(msg.sent_at)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Regular inbox/sent rendering with borders
  return (
    <div>
      {messages.map((msg: Message) => (
        <div
          key={msg.id}
          onClick={() => onOpenMessage(msg)}
          style={{
            padding: '15px',
            marginBottom: '10px',
            border: `1px solid ${!msg.is_read && type === 'inbox' ? 'var(--neon-green)' : 'var(--border-color)'}`,
            borderRadius: '4px',
            cursor: 'pointer',
            background: !msg.is_read && type === 'inbox' ? 'rgba(0, 255, 0, 0.05)' : 'rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--neon-cyan)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = !msg.is_read && type === 'inbox' ? 'var(--neon-green)' : 'var(--border-color)'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ color: 'var(--neon-cyan)', fontWeight: 'bold' }}>
              {type === 'sent'
                ? `To: ${(msg as any).recipient_name || '[Unknown]'}`
                : `From: ${msg.sender_name || '[Unknown]'}`
              }
              {msg.message_type === 'BROADCAST' && <span style={{ color: 'var(--neon-purple)', marginLeft: '10px' }}>[BROADCAST]</span>}
              {msg.message_type === 'CORPORATE' && <span style={{ color: 'var(--neon-green)', marginLeft: '10px' }}>[CORPORATE]</span>}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {formatDateTime(msg.sent_at)}
            </span>
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
            {(msg.message_type === 'BROADCAST' || msg.message_type === 'CORPORATE')
              ? msg.body.substring(0, 60) + (msg.body.length > 60 ? '...' : '')
              : (msg.subject || '(no subject)')}
          </div>
          {!msg.is_read && type === 'inbox' && (
            <div style={{ marginTop: '5px', color: 'var(--neon-green)', fontSize: '11px' }}>● UNREAD</div>
          )}
        </div>
      ))}
    </div>
  );
}

// Compose Form Component
function ComposeForm({
  messageType,
  setMessageType,
  recipientId,
  setRecipientId,
  subject,
  setSubject,
  body,
  setBody,
  knownTraders,
  sending,
  onSubmit,
  corporation
}: any) {
  return (
    <form onSubmit={onSubmit}>
      {/* Message Type Selection */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neon-cyan)' }}>
          Message Type:
        </label>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              value="DIRECT"
              checked={messageType === 'DIRECT'}
              onChange={(e) => setMessageType(e.target.value as MessageType)}
              style={{ marginRight: '5px' }}
            />
            <span style={{ color: 'var(--text-primary)' }}>Direct Message</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              value="BROADCAST"
              checked={messageType === 'BROADCAST'}
              onChange={(e) => setMessageType(e.target.value as MessageType)}
              style={{ marginRight: '5px' }}
            />
            <span style={{ color: 'var(--neon-purple)' }}>Universe Broadcast</span>
          </label>
          {corporation && (
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                value="CORPORATE"
                checked={messageType === 'CORPORATE'}
                onChange={(e) => setMessageType(e.target.value as MessageType)}
                style={{ marginRight: '5px' }}
              />
              <span style={{ color: 'var(--neon-green)' }}>Corporate ({corporation.name})</span>
            </label>
          )}
        </div>
      </div>

      {/* Recipient Selection (only for direct messages) */}
      {messageType === 'DIRECT' && (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neon-cyan)' }}>
            To (Known Traders):
          </label>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(Number(e.target.value))}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid var(--neon-cyan)',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}
            required={messageType === 'DIRECT'}
          >
            <option value="">Select a trader...</option>
            {knownTraders.map((trader: KnownTrader) => (
              <option key={trader.player_id} value={trader.player_id}>
                {trader.player_name} ({trader.corp_name}) - {trader.ship_type}
              </option>
            ))}
          </select>
          {knownTraders.length === 0 && (
            <div style={{ marginTop: '10px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              No known traders yet. Travel to sectors with other players to meet them.
            </div>
          )}
        </div>
      )}

      {messageType === 'BROADCAST' && (
        <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(157, 0, 255, 0.1)', border: '1px solid var(--neon-purple)', borderRadius: '4px' }}>
          <span style={{ color: 'var(--neon-purple)', fontSize: '13px' }}>
            ⚠ This message will be visible to ALL players in the universe
          </span>
        </div>
      )}

      {messageType === 'CORPORATE' && (
        <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(0, 255, 0, 0.1)', border: '1px solid var(--neon-green)', borderRadius: '4px' }}>
          <span style={{ color: 'var(--neon-green)', fontSize: '13px' }}>
            ★ This message will be visible to all members of {corporation?.name}
          </span>
        </div>
      )}

      {messageType === 'DIRECT' && (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neon-cyan)' }}>
            Subject (optional):
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid var(--neon-cyan)',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}
            placeholder="Message subject..."
          />
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neon-cyan)' }}>
          Message:
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          required
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '10px',
            background: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid var(--neon-cyan)',
            color: 'var(--text-primary)',
            borderRadius: '4px',
            fontFamily: 'monospace',
            resize: 'vertical'
          }}
          placeholder="Type your message here..."
        />
        <div style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '12px', marginTop: '5px' }}>
          {body.length} / 2000 characters
        </div>
      </div>

      <button
        type="submit"
        disabled={sending}
        style={{
          width: '100%',
          padding: '12px',
          background: sending ? 'rgba(0, 255, 0, 0.3)' : 'var(--neon-green)',
          color: '#000',
          border: 'none',
          borderRadius: '4px',
          cursor: sending ? 'not-allowed' : 'pointer',
          fontWeight: 'bold',
          fontSize: '14px',
          textTransform: 'uppercase'
        }}
      >
        {sending ? 'Sending...' : messageType === 'BROADCAST' ? '◉ BROADCAST MESSAGE' : messageType === 'CORPORATE' ? '★ SEND TO CORP' : '► SEND MESSAGE'}
      </button>
    </form>
  );
}

// Message View Component
function MessageView({ message, onReply, onDelete, onAcceptInvitation, onBack, previousView }: any) {
  const getBackLabel = () => {
    if (previousView === 'broadcasts') return '◄ BACK TO BROADCASTS';
    if (previousView === 'corporate') return '◄ BACK TO CORPORATE';
    if (previousView === 'sent') return '◄ BACK TO SENT';
    return '◄ BACK TO INBOX';
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          marginBottom: '20px',
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid var(--neon-cyan)',
          color: 'var(--neon-cyan)',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {getBackLabel()}
      </button>

      <div style={{
        border: '1px solid var(--neon-cyan)',
        borderRadius: '4px',
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>From: </span>
            <span style={{ color: 'var(--neon-cyan)' }}>{message.sender_name || '[Unknown]'}</span>
            {message.message_type === 'BROADCAST' && (
              <span style={{ marginLeft: '10px', color: 'var(--neon-purple)' }}>[UNIVERSE BROADCAST]</span>
            )}
            {message.message_type === 'CORPORATE' && (
              <span style={{ marginLeft: '10px', color: 'var(--neon-green)' }}>[CORPORATE]</span>
            )}
          </div>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Date: </span>
            <span style={{ color: 'var(--text-primary)' }}>{new Date(message.sent_at).toLocaleString()}</span>
          </div>
          {message.message_type === 'DIRECT' && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Subject: </span>
              <span style={{ color: 'var(--text-primary)' }}>{message.subject || '(no subject)'}</span>
            </div>
          )}
        </div>

        <div style={{
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.6',
          fontFamily: 'monospace'
        }}>
          {message.body}
        </div>
      </div>

      {message.message_type === 'corp_invite' && (
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={() => onAcceptInvitation(message)}
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(255, 215, 0, 0.2)',
              color: 'var(--neon-yellow)',
              border: '2px solid var(--neon-yellow)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              textTransform: 'uppercase',
              boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)'
            }}
          >
            ✓ ACCEPT INVITATION
          </button>
          <button
            onClick={() => onDelete(message.id)}
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '10px',
              background: 'transparent',
              color: 'var(--neon-pink)',
              border: '1px solid var(--neon-pink)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ✕ DECLINE & DELETE
          </button>
        </div>
      )}

      {message.message_type === 'DIRECT' && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
          {message.sender_id && (
            <button
              onClick={() => onReply(message)}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--neon-green)',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ↩ REPLY
            </button>
          )}
          <button
            onClick={() => onDelete(message.id)}
            style={{
              flex: message.sender_id ? 1 : 'auto',
              padding: '10px',
              background: 'transparent',
              color: 'var(--neon-pink)',
              border: '1px solid var(--neon-pink)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ✕ DELETE
          </button>
        </div>
      )}

      {(message.message_type === 'BROADCAST' || message.message_type === 'CORPORATE') && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
          <button
            onClick={onBack}
            style={{
              flex: 1,
              padding: '10px',
              background: 'transparent',
              color: message.message_type === 'CORPORATE' ? 'var(--neon-green)' : 'var(--neon-cyan)',
              border: `1px solid ${message.message_type === 'CORPORATE' ? 'var(--neon-green)' : 'var(--neon-cyan)'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {getBackLabel()}
          </button>
          <button
            onClick={() => onDelete(message.id)}
            style={{
              flex: 1,
              padding: '10px',
              background: 'transparent',
              color: 'var(--neon-pink)',
              border: '1px solid var(--neon-pink)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ✕ DELETE
          </button>
        </div>
      )}
    </div>
  );
}
