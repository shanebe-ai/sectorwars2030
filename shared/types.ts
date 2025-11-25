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
  is_alive: boolean;
  last_turn_update: string;
  created_at: string;
}

export type PortType = 'BBS' | 'BSB' | 'SBB' | 'SSB' | 'SBS' | 'BSS' | 'SSS' | 'BBB';

export interface Sector {
  id: number;
  universe_id: number;
  sector_number: number;
  name?: string;
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
