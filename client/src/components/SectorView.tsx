import { useState, useEffect } from 'react';
import PortTradingPanel from './PortTradingPanel';
import PlanetManagementPanel from './PlanetManagementPanel';
import StarDockPanel from './StarDockPanel';
import CombatPanel from './CombatPanel';
import { API_URL } from '../config/api';

interface Warp {
  destination: number;
  isTwoWay: boolean;
}

interface Player {
  id: number;
  corpName: string;
  shipType: string;
  alignment: number;
  fighters: number;
  shields: number;
  username: string;
}

interface Planet {
  id: number;
  name: string;
  ownerId: number | null;
  ownerName: string | null;
}

interface FloatingCargo {
  id: number;
  fuel: number;
  organics: number;
  equipment: number;
  colonists: number;
  source: string;
  createdAt: string;
}

interface Beacon {
  id: number;
  ownerId: number;
  ownerName: string;
  message: string;
  createdAt: string;
}

interface DeployedFighter {
  id: number;
  ownerId: number;
  ownerName: string;
  fighterCount: number;
  deployedAt: string;
  isOwn: boolean;
}

interface AlienShip {
  id: number;
  alienRace: string;
  shipName: string;
  shipType: string;
  fighters: number;
  shields: number;
  behavior: string;
}

interface AlienPlanet {
  id: number;
  name: string;
  alienRace: string;
  citadelLevel: number;
  fighters: number;
}

interface Sector {
  sectorNumber: number;
  name: string | null;
  region?: string;
  portType: string | null;
  hasPort: boolean;
  portClass: number;
  hasPlanet: boolean;
  hasBeacon: boolean;
  fightersCount: number;
  minesCount: number;
  warps: Warp[];
  players: Player[];
  planets: Planet[];
  floatingCargo?: FloatingCargo[];
  beacons?: Beacon[];
  deployedFighters?: DeployedFighter[];
  hasHostileFighters?: boolean;
  hostileFighterCount?: number;
  alienShips?: AlienShip[];
  alienPlanet?: AlienPlanet | null;
}

interface CombatTarget {
  id: number;
  corpName: string;
  username: string;
  shipType: string;
  fighters: number;
  shields: number;
  alignment: number;
  inSafeZone: boolean;
}

interface PlayerData {
  id: number;
  credits: number;
  turnsRemaining: number;
  shipHoldsMax: number;
  cargoFuel: number;
  cargoOrganics: number;
  cargoEquipment: number;
  colonists: number;
}

interface PathSector {
  sectorNumber: number;
  hasPort: boolean;
  hasPlanet: boolean;
  hasStardock: boolean;
  hasShips: boolean;
  hasAlienPlanet?: boolean;
  hasAlienShips?: boolean;
  alienShipCount?: number;
  visited: boolean;
}

interface PlottedPath {
  path: number[];
  sectors: PathSector[];
  distance: number;
}

interface SectorViewProps {
  currentSector: number;
  token: string;
  currentPlayerId: number;
  player: PlayerData;
  onSectorChange: (player: any) => void;
}

