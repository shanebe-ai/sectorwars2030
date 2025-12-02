import { pool } from './connection';

async function verifyMigration() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'sector_fighters' 
       AND column_name = 'last_maintenance'`
    );
    
    if (result.rows.length > 0) {
      console.log('✓ Migration 015 verified: last_maintenance column exists');
      console.log(`  Column type: ${result.rows[0].data_type}`);
      return true;
    } else {
      console.log('✗ Migration 015 failed: last_maintenance column not found');
      return false;
    }
  } catch (error) {
    console.error('Error verifying migration:', error);
    return false;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  verifyMigration()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

export { verifyMigration };


