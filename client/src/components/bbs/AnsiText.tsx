
/**
 * Renders strings containing ANSI escape codes as colored spans.
 * Supports the standard 16 colors (30-37, 90-97) and reset (0).
 * Example: "\x1b[32mSector\x1b[0m : 142"
 */

const ANSI_COLORS: Record<number, string> = {
  30: '#1a1a1a', // black
  31: '#ff3333', // red
  32: '#33ff33', // green
  33: '#ffb000', // yellow/amber
  34: '#3366ff', // blue
  35: '#ff33ff', // magenta
  36: '#33ffff', // cyan
  37: '#cccccc', // white
  90: '#666666', // bright black
  91: '#ff6666', // bright red
  92: '#66ff66', // bright green
  93: '#ffcc00', // bright yellow
  94: '#6699ff', // bright blue
  95: '#ff66ff', // bright magenta
  96: '#66ffff', // bright cyan
  97: '#ffffff', // bright white
};

interface Segment {
  text: string;
  color: string | null;
}

function parseAnsi(input: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\x1b\[(\d+)m/g;
  let lastIndex = 0;
  let currentColor: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), color: currentColor });
    }
    const code = parseInt(match[1], 10);
    if (code === 0) {
      currentColor = null;
    } else if (ANSI_COLORS[code]) {
      currentColor = ANSI_COLORS[code];
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), color: currentColor });
  }

  return segments;
}

export default function AnsiText({ text }: { text: string }) {
  const segments = parseAnsi(text);

  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} style={seg.color ? { color: seg.color } : undefined}>
          {seg.text}
        </span>
      ))}
    </>
  );
}

/** Helper to build ANSI-colored strings */
export const ansi = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  white: (s: string) => `\x1b[37m${s}\x1b[0m`,
  brightGreen: (s: string) => `\x1b[92m${s}\x1b[0m`,
};
