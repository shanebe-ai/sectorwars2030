import { useState } from 'react';
import { API_URL } from '../config/api';

const logo = `
 █████╗ ██████╗ ███╗   ███╗██╗███╗   ██╗    ██████╗  █████╗ ███╗   ██╗███████╗██╗
██╔══██╗██╔══██╗████╗ ████║██║████╗  ██║    ██╔══██╗██╔══██╗████╗  ██║██╔════╝██║
███████║██║  ██║██╔████╔██║██║██╔██╗ ██║    ██████╔╝███████║██╔██╗ ██║█████╗  ██║
██╔══██║██║  ██║██║╚██╔╝██║██║██║╚██╗██║    ██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║
██║  ██║██████╔╝██║ ╚═╝ ██║██║██║ ╚████║    ██║     ██║  ██║██║ ╚████║███████╗███████╗
╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝    ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝
`;

interface AdminLoginProps {
  onLogin: (token: string, user: any) => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      // Check content type to ensure we got JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server error: Invalid response format. Is the server running?');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Check if user is admin
      if (!data.user.isAdmin) {
        throw new Error('Admin access required');
      }

      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Network error - is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cyberpunk-container" style={{ padding: '40px 20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <pre className="ascii-art" style={{
            textAlign: 'left',
            color: 'var(--neon-purple)',
            textShadow: '0 0 10px rgba(157, 0, 255, 0.8)',
            fontSize: '10px',
            lineHeight: '1.1',
            margin: 0
          }}>
            {logo}
          </pre>
        </div>

        <div className="cyberpunk-panel" style={{
          maxWidth: '500px',
          margin: '0 auto',
          borderColor: 'var(--neon-purple)',
          boxShadow: '0 0 20px rgba(157, 0, 255, 0.5)'
        }}>
          <div className="panel-header" style={{
            color: 'var(--neon-purple)',
            borderBottomColor: 'var(--neon-purple)',
            textShadow: '0 0 10px rgba(157, 0, 255, 0.8)'
          }}>
            ► ADMINISTRATOR ACCESS
          </div>

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              className="cyberpunk-input"
              placeholder="ADMIN_USERNAME_"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              style={{
                borderColor: 'var(--neon-purple)',
                boxShadow: 'none'
              }}
              onFocus={(e) => e.target.style.boxShadow = '0 0 20px rgba(157, 0, 255, 0.8)'}
              onBlur={(e) => e.target.style.boxShadow = 'none'}
            />

            <input
              type="password"
              className="cyberpunk-input"
              placeholder="ADMIN_PASSWORD_"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                borderColor: 'var(--neon-purple)',
                boxShadow: 'none'
              }}
              onFocus={(e) => e.target.style.boxShadow = '0 0 20px rgba(157, 0, 255, 0.8)'}
              onBlur={(e) => e.target.style.boxShadow = 'none'}
            />

            {error && (
              <div className="error-message">
                ✗ {error}
              </div>
            )}

            <button
              type="submit"
              className="cyberpunk-button"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '15px',
                borderColor: 'var(--neon-purple)',
                color: 'var(--neon-purple)'
              }}
            >
              {loading ? '⟳ AUTHENTICATING...' : '► ADMIN LOGIN'}
            </button>
          </form>

          <div style={{ marginTop: '30px', fontSize: '12px', textAlign: 'center', color: 'var(--neon-purple)', opacity: 0.7 }}>
            <div>► RESTRICTED AREA</div>
            <div>► AUTHORIZED PERSONNEL ONLY</div>
            <div>► TRADEWARS 2030 CONTROL PANEL</div>
          </div>
        </div>
      </div>
    </div>
  );
}
