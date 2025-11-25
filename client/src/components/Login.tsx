import { useState } from 'react';

const logo = `
╔════════════════════════════════════════════════════════════════╗
║  ████████╗██████╗  █████╗ ██████╗ ███████╗██╗    ██╗ █████╗   ║
║  ╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██║    ██║██╔══██╗  ║
║     ██║   ██████╔╝███████║██║  ██║█████╗  ██║ █╗ ██║███████║  ║
║     ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝  ██║███╗██║██╔══██║  ║
║     ██║   ██║  ██║██║  ██║██████╔╝███████╗╚███╔███╔╝██║  ██║  ║
║     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝  ║
║                      ██████╗  ██████╗ ██████╗  ██████╗         ║
║                      ╚════██╗██╔═████╗╚════██╗██╔═████╗        ║
║                       █████╔╝██║██╔██║ █████╔╝██║██╔██║        ║
║                      ██╔═══╝ ████╔╝██║ ╚═══██╗████╔╝██║        ║
║                      ███████╗╚██████╔╝██████╔╝╚██████╔╝        ║
║                      ╚══════╝ ╚═════╝ ╚═════╝  ╚═════╝         ║
╚════════════════════════════════════════════════════════════════╝
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const body = isRegistering
        ? { username, email, password }
        : { username, password };

      const response = await fetch(`http://localhost:3000${endpoint}`, {
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
        <pre className="ascii-art" style={{ marginBottom: '40px', textAlign: 'center' }}>
          {logo}
        </pre>

        <div className="cyberpunk-panel" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <div className="panel-header">
            {isRegistering ? '► NEW PILOT REGISTRATION' : '► SYSTEM ACCESS'}
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
            />

            {isRegistering && (
              <input
                type="email"
                className="cyberpunk-input"
                placeholder="EMAIL_ADDRESS_"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
              className="cyberpunk-button cyberpunk-button-success"
              disabled={loading}
              style={{ width: '100%', marginTop: '20px', padding: '15px' }}
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
                }}
                style={{ fontSize: '12px' }}
              >
                {isRegistering ? '◄ BACK TO LOGIN' : '► NEW PILOT? REGISTER'}
              </button>
            </div>
          </form>

          <div className="neon-text-green" style={{ marginTop: '30px', fontSize: '12px', textAlign: 'center' }}>
            <div>► ALPHA UNIVERSE ONLINE</div>
            <div>► 1000 SECTORS AWAITING EXPLORATION</div>
            <div>► GOOD HUNTING, PILOT</div>
          </div>
        </div>
      </div>
    </div>
  );
}
