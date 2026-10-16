/**
 * ANSI art for ports, stardocks, and combat alerts.
 * Retro TW2002 style, spiced up with modern CSS.
 */

export const STARDOCK_ART = `
    ╔═══════════════════════════════════════╗
    ║         ★  S T A R D O C K  ★         ║
    ╠═══════════════════════════════════════╣
    ║                                       ║
    ║              .-\"\"\"-.                ║
    ║             / .---. \\               ║
    ║             | |   | |               ║
    ║          ___| |   | |___            ║
    ║         /   | |   | |   \\          ║
    ║        |    | '---' |    |         ║
    ║         \\   '.___.'   /          ║
    ║          '---------'             ║
    ║                                       ║
    ║     DOCKING BAYS: OPEN  •  FUEL: FULL  ║
    ║                                       ║
    ╚═══════════════════════════════════════╝
`;

export const PORT_ART: Record<string, string> = {
  fuel: `
    ╔═══════════════════════════════════╗
    ║        FUEL DEPOT  ⛽             ║
    ╠═══════════════════════════════════╣
    ║                                   ║
    ║         .-\"\"\"-.                 ║
    ║        /  ___  \\                ║
    ║        | (___) |                ║
    ║         \\ ___ /                 ║
    ║          '---'                  ║
    ║                                   ║
    ║    REFINERY ONLINE • TANKS FULL    ║
    ╚═══════════════════════════════════╝
  `,
  organics: `
    ╔═══════════════════════════════════╗
    ║      ORGANICS EXCHANGE  🌱        ║
    ╠═══════════════════════════════════╣
    ║                                   ║
    ║            .-\"\"\"-.              ║
    ║           /  o o  \\             ║
    ║           |   ∆   |             ║
    ║            \\ ___ /              ║
    ║                                   ║
    ║     HYDROPONICS: THRIVING         ║
    ╚═══════════════════════════════════╝
  `,
  equipment: `
    ╔═══════════════════════════════════╗
    ║     EQUIPMENT YARDS  ⚙️           ║
    ╠═══════════════════════════════════╣
    ║                                   ║
    ║         .-\"\"\"-.                 ║
    ║        | [___] |                ║
    ║        | [___] |                ║
    ║         \\_____/                 ║
    ║                                   ║
    ║     FABRICATORS: OPERATIONAL       ║
    ╚═══════════════════════════════════╝
  `,
};

export const MINE_ALERT_ART = `
    ╔═══════════════════════════════════════╗
    ║  ⚠️  WARNING: MINES DETECTED  ⚠️      ║
    ╠═══════════════════════════════════════╣
    ║                                       ║
    ║              .-\"\"\"-.                ║
    ║             /  * *  \\               ║
    ║             |   *   |               ║
    ║              \\ * * /                ║
    ║               '---'                 ║
    ║                                       ║
    ║     PROXIMITY ALERT • SHIELDS UP       ║
    ╚═══════════════════════════════════════╝
`;

export const COMBAT_ALERT_ART = `
    ╔═══════════════════════════════════════╗
    ║  🚨  RED ALERT: HOSTILE CONTACT  🚨   ║
    ╠═══════════════════════════════════════╣
    ║                                       ║
    ║           \\  |  /                   ║
    ║            \\ | /                    ║
    ║         ----  ✖  ----               ║
    ║            / | \\                    ║
    ║           /  |  \\                   ║
    ║                                       ║
    ║     BATTLE STATIONS • WEAPONS HOT      ║
    ╚═══════════════════════════════════════╝
`;

interface AnsiArtProps {
  art: string;
  color?: string;
  glow?: boolean;
  animated?: boolean;
}

/**
 * Renders ANSI art with retro terminal styling.
 * Mobile-friendly: scales with viewport, monospace preserved.
 */
export default function AnsiArt({ art, color = '#33ff33', glow = true, animated = false }: AnsiArtProps) {
  return (
    <div
      style={{
        fontFamily: "'VT323', 'IBM Plex Mono', monospace",
        fontSize: 'clamp(10px, 2.5vw, 18px)',
        lineHeight: 1.2,
        whiteSpace: 'pre',
        color,
        textShadow: glow ? `0 0 10px ${color}` : 'none',
        textAlign: 'center',
        overflowX: 'auto',
        padding: '16px 8px',
        animation: animated ? 'ansi-pulse 1.5s ease-in-out infinite' : 'none',
      }}
    >
      {art}
      <style>{`
        @keyframes ansi-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
