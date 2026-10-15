import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface MarketEntry {
  sectorNumber: number;
  portType: string;
  commodity: string;
  drift: number;
  eventState: string;
  trend: 'up' | 'down' | 'flat';
}

interface MarketBoardPanelProps {
  token: string;
  onClose: () => void;
}

export default function MarketBoardPanel({ token, onClose }: MarketBoardPanelProps) {
  const [market, setMarket] = useState<MarketEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMarket();
  }, []);

  const loadMarket = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/ports/market`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setMarket(data.market || []);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load market data');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return '▲';
    if (trend === 'down') return '▼';
    return '●';
  };

  const getTrendColor = (trend: string) => {
    if (trend === 'up') return '#ff5555';
    if (trend === 'down') return '#55ff55';
    return 'var(--neon-cyan)';
  };

  const getEventBadge = (eventState: string) => {
    if (eventState === 'scarcity') return <span style={{ color: '#ff5555', fontWeight: 'bold' }}>[SCARCITY]</span>;
    if (eventState === 'surplus') return <span style={{ color: '#55ff55', fontWeight: 'bold' }}>[SURPLUS]</span>;
    return null;
  };

  // Group by sector
  const bySector = market.reduce((acc, entry) => {
    if (!acc[entry.sectorNumber]) {
      acc[entry.sectorNumber] = { portType: entry.portType, entries: [] };
    }
    acc[entry.sectorNumber].entries.push(entry);
    return acc;
  }, {} as Record<number, { portType: string; entries: MarketEntry[] }>);

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
        border: '1px solid var(--neon-cyan)',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '700px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'var(--neon-cyan)', margin: 0 }}>Market Board</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--neon-cyan)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {loading && <p style={{ color: 'var(--text-dim)' }}>Loading market data...</p>}
        {error && <p style={{ color: '#ff5555' }}>{error}</p>}

        {!loading && !error && Object.keys(bySector).length === 0 && (
          <p style={{ color: 'var(--text-dim)' }}>No market data available.</p>
        )}

        {!loading && !error && Object.entries(bySector)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([sector, data]) => (
            <div key={sector} style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '12px' }}>
              <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', marginBottom: '8px' }}>
                Sector {sector} ({data.portType})
              </div>
              {data.entries.map((entry) => (
                <div key={entry.commodity} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--text-main)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{entry.commodity}</span>
                  <span>
                    <span style={{ color: getTrendColor(entry.trend), marginRight: '8px' }}>
                      {getTrendIcon(entry.trend)} {(entry.drift * 100).toFixed(1)}%
                    </span>
                    {getEventBadge(entry.eventState)}
                  </span>
                </div>
              ))}
            </div>
          ))}

        <button
          onClick={loadMarket}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: 'var(--neon-cyan)',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
