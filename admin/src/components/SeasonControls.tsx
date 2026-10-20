import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface Season {
  id: number;
  name: string;
  seasonNumber: number;
  endsAt: string;
}

interface SeasonControlsProps {
  universeId: number;
  token: string;
}

// Season status and controls for one universe card. Ending a season
// only archives the standings; no player data changes.
export default function SeasonControls({ universeId, token }: SeasonControlsProps) {
  const [available, setAvailable] = useState(false);
  const [current, setCurrent] = useState<Season | null>(null);
  const [pastCount, setPastCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const response = await fetch(`${API_URL}/api/seasons/universe/${universeId}`);
      if (!response.ok) return;
      const data = await response.json();
      setAvailable(!!data.available);
      setCurrent(data.current || null);
      setPastCount((data.seasons || []).filter((s: { status: string }) => s.status === 'ended').length);
    } catch {
      setAvailable(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeId]);

  const post = async (path: string, body: Record<string, unknown>, label: string) => {
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/seasons/admin/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(`${label} failed: ${data.error}`);
      }
      await load();
    } catch (err) {
      alert(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () => {
    const days = prompt('Season length in days (1 to 365):', '30');
    if (days === null) return;
    const name = prompt('Season name (leave blank for "Season N"):', '') || '';
    post('start', { universeId, durationDays: Number(days), name }, 'Start season');
  };

  const handleExtend = () => {
    if (!current) return;
    const days = prompt(`Extend ${current.name} by how many days?`, '7');
    if (days === null) return;
    post(`${current.id}/extend`, { days: Number(days) }, 'Extend season');
  };

  const handleEnd = () => {
    if (!current) return;
    if (!confirm(`End ${current.name} now? Standings are archived to the Hall of Fame. Player ships, cargo, credits and planets are not changed.`)) {
      return;
    }
    post(`${current.id}/end`, {}, 'End season');
  };

  if (!available) {
    return (
      <div className="stat-row">
        <span className="stat-row-label">SEASON:</span>
        <span className="stat-row-value" style={{ opacity: 0.6 }}>NOT SET UP (MIGRATION 034)</span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <div className="stat-row">
        <span className="stat-row-label">SEASON:</span>
        <span className="stat-row-value">
          {current
            ? `${current.name.toUpperCase()} · ENDS ${new Date(current.endsAt).toLocaleString()}`
            : 'NONE RUNNING'}
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-row-label">PAST SEASONS:</span>
        <span className="stat-row-value">{pastCount}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        {!current && (
          <button
            onClick={handleStart}
            disabled={busy}
            className="cyberpunk-button cyberpunk-button-success"
            style={{ flex: 1, padding: '8px', fontSize: '11px' }}
          >
            ► START SEASON
          </button>
        )}
        {current && (
          <>
            <button
              onClick={handleExtend}
              disabled={busy}
              className="cyberpunk-button"
              style={{ flex: 1, padding: '8px', fontSize: '11px' }}
            >
              + EXTEND
            </button>
            <button
              onClick={handleEnd}
              disabled={busy}
              className="cyberpunk-button cyberpunk-button-danger"
              style={{ flex: 1, padding: '8px', fontSize: '11px' }}
            >
              ■ END NOW
            </button>
          </>
        )}
      </div>
    </div>
  );
}
