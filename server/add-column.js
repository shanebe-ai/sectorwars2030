import { query } from './src/db/connection.js';

async function addColumn() {
  try {
    await query('ALTER TABLE planets ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100);');
    console.log('Added owner_name column to planets table');
  } catch (error) {
    console.log('Error adding column:', error.message);
  }
}

addColumn().catch(console.error);


