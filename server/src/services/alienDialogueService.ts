/**
 * Alien Dialogue Service - Generates AI-powered alien messages with unique race personalities
 */

import { generateAlienDialogueWithFallback } from '../utils/letsmcpClient';

// Alien race personality definitions
const RACE_PERSONALITIES: Record<string, {
  description: string;
  speechStyle: string;
  traits: string[];
}> = {
  'Xenthi': {
    description: 'A hive-mind collective species that thinks as one',
    speechStyle: 'Uses collective pronouns (we, us, our). Cold, logical, emotionless. Short declarative sentences.',
    traits: ['calculating', 'unified', 'precise']
  },
  'Vorlak': {
    description: 'Proud warrior race that values honor in combat',
    speechStyle: 'Direct and challenging. References honor, battle, and glory. Respects worthy opponents.',
    traits: ['aggressive', 'honorable', 'boastful']
  },
  'Krynn': {
    description: 'Ancient mystical beings who speak in riddles',
    speechStyle: 'Cryptic, prophetic. References fate, stars, and cosmic truths. Speaks in metaphors.',
    traits: ['mysterious', 'wise', 'enigmatic']
  },
  'Zephyri': {
    description: 'Merchant traders obsessed with profit and deals',
    speechStyle: 'Business-focused. References credits, deals, opportunities. Friendly but calculating.',
    traits: ['greedy', 'persuasive', 'opportunistic']
  },
  'Nethrak': {
    description: 'Shadowy schemers who manipulate from the darkness',
    speechStyle: 'Threatening undertones. References secrets, shadows, and hidden knowledge. Manipulative.',
    traits: ['deceptive', 'threatening', 'secretive']
  },
  'Corvani': {
    description: 'Technology-obsessed species that augments everything',
    speechStyle: 'Technical jargon. References systems, efficiency, upgrades. Sees organics as inferior.',
    traits: ['analytical', 'superior', 'mechanical']
  },
  'Drakorii': {
    description: 'Territorial reptilian species fiercely protecting their space',
    speechStyle: 'Warnings and threats about territory. References ancestors, bloodlines, and dominion.',
    traits: ['territorial', 'proud', 'ancient']
  },
  'Sylithian': {
    description: 'Curious peaceful explorers seeking knowledge',
    speechStyle: 'Asks questions, expresses wonder. Friendly and non-threatening. Scientific curiosity.',
    traits: ['curious', 'peaceful', 'observant']
  },
  'Morketh': {
    description: 'Brutal simple-minded warriors who respect only strength',
    speechStyle: 'Short, violent statements. Simple vocabulary. STRENGTH is everything. Threats of crushing.',
    traits: ['brutal', 'simple', 'violent']
  },
  'Aetheri': {
    description: 'Ethereal beings existing partially outside normal space',
    speechStyle: 'Distant, philosophical. References dimensions, existence, and the void. Detached from physical concerns.',
    traits: ['ethereal', 'philosophical', 'detached']
  }
};

// Default personality for unknown races
const DEFAULT_PERSONALITY = {
  description: 'Unknown alien species',
  speechStyle: 'Alien and unfamiliar communication patterns.',
  traits: ['alien', 'unknown']
};

/**
 * Get personality info for an alien race
 */
function getRacePersonality(alienRace: string) {
  return RACE_PERSONALITIES[alienRace] || DEFAULT_PERSONALITY;
}

/**
 * Build a prompt with race personality context
 */
function buildPrompt(alienRace: string, context: string, maxWords: number = 50): string {
  const personality = getRacePersonality(alienRace);

  return `You are a ${alienRace} alien. ${personality.description}

Speech style: ${personality.speechStyle}

Context: ${context}

Generate a single short message (under ${maxWords} words) in character. Do not use quotation marks. Do not explain or narrate - just the alien's words.`;
}

/**
 * Generate an encounter message when player meets alien
 */
export async function generateEncounterMessage(
  alienRace: string,
  shipName: string,
  sectorNumber: number,
  playerName: string
): Promise<string> {
  const context = `Your ship "${shipName}" has detected a human vessel (pilot: ${playerName}) entering Sector ${sectorNumber}. Generate a hail or warning appropriate to your race's personality.`;

  const fallback = `${alienRace} vessel "${shipName}" detected in Sector ${sectorNumber}. Unidentified human contact.`;

  return generateAlienDialogueWithFallback(
    buildPrompt(alienRace, context, 40),
    fallback
  );
}

/**
 * Generate a combat taunt during battle
 */
