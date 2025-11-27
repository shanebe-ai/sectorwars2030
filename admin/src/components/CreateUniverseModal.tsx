import { useState } from 'react';
import { API_URL } from '../config/api';

interface CreateUniverseModalProps {
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateUniverseModal({ token, onClose, onSuccess }: CreateUniverseModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    maxSectors: 1000,
    portPercentage: 12,
    stardockCount: 2, // Default: Math.max(1, Math.floor(1000 / 500))
    maxPlayers: 100,
    turnsPerDay: 1000,
    startingCredits: 2000,
    startingShipType: 'scout',
    allowDeadEnds: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/universes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create universe');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const newFormData = {
      ...formData,
      [name]: type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : ['maxSectors', 'portPercentage', 'stardockCount', 'maxPlayers', 'turnsPerDay', 'startingCredits'].includes(name)
        ? parseInt(value) || 0
        : value
    };

    // Auto-update stardockCount when maxSectors changes
    if (name === 'maxSectors') {
      const calculatedStardocks = Math.max(1, Math.floor((parseInt(value) || 0) / 500));
      newFormData.stardockCount = calculatedStardocks;
    }

    setFormData(newFormData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>► CREATE NEW UNIVERSE</h2>
          <button onClick={onClose} className="modal-close">✗</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Universe Name *</label>
              <input
                type="text"
                name="name"
                className="cyberpunk-input"
                placeholder="Enter universe name_"
                value={formData.name}
                onChange={handleChange}
                required
                maxLength={100}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Description</label>
              <textarea
                name="description"
                className="cyberpunk-input"
                placeholder="Enter description (optional)_"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                style={{ resize: 'vertical', minHeight: '80px' }}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Max Sectors</label>
              <input
                type="number"
                name="maxSectors"
                className="cyberpunk-input"
                value={formData.maxSectors}
                onChange={handleChange}
                min={100}
                max={10000}
                required
              />
              <div className="form-hint">Recommended: 1000</div>
            </div>

            <div className="form-group">
              <label className="form-label">Port Distribution %</label>
              <input
                type="number"
                name="portPercentage"
                className="cyberpunk-input"
                value={formData.portPercentage}
                onChange={handleChange}
                min={1}
                max={50}
                required
              />
              <div className="form-hint">Recommended: 12%</div>
            </div>

            <div className="form-group">
              <label className="form-label">StarDocks</label>
              <input
                type="number"
                name="stardockCount"
                className="cyberpunk-input"
                value={formData.stardockCount}
                onChange={handleChange}
                min={0}
                max={100}
                required
              />
              <div className="form-hint">Default: 1 per 500 sectors (min 1)</div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Max Players</label>
              <input
                type="number"
                name="maxPlayers"
                className="cyberpunk-input"
                value={formData.maxPlayers}
                onChange={handleChange}
                min={1}
                max={1000}
                required
              />
              <div className="form-hint">Recommended: 100</div>
            </div>

            <div className="form-group">
              <label className="form-label">Turns Per Day</label>
              <input
                type="number"
                name="turnsPerDay"
                className="cyberpunk-input"
                value={formData.turnsPerDay}
                onChange={handleChange}
                min={100}
                max={10000}
                required
              />
              <div className="form-hint">Recommended: 1000</div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Starting Credits</label>
              <input
                type="number"
                name="startingCredits"
                className="cyberpunk-input"
                value={formData.startingCredits}
                onChange={handleChange}
                min={1000}
                max={100000}
                required
              />
              <div className="form-hint">Recommended: 2000</div>
            </div>

            <div className="form-group">
              <label className="form-label">Starting Ship</label>
              <select
                name="startingShipType"
                className="cyberpunk-input"
                value={formData.startingShipType}
                onChange={handleChange}
                required
              >
                <option value="escape_pod">Escape Pod</option>
                <option value="scout">Scout</option>
                <option value="trader">Trader</option>
              </select>
              <div className="form-hint">Default: Scout</div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Allow Dead-End Sectors</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '8px',
                }}
              >
                <div
                  onClick={() => setFormData(prev => ({ ...prev, allowDeadEnds: !prev.allowDeadEnds }))}
                  style={{
                    width: '50px',
                    height: '26px',
                    background: formData.allowDeadEnds
                      ? 'rgba(157, 0, 255, 0.3)'
                      : 'rgba(0, 0, 0, 0.5)',
                    border: `2px solid ${formData.allowDeadEnds ? 'var(--neon-purple)' : '#444'}`,
                    borderRadius: '13px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    boxShadow: formData.allowDeadEnds
                      ? '0 0 10px rgba(157, 0, 255, 0.5), inset 0 0 10px rgba(157, 0, 255, 0.2)'
                      : 'none',
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      background: formData.allowDeadEnds ? 'var(--neon-purple)' : '#666',
                      borderRadius: '50%',
                      position: 'absolute',
                      top: '2px',
                      left: formData.allowDeadEnds ? '26px' : '2px',
                      transition: 'all 0.2s ease',
                      boxShadow: formData.allowDeadEnds
                        ? '0 0 8px rgba(157, 0, 255, 0.8)'
                        : 'none',
                    }}
                  />
                </div>
                <span style={{
                  color: formData.allowDeadEnds ? 'var(--neon-purple)' : 'var(--text-secondary)',
                  fontSize: '14px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}>
                  {formData.allowDeadEnds ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div className="form-hint">
                ~0.25% chance of dead-end sectors (only incoming warps). Default: No
              </div>
            </div>
          </div>

          {error && (
            <div className="error-message">
              ✗ {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="cyberpunk-button cyberpunk-button-secondary"
              disabled={loading}
            >
              ◄ CANCEL
            </button>
            <button
              type="submit"
              className="cyberpunk-button cyberpunk-button-success"
              disabled={loading}
            >
              {loading ? '⟳ CREATING...' : '► CREATE UNIVERSE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
