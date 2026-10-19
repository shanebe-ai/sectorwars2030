import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../../config/api';
import AnsiText from './AnsiText';
import AnsiArt, { MINE_ALERT_ART, COMBAT_ALERT_ART } from './AnsiArt';
import ShipArt from './ShipArt';

interface BbsTerminalProps {
  player: any;
token: string;
  onPlayerUpdate: (player: any) => void;
  onLogout: () => void;
}

/**
 * Full TW2002-style BBS terminal interface.
 * Command-driven navigation like the original game.
 * Commands: ?/help, d, m, p, i, q, and more.
 */
// Phones and tablets: don't pop the on screen keyboard unless asked,
// since it covers most of the terminal. The tap keypad drives the game instead.
const isTouchDevice = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const KEYPAD_COMMANDS: { cmd: string; label: string }[] = [
  { cmd: 'd', label: 'D Scan' },
  { cmd: 'i', label: 'I Ship' },
  { cmd: 'p', label: 'P Port' },
  { cmd: 'b', label: 'B Bounty' },
  { cmd: 'k', label: 'K Market' },
  { cmd: '?', label: '? Help' },
];

const REGION_INFO: Record<string, string> = {
  'TerraSpace': 'Federation safe zone - no combat',
  'Frontier': 'Uncharted space - proceed with caution',
};

