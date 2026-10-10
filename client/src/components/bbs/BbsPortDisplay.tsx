import AnsiText, { ansi } from './AnsiText';

interface CommodityInfo {
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
}

interface PortData {
  sectorNumber: number;
  portType: string;
  portClass: number;
  commodities: {
    fuel: CommodityInfo;
    organics: CommodityInfo;
    equipment: CommodityInfo;
  };
}

/**
 * Classic TW2002-style port display for BBS mode.
 * Shows commodities as a terminal table with buy/sell indicators.
 */
export default function BbsPortDisplay({ port }: { port: PortData }) {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${ansi.amber('Port')} : ${ansi.brightGreen(`Sector ${port.sectorNumber}`)} (Class ${port.portClass})`);
  lines.push('');

  // Header
  lines.push(`  ${ansi.white('Commodity')}   ${ansi.white('Action')}   ${ansi.white('Qty')}${' '.repeat(6)}${ansi.white('Price')}`);
  lines.push(`  ${ansi.white('─'.repeat(42))}`);

  const commodities: [string, CommodityInfo][] = [
    ['Fuel     ', port.commodities.fuel],
    ['Organics ', port.commodities.organics],
    ['Equipment', port.commodities.equipment],
  ];

  commodities.forEach(([name, info]) => {
    const action = info.action === 'buy'
      ? ansi.green('BUY ')
      : ansi.red('SELL');
    const qty = String(info.quantity).padStart(8);
    const price = `${info.price} cr`.padStart(10);
    lines.push(`  ${name}   ${action}   ${ansi.amber(qty)}  ${ansi.brightGreen(price)}`);
  });

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
    </div>
  );
}
