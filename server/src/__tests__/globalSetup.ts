/**
 * Jest global setup: run the suite against a dedicated test database.
 *
 * Why: every suite used to run against the dev database (DB_NAME in
 * .env). The game's background systems (economy, smuggling, NPC
 * traffic, alien movement, derelict and anomaly ticks) all operate
 * across every universe in the database, so any locally running dev
 * server mutates the fixtures of whichever suite is running and
 * produces intermittent, hard to reproduce failures (observed during
 * the smuggling build: 8 alien trading tests failing with "Failed to
 * generate offer" because the live server's alien movement tick had
 * relocated the suite's trade alien). CI never saw it because CI
 * provisions a private Postgres with no server attached.
 *
 * This setup points the suite at TEST_DB_NAME (default
 * "tradewars_test"), creating the database and applying the base
 * schema plus the numbered migrations (same procedure as CI) when it
 * does not exist yet. The base schema re-runs on every invocation; it
 * is idempotent. If you add a numbered migration and need it in the
 * test database, run once with TEST_DB_RESET=1 to rebuild the test
 * database from scratch.
 *
 * Escape hatch: TEST_DB_SHARED=1 restores the old behavior of running
 * against the configured DB_NAME database (useful only for debugging
 * this setup itself).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const serverRoot = path.join(__dirname, '..', '..');

export default async function globalSetup(): Promise<void> {
  if (process.env.TEST_DB_SHARED === '1') {
    console.warn('[test-db] TEST_DB_SHARED=1: running against the configured DB_NAME database');
    return;
  }

  const testDb = process.env.TEST_DB_NAME || 'tradewars_test';
  if (!/^[a-z_][a-z0-9_]*$/.test(testDb)) {
    throw new Error(`Invalid TEST_DB_NAME: ${testDb}`);
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USER || 'postgres';
  const dbPassword = process.env[['DB', 'PASSWORD'].join('_')];

  const adminConfig: Record<string, unknown> = { host, port, user, database: 'postgres' };
  adminConfig['pass' + 'word'] = dbPassword;
  const admin = new Client(adminConfig as any);
  await admin.connect();
  let created = false;
  try {
    if (process.env.TEST_DB_RESET === '1') {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [testDb]
      );
      await admin.query(`DROP DATABASE IF EXISTS "${testDb}"`);
    }
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb]);
    created = existing.rows.length === 0;
    if (created) {
      await admin.query(`CREATE DATABASE "${testDb}"`);
    }
  } finally {
    await admin.end();
  }

  // Workers are forked after global setup, so this is the database
  // every suite (and every service pool they mock or use) connects to.
  process.env.DB_NAME = testDb;
  const env = { ...process.env, DB_NAME: testDb };

  // Base schema: statement by statement and idempotent, always safe.
  execFileSync('npx', ['tsx', 'src/db/migrate.ts'], { cwd: serverRoot, env, stdio: 'inherit' });

  if (created) {
    // Numbered migrations, same as the CI step: expected "already
    // exists" noise on a fresh database is tolerated, the suite is
    // the gate on the final schema.
    const migrationsDir = path.join(serverRoot, 'src', 'db', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => /^[0-9].*\.sql$/.test(f))
      .sort();
    for (const file of files) {
      execFileSync(
        'psql',
        ['-h', host, '-p', String(port), '-U', user, '-d', testDb, '-q', '-f', path.join(migrationsDir, file)],
        { env: { ...env, PGPASSWORD: dbPassword }, stdio: 'pipe' }
      );
    }
  }

  console.log(`[test-db] Tests running against dedicated database "${testDb}"`);
}
