import { Router } from 'express';
import * as planetController from '../controllers/planetController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All planet routes require authentication
router.use(authenticateToken);

// ============================================================================
// PLANET INFO ROUTES
// ============================================================================

// Get planet info by ID
router.get('/:id', planetController.getPlanetInfo);

// Get all planets owned by current player
router.get('/', planetController.getPlayerPlanets);

// ============================================================================
// PLANET MANAGEMENT ROUTES
// ============================================================================

// Claim an unclaimed planet
router.post('/:id/claim', planetController.claimPlanet);

// Set production type (fuel, organics, equipment, balanced)
router.put('/:id/production', planetController.setProductionType);

// Upgrade citadel
router.post('/:id/citadel/upgrade', planetController.upgradeCitadel);

// ============================================================================
// COLONIST ROUTES
// ============================================================================

// Deposit colonists from ship to planet
router.post('/:id/colonists/deposit', planetController.depositColonists);

// ============================================================================
// RESOURCE ROUTES
// ============================================================================

// Withdraw resources from planet to ship
router.post('/:id/resources/withdraw', planetController.withdrawResources);

// Deposit resources from ship to planet
router.post('/:id/resources/deposit', planetController.depositResources);

// ============================================================================
// FIGHTER ROUTES
// ============================================================================

// Deploy fighters to planet
router.post('/:id/fighters/deposit', planetController.depositFighters);

// Retrieve fighters from planet
router.post('/:id/fighters/withdraw', planetController.withdrawFighters);

// ============================================================================
// CREDITS ROUTES
// ============================================================================

// Deposit credits to planet treasury
router.post('/:id/credits/deposit', planetController.depositCredits);

// Withdraw credits from planet treasury
router.post('/:id/credits/withdraw', planetController.withdrawCredits);

export default router;


