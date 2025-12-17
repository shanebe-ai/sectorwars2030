import { query } from './src/db/connection';

async function debugShipQuery() {
  console.log('Checking ship query for universe 2, ship "scout":');
  const result = await query(
    `SELECT name, universe_id, holds, fighters_max, shields_max FROM ship_types
     WHERE LOWER(name) = LOWER($1)
     AND (universe_id = $2 OR universe_id IS NULL)`,
    ['scout', 2]
  );
  console.log('Results:', result.rows);

  console.log('\nAll ships in database:');
  const allShips = await query('SELECT name, universe_id FROM ship_types ORDER BY name');
  allShips.rows.forEach(ship => console.log(`  ${ship.name} (universe: ${ship.universe_id})`));

  console.log('\nChecking for global ships (universe_id IS NULL):');
  const globalShips = await query('SELECT name FROM ship_types WHERE universe_id IS NULL');
  globalShips.rows.forEach(ship => console.log(`  ${ship.name} (global)`));

  console.log('\nChecking for ships in universe 2:');
  const universe2Ships = await query('SELECT name FROM ship_types WHERE universe_id = 2 OR universe_id IS NULL');
  universe2Ships.rows.forEach(ship => console.log(`  ${ship.name}`));
}

debugShipQuery().catch(console.error);
