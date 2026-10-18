// Online rooms built on PeerJS (WebRTC). The host's browser is the referee:
// it keeps the room and game state and broadcasts them to every guest.

import Peer, { DataConnection } from 'peerjs';
import { CHARACTERS } from '../data/content';
import { RULES } from '../data/rules';
import { RuleError, createGame, cur, reduce } from '../game/engine';
import type { Action, GameState } from '../game/types';
import { uid } from '../util';
import { MediaMesh } from './media';
import { GuestMsg, HostMsg, Member, Pending, RoomInfo, clientIdFor, hostPeerId, normaliseCode, peerOptions } from './protocol';

export type SessionStatus = 'connecting' | 'info' | 'waiting' | 'joined' | 'rejected' | 'lost' | 'error';

export interface Emote {
  key: number;
  playerId: string;
  text: string;
}

export interface SessionSnapshot {
  role: 'host' | 'guest';
  status: SessionStatus;
  code: string;
  room: RoomInfo | null;
  game: GameState | null;
  deadline: number | null;
  pending: Pending[];
  myPlayerId: string | null;
  myPeerId: string | null;
  info: { takenCharacters: string[]; locked: boolean; started: boolean; hostName: string } | null;
  message: string | null;
  emotes: Emote[];
  /** Set when a guest comes back to a game the computer was playing for them. */
  welcomeBack: boolean;
}

abstract class Session {
  protected listeners = new Set<() => void>();
  protected snap!: SessionSnapshot;
  peer: Peer;
  media: MediaMesh;

