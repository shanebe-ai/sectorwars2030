import { Request, Response } from 'express';
import {
  seasonsAvailable,
  getActiveSeason,
  listSeasons,
  getSeason,
  getStandings,
  getHallOfFame,
  startSeason,
  extendSeason,
  endSeason,
  getLiveStandings,
} from '../services/seasonService';
import { listThemes } from '../services/seasonThemes';

const parseId = (value: any): number | null => {
  const n = parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * GET /api/seasons/universe/:universeId
 * Current season, all seasons and the Hall of Fame for a universe.
 */
export const getUniverseSeasons = async (req: Request, res: Response) => {
  try {
    const universeId = parseId(req.params.universeId);
    if (!universeId) {
      return res.status(400).json({ error: 'Invalid universe id' });
    }
    const available = await seasonsAvailable();
    if (!available) {
      return res.json({ available: false, current: null, seasons: [], hallOfFame: [], serverTime: new Date().toISOString() });
    }
    const [current, seasons, hallOfFame] = await Promise.all([
      getActiveSeason(universeId),
      listSeasons(universeId),
      getHallOfFame(universeId, 3),
    ]);
    // Running chapter scored on gains: the live This Season board and
    // the race for each title.
    const live = current ? await getLiveStandings(current, 10) : { gains: [], titleRaces: [] };
    res.json({ available: true, current, seasons, hallOfFame, live, serverTime: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error getting seasons:', error);
    res.status(500).json({ error: 'Failed to get seasons' });
  }
};

/**
 * GET /api/seasons/:seasonId/standings
 * Archived final standings of an ended season.
 */
export const getSeasonStandings = async (req: Request, res: Response) => {
  try {
    const seasonId = parseId(req.params.seasonId);
    if (!seasonId) {
      return res.status(400).json({ error: 'Invalid season id' });
    }
    const season = await getSeason(seasonId);
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }
    const standings = await getStandings(seasonId);
    res.json({ season, standings });
  } catch (error: any) {
    console.error('Error getting season standings:', error);
    res.status(500).json({ error: 'Failed to get season standings' });
  }
};

/**
 * GET /api/seasons/themes
 * Themes an admin can give a new season.
 */
export const getSeasonThemes = async (_req: Request, res: Response) => {
  res.json({ themes: listThemes() });
};

/**
 * POST /api/seasons/admin/start { universeId, durationDays, name?, theme? }
 */
export const adminStartSeason = async (req: Request, res: Response) => {
  try {
    const universeId = parseId(req.body?.universeId);
    const durationDays = Number(req.body?.durationDays);
    if (!universeId) {
      return res.status(400).json({ error: 'universeId is required' });
    }
    const result = await startSeason(universeId, durationDays, req.body?.name, req.body?.theme || null);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (error: any) {
    console.error('Error starting season:', error);
    res.status(500).json({ error: 'Failed to start season' });
  }
};

/**
 * POST /api/seasons/admin/:id/extend { days }
 */
export const adminExtendSeason = async (req: Request, res: Response) => {
  try {
    const seasonId = parseId(req.params.id);
    if (!seasonId) {
      return res.status(400).json({ error: 'Invalid season id' });
    }
    const result = await extendSeason(seasonId, Number(req.body?.days));
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (error: any) {
    console.error('Error extending season:', error);
    res.status(500).json({ error: 'Failed to extend season' });
  }
};

/**
 * POST /api/seasons/admin/:id/end
 * End a season now and archive its standings.
 */
export const adminEndSeason = async (req: Request, res: Response) => {
  try {
    const seasonId = parseId(req.params.id);
    if (!seasonId) {
      return res.status(400).json({ error: 'Invalid season id' });
    }
    const result = await endSeason(seasonId);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (error: any) {
    console.error('Error ending season:', error);
    res.status(500).json({ error: 'Failed to end season' });
  }
};
