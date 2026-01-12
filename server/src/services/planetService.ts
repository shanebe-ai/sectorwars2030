import { pool } from '../db/connection';
import { emitSectorEvent, emitPlayerEvent } from '../index';

// ============================================================================
// TYPES
// ============================================================================

export interface PlanetInfo {
  id: number;
  universeId: number;
  sectorId: number;
  sectorNumber: number;
  name: string;
  ownerId: number | null;
  ownerName: string | null;
  colonists: number;
  fighters: number;
  ore: number;
  fuel: number;
  organics: number;
  equipment: number;
  credits: number;
  productionType: 'fuel' | 'organics' | 'equipment' | 'balanced';
  citadelLevel: number;
  lastProduction: Date;
  createdAt: Date;
  isClaimable: boolean;
}

export interface CitadelUpgrade {
  level: number;
  name: string;
  cost: number;
  description: string;
  features: string[];
}

// Citadel levels and costs (TW2002 inspired)
export const CITADEL_LEVELS: CitadelUpgrade[] = [
  { level: 0, name: 'No Citadel', cost: 0, description: 'Colonists only defense', features: [] },
  { level: 1, name: 'Basic Citadel', cost: 50000, description: 'Basic Quasar Cannon', features: ['Quasar cannon'] },
  { level: 2, name: 'Improved Citadel', cost: 100000, description: 'Improved weapons', features: ['Quasar cannon', 'Enhanced shields'] },
  { level: 3, name: 'Fortified Citadel', cost: 250000, description: 'Atmospheric defense', features: ['Quasar cannon', 'Enhanced shields', 'Atmospheric defense'] },
  { level: 4, name: 'Advanced Citadel', cost: 500000, description: 'Transporter beam', features: ['Quasar cannon', 'Enhanced shields', 'Atmospheric defense', 'Transporter beam'] },
  { level: 5, name: 'Maximum Citadel', cost: 1000000, description: 'Interdictor generator', features: ['Quasar cannon', 'Enhanced shields', 'Atmospheric defense', 'Transporter beam', 'Interdictor'] },
];

// Production rates per 1000 colonists per hour (BUFFED 5x from original)
// 10K colonists on equipment = ~₡55K/hour (was ~₡11K/hour)
// Citadel bonuses: +10% production per level (max +50% at level 5)
const BASE_PRODUCTION_RATES = {
  fuel: { fuel: 50, organics: 10, equipment: 10 }, // 5x buff
  organics: { fuel: 10, organics: 50, equipment: 10 },
  equipment: { fuel: 10, organics: 10, equipment: 50 },
  balanced: { fuel: 25, organics: 25, equipment: 25 },
};

function getProductionRates(productionType: 'fuel' | 'organics' | 'equipment' | 'balanced', citadelLevel: number) {
  const base = BASE_PRODUCTION_RATES[productionType];
  const citadelBonus = 1 + (citadelLevel * 0.10); // +10% per citadel level
  
  return {
    fuel: Math.floor(base.fuel * citadelBonus),
    organics: Math.floor(base.organics * citadelBonus),
    equipment: Math.floor(base.equipment * citadelBonus)
  };
}

// ============================================================================
// PLANET INFO
// ============================================================================