  constructor(peerId: string | undefined) {
    const opts = peerOptions();
    this.peer = peerId ? new Peer(peerId, opts) : new Peer(opts);
    this.media = new MediaMesh(this.peer, () => this.onLocalMedia());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  protected set(patch: Partial<SessionSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  protected addEmote(e: Emote) {
    this.set({ emotes: [...this.snap.emotes.slice(-5), e] });
    setTimeout(() => this.set({ emotes: this.snap.emotes.filter((x) => x.key !== e.key) }), 2800);
  }

  /** Keeps the link to the matchmaking server alive (e.g. after the iPad sleeps). */
  protected reconnectLater() {
    setTimeout(() => {
      if (!this.peer.destroyed && this.peer.disconnected) this.peer.reconnect();
    }, 2000);
  }

  protected abstract onLocalMedia(): void;
  abstract dispatch(action: Action): void;
  abstract emote(text: string): void;

  dismissWelcome() {
    this.set({ welcomeBack: false });
  }

  destroy() {
    this.media.leave();
    this.peer.destroy();
  }
}

function friendlyPeerError(type: string | undefined) {
  switch (type) {
    case 'browser-incompatible':
      return 'This browser does not support online play. Please use Safari, Chrome or Edge.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the online play server. Check your internet connection and try again.';
    default:
      return 'Something went wrong with online play. Please try again.';
  }
}

// ---------------------------------------------------------------------------

interface HostSave {
  room: RoomInfo;
  game: GameState | null;
  hostClientId: string;
}

const hostSaveKey = (code: string) => `aa2-host-${code}`;

export function savedHostRoom(): string | null {
  try {
    return localStorage.getItem('aa2-host-last');
  } catch {
    return null;
  }
}

export class HostSession extends Session {
  private conns = new Map<string, DataConnection>();
  private clientId: string;

  constructor(code: string, host: { name: string; character: string } | null) {
    super(hostPeerId(code));
    code = normaliseCode(code);
    const saved = HostSession.load(code);
    this.clientId = saved?.hostClientId ?? uid();
    const room: RoomInfo = saved?.room ?? { code, locked: false, started: false, members: [] };
    if (!saved && host) {
      room.members.push({
        clientId: this.clientId,
        playerId: uid(),
        name: host.name,
        character: host.character,
        peerId: hostPeerId(code),
        isHost: true,
        connected: true,
        inCall: false,
        mic: true,
        cam: false,
      });
    }
    room.members = room.members.map((m) => ({ ...m, connected: m.isHost, inCall: false }));
    this.snap = {
      role: 'host',
      status: 'connecting',
      code,
      room,
      game: saved?.game ?? null,
      deadline: null,
      pending: [],
      myPlayerId: room.members.find((m) => m.isHost)?.playerId ?? null,
      myPeerId: null,
      info: null,
      message: null,
      emotes: [],
      welcomeBack: false,
    };
    this.peer.on('open', (id) => {
      this.set({ status: 'joined', myPeerId: id, message: null });
      this.persist();
    });
    this.peer.on('connection', (conn) => this.onConnection(conn));
    this.peer.on('disconnected', () => this.reconnectLater());
    this.peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'peer-unavailable') return;
      if (type === 'unavailable-id') {
        this.set({ status: 'error', message: 'This room is already open on another screen. Close it there, wait a few seconds, then try again.' });
        return;
      }
      this.set({ status: 'error', message: friendlyPeerError(type) });
    });
  }

  static load(code: string): HostSave | null {
    try {
      const raw = localStorage.getItem(hostSaveKey(code));
      const save = raw ? (JSON.parse(raw) as HostSave) : null;
      return save && (!save.game || save.game.version === 2) ? save : null;
    } catch {
      return null;
    }
  }

  private persist() {
    try {
      const save: HostSave = { room: this.snap.room!, game: this.snap.game, hostClientId: this.clientId };
      localStorage.setItem(hostSaveKey(this.snap.code), JSON.stringify(save));
      localStorage.setItem('aa2-host-last', this.snap.code);
    } catch {
      /* storage unavailable: the room still works, it just can't be reopened */
    }
  }

  private get room() {
    return this.snap.room!;
  }

  private onConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.send(conn, {
        t: 'info',
        takenCharacters: this.room.members.map((m) => m.character),
        locked: this.room.locked,
        started: this.room.started,
        hostName: this.room.members.find((m) => m.isHost)?.name ?? 'Host',
      });
    });
    conn.on('data', (raw) => this.onGuestMsg(conn, raw as GuestMsg));
    conn.on('close', () => this.onClose(conn));
    conn.on('error', () => this.onClose(conn));
  }

  private onClose(conn: DataConnection) {
    const member = this.room.members.find((m) => m.peerId === conn.peer);
    if (member && this.conns.get(member.clientId) === conn) {
      this.conns.delete(member.clientId);
      this.updateRoom((r) => {
        const m = r.members.find((x) => x.clientId === member.clientId)!;
        m.connected = false;
        m.inCall = false;
      });
      // The computer keeps playing for anyone who drops out.
      const g = this.snap.game;
      const p = g?.players.find((x) => x.id === member.playerId);
      if (g && p && !p.out && !p.auto) this.applyAuthority({ type: 'setAuto', playerId: p.id, on: true });
    }
    this.set({ pending: this.snap.pending.filter((p) => p.peerId !== conn.peer) });
  }

  private onGuestMsg(conn: DataConnection, msg: GuestMsg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      const name = String(msg.name ?? '').trim().slice(0, 14) || 'Player';
      const existing = this.room.members.find((m) => m.clientId === msg.clientId && !m.isHost);
      if (existing) {
        this.conns.set(existing.clientId, conn);
        this.updateRoom((r) => {
          const m = r.members.find((x) => x.clientId === existing.clientId)!;
          m.peerId = conn.peer;
          m.connected = true;
        });
        this.send(conn, { t: 'welcome', playerId: existing.playerId });
        this.broadcast();
        return;
      }
      if (this.room.started) return this.send(conn, { t: 'rejected', reason: 'This game has already started.' });
      if (this.room.locked) return this.send(conn, { t: 'rejected', reason: 'This room is locked.' });
      if (this.room.members.length >= RULES.maxPlayers) return this.send(conn, { t: 'rejected', reason: 'This room is full.' });
      const pending: Pending = { clientId: String(msg.clientId), name, character: String(msg.character), peerId: conn.peer };
      this.conns.set(pending.clientId, conn);
      this.set({ pending: [...this.snap.pending.filter((p) => p.clientId !== pending.clientId), pending] });
      this.send(conn, { t: 'waiting' });
      return;
    }
    const member = this.room.members.find((m) => m.peerId === conn.peer && m.connected);
    if (!member) return;
    if (msg.t === 'intent') this.applyFrom(member, msg.action);
    if (msg.t === 'emote') this.emoteFrom(member.playerId, String(msg.text).slice(0, 20));
    if (msg.t === 'media') {
      this.updateRoom((r) => {
        const m = r.members.find((x) => x.clientId === member.clientId)!;
        m.inCall = !!msg.inCall;
        m.mic = !!msg.mic;
        m.cam = !!msg.cam;
      });
    }
  }

  private send(conn: DataConnection, msg: HostMsg) {
    if (conn.open) conn.send(msg);
  }

  private broadcastMsg(msg: HostMsg) {
    for (const m of this.room.members) {
      const c = this.conns.get(m.clientId);
      if (c && m.connected) this.send(c, msg);
    }
  }

  private broadcast() {
    this.broadcastMsg({ t: 'sync', room: this.room, game: this.snap.game, deadline: this.snap.deadline });
    this.media.syncPeers(this.room.members.filter((m) => m.inCall && m.connected).map((m) => m.peerId));
  }

  private updateRoom(fn: (r: RoomInfo) => void) {
    const room = structuredClone(this.room);
    fn(room);
    this.set({ room });
    this.persist();
    this.broadcast();
  }

  accept(clientId: string) {
    const p = this.snap.pending.find((x) => x.clientId === clientId);
    const conn = this.conns.get(clientId);
    if (!p || !conn) return;
    const taken = new Set(this.room.members.map((m) => m.character));
    const character = taken.has(p.character) ? CHARACTERS.find((c) => !taken.has(c.id))!.id : p.character;
    const member: Member = { clientId, playerId: uid(), name: p.name, character, peerId: p.peerId, isHost: false, connected: true, inCall: false, mic: true, cam: false };
    this.set({ pending: this.snap.pending.filter((x) => x.clientId !== clientId) });
    this.send(conn, { t: 'welcome', playerId: member.playerId });
    this.updateRoom((r) => r.members.push(member));
  }

  decline(clientId: string) {
    const conn = this.conns.get(clientId);
    this.set({ pending: this.snap.pending.filter((x) => x.clientId !== clientId) });
    if (conn) {
      this.send(conn, { t: 'rejected', reason: 'The host said no this time.' });
      setTimeout(() => conn.close(), 500);
      this.conns.delete(clientId);
    }
  }

  setLocked(locked: boolean) {
    this.updateRoom((r) => (r.locked = locked));
  }

  removeMember(clientId: string) {
    if (this.room.started) return;
    const conn = this.conns.get(clientId);
    if (conn) {
      this.send(conn, { t: 'rejected', reason: 'The host removed you from the room.' });
      setTimeout(() => conn.close(), 500);
      this.conns.delete(clientId);
    }
    this.updateRoom((r) => (r.members = r.members.filter((m) => m.clientId !== clientId || m.isHost)));
  }

  muteMember(clientId: string) {
    const conn = this.conns.get(clientId);
    if (conn) this.send(conn, { t: 'forceMute' });
  }

  removeFromCall(clientId: string) {
    const conn = this.conns.get(clientId);
    if (conn) this.send(conn, { t: 'removedFromCall' });
  }

  startGame() {
    if (this.room.started || this.room.members.length < RULES.minPlayers) return;
    const game = createGame(this.room.members.map((m) => ({ id: m.playerId, name: m.name, character: m.character })));
    this.set({ game });
    this.updateRoom((r) => {
      r.started = true;
      r.locked = true;
    });
  }

  /** The host's own taps. The host may also end the game. */
  dispatch(action: Action) {
    const me = this.room.members.find((m) => m.isHost);
    if (me) this.applyFrom(me, action);
  }

  private applyFrom(member: Member, action: Action) {
    const game = this.snap.game;
    if (!game) return;
    if (action.type === 'endGame' && !member.isHost) return;
    if (action.type === 'setAuto' && action.playerId !== member.playerId) return;
    if (action.type !== 'endGame' && action.type !== 'setAuto' && cur(game).id !== member.playerId) return;
    this.applyAuthority(action);
  }

  /** Runs an action with the host's authority (timer, computer players). */
  applyAuthority(action: Action) {
    const game = this.snap.game;
    if (!game) return;
    try {
      this.set({ game: reduce(game, action) });
      this.persist();
      this.broadcast();
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
    }
  }

  setDeadline(deadline: number | null) {
    if (deadline === this.snap.deadline) return;
    this.set({ deadline });
    this.broadcast();
  }

  private emoteFrom(playerId: string, text: string) {
    const e: Emote = { key: Date.now() + Math.random(), playerId, text };
    this.addEmote(e);
    this.broadcastMsg({ t: 'emote', ...e });
  }

  emote(text: string) {
    if (this.snap.myPlayerId) this.emoteFrom(this.snap.myPlayerId, text);
  }

  protected onLocalMedia() {
    this.updateRoom((r) => {
      const me = r.members.find((m) => m.isHost);
      if (!me) return;
      me.inCall = this.media.inCall;
      me.mic = this.media.mic;
      me.cam = this.media.cam;
    });
  }

  endRoom() {
    try {
      localStorage.removeItem(hostSaveKey(this.snap.code));
      localStorage.removeItem('aa2-host-last');
    } catch {
      /* ignore */
    }
    this.destroy();
  }
}

