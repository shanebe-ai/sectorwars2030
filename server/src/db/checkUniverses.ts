import { pool } from './connection';

async function checkUniverses() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT id, name, max_sectors, max_players, created_at 
       FROM universes 
       ORDER BY id`
    );
    
    if (result.rows.length === 0) {
      console.log('❌ No universes found in database');
      console.log('\nTo create a universe:');
      console.log('1. Go to http://localhost:5174 (Admin Panel)');
      console.log('2. Login with an admin account');
      console.log('3. Click "Create Universe"');
      console.log('4. Fill in the form and submit');
      return false;
    } else {
      console.log(`✓ Found ${result.rows.length} universe(s):\n`);
      result.rows.forEach((universe: any) => {
        console.log(`  ID: ${universe.id}`);
        console.log(`  Name: ${universe.name}`);
        console.log(`  Max Sectors: ${universe.max_sectors}`);
        console.log(`  Max Players: ${universe.max_players}`);
        console.log(`  Created: ${universe.created_at}`);
        console.log('');
      });
      return true;
    }
  } catch (error) {
    console.error('Error checking universes:', error);
    return false;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  checkUniverses()
    .then((hasUniverses) => {
      process.exit(hasUniverses ? 0 : 1);
    })
    .catch((error) => {
      console.error('Check failed:', error);
      process.exit(1);
    });
}

export { checkUniverses };