export default function BbsTerminal({ player, token, onPlayerUpdate, onLogout }: BbsTerminalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [sector, setSector] = useState<any>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [alert, setAlert] = useState<'mine' | 'combat' | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addLines = (newLines: string[]) => {
    setLines(prev => [...prev, ...newLines]);
  };

  const fetchSector = async () => {
    const sectorNum = player.currentSector;
    if (!sectorNum) {
      addLines(['\x1b[31mNo sector data. Try the d command.\x1b[0m']);
      return null;
    }
    try {
      const res = await fetch(`${API_URL}/api/sectors/${sectorNum}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.sector) {
        setSector(data.sector);
        return data.sector;
      } else {
        addLines([`\x1b[31mSector ${sectorNum} not found.\x1b[0m`]);
      }
    } catch (e) {
      addLines(['\x1b[31mError fetching sector data.\x1b[0m']);
    }
    return null;
  };

  useEffect(() => {
    // Initial display
    addLines([
      '',
      '\x1b[33mTRADEWARS 2030 - BBS TERMINAL MODE\x1b[0m',
      '\x1b[32mType ? for help.\x1b[0m',
      '',
    ]);
    fetchSector().then(s => {
      if (s) displaySector(s);
    });
    if (!isTouchDevice()) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const displaySector = (s: any) => {
    const out: string[] = [''];
    // Check for alerts
    if (s.minesCount > 0) {
      setAlert('mine');
    } else if (s.hasHostileFighters) {
      setAlert('combat');
    } else {
      setAlert(null);
    }
    out.push(`\x1b[33mSector \x1b[0m: \x1b[32m${s.sectorNumber}\x1b[0m` + (s.name ? ` \x1b[36m(${s.name})\x1b[0m` : ''));
    if (s.region) {
      const regionDesc = REGION_INFO[s.region];
      out.push(`\x1b[36mRegion  \x1b[0m: \x1b[32m${s.region}\x1b[0m` + (regionDesc ? ` - \x1b[33m${regionDesc}\x1b[0m` : ''));
    }
    if (s.portType) {
      out.push(`\x1b[36mPorts   \x1b[0m: \x1b[32m${s.portType}\x1b[0m (Class ${s.portClass || '?'})`);
    }
    if (s.planets && s.planets.length > 0) {
      out.push(`\x1b[36mPlanets \x1b[0m: ${s.planets.map((p: any) => p.name + (p.ownerName ? ` (${p.ownerName})` : ' (unclaimed)')).join(', ')}`);
    }
    if (s.fightersCount > 0) {
      out.push(`\x1b[36mFighters\x1b[0m: \x1b[32m${s.fightersCount}\x1b[0m` + (s.hasHostileFighters ? ` \x1b[31m[HOSTILE: ${s.hostileFighterCount}]\x1b[0m` : ''));
    }
    if (s.minesCount > 0) {
      out.push(`\x1b[36mMines   \x1b[0m: \x1b[31m${s.minesCount}\x1b[0m`);
    }
    if (s.warps && s.warps.length > 0) {
      out.push(`\x1b[36mWarps   \x1b[0m: ${s.warps.map((w: any) => `\x1b[36m${w.destination}\x1b[0m${w.isTwoWay ? '' : ' \x1b[33m(1-way)\x1b[0m'}`).join(', ')}`);
    } else {
      out.push(`\x1b[36mWarps   \x1b[0m: \x1b[31m(none)\x1b[0m`);
    }
    if (s.players && s.players.length > 0) {
      out.push(`\x1b[36mTraders \x1b[0m: ${s.players.map((p: any) => p.username).join(', ')}`);
    }
    if (s.beacons && s.beacons.length > 0) {
      s.beacons.forEach((b: any) => {
        out.push(`\x1b[36mBeacon  \x1b[0m: "${b.message}" - ${b.ownerName || 'Unknown'}`);
      });
    }
    out.push('');
    addLines(out);
  };

  const showHelp = () => {
    addLines([
      '',
      '\x1b[33mCOMMANDS:\x1b[0m',
      ' \x1b[32m?\x1b[0m, \x1b[32mhelp\x1b[0m - Show this help',
      ' \x1b[32md\x1b[0m - Display current sector',
      ' \x1b[32mm <n>\x1b[0m - Move to sector (e.g. m 42)',
      ' \x1b[32m<n>\x1b[0m - Move to sector (just the number)',
      ' \x1b[32mi\x1b[0m - Ship and player info',
      ' \x1b[32mp\x1b[0m - Port info',
      ' \x1b[32mb\x1b[0m - Bounty board',
      ' \x1b[32mk\x1b[0m - Market board',
      ' \x1b[32mq\x1b[0m - Quit to login',
      '',
    ]);
  };

  const showInfo = () => {
    setImage(player.shipType || null);
    addLines([
      '',
      `\x1b[33mSHIP INFO:\x1b[0m`,
      ` Trader : \x1b[32m${player.corpName || player.username}\x1b[0m`,
      ` Sector : \x1b[32m${player.currentSector}\x1b[0m`,
      ` Credits: \x1b[32m${player.credits}\x1b[0m`,
      ` Turns  : \x1b[32m${player.turnsRemaining}\x1b[0m`,
      ` Ship   : \x1b[32m${player.shipType}\x1b[0m`,
      ` Holds  : \x1b[32m${player.shipHoldsMax}\x1b[0m`,
      ` Fighters: \x1b[32m${player.shipFighters}\x1b[0m`,
      ` Shields : \x1b[32m${player.shipShields}\x1b[0m`,
      '',
    ]);
  };

  const handleMove = async (destStr: string) => {
    const dest = parseInt(destStr);
    if (isNaN(dest)) {
      addLines(['\x1b[31mUsage: m <sector number>\x1b[0m', '']);
      return;
    }
    addLines([`\x1b[36mWarping to sector ${dest}...\x1b[0m`]);
    try {
      const res = await fetch(`${API_URL}/api/sectors/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destinationSector: dest }),
      });
      const data = await res.json();
      if (data.success && data.player) {
        onPlayerUpdate(data.player);
        // Use the fresh player data, not the stale prop
        const newSectorNum = data.player.currentSector;
        addLines([`\x1b[32mArrived at sector ${newSectorNum}.\x1b[0m`, '']);
        // Fetch sector with the new sector number directly
        try {
          const sres = await fetch(`${API_URL}/api/sectors/${newSectorNum}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const sdata = await sres.json();
          if (sdata.sector) {
            setSector(sdata.sector);
            displaySector(sdata.sector);
          }
        } catch (e) {
          addLines(['\x1b[31mError fetching new sector.\x1b[0m']);
        }
      } else {
        addLines([`\x1b[31m${data.error || 'Move failed.'}\x1b[0m`, '']);
      }
    } catch (e) {
      addLines(['\x1b[31mConnection error.\x1b[0m', '']);
    }
  };

  const handlePort = async () => {
    if (!sector?.portType) {
      addLines(['\x1b[31mNo port in this sector.\x1b[0m', '']);
      setImage(null);
      return;
    }
    // Show pixel art for stardocks
    const isStardock = sector.portType.toLowerCase().includes('stardock');
    setImage(isStardock ? 'stardock' : null);
    addLines([
      '',
      `\x1b[33mPORT: ${sector.portType} (Class ${sector.portClass || '?'})\x1b[0m`,
      '',
      '\x1b[36mUse cyberpunk mode for trading.\x1b[0m',
      '',
    ]);
  };

  const handleBounties = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bounties/board`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      addLines(['', '\x1b[33mBOUNTY BOARD:\x1b[0m']);
      if (!data.board || data.board.length === 0) {
        addLines(['  \x1b[36mNo active bounties.\x1b[0m', '']);
      } else {
        data.board.forEach((b: any) => {
          addLines([`  \x1b[32m${b.target_name}\x1b[0m: \x1b[33m${b.amount}\x1b[0m credits`]);
        });
        addLines(['']);
      }
    } catch (e) {
      addLines(['\x1b[31mError fetching bounties.\x1b[0m', '']);
    }
  };

  const handleMarket = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ports/market`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      addLines(['', '\x1b[33mMARKET BOARD:\x1b[0m']);
      if (!data.market || data.market.length === 0) {
        addLines(['  \x1b[36mNo market data available.\x1b[0m', '']);
      } else {
        data.market.slice(0, 10).forEach((m: any) => {
          addLines([`  Sector ${m.sector_number}: ${m.port_type} - drift ${m.drift || 0}%`]);
        });
      }
      addLines(['']);
    } catch (e) {
      addLines(['\x1b[31mError fetching market.\x1b[0m', '']);
    }
  };

  const handleCommand = async (raw: string) => {
    const cmd = raw.trim().toLowerCase();
    if (!cmd) return;

    addLines([`\x1b[36m> ${raw}\x1b[0m`]);
    setHistory(prev => [raw, ...prev].slice(0, 50));
    setHistoryIndex(-1);

    const parts = cmd.split(/\s+/);
    const verb = parts[0];

    // Clear displayed image unless this command sets one
    if (verb !== 'p' && verb !== 'port' && verb !== 'i' && verb !== 'info') {
      setImage(null);
    }

    // TW2002 style: typing just a number warps to that sector
    if (/^\d+$/.test(verb)) {
      await handleMove(verb);
      return;
    }

    switch (verb) {
      case '?':
      case 'help':
        showHelp();
        break;
      case 'd':
      case 'display':
        {
          const s = await fetchSector();
          if (s) displaySector(s);
        }
        break;
      case 'm':
      case 'move':
      case 'warp':
        await handleMove(parts[1] || '');
        break;
      case 'i':
      case 'info':
        showInfo();
        break;
      case 'p':
      case 'port':
        await handlePort();
        break;
      case 'b':
      case 'bounty':
      case 'bounties':
        await handleBounties();
        break;
      case 'k':
      case 'market':
        await handleMarket();
        break;
      case 'q':
      case 'quit':
      case 'exit':
        addLines(['\x1b[33mGoodbye, trader.\x1b[0m']);
        setTimeout(onLogout, 500);
        break;
      default:
        addLines([`\x1b[31mUnknown command: ${verb}. Type ? for help.\x1b[0m`, '']);
    }
  };

  // Keypad taps run one command at a time so double taps don't double warp
  const runKeypadCommand = async (cmd: string) => {
    if (busy) return;
    if (cmd === 'q' && !window.confirm('Quit to login?')) return;
    setBusy(true);
    try {
      await handleCommand(cmd);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const idx = historyIndex + 1;
        setHistoryIndex(idx);
        setInput(history[idx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const idx = historyIndex - 1;
        setHistoryIndex(idx);
        setInput(history[idx]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  return (
    <div
      className="bbs-terminal"
      style={{
        fontFamily: "'VT323', 'IBM Plex Mono', monospace",
        fontSize: '22px',
        lineHeight: 1.4,
        padding: '20px',
        minHeight: '100vh',
        background: '#0a0f0a',
        color: '#33ff33',
        cursor: 'text',
      }}
      onClick={() => {
        if (!isTouchDevice()) inputRef.current?.focus();
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
          <AnsiText text={line || ' '} />
        </div>
      ))}
      {alert === 'mine' && <AnsiArt art={MINE_ALERT_ART} color="#ff3333" animated />}
      {alert === 'combat' && <AnsiArt art={COMBAT_ALERT_ART} color="#ff3333" animated />}
      {image && <ShipArt shipType={image} />}
      <div className="bbs-prompt" style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#33ff33', marginRight: '8px' }}>&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#33ff33',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            caretColor: '#33ff33',
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
          spellCheck={false}
          aria-label="Command"
        />
      </div>
      {/* Mobile tap keypad: warps for the current sector plus common commands */}
      <div className="tw-mobile-only bbs-keypad" onClick={(e) => e.stopPropagation()}>
        {sector?.warps?.length > 0 && (
          <div className="bbs-keypad-warps">
            <span className="bbs-keypad-label">WARP</span>
            {sector.warps.map((w: { destination: number }, idx: number) => (
              <button
                type="button"
                key={`${w.destination}-${idx}`}
                disabled={busy}
                onClick={() => runKeypadCommand(String(w.destination))}
              >
                {w.destination}
              </button>
            ))}
          </div>
        )}
        <div className="bbs-keypad-cmds">
          {KEYPAD_COMMANDS.map(k => (
            <button type="button" key={k.cmd} disabled={busy} onClick={() => runKeypadCommand(k.cmd)}>
              {k.label}
            </button>
          ))}
          <button type="button" onClick={() => inputRef.current?.focus()}>⌨ Type</button>
          <button type="button" disabled={busy} onClick={() => runKeypadCommand('q')}>Q Quit</button>
        </div>
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
