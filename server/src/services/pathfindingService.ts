import { pool } from '../db/connection';

interface PathNode {
  sector: number;
  previous: number | null;
  distance: number;
}

/**
 * Find shortest path between two sectors using BFS
 * Returns array of sector numbers from start to end
 */
export async function findPath(
  startSector: number,
  endSector: number,
  universeId: number
): Promise<number[] | null> {
  // If start equals end, return single sector path
  if (startSector === endSector) {
    return [startSector];
  }

  // Fetch all warps for the universe from sector_warps table
  const warpsResult = await pool.query(
    `SELECT s.sector_number as from_sector, sw.destination_sector_number as to_sector, sw.is_two_way
     FROM sector_warps sw
     JOIN sectors s ON s.id = sw.sector_id
     WHERE s.universe_id = $1`,
    [universeId]
  );

  // Build adjacency map
  const adjacencyMap = new Map<number, number[]>();
  for (const row of warpsResult.rows) {
    const from = row.from_sector;
    const to = row.to_sector;
    const isTwoWay = row.is_two_way;

    // Add forward connection
    if (!adjacencyMap.has(from)) {
      adjacencyMap.set(from, []);
    }
    adjacencyMap.get(from)!.push(to);

    // Add reverse connection if bidirectional
    if (isTwoWay) {
      if (!adjacencyMap.has(to)) {
        adjacencyMap.set(to, []);
      }
      adjacencyMap.get(to)!.push(from);
    }
  }

  // BFS to find shortest path
  const queue: PathNode[] = [{ sector: startSector, previous: null, distance: 0 }];
  const visited = new Set<number>();
  const cameFrom = new Map<number, number>();

  visited.add(startSector);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Found the destination
    if (current.sector === endSector) {
      // Reconstruct path
      const path: number[] = [];
      let step = endSector;

      while (step !== null) {
        path.unshift(step);
        step = cameFrom.get(step) || null!;
      }

      return path;
    }

    // Explore neighbors
    const neighbors = adjacencyMap.get(current.sector) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        cameFrom.set(neighbor, current.sector);
        queue.push({
          sector: neighbor,
          previous: current.sector,
          distance: current.distance + 1
        });
      }
    }
  }

  // No path found
  return null;
}

/**
 * Get sector details for path display
 */
export async function getPathDetails(
  path: number[],
  universeId: number,
  playerId: number
) {
  if (path.length === 0) return [];

  // Get sector information
  const sectorsResult = await pool.query(
    `SELECT
      s.sector_number,
      s.name,
      s.port_type,
      s.has_planet,
      p.name as planet_name,
      (SELECT COUNT(*) FROM players WHERE current_sector = s.sector_number AND universe_id = $1 AND id != $3) as other_players
    FROM sectors s
    LEFT JOIN planets p ON p.sector_id = s.id
    WHERE s.universe_id = $1 AND s.sector_number = ANY($2)
    ORDER BY array_position($2, s.sector_number)`,
    [universeId, path, playerId]
  );

  // Get visited sectors from ship log
  const visitedResult = await pool.query(
    `SELECT DISTINCT sector_number
     FROM ship_logs
     WHERE player_id = $1 AND sector_number = ANY($2)`,
    [playerId, path]
  );

  const visitedSectors = new Set(visitedResult.rows.map(r => r.sector_number));

  return sectorsResult.rows.map(row => ({
    sectorNumber: row.sector_number,
    name: row.name,
    portType: row.port_type,
    hasPort: !!row.port_type,
    hasStardock: row.port_type === 'STARDOCK',
    hasPlanet: row.has_planet,
    planetName: row.planet_name,
    hasShips: parseInt(row.other_players) > 0,
    otherPlayers: parseInt(row.other_players) || 0,
    visited: visitedSectors.has(row.sector_number),
    hasPointOfInterest: !!(row.port_type || row.has_planet || parseInt(row.other_players) > 0)
  }));
}
