import { query } from './src/db/connection.js';

async function fixShips() {
  console.log('Fixing ship types...');

  // Delete all existing ship types
  await query('DELETE FROM ship_types');
  console.log('✓ Cleared existing ships');

  // Insert fresh ship types
  const shipTypes = [
    ['Escape Pod', 5, 0, 0, 0, 0, 0, 0, 5, 0, 'Emergency transport with minimal capabilities'],
    ['Scout', 20, 10, 10, 5, 5, 10, 5, 1, 10000, 'Basic trading vessel for new captains'],
    ['Trader', 60, 20, 20, 10, 10, 15, 10, 1, 50000, 'Improved cargo capacity for serious traders'],
    ['Freighter', 125, 40, 40, 20, 20, 20, 15, 1, 125000, 'Large cargo hauler for bulk trading'],
    ['Merchant Cruiser', 250, 80, 80, 40, 40, 25, 20, 1, 250000, 'Heavy trading ship with combat capabilities'],
    ['Corporate Flagship', 500, 150, 150, 80, 80, 30, 25, 1, 500000, 'Ultimate trading vessel with massive holds']
  ];

  for (const ship of shipTypes) {
    await query(
      `INSERT INTO ship_types (universe_id, name, holds, fighters_max, shields_max, torpedoes_max, mines_max, beacons_max, genesis_max, turns_cost, cost_credits, description)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      ship
    );
  }

  console.log('✓ Added 6 ship types');

  // Verify
  const result = await query('SELECT name, universe_id FROM ship_types ORDER BY name');
  console.log('Ship types in database:');
  result.rows.forEach(ship => console.log(`  ${ship.name} (universe: ${ship.universe_id})`));
  console.log(`Total: ${result.rows.length}`);
}

fixShips().catch(console.error);

