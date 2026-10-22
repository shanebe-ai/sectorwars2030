import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface Patrol {
  id: number;
  universeId: number;
  sectorNumber: number;
  spawnedAt: string;
  expiresAt: string;
}

interface PatrolControlsProps {
  universeId: number;
  token: <redacted>
}

// Customs patrol controls for one universe card, sitting alongside
// the season controls and the event endpoints. Force spawn, force
// clear, and the scan tuning knobs (chance multiplier, sweep size).
export default function PatrolControls({ universeId, token }: PatrolControlsProps) {
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [scanMultiplier, setScanMultiplier] = useState(1);
  const [patrolCount, setPatrolCount] = useState(4);
  const [busy, setBusy] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = async () => {
    try {
      const [patrolsRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/events/admin/patrols?universeId=${universeId}`, { headers: authHeaders }),
        fetch(`${API_URL}/api/events/admin/smuggling/settings?universeId=${universeId}`, { headers: authHeaders }),
      ]);
      if (patrolsRes.ok) {
        const data = await patrolsRes.json();
        setPatrols(data.patrols || []);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setScanMultiplier(data.settings.scanChanceMultiplier);
        setPatrolCount(data.settings.patrolCount);
      }
    } catch {
      // Panel stays quiet if the API is unreachable.
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeId]);

  const post = async (path: string, body: Record<string, unknown>, label: string) => {
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/events/admin/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) alert(`${label} failed: ${data.error}`);
      await load();
    } catch (err) {
      alert(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/events/admin/smuggling/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ universeId, scanChanceMultiplier: scanMultiplier, patrolCount }),
      });
      const data = await response.json();
      if (!response.ok) alert(`Save tuning failed: ${data.error}`);
      await load();
    } catch (err) {
      alert(`Save tuning failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSpawn = () => {
    const sector = prompt('Sector for the patrol (leave blank for a weighted random sector; TerraSpace 1 to 10 is refused):', '');
    if (sector === null) return;
    const body: Record<string, unknown> = { universeId };
    if (sector.trim() !== '') body.sectorNumber = Number(sector);
    post('patrols/spawn', body, 'Force spawn patrol');
  };

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '10px' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Customs Patrols</div>
      <div style={{ fontSize: '13px', marginBottom: '8px' }}>
        {patrols.length === 0
          ? 'No patrols on sweep in this universe right now.'
          : `On sweep in sectors: ${patrols.map((p) => p.sectorNumber).join(', ')}`}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button disabled={busy} onClick={handleSpawn}>Force spawn patrol</button>
        <button
          disabled={busy || patrols.length === 0}
          onClick={() => post('patrols/clear', { universeId }, 'Force clear patrols')}
        >
          Force clear patrols
        </button>
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
        <label>
          Scan chance multiplier{' '}
          <input
            type="number"
            step="0.1"
            min="0"
            max="10"
            value={scanMultiplier}
            onChange={(e) => setScanMultiplier(parseFloat(e.target.value) || 0)}
            style={{ width: '70px' }}
          />
        </label>
        <label>
          Patrols per universe{' '}
          <input
            type="number"
            step="1"
            min="0"
            max="50"
            value={patrolCount}
            onChange={(e) => setPatrolCount(parseInt(e.target.value) || 0)}
            style={{ width: '60px' }}
          />
        </label>
        <button disabled={busy} onClick={saveSettings}>Save tuning</button>
      </div>
    </div>
  );
}
