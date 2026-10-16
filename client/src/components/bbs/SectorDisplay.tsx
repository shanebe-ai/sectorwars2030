import AnsiText, { ansi } from './AnsiText';

interface Warp {
  destination: number;
  isTwoWay: boolean;
}

interface DisplayPlayer {
  username: string;
  shipType: string;
  corpName?: string;
  fighters: number;
  alignment: number;
}

interface DisplayPlanet {
  name: string;
  ownerName: string | null;
}

interface SectorData {
  sectorNumber: number;
  name: string | null;
  region?: string;
  portType: string | null;
  hasPort: boolean;
  portClass: number;
  hasPlanet: boolean;
  hasBeacon: boolean;
  fightersCount: number;
  minesCount: number;
  warps: Warp[];
  players: DisplayPlayer[];
  planets: DisplayPlanet[];
  beacons?: { ownerName: string; message: string }[];
  hasHostileFighters?: boolean;
  hostileFighterCount?: number;
}

/**
 * Classic TW2002-style sector display for BBS mode.
 * Renders sector data as monospace ANSI text, like the original BBS game.
 *
 * One-way warps are only revealed if the player has visited the destination.
 * Unvisited destinations show as normal warps, just like the original game.
 */
export default function SectorDisplay({
  sector,
  visitedSectors,
  onWarp,
}: {
  sector: SectorData;
  visitedSectors?: Set<number>;
  onWarp?: (destination: number) => void;
}) {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${ansi.amber('Sector ')}: ${ansi.brightGreen(String(sector.sectorNumber))}` +
    (sector.name ? ` ${ansi.cyan(`(${sector.name})`)}` : '') +
    (sector.region ? ` in ${sector.region}` : ''));
  lines.push('');

  // Port
  if (sector.hasPort) {
    const portLabel = sector.portType === 'stardock'
      ? ansi.amber('Stardock')
      : `${ansi.green('Port')} (Class ${sector.portClass})`;
    lines.push(`Ports   : ${portLabel}${sector.portType && sector.portType !== 'stardock' ? ` - ${sector.portType}` : ''}`);
  }

  // Traders
  if (sector.players.length > 0) {
    const traders = sector.players.map(p => {
      const align = p.alignment >= 1000 ? ansi.cyan('(B)') : p.alignment <= -1000 ? ansi.red('(R)') : '';
      const corp = p.corpName ? ` [${p.corpName}]` : '';
      return `${p.username}${corp} ${align}`;
    });
    lines.push(`Traders : ${traders.join(', ')}`);
  } else {
    lines.push(`Traders : ${ansi.white('(none)')}`);
  }

  // Fighters and mines
  if (sector.fightersCount > 0 || sector.minesCount > 0) {
    let def = '';
    if (sector.fightersCount > 0) {
      const hostile = sector.hasHostileFighters
        ? ansi.red(` [HOSTILE: ${sector.hostileFighterCount}]`)
        : '';
      def += `${ansi.amber(String(sector.fightersCount))} fighters${hostile}`;
    }
    if (sector.minesCount > 0) {
      if (def) def += ', ';
      def += `${ansi.amber(String(sector.minesCount))} mines`;
    }
    lines.push(`Defense : ${def}`);
  }

  // Planets
  if (sector.planets.length > 0) {
    const planets = sector.planets.map(p =>
      `${p.name}${p.ownerName ? ` (${p.ownerName})` : ' (unclaimed)'}`
    );
    lines.push(`Planets : ${planets.join(', ')}`);
  }

  // Beacons
  if (sector.beacons && sector.beacons.length > 0) {
    sector.beacons.forEach(b => {
      lines.push(`Beacon  : "${b.message}" - ${b.ownerName}`);
    });
  }

  // Warps: only reveal one-way status for sectors the player has visited
  // Render as clickable buttons when onWarp is provided
  let warpsElement: React.ReactNode = null;
  if (sector.warps.length > 0) {
    if (onWarp) {
      warpsElement = (
        <span>
          {'Warps   : '}
          {sector.warps.map((w, i) => {
            const isKnownOneWay = !w.isTwoWay && visitedSectors?.has(w.destination);
            return (
              <span key={w.destination}>
                {i > 0 && ', '}
                <button
                  onClick={() => onWarp(w.destination)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    color: 'var(--bbs-cyan, #33ffff)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  {w.destination}{isKnownOneWay ? ' (1-way)' : ''}
                </button>
              </span>
            );
          })}
        </span>
      );
    } else {
      const warps = sector.warps.map(w => {
        const isKnownOneWay = !w.isTwoWay && visitedSectors?.has(w.destination);
        return isKnownOneWay ? `${w.destination} (1-way)` : String(w.destination);
      });
      lines.push(`Warps   : ${warps.join(', ')}`);
    }
  } else {
    lines.push(`Warps   : ${ansi.red('(none - dead end!)')}`);
  }

  lines.push('');
  lines.push(ansi.white('─'.repeat(50)));
  lines.push('');

  return (
    <div
      style={{
        fontFamily: "'VT323', 'IBM Plex Mono', monospace",
        fontSize: '22px',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.4,
        padding: '8px 0',
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>
          <AnsiText text={line || ' '} />
        </div>
      ))}
      {warpsElement && <div>{warpsElement}</div>}
    </div>
  );
}
