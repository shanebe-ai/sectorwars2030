import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import {
  getUniverseSeasons,
  getSeasonStandings,
  adminStartSeason,
  adminExtendSeason,
  adminEndSeason,
  getSeasonThemes,
} from '../controllers/seasonController';

const router = Router();

// Public: season themes (Pirate Season, ...)
router.get('/themes', getSeasonThemes);

// Public, like the leaderboard: current season, history, Hall of Fame
router.get('/universe/:universeId', getUniverseSeasons);

// Public: archived final standings of a season
router.get('/:seasonId/standings', getSeasonStandings);

// Admin: start a season { universeId, durationDays, name?, theme? }
router.post('/admin/start', authenticateToken, requireAdmin, adminStartSeason);

// Admin: extend the running season { days }
router.post('/admin/:id/extend', authenticateToken, requireAdmin, adminExtendSeason);

// Admin: end a season now (archives standings, touches no player data)
router.post('/admin/:id/end', authenticateToken, requireAdmin, adminEndSeason);

export default router;
