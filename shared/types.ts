// Shared TypeScript types for TradeWars 2030

export interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
}

export interface Universe {
  id: number;
  name: string;
  description?: string;
  max_sectors: number;
  max_players: number;
  turns_per_day: number;
  starting_credits: number;
  starting_ship_type: string;
  is_active: boolean;
  created_at: string;
  created_by: number;
}

export interface Player {
  id: number;
  user_id: number;
  universe_id: number;
  corp_name: string;
  current_sector: number;
  credits: number;
  turns_remaining: number;
  experience: number;
  alignment: number;
  ship_type: string;
  ship_holds_max: number;
  ship_fighters: number;
  ship_shields: number;
  ship_torpedoes: number;
  ship_mines: number;
  ship_beacons: number;
  cargo_fuel: number;
  cargo_organics: number;
  cargo_equipment: number;
  colonists: number;
  is_alive: boolean;
  last_turn_update: string;
  created_at: string;
  // Combat stats
  kills?: number;
  deaths?: number;
  in_escape_pod?: boolean;
  last_combat_at?: string;
}

export type PortType = 'BBS' | 'BSB' | 'SBB' | 'SSB' | 'SBS' | 'BSS' | 'SSS' | 'BBB' | 'STARDOCK';

export interface Sector {
  id: number;
  universe_id: number;
  sector_number: number;
  name?: string;
  region?: string; // e.g., 'TerraSpace' for sectors 1-10
  port_type?: PortType;
  port_fuel_qty: number;
  port_organics_qty: number;
  port_equipment_qty: number;
  port_fuel_pct: number;
  port_organics_pct: number;
  port_equipment_pct: number;
  port_class: number;
  has_planet: boolean;
  planet_id?: number;
  has_beacon: boolean;
  beacon_owner_id?: number;
  fighters_count: number;
  mines_count: number;
  created_at: string;
  warps?: number[]; // Connected sector numbers
}

export interface SectorWarp {
  id: number;
  sector_id: number;
  destination_sector_number: number;
  is_two_way: boolean;
  created_at: string;
}

export interface Planet {
  id: number;
  universe_id: number;
  sector_id: number;
  owner_id?: number;
  name?: string;
  colonists: number;
  fighters: number;
  ore: number;
  fuel: number;
  organics: number;
  equipment: number;
  credits: number;
  production_type: 'fuel' | 'organics' | 'equipment' | 'balanced';
  citadel_level: number;
  last_production: string;
  created_at: string;
}

export interface ShipType {
  id: number;
  universe_id: number;
  name: string;
  holds: number;
  fighters_max: number;
  shields_max: number;
  torpedoes_max: number;
  mines_max: number;
  beacons_max: number;
  genesis_max: number;
  turns_cost: number;
  cost_credits: number;
  description?: string;
}

export interface Corporation {
  id: number;
  universe_id: number;
  name: string;
  founder_id: number;
  created_at: string;
}

export interface GameEvent {
  id: number;
  universe_id: number;
  player_id?: number;
  event_type: 'trade' | 'combat' | 'movement' | 'planet' | 'admin';
  event_data: any;
  sector_number?: number;
  created_at: string;
}

export interface CombatLog {
  id: number;
  universe_id: number;
  attacker_id?: number;
  defender_id?: number;
  sector_number: number;
  attacker_ship: string;
  defender_ship: string;
  winner_id?: number;
  credits_looted: number;
  cargo_looted: any;
  combat_details: any;
  created_at: string;
}

// API Request/Response types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface CreateUniverseRequest {
  name: string;
  description?: string;
  max_sectors?: number;
  max_players?: number;
  turns_per_day?: number;
  starting_credits?: number;
  starting_ship_type?: string;
}

export interface MoveRequest {
  destination_sector: number;
}

export interface TradeRequest {
  commodity: 'fuel' | 'organics' | 'equipment';
  quantity: number;
  action: 'buy' | 'sell';
}

// WebSocket event types
export interface WsPlayerMove {
  player_id: number;
  from_sector: number;
  to_sector: number;
  timestamp: string;
}

export interface WsCombatEvent {
  combat_id: number;
  sector_number: number;
  attacker_name: string;
  defender_name: string;
  winner_name?: string;
}

export interface WsPortUpdate {
  sector_number: number;
  port_type: PortType;
  quantities: {
    fuel: number;
    organics: number;
    equipment: number;
  };
}

