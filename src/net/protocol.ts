// Messages between the host browser and guest browsers. The host owns the
// game: guests send what they want to do, the host checks it, runs the rules
// and sends everyone the new state.

import type { Action, GameState } from '../game/types';
import { uid } from '../util';

export interface Member {
  clientId: string;
  playerId: string;
  name: string;
  character: string;
  peerId: string;
  isHost: boolean;
  connected: boolean;
  inCall: boolean;
  mic: boolean;
  cam: boolean;
}

export interface Pending {
  clientId: string;
  name: string;
  character: string;
  peerId: string;
}

export interface RoomInfo {
  code: string;
  locked: boolean;
  started: boolean;
  members: Member[];
}

export type GuestMsg =
  | { t: 'hello'; clientId: string; name: string; character: string }
  | { t: 'intent'; action: Action }
  | { t: 'emote'; text: string }
  | { t: 'media'; inCall: boolean; mic: boolean; cam: boolean };

export type HostMsg =
  | { t: 'info'; takenCharacters: string[]; locked: boolean; started: boolean; hostName: string }
  | { t: 'waiting' }
  | { t: 'rejected'; reason: string }
  | { t: 'welcome'; playerId: string }
  | { t: 'sync'; room: RoomInfo; game: GameState | null; deadline: number | null }
  | { t: 'emote'; key: number; playerId: string; text: string }
  | { t: 'closed' }
  | { t: 'forceMute' }
  | { t: 'removedFromCall' };

const WORDS = ['KOALA', 'WOMBAT', 'EMU', 'DINGO', 'GECKO', 'ROO', 'QUOKKA', 'WALLABY', 'POSSUM', 'BILBY', 'ECHIDNA', 'KOOKA'];

export function makeRoomCode(rng: () => number = Math.random) {
  return `${WORDS[Math.floor(rng() * WORDS.length)]}-${100 + Math.floor(rng() * 900)}`;
}

export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');
export const isValidCode = (code: string) => /^[A-Z]{2,10}-\d{3}$/.test(normaliseCode(code));
export const hostPeerId = (code: string) => `aus-adventure-v2-${normaliseCode(code).toLowerCase()}`;

export function joinLink(code: string) {
  const url = new URL(window.location.href);
  url.hash = `#/join/${normaliseCode(code)}`;
  return url.toString();
}

/** Optional self-hosted PeerJS server for testing: ?peer=host:port */
export function peerOptions(): Record<string, unknown> {
  const param = new URLSearchParams(window.location.search).get('peer');
  if (!param) return { debug: 1 };
  const [host, port] = param.split(':');
  return { host, port: Number(port || 9000), path: '/aa', secure: false, debug: 1 };
}

/** Per-tab id so a reload rejoins the same seat, but two tabs are two players. */
export function clientIdFor(code: string) {
  const key = `aa2-client-${normaliseCode(code)}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = uid();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return uid();
  }
}
