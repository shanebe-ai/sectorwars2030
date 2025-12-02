import { getClient } from '../db/connection';
import { generateUniverse } from '../services/universeService';

/**
 * Generate sectors for an existing universe
 * This extracts the sector generation logic from generateUniverse
 */
async function generateSectorsForUniverse(universeId: number) {
  const client = await getClient();

  try {
    // Get universe info
    const universeResult = await client.query(
      `SELECT id, name, max_sectors, max_players, turns_per_day, 
              starting_credits, starting_ship_type, created_by
       FROM universes WHERE id = $1`,
      [universeId]
    );

    if (universeResult.rows.length === 0) {
      throw new Error('Universe not found');
    }

    const universe = universeResult.rows[0];

    // Check if sectors already exist
    const sectorCountResult = await client.query(
      `SELECT COUNT(*) as count FROM sectors WHERE universe_id = $1`,
      [universeId]
    );

    const existingSectors = parseInt(sectorCountResult.rows[0].count);
    if (existingSectors > 0) {
      console.log(`Universe ${universeId} already has ${existingSectors} sectors. Skipping generation.`);
      return { success: true, sectorsGenerated: existingSectors };
    }

    console.log(`Generating sectors for universe "${universe.name}" (ID: ${universeId})...`);

    // Use generateUniverse logic but for existing universe
    // We'll need to manually generate sectors since generateUniverse creates a new universe
    // For now, let's create a new universe with the same config and copy sectors, or
    // better: create a helper function that generates sectors for existing universe

    // Actually, the easiest approach: delete the universe and recreate it with generateUniverse
    // But that's destructive. Let me create a simpler solution - generate sectors directly

    const maxSectors = universe.max_sectors || 1000;
    const portPercentage = 12; // Default
    const allowDeadEnds = false;

    // Calculate port count
    const effectivePortPercentage = Math.max(portPercentage, 5);
    let portCount = Math.floor(maxSectors * (effectivePortPercentage / 100));
    portCount = Math.max(portCount, 1);

    const portSectors = new Set<number>();
    const TERRASPACE_END = 10;

    // Randomly select which sectors will have ports (excluding TerraSpace sectors 1-10)
    while (portSectors.size < portCount) {
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      if (sectorNum > TERRASPACE_END) {
        portSectors.add(sectorNum);
      }
    }

    await client.query('BEGIN');

    // Generate sectors
    const sectors: Array<{ sectorNumber: number; name?: string; portType?: string; portClass?: number; warps: number[] }> = [];

    // Generate warps function (simplified)
    function generateWarps(sectorNumber: number, totalSectors: number): number[] {
      const warpCount = Math.floor(Math.random() * 3) + 2; // 2-4 warps
      const warps = new Set<number>();

      while (warps.size < warpCount) {
        const target = Math.floor(Math.random() * totalSectors) + 1;
        if (target !== sectorNumber) {
          warps.add(target);
        }
      }
      return Array.from(warps);
    }

    function generateTerraSpaceWarps(sectorNumber: number, start: number, end: number, exitStart: number, totalSectors: number): number[] {
      const warps = new Set<number>();

      // Connect to adjacent TerraSpace sectors
      if (sectorNumber > start) warps.add(sectorNumber - 1);
      if (sectorNumber < end) warps.add(sectorNumber + 1);

      // Sectors 5-10 have exits to wider universe
      if (sectorNumber >= exitStart && sectorNumber <= end) {
        const exitsToWider = Math.floor(Math.random() * 3) + 1; // 1-3 exits
        for (let i = 0; i < exitsToWider; i++) {
          const exit = Math.floor(Math.random() * (totalSectors - end)) + end + 1;
          warps.add(exit);
        }
      }

      return Array.from(warps);
    }

    // Generate all sectors
    for (let i = 1; i <= maxSectors; i++) {
      const hasPort = portSectors.has(i);
      const isInTerraSpace = i >= 1 && i <= TERRASPACE_END;

      const portTypes = ['BBS', 'BSB', 'SBB', 'SSB', 'SBS', 'BSS', 'SSS', 'BBB'];
      const portType = hasPort ? portTypes[Math.floor(Math.random() * portTypes.length)] : undefined;

      const warps = isInTerraSpace
        ? generateTerraSpaceWarps(i, 1, TERRASPACE_END, 5, maxSectors)
        : generateWarps(i, maxSectors);

      sectors.push({
        sectorNumber: i,
        name: i === 1 ? 'Sol (Earth)' : undefined,
        portType,
        portClass: hasPort ? Math.floor(Math.random() * 3) + 1 : undefined,
        warps,
      });
    }

    console.log(`Generated ${sectors.length} sectors with ${portCount} ports`);

    // Insert sectors
    for (const sector of sectors) {
      const portFuelQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;
      const portOrganicsQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;
      const portEquipmentQty = sector.portType ? Math.floor(Math.random() * 10000) + 5000 : 0;

      const region = sector.sectorNumber >= 1 && sector.sectorNumber <= TERRASPACE_END ? 'TerraSpace' : null;

      const sectorResult = await client.query(
        `INSERT INTO sectors (universe_id, sector_number, name, region, port_type, port_class,
          port_fuel_qty, port_organics_qty, port_equipment_qty,
          port_fuel_pct, port_organics_pct, port_equipment_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 100, 100, 100)
         RETURNING id`,
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

      const sectorId = sectorResult.rows[0].id;

      // Insert warps
      for (const destinationSectorNumber of sector.warps) {
        await client.query(
          `INSERT INTO sector_warps (sector_id, destination_sector_number, is_two_way)
           VALUES ($1, $2, true)`,
          [sectorId, destinationSectorNumber]
        );
      }
    }

    // Add StarDocks
    const stardockCount = Math.max(1, Math.floor(maxSectors / 500));
    const stardockSectors = new Set<number>();
    stardockSectors.add(5); // TerraSpace StarDock

    while (stardockSectors.size < stardockCount + 1) {
      const sectorNum = Math.floor(Math.random() * maxSectors) + 1;
      if (sectorNum > TERRASPACE_END && !portSectors.has(sectorNum)) {
        stardockSectors.add(sectorNum);
      }
    }

    let stardocksCreated = 0;
    for (const sectorNum of stardockSectors) {
      const sectorResult = await client.query(
        `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
        [universeId, sectorNum]
      );

      if (sectorResult.rows.length > 0) {
        const sectorId = sectorResult.rows[0].id;
        const stardockName = sectorNum === 5 ? 'StarDock TerraSpace' : `StarDock Alpha-${stardocksCreated}`;

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
    }

    await client.query('COMMIT');

    console.log(`✓ Generated ${sectors.length} sectors with ${portCount} ports and ${stardocksCreated} StarDocks`);

    return { success: true, sectorsGenerated: sectors.length, portsGenerated: portCount, stardocksCreated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const universeId = parseInt(process.argv[2] || '40', 10);

  generateSectorsForUniverse(universeId)
    .then((result) => {
      console.log('\n✓ Sector generation completed successfully!');
      console.log(`  Sectors: ${result.sectorsGenerated}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Sector generation failed:', error);
      process.exit(1);
    });
}

export { generateSectorsForUniverse };