// ---------------------------------------------------------------------------

export class GuestSession extends Session {
  private conn: DataConnection | null = null;
  private clientId: string;
  private profile: { name: string; character: string } | null = null;
  private retryTimer: number | undefined;
  private closed = false;
  private wasJoined = false;

  constructor(code: string) {
    super(undefined);
    code = normaliseCode(code);
    this.clientId = clientIdFor(code);
    try {
      const raw = sessionStorage.getItem(`aa2-profile-${code}`);
      if (raw) this.profile = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    this.snap = {
      role: 'guest',
      status: 'connecting',
      code,
      room: null,
      game: null,
      deadline: null,
      pending: [],
      myPlayerId: null,
      myPeerId: null,
      info: null,
      message: null,
      emotes: [],
      welcomeBack: false,
    };
    this.peer.on('open', (id) => {
      this.set({ myPeerId: id });
      this.connect();
    });
    this.peer.on('disconnected', () => this.reconnectLater());
    this.peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'peer-unavailable') {
        this.set({ status: 'lost', message: "Can't find this room. Check the code, or wait for the host to open it." });
        this.scheduleRetry();
        return;
      }
      this.set({ status: 'error', message: friendlyPeerError(type) });
    });
  }

  private connect() {
    if (this.closed) return;
    const conn = this.peer.connect(hostPeerId(this.snap.code), { reliable: true });
    this.conn = conn;
    conn.on('open', () => {
      if (this.profile || this.snap.myPlayerId) this.sendHello();
    });
    conn.on('data', (raw) => this.onHostMsg(raw as HostMsg));
    conn.on('close', () => {
      if (this.conn !== conn || this.closed) return;
      if (this.snap.status !== 'rejected') {
        this.set({ status: 'lost', message: 'Lost connection to the host. Trying again…' });
        this.scheduleRetry();
      }
    });
  }

  private scheduleRetry() {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), 3000);
  }

  private onHostMsg(msg: HostMsg) {
    switch (msg.t) {
      case 'info':
        this.set({ info: msg, status: this.snap.myPlayerId || this.profile ? this.snap.status : 'info', message: null });
        break;
      case 'waiting':
        this.set({ status: 'waiting', message: null });
        break;
      case 'rejected':
        this.profile = null;
        this.set({ status: 'rejected', message: msg.reason });
        break;
      case 'welcome':
        this.set({ status: 'joined', myPlayerId: msg.playerId, message: null });
        if (this.wasJoined) this.set({ welcomeBack: true });
        this.wasJoined = true;
        if (this.media.inCall) this.onLocalMedia();
        break;
      case 'sync': {
        const me = msg.game?.players.find((p) => p.id === this.snap.myPlayerId);
        this.set({ room: msg.room, game: msg.game, deadline: msg.deadline, welcomeBack: this.snap.welcomeBack && !!me?.auto });
        this.media.syncPeers(msg.room.members.filter((m) => m.inCall && m.connected).map((m) => m.peerId));
        break;
      }
      case 'emote':
        this.addEmote({ key: msg.key, playerId: msg.playerId, text: msg.text });
        break;
      case 'forceMute':
        this.media.setMic(false);
        break;
      case 'removedFromCall':
        this.media.leave();
        break;
    }
  }

  join(name: string, character: string) {
    this.profile = { name, character };
    try {
      sessionStorage.setItem(`aa2-profile-${this.snap.code}`, JSON.stringify(this.profile));
    } catch {
      /* ignore */
    }
    this.sendHello();
  }

  private sendHello() {
    const p = this.profile ?? { name: 'Player', character: 'kangaroo' };
    this.post({ t: 'hello', clientId: this.clientId, name: p.name, character: p.character });
  }

  private post(msg: GuestMsg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  dispatch(action: Action) {
    this.post({ t: 'intent', action });
  }

  emote(text: string) {
    this.post({ t: 'emote', text });
  }

  protected onLocalMedia() {
    this.post({ t: 'media', inCall: this.media.inCall, mic: this.media.mic, cam: this.media.cam });
  }

  leaveRoom() {
    this.closed = true;
    window.clearTimeout(this.retryTimer);
    this.destroy();
  }
}