export default function SectorView({ currentSector, token, currentPlayerId, player, onSectorChange }: SectorViewProps) {
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [beaconAttackResult, setBeaconAttackResult] = useState<{message: string, fightersLost: number} | null>(null);
  const [fighterAttackResult, setFighterAttackResult] = useState<{message: string, attackerWon: boolean, losses: any} | null>(null);
  const [moving, setMoving] = useState(false);
  const [showTrading, setShowTrading] = useState(false);
  const [previousSector, setPreviousSector] = useState<number | null>(() => {
    const stored = localStorage.getItem(`previousSector_${player.id}`);
    return stored ? parseInt(stored) : null;
  });
  const [visitedSectors, setVisitedSectors] = useState<Set<number>>(() => {
    const stored = localStorage.getItem(`visitedSectors_${player.id}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [misfireAlert, setMisfireAlert] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [destinationSector, setDestinationSector] = useState('');
  const [plottedPath, setPlottedPath] = useState<PlottedPath | null>(null);
  const [plotError, setPlotError] = useState('');
  const [plotting, setPlotting] = useState(false);
  const [autoNavigating, setAutoNavigating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPathIndex, setCurrentPathIndex] = useState(0);
  const [showPlanetPanel, setShowPlanetPanel] = useState<number | null>(null);
  const [showStarDock, setShowStarDock] = useState(false);
  const [combatTarget, setCombatTarget] = useState<CombatTarget | null>(null);
  const [pickingUpCargo, setPickingUpCargo] = useState<number | null>(null);
  const [showBeaconLaunch, setShowBeaconLaunch] = useState(false);
  const [beaconMessage, setBeaconMessage] = useState('');
  const [launchingBeacon, setLaunchingBeacon] = useState(false);
  const [attackingBeacon, setAttackingBeacon] = useState<number | null>(null);
  const [showDeployFighters, setShowDeployFighters] = useState(false);
  const [deployFighterCount, setDeployFighterCount] = useState(0);
  const [deployingFighters, setDeployingFighters] = useState(false);
  const [showRetrieveFighters, setShowRetrieveFighters] = useState<number | null>(null);
  const [retrieveFighterCount, setRetrieveFighterCount] = useState(0);
  const [retrievingFighters, setRetrievingFighters] = useState(false);
  const [localFighterCount, setLocalFighterCount] = useState<number | null>(null);
  const [attackingDeployment, setAttackingDeployment] = useState<number | null>(null);
  const [showHostileEncounter, setShowHostileEncounter] = useState(false);
  const [hostileEncounterData, setHostileEncounterData] = useState<{fighters: DeployedFighter[], totalCount: number} | null>(null);
  const [beaconInfo, setBeaconInfo] = useState<{current: number, max: number} | null>(null);
  const [showScanSector, setShowScanSector] = useState(false);
  const [scanningSector, setScanningSector] = useState(false);
  const [scannedSector, setScannedSector] = useState<any | null>(null);
  const [showDeployMines, setShowDeployMines] = useState(false);
  const [deployMineCount, setDeployMineCount] = useState(0);
  const [deployingMines, setDeployingMines] = useState(false);
  const [mineExplosionResult, setMineExplosionResult] = useState<{message: string, shieldsLost: number, fightersLost: number} | null>(null);
  const [attackingAlienShip, setAttackingAlienShip] = useState<number | null>(null);
  const [attackingAlienPlanet, setAttackingAlienPlanet] = useState<number | null>(null);
  const [alienCombatResult, setAlienCombatResult] = useState<any | null>(null);

  useEffect(() => {
    loadSectorDetails();
    loadBeaconInfo();
    // Mark current sector as visited
    setVisitedSectors(prev => {
      const newSet = new Set(prev);
      newSet.add(currentSector);
      localStorage.setItem(`visitedSectors_${player.id}`, JSON.stringify([...newSet]));
      return newSet;
    });
    // Clear plot error when moving to a new sector
    setPlotError('');

    // Update plotted path if we're navigating
    if (plottedPath && plottedPath.path.length > 0) {
      const currentIndex = plottedPath.path.indexOf(currentSector);
      if (currentIndex !== -1 && currentIndex < plottedPath.path.length - 1) {
        // Update the path to remove sectors we've already passed
        const remainingPath = plottedPath.path.slice(currentIndex);
        const remainingSectors = plottedPath.sectors.slice(currentIndex);
        setPlottedPath({
          path: remainingPath,
          sectors: remainingSectors,
          distance: remainingPath.length - 1
        });
        // Reset currentPathIndex to 1 since we're now at index 0 of the new sliced array
        if (autoNavigating) {
          setCurrentPathIndex(1);
        }
      } else if (currentIndex === plottedPath.path.length - 1) {
        // We've reached the destination
        setPlottedPath(null);
        setDestinationSector('');
        setAutoNavigating(false);
      }
    }
  }, [currentSector]);

  const loadSectorDetails = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/api/sectors/${currentSector}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load sector' }));
        console.error('Sector load error:', { status: response.status, error: errorData });
        setError(errorData.error || errorData.details || 'Failed to load sector');
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.sector) {
        setSector(data.sector);
      } else {
        setError('Invalid sector data received');
      }
    } catch (err: any) {
      console.error('Sector load network error:', err);
      setError(`Network error: ${err.message || 'Failed to connect to server'}`);
    } finally {
      setLoading(false);
    }
  };

  const loadBeaconInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/api/beacons/info`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setBeaconInfo({
          current: data.currentCount || 0,
          max: data.maxCapacity || 0
        });
      }
    } catch (err) {
      // Silent fail
    }
  };

  const scanAdjoiningSector = async (sectorNumber: number) => {
    if (player.turnsRemaining < 1) {
      setError('Not enough turns to scan');
      return;
    }
    
    setScanningSector(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/sectors/scan/${sectorNumber}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setScannedSector(data.scan);
        setShowScanSector(true);
        // Refresh player to update turns
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
      } else {
        setError(data.error || 'Failed to scan sector');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setScanningSector(false);
    }
  };

  const moveToSector = async (destination: number, isAutoNav: boolean = false) => {
    if (moving) return;

    // Track the sector we're leaving as the previous sector
    setPreviousSector(currentSector);
    localStorage.setItem(`previousSector_${player.id}`, currentSector.toString());

    // Clear plotted path if manually warping (not auto-nav)
    if (!isAutoNav && plottedPath) {
      setPlottedPath(null);
      setDestinationSector('');
      setAutoNavigating(false);
      setIsPaused(false);
      setCurrentPathIndex(0);
    }

    setMoving(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/sectors/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          destinationSector: destination,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Check for warp misfire
        if (data.misfired && data.misfireMessage) {
          setMisfireAlert(data.misfireMessage);
          setShaking(true);
          // Stop shaking after 3 seconds (alert stays visible until next warp)
          setTimeout(() => setShaking(false), 3000);
        } else {
          // Clear any previous misfire alert on successful warp
          setMisfireAlert(null);
        }
        // Check for mine explosions
        if (data.mineResult && data.mineResult.triggered) {
          setMineExplosionResult({
            message: data.mineResult.message,
            shieldsLost: data.mineResult.shieldsLost || 0,
            fightersLost: data.mineResult.fightersLost || 0
          });
        }
        // Update parent with new player data
        onSectorChange(data.player);
      } else {
        setError(data.error || 'Failed to move');
        // Stop auto-navigation if there's an error (like no warp connection)
        if (isAutoNav) {
          setAutoNavigating(false);
          setIsPaused(false);
          setPlottedPath(null);
          setDestinationSector('');
        }
      }
    } catch (err) {
      setError('Network error');
      // Stop auto-navigation on network error
      if (isAutoNav) {
        setAutoNavigating(false);
        setIsPaused(false);
        setPlottedPath(null);
        setDestinationSector('');
      }
    } finally {
      setMoving(false);
    }
  };

  const plotCourse = async () => {
    const dest = parseInt(destinationSector);
    if (isNaN(dest) || dest < 1) {
      setPlotError('Invalid sector number');
      return;
    }

    if (dest === currentSector) {
      setPlotError('You are already at this sector');
      return;
    }

    // Clear any existing auto-navigation state
    setAutoNavigating(false);
    setIsPaused(false);
    setCurrentPathIndex(0);

    setPlotting(true);
    setPlotError('');

    try {
      const response = await fetch(`${API_URL}/api/pathfinding/plot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          destinationSector: dest,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setPlottedPath(data);
        setCurrentPathIndex(0);
      } else {
        setPlotError(data.error || 'Failed to plot course');
        setPlottedPath(null);
      }
    } catch (err) {
      setPlotError('Network error');
      setPlottedPath(null);
    } finally {
      setPlotting(false);
    }
  };

  const startAutoNavigation = () => {
    if (!plottedPath || plottedPath.path.length < 2) return;
    setAutoNavigating(true);
    setCurrentPathIndex(1); // Start at index 1 (current sector is index 0)

    // Immediately trigger first move
    setTimeout(() => {
      if (plottedPath && plottedPath.path.length > 1) {
        moveToSector(plottedPath.path[1], true);
        setCurrentPathIndex(2);
      }
    }, 100);
  };

  const stopAutoNavigation = () => {
    setAutoNavigating(false);
    setIsPaused(false);
  };

  const continueAutoNavigation = () => {
    if (!plottedPath || !autoNavigating) return;

    // Clear pause state when manually continuing
    setIsPaused(false);

    if (currentPathIndex < plottedPath.path.length) {
      const nextSector = plottedPath.path[currentPathIndex];
      moveToSector(nextSector, true); // Pass true for isAutoNav
      setCurrentPathIndex(prev => prev + 1);
    } else {
      // Reached destination
      setAutoNavigating(false);
      setIsPaused(false);
      setPlottedPath(null);
      setDestinationSector('');
    }
  };

  const clearPlottedPath = () => {
    setPlottedPath(null);
    setDestinationSector('');
    setPlotError('');
    setAutoNavigating(false);
    setIsPaused(false);
    setCurrentPathIndex(0);
  };

  const pickupFloatingCargo = async (cargoId: number) => {
    setPickingUpCargo(cargoId);
    try {
      const response = await fetch(`${API_URL}/api/cargo/pickup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ cargoId }),
      });

      const data = await response.json();

      if (response.ok) {
        // Refresh sector to update floating cargo display
        loadSectorDetails();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
      } else {
        setError(data.error || 'Failed to pick up cargo');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setPickingUpCargo(null);
    }
  };

  const launchBeacon = async () => {
    if (!beaconMessage.trim()) {
      setError('Beacon message cannot be empty');
      return;
    }
    setLaunchingBeacon(true);
    try {
      const response = await fetch(`${API_URL}/api/beacons/launch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: beaconMessage }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowBeaconLaunch(false);
        setBeaconMessage('');
        loadSectorDetails();
        loadBeaconInfo(); // Refresh beacon count
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
        setSuccessMessage(data.message || `Beacon launched in Sector ${currentSector}!`);
        setTimeout(() => setSuccessMessage(null), 8000);
      } else {
        setError(data.error || 'Failed to launch beacon');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLaunchingBeacon(false);
    }
  };

  const handleAttackBeacon = async (beaconId: number) => {
    setAttackingBeacon(beaconId);
    try {
      const response = await fetch(`${API_URL}/api/beacons/attack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ beaconId }),
      });

      const data = await response.json();

      if (response.ok) {
        setBeaconAttackResult({
          message: data.message,
          fightersLost: data.fightersLost || 0
        });
        setTimeout(() => setBeaconAttackResult(null), 10000);
        
        // Refresh player data first, then sector
        try {
          const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (playerResponse.ok) {
            const playerData = await playerResponse.json();
            onSectorChange(playerData.player);
          }
        } catch (playerErr) {
          console.error('Failed to refresh player data:', playerErr);
        }
        
        // Reload sector after a short delay to ensure backend has updated
        setTimeout(() => {
          loadSectorDetails();
        }, 500);
      } else {
        const errorMsg = data.error || data.message || data.details || 'Failed to attack beacon';
        console.error('Beacon attack error:', { status: response.status, data });
        setError(errorMsg);
        setBeaconAttackResult(null);
        // Reload sector even on error to ensure UI is in sync
        setTimeout(() => {
          loadSectorDetails();
        }, 500);
      }
    } catch (err: any) {
      console.error('Beacon attack network error:', err);
      setError(`Network error: ${err.message || 'Failed to connect to server'}`);
      setBeaconAttackResult(null);
      // Reload sector even on error to ensure UI is in sync
      loadSectorDetails();
    } finally {
      setAttackingBeacon(null);
    }
  };

  const handleRetrieveBeacon = async (beaconId: number) => {
    try {
      const response = await fetch(`${API_URL}/api/beacons/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ beaconId }),
      });

      const data = await response.json();

      if (response.ok) {
        // Update beacon info immediately from response
        if (data.beaconsOnShip !== undefined && beaconInfo) {
          setBeaconInfo({
            ...beaconInfo,
            current: data.beaconsOnShip
          });
        } else {
          // Fallback: refresh beacon info
          loadBeaconInfo();
        }
        // Refresh sector details to remove beacon from list
        loadSectorDetails();
        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
        setSuccessMessage(data.message || 'Beacon retrieved successfully!');
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(data.error || 'Failed to retrieve beacon');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleDeployFighters = async () => {
    if (deployFighterCount <= 0) return;
    setDeployingFighters(true);
    try {
      const response = await fetch(`${API_URL}/api/sector-fighters/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ count: deployFighterCount }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowDeployFighters(false);
        setDeployFighterCount(0);
        
        // Update local fighter count immediately for UI responsiveness
        if (data.shipFighters !== undefined) {
          setLocalFighterCount(data.shipFighters);
          
          // Update parent state immediately with new fighter count
          // Pass the fighter count to parent so Ship Status updates immediately
          onSectorChange({
            shipFighters: data.shipFighters
          } as any);
        }
        
        // Reload sector details to update deployed fighters list
        loadSectorDetails();
        
        // Fetch full player data in background to sync state (without blocking UI)
        fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
          .then(playerResponse => playerResponse.json())
          .then(playerData => {
            if (playerData.player) {
              setLocalFighterCount(null); // Clear local override once we have real data
              onSectorChange(playerData.player);
            }
          })
          .catch(() => {
            // Silent fail - local update is already applied
            setLocalFighterCount(null);
          });
      } else {
        setError(data.error || 'Failed to deploy fighters');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setDeployingFighters(false);
    }
  };

  const handleRetrieveFighters = async (count: number) => {
    if (count <= 0) return;
    setRetrievingFighters(true);
    try {
      const response = await fetch(`${API_URL}/api/sector-fighters/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ count }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowRetrieveFighters(null);
        setRetrieveFighterCount(0);
        
        // Update local fighter count immediately for UI responsiveness
        if (data.shipFighters !== undefined) {
          setLocalFighterCount(data.shipFighters);
          
          // Update parent state immediately with new fighter count
          // Pass the fighter count to parent so Ship Status updates immediately
          onSectorChange({
            shipFighters: data.shipFighters
          } as any);
        }
        
        // Reload sector details to update deployed fighters list
        loadSectorDetails();
        
        // Fetch full player data in background to sync state (without blocking UI)
        fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
          .then(playerResponse => playerResponse.json())
          .then(playerData => {
            if (playerData.player) {
              setLocalFighterCount(null); // Clear local override once we have real data
              onSectorChange(playerData.player);
            }
          })
          .catch(() => {
            // Silent fail - local update is already applied
            setLocalFighterCount(null);
          });
      } else {
        setError(data.error || 'Failed to retrieve fighters');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setRetrievingFighters(false);
    }
  };

  const handleDeployMines = async () => {
    if (deployMineCount <= 0) return;
    
    setDeployingMines(true);
    setError('');
    
    try {
      const response = await fetch(`${API_URL}/api/mines/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ count: deployMineCount }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage(data.message);
        setDeployMineCount(0);
        setShowDeployMines(false);
        loadSectorDetails();
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
      } else {
        setError(data.error || 'Failed to deploy mines');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setDeployingMines(false);
    }
  };

  const handleAttackDeployedFighters = async (deploymentId: number) => {
    setAttackingDeployment(deploymentId);
    try {
      const response = await fetch(`${API_URL}/api/sector-fighters/attack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ deploymentId }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowHostileEncounter(false);
        setHostileEncounterData(null);
        loadSectorDetails();
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
        setFighterAttackResult({
          message: data.message,
          attackerWon: data.attackerWon,
          losses: {
            fighters: data.attackerFightersLost,
            shields: data.attackerShieldsLost,
            defenderFighters: data.defenderFightersLost
          }
        });
        setTimeout(() => setFighterAttackResult(null), 10000);
      } else {
        setError(data.error || 'Failed to attack fighters');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setAttackingDeployment(null);
    }
  };

  const handleRetreat = async (destinationSector: number) => {
    try {
      const response = await fetch(`${API_URL}/api/sector-fighters/retreat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ destinationSector }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowHostileEncounter(false);
        setHostileEncounterData(null);

        // Fetch full player data to ensure all fields are updated
        let updatedPlayer;
        try {
          const fullPlayerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (fullPlayerResponse.ok) {
            const fullPlayerData = await fullPlayerResponse.json();
            updatedPlayer = fullPlayerData.player;
            onSectorChange(updatedPlayer);
          } else {
            // Fallback to partial data if full fetch fails
            updatedPlayer = { ...player, ...data.player };
            onSectorChange(updatedPlayer);
          }
        } catch (fetchErr) {
          // If fetch fails, use partial data
          updatedPlayer = { ...player, ...data.player };
          onSectorChange(updatedPlayer);
        }

        // Show death message if died, otherwise show retreat message
        if (data.died) {
          setFighterAttackResult({
            attackerWon: false,
            message: data.message,
            losses: {
              fighters: data.fightersLost,
              shields: data.shieldsLost,
              defenderFighters: 0
            }
          });
        } else {
          setSuccessMessage(data.message);
          setTimeout(() => setSuccessMessage(null), 8000);
        }
        
        // Force reload sector details - clear current sector state first
        setSector(null);
        setLoading(true);
        
        // Use the new sector number directly from the response or updated player
        const newSectorNumber = data.player?.currentSector || updatedPlayer?.currentSector || destinationSector;
        
        // Reload after a brief delay to ensure state updates, using the new sector number
        setTimeout(async () => {
          try {
            const sectorResponse = await fetch(`${API_URL}/api/sectors/${newSectorNumber}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });

            if (sectorResponse.ok) {
              const sectorData = await sectorResponse.json();
              if (sectorData.sector) {
                setSector(sectorData.sector);
              } else {
                setError('Invalid sector data received');
              }
            } else {
              const errorData = await sectorResponse.json().catch(() => ({ error: 'Failed to load sector' }));
              setError(errorData.error || 'Failed to load sector');
            }
          } catch (err: any) {
            console.error('Sector load network error:', err);
            setError(`Network error: ${err.message || 'Failed to connect to server'}`);
          } finally {
            setLoading(false);
          }
        }, 300);
      } else {
        setError(data.error || 'Failed to retreat');
      }
    } catch (err) {
      console.error('Retreat error:', err);
      setError('Network error');
    }
  };

  const handleAttackAlienShip = async (alienShipId: number) => {
    setAttackingAlienShip(alienShipId);
    try {
      const response = await fetch(`${API_URL}/api/aliens/attack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ alienShipId }),
      });

      const data = await response.json();

      if (response.ok) {
        setAlienCombatResult(data);
        loadSectorDetails();

        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
      } else {
        setError(data.error || 'Failed to attack alien ship');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setAttackingAlienShip(null);
    }
  };

  const handleAttackAlienPlanet = async (planetId: number) => {
    if (!token) {
      setError('Authentication token missing. Please re-login.');
      return;
    }

    setAttackingAlienPlanet(planetId);

    // Guard against hangs: abort if no response within 10s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${API_URL}/api/aliens/attack-planet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ planetId: Number(planetId) }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (response.ok) {
        setAlienCombatResult(data);
        loadSectorDetails();

        // Refresh player data
        const playerResponse = await fetch(`${API_URL}/api/players/${player.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (playerResponse.ok) {
          const playerData = await playerResponse.json();
          onSectorChange(playerData.player);
        }
      } else {
        setError(data.error || 'Failed to attack alien planet');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Attack request timed out. Please try again.');
      } else {
        setError('Network error');
      }
    } finally {
      clearTimeout(timeoutId);
      setAttackingAlienPlanet(null);
    }
  };

  // Check for hostile fighters when sector loads
  useEffect(() => {
    if (sector && sector.hasHostileFighters && sector.deployedFighters) {
      const hostileFighters = sector.deployedFighters.filter(f => !f.isOwn);
      if (hostileFighters.length > 0) {
        setHostileEncounterData({
          fighters: hostileFighters,
          totalCount: sector.hostileFighterCount || 0
        });
        setShowHostileEncounter(true);
      }
    }
  }, [sector?.sectorNumber]);

  // Auto-continue navigation when we arrive at a sector
  useEffect(() => {
    if (autoNavigating && !moving && plottedPath && currentPathIndex > 0) {
      const currentPathSector = plottedPath.sectors[currentPathIndex - 1];
      const alienShipsInSector = sector?.alienShips?.length || 0;
      const hasAlienPointOfInterest =
        (currentPathSector?.hasAlienPlanet ?? false) ||
        (currentPathSector?.hasAlienShips ?? false) ||
        !!sector?.alienPlanet ||
        alienShipsInSector > 0;

      if (currentPathSector && (
        currentPathSector.hasPort ||
        currentPathSector.hasPlanet ||
        currentPathSector.hasStardock ||
        currentPathSector.hasShips ||
        currentPathSector.hasAlienPlanet ||
        currentPathSector.hasAlienShips
      ) || hasAlienPointOfInterest) {
        // Pause for points of interest (including alien activity)
        setIsPaused(true);
      } else if (currentPathIndex < plottedPath.path.length) {
        // Continue to next sector after a brief pause
        setIsPaused(false);
        const timer = setTimeout(() => {
          continueAutoNavigation();
        }, 1500);
        return () => clearTimeout(timer);
      } else {
        // Reached destination
        setAutoNavigating(false);
        setIsPaused(false);
      }
    }
  }, [currentSector, autoNavigating, moving, plottedPath, currentPathIndex, sector?.alienPlanet?.id, sector?.alienShips?.length]);

  if (loading) {
    return (
      <div className="cyberpunk-panel">
        <div className="panel-header">► SECTOR SCAN</div>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neon-cyan)' }}>
          ⟳ SCANNING SECTOR {currentSector}...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cyberpunk-panel">
        <div className="panel-header">► SECTOR SCAN</div>
        <div className="error-message" style={{ margin: '20px' }}>
          ✗ {error}
        </div>
        <button onClick={loadSectorDetails} className="cyberpunk-button" style={{ margin: '0 20px 20px' }}>
          ⟳ RETRY SCAN
        </button>
      </div>
    );
  }

  if (!sector) return null;

  // Check if player's corp owns a planet in this sector
  const currentPlayer = sector.players.find(p => p.id === currentPlayerId);
  const currentPlayerCorpName = currentPlayer?.corpName || '';
  const hasPlanetOwnership = sector.planets && sector.planets.some(planet => 
    planet.ownerName === currentPlayerCorpName
  );
  
  // Get player's fighter count (use local override if set, otherwise use player prop)
  const playerFighters = localFighterCount !== null 
    ? localFighterCount 
    : (player as any).shipFighters || (player as any).fighters || currentPlayer?.fighters || 0;
  
  // Calculate max limits based on planet ownership
  const maxFighters = hasPlanetOwnership ? 1500 : 500;
  const maxMines = hasPlanetOwnership ? 8 : 5;

  // Port ASCII art based on type
  const getPortArt = (portType: string) => {
    const portChars: { [key: string]: string } = {
      'BBS': '[$]', // Buys fuel, equipment, organics
      'BSB': '[¥]', // Buys fuel, organics, sells equipment
      'SBB': '[€]', // Sells fuel, buys equipment, organics
      'SSB': '[£]', // Sells fuel, equipment, buys organics
      'SBS': '[₿]', // Sells fuel, buys equipment, sells organics
      'BSS': '[₽]', // Buys fuel, sells equipment, organics
      'SSS': '[◊]', // Sells all
      'BBB': '[■]', // Buys all
    };
    return portChars[portType] || '[?]';
  };

  return (
    <div className={`cyberpunk-panel ${shaking ? 'shake' : ''}`}>
      <div className="panel-header">
        ► SECTOR {sector.sectorNumber} {sector.name ? `- ${sector.name.toUpperCase()}` : ''}
      </div>

      {/* TerraSpace Safe Zone Indicator */}
      {sector.region === 'TerraSpace' && (
        <div style={{
          margin: '20px 20px 0 20px',
          padding: '15px',
          background: 'rgba(0, 255, 0, 0.15)',
          border: '2px solid var(--neon-green)',
          color: 'var(--neon-green)',
          fontWeight: 'bold',
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)'
        }}>
          <div style={{ fontSize: '16px', marginBottom: '5px' }}>
            🛡️ TERRASPACE - SAFE ZONE 🛡️
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            Combat Disabled • Training Area • Sectors 1-10
          </div>
        </div>
      )}

      {/* Misfire Alert */}
      {misfireAlert && (
        <div style={{
          margin: '20px 20px 0 20px',
          padding: '15px',
          background: 'rgba(255, 0, 0, 0.2)',
          border: '2px solid var(--neon-pink)',
          color: 'var(--neon-pink)',
          fontWeight: 'bold',
          fontSize: '14px',
          textAlign: 'center',
          animation: 'pulse 0.5s ease-in-out infinite alternate',
          boxShadow: '0 0 20px rgba(255, 20, 147, 0.5)'
        }}>
          {misfireAlert}
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div style={{
          margin: '20px 20px 0 20px',
          padding: '15px',
          background: 'rgba(0, 255, 0, 0.2)',
          border: '2px solid var(--neon-green)',
          color: 'var(--neon-green)',
          fontWeight: 'bold',
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)',
          position: 'relative'
        }}>
          ✓ {successMessage}
          <button
            onClick={() => setSuccessMessage(null)}
            style={{
              position: 'absolute',
              top: '5px',
              right: '10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--neon-green)',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Beacon Attack Result */}
      {beaconAttackResult && (
        <div style={{
          margin: '20px 20px 0 20px',
          padding: '15px',
          background: 'rgba(255, 20, 147, 0.2)',
          border: '2px solid var(--neon-pink)',
          color: 'var(--neon-pink)',
          fontWeight: 'bold',
          fontSize: '14px',
          boxShadow: '0 0 20px rgba(255, 20, 147, 0.3)',
          position: 'relative'
        }}>
          <div style={{ marginBottom: '8px' }}>
            ⚔️ BEACON ATTACK RESULT
          </div>
          <div style={{ fontSize: '13px', marginBottom: '5px' }}>
            {beaconAttackResult.message}
          </div>
          {beaconAttackResult.fightersLost > 0 && (
            <div style={{ fontSize: '12px', opacity: 0.9 }}>
              Fighters Lost: {beaconAttackResult.fightersLost}
            </div>
          )}
          <button
            onClick={() => setBeaconAttackResult(null)}
            style={{
              position: 'absolute',
              top: '5px',
              right: '10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--neon-pink)',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Mine Explosion Result */}
      {mineExplosionResult && (
        <div style={{
          margin: '20px 20px 0 20px',
          padding: '15px',
          background: 'rgba(255, 100, 0, 0.2)',
          border: '2px solid #ff6b00',
          color: '#ff6b00',
          fontWeight: 'bold',
          fontSize: '14px',
          boxShadow: '0 0 20px rgba(255, 100, 0, 0.3)',
          position: 'relative'
        }}>
          <div style={{ marginBottom: '8px' }}>
            💥 MINE EXPLOSION
          </div>
          <div style={{ fontSize: '13px', marginBottom: '5px' }}>
            {mineExplosionResult.message}
          </div>
          {(mineExplosionResult.shieldsLost > 0 || mineExplosionResult.fightersLost > 0) && (
            <div style={{ fontSize: '12px', opacity: 0.9 }}>
              Damage: {mineExplosionResult.shieldsLost} shields, {mineExplosionResult.fightersLost} fighters
            </div>
          )}
          <button
            onClick={() => setMineExplosionResult(null)}
            style={{
              position: 'absolute',
              top: '5px',
              right: '10px',
              background: 'transparent',
              border: 'none',
              color: '#ff6b00',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Fighter Attack Result */}
      {fighterAttackResult && (
        <div style={{
          margin: '20px 20px 0 20px',
          padding: '15px',
          background: fighterAttackResult.attackerWon 
            ? 'rgba(0, 255, 0, 0.2)' 
            : 'rgba(255, 100, 0, 0.2)',
          border: `2px solid ${fighterAttackResult.attackerWon ? 'var(--neon-green)' : '#ff6b00'}`,
          color: fighterAttackResult.attackerWon ? 'var(--neon-green)' : '#ff6b00',
          fontWeight: 'bold',
          fontSize: '14px',
          boxShadow: fighterAttackResult.attackerWon 
            ? '0 0 20px rgba(0, 255, 0, 0.3)' 
            : '0 0 20px rgba(255, 100, 0, 0.3)',
          position: 'relative'
        }}>
          <div style={{ marginBottom: '8px' }}>
            {fighterAttackResult.attackerWon ? '✅ VICTORY!' : '⚠️ RETREAT'}
          </div>
          <div style={{ fontSize: '13px', marginBottom: '8px' }}>
            {fighterAttackResult.message}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            <div>Your Losses: {fighterAttackResult.losses.fighters} fighters, {fighterAttackResult.losses.shields} shields</div>
            <div>Enemy Losses: {fighterAttackResult.losses.defenderFighters} fighters</div>
          </div>
          <button
            onClick={() => setFighterAttackResult(null)}
            style={{
              position: 'absolute',
              top: '5px',
              right: '10px',
              background: 'transparent',
              border: 'none',
              color: fighterAttackResult.attackerWon ? 'var(--neon-green)' : '#ff6b00',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Alien Combat Result Modal */}
      {alienCombatResult && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a0033 0%, #0a001a 100%)',
            border: `3px solid ${alienCombatResult.combat.winner === 'player' ? '#00ff00' : alienCombatResult.combat.winner === 'alien' ? '#ff0066' : '#ff9900'}`,
            borderRadius: '10px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: `0 0 30px ${alienCombatResult.combat.winner === 'player' ? 'rgba(0, 255, 0, 0.5)' : alienCombatResult.combat.winner === 'alien' ? 'rgba(255, 0, 102, 0.5)' : 'rgba(255, 153, 0, 0.5)'}`
          }}>
            <div style={{
              textAlign: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '20px',
              color: alienCombatResult.combat.winner === 'player' ? '#00ff00' : alienCombatResult.combat.winner === 'alien' ? '#ff0066' : '#ff9900'
            }}>
              {alienCombatResult.combat.winner === 'player' && '🏆 VICTORY!'}
              {alienCombatResult.combat.winner === 'alien' && '💀 DEFEAT'}
              {alienCombatResult.combat.winner === 'draw' && '⚔️ STALEMATE'}
            </div>

            <div style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              {alienCombatResult.message}
            </div>

            <div style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid #9d00ff',
              padding: '15px',
              marginBottom: '20px'
            }}>
              <div style={{ color: '#00ffff', fontWeight: 'bold', marginBottom: '10px' }}>
                COMBAT STATISTICS
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                <div style={{ marginBottom: '5px' }}>
                  Rounds: {alienCombatResult.combat.rounds}
                </div>
                <div style={{ marginBottom: '5px', color: '#ff9900' }}>
                  Your Losses: ⚔️ {alienCombatResult.combat.playerFightersLost} fighters, 🛡️ {alienCombatResult.combat.playerShieldsLost} shields
                </div>
                <div style={{ marginBottom: '5px', color: '#9d00ff' }}>
                  Alien Losses: ⚔️ {alienCombatResult.combat.alienFightersLost} fighters, 🛡️ {alienCombatResult.combat.alienShieldsLost} shields
                </div>
                {alienCombatResult.combat.creditsLooted > 0 && (
                  <div style={{ marginTop: '10px', color: '#00ff00', fontWeight: 'bold' }}>
                    💰 Looted: ₡{alienCombatResult.combat.creditsLooted.toLocaleString()}
                  </div>
                )}
                {alienCombatResult.combat.playerEscapeSector && (
                  <div style={{ marginTop: '10px', color: '#ff0066' }}>
                    🚨 Escaped to Sector {alienCombatResult.combat.playerEscapeSector} in Escape Pod
                  </div>
                )}
              </div>
            </div>

            {/* Combat Log */}
            {alienCombatResult.combatLog && alienCombatResult.combatLog.length > 0 && (
              <div style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid #00ffff',
                padding: '15px',
                marginBottom: '20px',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                <div style={{ color: '#00ffff', fontWeight: 'bold', marginBottom: '10px' }}>
                  COMBAT LOG
                </div>
                {alienCombatResult.combatLog.map((log: any, index: number) => (
                  <div key={index} style={{
                    fontSize: '11px',
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                    paddingBottom: '8px',
                    borderBottom: index < alienCombatResult.combatLog.length - 1 ? '1px solid rgba(0, 255, 255, 0.2)' : 'none'
                  }}>
                    <div style={{ color: log.round === 0 ? '#ff9900' : '#00ffff', fontWeight: 'bold' }}>
                      {log.round === 0 ? '⚔️ INITIAL' : `Round ${log.round}`}
                    </div>
                    <div style={{ marginTop: '4px', opacity: 0.9 }}>
                      {log.description}
                    </div>
                    {log.round > 0 && (
                      <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.7 }}>
                        Player: ⚔️{log.playerFighters} 🛡️{log.playerShields} • Alien: ⚔️{log.alienFighters} 🛡️{log.alienShields}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setAlienCombatResult(null)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #ff0066 0%, #9d00ff 100%)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                borderRadius: '5px'
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '20px' }}>
        {/* ASCII Art Sector Visualization */}
        <div style={{
          background: 'rgba(0, 255, 255, 0.05)',
          border: '1px solid var(--neon-cyan)',
          padding: '20px',
          marginBottom: '20px',
          fontFamily: 'monospace',
          fontSize: '14px',
          lineHeight: '1.4'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '15px' }}>
            <div style={{ color: 'var(--neon-cyan)', fontSize: '12px', marginBottom: '5px' }}>
              ═══════════ SECTOR SCAN ═══════════
            </div>
            <div style={{ color: 'var(--neon-green)', fontSize: '20px', letterSpacing: '4px' }}>
              {sector.hasPort ? getPortArt(sector.portType!) : sector.hasPlanet ? '(◉)' : '[ ]'}
            </div>
            <div style={{ color: 'var(--neon-cyan)', fontSize: '12px', marginTop: '5px' }}>
              Sector {sector.sectorNumber}
            </div>
          </div>

          {/* Ship ASCII */}
          <div style={{ textAlign: 'center', margin: '15px 0', color: 'var(--neon-yellow)' }}>
            <div style={{ fontSize: '16px' }}>&gt;===&gt;</div>
            <div style={{ fontSize: '10px', marginTop: '3px' }}>YOUR SHIP</div>
          </div>

          {/* Warp connections visual */}
          {sector.warps.length > 0 && (
            <div style={{ marginTop: '15px', color: 'var(--neon-green)', fontSize: '12px' }}>
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                ─── WARP CONNECTIONS ───
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'center'
              }}>
                {sector.warps.map((warp, idx) => (
                  <div key={idx} style={{ color: 'var(--neon-cyan)' }}>
                    [{warp.destination}]
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Launch Beacon Button */}
            {beaconInfo && (
              <>
                {!showBeaconLaunch ? (
                  <button
                    onClick={() => {
                      if (sector.region === 'TerraSpace') {
                        setError('Beacons cannot be launched in TerraSpace (safe zone)');
                        return;
                      }
                      setShowBeaconLaunch(true);
                    }}
                    disabled={beaconInfo.current === 0 || sector.region === 'TerraSpace'}
                    className="cyberpunk-button"
                    style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      background: beaconInfo.current > 0 && sector.region !== 'TerraSpace' 
                        ? 'rgba(0, 200, 255, 0.2)' 
                        : 'rgba(100, 100, 100, 0.2)',
                      borderColor: beaconInfo.current > 0 && sector.region !== 'TerraSpace' 
                        ? 'var(--neon-cyan)' 
                        : '#666',
                      color: beaconInfo.current > 0 && sector.region !== 'TerraSpace' 
                        ? 'var(--neon-cyan)' 
                        : '#666',
                      cursor: beaconInfo.current > 0 && sector.region !== 'TerraSpace' ? 'pointer' : 'not-allowed'
                    }}
                  >
                    📡 LAUNCH BEACON ({beaconInfo.current}/{beaconInfo.max})
                  </button>
                ) : (
                  <div style={{
                    padding: '10px',
                    background: 'rgba(0, 200, 255, 0.1)',
                    border: '1px solid var(--neon-cyan)',
                    fontSize: '11px'
                  }}>
                    <div style={{ color: 'var(--neon-cyan)', marginBottom: '8px', fontWeight: 'bold' }}>
                      📡 BEACON MESSAGE
                    </div>
                    <textarea
                      value={beaconMessage}
                      onChange={(e) => setBeaconMessage(e.target.value.slice(0, 255))}
                      placeholder="Enter message (max 255 chars)..."
                      style={{
                        width: '100%',
                        minHeight: '60px',
                        padding: '8px',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid var(--neon-cyan)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        resize: 'vertical',
                        marginBottom: '6px'
                      }}
                    />
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '8px', textAlign: 'right' }}>
                      {beaconMessage.length}/255
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={launchBeacon}
                        disabled={launchingBeacon || !beaconMessage.trim()}
                        className="cyberpunk-button"
                        style={{
                          flex: 1,
                          padding: '6px',
                          fontSize: '10px',
                          background: 'rgba(0, 255, 0, 0.2)',
                          borderColor: 'var(--neon-green)',
                          color: 'var(--neon-green)'
                        }}
                      >
                        {launchingBeacon ? '⟳...' : 'LAUNCH'}
                      </button>
                      <button
                        onClick={() => {
                          setShowBeaconLaunch(false);
                          setBeaconMessage('');
                        }}
                        className="cyberpunk-button"
                        style={{
                          padding: '6px 12px',
                          fontSize: '10px',
                          background: 'rgba(255, 0, 0, 0.1)',
                          borderColor: 'var(--neon-pink)',
                          color: 'var(--neon-pink)'
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Scan Adjoining Sector Button */}
            {sector.warps.length > 0 && (
              <button
                onClick={() => setShowScanSector(true)}
                disabled={player.turnsRemaining < 1}
                className="cyberpunk-button"
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  background: player.turnsRemaining >= 1 
                    ? 'rgba(255, 200, 0, 0.2)' 
                    : 'rgba(100, 100, 100, 0.2)',
                  borderColor: player.turnsRemaining >= 1 
                    ? 'var(--neon-yellow)' 
                    : '#666',
                  color: player.turnsRemaining >= 1 
                    ? 'var(--neon-yellow)' 
                    : '#666',
                  cursor: player.turnsRemaining >= 1 ? 'pointer' : 'not-allowed'
                }}
              >
                🔍 SCAN ADJOINING SECTOR (1 turn)
              </button>
            )}

            {/* Deploy Fighters Button */}
            {sector.region !== 'TerraSpace' && playerFighters > 0 && (
              <>
                {!showDeployFighters ? (
                  <button
                    onClick={() => setShowDeployFighters(true)}
                    className="cyberpunk-button"
                    style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      background: 'rgba(255, 100, 0, 0.2)',
                      borderColor: '#ff6b00',
                      color: '#ff6b00',
                      cursor: 'pointer'
                    }}
                  >
                    ⚔ DEPLOY FIGHTERS ({playerFighters} on ship)
                  </button>
                ) : (
                  <div style={{
                    padding: '10px',
                    background: 'rgba(255, 100, 0, 0.1)',
                    border: '1px solid #ff6b00',
                    fontSize: '11px'
                  }}>
                    <div style={{ color: '#ff6b00', marginBottom: '8px', fontWeight: 'bold' }}>
                      ⚔ DEPLOY FIGHTERS
                    </div>
                    <input
                      type="number"
                      value={deployFighterCount === 0 ? '' : deployFighterCount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDeployFighterCount(val === '' ? 0 : Math.max(0, Math.min(parseInt(val) || 0, playerFighters, maxFighters)));
                      }}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      min="1"
                      max={Math.min(playerFighters, maxFighters)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid #ff6b00',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        marginBottom: '6px'
                      }}
                    />
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Max 500 per sector
                    </div>
                    {deployFighterCount > 0 && (
                      <div style={{
                        fontSize: '10px',
                        color: 'rgba(255, 200, 0, 0.8)',
                        marginBottom: '6px',
                        padding: '4px',
                        background: 'rgba(255, 200, 0, 0.1)',
                        border: '1px solid rgba(255, 200, 0, 0.3)',
                        borderRadius: '2px'
                      }}>
                        💰 Daily maintenance: ₡{deployFighterCount * 5}/day
                        {player.credits < deployFighterCount * 5 && (
                          <span style={{ color: 'var(--neon-pink)', marginLeft: '4px' }}>
                            ⚠️ Insufficient funds!
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={handleDeployFighters}
                        disabled={deployingFighters || deployFighterCount <= 0}
                        className="cyberpunk-button"
                        style={{
                          flex: 1,
                          padding: '6px',
                          fontSize: '10px',
                          background: 'rgba(0, 255, 0, 0.2)',
                          borderColor: 'var(--neon-green)',
                          color: 'var(--neon-green)'
                        }}
                      >
                        {deployingFighters ? '⟳...' : 'DEPLOY'}
                      </button>
                      <button
                        onClick={() => {
                          setShowDeployFighters(false);
                          setDeployFighterCount(0);
                        }}
                        className="cyberpunk-button"
                        style={{
                          padding: '6px 12px',
                          fontSize: '10px',
                          background: 'rgba(255, 0, 0, 0.1)',
                          borderColor: 'var(--neon-pink)',
                          color: 'var(--neon-pink)'
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sector Details */}
        <div style={{ marginBottom: '20px' }}>
          {/* StarDock */}
          {sector.portType === 'STARDOCK' && (
            <div style={{
              padding: '15px',
              background: 'rgba(0, 255, 255, 0.05)',
              border: '1px solid var(--neon-cyan)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', marginBottom: '8px' }}>
                🚀 STARDOCK DETECTED
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                <div>Purchase ships, fighters, and shields</div>
                <div style={{ marginTop: '5px', fontSize: '12px', opacity: 0.7 }}>
                  Upgrade your vessel • Arm your defenses
                </div>
              </div>
              <button
                onClick={() => setShowStarDock(true)}
                className="cyberpunk-button"
                style={{
                  marginTop: '12px',
                  width: '100%',
                  background: 'rgba(0, 255, 255, 0.2)',
                  borderColor: 'var(--neon-cyan)',
                  color: 'var(--neon-cyan)',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                🚀 DOCK AT STARDOCK
              </button>
            </div>
          )}

          {/* Regular Trading Port */}
          {sector.hasPort && sector.portType !== 'STARDOCK' && (
            <div style={{
              padding: '15px',
              background: 'rgba(0, 255, 0, 0.05)',
              border: '1px solid var(--neon-green)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-green)', fontWeight: 'bold', marginBottom: '8px' }}>
                ► TRADING PORT DETECTED
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                <div>Type: {sector.portType}</div>
                <div>Class: {sector.portClass}</div>
                <div style={{ marginTop: '5px', fontSize: '12px', opacity: 0.7 }}>
                  B=Buys, S=Sells • Order: Fuel, Organics, Equipment
                </div>
              </div>
              <button
                onClick={() => setShowTrading(true)}
                className="cyberpunk-button"
                style={{
                  marginTop: '12px',
                  width: '100%',
                  background: 'rgba(0, 255, 0, 0.2)',
                  borderColor: 'var(--neon-green)',
                  color: 'var(--neon-green)',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                ► DOCK AT PORT
              </button>
            </div>
          )}

          {sector.planets && sector.planets.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(138, 43, 226, 0.05)',
              border: '1px solid var(--neon-purple)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-purple)', fontWeight: 'bold', marginBottom: '10px' }}>
                ► PLANETS IN SECTOR ({sector.planets.length})
              </div>
              {sector.planets.map(planet => (
                <div key={planet.id} style={{
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  marginBottom: '8px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(138, 43, 226, 0.3)'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                  }}>
                    <div>
                      <div style={{ color: 'var(--neon-purple)', fontWeight: 'bold' }}>
                        🌍 {planet.name}
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '3px' }}>
                        {planet.ownerName ? `Owner: ${planet.ownerName}` : '✨ Unclaimed - Claim it!'}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPlanetPanel(planet.id)}
                      className="cyberpunk-button"
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        background: 'rgba(138, 43, 226, 0.2)',
                        borderColor: 'var(--neon-purple)',
                        color: 'var(--neon-purple)'
                      }}
                    >
                      🚀 LAND
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sector.hasBeacon && (
            <div style={{
              padding: '10px',
              background: 'rgba(255, 255, 0, 0.05)',
              border: '1px solid var(--neon-yellow)',
              marginBottom: '15px',
              color: 'var(--neon-yellow)',
              fontSize: '13px'
            }}>
              ► Navigation Beacon Active
            </div>
          )}

          {sector.fightersCount > 0 && (
            <div style={{
              padding: '10px',
              background: 'rgba(255, 20, 147, 0.05)',
              border: '1px solid var(--neon-pink)',
              marginBottom: '15px',
              color: 'var(--neon-pink)',
              fontSize: '13px'
            }}>
              ⚠ {sector.fightersCount} Deployed Fighters
            </div>
          )}

          {sector.minesCount > 0 && (
            <div style={{
              padding: '10px',
              background: 'rgba(255, 20, 147, 0.05)',
              border: '1px solid var(--neon-pink)',
              marginBottom: '15px',
              color: 'var(--neon-pink)',
              fontSize: '13px'
            }}>
              ⚠ {sector.minesCount} Space Mines
            </div>
          )}

          {/* Floating Cargo */}
          {sector.floatingCargo && sector.floatingCargo.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(255, 215, 0, 0.05)',
              border: '1px solid var(--neon-yellow)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold', marginBottom: '10px' }}>
                📦 FLOATING CARGO DETECTED ({sector.floatingCargo.length})
              </div>
              {sector.floatingCargo.map(cargo => {
                const totalCargo = cargo.fuel + cargo.organics + cargo.equipment + cargo.colonists;
                return (
                  <div key={cargo.id} style={{
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    marginBottom: '8px',
                    border: '1px solid rgba(255, 215, 0, 0.3)'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '8px'
                    }}>
                      <div style={{ color: 'var(--neon-yellow)', fontSize: '13px' }}>
                        {cargo.source === 'combat' ? '💥 Combat Wreckage' : 
                         cargo.source === 'jettison' ? '🚮 Jettisoned Cargo' : '📦 Cargo'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {totalCargo} units total
                      </div>
                    </div>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(4, 1fr)', 
                      gap: '8px',
                      fontSize: '12px',
                      marginBottom: '10px'
                    }}>
                      {cargo.fuel > 0 && (
                        <div style={{ color: '#ff9800' }}>⛽ {cargo.fuel}</div>
                      )}
                      {cargo.organics > 0 && (
                        <div style={{ color: '#4caf50' }}>🌿 {cargo.organics}</div>
                      )}
                      {cargo.equipment > 0 && (
                        <div style={{ color: '#2196f3' }}>⚙️ {cargo.equipment}</div>
                      )}
                      {cargo.colonists > 0 && (
                        <div style={{ color: '#9c27b0' }}>👥 {cargo.colonists}</div>
                      )}
                    </div>
                    <button
                      onClick={() => pickupFloatingCargo(cargo.id)}
                      disabled={pickingUpCargo === cargo.id}
                      className="cyberpunk-button"
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '12px',
                        background: 'rgba(255, 215, 0, 0.2)',
                        borderColor: 'var(--neon-yellow)',
                        color: 'var(--neon-yellow)'
                      }}
                    >
                      {pickingUpCargo === cargo.id ? '⟳ PICKING UP...' : '► PICK UP CARGO'}
                    </button>
                  </div>
                );
              })}
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--text-secondary)', 
                marginTop: '8px',
                textAlign: 'center'
              }}>
                Cargo will expire in 24 hours • Limited by your cargo hold capacity
              </div>
            </div>
          )}

          {/* Beacons */}
          {sector.beacons && sector.beacons.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(0, 200, 255, 0.05)',
              border: '1px solid var(--neon-cyan)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', marginBottom: '10px' }}>
                📡 BEACONS DETECTED ({sector.beacons.length})
              </div>
              {sector.beacons.map(beacon => (
                <div key={beacon.id} style={{
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  marginBottom: '10px',
                  border: beacon.ownerId === currentPlayerId 
                    ? '1px solid var(--neon-green)' 
                    : '1px solid rgba(0, 200, 255, 0.3)'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                    <div style={{ 
                      color: beacon.ownerId === currentPlayerId ? 'var(--neon-green)' : 'var(--neon-cyan)', 
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      📡 {beacon.ownerName}'s Beacon
                      {beacon.ownerId === currentPlayerId && ' (YOURS)'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {beacon.ownerId === currentPlayerId ? (
                        <button
                          onClick={() => handleRetrieveBeacon(beacon.id)}
                          className="cyberpunk-button"
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: 'rgba(0, 255, 0, 0.2)',
                            borderColor: 'var(--neon-green)',
                            color: 'var(--neon-green)'
                          }}
                        >
                          RETRIEVE
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAttackBeacon(beacon.id)}
                          disabled={attackingBeacon === beacon.id}
                          className="cyberpunk-button"
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: 'rgba(255, 20, 147, 0.2)',
                            borderColor: 'var(--neon-pink)',
                            color: 'var(--neon-pink)'
                          }}
                        >
                          {attackingBeacon === beacon.id ? '...' : '⚔ ATTACK'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(0, 200, 255, 0.1)',
                    padding: '10px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    fontStyle: 'italic',
                    borderLeft: '3px solid var(--neon-cyan)'
                  }}>
                    "{beacon.message}"
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Deployed Fighters Section */}
          {sector.deployedFighters && sector.deployedFighters.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(255, 100, 0, 0.05)',
              border: '1px solid #ff6b00',
              marginBottom: '15px'
            }}>
              <div style={{ color: '#ff6b00', fontWeight: 'bold', marginBottom: '10px' }}>
                ⚔ STATIONED FIGHTERS ({sector.deployedFighters.reduce((sum, f) => sum + f.fighterCount, 0)} total)
              </div>
              <div style={{
                fontSize: '10px',
                color: 'rgba(255, 200, 0, 0.8)',
                padding: '6px',
                background: 'rgba(255, 200, 0, 0.1)',
                border: '1px solid rgba(255, 200, 0, 0.3)',
                marginBottom: '10px',
                borderRadius: '4px'
              }}>
                💰 Maintenance: ₡5 per fighter per day. Insufficient funds = fighters destroyed!
              </div>
              {sector.deployedFighters.map(deployment => (
                <div key={deployment.id} style={{
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  marginBottom: '10px',
                  border: deployment.isOwn 
                    ? '1px solid var(--neon-green)' 
                    : '1px solid rgba(255, 100, 0, 0.5)'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ 
                        color: deployment.isOwn ? 'var(--neon-green)' : '#ff6b00', 
                        fontWeight: 'bold',
                        fontSize: '13px'
                      }}>
                        ⚔ {deployment.ownerName}'s Fighters
                        {deployment.isOwn && <span style={{ color: 'var(--neon-green)', marginLeft: '8px' }}>(YOURS)</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {deployment.fighterCount} fighters stationed
                      </div>
                      {deployment.isOwn && (
                        <div style={{ fontSize: '10px', color: 'rgba(255, 200, 0, 0.7)', marginTop: '4px' }}>
                          💰 Daily cost: ₡{deployment.fighterCount * 5}/day
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {deployment.isOwn ? (
                        showRetrieveFighters === deployment.id ? (
                          <div style={{
                            padding: '8px',
                            background: 'rgba(0, 255, 0, 0.1)',
                            border: '1px solid var(--neon-green)',
                            fontSize: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            minWidth: '150px'
                          }}>
                            <div style={{ color: 'var(--neon-green)', fontWeight: 'bold', fontSize: '11px' }}>
                              ⬆ RETRIEVE FIGHTERS
                            </div>
                            <input
                              type="number"
                              value={retrieveFighterCount === 0 ? '' : retrieveFighterCount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRetrieveFighterCount(val === '' ? 0 : Math.max(0, Math.min(parseInt(val) || 0, deployment.fighterCount)));
                              }}
                              onFocus={(e) => e.target.select()}
                              placeholder="0"
                              min="1"
                              max={deployment.fighterCount}
                              style={{
                                width: '100%',
                                padding: '4px',
                                background: 'rgba(0, 0, 0, 0.5)',
                                border: '1px solid var(--neon-green)',
                                color: 'var(--text-primary)',
                                fontSize: '10px',
                                marginBottom: '4px'
                              }}
                            />
                            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              Max {deployment.fighterCount} available
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => handleRetrieveFighters(retrieveFighterCount)}
                                disabled={retrievingFighters || retrieveFighterCount <= 0}
                                className="cyberpunk-button"
                                style={{
                                  flex: 1,
                                  padding: '4px',
                                  fontSize: '9px',
                                  background: retrieveFighterCount > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                                  borderColor: retrieveFighterCount > 0 ? 'var(--neon-green)' : '#666',
                                  color: retrieveFighterCount > 0 ? 'var(--neon-green)' : '#666',
                                  cursor: retrieveFighterCount > 0 ? 'pointer' : 'not-allowed'
                                }}
                              >
                                {retrievingFighters ? '⟳...' : 'RETRIEVE'}
                              </button>
                              <button
                                onClick={() => {
                                  setShowRetrieveFighters(null);
                                  setRetrieveFighterCount(0);
                                }}
                                className="cyberpunk-button"
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '9px',
                                  background: 'rgba(255, 0, 0, 0.1)',
                                  borderColor: 'var(--neon-pink)',
                                  color: 'var(--neon-pink)'
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setShowRetrieveFighters(deployment.id);
                              setRetrieveFighterCount(0);
                            }}
                            className="cyberpunk-button"
                            style={{
                              padding: '6px 12px',
                              fontSize: '11px',
                              background: 'rgba(0, 255, 0, 0.2)',
                              borderColor: 'var(--neon-green)',
                              color: 'var(--neon-green)'
                            }}
                          >
                            RETRIEVE
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handleAttackDeployedFighters(deployment.id)}
                          disabled={attackingDeployment === deployment.id}
                          className="cyberpunk-button"
                          style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            background: 'rgba(255, 20, 147, 0.2)',
                            borderColor: 'var(--neon-pink)',
                            color: 'var(--neon-pink)'
                          }}
                        >
                          {attackingDeployment === deployment.id ? '⟳ ...' : '⚔ ATTACK'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Deploy Mines Button */}
          {sector.region !== 'TerraSpace' && (player as any).shipMines > 0 && (
            <div style={{ marginBottom: '15px' }}>
              {!showDeployMines ? (
                <button
                  onClick={() => setShowDeployMines(true)}
                  className="cyberpunk-button"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(255, 100, 0, 0.1)',
                    borderColor: '#ff6b00',
                    color: '#ff6b00'
                  }}
                >
                  💣 DEPLOY MINES ({(player as any).shipMines} on ship, max {maxMines} per sector{hasPlanetOwnership ? ' (planet bonus)' : ''})
                </button>
              ) : (
                <div style={{
                  padding: '15px',
                  background: 'rgba(255, 100, 0, 0.05)',
                  border: '1px solid #ff6b00'
                }}>
                  <div style={{ color: '#ff6b00', marginBottom: '10px', fontWeight: 'bold' }}>
                    💣 DEPLOY MINES
                  </div>
                  <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Deploy mines that explode when non-corp members enter. Max {maxMines} per sector total{hasPlanetOwnership ? ' (planet bonus)' : ''}.
                  </div>
                  <input
                    type="number"
                    value={deployMineCount === 0 ? '' : deployMineCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      const maxMinesAllowed = Math.min((player as any).shipMines, maxMines - (sector.minesCount || 0));
                      setDeployMineCount(val === '' ? 0 : Math.max(0, Math.min(parseInt(val) || 0, maxMinesAllowed)));
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    min="1"
                    max={Math.min((player as any).shipMines, maxMines - (sector.minesCount || 0))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid #ff6b00',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      marginBottom: '10px'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleDeployMines}
                      disabled={deployingMines || deployMineCount <= 0}
                      className="cyberpunk-button"
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: deployMineCount > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                        borderColor: deployMineCount > 0 ? 'var(--neon-green)' : '#666',
                        color: deployMineCount > 0 ? 'var(--neon-green)' : '#666',
                        cursor: deployMineCount > 0 ? 'pointer' : 'not-allowed'
                      }}
                    >
                      DEPLOY
                    </button>
                    <button
                      onClick={() => {
                        setShowDeployMines(false);
                        setDeployMineCount(0);
                      }}
                      className="cyberpunk-button"
                      style={{
                        padding: '10px 15px',
                        background: 'rgba(255, 0, 0, 0.2)',
                        borderColor: 'var(--neon-pink)',
                        color: 'var(--neon-pink)'
                      }}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {sector.players.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(255, 20, 147, 0.05)',
              border: '1px solid var(--neon-pink)',
              marginBottom: '15px'
            }}>
              <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', marginBottom: '10px' }}>
                ► SHIPS IN SECTOR ({sector.players.length})
              </div>
              {sector.players.map(p => (
                <div key={p.id} style={{
                  padding: '10px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  marginBottom: '8px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ color: 'var(--neon-cyan)' }}>
                      {p.corpName}{p.id === currentPlayerId && <span style={{ color: 'var(--neon-green)', marginLeft: '8px' }}>(YOU)</span>}
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>
                      {p.shipType.toUpperCase()} • Pilot: {p.username} • ⚔{p.fighters}
                    </div>
                  </div>
                  {p.id !== currentPlayerId && (
                    <button
                      onClick={() => setCombatTarget({
                        id: p.id,
                        corpName: p.corpName,
                        username: p.username,
                        shipType: p.shipType,
                        fighters: p.fighters,
                        shields: p.shields,
                        alignment: p.alignment,
                        inSafeZone: sector.region === 'TerraSpace'
                      })}
                      className="cyberpunk-button"
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        background: sector.region === 'TerraSpace' 
                          ? 'rgba(100, 100, 100, 0.2)' 
                          : 'rgba(255, 20, 147, 0.2)',
                        borderColor: sector.region === 'TerraSpace' 
                          ? 'gray' 
                          : 'var(--neon-pink)',
                        color: sector.region === 'TerraSpace' 
                          ? 'gray' 
                          : 'var(--neon-pink)'
                      }}
                      title={sector.region === 'TerraSpace' ? 'Combat disabled in TerraSpace' : 'Attack this ship'}
                    >
                      ⚔ ATTACK
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Alien Ships */}
          {sector.alienShips && sector.alienShips.length > 0 && (
            <div style={{
              padding: '15px',
              background: 'rgba(157, 0, 255, 0.05)',
              border: '1px solid #9d00ff',
              marginBottom: '15px'
            }}>
              <div style={{ color: '#9d00ff', fontWeight: 'bold', marginBottom: '10px' }}>
                👽 ALIEN SHIPS ({sector.alienShips.length})
              </div>
              {sector.alienShips.map(alien => (
                <div key={alien.id} style={{
                  padding: '10px',
                  background: 'rgba(157, 0, 255, 0.1)',
                  marginBottom: '8px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(157, 0, 255, 0.3)'
                }}>
                  <div style={{ color: '#9d00ff', fontWeight: 'bold' }}>
                    {alien.shipName}
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>
                    Race: {alien.alienRace} • Ship: {alien.shipType} • Behavior: {alien.behavior.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px', color: '#ff9900' }}>
                    ⚔ {alien.fighters} Fighters • 🛡️ {alien.shields} Shields
                  </div>
                  {sector.region !== 'TerraSpace' && (
                    <button
                      onClick={() => handleAttackAlienShip(alien.id)}
                      disabled={attackingAlienShip === alien.id || player.turnsRemaining < 1}
                      style={{
                        marginTop: '8px',
                        padding: '6px 12px',
                        background: attackingAlienShip === alien.id ? '#666' : 'linear-gradient(135deg, #ff0066 0%, #9d00ff 100%)',
                        color: 'white',
                        border: 'none',
                        cursor: attackingAlienShip === alien.id || player.turnsRemaining < 1 ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        opacity: attackingAlienShip === alien.id || player.turnsRemaining < 1 ? 0.5 : 1
                      }}
                    >
                      {attackingAlienShip === alien.id ? 'ATTACKING...' : '⚔️ ATTACK'}
                    </button>
                  )}
                  {sector.region === 'TerraSpace' && (
                    <div style={{
                      marginTop: '8px',
                      fontSize: '11px',
                      color: '#00ffff',
                      fontStyle: 'italic'
                    }}>
                      🛡️ Protected by TerraSpace security
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Alien Planet */}
          {sector.alienPlanet && (
            <div style={{
              padding: '15px',
              background: 'rgba(157, 0, 255, 0.1)',
              border: '2px solid #9d00ff',
              marginBottom: '15px'
            }}>
              <div style={{ color: '#9d00ff', fontWeight: 'bold', marginBottom: '10px' }}>
                🛸 ALIEN PLANET DETECTED
              </div>
              <div style={{
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(157, 0, 255, 0.5)'
              }}>
                <div style={{ color: '#ff0099', fontWeight: 'bold', fontSize: '14px' }}>
                  {sector.alienPlanet.name}
                </div>
                <div style={{ fontSize: '12px', marginTop: '6px', color: '#00ffff' }}>
                  Race: {sector.alienPlanet.alienRace}
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px', color: '#ff9900' }}>
                  🏰 Citadel Level {sector.alienPlanet.citadelLevel} • ⚔ {sector.alienPlanet.fighters.toLocaleString()} Fighters
                </div>
                <div style={{
                  marginTop: '10px',
                  padding: '8px',
                  background: 'rgba(0, 255, 255, 0.1)',
                  border: '1px solid #00ffff',
                  fontSize: '11px',
                  color: '#00ffff'
                }}>
                  📡 ALIEN COMMUNICATIONS UNLOCKED! Check the ALIEN COMMS channel to monitor their network.
                </div>
                {sector.region !== 'TerraSpace' && (
                  <button
                    onClick={() => handleAttackAlienPlanet(sector.alienPlanet!.id)}
                    disabled={attackingAlienPlanet === sector.alienPlanet!.id || player.turnsRemaining < 1}
                    style={{
                      marginTop: '12px',
                      padding: '8px 16px',
                      background: attackingAlienPlanet === sector.alienPlanet!.id ? '#666' : 'linear-gradient(135deg, #ff0066 0%, #9d00ff 100%)',
                      color: 'white',
                      border: 'none',
                      cursor: attackingAlienPlanet === sector.alienPlanet!.id || player.turnsRemaining < 1 ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      width: '100%',
                      opacity: attackingAlienPlanet === sector.alienPlanet!.id || player.turnsRemaining < 1 ? 0.5 : 1
                    }}
                  >
                    {attackingAlienPlanet === sector.alienPlanet!.id ? 'ATTACKING PLANET...' : '🔥 ATTACK ALIEN COLONY'}
                  </button>
                )}
                {sector.region === 'TerraSpace' && (
                  <div style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    color: '#00ffff',
                    fontStyle: 'italic',
                    textAlign: 'center'
                  }}>
                    🛡️ Protected by TerraSpace security
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Plot Course Section */}
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          background: 'rgba(0, 255, 255, 0.05)',
          border: '1px solid var(--neon-cyan)'
        }}>
          <div style={{
            color: 'var(--neon-cyan)',
            fontSize: '14px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '12px'
          }}>
            {plottedPath && autoNavigating ? '► AUTO-NAVIGATION' : '► Plot Course'}
          </div>

          {/* Show input only when not actively auto-navigating */}
          {(!plottedPath || !autoNavigating) && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="number"
                  value={destinationSector}
                  onChange={(e) => setDestinationSector(e.target.value)}
                  placeholder="Destination sector..."
                  disabled={plotting}
                  className="cyberpunk-input"
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--neon-cyan)',
                    color: 'var(--text-primary)',
                    fontSize: '14px'
                  }}
                />
                <button
                  onClick={plotCourse}
                  disabled={plotting || !destinationSector}
                  className="cyberpunk-button"
                  style={{
                    background: 'rgba(0, 255, 255, 0.2)',
                    borderColor: 'var(--neon-cyan)',
                    color: 'var(--neon-cyan)',
                    padding: '10px 20px',
                    minWidth: '120px'
                  }}
                >
                  {plotting ? '⟳ PLOTTING...' : '► PLOT'}
                </button>
              </div>

              {plotError && (
                <div style={{
                  padding: '10px',
                  background: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid var(--neon-pink)',
                  color: 'var(--neon-pink)',
                  fontSize: '13px',
                  marginBottom: '10px'
                }}>
                  ✗ {plotError}
                </div>
              )}
            </>
          )}

          {plottedPath && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '15px',
              border: '1px solid var(--neon-cyan)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '12px',
                fontSize: '13px'
              }}>
                <div style={{ color: 'var(--neon-green)' }}>
                  Distance: {plottedPath.distance} jumps
                </div>
                <div style={{ color: 'var(--neon-yellow)' }}>
                  Turns Required: {plottedPath.distance}
                </div>
                <div style={{ color: player.turnsRemaining >= plottedPath.distance ? 'var(--neon-green)' : 'var(--neon-pink)' }}>
                  Remaining: {player.turnsRemaining - plottedPath.distance}
                </div>
              </div>

              <div style={{
                color: 'var(--neon-cyan)',
                fontSize: '12px',
                marginBottom: '8px',
                textTransform: 'uppercase'
              }}>
                Route:
              </div>

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginBottom: '12px'
              }}>
                {plottedPath.path.map((sectorNum, idx) => {
                  const sectorInfo = plottedPath.sectors[idx];
                  const isVisited = sectorInfo?.visited;
                  const isCurrent = sectorNum === currentSector;

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        background: isCurrent
                          ? 'rgba(0, 255, 0, 0.3)'
                          : isVisited
                          ? 'rgba(0, 100, 100, 0.3)'
                          : 'rgba(0, 0, 0, 0.5)',
                        border: `1px solid ${
                          isCurrent
                            ? 'var(--neon-green)'
                            : isVisited
                            ? 'rgba(0, 150, 150, 0.8)'
                            : 'rgba(100, 100, 100, 0.5)'
                        }`,
                        color: isCurrent
                          ? 'var(--neon-green)'
                          : isVisited
                          ? 'rgba(0, 255, 255, 0.7)'
                          : 'rgba(150, 150, 150, 0.9)',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isCurrent && '►'} {sectorNum}
                    </div>
                  );
                })}
              </div>

              {player.turnsRemaining < plottedPath.distance && (
                <div style={{
                  padding: '10px',
                  background: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid var(--neon-pink)',
                  color: 'var(--neon-pink)',
                  fontSize: '12px',
                  marginBottom: '12px'
                }}>
                  ⚠ Insufficient turns for complete journey
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                {!autoNavigating || isPaused ? (
                  <>
                    <button
                      onClick={isPaused ? continueAutoNavigation : startAutoNavigation}
                      disabled={player.turnsRemaining < 1 || moving}
                      className="cyberpunk-button"
                      style={{
                        flex: 1,
                        background: 'rgba(0, 255, 0, 0.2)',
                        borderColor: 'var(--neon-green)',
                        color: 'var(--neon-green)',
                        padding: '10px'
                      }}
                    >
                      {isPaused ? '► CONTINUE' : '► BEGIN AUTO-NAV'}
                    </button>
                    {!autoNavigating && (
                      <button
                        onClick={clearPlottedPath}
                        className="cyberpunk-button"
                        style={{
                          background: 'rgba(255, 0, 0, 0.1)',
                          borderColor: 'var(--neon-pink)',
                          color: 'var(--neon-pink)',
                          padding: '10px'
                        }}
                      >
                        ✗ CLEAR
                      </button>
                    )}
                    {isPaused && (
                      <button
                        onClick={stopAutoNavigation}
                        className="cyberpunk-button"
                        style={{
                          flex: 1,
                          background: 'rgba(255, 255, 0, 0.1)',
                          borderColor: 'var(--neon-yellow)',
                          color: 'var(--neon-yellow)',
                          padding: '10px'
                        }}
                      >
                        ■ STOP
                      </button>
                    )}
                  </>
                ) : null}
              </div>

              {autoNavigating && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  background: isPaused
                    ? 'rgba(255, 255, 0, 0.1)'
                    : 'rgba(0, 255, 0, 0.1)',
                  border: isPaused
                    ? '1px solid var(--neon-yellow)'
                    : '1px solid var(--neon-green)',
                  color: isPaused
                    ? 'var(--neon-yellow)'
                    : 'var(--neon-green)',
                  fontSize: '12px',
                  textAlign: 'center'
                }}>
                  {moving ? '⟳ WARPING...' : isPaused
                    ? '● POINT OF INTEREST DETECTED - AUTO-NAV PAUSED'
                    : '► AUTO-NAV ACTIVE'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Movement Options */}
        {sector.warps.length > 0 && (
          <div>
            <div style={{
              color: 'var(--neon-green)',
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '10px'
            }}>
              ► Available Warps
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '10px'
            }}>
              {(() => {
                // Sort warps: previous sector first, then the rest
                const sortedWarps = [...sector.warps].sort((a, b) => {
                  if (a.destination === previousSector) return -1;
                  if (b.destination === previousSector) return 1;
                  return 0;
                });

                return sortedWarps.map((warp, idx) => {
                  const isVisited = visitedSectors.has(warp.destination);
                  const isPrevious = warp.destination === previousSector;

                  return (
                    <button
                      key={idx}
                      onClick={() => moveToSector(warp.destination)}
                      disabled={moving}
                      className="cyberpunk-button"
                      style={{
                        background: 'rgba(0, 255, 0, 0.1)',
                        borderColor: isVisited ? 'rgba(0, 100, 0, 0.9)' : 'var(--neon-green)',
                        borderWidth: '1px',
                        color: 'var(--neon-green)',
                        padding: '12px'
                      }}
                    >
                      {moving ? '⟳' : isPrevious ? '◄' : '►'} SECTOR {warp.destination}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {moving && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid var(--neon-cyan)',
            textAlign: 'center',
            color: 'var(--neon-cyan)'
          }}>
            ⟳ ENGAGING WARP DRIVE...
          </div>
        )}
      </div>

      {/* Port Trading Panel */}
      {showTrading && sector?.hasPort && (
        <PortTradingPanel
          sectorNumber={currentSector}
          token={token}
          player={{
            credits: player.credits,
            cargoFuel: player.cargoFuel,
            cargoOrganics: player.cargoOrganics,
            cargoEquipment: player.cargoEquipment,
            turnsRemaining: player.turnsRemaining,
            shipHoldsMax: player.shipHoldsMax,
          }}
          onTradeComplete={async (_updatedPlayer) => {
            // Fetch the full updated player data from server
            try {
              const response = await fetch(`${API_URL}/api/players/${player.id}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                const data = await response.json();
                onSectorChange(data.player);
              }
            } catch (err) {
              console.error('Failed to refresh player data:', err);
            }
          }}
          onClose={() => setShowTrading(false)}
        />
      )}

      {/* Planet Management Panel */}
      {showPlanetPanel && (
        <PlanetManagementPanel
          planetId={showPlanetPanel}
          player={{
            id: player.id,
            credits: player.credits,
            turnsRemaining: player.turnsRemaining,
            fuel: player.cargoFuel,
            organics: player.cargoOrganics,
            equipment: player.cargoEquipment,
            colonists: player.colonists || 0,
            ship_holds_max: player.shipHoldsMax,
            fighters: (player as any).fighters || 0,
            ship_fighters_max: (player as any).shipFightersMax || 0,
          }}
          token={token}
          onClose={() => {
            setShowPlanetPanel(null);
            // Reload sector details to get updated planet ownership
            loadSectorDetails();
          }}
          onPlayerUpdate={(updatedPlayer) => {
            onSectorChange(updatedPlayer);
          }}
        />
      )}

      {/* StarDock Panel */}
      {showStarDock && sector && (
        <StarDockPanel
          sectorNumber={sector.sectorNumber}
          token={token}
          onClose={() => setShowStarDock(false)}
          onPurchase={async () => {
            // Fetch the full updated player data from server after purchase
            try {
              const response = await fetch(`${API_URL}/api/players/${player.id}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                const data = await response.json();
                onSectorChange(data.player);
              }
            } catch (err) {
              console.error('Failed to refresh player data:', err);
            }
          }}
        />
      )}

      {/* Combat Panel */}
      {combatTarget && (
        <CombatPanel
          target={combatTarget}
          token={token}
          currentPlayerId={currentPlayerId}
          onClose={() => {
            setCombatTarget(null);
            loadSectorDetails(); // Refresh sector to see if target was destroyed
          }}
          onCombatComplete={(updatedPlayer) => {
            onSectorChange(updatedPlayer);
          }}
        />
      )}

      {/* Scan Sector Modal */}
      {showScanSector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-primary)',
            border: '2px solid var(--neon-yellow)',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 0 40px rgba(255, 200, 0, 0.5)'
          }}>
            <div style={{
              color: 'var(--neon-yellow)',
              fontSize: '20px',
              fontWeight: 'bold',
              marginBottom: '20px',
              textAlign: 'center',
              textShadow: '0 0 10px var(--neon-yellow)'
            }}>
              🔍 SCAN ADJOINING SECTOR
            </div>

            {!scannedSector ? (
              <>
                <div style={{ color: 'var(--text-primary)', marginBottom: '15px' }}>
                  Select a sector to scan (costs 1 turn):
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gap: '10px',
                  marginBottom: '20px'
                }}>
                  {sector?.warps.map(warp => (
                    <button
                      key={warp.destination}
                      onClick={() => scanAdjoiningSector(warp.destination)}
                      disabled={scanningSector || player.turnsRemaining < 1}
                      className="cyberpunk-button"
                      style={{
                        padding: '12px',
                        background: 'rgba(255, 200, 0, 0.2)',
                        borderColor: 'var(--neon-yellow)',
                        color: 'var(--neon-yellow)'
                      }}
                    >
                      {scanningSector ? '⟳...' : `Sector ${warp.destination}`}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{
                  background: 'rgba(255, 200, 0, 0.1)',
                  padding: '15px',
                  marginBottom: '15px',
                  border: '1px solid rgba(255, 200, 0, 0.3)'
                }}>
                  <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold', marginBottom: '10px', fontSize: '18px' }}>
                    Sector {scannedSector.sectorNumber} - Deep Scan Results
                  </div>
                  {scannedSector.name && (
                    <div style={{ color: 'var(--text-primary)', marginBottom: '5px', fontWeight: 'bold' }}>
                      Name: {scannedSector.name}
                    </div>
                  )}
                  {scannedSector.region && (
                    <div style={{ color: 'var(--text-primary)', marginBottom: '5px' }}>
                      Region: {scannedSector.region}
                    </div>
                  )}
                </div>

                {/* Port Information */}
                {scannedSector.portInfo && (
                  <div style={{
                    padding: '15px',
                    background: scannedSector.portInfo.type === 'STARDOCK' 
                      ? 'rgba(0, 255, 255, 0.1)' 
                      : 'rgba(0, 255, 0, 0.1)',
                    border: `1px solid ${scannedSector.portInfo.type === 'STARDOCK' ? 'var(--neon-cyan)' : 'var(--neon-green)'}`,
                    marginBottom: '10px'
                  }}>
                    <div style={{ 
                      color: scannedSector.portInfo.type === 'STARDOCK' ? 'var(--neon-cyan)' : 'var(--neon-green)', 
                      fontWeight: 'bold', 
                      marginBottom: '10px',
                      fontSize: '16px'
                    }}>
                      {scannedSector.portInfo.type === 'STARDOCK' ? '🚀 STARDOCK' : `✅ TRADING PORT (${scannedSector.portInfo.type})`}
                    </div>
                    {scannedSector.portInfo.type !== 'STARDOCK' && (
                      <>
                        <div style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '13px' }}>
                          <strong>Class:</strong> {scannedSector.portInfo.class}
                        </div>
                        <div style={{ color: 'var(--text-primary)', marginBottom: '5px', fontSize: '12px' }}>
                          <strong>Buys:</strong> 
                          {scannedSector.portInfo.buyFlags.fuel && ' ⛽ Fuel'}
                          {scannedSector.portInfo.buyFlags.organics && ' 🌿 Organics'}
                          {scannedSector.portInfo.buyFlags.equipment && ' ⚙️ Equipment'}
                          {!scannedSector.portInfo.buyFlags.fuel && !scannedSector.portInfo.buyFlags.organics && !scannedSector.portInfo.buyFlags.equipment && ' None'}
                        </div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '12px' }}>
                          <strong>Sells:</strong> 
                          {scannedSector.portInfo.sellFlags.fuel && ' ⛽ Fuel'}
                          {scannedSector.portInfo.sellFlags.organics && ' 🌿 Organics'}
                          {scannedSector.portInfo.sellFlags.equipment && ' ⚙️ Equipment'}
                          {!scannedSector.portInfo.sellFlags.fuel && !scannedSector.portInfo.sellFlags.organics && !scannedSector.portInfo.sellFlags.equipment && ' None'}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Planet Information */}
                {scannedSector.planetInfo && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(138, 43, 226, 0.1)',
                    border: '1px solid var(--neon-purple)',
                    marginBottom: '10px',
                    color: 'var(--neon-purple)'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                      🌍 Planet: {scannedSector.planetInfo.name}
                    </div>
                    {scannedSector.planetInfo.ownerName && (
                      <div style={{ fontSize: '12px' }}>
                        Owner: {scannedSector.planetInfo.ownerName}
                      </div>
                    )}
                  </div>
                )}

                {/* Ships in Sector */}
                {scannedSector.ships && scannedSector.ships.length > 0 && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(255, 20, 147, 0.1)',
                    border: '1px solid var(--neon-pink)',
                    marginBottom: '10px'
                  }}>
                    <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', marginBottom: '8px' }}>
                      ⚠ SHIPS DETECTED ({scannedSector.ships.length})
                    </div>
                    {scannedSector.ships.map((ship: any, idx: number) => (
                      <div key={idx} style={{
                        padding: '8px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        marginBottom: '5px',
                        fontSize: '12px',
                        color: 'var(--text-primary)'
                      }}>
                        <div><strong>{ship.corpName}</strong> ({ship.username})</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>
                          {ship.shipType.toUpperCase()} • ⚔{ship.fighters} • 🛡{ship.shields}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Deployed Fighters */}
                {scannedSector.deployedFighters && scannedSector.deployedFighters.length > 0 && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(255, 100, 0, 0.1)',
                    border: '1px solid #ff6b00',
                    marginBottom: '10px'
                  }}>
                    <div style={{ color: '#ff6b00', fontWeight: 'bold', marginBottom: '8px' }}>
                      ⚔ STATIONED FIGHTERS ({scannedSector.deployedFighters.reduce((sum: number, f: any) => sum + f.fighterCount, 0)} total)
                    </div>
                    {scannedSector.deployedFighters.map((fighter: any, idx: number) => (
                      <div key={idx} style={{
                        padding: '6px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        marginBottom: '4px',
                        fontSize: '12px',
                        color: 'var(--text-primary)'
                      }}>
                        <strong>{fighter.ownerName}</strong>: {fighter.fighterCount} fighters
                      </div>
                    ))}
                  </div>
                )}

                {/* Warps */}
                {scannedSector.warps && scannedSector.warps.length > 0 && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid var(--neon-cyan)',
                    marginBottom: '10px'
                  }}>
                    <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', marginBottom: '8px' }}>
                      🔗 WARP CONNECTIONS ({scannedSector.warps.length})
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px'
                    }}>
                      {scannedSector.warps.map((warp: number, idx: number) => (
                        <div key={idx} style={{
                          padding: '4px 8px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid var(--neon-cyan)',
                          color: 'var(--neon-cyan)',
                          fontSize: '11px'
                        }}>
                          Sector {warp}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Beacons */}
                {scannedSector.beacons && scannedSector.beacons.length > 0 && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(0, 200, 255, 0.1)',
                    border: '1px solid var(--neon-cyan)',
                    marginBottom: '10px'
                  }}>
                    <div style={{ color: 'var(--neon-cyan)', fontWeight: 'bold', marginBottom: '8px' }}>
                      📡 BEACONS DETECTED ({scannedSector.beacons.length})
                    </div>
                    {scannedSector.beacons.map((beacon: any, idx: number) => (
                      <div key={idx} style={{
                        padding: '6px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        marginBottom: '4px',
                        fontSize: '12px',
                        color: 'var(--text-primary)'
                      }}>
                        <strong>{beacon.ownerName}</strong>'s Beacon (message encrypted)
                      </div>
                    ))}
                  </div>
                )}

                {/* Floating Cargo */}
                {scannedSector.floatingCargo && scannedSector.floatingCargo.length > 0 && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid var(--neon-yellow)',
                    marginBottom: '10px'
                  }}>
                    <div style={{ color: 'var(--neon-yellow)', fontWeight: 'bold', marginBottom: '8px' }}>
                      📦 FLOATING CARGO ({scannedSector.floatingCargo.length})
                    </div>
                    {scannedSector.floatingCargo.map((cargo: any, idx: number) => {
                      const total = cargo.fuel + cargo.organics + cargo.equipment + cargo.colonists;
                      return (
                        <div key={idx} style={{
                          padding: '6px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          marginBottom: '4px',
                          fontSize: '12px',
                          color: 'var(--text-primary)'
                        }}>
                          {cargo.source === 'combat' ? '💥 Combat Wreckage' : '🚮 Jettisoned'} - {total} units
                          {cargo.fuel > 0 && ` ⛽${cargo.fuel}`}
                          {cargo.organics > 0 && ` 🌿${cargo.organics}`}
                          {cargo.equipment > 0 && ` ⚙️${cargo.equipment}`}
                          {cargo.colonists > 0 && ` 👥${cargo.colonists}`}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Sector Defenses */}
                {(scannedSector.fightersCount > 0 || scannedSector.minesCount > 0) && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(255, 20, 147, 0.1)',
                    border: '1px solid var(--neon-pink)',
                    marginBottom: '10px'
                  }}>
                    <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', marginBottom: '5px' }}>
                      ⚠ SECTOR DEFENSES
                    </div>
                    {scannedSector.fightersCount > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        Sector Fighters: {scannedSector.fightersCount}
                      </div>
                    )}
                    {scannedSector.minesCount > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        Mines: {scannedSector.minesCount}
                      </div>
                    )}
                  </div>
                )}

                {/* Empty Sector */}
                {!scannedSector.portInfo && !scannedSector.planetInfo && 
                 (!scannedSector.ships || scannedSector.ships.length === 0) && 
                 (!scannedSector.deployedFighters || scannedSector.deployedFighters.length === 0) && 
                 (!scannedSector.beacons || scannedSector.beacons.length === 0) &&
                 (!scannedSector.floatingCargo || scannedSector.floatingCargo.length === 0) &&
                 scannedSector.fightersCount === 0 && scannedSector.minesCount === 0 && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(100, 100, 100, 0.1)',
                    border: '1px solid #666',
                    marginBottom: '10px',
                    color: '#999'
                  }}>
                    No significant activity detected
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => {
                setShowScanSector(false);
                setScannedSector(null);
              }}
              className="cyberpunk-button"
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '12px',
                background: 'rgba(100, 100, 100, 0.2)',
                borderColor: 'gray',
                color: 'gray'
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Hostile Fighters Encounter Modal */}
      {showHostileEncounter && hostileEncounterData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-primary)',
            border: '2px solid var(--neon-pink)',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 0 40px rgba(255, 20, 147, 0.5)'
          }}>
            <div style={{
              color: 'var(--neon-pink)',
              fontSize: '20px',
              fontWeight: 'bold',
              marginBottom: '20px',
              textAlign: 'center',
              textShadow: '0 0 10px var(--neon-pink)'
            }}>
              ⚠️ HOSTILE FIGHTERS DETECTED ⚠️
            </div>
            
            <div style={{
              background: 'rgba(255, 20, 147, 0.1)',
              padding: '15px',
              marginBottom: '20px',
              border: '1px solid rgba(255, 20, 147, 0.3)'
            }}>
              <div style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>
                You have entered a defended sector!
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {hostileEncounterData.fighters.map(f => (
                  <div key={f.id} style={{ marginBottom: '5px' }}>
                    ⚔ <span style={{ color: '#ff6b00' }}>{f.ownerName}</span>: {f.fighterCount} fighters
                  </div>
                ))}
              </div>
              <div style={{ 
                marginTop: '10px', 
                color: 'var(--neon-pink)', 
                fontWeight: 'bold',
                fontSize: '16px'
              }}>
                Total: {hostileEncounterData.totalCount} hostile fighters
              </div>
            </div>

            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '15px',
              marginBottom: '20px',
              fontSize: '13px',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: 'var(--neon-yellow)' }}>RETREAT:</strong> Escape to an adjacent sector. Risk 0-10% damage from pursuing fire.
              </div>
              <div>
                <strong style={{ color: 'var(--neon-pink)' }}>ATTACK:</strong> Engage the stationed fighters in combat. Standard combat rules apply.
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <div style={{ color: 'var(--neon-cyan)', marginBottom: '10px', fontWeight: 'bold' }}>
                Retreat To:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {sector?.warps.map(warp => (
                  <button
                    key={warp.destination}
                    onClick={() => handleRetreat(warp.destination)}
                    className="cyberpunk-button"
                    style={{
                      padding: '10px 15px',
                      background: 'rgba(255, 255, 0, 0.1)',
                      borderColor: 'var(--neon-yellow)',
                      color: 'var(--neon-yellow)'
                    }}
                  >
                    ◄ Sector {warp.destination}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--neon-pink)', marginBottom: '10px', fontWeight: 'bold' }}>
                Attack:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {hostileEncounterData.fighters.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleAttackDeployedFighters(f.id)}
                    disabled={attackingDeployment === f.id}
                    className="cyberpunk-button"
                    style={{
                      padding: '12px',
                      background: 'rgba(255, 20, 147, 0.2)',
                      borderColor: 'var(--neon-pink)',
                      color: 'var(--neon-pink)',
                      textAlign: 'left'
                    }}
                  >
                    {attackingDeployment === f.id ? '⟳ ATTACKING...' : `⚔ Attack ${f.ownerName}'s ${f.fighterCount} fighters`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setShowHostileEncounter(false);
                setHostileEncounterData(null);
              }}
              className="cyberpunk-button"
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '12px',
                background: 'rgba(100, 100, 100, 0.2)',
                borderColor: 'gray',
                color: 'gray'
              }}
            >
              DISMISS (Stay in Sector)
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-10px) translateY(-5px); }
          20% { transform: translateX(10px) translateY(5px); }
          30% { transform: translateX(-10px) translateY(-5px); }
          40% { transform: translateX(10px) translateY(5px); }
          50% { transform: translateX(-10px) translateY(-5px); }
          60% { transform: translateX(10px) translateY(5px); }
          70% { transform: translateX(-10px) translateY(-5px); }
          80% { transform: translateX(10px) translateY(5px); }
          90% { transform: translateX(-10px) translateY(-5px); }
        }

        @keyframes pulse {
          from {
            opacity: 0.8;
            box-shadow: 0 0 20px rgba(255, 20, 147, 0.5);
          }
          to {
            opacity: 1;
            box-shadow: 0 0 30px rgba(255, 20, 147, 0.8);
          }
        }

        .shake {
          animation: shake 0.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
