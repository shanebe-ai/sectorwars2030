import { chargeFighterMaintenance } from './sectorFighterService';

/**
 * Start automatic fighter maintenance charging (runs daily)
 * Charges ₡5 per fighter per day from player credits
 * Destroys fighters if player can't afford maintenance
 */
export const startFighterMaintenance = (intervalMs: number = 24 * 60 * 60 * 1000): NodeJS.Timeout => {
  const hours = intervalMs / (60 * 60 * 1000);
  console.log(`[Fighter Maintenance] Starting automatic maintenance charging every ${hours} hours`);
  
  // Run immediately once
  chargeFighterMaintenance()
    .then((result) => {
      console.log(
        `[Fighter Maintenance] Charged ₡${result.totalCharged.toLocaleString()} from ${result.playersAffected} players, ` +
        `destroyed ${result.fightersDestroyed} fighters`
      );
    })
    .catch((error) => {
      console.error('[Fighter Maintenance] Error:', error);
    });
  
  // Then run on interval (daily by default)
  return setInterval(() => {
    chargeFighterMaintenance()
      .then((result) => {
        console.log(
          `[Fighter Maintenance] Charged ₡${result.totalCharged.toLocaleString()} from ${result.playersAffected} players, ` +
          `destroyed ${result.fightersDestroyed} fighters`
        );
      })
      .catch((error) => {
        console.error('[Fighter Maintenance] Error:', error);
      });
  }, intervalMs);
};

