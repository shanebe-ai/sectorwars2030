const { generateUniverse } = require('./dist/server/src/services/universeService');

const config = {
  name: 'TW2002 Test',
  description: 'Testing constrained warp ranges',
  maxSectors: 1000,
  portPercentage: 12,
  stardockCount: 2,
  alienPlanetCount: 3,
  maxPlayers: 100,
  turnsPerDay: 1000,
  startingCredits: 2000,
  startingShipType: 'scout',
  allowDeadEnds: false
};

generateUniverse(config)
  .then((result) => {
    console.log('✓ Universe created successfully:', result.id);
    process.exit(0);
  })
  .catch((err) => {
    console.error('✗ Error creating universe:', err.message);
    process.exit(1);
  });
