import { pool, query } from '../db/connection';
import { broadcastTNN } from './broadcastService';

// Anomaly tick: dissipate expired anomalies, degrade fighters and mines
// caught in radiation pockets, and occasionally form new anomalies.
// Runs on an interval from the server entry point, following the
// startEconomyTick pattern.

const ANOMALY_FORM_CHANCE = 0.08; // 8% chance per universe per tick
const RADIATION_DECAY_FRACTION = 0.1; // 10% of deployed fighters and mines per tick

export type AnomalyType = 'ion' | 'gravity' | 'radiation' | 'nebula';

export interface Anomaly {
  id: number;
  universe_id: number;
  sector_number: number;
  type: AnomalyType;
  ends_at: string;
}

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const ANOMALY_TYPES: AnomalyType[] = ['ion', 'gravity', 'radiation', 'nebula'];

/**
 * Get the active anomaly in a sector, if any. Returns null when the
 * anomalies table does not exist yet (migration not applied).
 */
export const getAnomalyInSector = async (
  universeId: number,
  sectorNumber: number
): Promise<Anomaly | null> => {
  try {
    const result = await query(
      `SELECT * FROM anomalies
       WHERE universe_id = $1 AND sector_number = $2 AND ends_at > NOW()
       LIMIT 1`,
      [universeId, sectorNumber]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
};

/**
 * Form a single anomaly in a universe. Excludes TerraSpace, sectors with a
 * derelict being boarded, sectors already hosting an anomaly, and sectors
 * with an active living economy event (shared exclusion list).
 */
const formAnomaly = async (client: any, universeId: number): Promise<void> => {
  const sectorRes = await client.query(
    `SELECT s.sector_number FROM sectors s
     WHERE s.universe_id = $1
       AND s.sector_number > 10
       AND s.sector_number NOT IN (
         SELECT sector_number FROM anomalies
         WHERE universe_id = $1 AND ends_at > NOW()
       )
       AND s.sector_number NOT IN (
         SELECT sector_number FROM derelicts
         WHERE universe_id = $1 AND state = 'boarded'
       )
       AND NOT EXISTS (
         SELECT 1 FROM port_economy pe
         WHERE pe.universe_id = $1
           AND pe.sector_number = s.sector_number
           AND pe.event_state != 'none'
           AND pe.event_ends_at > NOW()
       )
     ORDER BY RANDOM() LIMIT 1`,
    [universeId]
  );
  if (sectorRes.rows.length === 0) return;

  const sectorNumber: number = sectorRes.rows[0].sector_number;
  const type = ANOMALY_TYPES[randInt(0, ANOMALY_TYPES.length - 1)];
  const lifetimeHours = randInt(1, 3);

  await client.query(
    `INSERT INTO anomalies (universe_id, sector_number, type, ends_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::INTERVAL)
     ON CONFLICT (universe_id, sector_number) DO NOTHING`,
    [universeId, sectorNumber, type, String(lifetimeHours)]
  );

  // Announce when the anomaly forms in a trafficked region.
  try {
    const trafficRes = await client.query(
      `SELECT COUNT(*) AS count FROM players
       WHERE universe_id = $1 AND current_sector = $2 AND is_alive = true`,
      [universeId, sectorNumber]
    );
    if (parseInt(trafficRes.rows[0].count, 10) > 0) {
      const labels: Record<AnomalyType, string> = {
        ion: 'ion storm',
        gravity: 'gravity well',
        radiation: 'radiation pocket',
        nebula: 'nebula shroud',
      };
      await broadcastTNN(
        universeId,
        'Anomaly Forming',
        `Navigators take note: an ${labels[type]} is forming in Sector ${sectorNumber}. Plan your routes accordingly.`
      );
    }
  } catch {
    // Broadcast is best effort; the anomaly still forms.
  }
};

/**
 * Run one anomaly tick across all universes.
 */
export const runAnomalyTick = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    // 1. Dissipate expired anomalies
    await client.query(`DELETE FROM anomalies WHERE ends_at < NOW()`);

    // 2. Radiation pockets degrade deployed fighters and mines over time
    await client.query(
      `UPDATE sector_fighters sf
       SET fighter_count = GREATEST(0, fighter_count - CEIL(fighter_count * $1::NUMERIC)::INTEGER)
       FROM anomalies a
       WHERE a.universe_id = sf.universe_id
         AND a.sector_number = sf.sector_number
         AND a.type = 'radiation'
         AND a.ends_at > NOW()`,
      [RADIATION_DECAY_FRACTION]
    );
    await client.query(
      `UPDATE sector_mines sm
       SET mine_count = GREATEST(0, mine_count - CEIL(mine_count * $1::NUMERIC)::INTEGER)
       FROM anomalies a
       WHERE a.universe_id = sm.universe_id
         AND a.sector_number = sm.sector_number
         AND a.type = 'radiation'
         AND a.ends_at > NOW()`,
      [RADIATION_DECAY_FRACTION]
    );

    // 3. Maybe form a new anomaly per universe
    const universes = await client.query(`SELECT id FROM universes`);
    for (const universe of universes.rows) {
      if (Math.random() > ANOMALY_FORM_CHANCE) continue;
      try {
        await formAnomaly(client, universe.id);
      } catch (error) {
        console.error('[Anomaly] Formation error:', error);
      }
    }
  } finally {
    client.release();
  }
};

/**
 * Start the anomaly tick on an interval. Follows the maintenanceService pattern.
 */
export const startAnomalyTick = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log('[Anomaly] Starting anomaly tick every 5 minutes');

  runAnomalyTick().catch((error) => {
    console.error('[Anomaly] Tick error:', error);
  });

  return setInterval(() => {
    runAnomalyTick().catch((error) => {
      console.error('[Anomaly] Tick error:', error);
    });
  }, intervalMs);
};
