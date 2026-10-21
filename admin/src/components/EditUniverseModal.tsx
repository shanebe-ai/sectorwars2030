import { useState } from 'react';
import { API_URL } from '../config/api';

interface EditableUniverse {
  id: number;
  name: string;
  description: string | null;
}

interface EditUniverseModalProps {
  token: string;
  universe: EditableUniverse;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditUniverseModal({ token, universe, onClose, onSuccess }: EditUniverseModalProps) {
  const [formData, setFormData] = useState({
    name: universe.name,
    description: universe.description || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/universes/${universe.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update universe');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>► EDIT UNIVERSE</h2>
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
                maxLength={2000}
                style={{ resize: 'vertical', minHeight: '80px' }}
              />
              <div className="form-hint">Clear the field to remove the description</div>
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
              {loading ? '⟳ SAVING...' : '► SAVE CHANGES'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
