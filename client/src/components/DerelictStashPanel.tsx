import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config/api';

// Derelict stash interactions for the player's current sector. A crew
// that cleared a wreck can cache contraband in it (invisible to patrol
// scans, because it is not in the hold). Any crew that finds the
// cache can loot it. Renders nothing when there is no derelict here.

interface StashInfo {
  derelict: {
    id: number;
    type: string;
    state: string;
    sectorNumber: number;
    expiresAt: string;
    clearedByYou: boolean;
  } | null;
  stashes: Array<{
    id: number;
    commodity: string;
    displayName: string;
    quantity: number;
    mine: boolean;
  }>;
  canStash: boolean;
  stashLimit: number;
}

const GOODS: Array<{ key: string; label: string }> = [
  { key: 'banned_tech', label: 'Banned Tech' },
  { key: 'restricted_meds', label: 'Restricted Meds' },
  { key: 'stolen_artifacts', label: 'Stolen Artifacts' },
];

interface DerelictStashPanelProps {
  token: <redacted>
  refreshKey?: number;
  onActionComplete?: () => void;
}

export default function DerelictStashPanel({ token, refreshKey, onActionComplete }: DerelictStashPanelProps) {
  const [info, setInfo] = useState<StashInfo | null>(null);
  const [commodity, setCommodity] = useState('banned_tech');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/smuggling/stash`, { headers: authHeaders });
      if (res.ok) setInfo(await res.json());
    } catch {
      // No derelict surface here; stay invisible.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  if (!info || !info.derelict) return null;
  const derelict = info.derelict;

  const board = async (action: 'loot' | 'claim_sell' | 'claim_swap') => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/smuggling/derelict/board`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Boarding failed');
      setMessage(data.message || 'Boarding complete.');
      await refresh();
      onActionComplete?.();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const stash = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/smuggling/stash`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ derelictId: derelict.id, commodity, quantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Stash failed');
      setMessage(data.message);
      await refresh();
      onActionComplete?.();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const retrieve = async (stashId: number) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/smuggling/stash/retrieve`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stashId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retrieval failed');
      setMessage(data.message);
      await refresh();
      onActionComplete?.();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      padding: '15px',
      background: 'rgba(180, 0, 255, 0.05)',
      border: '1px solid #b400ff',
      marginBottom: '15px',
    }}>
      <div style={{ color: '#d580ff', fontWeight: 'bold', marginBottom: '8px' }}>
        ☠ DERELICT {derelict.type.toUpperCase()} ({derelict.state.toUpperCase()})
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        The wreck breaks up around {new Date(derelict.expiresAt).toLocaleString()}. Anything cached in it goes with it.
      </div>

      {derelict.state === 'spotted' && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <button className="cyberpunk-button" disabled={busy} onClick={() => board('loot')} style={{ padding: '8px 12px' }}>
            BOARD AND LOOT
          </button>
          <button className="cyberpunk-button" disabled={busy} onClick={() => board('claim_sell')} style={{ padding: '8px 12px' }}>
            CLAIM AND SELL
          </button>
          <button className="cyberpunk-button" disabled={busy} onClick={() => board('claim_swap')} style={{ padding: '8px 12px' }}>
            CLAIM AND SWAP
          </button>
        </div>
      )}

      {info.stashes.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '6px' }}>
            Cached in the wreck (patrol scans cannot see any of this):
          </div>
          {info.stashes.map((stash) => (
            <div key={stash.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '6px 8px', marginBottom: '5px',
              background: 'rgba(0,0,0,0.35)', fontSize: '13px', color: 'var(--text-primary)',
            }}>
              <span style={{ color: '#d580ff' }}>{stash.displayName}</span>
              <span>{stash.quantity} units</span>
              <span style={{ opacity: 0.8 }}>{stash.mine ? 'your cache' : 'someone left this here'}</span>
              <button className="cyberpunk-button" disabled={busy} onClick={() => retrieve(stash.id)} style={{ padding: '5px 10px' }}>
                {stash.mine ? 'RETRIEVE' : 'LOOT IT'}
              </button>
            </div>
          ))}
        </div>
      )}

      {info.canStash && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            Cache contraband here (limit {info.stashLimit} units total):
          </span>
          <select
            value={commodity}
            onChange={(e) => setCommodity(e.target.value)}
            style={{ background: '#111', color: '#fff', border: '1px solid #555', padding: '5px' }}
          >
            {GOODS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: '64px', background: '#111', color: '#fff', border: '1px solid #555', padding: '5px' }}
          />
          <button className="cyberpunk-button" disabled={busy} onClick={stash} style={{ padding: '6px 10px' }}>
            STASH IT
          </button>
        </div>
      )}

      {!info.canStash && derelict.state === 'claimed' && !derelict.clearedByYou && info.stashes.length === 0 && (
        <div style={{ fontSize: '12px', opacity: 0.8, color: 'var(--text-secondary)' }}>
          Another crew cleared this wreck. Their cache, if any, would be listed above.
        </div>
      )}

      {message && <div style={{ marginTop: '10px', fontSize: '12px', color: '#d580ff' }}>{message}</div>}
    </div>
  );
}
