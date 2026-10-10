import { useTheme } from '../../themes/ThemeContext';
import type { ReactNode } from 'react';

/**
 * TerminalShell wraps the app when BBS mode is active.
 * Renders CRT overlay effects (scanlines, vignette, flicker) and
 * plays the CRT turn-on animation.
 */
export default function TerminalShell({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  if (theme !== 'bbs') {
    return <>{children}</>;
  }

  return (
    <div className="bbs-power-on">
      {children}
      <div className="bbs-crt-overlay bbs-scanlines" />
      <div className="bbs-crt-overlay bbs-vignette" />
      <div className="bbs-crt-overlay bbs-flicker" />
    </div>
  );
}
