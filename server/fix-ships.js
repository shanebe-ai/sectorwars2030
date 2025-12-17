import { query } from './src/db/connection';

async function fixShips() {
  console.log('Clearing all ships...');
  await query('DELETE FROM ship_types');

  console.log('Creating global ships...');
  await query(`
INSERT INTO ship_types (
  name, holds, fighters_max, shields_max, torpedoes_max,
  mines_max, beacons_max, genesis_max, turns_cost, cost_credits, description
) VALUES
  ('escape_pod', 5, 0, 10, 0, 0, 1, 0, 1, 0, 'Emergency vessel with minimal capabilities. Not recommended for trading.'),
  ('scout', 20, 10, 100, 0, 0, 5, 5, 1, 10000, 'Light trading vessel. Fast and efficient, good for beginners.'),
  ('trader', 60, 20, 250, 1, 2, 10, 10, 1, 50000, 'Standard trading vessel with moderate combat capability.'),
  ('freighter', 125, 25, 500, 2, 5, 15, 15, 1, 125000, 'Large cargo vessel. Excellent for serious traders.'),
  ('merchant_cruiser', 250, 40, 1000, 3, 5, 20, 20, 1, 250000, 'Advanced trading vessel with cloaking capability.'),
  ('corporate_flagship', 500, 50, 2000, 5, 5, 25, 25, 1, 500000, 'Ultimate trading vessel. Maximum cargo and combat capability.')
`);

  console.log('Global ships created successfully!');
}

fixShips().catch(console.error);
