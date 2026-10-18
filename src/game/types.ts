import type { CardId, GodId, ItemId } from '../data/content';
import type { SpecialId } from '../data/rules';

export interface PlayerState {
  id: string;
  name: string;
  character: string;
  color: string;
  cash: number;
  savings: number;
  points: number;
  pos: number;
  dir: 1 | -1;
  cards: CardId[];
  items: ItemId[];
  god: { id: GodId; days: number } | null;
  godShield: boolean;
  vehicle: { kind: 'scooter' | 'car'; days: number } | null;
  skip: number;
  turtle: number;
  freePass: boolean;
  teamUp: { with: string; days: number } | null;
  balloon: number | null;
  rescues: number;
  out: boolean;
  auto: boolean;
  usedCard: boolean;
  usedItem: boolean;
  remote: number | null;
}

export interface PlotState {
  owner: string | null;
  level: number;
  special: SpecialId | null;
}

export interface Pickup {
  kind: 'cash' | 'points' | 'crate';
  amount: number;
}

export type Pending =
  | { kind: 'pre' }
  | { kind: 'release'; fee: number; place: 'hospital' | 'jail' }
  | { kind: 'fork'; options: number[] }
  | { kind: 'buy'; plot: number }
  /** Build one level here? `left` levels may still be built this time. */
  | { kind: 'build'; plot: number; step: number; left: number; passing: boolean }
  | { kind: 'flight'; to: number; fee: number }
  | { kind: 'bank'; passing: boolean }
  | { kind: 'shop'; shop: 'card' | 'item' };

export type GameEvent =
  | { seq: number; type: 'spin'; playerId: string; wheels: number[]; remote: boolean }
  | { seq: number; type: 'step'; playerId: string; to: number }
  | { seq: number; type: 'jump'; playerId: string; to: number }
  | { seq: number; type: 'toast'; text: string; tone: 'good' | 'bad' | 'info' }
  | { seq: number; type: 'say'; playerId: string; text: string }
  | { seq: number; type: 'money'; playerId: string; amount: number }
  | { seq: number; type: 'news'; headline: string; text: string; day: number }
  | { seq: number; type: 'chance'; playerId: string; text: string }
  | { seq: number; type: 'god'; playerId: string; god: GodId; joined: boolean }
  | { seq: number; type: 'turn'; playerId: string }
  | { seq: number; type: 'lastRound' }
  | { seq: number; type: 'notice'; playerId: string | null; title: string; text: string; art: string | null; tone: 'good' | 'bad' | 'info'; days: number | null }
  | { seq: number; type: 'build'; playerId: string; plot: number; level: number }
  | { seq: number; type: 'over' };

type Dist<T> = T extends unknown ? Omit<T, 'seq'> : never;
export type NewEvent = Dist<GameEvent>;

export interface GameState {
  version: 2;
  players: PlayerState[];
  plots: PlotState[];
  current: number;
  day: number;
  turnSeq: number;
  pending: Pending | null;
  move: { left: number } | null;
  roadblocks: Record<number, string>;
  bananas: Record<number, string>;
  bombs: Record<number, string>;
  /** Things lying on the road, collected by whoever walks over them. */
  pickups: Record<number, Pickup>;
  mapGods: Record<number, { id: GodId; days: number }>;
  priceUp: Record<string, { by: string; days: number }>;
  boomRegion: string | null;
  interestBoost: boolean;
  lastRound: { remaining: number } | null;
  over: boolean;
  ranking: { id: string; total: number; cash: number; savings: number; land: number }[] | null;
  events: GameEvent[];
  eventSeq: number;
  log: string[];
}

export type Action =
  | { type: 'spin' }
  | { type: 'release'; pay: boolean }
  | { type: 'useCard'; index: number; target?: string; plot?: number; plot2?: number; region?: string; special?: SpecialId }
  | { type: 'useItem'; index: number; target?: string; plot?: number; distance?: number; value?: number }
  | { type: 'fork'; to: number }
  | { type: 'buy'; yes: boolean }
  | { type: 'fly'; yes: boolean }
  | { type: 'build'; levels: number }
  | { type: 'bank'; amount: number }
  | { type: 'shopBuy'; id: string }
  | { type: 'shopLeave' }
  | { type: 'endGame' }
  | { type: 'setAuto'; playerId: string; on: boolean };

export interface NewPlayer {
  id: string;
  name: string;
  character: string;
  auto?: boolean;
}
