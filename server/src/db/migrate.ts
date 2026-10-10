import { pool } from './connection';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PostgreSQL error code for "relation already exists" (duplicate table/index).
 * These are safe to skip: the object is already in the desired state.
 */
const DUPLICATE_OBJECT_CODES = new Set(['42P07']);

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');

    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute statement by statement so the migration is idempotent:
    // on an existing database, objects that are already there are skipped
    // instead of aborting the whole run (which used to break deploys).
    // schema.sql contains only CREATE TABLE / CREATE INDEX statements, so a
    // naive split on semicolons is safe here.
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let created = 0;
    let skipped = 0;
    for (const statement of statements) {
      try {
        await client.query(statement);
        created++;
      } catch (error: any) {
        if (error?.code && DUPLICATE_OBJECT_CODES.has(error.code)) {
          skipped++;
          continue;
        }
        throw error;
      }
    }

    console.log(`✓ Database migration complete (${created} statements applied, ${skipped} already existed)`);

  } catch (error) {
    console.error('✗ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\nMigration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nMigration failed:', error);
      process.exit(1);
    });
}

export { runMigration };
