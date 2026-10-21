import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
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

// Mock WebSocket events
jest.mock('../index', () => ({
  emitSectorEvent: jest.fn(),
  emitUniverseEvent: jest.fn(),
  emitPlayerEvent: jest.fn(),
}));

import { editUniverse, getUniverse } from '../controllers/universeController';

describe('Universe edit (PATCH /api/universes/:id)', () => {
  let universeId: number;
  let adminId: number;
  let regularUserId: number;

  const ORIGINAL_NAME = 'Edit Test Universe';
  const ORIGINAL_DESCRIPTION = 'Original description';

  const mockRes = () => {
    const res: any = { statusCode: 200 };
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const adminReqUser = () => ({
    userId: adminId,
    username: 'test_universe_edit_admin',
    email: 'test_universe_edit_admin@test.com',
    isAdmin: true,
  });

  const regularReqUser = () => ({
    userId: regularUserId,
    username: 'test_universe_edit_user',
    email: 'test_universe_edit_user@test.com',
    isAdmin: false,
  });

  const callEdit = async (user: any, id: any, body: any) => {
    const res = mockRes();
    await editUniverse({ user, params: { id: String(id) }, body } as any, res);
    return res;
  };

  const callGet = async (id: any) => {
    const res = mockRes();
    await getUniverse({ params: { id: String(id) } } as any, res);
    return res;
  };

  const responseBody = (res: any) => res.json.mock.calls[0][0];

  beforeAll(async () => {
    await cleanupTestDb();

    adminId = await createTestUser('test_universe_edit_admin', undefined, true);
    regularUserId = await createTestUser('test_universe_edit_user', undefined, false);

    universeId = await createTestUniverse(ORIGINAL_NAME, 50);
    await testPool.query(
      `UPDATE universes SET description = $2 WHERE id = $1`,
      [universeId, ORIGINAL_DESCRIPTION]
    );
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM universes WHERE id = $1`, [universeId]);
    await testPool.query(
      `DELETE FROM users WHERE username IN ('test_universe_edit_admin', 'test_universe_edit_user')`
    );
    await closeTestPool();
  });

  it('lets an admin rename a universe and shows the change via GET /:id', async () => {
    const res = await callEdit(adminReqUser(), universeId, { name: 'Renamed Universe' });

    expect(res.statusCode).toBe(200);
    expect(responseBody(res).universe.name).toBe('Renamed Universe');

    const getRes = await callGet(universeId);
    expect(getRes.statusCode).toBe(200);
    expect(responseBody(getRes).universe.name).toBe('Renamed Universe');
    expect(responseBody(getRes).universe.description).toBe(ORIGINAL_DESCRIPTION);
  });

  it('lets an admin update the description', async () => {
    const res = await callEdit(adminReqUser(), universeId, {
      description: 'A brand new description',
    });

    expect(res.statusCode).toBe(200);

    const getRes = await callGet(universeId);
    expect(responseBody(getRes).universe.description).toBe('A brand new description');
  });

  it('lets an admin clear the description', async () => {
    const res = await callEdit(adminReqUser(), universeId, { description: null });

    expect(res.statusCode).toBe(200);

    const getRes = await callGet(universeId);
    expect(responseBody(getRes).universe.description).toBeNull();
  });

  it('refuses a non-admin authenticated user', async () => {
    const res = await callEdit(regularReqUser(), universeId, { name: 'Hijacked Universe' });

    expect(res.statusCode).toBe(403);

    const getRes = await callGet(universeId);
    expect(responseBody(getRes).universe.name).not.toBe('Hijacked Universe');
  });

  it('refuses an unauthenticated request', async () => {
    const res = mockRes();
    await editUniverse(
      { params: { id: String(universeId) }, body: { name: 'Anonymous Universe' } } as any,
      res
    );

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for an unknown universe id', async () => {
    const res = await callEdit(adminReqUser(), 999999, { name: 'Ghost Universe' });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for an empty body', async () => {
    const res = await callEdit(adminReqUser(), universeId, {});

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for a blank name', async () => {
    const res = await callEdit(adminReqUser(), universeId, { name: '   ' });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an over-length name', async () => {
    const res = await callEdit(adminReqUser(), universeId, { name: 'x'.repeat(101) });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an over-length description', async () => {
    const res = await callEdit(adminReqUser(), universeId, {
      description: 'x'.repeat(2001),
    });

    expect(res.statusCode).toBe(400);
  });

  it('ignores gameplay fields in the body and leaves them unchanged', async () => {
    const res = await callEdit(adminReqUser(), universeId, {
      name: 'Metadata Only',
      max_sectors: 5,
      max_players: 1,
      turns_per_day: 1,
      starting_credits: 999999,
      starting_ship_type: 'trader',
      is_active: false,
    });

    expect(res.statusCode).toBe(200);

    const getRes = await callGet(universeId);
    const universe = responseBody(getRes).universe;

    // The name edit applies...
    expect(universe.name).toBe('Metadata Only');
    // ...but every gameplay field keeps the value from createTestUniverse.
    expect(universe.max_sectors).toBe(50);
    expect(universe.max_players).toBe(100);
    expect(universe.turns_per_day).toBe(1000);
    expect(universe.starting_credits).toBe(2000);
    expect(universe.starting_ship_type).toBe('scout');
    expect(universe.is_active).toBe(true);
  });
});
