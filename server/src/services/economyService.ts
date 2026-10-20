import { pool } from '../db/connection';
import { emitUniverseEvent } from '../index';
import { expireBounties } from './bountyService';

// Economy tick: restock ports, decay drift, and occasionally trigger
// scarcity or surplus events. Runs on an interval from the server entry point.

const DRIFT_DECAY_PER_TICK = 0.02; // drift moves this far toward zero each tick
const RESTOCK_FRACTION = 0.1; // ports recover this fraction of missing stock per tick
const EVENT_CHANCE = 0.02; // 2% chance per port per tick to trigger an event
const EVENT_DURATION_MINUTES = 45;

/**
 * Run one economy tick across all universes.
 */
export const runEconomyTick = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    // 1. Decay drift toward zero and restock port quantities
    await client.query(`
      UPDATE port_economy
      SET drift = CASE
          WHEN drift > 0 THEN GREATEST(0, drift - $1)
          WHEN drift < 0 THEN LEAST(0, drift + $1)
          ELSE 0
        END,
        volume_bought = 0,
        volume_sold = 0,
        last_restock = NOW(),
        updated_at = NOW()
      WHERE last_restock < NOW() - INTERVAL '5 minutes'
    `, [DRIFT_DECAY_PER_TICK]);

    // 2. Restock port quantities toward baseline (handled via port_fuel_qty etc.)
    // Ports recover a fraction of their deficit each tick.
    await client.query(`
      UPDATE sectors
      SET port_fuel_qty = port_fuel_qty + GREATEST(0, (1000 - port_fuel_qty) * $1::NUMERIC)::INTEGER,
          port_organics_qty = port_organics_qty + GREATEST(0, (1000 - port_organics_qty) * $1::NUMERIC)::INTEGER,
          port_equipment_qty = port_equipment_qty + GREATEST(0, (1000 - port_equipment_qty) * $1::NUMERIC)::INTEGER
      WHERE port_type IS NOT NULL
    `, [RESTOCK_FRACTION]);

    // 3. Expire finished events
    await client.query(`
      UPDATE port_economy
      SET event_state = 'none', event_ends_at = NULL, updated_at = NOW()
      WHERE event_state != 'none' AND event_ends_at < NOW()
    `);

    // 3b. Expire old bounties (escrow refunds to placer minus listing fee)
    try {
      const expiredCount = await expireBounties();
      if (expiredCount > 0) {
        console.log(`[Economy] Expired ${expiredCount} bounties`);
      }
    } catch (error) {
      console.error('[Economy] Bounty expiry error:', error);
    }

    // 4. Randomly trigger new scarcity or surplus events
    const candidates = await client.query(`
      SELECT universe_id, sector_number, commodity
      FROM port_economy
      WHERE event_state = 'none'
      ORDER BY RANDOM()
      LIMIT 50
    `);

    // Shared exclusion with anomalies: a sector never hosts an economy
    // event and an anomaly at once.
    const anomalySectors = new Set<string>();
    try {
      const anomalyRes = await client.query(
        `SELECT universe_id, sector_number FROM anomalies WHERE ends_at > NOW()`
      );
      for (const row of anomalyRes.rows) {
        anomalySectors.add(`${row.universe_id}:${row.sector_number}`);
      }
    } catch {
      // Anomalies table may not exist yet if migration 031 was not applied.
    }

    for (const row of candidates.rows) {
      if (Math.random() > EVENT_CHANCE) continue;

      // Skip Stardock sectors (sector 1 is the safe starting market)
      if (row.sector_number === 1) continue;

      // Skip sectors currently hosting an anomaly
      if (anomalySectors.has(`${row.universe_id}:${row.sector_number}`)) continue;

      const eventType = Math.random() < 0.5 ? 'scarcity' : 'surplus';
      await client.query(
        `UPDATE port_economy
         SET event_state = $1, event_ends_at = NOW() + ($2 || ' minutes')::INTERVAL, updated_at = NOW()
         WHERE universe_id = $3 AND sector_number = $4 AND commodity = $5`,
        [eventType, String(EVENT_DURATION_MINUTES), row.universe_id, row.sector_number, row.commodity]
      );

      // Announce the event to the universe
      try {
        emitUniverseEvent(row.universe_id, 'economy_event', {
          sectorNumber: row.sector_number,
          commodity: row.commodity,
          eventType,
          durationMinutes: EVENT_DURATION_MINUTES,
        });
      } catch {
        // Broadcast is best effort; the event still applies.
      }
    }
  } finally {
    client.release();
  }
};

/**
 * Start the economy tick on an interval. Follows the maintenanceService pattern.
 */
export const startEconomyTick = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log('[Economy] Starting economy tick every 5 minutes');

  runEconomyTick().catch((error) => {
    console.error('[Economy] Tick error:', error);
  });

  return setInterval(() => {
    runEconomyTick().catch((error) => {
      console.error('[Economy] Tick error:', error);
    });
  }, intervalMs);
};
