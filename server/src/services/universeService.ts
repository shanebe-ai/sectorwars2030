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
  allowDeadEnds?: boolean; // Allow dead-end sectors (~0.25% chance)
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
 * TW2002-style: Ensures strong connectivity with 1-3 outgoing warps per sector
 * After bidirectional creation, most sectors will have 2-5 total warps
 * Distribution: 2 (most common ~65%), 1 (common ~25%), 3 (less common ~10%)
 * Dead-ends are very rare (~0.25%) when allowDeadEnds is true, otherwise guaranteed 1+ warps
 */
function generateWarps(sectorNumber: number, totalSectors: number, allowDeadEnds: boolean = false): number[] {
  // Weighted random: 1-2 warps most common, 3 max to avoid over-connected sectors
  const rand = Math.random();
  let warpCount: number;

  if (allowDeadEnds && rand < 0.0025) {
    warpCount = 0; // 0.25% chance - dead-end (only if explicitly allowed)
  } else if (rand < 0.65) {
    warpCount = 2; // 65% chance - most common (good connectivity)
  } else if (rand < 0.90) {
    warpCount = 1; // 25% chance - common (will get bidirectional warps from others)
  } else {
    warpCount = 3; // 10% chance - less common (junction sectors)
  }

  const warps = new Set<number>();

  // Generate random destinations
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
    allowDeadEnds = false,
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
    
    // Calculate port count with minimum 5% enforcement
    const effectivePortPercentage = Math.max(portPercentage, 5); // Minimum 5% ports
    let portCount = Math.floor(maxSectors * (effectivePortPercentage / 100));
    
    // Ensure at least 1 port for small universes
    portCount = Math.max(portCount, 1);
    
    const portSectors = new Set<number>();

    // Randomly select which sectors will have ports (excluding sector 1 - Sol)
    while (portSectors.size < portCount) {
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      // Don't put a port in Sol (sector 1) - keep it as a safe starting zone
      if (sectorNum !== 1) {
        portSectors.add(sectorNum);
      }
    }

    // Generate all sectors with warps
    for (let i = 1; i <= maxSectors; i++) {
      const hasPort = portSectors.has(i);
      const sector: GeneratedSector = {
        sectorNumber: i,
        name: i === 1 ? 'Sol (Earth)' : undefined,
        portType: hasPort ? generatePortType() || undefined : undefined,
        portClass: hasPort ? Math.floor(Math.random() * 3) + 1 : undefined, // Class 1-3
        warps: generateWarps(i, maxSectors, allowDeadEnds),
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
    // Note: Warps are two-way, so we only insert once per connection
    // The sector controller handles bidirectional lookups
    const warpInsertPromises: Promise<any>[] = [];

    for (const sector of sectors) {
      const sectorId = sectorIdMap.get(sector.sectorNumber);
      if (!sectorId) continue;

      for (const destNumber of sector.warps) {
        const destSectorId = sectorIdMap.get(destNumber);
        if (!destSectorId) continue;

        // Create warp: sector → destination (two-way)
        warpInsertPromises.push(
          client.query(
            `INSERT INTO sector_warps (sector_id, destination_sector_number, is_two_way)
             VALUES ($1, $2, TRUE)
             ON CONFLICT DO NOTHING`,
            [sectorId, destNumber]
          )
        );
      }
    }

    await Promise.all(warpInsertPromises);
    console.log(`Inserted ${warpInsertPromises.length} warp connections`);

    // 5. Create Earth planet in Sector 1 (Sol) - owned by Terra Corp (unclaimable)
    const sector1Id = sectorIdMap.get(1);
    if (sector1Id) {
      // Create Earth planet (unclaimable - owned by Terra Corp)
      const planetResult = await client.query(
        `INSERT INTO planets (universe_id, sector_id, name, owner_id, owner_name, ore, fuel, organics, equipment,
          colonists, fighters, is_claimable, created_at)
         VALUES ($1, $2, $3, NULL, 'Terra Corp', 0, 0, 0, 0, 0, 0, FALSE, CURRENT_TIMESTAMP)
         RETURNING id`,
        [universeId, sector1Id, 'Earth']
      );

      const planetId = planetResult.rows[0].id;

      // Update sector to mark it has a planet
      await client.query(
        `UPDATE sectors SET has_planet = TRUE, planet_id = $1 WHERE id = $2`,
        [planetId, sector1Id]
      );

      console.log(`Created Earth planet in Sector 1 (Sol) - owned by Terra Corp`);
    }

    // 6. Generate claimable planets (~3% of sectors, excluding sector 1 and port sectors)
    const planetPercentage = 3;
    const planetCount = Math.max(1, Math.floor(maxSectors * (planetPercentage / 100)));
    const planetSectors = new Set<number>();

    // Planet name prefixes for random generation
    const planetPrefixes = [
      'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Omega',
      'Nova', 'Nexus', 'Orion', 'Vega', 'Rigel', 'Altair', 'Deneb', 'Sirius',
      'Kepler', 'Titan', 'Atlas', 'Helios', 'Kronos', 'Hyperion', 'Prometheus'
    ];
    const planetSuffixes = ['Prime', 'Major', 'Minor', 'Station', 'Colony', 'Outpost', 'Haven', 'Base'];

    // Select random sectors for planets (excluding sector 1 and port sectors)
    while (planetSectors.size < planetCount) {
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      // Don't place planets in Sol (sector 1) or sectors with ports
      if (sectorNum !== 1 && !portSectors.has(sectorNum)) {
        planetSectors.add(sectorNum);
      }
    }

    // Create claimable planets
    let planetsCreated = 0;
    for (const sectorNum of planetSectors) {
      const sectorId = sectorIdMap.get(sectorNum);
      if (!sectorId) continue;

      // Generate random planet name
      const prefix = planetPrefixes[Math.floor(Math.random() * planetPrefixes.length)];
      const suffix = planetSuffixes[Math.floor(Math.random() * planetSuffixes.length)];
      const planetName = `${prefix} ${suffix}`;

      // Create the planet
      const planetResult = await client.query(
        `INSERT INTO planets (universe_id, sector_id, name, owner_id, owner_name, ore, fuel, organics, equipment,
          colonists, fighters, is_claimable, created_at)
         VALUES ($1, $2, $3, NULL, NULL, 0, 0, 0, 0, 0, 0, TRUE, CURRENT_TIMESTAMP)
         RETURNING id`,
        [universeId, sectorId, planetName]
      );

      const planetId = planetResult.rows[0].id;

      // Update sector to mark it has a planet
      await client.query(
        `UPDATE sectors SET has_planet = TRUE, planet_id = $1 WHERE id = $2`,
        [planetId, sectorId]
      );

      planetsCreated++;
    }

    console.log(`Created ${planetsCreated} claimable planets across the universe`);

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
        planetsCreated: planetsCreated + 1, // +1 for Earth
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
