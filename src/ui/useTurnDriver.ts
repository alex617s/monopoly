import { useEffect, useRef, useState } from 'react';
import { RULES } from '../data/rules';
import { aiAction } from '../game/ai';
import { cur } from '../game/engine';
import type { Action, GameEvent, GameState } from '../game/types';

/** How long the screen needs to play these events, so the computer waits its turn. */
export function animationMs(events: GameEvent[]) {
  let ms = 0;
  for (const e of events) {
    if (e.type === 'spin') ms += 2400;
    else if (e.type === 'step') ms += 270;
    else if (e.type === 'jump') ms += 800;
    else if (e.type === 'fly') ms += 3600;
    else if (e.type === 'news') ms += 3700;
    else if (e.type === 'chance') ms += 2900;
    else if (e.type === 'lastRound') ms += 2700;
    else if (e.type === 'toast') ms += 1900;
    else if (e.type === 'turn') ms += 150;
    else if (e.type === 'notice') ms += 2700;
    else if (e.type === 'build') ms += 1550;
  }
  return ms;
}

/**
 * Runs the clock: computer players move after the animations, and a human who
 * does not answer within the turn time gets the computer's choice.
 * Only the device that owns the game (local or online host) runs this.
 */
export function useTurnDriver(state: GameState | null, act: (a: Action) => void, enabled: boolean) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const seen = useRef(state?.eventSeq ?? 0);
  const busyUntil = useRef(0);
  const actRef = useRef(act);
  actRef.current = act;

  useEffect(() => {
    if (!state) return;
    const fresh = state.events.filter((e) => e.seq > seen.current);
    seen.current = state.eventSeq;
    const now = Date.now();
    busyUntil.current = Math.max(busyUntil.current, now) + animationMs(fresh);
    if (!enabled || state.over || !state.pending) {
      setDeadline(null);
      return;
    }
    const p = cur(state);
    const wait = Math.max(0, busyUntil.current - now);
    let t: ReturnType<typeof setTimeout>;
    if (p.auto) {
      setDeadline(null);
      t = setTimeout(() => actRef.current(aiAction(state)), wait + 800);
    } else {
      const total = wait + RULES.turnSeconds * 1000;
      setDeadline(now + total);
      t = setTimeout(() => actRef.current(aiAction(state)), total);
    }
    return () => clearTimeout(t);
  }, [state, enabled]);

  return deadline;
}
