import { Request, Response } from 'express';
import {
  getPlayerStatus,
  getMarketBoard,
  getAuctionsAtSector,
  tradeContraband,
  buyAuction,
  getSectorStashInfo,
  stashCargo,
  retrieveStash,
  ContrabandCommodity,
} from '../services/smugglingService';
import { boardDerelict, BoardAction } from '../services/derelictService';
import { query } from '../db/connection';

const badRequest = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Request failed';
  return res.status(400).json({ error: message });
};

// All smuggling endpoints require authentication (router level).

export const status = async (req: Request, res: Response) => {
  try {
    const data = await getPlayerStatus(req.user!.userId);
    return res.json(data);
  } catch (error) {
    return badRequest(res, error);
  }
};

export const marketBoard = async (req: Request, res: Response) => {
  try {
    const board = await getMarketBoard(req.user!.userId);
    return res.json({ markets: board });
  } catch (error) {
    return badRequest(res, error);
  }
};

export const auctions = async (req: Request, res: Response) => {
  try {
    const playerResult = await query(
      'SELECT universe_id, current_sector FROM players WHERE user_id = $1',
      [req.user!.userId]
    );
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const player = playerResult.rows[0];
    const lots = await getAuctionsAtSector(player.universe_id, player.current_sector);
    return res.json({ sectorNumber: player.current_sector, auctions: lots });
  } catch (error) {
    return badRequest(res, error);
  }
};

export const trade = async (req: Request, res: Response) => {
  try {
    const { commodity, action, quantity, confirm } = req.body || {};
    if (action !== 'buy' && action !== 'sell') {
      return res.status(400).json({ error: "action must be 'buy' or 'sell'" });
    }
    const result = await tradeContraband(
      req.user!.userId,
      commodity as ContrabandCommodity,
      action,
      Number(quantity),
      confirm === true
    );
    return res.json(result);
  } catch (error) {
    return badRequest(res, error);
  }
};

export const buyAuctionLot = async (req: Request, res: Response) => {
  try {
    const { auctionId, quantity, confirm } = req.body || {};
    const result = await buyAuction(
      req.user!.userId,
      Number(auctionId),
      Number(quantity),
      confirm === true
    );
    return res.json(result);
  } catch (error) {
    return badRequest(res, error);
  }
};

export const stashInfo = async (req: Request, res: Response) => {
  try {
    const data = await getSectorStashInfo(req.user!.userId);
    return res.json(data);
  } catch (error) {
    return badRequest(res, error);
  }
};

export const stash = async (req: Request, res: Response) => {
  try {
    const { derelictId, commodity, quantity } = req.body || {};
    const playerResult = await query('SELECT id FROM players WHERE user_id = $1', [req.user!.userId]);
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const result = await stashCargo(
      playerResult.rows[0].id,
      Number(derelictId),
      commodity as ContrabandCommodity,
      Number(quantity)
    );
    if (!result.success) return res.status(400).json({ error: result.message });
    return res.json(result);
  } catch (error) {
    return badRequest(res, error);
  }
};

export const retrieve = async (req: Request, res: Response) => {
  try {
    const { stashId } = req.body || {};
    const playerResult = await query('SELECT id FROM players WHERE user_id = $1', [req.user!.userId]);
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const result = await retrieveStash(playerResult.rows[0].id, Number(stashId));
    if (!result.success) return res.status(400).json({ error: result.message });
    return res.json(result);
  } catch (error) {
    return badRequest(res, error);
  }
};

// Boarding existed as a service with no route; the stash loop needs
// players to be able to clear (claim) a derelict, so it gets one here.
// The service boards the derelict in the player's current sector.
export const board = async (req: Request, res: Response) => {
  try {
    const { action } = req.body || {};
    const boardAction: BoardAction =
      action === 'claim_sell' || action === 'claim_swap' ? action : 'loot';
    const playerResult = await query('SELECT id FROM players WHERE user_id = $1', [req.user!.userId]);
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const result = await boardDerelict(playerResult.rows[0].id, boardAction);
    if (!result.success) return res.status(400).json({ error: result.message });
    return res.json(result);
  } catch (error) {
    return badRequest(res, error);
  }
};
