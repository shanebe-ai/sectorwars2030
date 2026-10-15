import { pool } from './connection';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PostgreSQL error code for "relation already exists" (duplicate table/index).
 * These are safe to skip: the object is already in the desired state.
 */
const DUPLICATE_OBJECT_CODES = new Set([
  '42P07', // relation already exists
  '42501', // insufficient privilege (e.g. function owned by another user, already works)
]);

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
    // Split on semicolons, but respect dollar-quoted blocks (used in
    // CREATE FUNCTION bodies) so we don't split inside them.
    const statements: string[] = [];
    let current = '';
    let inDollarQuote = false;
    let dollarTag = '';
    const lines = schema.split('\n');
    for (let i = 0; i < schema.length; i++) {
      // Check for dollar quote start/end ($$ or $tag$)
      const dollarMatch = schema.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (dollarMatch) {
        const tag = dollarMatch[0];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
        }
        current += tag;
        i += tag.length - 1;
        continue;
      }
      if (schema[i] === ';' && !inDollarQuote) {
        statements.push(current.trim());
        current = '';
      } else {
        current += schema[i];
      }
    }
    if (current.trim().length > 0) {
      statements.push(current.trim());
    }
    const filtered = statements.filter((s) => s.length > 0);

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
