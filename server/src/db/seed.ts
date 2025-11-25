import { pool } from './connection';
import bcrypt from 'bcrypt';

async function seedDatabase() {
  const client = await pool.connect();

  try {
    console.log('Starting database seeding...');

    await client.query('BEGIN');

    // Create default admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const adminResult = await client.query(
      `INSERT INTO users (username, email, password_hash, is_admin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      ['admin', 'admin@tradewars2030.com', adminPassword, true]
    );

    let adminId;
    if (adminResult.rows.length > 0) {
      adminId = adminResult.rows[0].id;
      console.log('✓ Created default admin user (username: admin, password: admin123)');
    } else {
      const existing = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
      adminId = existing.rows[0].id;
      console.log('✓ Admin user already exists');
    }

    // Create default universe
    const universeResult = await client.query(
      `INSERT INTO universes (name, description, max_sectors, max_players, turns_per_day, starting_credits, starting_ship_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        'Alpha Universe',
        'The first universe in TradeWars 2030. A vast expanse of 1000 sectors awaits exploration and conquest.',
        1000,
        100,
        1000,
        2000,
        'Scout',
        adminId
      ]
    );

    let universeId;
    if (universeResult.rows.length > 0) {
      universeId = universeResult.rows[0].id;
      console.log('✓ Created default universe: Alpha Universe');
    } else {
      const existing = await client.query('SELECT id FROM universes WHERE name = $1', ['Alpha Universe']);
      if (existing.rows.length > 0) {
        universeId = existing.rows[0].id;
        console.log('✓ Universe already exists');
      }
    }

    // Insert default ship types for the universe
    if (universeId) {
      const shipTypes = [
        ['Escape Pod', 5, 0, 0, 0, 0, 0, 0, 5, 0, 'Emergency transport with minimal capabilities'],
        ['Scout', 20, 10, 10, 5, 5, 10, 5, 1, 10000, 'Basic trading vessel for new captains'],
        ['Trader', 60, 20, 20, 10, 10, 15, 10, 1, 50000, 'Improved cargo capacity for serious traders'],
        ['Freighter', 125, 40, 40, 20, 20, 20, 15, 1, 125000, 'Large cargo hauler for bulk trading'],
        ['Merchant Cruiser', 250, 80, 80, 40, 40, 25, 20, 1, 250000, 'Heavy trading ship with combat capabilities'],
        ['Corporate Flagship', 500, 150, 150, 80, 80, 30, 25, 1, 500000, 'Ultimate trading vessel with massive holds']
      ];

      for (const ship of shipTypes) {
        await client.query(
          `INSERT INTO ship_types (universe_id, name, holds, fighters_max, shields_max, torpedoes_max, mines_max, beacons_max, genesis_max, turns_cost, cost_credits, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (universe_id, name) DO NOTHING`,
          [universeId, ...ship]
        );
      }
      console.log('✓ Created 6 default ship types');
    }

    await client.query('COMMIT');
    console.log('\n✓ Database seeding completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('\n===========================================');
      console.log('Default credentials:');
      console.log('  Username: admin');
      console.log('  Password: admin123');
      console.log('===========================================\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nSeeding failed:', error);
      process.exit(1);
    });
}

export { seedDatabase };
