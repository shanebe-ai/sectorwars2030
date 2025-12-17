import { query } from './server/src/db/connection';

async function checkShips() {
  const result = await query('SELECT name, universe_id FROM ship_types ORDER BY name');
  console.log('Ship types in database:');
  result.rows.forEach(ship => console.log(`  ${ship.name} (universe: ${ship.universe_id})`));
  console.log(`Total ships: ${result.rows.length}`);
}

checkShips().catch(console.error);
