import express from 'express';
import { pool } from '../db/connection';

const router = express.Router();

/**
 * GET /api/leaderboard/:universeId
 * Get leaderboard for a specific universe
 * Supports multiple categories: networth, experience, kills, planets
 */
router.get('/:universeId', async (req, res) => {
  try {
    const { universeId } = req.params;
    const { category = 'networth', limit = 50 } = req.query;

    let query = '';
    let orderBy = '';

    switch (category) {
      case 'networth':
        query = `
          SELECT
            p.id,
            p.username,
            p.corp_name,
            p.ship_type,
            p.credits,
            COALESCE(ba_personal.balance, 0) as bank_balance,
            (
              p.credits +
              COALESCE(ba_personal.balance, 0) +
              (p.cargo_fuel * 10) +
              (p.cargo_organics * 5) +
              (p.cargo_equipment * 15) +
              (p.ship_fighters * 100) +
              (p.ship_shields * 50) +
              (SELECT COALESCE(SUM(pl.fuel * 10 + pl.organics * 5 + pl.equipment * 15 + pl.credits), 0)
               FROM planets pl WHERE pl.owner_id = p.id)
            ) as networth,
            p.experience,
            p.kills,
            p.deaths,
            (SELECT COUNT(*) FROM planets WHERE owner_id = p.id) as planet_count
          FROM players p
          LEFT JOIN bank_accounts ba_personal ON ba_personal.player_id = p.id AND ba_personal.account_type = 'personal'
          WHERE p.universe_id = $1 AND p.is_alive = true
        `;
        orderBy = 'ORDER BY networth DESC';
        break;

      case 'experience':
        query = `
          SELECT
            p.id,
            p.username,
            p.corp_name,
            p.ship_type,
            p.experience,
            p.credits,
            p.kills,
            p.deaths,
            (SELECT COUNT(*) FROM planets WHERE owner_id = p.id) as planet_count
          FROM players p
          WHERE p.universe_id = $1 AND p.is_alive = true
        `;
        orderBy = 'ORDER BY experience DESC';
        break;

      case 'kills':
        query = `
          SELECT
            p.id,
            p.username,
            p.corp_name,
            p.ship_type,
            p.kills,
            p.deaths,
            CASE WHEN p.deaths > 0 THEN ROUND(p.kills::numeric / p.deaths::numeric, 2) ELSE p.kills::numeric END as kd_ratio,
            p.experience,
            p.credits
          FROM players p
          WHERE p.universe_id = $1 AND p.is_alive = true AND p.kills > 0
        `;
        orderBy = 'ORDER BY kills DESC, kd_ratio DESC';
        break;

      case 'planets':
        query = `
          SELECT
            p.id,
            p.username,
            p.corp_name,
            p.ship_type,
            (SELECT COUNT(*) FROM planets WHERE owner_id = p.id) as planet_count,
            (SELECT SUM(colonists) FROM planets WHERE owner_id = p.id) as total_colonists,
            p.credits,
            p.experience
          FROM players p
          WHERE p.universe_id = $1 AND p.is_alive = true
          HAVING (SELECT COUNT(*) FROM planets WHERE owner_id = p.id) > 0
        `;
        orderBy = 'ORDER BY planet_count DESC, total_colonists DESC';
        break;

      default:
        return res.status(400).json({ error: 'Invalid category. Use: networth, experience, kills, or planets' });
    }

    const result = await pool.query(
      `${query} ${orderBy} LIMIT $2`,
      [universeId, limit]
    );

    res.json({
      category,
      leaderboard: result.rows.map((row, index) => ({
        rank: index + 1,
        ...row
      }))
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
