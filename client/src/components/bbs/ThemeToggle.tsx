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
        fontSize: '14px',
        padding: '6px 12px',
        opacity: 0.8,
      }}
    >
      {theme === 'bbs' ? '[ CYBER ]' : '[ BBS ]'}
    </button>
  );
}
