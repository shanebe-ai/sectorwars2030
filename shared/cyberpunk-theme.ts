// TradeWars 2030 Cyberpunk Color Scheme

export const colors = {
  // Primary neon colors
  neonCyan: '#00FFFF',
  neonMagenta: '#FF00FF',
  neonGreen: '#00FF00',
  neonPink: '#FF1493',
  neonBlue: '#0080FF',
  neonYellow: '#FFFF00',

  // Background colors
  black: '#000000',
  darkGray: '#0a0a0a',
  charcoal: '#1a1a1a',

  // Text colors
  textPrimary: '#00FFFF',    // Cyan for primary text
  textSecondary: '#00FF00',   // Green for secondary text
  textTertiary: '#FF00FF',    // Magenta for highlights
  textDanger: '#FF0066',      // Pink/red for warnings
  textSuccess: '#00FF00',     // Green for success
  textWarning: '#FFFF00',     // Yellow for warnings

  // UI elements
  border: '#00FFFF',
  borderDim: '#008B8B',
  shadow: 'rgba(0, 255, 255, 0.3)',
  glow: 'rgba(0, 255, 255, 0.5)',

  // Port colors (for trading ports)
  portBuy: '#00FF00',      // Green for buying
  portSell: '#FF00FF',     // Magenta for selling

  // Ship status
  shipHealthy: '#00FF00',
  shipDamaged: '#FFFF00',
  shipCritical: '#FF0066',

  // Sector types
  sectorEmpty: '#555555',
  sectorPort: '#00FFFF',
  sectorPlanet: '#00FF00',
  sectorDanger: '#FF0066',
};

export const theme = {
  colors,

  // Font settings
  fonts: {
    mono: '"Courier New", Courier, monospace',
    terminal: '"VT323", "Courier New", monospace', // Can add retro terminal font
  },

  // ASCII borders and decorations
  borders: {
    single: {
      top: '─',
      bottom: '─',
      left: '│',
      right: '│',
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
    },
    double: {
      top: '═',
      bottom: '═',
      left: '║',
      right: '║',
      topLeft: '╔',
      topRight: '╗',
      bottomLeft: '╚',
      bottomRight: '╝',
    },
    heavy: {
      top: '━',
      bottom: '━',
      left: '┃',
      right: '┃',
      topLeft: '┏',
      topRight: '┓',
      bottomLeft: '┗',
      bottomRight: '┛',
    },
  },

  // Effects
  effects: {
    textShadow: '0 0 5px rgba(0, 255, 255, 0.5)',
    boxShadow: '0 0 10px rgba(0, 255, 255, 0.3)',
    glowIntense: '0 0 20px rgba(0, 255, 255, 0.8)',
    scanline: 'linear-gradient(0deg, rgba(0, 0, 0, 0.3) 50%, transparent 50%)',
  },

  // Spacing
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
};

export default theme;
