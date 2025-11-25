import { query, getClient } from '../db/connection';
import { PortType } from '../../../shared/types';

interface UniverseConfig {
  name: string;
  description?: string;
  maxSectors?: number;
  maxPlayers?: number;
  turnsPerDay?: number;
  startingCredits?: number;
  startingShipType?: string;
  portPercentage?: number; // Percentage of sectors with ports (default 12%)
  createdBy: number;
}

interface GeneratedSector {
  sectorNumber: number;
  name?: string;
  portType?: PortType;
  portClass?: number;
  warps: number[];
}

const PORT_TYPES: PortType[] = ['BBS', 'BSB', 'SBB', 'SSB', 'SBS', 'BSS', 'SSS', 'BBB'];
const COMMON_PORT_TYPES: PortType[] = ['BBS', 'BSB', 'SBB', 'SSB', 'SBS', 'BSS'];
const RARE_PORT_TYPES: PortType[] = ['SSS', 'BBB'];

/**
 * Generate a random port type with rarity weighting
 * SSS and BBB are rare (5% chance each)
 * Other types are common (15% chance each)
 */
function generatePortType(): PortType | null {
  const rand = Math.random() * 100;

  if (rand < 5) return 'SSS'; // 5% chance
  if (rand < 10) return 'BBB'; // 5% chance

  // 90% distributed among common types
  const commonIndex = Math.floor(Math.random() * COMMON_PORT_TYPES.length);
  return COMMON_PORT_TYPES[commonIndex];
}

/**
 * Generate warp connections for a sector
 * Each sector has 2-6 bidirectional warps
 */
function generateWarps(sectorNumber: number, totalSectors: number): number[] {
  const warpCount = Math.floor(Math.random() * 5) + 2; // 2-6 warps
  const warps = new Set<number>();

  while (warps.size < warpCount) {
    const destination = Math.floor(Math.random() * totalSectors) + 1;
    if (destination !== sectorNumber) {
      warps.add(destination);
    }
  }

  return Array.from(warps);
}

/**
 * Generate a universe with sectors and warp connections
 */
export async function generateUniverse(config: UniverseConfig) {
  const {
    name,
    description,
    maxSectors = 1000,
    maxPlayers = 100,
    turnsPerDay = 1000,
    startingCredits = 2000,
    startingShipType = 'scout',
    portPercentage = 12,
    createdBy,
  } = config;

  const client = await getClient();

  try {
    // Start transaction
    await client.query('BEGIN');

    // 1. Create the universe
    const universeResult = await client.query(
      `INSERT INTO universes (name, description, max_sectors, max_players, turns_per_day,
        starting_credits, starting_ship_type, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, description, maxSectors, maxPlayers, turnsPerDay, startingCredits, startingShipType, true, createdBy]
    );

    const universe = universeResult.rows[0];
    const universeId = universe.id;

    console.log(`Creating universe "${name}" (ID: ${universeId}) with ${maxSectors} sectors...`);

    // 2. Generate sectors
    const sectors: GeneratedSector[] = [];
    const portCount = Math.floor(maxSectors * (portPercentage / 100));
    const portSectors = new Set<number>();

    // Randomly select which sectors will have ports
    while (portSectors.size < portCount) {
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      portSectors.add(sectorNum);
    }

    // Generate all sectors with warps
    for (let i = 1; i <= maxSectors; i++) {
      const hasPort = portSectors.has(i);
      const sector: GeneratedSector = {
        sectorNumber: i,
        name: i === 1 ? 'Sol (Earth)' : undefined,
        portType: hasPort ? generatePortType() || undefined : undefined,
        portClass: hasPort ? Math.floor(Math.random() * 3) + 1 : undefined, // Class 1-3
        warps: generateWarps(i, maxSectors),
      };
      sectors.push(sector);
    }

    console.log(`Generated ${sectors.length} sectors with ${portCount} ports (${portPercentage}%)`);

    // 3. Insert all sectors in batch
    const sectorInsertPromises = sectors.map((sector) => {
      const portFuelQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;
      const portOrganicsQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;
      const portEquipmentQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;

      return client.query(
        `INSERT INTO sectors (universe_id, sector_number, name, port_type, port_class,
          port_fuel_qty, port_organics_qty, port_equipment_qty,
          port_fuel_pct, port_organics_pct, port_equipment_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 100, 100, 100)
         RETURNING id, sector_number`,
        [
          universeId,
          sector.sectorNumber,
          sector.name,
          sector.portType,
          sector.portClass || 1,
          portFuelQty,
          portOrganicsQty,
          portEquipmentQty,
        ]
      );
    });

    const sectorResults = await Promise.all(sectorInsertPromises);
    const sectorIdMap = new Map<number, number>(); // sector_number -> sector.id

    sectorResults.forEach((result) => {
      const row = result.rows[0];
      sectorIdMap.set(row.sector_number, row.id);
    });

    console.log(`Inserted ${sectorResults.length} sectors into database`);

    // 4. Insert warp connections in batch
    const warpInsertPromises: Promise<any>[] = [];

    for (const sector of sectors) {
      const sectorId = sectorIdMap.get(sector.sectorNumber);
      if (!sectorId) continue;

      for (const destNumber of sector.warps) {
        warpInsertPromises.push(
          client.query(
            `INSERT INTO sector_warps (sector_id, destination_sector_number, is_two_way)
             VALUES ($1, $2, TRUE)`,
            [sectorId, destNumber]
          )
        );
      }
    }

    await Promise.all(warpInsertPromises);
    console.log(`Inserted ${warpInsertPromises.length} warp connections`);

    // Commit transaction
    await client.query('COMMIT');

    console.log(`Universe "${name}" generated successfully!`);

    return {
      success: true,
      universe,
      stats: {
        totalSectors: maxSectors,
        portsCreated: portCount,
        warpsCreated: warpInsertPromises.length,
      },
    };
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error generating universe:', error);
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

/**
 * Get universe by ID with stats
 */
export async function getUniverseById(universeId: number) {
  const universeResult = await query(
    'SELECT * FROM universes WHERE id = $1',
    [universeId]
  );

  if (universeResult.rows.length === 0) {
    return null;
  }

  const universe = universeResult.rows[0];

  // Get stats
  const statsResult = await query(
    `SELECT
      COUNT(*) as total_sectors,
      COUNT(port_type) as ports_count,
      (SELECT COUNT(*) FROM players WHERE universe_id = $1) as players_count
     FROM sectors
     WHERE universe_id = $1`,
    [universeId]
  );

  return {
    ...universe,
    stats: statsResult.rows[0],
  };
}

/**
 * List all universes
 */
export async function listUniverses() {
  const result = await query(
    `SELECT u.*,
      COUNT(DISTINCT s.id) as total_sectors,
      COUNT(DISTINCT s.id) FILTER (WHERE s.port_type IS NOT NULL) as ports_count,
      COUNT(DISTINCT p.id) as players_count
     FROM universes u
     LEFT JOIN sectors s ON s.universe_id = u.id
     LEFT JOIN players p ON p.universe_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );

  return result.rows;
}

/**
 * Delete a universe and all associated data (cascades)
 */
export async function deleteUniverse(universeId: number) {
  const result = await query(
    'DELETE FROM universes WHERE id = $1 RETURNING *',
    [universeId]
  );

  return result.rows.length > 0;
}
