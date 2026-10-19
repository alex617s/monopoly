import { useEffect, useRef, useState } from 'react';
import { Sfx, sfx } from '../audio/sound';
import { GODS } from '../data/content';
import { ROADS } from '../data/map';
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
  | { kind: 'spin'; playerId: string; wheels: number[]; remote: boolean }
  | { kind: 'line'; playerId: string | null; text: string; tone: 'good' | 'bad' | 'info' }
  | { kind: 'notice'; playerId: string | null; title: string; text: string; art: string | null; tone: 'good' | 'bad' | 'info'; days: number | null };

export interface Display {
  pos: Record<string, number>;
  hopping: string | null;
  focus: string | null;
  busy: boolean;
  overlay: Overlay | null;
  bubbles: Bubble[];
  toasts: Toast[];
  pops: MoneyPop[];
  /** Someone on a plane right now. */
  flight: { playerId: string; from: number; to: number; key: number } | null;
  /** Someone taking a slow step (on the ferry). */
  slow: string | null;
  /** A building going up right now, which the map animates. */
  building: { plot: number; level: number; key: number } | null;
  skip: () => void;
}

/** The sound that goes with a message from the rules. */
function toastSound(text: string): Sfx | null {
  if (/passed START/.test(text)) return 'start';
  if (/goes to Jail/.test(text)) return 'jail';
  if (/goes to Hospital/.test(text)) return 'hospital';
  if (/banana|SPLASH/i.test(text)) return 'banana';
  if (/firework|BOOM/i.test(text)) return 'rocket';
  // building already chimes on its own build event
  if (/ turned /.test(text)) return 'build';
  if (/ card/.test(text)) return 'card';
  if (/ bought .+ for \$/.test(text)) return 'buy';
  if (/the bank\.$/.test(text)) return 'bank';
  return null;
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
  const toasts: Toast[] = [];
  const [pops, setPops] = useState<MoneyPop[]>([]);
  const [building, setBuilding] = useState<Display['building']>(null);
  const [flight, setFlight] = useState<Display['flight']>(null);
  const [slow, setSlow] = useState<string | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
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
      setSlow(null);
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
        sfx('spin');
        setOverlay({ kind: 'spin', playerId: e.playerId, wheels: e.wheels, remote: e.remote });
        await wait(2300);
        setOverlay(null);
        return;
      case 'step': {
        setFocus(e.playerId);
        const from = posRef.current[e.playerId];
        const byBoat = ROADS[e.to].disc === 'ferry' || (from !== undefined && ROADS[from].disc === 'ferry');
        const riding = !!latest.current.players.find((p) => p.id === e.playerId)?.vehicle;
        setSlow(byBoat ? e.playerId : null);
        setHopping(riding || byBoat ? null : e.playerId);
        sfx('step');
        setPos((p) => ({ ...p, [e.playerId]: e.to }));
        await sleep(byBoat ? 750 : 270);
        setHopping(null);
        return;
      }
      case 'fly':
        setFocus(e.playerId);
        sfx('start');
        setFlight({ playerId: e.playerId, from: e.from, to: e.to, key: e.seq });
        // the camera pulls back first (0.7s), then the plane flies (3s)
        await sleep(3800);
        setPos((p) => ({ ...p, [e.playerId]: e.to }));
        setFlight(null);
        await sleep(300);
        return;
      case 'jump':
        await sleep(300);
        setFocus(e.playerId);
        setPos((p) => ({ ...p, [e.playerId]: e.to }));
        await sleep(500);
        return;
      case 'toast': {
        // A big notice card right after says the same thing, so skip the line.
        if (queue.current[0]?.type === 'notice') return;
        const sound = toastSound(e.text);
        if (sound) sfx(sound);
        const who = latest.current.players.filter((p) => e.text.includes(p.name)).sort((a, b) => e.text.indexOf(a.name) - e.text.indexOf(b.name))[0];
        setOverlay({ kind: 'line', playerId: who?.id ?? null, text: e.text, tone: e.tone });
        await wait(1800);
        setOverlay(null);
        await sleep(80);
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
        // paying for a building: the build chime is enough
        if (queue.current[0]?.type !== 'build') sfx(e.amount > 0 ? 'coin' : 'pay');
        setPops((p) => [...p, { key, playerId: e.playerId, amount: e.amount }]);
        setTimeout(() => setPops((p) => p.filter((x) => x.key !== key)), 1800);
        return;
      }
      case 'god':
        if (e.joined) sfx(GODS[e.god].good ? 'goodGod' : 'badGod');
        // the notice card that follows has its own sound
        await sleep(200);
        return;
      case 'news':
        sfx('news');
        setOverlay({ kind: 'news', headline: e.headline, text: e.text, day: e.day });
        await wait(3600);
        setOverlay(null);
        return;
      case 'chance':
        sfx('chance');
        setOverlay({ kind: 'chance', playerId: e.playerId, text: e.text });
        await wait(2800);
        setOverlay(null);
        return;
      case 'lastRound':
        sfx('lastRound');
        setOverlay({ kind: 'lastRound' });
        await wait(2600);
        setOverlay(null);
        return;
      case 'notice':
        if (!e.art?.startsWith('god-')) sfx(e.tone === 'bad' ? 'badGod' : e.tone === 'good' ? 'chance' : 'card');
        setOverlay({ kind: 'notice', playerId: e.playerId, title: e.title, text: e.text, art: e.art, tone: e.tone, days: e.days });
        await wait(2600);
        setOverlay(null);
        return;
      case 'build':
        sfx('build');
        setBuilding({ plot: e.plot, level: e.level, key: e.seq });
        await sleep(1500);
        setBuilding(null);
        return;
      case 'over':
        sfx('win');
        await sleep(400);
        return;
    }
  }

  return { pos, hopping, focus, busy, overlay, bubbles, toasts, pops, building, flight, slow, skip: () => skipWait.current?.() };
}
