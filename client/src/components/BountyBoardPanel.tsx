import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface BountyEntry {
  targetPlayerId: number;
  targetName: string;
  totalAmount: number;
  contractCount: number;
  lastKnownSector: number | null;
  targetFlagged?: boolean;
}

interface HunterEntry {
  corp_name: string;
  bounties_claimed: number;
  bounty_credits_earned: number;
}

interface BountyBoardPanelProps {
  token: string;
  onClose: () => void;
  onBountyPlaced?: () => void;
}

export default function BountyBoardPanel({ token, onClose, onBountyPlaced }: BountyBoardPanelProps) {
  const [tab, setTab] = useState<'board' | 'hunters' | 'place'>('board');
  const [board, setBoard] = useState<BountyEntry[]>([]);
  const [hunters, setHunters] = useState<HunterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Place bounty form
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState('');
  const [signed, setSigned] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const [placeSuccess, setPlaceSuccess] = useState('');

  useEffect(() => {
    if (tab === 'board') loadBoard();
    if (tab === 'hunters') loadHunters();
  }, [tab]);

  const loadBoard = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/bounties/board`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBoard(data.board || []);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load bounty board');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const loadHunters = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/bounties/hunters`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHunters(data.hunters || []);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load hunters');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceBounty = async () => {
    setPlacing(true);
    setPlaceError('');
    setPlaceSuccess('');
    try {
      const response = await fetch(`${API_URL}/api/bounties`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetPlayerId: parseInt(targetId),
          amount: parseInt(amount),
          signed
        })
      });
      const data = await response.json();
      if (response.ok) {
        setPlaceSuccess(`Bounty placed on ${data.bounty.targetName} for ${parseInt(amount).toLocaleString()} credits.`);
        setTargetId('');
        setAmount('');
        setSigned(false);
        if (onBountyPlaced) onBountyPlaced();
      } else {
        setPlaceError(data.error || 'Failed to place bounty');
      }
    } catch (err) {
      setPlaceError('Network error');
    } finally {
      setPlacing(false);
    }
  };

  const formatCredits = (num: number) => `₡${num.toLocaleString()}`;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--neon-red)',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '700px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'var(--neon-red)', margin: 0 }}>Bounty Board</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--neon-red)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['board', 'hunters', 'place'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                backgroundColor: tab === t ? 'var(--neon-red)' : 'transparent',
                color: tab === t ? '#000' : 'var(--neon-red)',
                border: '1px solid var(--neon-red)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                textTransform: 'capitalize'
              }}
            >
              {t === 'board' ? 'Contracts' : t === 'hunters' ? 'Hunters' : 'Place Bounty'}
            </button>
          ))}
        </div>

        {tab === 'board' && (
          <div>
            {loading && <p style={{ color: 'var(--text-dim)' }}>Loading contracts...</p>}
            {error && <p style={{ color: '#ff5555' }}>{error}</p>}
            {!loading && !error && board.length === 0 && (
              <p style={{ color: 'var(--text-dim)' }}>No active bounties. The galaxy is peaceful... for now.</p>
            )}
            {!loading && !error && board.map((entry) => (
              <div key={entry.targetPlayerId} style={{
                border: '1px solid var(--border-dim)',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-main)', fontWeight: 'bold', fontSize: '16px' }}>
                    {entry.targetName}
                    {entry.targetFlagged && (
                      <span style={{ color: '#ff3c3c', marginLeft: '8px', fontSize: '13px' }}>⚑ FLAGGED BY CUSTOMS</span>
                    )}
                  </span>
                  <span style={{ color: 'var(--neon-red)', fontWeight: 'bold', fontSize: '18px' }}>
                    {formatCredits(entry.totalAmount)}
                  </span>
                </div>
                <div style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '4px' }}>
                  {entry.contractCount} contract{entry.contractCount !== 1 ? 's' : ''}
                  {entry.lastKnownSector !== null && ` · Last seen: Sector ${entry.lastKnownSector}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'hunters' && (
          <div>
            {loading && <p style={{ color: 'var(--text-dim)' }}>Loading hunters...</p>}
            {error && <p style={{ color: '#ff5555' }}>{error}</p>}
            {!loading && !error && hunters.length === 0 && (
              <p style={{ color: 'var(--text-dim)' }}>No hunters yet. Be the first.</p>
            )}
            {!loading && !error && hunters.map((hunter, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--border-dim)',
                color: 'var(--text-main)'
              }}>
                <span>#{idx + 1} {hunter.corp_name}</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {hunter.bounties_claimed} claimed · {formatCredits(hunter.bounty_credits_earned)}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'place' && (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                Target Player ID
              </label>
              <input
                type="number"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="Enter player ID"
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: '4px',
                  color: 'var(--text-main)'
                }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                Bounty Amount (min ₡5,000, held in escrow)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
                min="5000"
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: '4px',
                  color: 'var(--text-main)'
                }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={signed}
                  onChange={(e) => setSigned(e.target.checked)}
                />
                Sign this bounty (publicly attach your name)
              </label>
            </div>
            {placeError && <p style={{ color: '#ff5555' }}>{placeError}</p>}
            {placeSuccess && <p style={{ color: '#55ff55' }}>{placeSuccess}</p>}
            <button
              onClick={handlePlaceBounty}
              disabled={placing || !targetId || !amount}
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--neon-red)',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: placing ? 'wait' : 'pointer',
                fontWeight: 'bold',
                opacity: (!targetId || !amount) ? 0.5 : 1
              }}
            >
              {placing ? 'Posting...' : 'Post Bounty'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
