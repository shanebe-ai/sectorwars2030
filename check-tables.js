import { query } from './server/src/db/connection';

async function checkTables() {
  const result = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'sector_cargo' ORDER BY column_name;");
  console.log('sector_cargo columns:');
  result.rows.forEach(col => console.log('  ' + col.column_name));
}

checkTables().catch(console.error);
