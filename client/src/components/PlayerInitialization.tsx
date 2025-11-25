import { useState } from 'react';
import UniverseSelector from './UniverseSelector';
import CorpNameInput from './CorpNameInput';

interface PlayerInitializationProps {
  token: string;
  onComplete: (player: any) => void;
  onLogout: () => void;
}

type Step = 'universe' | 'corpName';

export default function PlayerInitialization({
  token,
  onComplete,
  onLogout,
}: PlayerInitializationProps) {
  const [step, setStep] = useState<Step>('universe');
  const [selectedUniverse, setSelectedUniverse] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUniverseSelect = async (universeId: number) => {
    try {
      // Fetch universe details
      const response = await fetch(`http://localhost:3000/api/universes/${universeId}`);
      const data = await response.json();

      if (response.ok) {
        setSelectedUniverse({
          id: universeId,
          name: data.universe.name,
        });
        setStep('corpName');
      } else {
        setError('Failed to load universe details');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    }
  };

  const handleCorpNameSubmit = async (corpName: string) => {
    if (!selectedUniverse) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3000/api/players', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          universeId: selectedUniverse.id,
          corpName,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Player created successfully
        onComplete(data.player);
      } else {
        setError(data.error || 'Failed to create player');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'corpName') {
      setStep('universe');
      setSelectedUniverse(null);
      setError('');
    } else {
      onLogout();
    }
  };

  if (step === 'universe') {
    return (
      <UniverseSelector
        onSelect={handleUniverseSelect}
        onCancel={onLogout}
      />
    );
  }

  if (step === 'corpName' && selectedUniverse) {
    return (
      <CorpNameInput
        universeName={selectedUniverse.name}
        onSubmit={handleCorpNameSubmit}
        onBack={handleBack}
        loading={loading}
        error={error}
      />
    );
  }

  return null;
}
