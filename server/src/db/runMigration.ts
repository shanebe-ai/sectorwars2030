import { pool } from './connection';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.log('Usage: npx tsx src/db/runMigration.ts <migration_file.sql>');
    console.log('Example: npx tsx src/db/runMigration.ts src/db/migrations/add_messages_table.sql');
    process.exit(1);
  }

  const filePath = path.resolve(migrationFile);
  
  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf-8');
  
  console.log(`Running migration: ${migrationFile}`);
  
  try {
    await pool.query(sql);
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

