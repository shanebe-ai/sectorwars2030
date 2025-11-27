import { pool } from '../db/connection';

export type LogType = 'SOL' | 'PLANET' | 'PORT' | 'DEAD_END' | 'STARDOCK' | 'MANUAL';

export interface ShipLogEntry {
  id: number;
  player_id: number;
  universe_id: number;
  sector_number: number;
  log_type: LogType;
  port_type?: string;
  planet_name?: string;
  sector_name?: string;
  note?: string;
  is_manual: boolean;
  discovered_at: string;
}

/**
 * Get all ship log entries for a player
 */
export async function getShipLogs(playerId: number): Promise<ShipLogEntry[]> {
  const result = await pool.query(
    `SELECT * FROM ship_logs 
     WHERE player_id = $1 
     ORDER BY discovered_at DESC`,
    [playerId]
  );
  return result.rows;
}

/**
 * Get ship logs filtered by type
 */
export async function getShipLogsByType(playerId: number, logType: LogType): Promise<ShipLogEntry[]> {
  const result = await pool.query(
    `SELECT * FROM ship_logs 
     WHERE player_id = $1 AND log_type = $2
     ORDER BY sector_number ASC`,
    [playerId, logType]
  );
  return result.rows;
}

/**
 * Check if a log entry already exists
 */
export async function hasLogEntry(playerId: number, sectorNumber: number, logType: LogType): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM ship_logs 
     WHERE player_id = $1 AND sector_number = $2 AND log_type = $3`,
    [playerId, sectorNumber, logType]
  );
  return result.rows.length > 0;
}

/**
 * Add a ship log entry (auto-discovered)
 */
export async function addLogEntry(
  playerId: number,
  universeId: number,
  sectorNumber: number,
  logType: LogType,
  options: {
    portType?: string;
    planetName?: string;
    sectorName?: string;
    note?: string;
  } = {}
): Promise<ShipLogEntry | null> {
  try {
    const result = await pool.query(
      `INSERT INTO ship_logs 
       (player_id, universe_id, sector_number, log_type, port_type, planet_name, sector_name, note, is_manual)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       ON CONFLICT (player_id, sector_number, log_type) DO NOTHING
       RETURNING *`,
      [
        playerId,
        universeId,
        sectorNumber,
        logType,
        options.portType || null,
        options.planetName || null,
        options.sectorName || null,
        options.note || null
      ]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error adding ship log entry:', error);
    return null;
  }
}

/**
 * Add a manual note (player-created)
 */
export async function addManualNote(
  playerId: number,
  universeId: number,
  sectorNumber: number,
  note: string
): Promise<ShipLogEntry> {
  // For manual notes, we allow multiple per sector by using MANUAL type
  // But we'll update if one already exists for this sector
  const existing = await pool.query(
    `SELECT id FROM ship_logs 
     WHERE player_id = $1 AND sector_number = $2 AND log_type = 'MANUAL'`,
    [playerId, sectorNumber]
  );

  if (existing.rows.length > 0) {
    // Update existing manual note
    const result = await pool.query(
      `UPDATE ship_logs 
       SET note = $1, discovered_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [note, existing.rows[0].id]
    );
    return result.rows[0];
  } else {
    // Create new manual note
    const result = await pool.query(
      `INSERT INTO ship_logs 
       (player_id, universe_id, sector_number, log_type, note, is_manual)
       VALUES ($1, $2, $3, 'MANUAL', $4, TRUE)
       RETURNING *`,
      [playerId, universeId, sectorNumber, note]
    );
    return result.rows[0];
  }
}

/**
 * Delete a manual note (only manual entries can be deleted)
 */
export async function deleteManualNote(playerId: number, logId: number): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM ship_logs 
     WHERE id = $1 AND player_id = $2 AND is_manual = TRUE
     RETURNING id`,
    [logId, playerId]
  );
  return result.rows.length > 0;
}

/**
 * Auto-log sector discovery based on sector data
 * Called when player enters a new sector
 */
export async function autoLogSector(
  playerId: number,
  universeId: number,
  sectorData: {
    sector_number: number;
    name?: string;
    port_type?: string;
    has_planet?: boolean;
    planet_name?: string;
    warp_count?: number;
  }
): Promise<ShipLogEntry[]> {
  const logs: ShipLogEntry[] = [];
  const { sector_number, name, port_type, has_planet, planet_name, warp_count } = sectorData;

  // Log Sol (sector 1)
  if (sector_number === 1) {
    const entry = await addLogEntry(playerId, universeId, sector_number, 'SOL', {
      sectorName: name || 'Sol (Earth)',
      note: 'Home sector - Earth'
    });
    if (entry) logs.push(entry);
  }

  // Log StarDock
  if (port_type === 'STARDOCK') {
    const entry = await addLogEntry(playerId, universeId, sector_number, 'STARDOCK', {
      portType: 'STARDOCK',
      sectorName: name,
      note: 'StarDock - Ship and equipment dealer'
    });
    if (entry) logs.push(entry);
  }
  // Log regular ports
  else if (port_type && port_type !== 'STARDOCK') {
    const entry = await addLogEntry(playerId, universeId, sector_number, 'PORT', {
      portType: port_type,
      sectorName: name,
      note: `Trading port - Type ${port_type}`
    });
    if (entry) logs.push(entry);
  }

  // Log planets
  if (has_planet && planet_name) {
    const entry = await addLogEntry(playerId, universeId, sector_number, 'PLANET', {
      planetName: planet_name,
      sectorName: name,
      note: `Planet: ${planet_name}`
    });
    if (entry) logs.push(entry);
  }

  // Log dead-ends (sectors with only 1 warp connection)
  if (warp_count !== undefined && warp_count <= 1) {
    const entry = await addLogEntry(playerId, universeId, sector_number, 'DEAD_END', {
      sectorName: name,
      note: warp_count === 0 ? 'Dead end - No exits!' : 'Dead end - Single exit'
    });
    if (entry) logs.push(entry);
  }

  return logs;
}

/**
 * Get log statistics for a player
 */
export async function getLogStats(playerId: number): Promise<{
  total: number;
  ports: number;
  planets: number;
  deadEnds: number;
  stardocks: number;
  manual: number;
}> {
  const result = await pool.query(
    `SELECT 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE log_type = 'PORT') as ports,
       COUNT(*) FILTER (WHERE log_type = 'PLANET') as planets,
       COUNT(*) FILTER (WHERE log_type = 'DEAD_END') as dead_ends,
       COUNT(*) FILTER (WHERE log_type = 'STARDOCK') as stardocks,
       COUNT(*) FILTER (WHERE log_type = 'MANUAL') as manual
     FROM ship_logs WHERE player_id = $1`,
    [playerId]
  );
  
  const row = result.rows[0];
  return {
    total: parseInt(row.total) || 0,
    ports: parseInt(row.ports) || 0,
    planets: parseInt(row.planets) || 0,
    deadEnds: parseInt(row.dead_ends) || 0,
    stardocks: parseInt(row.stardocks) || 0,
    manual: parseInt(row.manual) || 0
  };
}

