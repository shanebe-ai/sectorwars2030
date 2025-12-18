const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tradewars',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function test() {
  try {
    // Create a test player at sector 5
    const playerResult = await pool.query(`
      SELECT p.credits, p.universe_id, p.current_sector, s.port_type
      FROM players p
      JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
      WHERE p.id = 1
      LIMIT 1
    `);
    
    console.log('Player query result:', playerResult.rows);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

test();
