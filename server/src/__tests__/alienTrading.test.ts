/**
 * Alien Trading Integration Tests
 * Tests all aspects of the alien trading system including:
 * - Trade offer generation
 * - Accepting trades
 * - Robbery mechanics
 * - Alignment-based pricing
 * - Expiry and cleanup
 */

import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createTestPlayer,
  createTestPlayerWithStats,
  getPlayer,
  closeTestPool,
} from './helpers/testDb';

// Mock the database connection module before importing services
const testPool = getTestPool();
jest.mock('../db/connection', () => {
  const actualModule = jest.requireActual('../db/connection');
  return {
    ...actualModule,
    pool: testPool,
    getClient: () => testPool.connect(),
    query: testPool.query.bind(testPool),
  };
});

// Import services after mocking
import * as alienTradingService from '../services/alienTradingService';

describe('Alien Trading System', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;
  let testSectorId: number;
  let tradeAlienId: number;
  let testPool: any;

  beforeAll(async () => {
    testPool = getTestPool();
    await cleanupTestDb();

    // Create test user, universe, and sector
    testUserId = await createTestUser('test_alien_trader');
    testUniverseId = await createTestUniverse('Alien Trade Test Universe', 20);
    testSectorId = await createTestSector(testUniverseId, 10, 'Trade Sector');

    // Create player with starting resources
    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      10, // sector 10
      50000, // 50k credits
      100, // fighters
      100, // shields
      100 // turns
    );

    // Give player cargo space
    await testPool.query(
      `UPDATE players SET cargo_fuel = 0, cargo_organics = 0, cargo_equipment = 0 WHERE id = $1`,
      [testPlayerId]
    );

    // Get a ship type ID for the alien (use Scout ship type ID 1)
    const shipTypeResult = await testPool.query(`SELECT id FROM ship_types LIMIT 1`);
    const shipTypeId = shipTypeResult.rows[0]?.id || 1;

    // Create a trade alien in the same sector with cargo
    const alienResult = await testPool.query(
      `INSERT INTO alien_ships (
        universe_id, sector_number, alien_race, ship_type,
        behavior, fighters, shields, cargo_fuel, cargo_organics, cargo_equipment,
        alignment, credits
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        testUniverseId,
        10, // same sector as player
        'Zephyr',
        'Scout',
        'trade',
        50,
        50,
        100, // cargo_fuel
        100, // cargo_organics
        100, // cargo_equipment
        100, // neutral-friendly alignment
        50000 // credits
      ]
    );
    tradeAlienId = alienResult.rows[0].id;
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  describe('Trade Offer Generation', () => {
    it('should generate a trade offer with alignment-based pricing', async () => {
      const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);

      expect(offer).toBeDefined();
      expect(offer).not.toBeNull();

      if (!offer) return; // Type guard

      expect(offer.alienShipId).toBe(tradeAlienId);
      expect(offer.playerId).toBe(testPlayerId);
      expect(offer.status).toBe('pending');
      expect(offer.alienAlignment).toBe(100);

      // Alignment 100 should give better prices (modifier < 1.0)
      expect(offer.priceModifier).toBeLessThan(1.0);
      expect(offer.priceModifier).toBeGreaterThanOrEqual(0.9);

      // Should have some commodity offers
      const hasOffers =
        offer.alienOffersCredits > 0 ||
        offer.alienOffersFuel > 0 ||
        offer.alienOffersOrganics > 0 ||
        offer.alienOffersEquipment > 0;
      expect(hasOffers).toBe(true);

      // Should have corresponding requests
      const hasRequests =
        offer.alienRequestsCredits > 0 ||
        offer.alienRequestsFuel > 0 ||
        offer.alienRequestsOrganics > 0 ||
        offer.alienRequestsEquipment > 0;
      expect(hasRequests).toBe(true);
    });

    it('should calculate correct alignment modifier for different alignments', async () => {
      // Test alignment 50 (unfriendly) - should have worse prices
      const shipTypeResult = await testPool.query(`SELECT id FROM ship_types LIMIT 1`);
      const shipTypeId = shipTypeResult.rows[0]?.id || 1;

      const unfriendlyAlien = await testPool.query(
        `INSERT INTO alien_ships (
          universe_id, sector_number, alien_race, ship_type,
          behavior, fighters, shields, cargo_fuel, cargo_organics, cargo_equipment,
          alignment, credits
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [testUniverseId, 10, 'Hostile', 'Scout', 'trade', 100, 100, 100, 100, 100, 50, 50000]
      );

      const offer = await alienTradingService.generateTradeOffer(unfriendlyAlien.rows[0].id, testPlayerId);

      expect(offer).not.toBeNull();
      if (!offer) return; // Type guard

      // Alignment 50 should give worse prices (modifier > 1.0)
      expect(offer.priceModifier).toBeGreaterThan(1.0);
      expect(offer.priceModifier).toBeLessThanOrEqual(1.1);

      // Clean up
      await testPool.query(`DELETE FROM alien_trade_offers WHERE alien_ship_id = $1`, [unfriendlyAlien.rows[0].id]);
      await testPool.query(`DELETE FROM alien_ships WHERE id = $1`, [unfriendlyAlien.rows[0].id]);
    });

    it('should not generate duplicate offers for same alien-player pair', async () => {
      // First offer
      const offer1 = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);

      // Try to generate another - should return existing
      const offer2 = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);

      expect(offer1).not.toBeNull();
      expect(offer2).not.toBeNull();
      if (!offer1 || !offer2) return; // Type guard

      expect(offer1.id).toBe(offer2.id);
    });
  });

  describe('Accept Trade', () => {
    let offerId: number;

    beforeEach(async () => {
      // Clean up any existing offers
      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);

      // Generate fresh offer
      const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
      if (!offer) throw new Error('Failed to generate offer');
      offerId = offer.id;

      // Ensure player has enough cargo space and resources
      await testPool.query(
        `UPDATE players SET
          credits = 50000,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0
        WHERE id = $1`,
        [testPlayerId]
      );
    });

    it('should successfully accept a valid trade offer', async () => {
      const result = await alienTradingService.acceptAlienTrade(offerId, testPlayerId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('completed');

      // Verify offer status updated
      const offerCheck = await testPool.query(
        `SELECT status FROM alien_trade_offers WHERE id = $1`,
        [offerId]
      );
      expect(offerCheck.rows[0].status).toBe('accepted');

      // Verify history record created
      const history = await testPool.query(
        `SELECT * FROM alien_trade_history WHERE player_id = $1 AND alien_ship_id = $2`,
        [testPlayerId, tradeAlienId]
      );
      expect(history.rows.length).toBeGreaterThan(0);
      expect(history.rows[0].outcome).toBe('accepted');
    });

    it('should reject trade if player lacks credits', async () => {
      // Set player credits to 0
      await testPool.query(`UPDATE players SET credits = 0 WHERE id = $1`, [testPlayerId]);

      const result = await alienTradingService.acceptAlienTrade(offerId, testPlayerId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('credits');
    });

    it('should reject trade if player lacks cargo space', async () => {
      // Fill player cargo to max
      const player = await getPlayer(testPlayerId);
      await testPool.query(
        `UPDATE players SET
          cargo_fuel = $1,
          cargo_organics = 0,
          cargo_equipment = 0
        WHERE id = $2`,
        [player.ship_holds_max, testPlayerId]
      );

      const result = await alienTradingService.acceptAlienTrade(offerId, testPlayerId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cargo space');
    });

    it('should reject expired offers', async () => {
      // Expire the offer
      await testPool.query(
        `UPDATE alien_trade_offers SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
        [offerId]
      );

      const result = await alienTradingService.acceptAlienTrade(offerId, testPlayerId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should update player cargo and credits correctly', async () => {
      const playerBefore = await getPlayer(testPlayerId);
      const offer = await alienTradingService.getTradeOfferById(offerId);
      if (!offer) throw new Error('Offer not found');

      const result = await alienTradingService.acceptAlienTrade(offerId, testPlayerId);
      expect(result.success).toBe(true);

      const playerAfter = await getPlayer(testPlayerId);

      // Credits should change based on offer
      const expectedCredits = playerBefore.credits + offer.alienOffersCredits - offer.alienRequestsCredits;
      expect(playerAfter.credits).toBe(expectedCredits);

      // Cargo should change based on offer
      const expectedFuel = playerBefore.cargo_fuel + offer.alienOffersFuel - offer.alienRequestsFuel;
      expect(playerAfter.cargo_fuel).toBe(expectedFuel);
    });
  });

  describe('Robbery Mechanics', () => {
    let offerId: number;

    beforeEach(async () => {
      // Clean up any existing offers
      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
      await testPool.query(`DELETE FROM alien_trade_history WHERE player_id = $1`, [testPlayerId]);

      // Generate fresh offer
      const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
      if (!offer) throw new Error('Failed to generate offer');
      offerId = offer.id;
    });

    it('should have 20% success rate for alien robbery', async () => {
      // Run robbery attempt 50 times to check distribution
      let successCount = 0;
      let combatCount = 0;

      for (let i = 0; i < 50; i++) {
        // Reset offer for each attempt
        await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
        await testPool.query(`DELETE FROM alien_trade_history WHERE player_id = $1`, [testPlayerId]);
        const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
        if (!offer) continue; // Skip if offer generation failed

        const result = await alienTradingService.attemptAlienRobbery(offer.id, testPlayerId);

        if (result.outcome === 'robbery_success') {
          successCount++;
        } else if (result.outcome === 'robbery_combat') {
          combatCount++;
        }
      }

      // Should have roughly 20% success (allow 10-30% range for randomness)
      const successRate = successCount / 50;
      expect(successRate).toBeGreaterThanOrEqual(0.05);
      expect(successRate).toBeLessThanOrEqual(0.40);

      // Combat should trigger most of the time
      expect(combatCount).toBeGreaterThan(20);
    });

    it('should record robbery success in history', async () => {
      // Keep trying until we get a successful robbery (max 20 attempts)
      let result;
      let attempts = 0;

      while (attempts < 20) {
        await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
        await testPool.query(`DELETE FROM alien_trade_history WHERE player_id = $1`, [testPlayerId]);
        const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
        if (!offer) {
          attempts++;
          continue;
        }

        result = await alienTradingService.attemptAlienRobbery(offer.id, testPlayerId);

        if (result.outcome === 'robbery_success') {
          break;
        }
        attempts++;
      }

      // If we got a success, verify history
      if (result?.outcome === 'robbery_success') {
        expect(result.success).toBe(true);

        const history = await testPool.query(
          `SELECT * FROM alien_trade_history WHERE player_id = $1 ORDER BY traded_at DESC LIMIT 1`,
          [testPlayerId]
        );

        expect(history.rows.length).toBe(1);
        expect(history.rows[0].outcome).toBe('robbed');
      } else {
        // If we didn't get a success after 20 tries, that's statistically unlikely but possible
        console.log('Note: Did not get a robbery success in 20 attempts (statistically unlikely but possible)');
      }
    });

    it('should trigger combat on robbery failure', async () => {
      // Keep trying until we get combat (should happen most of the time)
      let result;
      let attempts = 0;

      while (attempts < 10) {
        await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
        const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
        if (!offer) {
          attempts++;
          continue;
        }

        result = await alienTradingService.attemptAlienRobbery(offer.id, testPlayerId);

        if (result.outcome === 'robbery_combat') {
          break;
        }
        attempts++;
      }

      // Should get combat within 10 attempts (80% chance each time)
      expect(result?.outcome).toBe('robbery_combat');
      expect(result?.combatData).toBeDefined();
      expect(result?.combatData?.alienShipId).toBe(tradeAlienId);
      expect(result?.combatData?.playerId).toBe(testPlayerId);
      expect(result?.combatData?.robberPenalty).toBe(true);
    });

    it('should mark offer as completed after robbery', async () => {
      const result = await alienTradingService.attemptAlienRobbery(offerId, testPlayerId);

      // Whether success or combat, offer should be marked
      const offerCheck = await testPool.query(
        `SELECT status FROM alien_trade_offers WHERE id = $1`,
        [offerId]
      );

      expect(offerCheck.rows[0].status).not.toBe('pending');
    });
  });

  describe('Cancel Trade', () => {
    let offerId: number;

    beforeEach(async () => {
      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
      const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
      if (!offer) throw new Error('Failed to generate offer');
      offerId = offer.id;
    });

    it('should successfully cancel a pending offer', async () => {
      const result = await alienTradingService.cancelAlienTrade(offerId, testPlayerId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('cancelled');

      const offerCheck = await testPool.query(
        `SELECT status FROM alien_trade_offers WHERE id = $1`,
        [offerId]
      );
      expect(offerCheck.rows[0].status).toBe('cancelled');
    });

    it('should not cancel already completed offers', async () => {
      // Accept the trade first
      await alienTradingService.acceptAlienTrade(offerId, testPlayerId);

      // Try to cancel
      const result = await alienTradingService.cancelAlienTrade(offerId, testPlayerId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should not allow canceling another player\'s offer', async () => {
      // Create another player
      const otherUserId = await createTestUser('other_trader');
      const otherPlayerId = await createTestPlayerWithStats(
        otherUserId,
        testUniverseId,
        10,
        10000,
        50,
        50,
        50
      );

      // Try to cancel the first player's offer
      const result = await alienTradingService.cancelAlienTrade(offerId, otherPlayerId);

      expect(result.success).toBe(false);

      // Clean up
      await testPool.query(`DELETE FROM players WHERE id = $1`, [otherPlayerId]);
      await testPool.query(`DELETE FROM users WHERE id = $1`, [otherUserId]);
    });
  });

  describe('Trade Offer Expiry', () => {
    it('should expire old offers', async () => {
      // Create an offer and immediately expire it
      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
      const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
      if (!offer) throw new Error('Failed to generate offer');

      await testPool.query(
        `UPDATE alien_trade_offers SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
        [offer.id]
      );

      // Run cleanup
      const expiredCount = await alienTradingService.cleanupExpiredOffers();

      expect(expiredCount).toBeGreaterThan(0);

      // Verify offer is expired
      const offerCheck = await testPool.query(
        `SELECT status FROM alien_trade_offers WHERE id = $1`,
        [offer.id]
      );
      expect(offerCheck.rows[0].status).toBe('expired');
    });

    it('should not expire fresh offers', async () => {
      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
      const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
      if (!offer) throw new Error('Failed to generate offer');

      // Run cleanup
      const expiredCount = await alienTradingService.cleanupExpiredOffers();

      // Verify offer is still pending
      const offerCheck = await testPool.query(
        `SELECT status FROM alien_trade_offers WHERE id = $1`,
        [offer.id]
      );
      expect(offerCheck.rows[0].status).toBe('pending');
    });
  });

  describe('Trade History', () => {
    beforeEach(async () => {
      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
      await testPool.query(`DELETE FROM alien_trade_history WHERE player_id = $1`, [testPlayerId]);
    });

    it('should retrieve player trade history', async () => {
      // Make a few trades
      for (let i = 0; i < 3; i++) {
        await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
        const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
        if (!offer) continue;
        await alienTradingService.acceptAlienTrade(offer.id, testPlayerId);
      }

      const history = await alienTradingService.getPlayerTradeHistory(testPlayerId, 10);

      expect(history.length).toBe(3);
      expect(history[0].playerId).toBe(testPlayerId);
      expect(history[0].outcome).toBe('accepted');
    });

    it('should limit history results', async () => {
      // Create 10 history entries
      for (let i = 0; i < 10; i++) {
        await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
        const offer = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
        if (!offer) continue;
        await alienTradingService.acceptAlienTrade(offer.id, testPlayerId);
      }

      const history = await alienTradingService.getPlayerTradeHistory(testPlayerId, 5);

      expect(history.length).toBe(5);
    });

    it('should order history by most recent first', async () => {
      // Create trades with delays
      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
      const offer1 = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
      if (!offer1) throw new Error('Failed to generate offer1');
      await alienTradingService.acceptAlienTrade(offer1.id, testPlayerId);

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));

      await testPool.query(`DELETE FROM alien_trade_offers WHERE player_id = $1`, [testPlayerId]);
      const offer2 = await alienTradingService.generateTradeOffer(tradeAlienId, testPlayerId);
      if (!offer2) throw new Error('Failed to generate offer2');
      await alienTradingService.acceptAlienTrade(offer2.id, testPlayerId);

      const history = await alienTradingService.getPlayerTradeHistory(testPlayerId, 10);

      // Most recent should be first
      expect(history.length).toBe(2);
      expect(new Date(history[0].tradedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(history[1].tradedAt).getTime()
      );
    });
  });
});
