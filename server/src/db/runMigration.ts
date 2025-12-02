import { pool } from './connection';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Run a specific migration file
 */
async function runMigrationFile(migrationFile: string) {
  const client = await pool.connect();

  try {
    console.log(`Running migration: ${migrationFile}`);
    
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log(`✓ Migration ${migrationFile} completed successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Migration ${migrationFile} failed:`, error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Usage: tsx src/db/runMigration.ts <migration_file.sql>');
    process.exit(1);
  }

  runMigrationFile(migrationFile)
    .then(() => {
      console.log('\nMigration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nMigration failed:', error);
      process.exit(1);
    });
}

export { runMigrationFile };

