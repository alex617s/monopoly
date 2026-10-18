import { useEffect, useRef, useState } from 'react';
import type { GameEvent, GameState } from '../game/types';

export interface Bubble {
  key: number;
  playerId: string;
  text: string;
}
export interface Toast {
  key: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}
export interface MoneyPop {
  key: number;
  playerId: string;
  amount: number;
}
export type Overlay =
  | { kind: 'news'; headline: string; text: string; day: number }
  | { kind: 'chance'; playerId: string; text: string }
  | { kind: 'lastRound' }
  | { kind: 'spin'; playerId: string; wheels: number[]; remote: boolean };

export interface Display {
  pos: Record<string, number>;
  hopping: string | null;
  focus: string | null;
  busy: boolean;
  overlay: Overlay | null;
  bubbles: Bubble[];
  toasts: Toast[];
  pops: MoneyPop[];
  skip: () => void;
}

const positions = (s: GameState) => Object.fromEntries(s.players.map((p) => [p.id, p.pos]));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The rules resolve a whole move at once; this replays the events one by one
 * so players can follow the spin, every hop and every surprise.
 */
export function useEventPlayer(state: GameState): Display {
  const [pos, setPos] = useState(() => positions(state));
  const [hopping, setHopping] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(state.players[state.current]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pops, setPops] = useState<MoneyPop[]>([]);
  const lastSeq = useRef(state.eventSeq);
  const queue = useRef<GameEvent[]>([]);
  const running = useRef(false);
  const latest = useRef(state);
  const skipWait = useRef<(() => void) | null>(null);
  latest.current = state;

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        skipWait.current = null;
        resolve();
      }
      skipWait.current = done;
    });

  useEffect(() => {
    const fresh = state.events.filter((e) => e.seq > lastSeq.current);
    if (!fresh.length) {
      if (!running.current) setPos(positions(state));
      return;
    }
    lastSeq.current = fresh[fresh.length - 1].seq;
    queue.current.push(...fresh);
    if (running.current) return;
    running.current = true;
    setBusy(true);
    (async () => {
      while (queue.current.length) {
        const e = queue.current.shift()!;
        await play(e);
      }
      running.current = false;
      setHopping(null);
      setPos(positions(latest.current));
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function play(e: GameEvent) {
    switch (e.type) {
      case 'turn':
        setFocus(e.playerId);
        await sleep(150);
        return;
      case 'spin':
        setFocus(e.playerId);
        setOverlay({ kind: 'spin', playerId: e.playerId, wheels: e.wheels, remote: e.remote });
        await wait(2300);
        setOverlay(null);
        return;
      case 'step':
        setFocus(e.playerId);
        setHopping(e.playerId);
        setPos((p) => ({ ...p, [e.playerId]: e.to }));
        await sleep(270);
        setHopping(null);
        return;
      case 'jump':
        await sleep(300);
        setFocus(e.playerId);
        setPos((p) => ({ ...p, [e.playerId]: e.to }));
        await sleep(500);
        return;
      case 'toast': {
        const key = e.seq;
        setToasts((t) => [...t.slice(-3), { key, text: e.text, tone: e.tone }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 3200);
        await sleep(120);
        return;
      }
      case 'say': {
        const key = e.seq;
        setBubbles((b) => [...b.filter((x) => x.playerId !== e.playerId), { key, playerId: e.playerId, text: e.text }]);
        setTimeout(() => setBubbles((b) => b.filter((x) => x.key !== key)), 2800);
        return;
      }
      case 'money': {
        const key = e.seq;
        setPops((p) => [...p, { key, playerId: e.playerId, amount: e.amount }]);
        setTimeout(() => setPops((p) => p.filter((x) => x.key !== key)), 1800);
        return;
      }
      case 'god':
        await sleep(200);
        return;
      case 'news':
        setOverlay({ kind: 'news', headline: e.headline, text: e.text, day: e.day });
        await wait(3600);
        setOverlay(null);
        return;
      case 'chance':
        setOverlay({ kind: 'chance', playerId: e.playerId, text: e.text });
        await wait(2800);
        setOverlay(null);
        return;
      case 'lastRound':
        setOverlay({ kind: 'lastRound' });
        await wait(2600);
        setOverlay(null);
        return;
      case 'over':
        await sleep(400);
        return;
    }
  }

  return { pos, hopping, focus, busy, overlay, bubbles, toasts, pops, skip: () => skipWait.current?.() };
}
