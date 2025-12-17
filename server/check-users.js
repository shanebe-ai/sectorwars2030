import { query } from './src/db/connection';

async function checkUsers() {
  const result = await query('SELECT id, username FROM users ORDER BY id');
  console.log('Users in database:');
  result.rows.forEach(user => console.log(`  ${user.id}: ${user.username}`));
}

checkUsers().catch(console.error);
