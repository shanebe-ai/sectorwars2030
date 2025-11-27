const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'tradewars',
  user: 'postgres',
  password: 'tradewars2030',
});

async function resetPassword() {
  const username = 'testplayer';
  const newPassword = 'password123';

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, username]);
  console.log(`Password updated for ${username} to: ${newPassword}`);
  await pool.end();
}

resetPassword().catch(console.error);
