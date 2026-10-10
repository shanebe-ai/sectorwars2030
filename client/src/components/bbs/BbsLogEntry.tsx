import AnsiText, { ansi } from './AnsiText';

/**
 * Terminal-style rendering of a ship log entry for BBS mode.
 * Replaces emoji icons with ASCII markers and neon colors with ANSI codes.
 */

const LOG_TYPE_MARKERS: Record<string, string> = {
  SOL: '[*]',
  PLANET: '[o]',
  ALIEN_PLANET: '[?]',
  PORT: '[$]',
  DEAD_END: '[!]',
  STARDOCK: '[#]',
  MANUAL: '[>]',
};

const LOG_TYPE_COLORS: Record<string, (s: string) => string> = {
  SOL: ansi.amber,
  PLANET: ansi.green,
  ALIEN_PLANET: ansi.cyan,
  PORT: ansi.cyan,
  DEAD_END: ansi.red,
  STARDOCK: ansi.amber,
  MANUAL: ansi.white,
};

interface LogEntry {
  log_type: string;
  sector_number: number;
  description: string;
  created_at: string;
  is_read: boolean;
}

export default function BbsLogEntry({ entry }: { entry: LogEntry }) {
  const marker = LOG_TYPE_MARKERS[entry.log_type] || '[ ]';
  const colorize = LOG_TYPE_COLORS[entry.log_type] || ansi.white;

  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const unread = entry.is_read ? ' ' : ansi.brightGreen('*');

  const text =
    `${unread}${colorize(marker)} ` +
    `${ansi.white(`S${entry.sector_number}`)} ` +
    `${entry.description} ` +
    `${ansi.white(`(${date})`)}`;

  return (
    <div style={{ fontFamily: "'VT323', monospace", fontSize: '20px', padding: '2px 0' }}>
      <AnsiText text={text} />
    </div>
  );
}
