import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface DynamicEventRow {
  id: number;
  universeId: number;
  type: string;
  state: string;
  regionSectors: number[];
  brewingEndsAt: string;
  activeEndsAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface EventControlsProps {
  universeId: number;
  token: string;
}

const EVENT_TYPES = ['ion_storm', 'incursion', 'port_strike'];

// Countdown text for a future timestamp, or "due now" once it passes.
const countdown = (iso: string | null): string => {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'due now';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

// Dynamic event controls for one universe card: the on/off switch,
// seeding cooldown, live events with countdowns, force start and
// force resolve, and recent history. Events that are live when the
// switch goes off finish naturally; only seeding stops.
export default function EventControls({ universeId, token }: EventControlsProps) {
  const [events, setEvents] = useState<DynamicEventRow[]>([]);
  const [eventsEnabled, setEventsEnabled] = useState(true);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [startType, setStartType] = useState('ion_storm');
  const [busy, setBusy] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = async () => {
    try {
      const [eventsRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/events/admin/all?universeId=${universeId}`, { headers: authHeaders }),
        fetch(`${API_URL}/api/events/admin/settings?universeId=${universeId}`, { headers: authHeaders }),
      ]);
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setEventsEnabled(!!data.settings.eventsEnabled);
        setCooldownUntil(data.settings.cooldownUntil || null);
      }
    } catch {
      // Panel stays quiet if the API is unreachable.
    }
  };

  useEffect(() => {
    load();
    // Refresh so countdowns stay honest while the panel sits open.
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
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

  const toggleEnabled = async (next: boolean) => {
    setEventsEnabled(next);
    await post('settings', { universeId, enabled: next }, 'Toggle events');
  };

  const live = events.filter((e) => e.state === 'brewing' || e.state === 'active');
  const history = events.filter((e) => e.state === 'resolved').slice(0, 8);
  const cooldownActive = cooldownUntil !== null && new Date(cooldownUntil).getTime() > Date.now();

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '10px' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Dynamic Events</div>
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: '13px',
          marginBottom: '8px',
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={eventsEnabled}
            disabled={busy}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />{' '}
          Events enabled in this universe
        </label>
        <span style={{ opacity: 0.8 }}>
          {cooldownActive
            ? `Seeding cooldown until ${new Date(cooldownUntil as string).toLocaleString()}`
            : 'No seeding cooldown'}
        </span>
      </div>
      {!eventsEnabled && (
        <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '8px' }}>
          Live events below still finish on their own; no new events seed while this is off.
        </div>
      )}
      <div style={{ fontSize: '13px', marginBottom: '8px' }}>
        {live.length === 0
          ? 'No events brewing or active right now.'
          : live.map((e) => (
              <div
                key={e.id}
                style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}
              >
                <span>
                  {e.type} · {e.state} · sectors {e.regionSectors.join(', ') || 'none'} ·{' '}
                  {e.state === 'brewing'
                    ? `starts in ${countdown(e.brewingEndsAt)}`
                    : `ends in ${countdown(e.activeEndsAt)}`}
                </span>
                <button
                  disabled={busy}
                  onClick={() => post(`${e.id}/resolve`, {}, 'Force resolve event')}
                >
                  Resolve
                </button>
              </div>
            ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
        <select value={startType} onChange={(e) => setStartType(e.target.value)}>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() => post('force-start', { universeId, type: startType }, 'Force start event')}
        >
          Force start (30 min warning)
        </button>
      </div>
      {history.length > 0 && (
        <div style={{ fontSize: '12px', opacity: 0.8 }}>
          <div style={{ marginBottom: '4px' }}>Recent history</div>
          {history.map((e) => (
            <div key={e.id}>
              {e.type} · sectors {e.regionSectors.join(', ') || 'none'} · resolved{' '}
              {e.resolvedAt ? new Date(e.resolvedAt).toLocaleString() : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
