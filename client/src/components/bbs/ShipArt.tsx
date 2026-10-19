import { useTheme } from '../../themes/ThemeContext';

/**
 * Ship and station pixel art.
 * Cyber mode: full color gritty art.
 * BBS mode: same art with a green phosphor CRT filter, so it matches
 * the terminal aesthetic without needing a second asset set.
 */

const SHIP_ART: Record<string, string> = {
  escape_pod: '/ships/escape_pod.webp',
  scout: '/ships/scout.webp',
  trader: '/ships/trader.webp',
  freighter: '/ships/freighter.webp',
  merchant_cruiser: '/ships/merchant_cruiser.webp',
  corporate_flagship: '/ships/corporate_flagship.webp',
  scout_marauder: '/ships/scout_marauder.webp',
  missile_frigate: '/ships/missile_frigate.webp',
  havoc_gunstar: '/ships/havoc_gunstar.webp',
  tholian_sentinel: '/ships/tholian_sentinel.webp',
  interdictor_cruiser: '/ships/interdictor_cruiser.webp',
  stardock: '/ships/stardock.webp',
};

export function shipArtUrl(shipType: string | undefined | null): string | null {
  if (!shipType) return null;
  const key = shipType.toLowerCase().replace(/\s+/g, '_');
  return SHIP_ART[key] || null;
}

interface ShipArtProps {
  shipType: string;
  maxWidth?: number;
  alt?: string;
}

export default function ShipArt({ shipType, maxWidth = 480, alt }: ShipArtProps) {
  const { theme } = useTheme();
  const url = shipArtUrl(shipType);
  if (!url) return null;

  const isBbs = theme === 'bbs';

  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <img
        src={url}
        alt={alt || shipType}
        style={{
          maxWidth: `min(${maxWidth}px, 92vw)`,
          width: '100%',
          height: 'auto',
          borderRadius: isBbs ? 0 : '6px',
          border: isBbs ? '1px solid rgba(51,255,51,0.4)' : '1px solid rgba(0,255,255,0.25)',
          filter: isBbs
            ? 'grayscale(1) sepia(1) hue-rotate(55deg) saturate(3) brightness(0.95) contrast(1.1)'
            : 'none',
          boxShadow: isBbs
            ? '0 0 18px rgba(51,255,51,0.25)'
            : '0 0 18px rgba(0,255,255,0.15)',
        }}
      />
    </div>
  );
}
