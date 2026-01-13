import { query, getClient } from '../db/connection';
import { PortType } from '../../../shared/types';
import { generateAliensForUniverse } from './alienService';

interface UniverseConfig {
  name: string;
  description?: string;
  maxSectors?: number;
  maxPlayers?: number;
  turnsPerDay?: number;
  startingCredits?: number;
  startingShipType?: string;
  portPercentage?: number; // Percentage of sectors with ports (default 12%)
  stardockCount?: number; // Number of stardocks to create (default: calculated)
  allowDeadEnds?: boolean; // Allow dead-end sectors (~0.25% chance)
  alienPlanetCount?: number; // Number of alien planets (default: formula based on sector count)
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

// StarDock configuration
const STARDOCK_SECTORS_PER_DOCK = 500; // 1 StarDock per 500 sectors
const STARDOCK_MIN_FOR_LARGE_UNIVERSE = 1; // Minimum 1 for 1000+ sector universes

// Warp range configuration (TW2002-style)
const WARP_MIN_RANGE = 50;   // Minimum sectors between warps
const WARP_MAX_RANGE = 200;  // Maximum sectors between warps

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
 * Generate warp connections for TerraSpace sectors (dynamic sizing: 2% of universe, minimum 10)
 * Creates a linear/branching path through TerraSpace
 * Only sectors 5+ have exits to the wider universe
 * Sectors 5+: 1-2 warps out of TerraSpace + 1-2 warps within TerraSpace (2-4 total outgoing)
 * Sectors 1-4: Only intra-TerraSpace warps
 */
function generateTerraSpaceWarps(
  sectorNumber: number,
  terraSpaceStart: number,
  terraSpaceEnd: number,
  exitSectorsStart: number,
  totalSectors: number
): number[] {
  const warps = new Set<number>();

  // Sectors 1-4: Only intra-TerraSpace warps
  if (sectorNumber < exitSectorsStart) {
    // Linear progression: each sector connects to the next
    if (sectorNumber < terraSpaceEnd) {
      warps.add(sectorNumber + 1);
    }

    // Add branching connections within TerraSpace
    const branchCount = sectorNumber <= 2 ? 1 : Math.floor(Math.random() * 2) + 1; // 1-2 branches
    for (let i = 0; i < branchCount; i++) {
      const branch = Math.floor(Math.random() * (terraSpaceEnd - terraSpaceStart + 1)) + terraSpaceStart;
      if (branch !== sectorNumber && branch !== sectorNumber + 1) {
        warps.add(branch);
      }
    }
  } else {
    // Sectors 5+: Mix of intra-TerraSpace and out-of-TerraSpace warps
    // Exit warps use TW2002-style constrained ranges (±50-200 sectors) from the EXIT sector
    const outOfTerraSpaceCount = Math.floor(Math.random() * 2) + 1; // 1-2 exits
    for (let i = 0; i < outOfTerraSpaceCount; i++) {
      // Use constrained range from current sector position (not random across entire universe)
      const range = WARP_MIN_RANGE + Math.floor(Math.random() * (WARP_MAX_RANGE - WARP_MIN_RANGE + 1));
      const direction = Math.random() < 0.5 ? 1 : -1;
      const exitSector = sectorNumber + (direction * range);

      // Clamp to valid range OUTSIDE TerraSpace
      const validExit = Math.max(terraSpaceEnd + 1, Math.min(totalSectors, exitSector));

      if (validExit > terraSpaceEnd && validExit !== sectorNumber) {
        warps.add(validExit);
      }
    }

    // REDUCED: 1-2 warps within TerraSpace (was 2-4)
    const withinTerraSpaceCount = Math.floor(Math.random() * 2) + 1; // 1-2 intra warps
    for (let i = 0; i < withinTerraSpaceCount; i++) {
      const terraSector = Math.floor(Math.random() * (terraSpaceEnd - terraSpaceStart + 1)) + terraSpaceStart;
      if (terraSector !== sectorNumber) {
        warps.add(terraSector);
      }
    }
  }

  return Array.from(warps);
}

/**
 * Generate warp connections for a sector
 * TW2002-style: Constrained warp ranges (±50-200 sectors) for local connectivity
 * Creates 1-2 outgoing warps per sector (80% = 1, 20% = 2)
 * After bidirectional processing, most sectors will have 2-6 total connections
 * Note: Edge sectors may have more connections due to asymmetric reachability
 * Dead-ends are very rare (~0.25%) when allowDeadEnds is true
 */
function generateWarps(sectorNumber: number, totalSectors: number, allowDeadEnds: boolean = false): number[] {
  // Reduced warp counts to account for bidirectional connections
  // Most sectors will end up with 2-6 total connections after all sectors are processed
  const rand = Math.random();
  let warpCount: number;

  if (allowDeadEnds && rand < 0.0025) {
    warpCount = 0; // 0.25% chance - dead-end (only if explicitly allowed)
  } else if (rand < 0.80) {
    warpCount = 1; // 80% chance - will end up with 2-4 total connections
  } else {
    warpCount = 2; // 20% chance - will end up with 4-6 total connections
  }

  const warps = new Set<number>();

  // Generate constrained-range destinations (TW2002-style: ±50-200 sectors)
  while (warps.size < warpCount) {
    // Calculate warp range: ±50 to ±200 sectors
    const range = WARP_MIN_RANGE + Math.floor(Math.random() * (WARP_MAX_RANGE - WARP_MIN_RANGE + 1));

    // Randomly choose forward or backward
    const direction = Math.random() < 0.5 ? 1 : -1;
    const destination = sectorNumber + (direction * range);

    // Clamp to valid sector range [1, totalSectors]
    const validDestination = Math.max(1, Math.min(totalSectors, destination));

    // Avoid self-warps and duplicates
    if (validDestination !== sectorNumber) {
      warps.add(validDestination);
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

    // TerraSpace dynamic sizing (safe starting zone - 2% of universe, minimum 10 sectors)
    const TERRASPACE_START = 1;
    const terraSpaceSize = Math.max(10, Math.floor(maxSectors * 0.02)); // 2% minimum 10
    const TERRASPACE_END = terraSpaceSize;
    const TERRASPACE_EXIT_START = 5; // Sectors 5+ have exits to the wider universe

    // Calculate port count with minimum 5% enforcement
    const effectivePortPercentage = Math.max(portPercentage, 5); // Minimum 5% ports
    let portCount = Math.floor(maxSectors * (effectivePortPercentage / 100));

    // Ensure at least 1 port for small universes
    portCount = Math.max(portCount, 1);

    const portSectors = new Set<number>();

    // Randomly select which sectors will have ports (excluding TerraSpace)
    while (portSectors.size < portCount) {
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      // Don't put ports in TerraSpace - keep it as a safe zone
      if (sectorNum > TERRASPACE_END) {
        portSectors.add(sectorNum);
      }
    }

    // Generate all sectors with warps
    for (let i = 1; i <= maxSectors; i++) {
      const hasPort = portSectors.has(i);
      const isInTerraSpace = i >= TERRASPACE_START && i <= TERRASPACE_END;

      const sector: GeneratedSector = {
        sectorNumber: i,
        name: i === 1 ? 'Sol (Earth)' : undefined,
        portType: hasPort ? generatePortType() || undefined : undefined,
        portClass: hasPort ? Math.floor(Math.random() * 3) + 1 : undefined, // Class 1-3
        warps: isInTerraSpace
          ? generateTerraSpaceWarps(i, TERRASPACE_START, TERRASPACE_END, TERRASPACE_EXIT_START, maxSectors)
          : generateWarps(i, maxSectors, allowDeadEnds),
      };
      sectors.push(sector);
    }

    console.log(`Generated ${sectors.length} sectors with ${portCount} ports (${portPercentage}%)`);

    // 3. Insert all sectors in batch
    const sectorInsertPromises = sectors.map((sector) => {
      const portFuelQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;
      const portOrganicsQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;
      const portEquipmentQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;

      // Determine region (TerraSpace for sectors 1-10)
      const region = sector.sectorNumber >= TERRASPACE_START && sector.sectorNumber <= TERRASPACE_END
        ? 'TerraSpace'
        : null;

      return client.query(
        `INSERT INTO sectors (universe_id, sector_number, name, region, port_type, port_class,
          port_fuel_qty, port_organics_qty, port_equipment_qty,
          port_fuel_pct, port_organics_pct, port_equipment_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 100, 100, 100)
         RETURNING id, sector_number`,
        [
          universeId,
          sector.sectorNumber,
          sector.name,
          region,
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

    // 4. Insert warp connections with connection limit enforcement
    // Track connections per sector to prevent over-connectivity
    // Dynamic connection limits based on sector position:
    // - Edge sectors (first/last 100): 6 max connections (less hub potential)
    // - Middle sectors: 8 max connections (can become natural hubs/strategic chokepoints)
    // This preserves TW2002's strategic gameplay where important sectors had 8-12 connections
    const EDGE_ZONE_SIZE = 100;
    const getMaxConnections = (sectorNum: number): number => {
      const isEdge = sectorNum <= EDGE_ZONE_SIZE || sectorNum > maxSectors - EDGE_ZONE_SIZE;
      return isEdge ? 6 : 8;
    };

    const sectorConnectionCount = new Map<number, number>();

    // Initialize connection counts
    for (let i = 1; i <= maxSectors; i++) {
      sectorConnectionCount.set(i, 0);
    }

    const warpInsertPromises: Promise<any>[] = [];
    const warpPairs = new Set<string>(); // Track inserted pairs to avoid duplicates

    for (const sector of sectors) {
      const sectorId = sectorIdMap.get(sector.sectorNumber);
      if (!sectorId) continue;

      const isTerraSpace1to4 = sector.sectorNumber >= TERRASPACE_START && sector.sectorNumber < TERRASPACE_EXIT_START;

      for (const destNumber of sector.warps) {
        // Enforce TerraSpace rules: sectors 1-4 can only warp to TerraSpace sectors
        if (isTerraSpace1to4 && destNumber > TERRASPACE_END) {
          continue;
        }

        const destSectorId = sectorIdMap.get(destNumber);
        if (!destSectorId) continue;

        // Check connection limits for both sectors (bidirectional, using dynamic limits)
        const sourceConnections = sectorConnectionCount.get(sector.sectorNumber) || 0;
        const destConnections = sectorConnectionCount.get(destNumber) || 0;
        const sourceMaxConnections = getMaxConnections(sector.sectorNumber);
        const destMaxConnections = getMaxConnections(destNumber);

        if (sourceConnections >= sourceMaxConnections || destConnections >= destMaxConnections) {
          continue; // Skip this warp, one or both sectors are at capacity
        }

        // Create unique pair key (smaller number first to avoid duplicates)
        const pairKey = sector.sectorNumber < destNumber
          ? `${sector.sectorNumber}-${destNumber}`
          : `${destNumber}-${sector.sectorNumber}`;

        if (warpPairs.has(pairKey)) {
          continue; // Already added this connection
        }

        warpPairs.add(pairKey);

        // Update connection counts for both sectors
        sectorConnectionCount.set(sector.sectorNumber, sourceConnections + 1);
        sectorConnectionCount.set(destNumber, destConnections + 1);

        // Create warp: sector → destination (bidirectional)
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
    console.log(`Inserted ${warpInsertPromises.length} warp connections (edge sectors: max 6, middle sectors: max 8)`);

    // 4.5. Ensure all sectors are reachable from Sol (sector 1)
    // Build adjacency list for connectivity check from ACTUAL inserted warps
    const adjacencyList = new Map<number, Set<number>>();
    for (let i = 1; i <= maxSectors; i++) {
      adjacencyList.set(i, new Set<number>());
    }

    // Populate adjacency list from ACTUALLY INSERTED warps (query database)
    // This ensures we check connectivity based on what was actually inserted, not what was generated
    const insertedWarpsResult = await client.query(`
      SELECT s.sector_number, sw.destination_sector_number
      FROM sector_warps sw
      JOIN sectors s ON sw.sector_id = s.id
      WHERE s.universe_id = $1
    `, [universeId]);

    for (const row of insertedWarpsResult.rows) {
      const from = row.sector_number;
      const to = row.destination_sector_number;
      adjacencyList.get(from)?.add(to);
      adjacencyList.get(to)?.add(from); // Bidirectional
    }

    // BFS to find all reachable sectors from Sol (sector 1)
    const reachable = new Set<number>();
    const queue = [1];
    reachable.add(1);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacencyList.get(current) || new Set();

      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Connect any unreachable sectors
    const unreachableSectors = [];
    for (let i = 1; i <= maxSectors; i++) {
      if (!reachable.has(i)) {
        unreachableSectors.push(i);
      }
    }

    if (unreachableSectors.length > 0) {
      console.log(`Found ${unreachableSectors.length} unreachable sectors, connecting them...`);

      // For each unreachable sector, connect it to a random reachable sector
      // BUT respect TerraSpace rules: sectors 1-4 can only connect to TerraSpace sectors
      for (const unreachableSector of unreachableSectors) {
        const isTerraSpace1to4 = unreachableSector >= TERRASPACE_START && unreachableSector < TERRASPACE_EXIT_START;
        
        // Filter reachable sectors based on TerraSpace rules
        let validReachableSectors = Array.from(reachable);
        
        if (isTerraSpace1to4) {
          // Sectors 1-4 can only connect to other TerraSpace sectors (1-10)
          validReachableSectors = validReachableSectors.filter(s => s >= TERRASPACE_START && s <= TERRASPACE_END);
        }
        
        // If no valid sectors found, expand search
        if (validReachableSectors.length === 0) {
          // For TerraSpace 1-4, ensure we have at least TerraSpace sectors
          if (isTerraSpace1to4) {
            validReachableSectors = Array.from({ length: TERRASPACE_END - TERRASPACE_START + 1 }, (_, i) => i + TERRASPACE_START);
          } else {
            validReachableSectors = Array.from(reachable);
          }
        }
        
        const connectTo = validReachableSectors[Math.floor(Math.random() * validReachableSectors.length)];

        const unreachableSectorId = sectorIdMap.get(unreachableSector);

        // Create bidirectional warp to connect this sector
        await client.query(
          `INSERT INTO sector_warps (sector_id, destination_sector_number, is_two_way)
           VALUES ($1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [unreachableSectorId, connectTo]
        );

        // Add to adjacency list and mark as reachable
        adjacencyList.get(unreachableSector)?.add(connectTo);
        adjacencyList.get(connectTo)?.add(unreachableSector);
        reachable.add(unreachableSector);

        // Update in-memory sector data
        const sectorData = sectors.find(s => s.sectorNumber === unreachableSector);
        if (sectorData) {
          sectorData.warps.push(connectTo);
        }
      }

      console.log(`Connected ${unreachableSectors.length} previously unreachable sectors`);
    } else {
      console.log(`All sectors are reachable from Sol - connectivity verified!`);
    }

    // 5. Create Earth planet in Sector 1 (Sol) - owned by Terra Corp (unclaimable)
    const sector1Id = sectorIdMap.get(1);
    if (sector1Id) {
      // Create Earth planet (unclaimable - owned by Terra Corp with 20,000 colonists)
      const planetResult = await client.query(
        `INSERT INTO planets (universe_id, sector_id, name, owner_id, owner_name, ore, fuel, organics, equipment,
          colonists, fighters, is_claimable, created_at)
         VALUES ($1, $2, $3, NULL, 'Terra Corp', 0, 0, 0, 0, 20000, 0, FALSE, CURRENT_TIMESTAMP)
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

    // Create Mars planet at last TerraSpace sector (unclaimable - owned by Terra Corp)
    const lastTerraSpaceSector = TERRASPACE_END;
    const marsSectorId = sectorIdMap.get(lastTerraSpaceSector);
    if (marsSectorId) {
      // Create Mars planet (unclaimable - owned by Terra Corp with 15,000 colonists)
      const marsPlanetResult = await client.query(
        `INSERT INTO planets (universe_id, sector_id, name, owner_id, owner_name, ore, fuel, organics, equipment,
          colonists, fighters, citadel_level, is_claimable, created_at)
         VALUES ($1, $2, $3, NULL, 'Terra Corp', 0, 0, 0, 0, 15000, 0, 2, FALSE, CURRENT_TIMESTAMP)
         RETURNING id`,
        [universeId, marsSectorId, 'Mars']
      );

      const marsPlanetId = marsPlanetResult.rows[0].id;

      // Update sector to mark it has a planet
      await client.query(
        `UPDATE sectors SET has_planet = TRUE, planet_id = $1 WHERE id = $2`,
        [marsPlanetId, marsSectorId]
      );

      console.log(`Created Mars planet in Sector ${lastTerraSpaceSector} (last TerraSpace sector) - owned by Terra Corp`);
    }

    // 6. Generate claimable planets (~3% of sectors, excluding TerraSpace and port sectors)
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

    // Select random sectors for planets (excluding TerraSpace and port sectors)
    while (planetSectors.size < planetCount) {
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      // Don't place planets in TerraSpace or sectors with ports
      if (sectorNum > TERRASPACE_END && !portSectors.has(sectorNum)) {
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

    // 7. Generate StarDocks
    // Always place one StarDock in TerraSpace (sector 5) for banking access
    const TERRASPACE_STARDOCK_SECTOR = 5;

    let stardockCount = config.stardockCount !== undefined ? config.stardockCount : Math.floor(maxSectors / STARDOCK_SECTORS_PER_DOCK);
    if (config.stardockCount === undefined) {
      // Apply defaults only if not explicitly set
      if (maxSectors >= 1000 && stardockCount < STARDOCK_MIN_FOR_LARGE_UNIVERSE) {
        stardockCount = STARDOCK_MIN_FOR_LARGE_UNIVERSE;
      }
      // Ensure at least 1 StarDock for any universe with 500+ sectors
      if (maxSectors >= 500 && stardockCount < 1) {
        stardockCount = 1;
      }
    }

    const stardockSectors = new Set<number>();

    // Always add TerraSpace StarDock in sector 5
    stardockSectors.add(TERRASPACE_STARDOCK_SECTOR);

    // Select random sectors for additional StarDocks (excluding TerraSpace, port sectors, and planet sectors)
    while (stardockSectors.size < stardockCount + 1) { // +1 for the TerraSpace StarDock
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      if (sectorNum > TERRASPACE_END && !portSectors.has(sectorNum) && !planetSectors.has(sectorNum)) {
        stardockSectors.add(sectorNum);
      }
    }
    
    // Create StarDocks
    let stardocksCreated = 0;
    for (const sectorNum of stardockSectors) {
      const sectorId = sectorIdMap.get(sectorNum);
      if (!sectorId) continue;

      // Special name for TerraSpace StarDock
      const stardockName = sectorNum === TERRASPACE_STARDOCK_SECTOR
        ? 'StarDock TerraSpace'
        : `StarDock Alpha-${stardocksCreated}`;

      // Update sector to be a StarDock
      await client.query(
        `UPDATE sectors SET
          port_type = 'STARDOCK',
          port_class = 9,
          name = $1,
          port_fuel_qty = 50000,
          port_organics_qty = 50000,
          port_equipment_qty = 50000,
          port_fuel_pct = 100,
          port_organics_pct = 100,
          port_equipment_pct = 100
        WHERE id = $2`,
        [stardockName, sectorId]
      );

      stardocksCreated++;
    }
    
    console.log(`Created ${stardocksCreated} StarDock(s) for ship/equipment trading`);

    // Commit transaction
    await client.query('COMMIT');

    // 8. Generate alien planets and ships (after commit, uses separate transaction)
    console.log('Generating alien presence...');
    try {
      await generateAliensForUniverse({
        universeId: universeId,
        sectorCount: maxSectors,
        customPlanetCount: config.alienPlanetCount
      });
      console.log('Alien generation completed successfully');
    } catch (alienError) {
      console.error('ERROR: Alien generation failed:', alienError);
      console.error('Alien error details:', JSON.stringify(alienError, null, 2));
      // Don't throw - universe is already created, just log the error
    }

    console.log(`Universe "${name}" generated successfully!`);

    return {
      success: true,
      universe,
      stats: {
        totalSectors: maxSectors,
        portsCreated: portCount,
        warpsCreated: warpInsertPromises.length,
        planetsCreated: planetsCreated + 2, // +2 for Earth and Mars
        stardocksCreated,
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
