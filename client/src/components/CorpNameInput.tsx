import { useState } from 'react';

interface CorpNameInputProps {
  universeName: string;
  onSubmit: (corpName: string) => void;
  onBack: () => void;
  loading: boolean;
  error: string;
}

export default function CorpNameInput({
  universeName,
  onSubmit,
  onBack,
  loading,
  error,
}: CorpNameInputProps) {
  const [corpName, setCorpName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (corpName.trim().length >= 3) {
      onSubmit(corpName.trim());
    }
  };

  return (
    <div className="cyberpunk-container">
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="cyberpunk-panel">
          <div className="panel-header">
            ► NAME YOUR CORPORATION
          </div>

          <div style={{ marginBottom: '30px' }}>
            <p style={{ color: 'var(--neon-green)', marginBottom: '10px' }}>
              Universe: <span style={{ color: 'var(--neon-cyan)' }}>{universeName}</span>
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', opacity: 0.8 }}>
              Choose a name for your trading corporation. This will be visible to other players.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Corporation Name</label>
              <input
                type="text"
                className="cyberpunk-input"
                placeholder="Enter corporation name_"
                value={corpName}
                onChange={(e) => setCorpName(e.target.value)}
                minLength={3}
                maxLength={100}
                required
                autoFocus
                disabled={loading}
              />
              <div className="form-hint">
                3-100 characters • Alphanumeric and spaces allowed
              </div>
            </div>

            {error && (
              <div className="error-message" style={{ marginTop: '20px' }}>
                ✗ {error}
              </div>
            )}

            <div className="button-row" style={{ marginTop: '30px' }}>
              <button
                type="button"
                onClick={onBack}
                className="cyberpunk-button"
                disabled={loading}
                style={{ flex: 1 }}
              >
                ◄ BACK
              </button>
              <button
                type="submit"
                className="cyberpunk-button cyberpunk-button-primary"
                disabled={loading || corpName.trim().length < 3}
                style={{ flex: 1 }}
              >
                {loading ? '⟳ INITIALIZING...' : 'BEGIN TRADING ►'}
              </button>
            </div>
          </form>

          <div style={{
            marginTop: '30px',
            padding: '15px',
            background: 'rgba(0, 255, 255, 0.05)',
            border: '1px solid var(--neon-cyan)',
            fontSize: '12px',
            color: 'var(--neon-cyan)',
            opacity: 0.7
          }}>
            <div>► Starting ship: Scout</div>
            <div>► Starting credits: 2000</div>
            <div>► Starting location: Sol Sector</div>
            <div>► Daily turns: 1000</div>
          </div>
        </div>
      </div>
    </div>
  );
}
