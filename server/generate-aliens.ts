import { generateAliensForUniverse } from './src/services/alienService.js';

async function generateAliens() {
  console.log('Generating aliens for universe 3...');
  await generateAliensForUniverse({
    universeId: 3,
    sectorCount: 1000
  });
  console.log('Done!');
}

generateAliens().catch(console.error);



