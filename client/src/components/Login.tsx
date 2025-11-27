import { useState } from 'react';
import { API_URL } from '../config/api';

const logo = `
████████╗ ██████╗   █████╗  ██████╗  ███████╗ ██╗    ██╗  █████╗  ██████╗  ███████╗
╚══██╔══╝ ██╔══██╗ ██╔══██╗ ██╔══██╗ ██╔════╝ ██║    ██║ ██╔══██╗ ██╔══██╗ ██╔════╝
   ██║    ██████╔╝ ███████║ ██║  ██║ █████╗   ██║ █╗ ██║ ███████║ ██████╔╝ ███████╗
   ██║    ██╔══██╗ ██╔══██║ ██║  ██║ ██╔══╝   ██║███╗██║ ██╔══██║ ██╔══██╗ ╚════██║
   ██║    ██║  ██║ ██║  ██║ ██████╔╝ ███████╗ ╚███╔███╔╝ ██║  ██║ ██║  ██║ ███████║
   ╚═╝    ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═════╝  ╚══════╝  ╚══╝╚══╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚══════╝

                               ██████╗  ██████╗  ██████╗  ██████╗
                               ╚════██╗ ██╔══██╗ ╚════██╗ ██╔══██╗
                                █████╔╝ ██║  ██║  █████╔╝ ██║  ██║
                               ██╔═══╝  ██║  ██║  ╚═══██╗ ██║  ██║
                               ███████╗ ╚██████╔╝ ██████╔╝ ╚██████╔╝
                               ╚══════╝  ╚═════╝  ╚═════╝   ╚═════╝
`;

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Simple email validation regex
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email format when registering
    if (isRegistering && !isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const body = isRegistering
        ? { username, email, password }
        : { username, password };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cyberpunk-container" style={{ padding: '40px 20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <pre className="ascii-art" style={{
          marginBottom: '20px',
          textAlign: 'center',
          color: 'var(--neon-purple)',
          textShadow: '0 0 5px rgba(157, 0, 255, 0.5)',
          fontSize: '11px',
          lineHeight: '1.1'
        }}>
          {logo}
        </pre>

        <div className="cyberpunk-panel" style={{
          maxWidth: '500px',
          margin: '0 auto',
          borderColor: 'var(--neon-purple)',
          boxShadow: '0 0 10px rgba(157, 0, 255, 0.3)'
        }}>
          <div className="panel-header" style={{
            color: 'var(--neon-purple)',
            borderBottomColor: 'var(--neon-purple)',
            textShadow: '0 0 5px rgba(157, 0, 255, 0.5)'
          }}>
            {isRegistering ? '► NEW TRADER REGISTRATION' : '► SYSTEM ACCESS'}
          </div>

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              className="cyberpunk-input"
              placeholder="USERNAME_"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              style={{
                borderColor: 'var(--neon-green)',
                boxShadow: 'none'
              }}
              onFocus={(e) => e.target.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8)'}
              onBlur={(e) => e.target.style.boxShadow = 'none'}
            />

            {isRegistering && (
              <input
                type="email"
                className="cyberpunk-input"
                placeholder="EMAIL_ADDRESS_"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  borderColor: 'var(--neon-green)',
                  boxShadow: 'none'
                }}
                onFocus={(e) => e.target.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8)'}
                onBlur={(e) => e.target.style.boxShadow = 'none'}
              />
            )}

            <input
              type="password"
              className="cyberpunk-input"
              placeholder="PASSWORD_"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                borderColor: 'var(--neon-green)',
                boxShadow: 'none'
              }}
              onFocus={(e) => e.target.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8)'}
              onBlur={(e) => e.target.style.boxShadow = 'none'}
            />

            {error && (
              <div style={{
                color: 'var(--neon-pink)',
                marginTop: '10px',
                padding: '10px',
                border: '1px solid var(--neon-pink)',
              }}>
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
                borderColor: '#FF0000',
                color: '#FF0000'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FF0000';
                e.currentTarget.style.color = 'var(--bg-black)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#FF0000';
              }}
            >
              {loading ? '⟳ CONNECTING...' : isRegistering ? '► REGISTER' : '► LOGIN'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                type="button"
                className="cyberpunk-button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                  setUsername('');
                  setEmail('');
                  setPassword('');
                }}
                style={{
                  fontSize: '12px',
                  borderColor: '#FF0000',
                  color: '#FF0000'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#FF0000';
                  e.currentTarget.style.color = 'var(--bg-black)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#FF0000';
                }}
              >
                {isRegistering ? '◄ BACK TO LOGIN' : '► NEW TRADER? REGISTER'}
              </button>
            </div>
          </form>

          <div style={{ marginTop: '30px', fontSize: '12px', textAlign: 'center', color: '#00FF00', textShadow: '0 0 5px rgba(0, 255, 0, 0.5)' }}>
            <div>► ALPHA UNIVERSE ONLINE</div>
            <div>► 1000 SECTORS AWAITING EXPLORATION</div>
            <div>► GOOD LUCK, TRADER</div>
          </div>
        </div>
      </div>
    </div>
  );
}
