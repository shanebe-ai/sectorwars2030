import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config/api';

// Black market section for a port. Prices shown are the snapshot from
// the last maintenance tick (stale on purpose, and labelled with when
// they were set), contraband trades need an explicit confirm step,
// and the customs auction sells seized cargo back into the legal market.

interface MarketEntry {
  sectorNumber: number;
  portName: string;
  portType: string;
  marketOpen: boolean;
  closesAt: string | null;
  premiumMultiplier: number;
  prices: Record<string, { buy: number; sell: number }>;
  pricesAsOf: string | null;
  auctionLots: number;
}

interface SmugglingStatus {
  cargo: Record<string, number>;
  contrabandUnits: number;
  holdUsed: number;
  holdMax: number;
  reputation: number;
  flagged: boolean;
  flaggedUntil: string | null;
}

interface AuctionLot {
  id: number;
  commodity: string;
  displayName: string;
  quantity: number;
  unitPrice: number;
  expiresAt: string;
}

const GOODS: Array<{ key: string; label: string }> = [
  { key: 'banned_tech', label: 'Banned Tech' },
  { key: 'restricted_meds', label: 'Restricted Meds' },
  { key: 'stolen_artifacts', label: 'Stolen Artifacts' },
];

interface BlackMarketPanelProps {
  sectorNumber: number;
  token: <redacted>
  onTradeComplete?: (updatedPlayer: any) => void;
}

