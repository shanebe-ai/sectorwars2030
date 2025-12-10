import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface Ship {
  id: number;
  name: string;
  displayName: string;
  holds: number;
  fightersMax: number;
  shieldsMax: number;
  minesMax: number;
  genesisMax: number;
  cost: number;
  netCost: number;
  description: string;
  canAfford: boolean;
  isCurrentShip: boolean;
}

interface StardockInfo {
  sectorNumber: number;
  name: string;
  ships: Ship[];
  fighterPrice: number;
  shieldPrice: number;
  tradeInValue: number;
  player: {
    credits: number;
    currentShip: string;
    fighters: number;
    fightersMax: number;
    shields: number;
    shieldsMax: number;
  };
}

interface BankAccount {
  id: number;
  account_type: 'personal' | 'corporate';
  balance: number;
  corp_name?: string;
}

interface BankTransaction {
  id: number;
  transaction_type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out';
  amount: number;
  balance_before: number;
  balance_after: number;
  related_player_name: string | null;
  memo: string | null;
  created_at: string;
}

interface StarDockPanelProps {
  sectorNumber: number;
  token: string;
  onClose: () => void;
  onPurchase: (updatedPlayer: any) => void;
}

export default function StarDockPanel({ sectorNumber, token, onClose, onPurchase }: StarDockPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stardock, setStardock] = useState<StardockInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'ships' | 'equipment' | 'banking'>('ships');
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState('');
  const [fighterQty, setFighterQty] = useState(0);
  const [shieldQty, setShieldQty] = useState(0);
  const [beaconQty, setBeaconQty] = useState(0);
  const [beaconInfo, setBeaconInfo] = useState<{ price: number; currentCount: number; maxCapacity: number } | null>(null);
  const [mineQty, setMineQty] = useState(0);
  const [mineInfo, setMineInfo] = useState<{ price: number; currentCount: number; maxCapacity: number } | null>(null);
  const [genesisQty, setGenesisQty] = useState(0);
  const [genesisInfo, setGenesisInfo] = useState<{ price: number; currentGenesis: number; maxGenesis: number } | null>(null);

  // Banking state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<'personal' | 'corporate'>('personal');
  const [depositAmount, setDepositAmount] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | null>(null);
  const [transferMemo, setTransferMemo] = useState('');
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    loadStardockInfo();
    loadBeaconInfo();
    loadMineInfo();
    loadGenesisInfo();
  }, [sectorNumber]);

  const loadStardockInfo = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_URL}/api/stardock`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setStardock(data);
      } else {
        setError(data.error || 'Failed to load StarDock');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const loadBankingInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/api/banking`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setBankAccounts(data.accounts);
        // Load transactions for first account
        if (data.accounts.length > 0) {
          const firstAccount = data.accounts.find((a: BankAccount) => a.account_type === 'personal');
          if (firstAccount) {
            loadTransactions(firstAccount.id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load banking info:', err);
    }
  };

  const loadBeaconInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/api/beacons/info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setBeaconInfo(data);
      }
    } catch (err) {
      console.error('Failed to load beacon info:', err);
    }
  };

  const loadMineInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/api/mines/info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMineInfo(data);
      } else {
        console.error('Failed to load mine info:', data.error);
        // Set default values if API fails
        setMineInfo({ price: 50000, currentCount: 0, maxCapacity: 0 });
      }
    } catch (err) {
      console.error('Failed to load mine info:', err);
      // Set default values if request fails
      setMineInfo({ price: 50000, currentCount: 0, maxCapacity: 0 });
    }
  };

  const purchaseBeacons = async () => {
    if (beaconQty <= 0) return;
    
    setPurchasing(true);
    setMessage('');
    setError('');
    
    try {
      const response = await fetch(`${API_URL}/api/beacons/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ quantity: beaconQty })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage(data.message);
        setBeaconQty(0);
        loadStardockInfo();
        loadBeaconInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase beacons');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const purchaseMines = async () => {
    if (mineQty <= 0) return;

    setPurchasing(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/mines/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ quantity: mineQty })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setMineQty(0);
        loadStardockInfo();
        loadMineInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase mines');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const loadGenesisInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/api/genesis/info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setGenesisInfo(data);
      } else {
        console.error('Failed to load genesis info:', data.error);
        setGenesisInfo({ price: 50000, currentGenesis: 0, maxGenesis: 0 });
      }
    } catch (err) {
      console.error('Failed to load genesis info:', err);
      setGenesisInfo({ price: 50000, currentGenesis: 0, maxGenesis: 0 });
    }
  };

  const purchaseGenesis = async () => {
    if (genesisQty <= 0) return;

    setPurchasing(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/genesis/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ quantity: genesisQty })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setGenesisQty(0);
        loadStardockInfo();
        loadGenesisInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase genesis torpedoes');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const loadTransactions = async (accountId: number) => {
    try {
      const response = await fetch(`${API_URL}/api/banking/transactions/${accountId}?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  const handleDeposit = async () => {
    if (depositAmount <= 0) return;
    try {
      setPurchasing(true);
      setError('');
      setMessage('');
      const response = await fetch(`${API_URL}/api/banking/deposit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ accountType: selectedAccount, amount: depositAmount })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(`Deposited ₡${depositAmount.toLocaleString()} to ${selectedAccount} account`);
        setDepositAmount(0);
        loadBankingInfo();
        loadStardockInfo(); // Refresh credits
        // Update parent component's player state with new credits
        if (data.player) {
          onPurchase(data.player);
        }
      } else {
        setError(data.error || 'Failed to deposit');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const handleWithdraw = async () => {
    if (withdrawAmount <= 0) return;
    try {
      setPurchasing(true);
      setError('');
      setMessage('');
      const response = await fetch(`${API_URL}/api/banking/withdraw`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ accountType: selectedAccount, amount: withdrawAmount })
      });
      const data = await response.json();
      if (response.ok) {
        const withdrawalFee = Math.floor(withdrawAmount * 0.05);
        const receivedAmount = withdrawAmount - withdrawalFee;
        setMessage(`Withdrew ₡${withdrawAmount.toLocaleString()} from ${selectedAccount} account (Fee: ₡${withdrawalFee.toLocaleString()}, Received: ₡${receivedAmount.toLocaleString()})`);
        setWithdrawAmount(0);
        loadBankingInfo();
        loadStardockInfo(); // Refresh credits
        // Update parent component's player state with new credits
        if (data.player) {
          onPurchase(data.player);
        }
      } else {
        setError(data.error || 'Failed to withdraw');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const searchPlayers = async (searchTerm: string) => {
    if (searchTerm.length < 1) {
      setSearchResults([]);
      setSelectedRecipientId(null);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/banking/players/search?search=${encodeURIComponent(searchTerm)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setSearchResults(data.players);
      }
    } catch (err) {
      console.error('Failed to search players:', err);
    }
  };

  const handleTransfer = async (recipientId: number) => {
    console.log('[Banking] handleTransfer called with recipientId:', recipientId, 'amount:', transferAmount);
    if (transferAmount <= 0) {
      console.log('[Banking] Transfer amount is 0 or less, aborting');
      return;
    }

    // Check if player has sufficient funds in selected account
    const account = bankAccounts.find(acc => acc.account_type === selectedAccount);
    if (!account || account.balance < transferAmount) {
      setError(`Insufficient funds. Account balance: ₡${account?.balance.toLocaleString() || 0}`);
      return;
    }

    try {
      setPurchasing(true);
      setError('');
      setMessage('');
      console.log('[Banking] Sending transfer request...');
      const response = await fetch(`${API_URL}/api/banking/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipientId,
          amount: transferAmount,
          memo: transferMemo || undefined
        })
      });
      const data = await response.json();
      console.log('[Banking] Transfer response:', response.ok, data);
      if (response.ok) {
        setMessage(`Transferred ₡${transferAmount.toLocaleString()} successfully`);
        setTransferAmount(0);
        setTransferRecipient('');
        setTransferMemo('');
        setSearchResults([]);
        setSelectedRecipientId(null);
        loadBankingInfo();
      } else {
        setError(data.error || 'Failed to transfer');
      }
    } catch (err) {
      console.error('[Banking] Transfer error:', err);
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'banking') {
      loadBankingInfo();
    }
  }, [activeTab]);

  const purchaseShip = async (shipName: string) => {
    try {
      setPurchasing(true);
      setMessage('');
      const response = await fetch(`${API_URL}/api/stardock/ship`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ shipName })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        loadStardockInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase ship');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const purchaseFighters = async () => {
    if (fighterQty <= 0) return;
    try {
      setPurchasing(true);
      setMessage('');
      const response = await fetch(`${API_URL}/api/stardock/fighters`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quantity: fighterQty })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setFighterQty(0);
        loadStardockInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase fighters');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const purchaseShields = async () => {
    if (shieldQty <= 0) return;
    try {
      setPurchasing(true);
      setMessage('');
      const response = await fetch(`${API_URL}/api/stardock/shields`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quantity: shieldQty })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setShieldQty(0);
        loadStardockInfo();
        onPurchase(data.player);
      } else {
        setError(data.error || 'Failed to purchase shields');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  };

  const panelStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(20, 20, 40, 0.98) 0%, rgba(10, 10, 30, 0.98) 100%)',
    border: '2px solid var(--neon-cyan)',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: '25px',
    boxShadow: '0 0 40px rgba(0, 255, 255, 0.3), inset 0 0 60px rgba(0, 255, 255, 0.05)'
  };

  if (loading) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-cyan)' }}>
            Loading StarDock...
          </div>
        </div>
      </div>
    );
  }

  if (error && !stardock) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neon-pink)' }}>
            {error}
          </div>
          <button onClick={onClose} className="cyberpunk-button" style={{ width: '100%', marginTop: '20px' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!stardock) return null;

  const maxFighters = stardock.player.fightersMax - stardock.player.fighters;
  const maxShields = stardock.player.shieldsMax - stardock.player.shields;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--neon-cyan)',
          paddingBottom: '15px',
          marginBottom: '20px'
        }}>
          <div>
            <h2 style={{ color: 'var(--neon-cyan)', margin: 0, fontFamily: 'monospace' }}>
              🚀 {stardock.name || 'STARDOCK'}
            </h2>
            <div style={{ color: 'rgba(0, 255, 255, 0.7)', fontSize: '12px', marginTop: '5px' }}>
              Sector {stardock.sectorNumber} • Ships, Fighters & Shields
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 100, 0, 0.2)',
              border: '1px solid #ff6400',
              color: '#ff6400',
              padding: '8px 20px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontWeight: 'bold'
            }}
          >
            ✕ UNDOCK
          </button>
        </div>

        {/* Player Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '10px',
          marginBottom: '20px',
          padding: '15px',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(0, 255, 255, 0.2)'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>CREDITS</div>
            <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
              ₡{stardock.player.credits.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>SHIP</div>
            <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {stardock.player.currentShip}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>TRADE-IN VALUE</div>
            <div style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>
              ₡{stardock.tradeInValue.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>FIGHTERS</div>
            <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold' }}>
              {stardock.player.fighters}/{stardock.player.fightersMax}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(0, 255, 255, 0.6)' }}>SHIELDS</div>
            <div style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>
              {stardock.player.shields}/{stardock.player.shieldsMax}
            </div>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div style={{
            padding: '10px 15px',
            background: 'rgba(0, 255, 0, 0.1)',
            border: '1px solid var(--neon-green)',
            color: 'var(--neon-green)',
            marginBottom: '15px',
            fontSize: '13px'
          }}>
            ✓ {message}
          </div>
        )}
        {error && (
          <div style={{
            padding: '10px 15px',
            background: 'rgba(255, 0, 100, 0.1)',
            border: '1px solid var(--neon-pink)',
            color: 'var(--neon-pink)',
            marginBottom: '15px',
            fontSize: '13px'
          }}>
            ✕ {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {(['ships', 'equipment', 'banking'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 25px',
                background: activeTab === tab ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                border: `1px solid ${activeTab === tab ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.3)'}`,
                color: activeTab === tab ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.6)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}
            >
              {tab === 'ships' ? '🚀 Ships' : tab === 'equipment' ? '⚔️ Equipment' : '💰 Banking'}
            </button>
          ))}
        </div>

        {/* Ships Tab */}
        {activeTab === 'ships' && (
          <div style={{ display: 'grid', gap: '15px' }}>
            {stardock.ships.map(ship => (
              <div
                key={ship.id}
                style={{
                  padding: '15px',
                  background: ship.isCurrentShip ? 'rgba(0, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${ship.isCurrentShip ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.2)'}`,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '15px',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{
                    color: ship.isCurrentShip ? 'var(--neon-cyan)' : 'var(--text-primary)',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    marginBottom: '5px'
                  }}>
                    {ship.displayName}
                    {ship.isCurrentShip && (
                      <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--neon-green)' }}>
                        [CURRENT]
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                    {ship.description}
                  </div>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                    <span>📦 Holds: <strong>{ship.holds}</strong></span>
                    <span>⚔️ Fighters: <strong>{ship.fightersMax}</strong></span>
                    <span>🛡️ Shields: <strong>{ship.shieldsMax}</strong></span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: '150px' }}>
                  {ship.isCurrentShip ? (
                    <>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>
                        Value: ₡{ship.cost.toLocaleString()}
                      </div>
                      <div style={{
                        color: 'var(--neon-cyan)',
                        fontWeight: 'bold',
                        fontSize: '18px',
                        marginBottom: '10px'
                      }}>
                        YOUR SHIP
                      </div>
                      <button
                        disabled
                        style={{
                          padding: '8px 20px',
                          background: 'rgba(0, 255, 255, 0.1)',
                          border: '1px solid var(--neon-cyan)',
                          color: 'var(--neon-cyan)',
                          cursor: 'not-allowed',
                          fontFamily: 'monospace',
                          fontWeight: 'bold',
                          opacity: 0.7
                        }}
                      >
                        ✓ EQUIPPED
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>
                        List: ₡{ship.cost.toLocaleString()}
                      </div>
                      <div style={{
                        color: ship.canAfford ? 'var(--neon-green)' : 'var(--neon-pink)',
                        fontWeight: 'bold',
                        fontSize: '18px',
                        marginBottom: '10px'
                      }}>
                        Net: ₡{ship.netCost.toLocaleString()}
                        {ship.netCost < ship.cost && (
                          <div style={{ fontSize: '10px', color: 'var(--neon-green)' }}>
                            (Save ₡{(ship.cost - ship.netCost).toLocaleString()})
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => purchaseShip(ship.name)}
                        disabled={purchasing || !ship.canAfford}
                        style={{
                          padding: '8px 20px',
                          background: ship.canAfford ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 100, 0.2)',
                          border: `1px solid ${ship.canAfford ? 'var(--neon-green)' : 'var(--neon-pink)'}`,
                          color: ship.canAfford ? 'var(--neon-green)' : 'var(--neon-pink)',
                          cursor: !ship.canAfford ? 'not-allowed' : 'pointer',
                          fontFamily: 'monospace',
                          fontWeight: 'bold'
                        }}
                      >
                        {ship.canAfford ? 'TRADE IN & BUY' : 'INSUFFICIENT'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Equipment Tab */}
        {activeTab === 'equipment' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Fighters */}
            <div style={{
              padding: '20px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 20, 147, 0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px'
              }}>
                <div>
                  <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', fontSize: '16px' }}>
                    ⚔️ FIGHTERS
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    Combat drones for attack and defense
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                    ₡{stardock.fighterPrice}/each
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    Space: {maxFighters} available
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="number"
                  value={fighterQty === 0 ? '' : fighterQty}
                  onChange={e => {
                    const val = e.target.value;
                    setFighterQty(val === '' ? 0 : Math.max(0, Math.min(maxFighters, parseInt(val) || 0)));
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="0"
                  min="0"
                  max={maxFighters}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-pink)',
                    color: 'var(--neon-pink)',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  onClick={() => setFighterQty(Math.min(maxFighters, Math.floor(stardock.player.credits / stardock.fighterPrice)))}
                  style={{
                    padding: '10px 15px',
                    background: 'rgba(255, 20, 147, 0.2)',
                    border: '1px solid var(--neon-pink)',
                    color: 'var(--neon-pink)',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}
                >
                  MAX
                </button>
                <button
                  onClick={purchaseFighters}
                  disabled={purchasing || fighterQty <= 0}
                  style={{
                    padding: '10px 20px',
                    background: fighterQty > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${fighterQty > 0 ? 'var(--neon-green)' : '#666'}`,
                    color: fighterQty > 0 ? 'var(--neon-green)' : '#666',
                    cursor: fighterQty > 0 ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontWeight: 'bold'
                  }}
                >
                  BUY (₡{(fighterQty * stardock.fighterPrice).toLocaleString()})
                </button>
              </div>
            </div>

            {/* Shields */}
            <div style={{
              padding: '20px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(0, 255, 0, 0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px'
              }}>
                <div>
                  <div style={{ color: 'var(--neon-green)', fontWeight: 'bold', fontSize: '16px' }}>
                    🛡️ SHIELDS
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    Defensive barriers to absorb damage
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                    ₡{stardock.shieldPrice}/each
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    Space: {maxShields} available
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="number"
                  value={shieldQty === 0 ? '' : shieldQty}
                  onChange={e => {
                    const val = e.target.value;
                    setShieldQty(val === '' ? 0 : Math.max(0, Math.min(maxShields, parseInt(val) || 0)));
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="Quantity..."
                  min="0"
                  max={maxShields}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  onClick={() => setShieldQty(Math.min(maxShields, Math.floor(stardock.player.credits / stardock.shieldPrice)))}
                  style={{
                    padding: '10px 15px',
                    background: 'rgba(0, 255, 0, 0.2)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}
                >
                  MAX
                </button>
                <button
                  onClick={purchaseShields}
                  disabled={purchasing || shieldQty <= 0}
                  style={{
                    padding: '10px 20px',
                    background: shieldQty > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${shieldQty > 0 ? 'var(--neon-green)' : '#666'}`,
                    color: shieldQty > 0 ? 'var(--neon-green)' : '#666',
                    cursor: shieldQty > 0 ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontWeight: 'bold'
                  }}
                >
                  BUY (₡{(shieldQty * stardock.shieldPrice).toLocaleString()})
                </button>
              </div>
            </div>

            {/* Beacons */}
            {beaconInfo && (
              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(0, 200, 255, 0.3)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <div>
                    <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', fontSize: '16px' }}>
                      📡 BEACONS
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                      Personal message transmitters for marking sectors
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                      ₡{beaconInfo.price}/each
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                      Current: {beaconInfo.currentCount}/{beaconInfo.maxCapacity}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={beaconQty || ''}
                    onChange={e => setBeaconQty(Math.max(0, Math.min(beaconInfo.maxCapacity - beaconInfo.currentCount, parseInt(e.target.value) || 0)))}
                    placeholder="Quantity..."
                    min="0"
                    max={beaconInfo.maxCapacity - beaconInfo.currentCount}
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid var(--neon-cyan)',
                      color: 'var(--neon-cyan)',
                      fontFamily: 'monospace'
                    }}
                  />
                  <button
                    onClick={() => {
                      const maxCanBuy = beaconInfo.maxCapacity - beaconInfo.currentCount;
                      const maxAffordable = Math.floor((stardock?.player.credits || 0) / beaconInfo.price);
                      setBeaconQty(Math.min(maxCanBuy, maxAffordable));
                    }}
                    style={{
                      padding: '10px 15px',
                      background: 'rgba(0, 200, 255, 0.2)',
                      border: '1px solid var(--neon-cyan)',
                      color: 'var(--neon-cyan)',
                      cursor: 'pointer',
                      fontFamily: 'monospace'
                    }}
                  >
                    MAX
                  </button>
                  <button
                    onClick={purchaseBeacons}
                    disabled={purchasing || beaconQty <= 0}
                    style={{
                      padding: '10px 20px',
                      background: beaconQty > 0 ? 'rgba(0, 200, 255, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                      border: `1px solid ${beaconQty > 0 ? 'var(--neon-cyan)' : '#666'}`,
                      color: beaconQty > 0 ? 'var(--neon-cyan)' : '#666',
                      cursor: beaconQty > 0 ? 'pointer' : 'not-allowed',
                      fontFamily: 'monospace',
                      fontWeight: 'bold'
                    }}
                  >
                    BUY (₡{(beaconQty * beaconInfo.price).toLocaleString()})
                  </button>
                </div>
                <div style={{ 
                  marginTop: '10px', 
                  fontSize: '11px', 
                  color: 'rgba(255,255,255,0.5)',
                  fontStyle: 'italic'
                }}>
                  Capacity: Escape Pod (1) • Scout/Trader (5) • Larger ships (15)
                </div>
              </div>
            )}

            {/* Mines */}
            {mineInfo && (
              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 100, 0, 0.3)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <div>
                    <div style={{ color: '#ff6b00', fontWeight: 'bold', fontSize: '16px' }}>
                      💣 MINES
                    </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    Explosive devices that detonate when non-corp members enter sector
                  </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                      ₡{mineInfo.price.toLocaleString()}/each
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                      Current: {mineInfo.currentCount}/{mineInfo.maxCapacity}
                    </div>
                  </div>
                </div>
                {mineInfo.maxCapacity > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={mineQty || ''}
                        onChange={e => setMineQty(Math.max(0, Math.min(mineInfo.maxCapacity - mineInfo.currentCount, parseInt(e.target.value) || 0)))}
                        placeholder="Quantity..."
                        min="0"
                        max={mineInfo.maxCapacity - mineInfo.currentCount}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid #ff6b00',
                          color: '#ff6b00',
                          fontFamily: 'monospace'
                        }}
                      />
                      <button
                        onClick={() => {
                          const maxCanBuy = mineInfo.maxCapacity - mineInfo.currentCount;
                          const maxAffordable = Math.floor((stardock?.player.credits || 0) / mineInfo.price);
                          setMineQty(Math.min(maxCanBuy, maxAffordable));
                        }}
                        style={{
                          padding: '10px 15px',
                          background: 'rgba(255, 100, 0, 0.2)',
                          border: '1px solid #ff6b00',
                          color: '#ff6b00',
                          cursor: 'pointer',
                          fontFamily: 'monospace'
                        }}
                      >
                        MAX
                      </button>
                      <button
                        onClick={purchaseMines}
                        disabled={purchasing || mineQty <= 0}
                        style={{
                          padding: '10px 20px',
                          background: mineQty > 0 ? 'rgba(255, 100, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                          border: `1px solid ${mineQty > 0 ? '#ff6b00' : '#666'}`,
                          color: mineQty > 0 ? '#ff6b00' : '#666',
                          cursor: mineQty > 0 ? 'pointer' : 'not-allowed',
                          fontFamily: 'monospace',
                          fontWeight: 'bold'
                        }}
                      >
                        BUY (₡{(mineQty * mineInfo.price).toLocaleString()})
                      </button>
                    </div>
                    <div style={{
                      marginTop: '10px',
                      fontSize: '11px',
                      color: 'rgba(255,255,255,0.5)',
                      fontStyle: 'italic'
                    }}>
                      Capacity: Scout (0) • Medium ships (2) • Large ships (5) • Max 5 per sector (8 with planet)
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: '15px',
                    background: 'rgba(100, 100, 100, 0.2)',
                    border: '1px solid #666',
                    color: '#999',
                    fontSize: '13px',
                    textAlign: 'center'
                  }}>
                    Your current ship cannot carry mines. Upgrade to a Trader or larger ship.
                  </div>
                )}
              </div>
            )}

            {/* Genesis Torpedoes */}
            {genesisInfo && (
              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(138, 43, 226, 0.3)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <div>
                    <div style={{ color: 'var(--neon-purple)', fontWeight: 'bold', fontSize: '16px' }}>
                      🌍 GENESIS TORPEDOES
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                      Create new planets anywhere in the universe
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                      ₡{genesisInfo.price.toLocaleString()}/each
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                      Current: {genesisInfo.currentGenesis}/{genesisInfo.maxGenesis}
                    </div>
                  </div>
                </div>
                {genesisInfo.maxGenesis > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={genesisQty || ''}
                        onChange={e => setGenesisQty(Math.max(0, Math.min(genesisInfo.maxGenesis - genesisInfo.currentGenesis, parseInt(e.target.value) || 0)))}
                        placeholder="Quantity..."
                        min="0"
                        max={genesisInfo.maxGenesis - genesisInfo.currentGenesis}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid var(--neon-purple)',
                          color: 'var(--neon-purple)',
                          fontFamily: 'monospace'
                        }}
                      />
                      <button
                        onClick={() => {
                          const maxCanBuy = genesisInfo.maxGenesis - genesisInfo.currentGenesis;
                          const maxAffordable = Math.floor((stardock?.player.credits || 0) / genesisInfo.price);
                          setGenesisQty(Math.min(maxCanBuy, maxAffordable));
                        }}
                        style={{
                          padding: '10px 15px',
                          background: 'rgba(138, 43, 226, 0.2)',
                          border: '1px solid var(--neon-purple)',
                          color: 'var(--neon-purple)',
                          cursor: 'pointer',
                          fontFamily: 'monospace'
                        }}
                      >
                        MAX
                      </button>
                      <button
                        onClick={purchaseGenesis}
                        disabled={purchasing || genesisQty <= 0}
                        style={{
                          padding: '10px 20px',
                          background: genesisQty > 0 ? 'rgba(138, 43, 226, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                          border: `1px solid ${genesisQty > 0 ? 'var(--neon-purple)' : '#666'}`,
                          color: genesisQty > 0 ? 'var(--neon-purple)' : '#666',
                          cursor: genesisQty > 0 ? 'pointer' : 'not-allowed',
                          fontFamily: 'monospace',
                          fontWeight: 'bold'
                        }}
                      >
                        BUY (₡{(genesisQty * genesisInfo.price).toLocaleString()})
                      </button>
                    </div>
                    <div style={{
                      marginTop: '10px',
                      fontSize: '11px',
                      color: 'rgba(255,255,255,0.5)',
                      fontStyle: 'italic'
                    }}>
                      Capacity: Scout (5) • Medium ships (10-15) • Corporate Flagship (25)
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: '15px',
                    background: 'rgba(100, 100, 100, 0.2)',
                    border: '1px solid #666',
                    color: '#999',
                    fontSize: '13px',
                    textAlign: 'center'
                  }}>
                    Your current ship cannot carry genesis torpedoes. Upgrade to a Scout or larger ship.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Banking Tab */}
        {activeTab === 'banking' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Account Selection & Balances */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: bankAccounts.length > 1 ? 'repeat(2, 1fr)' : '1fr',
              gap: '15px'
            }}>
              {bankAccounts.map(account => (
                <div
                  key={account.id}
                  onClick={() => {
                    setSelectedAccount(account.account_type);
                    loadTransactions(account.id);
                  }}
                  style={{
                    padding: '20px',
                    background: selectedAccount === account.account_type ? 'rgba(0, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)',
                    border: `2px solid ${selectedAccount === account.account_type ? 'var(--neon-cyan)' : 'rgba(0, 255, 255, 0.2)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'rgba(0, 255, 255, 0.7)', marginBottom: '5px' }}>
                    {account.account_type === 'personal' ? '👤 PERSONAL ACCOUNT' : `🏢 CORPORATE ACCOUNT`}
                  </div>
                  {account.corp_name && (
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '8px' }}>
                      {account.corp_name}
                    </div>
                  )}
                  <div style={{ fontSize: '24px', color: 'var(--neon-yellow)', fontWeight: 'bold' }}>
                    ₡{account.balance.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Deposit */}
            <div style={{
              padding: '20px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(0, 255, 0, 0.3)'
            }}>
              <div style={{ color: 'var(--neon-green)', fontWeight: 'bold', marginBottom: '10px' }}>
                💵 DEPOSIT (On-Hand → Bank)
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '10px' }}>
                On-Hand Credits: ₡{stardock?.player.credits.toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="number"
                  value={depositAmount || ''}
                  onChange={e => setDepositAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="Amount..."
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  onClick={() => setDepositAmount(stardock?.player.credits || 0)}
                  style={{
                    padding: '10px 15px',
                    background: 'rgba(0, 255, 0, 0.2)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}
                >
                  MAX
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={purchasing || depositAmount <= 0}
                  style={{
                    padding: '10px 20px',
                    background: depositAmount > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${depositAmount > 0 ? 'var(--neon-green)' : '#666'}`,
                    color: depositAmount > 0 ? 'var(--neon-green)' : '#666',
                    cursor: depositAmount > 0 ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontWeight: 'bold'
                  }}
                >
                  DEPOSIT
                </button>
              </div>
            </div>

            {/* Withdraw */}
            <div style={{
              padding: '20px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(0, 255, 255, 0.3)'
            }}>
              <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', marginBottom: '10px' }}>
                💳 WITHDRAW (Bank → On-Hand)
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '10px' }}>
                {selectedAccount === 'personal' ? 'Personal' : 'Corporate'} Balance: ₡{(bankAccounts.find(a => a.account_type === selectedAccount)?.balance || 0).toLocaleString()}
              </div>
              {withdrawAmount > 0 && (
                <div style={{ fontSize: '11px', color: 'rgba(255, 100, 0, 0.8)', marginBottom: '10px', padding: '8px', background: 'rgba(255, 100, 0, 0.1)', border: '1px solid rgba(255, 100, 0, 0.3)' }}>
                  ⚠️ Withdrawal Fee: ₡{Math.floor(withdrawAmount * 0.05).toLocaleString()} (5%)<br/>
                  You will receive: ₡{(withdrawAmount - Math.floor(withdrawAmount * 0.05)).toLocaleString()}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="number"
                  value={withdrawAmount || ''}
                  onChange={e => setWithdrawAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="Amount..."
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-cyan)',
                    color: 'var(--neon-cyan)',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  onClick={() => setWithdrawAmount(bankAccounts.find(a => a.account_type === selectedAccount)?.balance || 0)}
                  style={{
                    padding: '10px 15px',
                    background: 'rgba(0, 255, 255, 0.2)',
                    border: '1px solid var(--neon-cyan)',
                    color: 'var(--neon-cyan)',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}
                >
                  MAX
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={purchasing || withdrawAmount <= 0}
                  style={{
                    padding: '10px 20px',
                    background: withdrawAmount > 0 ? 'rgba(0, 255, 255, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${withdrawAmount > 0 ? 'var(--neon-cyan)' : '#666'}`,
                    color: withdrawAmount > 0 ? 'var(--neon-cyan)' : '#666',
                    cursor: withdrawAmount > 0 ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontWeight: 'bold'
                  }}
                >
                  WITHDRAW
                </button>
              </div>
            </div>

            {/* Transfer */}
            <div style={{
              padding: '20px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 20, 147, 0.3)'
            }}>
              <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', marginBottom: '10px' }}>
                📤 TRANSFER (To Another Player)
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <input
                  type="text"
                  value={transferRecipient}
                  onChange={e => {
                    setTransferRecipient(e.target.value);
                    setSelectedRecipientId(null);
                    searchPlayers(e.target.value);
                  }}
                  placeholder="Search for player..."
                  style={{
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-pink)',
                    color: 'var(--neon-pink)',
                    fontFamily: 'monospace'
                  }}
                />
                {searchResults.length > 0 && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '1px solid var(--neon-pink)',
                    maxHeight: '150px',
                    overflowY: 'auto'
                  }}>
                    {searchResults.map(player => (
                      <div
                        key={player.id}
                        onClick={() => {
                          setTransferRecipient(player.name);
                          setSelectedRecipientId(player.id);
                          setSearchResults([]);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid rgba(255, 20, 147, 0.2)',
                          color: 'var(--neon-pink)',
                          fontSize: '14px'
                        }}
                      >
                        {player.name}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="number"
                    value={transferAmount || ''}
                    onChange={e => setTransferAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="Amount..."
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid var(--neon-pink)',
                      color: 'var(--neon-pink)',
                      fontFamily: 'monospace'
                    }}
                  />
                  <input
                    type="text"
                    value={transferMemo}
                    onChange={e => setTransferMemo(e.target.value)}
                    placeholder="Memo (optional)..."
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid var(--neon-pink)',
                      color: 'var(--neon-pink)',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    console.log('[Banking] Button clicked. selectedRecipientId:', selectedRecipientId, 'searchResults:', searchResults, 'transferAmount:', transferAmount);
                    const targetId =
                      selectedRecipientId ||
                      (searchResults.length ? searchResults[0].id : null);
                    console.log('[Banking] targetId:', targetId);
                    if (targetId) {
                      handleTransfer(targetId);
                    } else {
                      console.log('[Banking] No targetId, not calling handleTransfer');
                    }
                  }}
                  disabled={purchasing || transferAmount <= 0 || (!selectedRecipientId && !searchResults.length)}
                  style={{
                    padding: '10px 20px',
                    background: transferAmount > 0 && (selectedRecipientId || searchResults.length) ? 'rgba(255, 20, 147, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                    border: `1px solid ${transferAmount > 0 && (selectedRecipientId || searchResults.length) ? 'var(--neon-pink)' : '#666'}`,
                    color: transferAmount > 0 && (selectedRecipientId || searchResults.length) ? 'var(--neon-pink)' : '#666',
                    cursor: transferAmount > 0 && (selectedRecipientId || searchResults.length) ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontWeight: 'bold'
                  }}
                >
                  SEND TRANSFER
                </button>
              </div>
            </div>

            {/* Recent Transactions */}
            {transactions.length > 0 && (
              <div style={{
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(0, 255, 255, 0.3)'
              }}>
                <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', marginBottom: '15px' }}>
                  📜 RECENT TRANSACTIONS
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {transactions.map(tx => (
                    <div
                      key={tx.id}
                      style={{
                        padding: '10px',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(0, 255, 255, 0.2)',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                          {tx.transaction_type.replace('_', ' ')}
                        </span>
                        <span style={{
                          color: tx.transaction_type.includes('in') || tx.transaction_type === 'deposit' ? 'var(--neon-green)' : 'var(--neon-pink)',
                          fontWeight: 'bold'
                        }}>
                          {tx.transaction_type.includes('in') || tx.transaction_type === 'deposit' ? '+' : '-'}₡{tx.amount.toLocaleString()}
                        </span>
                      </div>
                      {tx.related_player_name && (
                        <div style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                          {tx.transaction_type.includes('in') ? 'From' : 'To'}: {tx.related_player_name}
                        </div>
                      )}
                      {tx.memo && (
                        <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
                          "{tx.memo}"
                        </div>
                      )}
                      <div style={{ color: 'rgba(0, 255, 255, 0.5)', marginTop: '5px', fontSize: '10px' }}>
                        Balance: ₡{tx.balance_after.toLocaleString()} • {new Date(tx.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