export async function getPlanetById(planetId: number): Promise<PlanetInfo | null> {
  const result = await pool.query(
    `SELECT p.*, s.sector_number, COALESCE(p.owner_name, pl.corp_name) as owner_name
     FROM planets p
     JOIN sectors s ON p.sector_id = s.id
     LEFT JOIN players pl ON p.owner_id = pl.id
     WHERE p.id = $1`,
    [planetId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return mapPlanetRow(row);
}

export async function getPlanetBySector(sectorId: number): Promise<PlanetInfo | null> {
  const result = await pool.query(
    `SELECT p.*, s.sector_number, COALESCE(p.owner_name, pl.corp_name) as owner_name
     FROM planets p
     JOIN sectors s ON p.sector_id = s.id
     LEFT JOIN players pl ON p.owner_id = pl.id
     WHERE p.sector_id = $1`,
    [sectorId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return mapPlanetRow(row);
}

export async function getPlayerPlanets(playerId: number): Promise<PlanetInfo[]> {
  const result = await pool.query(
    `SELECT p.*, s.sector_number, COALESCE(p.owner_name, pl.corp_name) as owner_name
     FROM planets p
     JOIN sectors s ON p.sector_id = s.id
     LEFT JOIN players pl ON p.owner_id = pl.id
     WHERE p.owner_id = $1
     ORDER BY p.name`,
    [playerId]
  );
  
  return result.rows.map(mapPlanetRow);
}

function mapPlanetRow(row: any): PlanetInfo {
  // Check if planet is claimable (no owner and not Earth/Terra Corp)
  const isClaimable = row.owner_id === null && row.owner_name !== 'Terra Corp';
  
  return {
    id: row.id,
    universeId: row.universe_id,
    sectorId: row.sector_id,
    sectorNumber: row.sector_number,
    name: row.name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    colonists: row.colonists,
    fighters: row.fighters,
    ore: row.ore,
    fuel: row.fuel,
    organics: row.organics,
    equipment: row.equipment,
    credits: row.credits,
    productionType: row.production_type,
    citadelLevel: row.citadel_level,
    lastProduction: new Date(row.last_production),
    createdAt: new Date(row.created_at),
    isClaimable
  };
}

// ============================================================================
// CLAIM PLANET
// ============================================================================

export async function claimPlanet(planetId: number, playerId: number): Promise<{ success: boolean; error?: string; planet?: PlanetInfo }> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet info
    const planetResult = await client.query(
      `SELECT p.*, s.sector_number, s.id as sector_id
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1
       FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    // Check if planet is already claimed
    if (planet.owner_id !== null) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet is already claimed' };
    }
    
    // Check if player is in the same sector
    const playerResult = await client.query(
      'SELECT current_sector, corp_name FROM players WHERE id = $1',
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    // Compare sector numbers (player has current_sector number, planet query includes sector_number)
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be in the same sector to claim a planet' };
    }
    
    // Claim the planet
    await client.query(
      `UPDATE planets 
       SET owner_id = $1, owner_name = $2
       WHERE id = $3`,
      [playerId, player.corp_name, planetId]
    );
    
    await client.query('COMMIT');

    // Get updated planet info
    const updatedPlanet = await getPlanetById(planetId);

    // Emit WebSocket event to notify players in the sector
    emitSectorEvent(planet.universe_id, planet.sector_number, 'planet_claimed', {
      planetId,
      planetName: planet.name,
      ownerName: player.corp_name,
      playerId
    });

    return { success: true, planet: updatedPlanet! };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// SET PRODUCTION TYPE
// ============================================================================

export async function setProductionType(
  planetId: number, 
  playerId: number, 
  productionType: 'fuel' | 'organics' | 'equipment' | 'balanced'
): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check ownership
    const planetResult = await client.query(
      'SELECT owner_id FROM planets WHERE id = $1 FOR UPDATE',
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    if (planetResult.rows[0].owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    // Update production type
    await client.query(
      'UPDATE planets SET production_type = $1 WHERE id = $2',
      [productionType, planetId]
    );
    
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// COLONIST MANAGEMENT
// ============================================================================

export async function depositColonists(
  planetId: number, 
  playerId: number, 
  amount: number
): Promise<{ success: boolean; error?: string; colonistsDeposited?: number }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.owner_id, p.sector_id, p.colonists, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    // Check if player is in same sector and has colonists
    const playerResult = await client.query(
      'SELECT current_sector, colonists FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to deposit colonists' };
    }
    
    if (player.colonists < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `You only have ${player.colonists} colonists` };
    }
    
    // Transfer colonists
    await client.query(
      'UPDATE players SET colonists = colonists - $1 WHERE id = $2',
      [amount, playerId]
    );
    
    await client.query(
      'UPDATE planets SET colonists = colonists + $1 WHERE id = $2',
      [amount, planetId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, colonistsDeposited: amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// RESOURCE MANAGEMENT
// ============================================================================

export async function withdrawResources(
  planetId: number, 
  playerId: number, 
  resource: 'fuel' | 'organics' | 'equipment',
  amount: number
): Promise<{ success: boolean; error?: string; amountWithdrawn?: number }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.*, s.id as sector_id, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    // Check player location and cargo capacity
    const playerResult = await client.query(
      `SELECT p.*, st.holds as max_holds
       FROM players p
       JOIN ship_types st ON p.ship_type_id = st.id
       WHERE p.id = $1 FOR UPDATE`,
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to withdraw resources' };
    }
    
    // Check available resources on planet
    const availableOnPlanet = planet[resource];
    if (availableOnPlanet < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `Planet only has ${availableOnPlanet} ${resource}` };
    }
    
    // Check cargo capacity
    const currentCargo = player.fuel + player.organics + player.equipment;
    const freeSpace = player.max_holds - currentCargo;
    
    if (freeSpace < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `You only have ${freeSpace} cargo space available` };
    }
    
    // Transfer resources
    await client.query(
      `UPDATE planets SET ${resource} = ${resource} - $1 WHERE id = $2`,
      [amount, planetId]
    );
    
    await client.query(
      `UPDATE players SET ${resource} = ${resource} + $1 WHERE id = $2`,
      [amount, playerId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, amountWithdrawn: amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function depositResources(
  planetId: number, 
  playerId: number, 
  resource: 'fuel' | 'organics' | 'equipment',
  amount: number
): Promise<{ success: boolean; error?: string; amountDeposited?: number }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.*, s.id as sector_id, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    // Check player location and cargo
    const playerResult = await client.query(
      'SELECT current_sector, fuel, organics, equipment FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to deposit resources' };
    }
    
    // Check player has enough resources
    const playerResource = player[resource];
    if (playerResource < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `You only have ${playerResource} ${resource}` };
    }
    
    // Transfer resources
    await client.query(
      `UPDATE players SET ${resource} = ${resource} - $1 WHERE id = $2`,
      [amount, playerId]
    );
    
    await client.query(
      `UPDATE planets SET ${resource} = ${resource} + $1 WHERE id = $2`,
      [amount, planetId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, amountDeposited: amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// FIGHTER MANAGEMENT
// ============================================================================

export async function depositFighters(
  planetId: number, 
  playerId: number, 
  amount: number
): Promise<{ success: boolean; error?: string; fightersDeposited?: number }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.owner_id, p.sector_id, p.fighters, p.citadel_level, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    // Check if player is in same sector and has fighters
    const playerResult = await client.query(
      'SELECT current_sector, fighters FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to deploy fighters' };
    }
    
    if (player.fighters < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `You only have ${player.fighters} fighters` };
    }
    
    // Transfer fighters
    await client.query(
      'UPDATE players SET fighters = fighters - $1 WHERE id = $2',
      [amount, playerId]
    );
    
    await client.query(
      'UPDATE planets SET fighters = fighters + $1 WHERE id = $2',
      [amount, planetId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, fightersDeposited: amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withdrawFighters(
  planetId: number, 
  playerId: number, 
  amount: number
): Promise<{ success: boolean; error?: string; fightersWithdrawn?: number }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.owner_id, p.sector_id, p.fighters, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    if (planet.fighters < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `Planet only has ${planet.fighters} fighters` };
    }
    
    // Check if player is in same sector and has capacity
    const playerResult = await client.query(
      `SELECT p.current_sector, p.fighters, st.fighters_max
       FROM players p
       JOIN ship_types st ON p.ship_type_id = st.id
       WHERE p.id = $1 FOR UPDATE`,
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to retrieve fighters' };
    }
    
    const freeCapacity = player.fighters_max - player.fighters;
    if (freeCapacity < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `You can only carry ${freeCapacity} more fighters` };
    }
    
    // Transfer fighters
    await client.query(
      'UPDATE planets SET fighters = fighters - $1 WHERE id = $2',
      [amount, planetId]
    );
    
    await client.query(
      'UPDATE players SET fighters = fighters + $1 WHERE id = $2',
      [amount, playerId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, fightersWithdrawn: amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// CITADEL UPGRADE
// ============================================================================

export async function upgradeCitadel(
  planetId: number, 
  playerId: number
): Promise<{ success: boolean; error?: string; newLevel?: number; cost?: number }> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.owner_id, p.sector_id, p.citadel_level, p.credits, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    // Check if at max level
    if (planet.citadel_level >= 5) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Citadel is already at maximum level' };
    }
    
    // Get next level cost
    const nextLevel = planet.citadel_level + 1;
    const upgradeCost = CITADEL_LEVELS[nextLevel].cost;
    
    // Check if player is in same sector
    const playerResult = await client.query(
      'SELECT current_sector, credits FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to upgrade the citadel' };
    }
    
    // Check funds (from player credits)
    if (player.credits < upgradeCost) {
      await client.query('ROLLBACK');
      return { success: false, error: `Upgrade costs ₡${upgradeCost.toLocaleString()} - you have ₡${player.credits.toLocaleString()}` };
    }
    
    // Deduct credits and upgrade
    await client.query(
      'UPDATE players SET credits = credits - $1 WHERE id = $2',
      [upgradeCost, playerId]
    );
    
    await client.query(
      'UPDATE planets SET citadel_level = $1 WHERE id = $2',
      [nextLevel, planetId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, newLevel: nextLevel, cost: upgradeCost };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// PRODUCTION SYSTEM
// ============================================================================

export async function calculateAndApplyProduction(planetId: number): Promise<{ 
  success: boolean; 
  produced?: { fuel: number; organics: number; equipment: number };
  error?: string 
}> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet info
    const planetResult = await client.query(
      `SELECT id, colonists, production_type, last_production, fuel, organics, equipment, citadel_level
       FROM planets WHERE id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    // Calculate hours since last production
    const lastProduction = new Date(planet.last_production);
    const now = new Date();
    const hoursSinceProduction = (now.getTime() - lastProduction.getTime()) / (1000 * 60 * 60);
    
    // Only produce if at least 1 hour has passed
    if (hoursSinceProduction < 1) {
      await client.query('ROLLBACK');
      return { success: true, produced: { fuel: 0, organics: 0, equipment: 0 } };
    }
    
    // Calculate production based on colonists, citadel level, and time
    const citadelLevel = planet.citadel_level || 0;
    const rates = getProductionRates(
      planet.production_type as 'fuel' | 'organics' | 'equipment' | 'balanced',
      citadelLevel
    );
    const colonistFactor = planet.colonists / 1000; // Per 1000 colonists
    
    const fuelProduced = Math.floor(rates.fuel * colonistFactor * hoursSinceProduction);
    const organicsProduced = Math.floor(rates.organics * colonistFactor * hoursSinceProduction);
    const equipmentProduced = Math.floor(rates.equipment * colonistFactor * hoursSinceProduction);
    
    // Cap at reasonable maximums to prevent overflow
    const maxStorage = 1000000;
    const newFuel = Math.min(planet.fuel + fuelProduced, maxStorage);
    const newOrganics = Math.min(planet.organics + organicsProduced, maxStorage);
    const newEquipment = Math.min(planet.equipment + equipmentProduced, maxStorage);
    
    // Update planet
    await client.query(
      `UPDATE planets 
       SET fuel = $1, organics = $2, equipment = $3, last_production = NOW()
       WHERE id = $4`,
      [newFuel, newOrganics, newEquipment, planetId]
    );
    
    await client.query('COMMIT');
    
    return { 
      success: true, 
      produced: { 
        fuel: newFuel - planet.fuel, 
        organics: newOrganics - planet.organics, 
        equipment: newEquipment - planet.equipment 
      } 
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// CREDITS MANAGEMENT
// ============================================================================

export async function depositCredits(
  planetId: number, 
  playerId: number, 
  amount: number
): Promise<{ success: boolean; error?: string; creditsDeposited?: number }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.owner_id, p.sector_id, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    // Check player credits
    const playerResult = await client.query(
      'SELECT current_sector, credits FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    const player = playerResult.rows[0];
    
    if (player.current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to deposit credits' };
    }
    
    if (player.credits < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `You only have ₡${player.credits.toLocaleString()}` };
    }
    
    // Transfer credits
    await client.query(
      'UPDATE players SET credits = credits - $1 WHERE id = $2',
      [amount, playerId]
    );
    
    await client.query(
      'UPDATE planets SET credits = credits + $1 WHERE id = $2',
      [amount, planetId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, creditsDeposited: amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withdrawCredits(
  planetId: number, 
  playerId: number, 
  amount: number
): Promise<{ success: boolean; error?: string; creditsWithdrawn?: number }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get planet and check ownership
    const planetResult = await client.query(
      `SELECT p.owner_id, p.sector_id, p.credits, s.sector_number
       FROM planets p
       JOIN sectors s ON p.sector_id = s.id
       WHERE p.id = $1 FOR UPDATE`,
      [planetId]
    );
    
    if (planetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Planet not found' };
    }
    
    const planet = planetResult.rows[0];
    
    if (planet.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not own this planet' };
    }
    
    if (planet.credits < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: `Planet only has ₡${planet.credits.toLocaleString()}` };
    }
    
    // Check player location
    const playerResult = await client.query(
      'SELECT current_sector FROM players WHERE id = $1',
      [playerId]
    );
    
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }
    
    if (playerResult.rows[0].current_sector !== planet.sector_number) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at the planet to withdraw credits' };
    }
    
    // Transfer credits
    await client.query(
      'UPDATE planets SET credits = credits - $1 WHERE id = $2',
      [amount, planetId]
    );
    
    await client.query(
      'UPDATE players SET credits = credits + $1 WHERE id = $2',
      [amount, playerId]
    );
    
    await client.query('COMMIT');
    
    return { success: true, creditsWithdrawn: amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

