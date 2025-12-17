import { query } from './src/db/connection';

async function clearShips() {
  console.log('Clearing existing ship types...');
  await query('DELETE FROM ship_types');
  console.log('Done');
}

clearShips().catch(console.error);
