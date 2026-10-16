import { useTheme } from '../../themes/ThemeContext';
import { playBlip, playPowerOn } from '../../audio/retroSfx';

/**
 * Toggle button for switching between cyberpunk and BBS terminal themes.
 * Fixed position in the top-right corner.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const handleToggle = () => {
    if (theme === 'cyberpunk') {
      playPowerOn();
    } else {
      playBlip();
    }
    toggleTheme();
  };

  return (
    <button
      onClick={handleToggle}
      title={theme === 'bbs' ? 'Switch to cyberpunk theme' : 'Switch to BBS terminal mode'}
      style={{
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: 10000,
        fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '2px',
        padding: '8px 16px',
        color: '#00ffff',
        background: 'rgba(0, 20, 30, 0.85)',
        border: '1px solid #00ffff',
        borderRadius: '4px',
        cursor: 'pointer',
        textShadow: '0 0 8px #00ffff',
        boxShadow: '0 0 12px rgba(0, 255, 255, 0.4), inset 0 0 8px rgba(0, 255, 255, 0.1)',
        opacity: 0.95,
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.7), inset 0 0 12px rgba(0, 255, 255, 0.2)';
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 255, 255, 0.4), inset 0 0 8px rgba(0, 255, 255, 0.1)';
        e.currentTarget.style.opacity = '0.95';
      }}
    >
      {theme === 'bbs' ? '[ CYBER ]' : '[ BBS ]'}
    </button>
  );
}
