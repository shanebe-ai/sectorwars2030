import { pool } from './connection';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');

    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute the schema
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');

    console.log('✓ Database schema created successfully');
    console.log('✓ Tables created: users, universes, players, sectors, sector_warps, planets, ship_types, corporations, corp_members, game_events, combat_log, turn_updates');

  } catch (error) {
    await client.query('ROLLBACK');
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
