import { query } from './connection';

const shipTypes = [
  {
    name: 'escape_pod',
    display_name: 'Escape Pod',
    holds: 5,
    fighters: 0,
    shields: 10,
    torpedo_tubes: 0,
    attack_power: 5,
    defense_power: 5,
    max_turns_warp: 2,
    fuel_efficiency: 1.5,
    cloak_capable: false,
    mines_max: 0,
    genesis_max: 0,
    cost_credits: 0,
    unlock_level: 0,
    description: 'Emergency vessel with minimal capabilities. Not recommended for trading.',
  },
  {
    name: 'scout',
    display_name: 'Scout',
    holds: 20,
    fighters: 10,
    shields: 100,
    torpedo_tubes: 0,
    attack_power: 50,
    defense_power: 50,
    max_turns_warp: 2,
    fuel_efficiency: 1.2,
    cloak_capable: false,
    mines_max: 5,
    genesis_max: 0,
    cost_credits: 1000,
    unlock_level: 0,
    description: 'Light trading vessel. Fast and efficient, good for beginners.',
  },
  {
    name: 'trader',
    display_name: 'Trader',
    holds: 60,
    fighters: 20,
    shields: 250,
    torpedo_tubes: 1,
    attack_power: 100,
    defense_power: 100,
    max_turns_warp: 2,
    fuel_efficiency: 1.0,
    cloak_capable: false,
    mines_max: 10,
    genesis_max: 1,
    cost_credits: 10000,
    unlock_level: 1,
    description: 'Standard trading vessel with moderate combat capability.',
  },
  {
    name: 'freighter',
    display_name: 'Freighter',
    holds: 125,
    fighters: 25,
    shields: 500,
    torpedo_tubes: 2,
    attack_power: 150,
    defense_power: 150,
    max_turns_warp: 2,
    fuel_efficiency: 0.9,
    cloak_capable: false,
    mines_max: 20,
    genesis_max: 2,
    cost_credits: 50000,
    unlock_level: 2,
    description: 'Large cargo vessel. Excellent for serious traders.',
  },
  {
    name: 'merchant_cruiser',
    display_name: 'Merchant Cruiser',
    holds: 250,
    fighters: 40,
    shields: 1000,
    torpedo_tubes: 3,
    attack_power: 250,
    defense_power: 250,
    max_turns_warp: 2,
    fuel_efficiency: 0.8,
    cloak_capable: true,
    mines_max: 40,
    genesis_max: 5,
    cost_credits: 250000,
    unlock_level: 5,
    description: 'Advanced trading vessel with cloaking capability.',
  },
  {
    name: 'corporate_flagship',
    display_name: 'Corporate Flagship',
    holds: 500,
    fighters: 50,
    shields: 2000,
    torpedo_tubes: 5,
    attack_power: 500,
    defense_power: 500,
    max_turns_warp: 2,
    fuel_efficiency: 0.7,
    cloak_capable: true,
    mines_max: 100,
    genesis_max: 10,
    cost_credits: 1000000,
    unlock_level: 10,
    description: 'Ultimate trading vessel. Maximum cargo and combat capability.',
  },
];

async function seedShipTypes() {
  try {
    console.log('Seeding ship_types table...');

    // Check if ship types already exist
    const existingResult = await query('SELECT COUNT(*) as count FROM ship_types');
    const existingCount = parseInt(existingResult.rows[0].count);

    if (existingCount > 0) {
      console.log(`Ship types already seeded (${existingCount} records found). Skipping.`);
      return;
    }

    // Insert all ship types
    for (const ship of shipTypes) {
      await query(
        `INSERT INTO ship_types (
          name, display_name, holds, fighters, shields, torpedo_tubes,
          attack_power, defense_power, max_turns_warp, fuel_efficiency,
          cloak_capable, mines_max, genesis_max, cost_credits, unlock_level, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          ship.name,
          ship.display_name,
          ship.holds,
          ship.fighters,
          ship.shields,
          ship.torpedo_tubes,
          ship.attack_power,
          ship.defense_power,
          ship.max_turns_warp,
          ship.fuel_efficiency,
          ship.cloak_capable,
          ship.mines_max,
          ship.genesis_max,
          ship.cost_credits,
          ship.unlock_level,
          ship.description,
        ]
      );
      console.log(`  ✓ Added ${ship.display_name}`);
    }

    console.log(`\n✅ Successfully seeded ${shipTypes.length} ship types!`);
  } catch (error) {
    console.error('Error seeding ship types:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedShipTypes()
    .then(() => {
      console.log('Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}

export { seedShipTypes };
