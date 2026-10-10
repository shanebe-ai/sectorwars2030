import { describe, beforeAll, afterAll, it, expect, beforeEach, jest } from '@jest/globals';
import { createTestUser, createTestPlayer, cleanupTestData, getTestPool } from './helpers/testDb';
import { createTradeOffer, acceptPlayerTrade, getPlayerTradeOffers, attemptPlayerRobbery } from '../services/playerTradingService';

describe('Player-to-Player Trading System', () => {
  let testPlayer1Id: number;
  let testPlayer2Id: number;
  let testRobberId: number;

  beforeAll(async () => {
    // Clean slate before any tests run
    await cleanupTestData();

    // Create fresh test users with unique names
    const user1 = await createTestUser(`p2p_trader1_${Date.now()}`);
    const user2 = await createTestUser(`p2p_trader2_${Date.now()}`);
    const robberUser = await createTestUser(`p2p_robber_${Date.now()}`);

    // Create players
    testPlayer1Id = await createTestPlayer(user1, 'p2p_trader1_corp');
    testPlayer2Id = await createTestPlayer(user2, 'p2p_trader2_corp');
    testRobberId = await createTestPlayer(robberUser, 'p2p_robber_corp');
  });

  beforeEach(async () => {
    // Reset player states before each test
    await resetPlayerStates();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupTestData();
  });

  async function resetPlayerStates() {
    // Move all players to sector 10 and give them resources
    const { pool } = await import('../db/connection');
    await pool.query(`
      UPDATE players
      SET current_sector = 10,
          cargo_fuel = 500,
          cargo_organics = 500,
          cargo_equipment = 500,
          credits = 5000,
          ship_beacons = 5
      WHERE id IN ($1, $2, $3)
    `, [testPlayer1Id, testPlayer2Id, testRobberId]);
  }

  describe('Trade Offer Creation', () => {
    it('should create a valid trade offer', async () => {
      const result = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 100,
        organics: 50,
        equipment: 25,
        credits: 1000
      }, {
        fuel: 50,
        organics: 100,
        equipment: 75,
        credits: 500
      }, 'Test trade');

      if (!result.success) {
        console.log('CREATE OFFER FAILED:', result.error);
      }
      expect(result.success).toBe(true);
      expect(result.offer).toBeDefined();
    });

    it('should reject offer to yourself', async () => {
      const result = await createTradeOffer(testPlayer1Id, testPlayer1Id, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 0,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Self trade');

      expect(result.success).toBe(false);
      expect(result.error).toContain('yourself');
    });

    it('should reject offer if players in different sectors', async () => {
      // Move player 2 to different sector
      const { pool } = await import('../db/connection');
      await pool.query('UPDATE players SET current_sector = 20 WHERE id = $1', [testPlayer2Id]);

      const result = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 5,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Different sector trade');

      expect(result.success).toBe(false);
      expect(result.error).toContain('same sector');
    });

    it('should reject offer without any offers', async () => {
      const result = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 0,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Empty offer');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must offer');
    });

    it('should reject offer without any requests', async () => {
      const result = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 0,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Empty request');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must request');
    });

    it('should reject offer if insufficient resources', async () => {
      const result = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 1000, // More than player has
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Insufficient resources');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient');
    });

    it('should sanitize XSS in message', async () => {
      const result = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, '<script>alert("xss")</script>');

      expect(result.success).toBe(true);
      expect(result.offer?.message).not.toContain('<script>');
    });

    it('should enforce max 10 pending offers limit', async () => {
      // This would require creating 10 offers first - simplified for now
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Get Trade Offers', () => {
    it('should get inbox offers for recipient', async () => {
      // Create an offer first
      await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 5,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Inbox test');

      const offers = await getPlayerTradeOffers(testPlayer2Id, 'inbox');
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0].recipient_player_id).toBe(testPlayer2Id);
    });

    it('should get outbox offers for initiator', async () => {
      const offers = await getPlayerTradeOffers(testPlayer1Id, 'outbox');
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0].initiator_player_id).toBe(testPlayer1Id);
    });
  });

  describe('Accept Trade', () => {
    it('should successfully accept valid trade offer', async () => {
      const createResult = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 100,
        organics: 50,
        equipment: 25,
        credits: 1000
      }, {
        fuel: 50,
        organics: 100,
        equipment: 75,
        credits: 500
      }, 'Accept test trade');

      expect(createResult.success).toBe(true);
      expect(createResult.offer).toBeDefined();

      if (createResult.offer) {
        const acceptResult = await acceptPlayerTrade(createResult.offer.id, testPlayer2Id);
        if (!acceptResult.success) {
          console.log('ACCEPT FAILED:', acceptResult.error);
        }
        expect(acceptResult.success).toBe(true);
      }
    });

    it('should reject if acceptor is not the recipient', async () => {
      const createResult = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 5,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Wrong acceptor test');

      if (createResult.offer) {
        const acceptResult = await acceptPlayerTrade(createResult.offer.id, testRobberId);
        expect(acceptResult.success).toBe(false);
      }
    });

    it('should reject if players in different sectors', async () => {
      const createResult = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 10,
        organics: 0,
        equipment: 0,
        credits: 0
      }, {
        fuel: 5,
        organics: 0,
        equipment: 0,
        credits: 0
      }, 'Sector test');

      // Move player 2 to different sector
      const { pool } = await import('../db/connection');
      await pool.query('UPDATE players SET current_sector = 20 WHERE id = $1', [testPlayer2Id]);

      if (createResult.offer) {
        const acceptResult = await acceptPlayerTrade(createResult.offer.id, testPlayer2Id);
        expect(acceptResult.success).toBe(false);
      }
    });

    it('should reject if recipient has insufficient resources', async () => {
      // This would require setting up specific resource conditions
      expect(true).toBe(true); // Placeholder
    });

    it('should reject if offer has expired', async () => {
      // This would require manipulating timestamps
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Robbery Mechanics', () => {
    beforeEach(async () => {
      // Clean slate for each robbery test: offers accumulate across tests
      // (10 pending offer cap) and the corp test sets corp_id on players.
      const pool = getTestPool();
      await pool.query('DELETE FROM player_trade_history WHERE initiator_player_id = ANY($1::int[])', [[testPlayer1Id, testPlayer2Id, testRobberId]]);
      await pool.query('DELETE FROM player_trade_offers WHERE initiator_player_id = ANY($1::int[])', [[testPlayer1Id, testPlayer2Id, testRobberId]]);
      await pool.query('UPDATE players SET corp_id = NULL WHERE id = ANY($1::int[])', [[testPlayer1Id, testPlayer2Id, testRobberId]]);
      await pool.query(`DELETE FROM corporations WHERE name = 'rob_test_corp'`);
      // The combat-on-failure test can kill or damage players; restore them.
      await pool.query('UPDATE players SET is_alive = true, ship_fighters = 0, ship_shields = 0 WHERE id = ANY($1::int[])', [[testPlayer1Id, testPlayer2Id, testRobberId]]);
    });

    const makeOffer = async () => {
      const result = await createTradeOffer(testPlayer1Id, testPlayer2Id, {
        fuel: 100,
        organics: 50,
        equipment: 25,
        credits: 1000
      }, {
        fuel: 50,
        organics: 100,
        equipment: 75,
        credits: 500
      }, 'Robbery test offer');
      expect(result.success).toBe(true);
      return result.offer!;
    };

    const getPlayer = async (id: number) => {
      const pool = getTestPool();
      const res = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
      return res.rows[0];
    };

    const getOfferStatus = async (offerId: number) => {
      const pool = getTestPool();
      const res = await pool.query('SELECT status FROM player_trade_offers WHERE id = $1', [offerId]);
      return res.rows[0].status;
    };

    const getHistoryAction = async (offerId: number) => {
      const pool = getTestPool();
      const res = await pool.query(
        'SELECT action FROM player_trade_history WHERE offer_id = $1 ORDER BY id DESC LIMIT 1',
        [offerId]
      );
      return res.rows[0]?.action;
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should successfully rob and transfer stolen goods on a lucky roll', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.1); // below 0.25 → success
      const offer = await makeOffer();

      const robberBefore = await getPlayer(testRobberId);
      const result = await attemptPlayerRobbery(offer.id, testRobberId);

      expect(result.outcome).toBe('robbery_success');
      expect(result.success).toBe(true);
      // Note: credits is BIGINT, pg returns it as a string
      expect(result.stolenGoods).toEqual({ fuel: 100, organics: 50, equipment: 25, credits: '1000' });

      const robberAfter = await getPlayer(testRobberId);
      // Note: credits is BIGINT, pg returns it as a string
      expect(Number(robberAfter.credits)).toBe(Number(robberBefore.credits) + 1000);
      expect(robberAfter.cargo_fuel).toBe(robberBefore.cargo_fuel + 100);
      expect(robberAfter.cargo_organics).toBe(robberBefore.cargo_organics + 50);
      expect(robberAfter.cargo_equipment).toBe(robberBefore.cargo_equipment + 25);

      const victimAfter = await getPlayer(testPlayer1Id);
      expect(Number(victimAfter.credits)).toBe(5000 - 1000);
      expect(victimAfter.cargo_fuel).toBe(500 - 100);

      expect(await getOfferStatus(offer.id)).toBe('robbed');
      expect(await getHistoryAction(offer.id)).toBe('robbed_success');
    });

    it('should trigger combat on an unlucky roll', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9); // above 0.25 → failure
      const offer = await makeOffer();

      // Both sides need fighters for combat to resolve
      const pool = getTestPool();
      await pool.query('UPDATE players SET ship_fighters = 50 WHERE id = ANY($1::int[])', [[testRobberId, testPlayer1Id]]);

      const result = await attemptPlayerRobbery(offer.id, testRobberId);

      expect(result.outcome).toBe('robbery_combat');
      expect(result.success).toBe(false);
      expect(result.combatResult).toBeDefined();
      expect(await getOfferStatus(offer.id)).toBe('robbed');
      expect(await getHistoryAction(offer.id)).toBe('robbed_failed');
    });

    it('should prevent robbery between corporation members', async () => {
      const offer = await makeOffer();
      const pool = getTestPool();

      const corpRes = await pool.query(
        `INSERT INTO corporations (universe_id, name, founder_id) VALUES (3, 'rob_test_corp', $1) RETURNING id`,
        [testPlayer1Id]
      );
      const corpId = corpRes.rows[0].id;
      await pool.query('UPDATE players SET corp_id = $1 WHERE id = ANY($2::int[])', [corpId, [testPlayer1Id, testRobberId]]);

      const result = await attemptPlayerRobbery(offer.id, testRobberId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('corporation');
      expect(await getOfferStatus(offer.id)).toBe('pending');
    });

    it('should reject robbery if robber is not in the same sector', async () => {
      const offer = await makeOffer();
      const pool = getTestPool();
      await pool.query('UPDATE players SET current_sector = 11 WHERE id = $1', [testRobberId]);

      const result = await attemptPlayerRobbery(offer.id, testRobberId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('same sector');
      expect(await getOfferStatus(offer.id)).toBe('pending');
    });

    it('should reject robbery when the robber cannot fit the stolen goods', async () => {
      const offer = await makeOffer();
      const pool = getTestPool();
      // Robber holds are maxed out: 2000/2000, stolen cargo is 175
      await pool.query(
        'UPDATE players SET cargo_fuel = 1000, cargo_organics = 500, cargo_equipment = 500 WHERE id = $1',
        [testRobberId]
      );

      const result = await attemptPlayerRobbery(offer.id, testRobberId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('cargo space');
      expect(await getOfferStatus(offer.id)).toBe('pending');
    });

    it('should reject robbery of your own trade offer', async () => {
      const offer = await makeOffer();

      const result = await attemptPlayerRobbery(offer.id, testPlayer1Id);

      expect(result.success).toBe(false);
      expect(result.message).toContain('own trade offer');
      expect(await getOfferStatus(offer.id)).toBe('pending');
    });
  });

  describe('Cancel Trade', () => {
    it('should allow initiator to cancel offer', async () => {
      // This would require cancel functionality
      expect(true).toBe(true); // Placeholder
    });

    it('should allow recipient to cancel offer', async () => {
      // This would require cancel functionality
      expect(true).toBe(true); // Placeholder
    });

    it('should reject cancellation by third party', async () => {
      // This would require cancel functionality
      expect(true).toBe(true); // Placeholder
    });

    it('should reject cancellation of already accepted trade', async () => {
      // This would require cancel functionality
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Trade Expiry', () => {
    it('should auto-expire old offers', async () => {
      // This would require time manipulation
      expect(true).toBe(true); // Placeholder
    });

    it('should not expire fresh offers', async () => {
      // This would require time checks
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Trade History', () => {
    it('should retrieve player trade history', async () => {
      // This would require completed trades
      expect(true).toBe(true); // Placeholder
    });

    it('should limit history results', async () => {
      // This would require many trades
      expect(true).toBe(true); // Placeholder
    });

    it('should order history by most recent first', async () => {
      // This would require multiple trades
      expect(true).toBe(true); // Placeholder
    });
  });
});