// Message types
export type MessageType = 'DIRECT' | 'BROADCAST' | 'CORPORATE';

export interface Message {
  id: number;
  universe_id: number;
  sender_id?: number;
  recipient_id?: number;
  sender_name?: string;
  subject?: string;
  body: string;
  message_type: MessageType;
  is_read: boolean;
  is_deleted_by_sender: boolean;
  is_deleted_by_recipient: boolean;
  sent_at: string;
  read_at?: string;
}

export interface PlayerEncounter {
  id: number;
  player_id: number;
  encountered_player_id: number;
  universe_id: number;
  first_met_at: string;
  last_met_at: string;
  encounter_count: number;
  // Joined data
  encountered_player_name?: string;
  encountered_corp_name?: string;
  encountered_ship_type?: string;
}

export interface SendMessageRequest {
  recipient_id?: number; // Optional for broadcasts
  subject?: string;
  body: string;
  message_type: MessageType;
}

export interface KnownTrader {
  player_id: number;
  player_name: string;
  corp_name: string;
  ship_type: string;
  last_met_at: string;
  encounter_count: number;
}

// Banking types
export type BankAccountType = 'personal' | 'corporate';

export interface BankAccount {
  id: number;
  universe_id: number;
  account_type: BankAccountType;
  player_id: number | null;
  corp_id: number | null;
  balance: number;
  created_at: string;
  updated_at: string;
  // Joined data
  corp_name?: string;
}

export type BankTransactionType = 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out';

export interface BankTransaction {
  id: number;
  universe_id: number;
  account_id: number;
  transaction_type: BankTransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  related_account_id: number | null;
  related_player_name: string | null;
  related_corp_name: string | null;
  memo: string | null;
  created_at: string;
}

export interface BankingDepositRequest {
  accountType: BankAccountType;
  amount: number;
}

export interface BankingWithdrawRequest {
  accountType: BankAccountType;
  amount: number;
}

export interface BankingTransferRequest {
  recipientId: number;
  amount: number;
  memo?: string;
}

// Combat types
export interface CombatRound {
  round: number;
  attackerFighters: number;
  defenderFighters: number;
  attackerShields: number;
  defenderShields: number;
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  description: string;
}

export interface CombatResult {
  winner: 'attacker' | 'defender' | 'draw';
  rounds: number;
  attackerFightersLost: number;
  defenderFightersLost: number;
  attackerShieldsLost: number;
  defenderShieldsLost: number;
  defenderDestroyed: boolean;
  attackerDestroyed: boolean;
  creditsLooted: number;
  creditsLostByAttacker: number;
  cargoLooted: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  cargoLostByAttacker: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  colonistsLostAttacker: number;
  colonistsLostDefender: number;
  attackerEscapeSector: number | null;
  defenderEscapeSector: number | null;
  message: string;
  combatLog: CombatRound[];
}

export interface AttackableTarget {
  id: number;
  corpName: string;
  username: string;
  shipType: string;
  fighters: number;
  shields: number;
  alignment: number;
  inSafeZone: boolean;
}

export interface CombatHistoryEntry {
  id: number;
  sectorNumber: number;
  attacker: {
    id: number;
    name: string;
    username: string;
    ship: string;
  };
  defender: {
    id: number;
    name: string;
    username: string;
    ship: string;
  };
  winnerId: number | null;
  creditsLooted: number;
  cargoLooted: any;
  rounds: number;
  attackerFightersLost: number;
  defenderFightersLost: number;
  defenderDestroyed: boolean;
  isAttacker: boolean;
  createdAt: string;
}

export interface AttackRequest {
  targetId: number;
}

// Beacon types
export interface Beacon {
  id: number;
  ownerId: number;
  ownerName: string;
  universeId: number;
  sectorNumber: number;
  message: string;
  createdAt: string;
}

// Deployed Fighters types
export interface DeployedFighters {
  id: number;
  ownerId: number;
  ownerName: string;
  fighterCount: number;
  deployedAt: string;
  isOwn?: boolean;
}

// Floating Cargo types  
export interface FloatingCargo {
  id: number;
  sectorNumber: number;
  fuel: number;
  organics: number;
  equipment: number;
  colonists: number;
  source: 'combat' | 'jettison';
  expiresAt: string;
}