export default function BlackMarketPanel({ sectorNumber, token, onTradeComplete }: BlackMarketPanelProps) {
  const [board, setBoard] = useState<MarketEntry[]>([]);
  const [status, setStatus] = useState<SmugglingStatus | null>(null);
  const [lots, setLots] = useState<AuctionLot[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [armed, setArmed] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const refresh = useCallback(async () => {
    try {
      const [marketsRes, statusRes, auctionsRes] = await Promise.all([
        fetch(`${API_URL}/api/smuggling/markets`, { headers: authHeaders }),
        fetch(`${API_URL}/api/smuggling/status`, { headers: authHeaders }),
        fetch(`${API_URL}/api/smuggling/auctions`, { headers: authHeaders }),
      ]);
      if (marketsRes.ok) {
        const data = await marketsRes.json();
        setBoard(data.markets || []);
      }
      if (statusRes.ok) setStatus(await statusRes.json());
      if (auctionsRes.ok) {
        const data = await auctionsRes.json();
        setLots(data.auctions || []);
      }
    } catch {
      // The underworld wire is best effort; the legal port still works.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const here = board.find((m) => m.sectorNumber === sectorNumber);
  const openElsewhere = board.filter((m) => m.marketOpen && m.sectorNumber !== sectorNumber);

  const doTrade = async (commodity: string, action: 'buy' | 'sell') => {
    const key = `${commodity}:${action}`;
    if (armed !== key) {
      setArmed(key);
      setMessage('Contraband is opt in. Press confirm to go through with it.');
      return;
    }
    setBusy(true);
    setArmed(null);
    try {
      const res = await fetch(`${API_URL}/api/smuggling/trade`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commodity, action, quantity: quantities[commodity] || 1, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');
      setMessage(`Done. ${data.quantity} units of ${commodity.replace(/_/g, ' ')} ${action === 'buy' ? 'aboard' : 'sold'} for ${data.totalCost} credits. Prices were the snapshot from ${data.pricesAsOf ? new Date(data.pricesAsOf).toLocaleTimeString() : 'the last tick'}.`);
      await refresh();
      if (data.player) onTradeComplete?.(data.player);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const buyLot = async (lot: AuctionLot) => {
    const key = `lot:${lot.id}`;
    if (armed !== key) {
      setArmed(key);
      setMessage('Auction goods are legal to buy and still contraband to carry. Press confirm to bid.');
      return;
    }
    setBusy(true);
    setArmed(null);
    try {
      const res = await fetch(`${API_URL}/api/smuggling/auction/buy`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId: lot.id, quantity: lot.quantity, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purchase failed');
      setMessage(`Lot won: ${data.quantity} units of ${lot.displayName} for ${data.totalCost} credits.`);
      await refresh();
      if (data.player) onTradeComplete?.(data.player);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      margin: '15px 20px 20px 20px',
      padding: '15px',
      background: 'rgba(180, 0, 255, 0.06)',
      border: '1px solid #b400ff',
    }}>
      <div style={{ color: '#d580ff', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px' }}>
        ► THE UNDERSIDE (BLACK MARKET AND CUSTOMS)
      </div>

      {status?.flagged && (
        <div style={{
          padding: '10px',
          marginBottom: '10px',
          background: 'rgba(255, 60, 60, 0.15)',
          border: '1px solid #ff3c3c',
          color: '#ff8080',
          fontSize: '13px',
          fontWeight: 'bold',
        }}>
          ⚑ YOU ARE FLAGGED. Customs has marked your ship until {status.flaggedUntil ? new Date(status.flaggedUntil).toLocaleString() : 'further notice'}. Every pilot can see it, and patrol scans read you more easily.
        </div>
      )}

      {status && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          Cargo scanner: {status.contrabandUnits > 0
            ? GOODS.map((g) => `${g.label} ${status.cargo[g.key] || 0}`).join(' • ')
            : 'no contraband in hold'}
          {' '}• Holds {status.holdUsed}/{status.holdMax} • Customs reputation {status.reputation}
        </div>
      )}

      {here?.marketOpen ? (
        <div>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '6px' }}>
            A black market is operating at this port
            {here.closesAt ? ` until about ${new Date(here.closesAt).toLocaleTimeString()}` : ''}.
            {here.premiumMultiplier > 1.3 && ' A strike premium is in effect: the market is paying over the odds.'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginBottom: '10px' }}>
            Prices are the snapshot from the last maintenance tick
            {here.pricesAsOf ? ` (${new Date(here.pricesAsOf).toLocaleString()})` : ''}. They do not move until the next tick, for you or anyone else.
          </div>
          {GOODS.map((good) => {
            const quote = here.prices[good.key];
            if (!quote) return null;
            const qty = quantities[good.key] || 1;
            return (
              <div key={good.key} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px', marginBottom: '6px',
                background: 'rgba(0,0,0,0.35)', fontSize: '13px',
                color: 'var(--text-primary)', flexWrap: 'wrap',
              }}>
                <span style={{ minWidth: '130px', color: '#d580ff' }}>{good.label}</span>
                <span>Buy {quote.buy} cr</span>
                <span>Sell {quote.sell} cr</span>
                <span style={{ opacity: 0.8 }}>In hold: {status?.cargo[good.key] || 0}</span>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQuantities({ ...quantities, [good.key]: Math.max(1, parseInt(e.target.value) || 1) })}
                  style={{ width: '64px', background: '#111', color: '#fff', border: '1px solid #555', padding: '4px' }}
                />
                <button
                  className="cyberpunk-button"
                  disabled={busy}
                  onClick={() => doTrade(good.key, 'buy')}
                  style={{ padding: '6px 10px' }}
                >
                  {armed === `${good.key}:buy` ? 'CONFIRM BUY' : 'BUY'}
                </button>
                <button
                  className="cyberpunk-button"
                  disabled={busy}
                  onClick={() => doTrade(good.key, 'sell')}
                  style={{ padding: '6px 10px' }}
                >
                  {armed === `${good.key}:sell` ? 'CONFIRM SELL' : 'SELL'}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          No black market at this port right now.
          {openElsewhere.length > 0 && (
            <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.85 }}>
              The wire says one is open at {openElsewhere.map((m) => `${m.portName} (Sector ${m.sectorNumber})`).join(', ')}. Prices there are last tick values, so check before you fly.
            </div>
          )}
        </div>
      )}

      {lots.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: '#ffd580', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
            ⚖ CUSTOMS AUCTION AT THIS PORT
          </div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginBottom: '8px' }}>
            Seized contraband, sold back into the legal market by the Port Authority. Buying is legal. Carrying it is still smuggling.
          </div>
          {lots.map((lot) => (
            <div key={lot.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px', marginBottom: '6px',
              background: 'rgba(0,0,0,0.35)', fontSize: '13px', color: 'var(--text-primary)',
            }}>
              <span style={{ color: '#ffd580' }}>{lot.displayName}</span>
              <span>{lot.quantity} units at {lot.unitPrice} cr</span>
              <span style={{ opacity: 0.8 }}>Ends {new Date(lot.expiresAt).toLocaleTimeString()}</span>
              <button
                className="cyberpunk-button"
                disabled={busy}
                onClick={() => buyLot(lot)}
                style={{ padding: '6px 10px' }}
              >
                {armed === `lot:${lot.id}` ? 'CONFIRM BID' : 'BUY LOT'}
              </button>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#d580ff' }}>{message}</div>
      )}
    </div>
  );
}