export async function generateCombatTaunt(
  alienRace: string,
  shipName: string,
  playerName: string,
  outcome: 'attacking' | 'winning' | 'losing' | 'destroyed' | 'escaped'
): Promise<string> {
  const outcomeContext: Record<string, string> = {
    attacking: `You are attacking the human ${playerName}. Taunt them as battle begins.`,
    winning: `You are winning the battle against ${playerName}. Their shields are failing.`,
    losing: `You are losing to ${playerName}. Your ship is heavily damaged.`,
    destroyed: `Your ship has been destroyed by ${playerName}. Final transmission.`,
    escaped: `${playerName} has fled from battle. React to their cowardice or wisdom.`
  };

  const fallbackMessages: Record<string, string> = {
    attacking: `${alienRace} vessel "${shipName}" engaging human target!`,
    winning: `${alienRace} forces achieving superiority in combat!`,
    losing: `${alienRace} vessel "${shipName}" sustaining critical damage!`,
    destroyed: `${alienRace} vessel "${shipName}" destroyed. Signal lost.`,
    escaped: `Human vessel escaped combat with ${alienRace} forces.`
  };

  return generateAlienDialogueWithFallback(
    buildPrompt(alienRace, outcomeContext[outcome], 35),
    fallbackMessages[outcome]
  );
}

/**
 * Generate a trade greeting when initiating commerce
 */
export async function generateTradeGreeting(
  alienRace: string,
  shipName: string,
  commodity: string,
  quantity: number
): Promise<string> {
  const context = `You are offering to trade ${quantity} units of ${commodity} to a human. Greet them and entice them to accept your offer.`;

  const fallback = `${alienRace} trader offers ${commodity} for exchange.`;

  return generateAlienDialogueWithFallback(
    buildPrompt(alienRace, context, 45),
    fallback
  );
}

/**
 * Generate a death/destruction broadcast message
 */
export async function generateDeathMessage(
  alienRace: string,
  shipName: string,
  cause: 'combat' | 'mines' | 'fighters' | 'unknown',
  killerName?: string
): Promise<string> {
  const causeContext: Record<string, string> = {
    combat: killerName
      ? `Your ship "${shipName}" was destroyed in combat by ${killerName}. Generate a final dramatic transmission.`
      : `Your ship "${shipName}" was destroyed in combat. Generate a final transmission.`,
    mines: `Your ship "${shipName}" was destroyed by sector mines. Generate a brief distress or warning signal.`,
    fighters: `Your ship "${shipName}" was destroyed by deployed fighters. Generate a final transmission.`,
    unknown: `Your ship "${shipName}" was destroyed. Generate a final transmission.`
  };

  const fallbackMessages: Record<string, string> = {
    combat: `${alienRace} vessel "${shipName}" destroyed${killerName ? ` by ${killerName}` : ''}. Signal terminated.`,
    mines: `${alienRace} vessel "${shipName}" destroyed by mines. Emergency beacon activated.`,
    fighters: `${alienRace} vessel "${shipName}" destroyed by defensive fighters.`,
    unknown: `${alienRace} vessel "${shipName}" signal lost.`
  };

  return generateAlienDialogueWithFallback(
    buildPrompt(alienRace, causeContext[cause], 40),
    fallbackMessages[cause]
  );
}

/**
 * Generate a sector entry broadcast
 */
export async function generateSectorEntryMessage(
  alienRace: string,
  shipName: string,
  sectorNumber: number,
  behavior: string
): Promise<string> {
  const behaviorContext: Record<string, string> = {
    trade: `Your trading vessel "${shipName}" is entering Sector ${sectorNumber} looking for commerce opportunities. Announce your peaceful intentions.`,
    patrol: `Your patrol vessel "${shipName}" is entering Sector ${sectorNumber} on routine patrol. Announce your presence.`,
    aggressive: `Your warship "${shipName}" is entering Sector ${sectorNumber} hunting for prey. Announce your hostile intentions.`,
    defensive: `Your defensive vessel "${shipName}" is entering Sector ${sectorNumber} to guard territory. Warn intruders.`
  };

  const fallback = `${alienRace} vessel "${shipName}" entering Sector ${sectorNumber}.`;

  const context = behaviorContext[behavior] || behaviorContext.patrol;

  return generateAlienDialogueWithFallback(
    buildPrompt(alienRace, context, 35),
    fallback
  );
}

/**
 * Generate a robbery response (when player attempts to rob alien trader)
 */
export async function generateRobberyResponse(
  alienRace: string,
  shipName: string,
  success: boolean,
  playerName: string
): Promise<string> {
  const context = success
    ? `The human ${playerName} successfully robbed your cargo! React with anger, threats of revenge, or acceptance based on your personality.`
    : `The human ${playerName} attempted to rob you but failed! React triumphantly or threateningly.`;

  const fallback = success
    ? `${alienRace} vessel reports theft by ${playerName}!`
    : `${alienRace} vessel repelled robbery attempt by ${playerName}.`;

  return generateAlienDialogueWithFallback(
    buildPrompt(alienRace, context, 40),
    fallback
  );
}

// Export race personalities for other uses
export { RACE_PERSONALITIES, getRacePersonality };
