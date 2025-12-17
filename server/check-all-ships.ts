import { query } from './src/db/connection.js';

async function checkAllShips() {
  // Check all ship types
  const ships = await query('SELECT id, name, universe_id FROM ship_types ORDER BY universe_id, name');
  console.log('All ship types:');
  ships.rows.forEach(ship => console.log(`  ID: ${ship.id}, Name: ${ship.name}, Universe: ${ship.universe_id || 'Global'}`));

  // Check players and their ships
  const players = await query('SELECT p.id, p.ship_type, u.name as universe_name FROM players p JOIN universes u ON p.universe_id = u.id');
  console.log(`\nPlayers and their ships (${players.rows.length}):`);
  players.rows.forEach(player => console.log(`  Player ${player.id}: ${player.ship_type} in ${player.universe_name}`));

  // Check alien ships
  const aliens = await query('SELECT COUNT(*) as count FROM alien_ships');
  console.log(`\nAlien ships: ${aliens.rows[0].count}`);

  // Check for any ship-related tables
  const tables = await query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%ship%'");
  console.log(`\nShip-related tables:`);
  tables.rows.forEach(table => console.log(`  ${table.tablename}`));

  // Check if there are any ship types attached to specific universes
  const universeShips = await query(`
    SELECT st.name, u.name as universe_name, st.universe_id
    FROM ship_types st
    LEFT JOIN universes u ON st.universe_id = u.id
    WHERE st.universe_id IS NOT NULL
    ORDER BY st.name
  `);
  console.log(`\nShip types attached to specific universes (${universeShips.rows.length}):`);
  universeShips.rows.forEach(ship => console.log(`  ${ship.name} in ${ship.universe_name}`));
}

checkAllShips().catch(console.error);

