import { query } from './src/db/connection';

async function checkPlanets() {
  const result = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'planets' AND column_name = 'owner_name';");
  console.log('owner_name column exists:', result.rows.length > 0);
  if (result.rows.length > 0) {
    console.log('Column details:', result.rows[0]);
  } else {
    const allColumns = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'planets' ORDER BY column_name;");
    console.log('All planets table columns:');
    allColumns.rows.forEach(col => console.log('  ' + col.column_name));
  }
}

checkPlanets().catch(console.error);
