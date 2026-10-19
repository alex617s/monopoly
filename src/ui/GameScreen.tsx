import { CSSProperties, ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { audioSettings, setAudioSettings, setMusic, setTapSounds, sfx, subscribeAudio } from '../audio/sound';
import { GODS } from '../data/content';
import { MiniMap } from '../map/MiniMap';
import { Scene } from '../map/Scene';
import { totalAssets } from '../game/engine';
import type { Action, GameState } from '../game/types';
import { Avatar, Icon, Modal, money } from './common';
import { OverlayView, Podium } from './overlays';
import { BankPanel, BuildPanel, BuyPanel, FlightPanel, HowToPlay, PlayerDetail, PlotDetail, ReleasePanel, Shop, UseDrawer } from './panels';
import { useEventPlayer } from './useEventPlayer';

export interface EmoteBubble {
  key: number;
  playerId: string;
  text: string;
}

interface Props {
  state: GameState;
  /** Players this screen may act for. */
  myIds: string[];
  dispatch: (a: Action) => void;
  isHost: boolean;
  deadline: number | null;
  onExit: () => void;
  exitLabel: string;
  onAgain?: () => void;
  roomCode?: string;
  side?: ReactNode;
  emotes?: EmoteBubble[];
  onEmote?: (playerId: string, text: string) => void;
}

const EMOTES = ['Ha ha!', 'Oh no!', 'Yay!', 'Grrr!', "G'day!", 'Hurry up!'];

export function GameScreen({ state, myIds, dispatch, isHost, deadline, onExit, exitLabel, onAgain, roomCode, side, emotes = [], onEmote }: Props) {
  const display = useEventPlayer(state);
  const [overview, setOverview] = useState(false);
  const [drawer, setDrawer] = useState<'card' | 'item' | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [plotInfo, setPlotInfo] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const current = state.players[state.current];
  const mine = myIds.includes(current.id) && !current.auto;
  const pend = state.pending;
  const ready = !display.busy && !state.over && !!pend;
  const myTurnReady = ready && mine;

  const audio = useSyncExternalStore(subscribeAudio, audioSettings);
  const tense = !!state.lastRound && !state.over;
  useEffect(() => {
    setMusic(state.over ? null : tense ? 'last' : 'main');
    setTapSounds(true);
  }, [tense, state.over]);
  const forkNow = myTurnReady && pend?.kind === 'fork';
  useEffect(() => {
    if (forkNow) sfx('fork');
  }, [forkNow]);

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);

  const ranking = useMemo(
    () =>
      state.players
        .map((p) => ({ p, total: p.out ? -1 : totalAssets(state, p) }))
        .sort((a, b) => b.total - a.total),
    [state],
  );

  const bubbles = [...display.bubbles, ...emotes];
  const latestNews = [...state.log].reverse().find((l) => l.startsWith('Day '));
  const focusP = state.players.find((p) => p.id === display.focus) ?? current;
  const meForEmote = myIds.find((id) => state.players.some((p) => p.id === id && !p.out)) ?? myIds[0];
  const secondsLeft = deadline && myTurnReady ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  let panel: ReactNode = null;
  if (myTurnReady && pend) {
    if (pend.kind === 'buy') panel = <BuyPanel state={state} plot={pend.plot} dispatch={dispatch} />;
    else if (pend.kind === 'build') panel = <BuildPanel key={`${pend.plot}-${pend.step}`} state={state} plot={pend.plot} step={pend.step} passing={pend.passing} dispatch={dispatch} />;
    else if (pend.kind === 'flight') panel = <FlightPanel to={pend.to} fee={pend.fee} dispatch={dispatch} />;
    else if (pend.kind === 'release') panel = <ReleasePanel state={state} fee={pend.fee} place={pend.place} dispatch={dispatch} />;
    else if (pend.kind === 'fork')
      panel = (
        <div className="decision decision--slim">
          <p className="decision__title">Which way? Tap a sign on the map.</p>
        </div>
      );
  }

  return (
    <div className="game">
      <Scene
        state={state}
        display={{ ...display, bubbles }}
        overview={overview}
        forkOptions={myTurnReady && pend?.kind === 'fork' ? pend.options : null}
        onFork={(to) => dispatch({ type: 'fork', to })}
        onPlot={setPlotInfo}
      />

      <section className="hud-card" style={{ '--c': focusP.color } as CSSProperties} aria-label="Current player">
        <div className="hud-card__top">
          <Avatar character={focusP.character} size={64} ring={focusP.color} />
          <div>
            <div className="hud-card__name">{focusP.name}</div>
            <div className="pill" style={{ background: focusP.color }}>
              {focusP.id === current.id ? (mine ? 'YOUR TURN' : current.auto ? 'COMPUTER' : 'PLAYING') : 'MOVING'}
            </div>
          </div>
        </div>
        <div className="stat stat--cash">
          <Icon name="coin" /> <span>Cash</span> <b>{money(focusP.cash)}</b>
        </div>
        <div className="stat stat--save">
          <Icon name="piggy" /> <span>Savings</span> <b>{money(focusP.savings)}</b>
        </div>
        <div className="stat stat--total">
          <Icon name="chart" /> <span>Total assets</span> <b>{money(totalAssets(state, focusP))}</b>
        </div>
        <div className="chips">
          <span className="chip chip--dark" title="Gems: spend them in the shops">
            <Icon name="gem" size={18} /> {focusP.points} <small>gems</small>
          </span>
          {focusP.god && (
            <span className="chip" style={{ borderColor: GODS[focusP.god.id].color }}>
              {GODS[focusP.god.id].name} · {focusP.god.days}d
            </span>
          )}
          {focusP.vehicle && (
            <span className="chip">
              <Icon name={focusP.vehicle.kind} size={16} /> {focusP.vehicle.days}d
            </span>
          )}
          {focusP.balloon !== null && <span className="chip chip--warn">Water balloon {focusP.balloon}d</span>}
          {focusP.rescues > 0 && <span className="chip chip--warn">Rescued</span>}
        </div>
        {secondsLeft !== null && (
          <div className="timer" aria-label={`${secondsLeft} seconds left`}>
            <div className={`timer__bar ${secondsLeft <= 8 ? 'timer__bar--low' : ''}`} style={{ width: `${(secondsLeft / 30) * 100}%` }} />
          </div>
        )}
      </section>

      <div className="topline">
        <div className="day">
          <small>DAY</small>
          <b>{state.day}</b>
        </div>
        <div className="ticker">
          <span className="ticker__tag">{state.lastRound ? 'LAST ROUND' : 'NEWS'}</span>
          <span>{state.lastRound ? 'Everyone gets one more turn!' : latestNews ? latestNews.replace(/^Day \d+ news: /, '') : 'Welcome to the Australian Adventure!'}</span>
        </div>
        {roomCode && <div className="room">Room {roomCode}</div>}
      </div>

      <section className="board-list" aria-label="Rankings">
        {ranking.map(({ p, total }, i) => (
          <button
            key={p.id}
            type="button"
            className={`rank ${p.id === current.id ? 'rank--now' : ''} ${p.out ? 'rank--out' : ''}`}
            style={{ '--c': p.color } as CSSProperties}
            onClick={() => setDetail(p.id)}
          >
            <span className="rank__n">{i + 1}</span>
            <Avatar character={p.character} size={40} ring={p.color} />
            <span className="rank__who">
              <b>{p.name}</b>
              <small>Cash {money(p.cash)}</small>
            </span>
            <span className="rank__total">{p.out ? 'Out' : money(total)}</span>
          </button>
        ))}
        {side}
      </section>

      <div className="toasts" aria-live="polite">
        {display.toasts.map((t) => (
          <div key={t.key} className={`toast toast--${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>

      {panel && <div className="panel-wrap">{panel}</div>}
      {!mine && ready && !state.over && (
        <div className="waiting">
          <Avatar character={current.character} size={32} ring={current.color} /> {current.auto ? `${current.name} (computer) is thinking…` : `Waiting for ${current.name}…`}
        </div>
      )}

      <nav className="dock" aria-label="Actions">
        <button type="button" className="dock__btn dock__btn--cards" onClick={() => setDrawer('card')}>
          <Icon name="cards" size={30} /> Cards
          {current && mine && <span className="badge">{current.cards.length}</span>}
        </button>
        <button type="button" className="dock__btn dock__btn--items" onClick={() => setDrawer('item')}>
          <Icon name="bag" size={30} /> Items
          {current && mine && <span className="badge">{current.items.length}</span>}
        </button>
        <button type="button" className="spin-btn" disabled={!(myTurnReady && pend?.kind === 'pre')} onClick={() => dispatch({ type: 'spin' })} aria-label="Spin to move">
          <Icon name="dice" size={44} />
          SPIN
        </button>
        <button type="button" className="dock__btn dock__btn--places" onClick={() => setDetail(meForEmote ?? current.id)}>
          <Icon name="house" size={30} /> Places
        </button>
        <button type="button" className="dock__btn dock__btn--map" onClick={() => setOverview((v) => !v)}>
          <Icon name="map" size={30} /> {overview ? 'Follow' : 'Map'}
        </button>
      </nav>

      <div className="corner-btns">
        <button type="button" className="round" aria-label="Menu" onClick={() => setMenu(true)}>
          <Icon name="menu" size={26} />
        </button>
        {onEmote && meForEmote && (
          <button type="button" className="round" aria-label="Send a reaction" onClick={() => setEmoteOpen((v) => !v)}>
            <Icon name="smile" size={28} />
          </button>
        )}
        {emoteOpen && onEmote && meForEmote && (
          <div className="emote-pop">
            {EMOTES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onEmote(meForEmote, e);
                  setEmoteOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      <MiniMap state={state} display={display} onOpen={() => setOverview((v) => !v)} />

      {display.overlay && <OverlayView overlay={display.overlay} state={state} onSkip={display.skip} />}
      {myTurnReady && pend?.kind === 'bank' && <BankPanel key={state.turnSeq} state={state} dispatch={dispatch} />}
      {myTurnReady && pend?.kind === 'shop' && <Shop state={state} kind={pend.shop} dispatch={dispatch} />}
      {drawer && <UseDrawer state={state} kind={drawer} canUse={myTurnReady && pend?.kind === 'pre'} dispatch={dispatch} onClose={() => setDrawer(null)} />}
      {detail && <PlayerDetail state={state} player={state.players.find((p) => p.id === detail)!} onClose={() => setDetail(null)} />}
      {plotInfo !== null && <PlotDetail state={state} plot={plotInfo} onClose={() => setPlotInfo(null)} />}
      {help && <HowToPlay onClose={() => setHelp(false)} />}
      {menu && (
        <Modal label="Menu" onClose={() => setMenu(false)} className="menu">
          <h2>Menu</h2>
          <button type="button" className="btn btn--wide" onClick={() => { setMenu(false); setHelp(true); }}>
            How to Play
          </button>
          <div className="menu__row">
            <button type="button" className={`btn ${audio.music ? 'btn--blue' : ''}`} onClick={() => setAudioSettings({ music: !audio.music })}>
              Music: {audio.music ? 'ON' : 'OFF'}
            </button>
            <button type="button" className={`btn ${audio.sound ? 'btn--blue' : ''}`} onClick={() => setAudioSettings({ sound: !audio.sound })}>
              Sound: {audio.sound ? 'ON' : 'OFF'}
            </button>
          </div>
          <label className="menu__slider" htmlFor="music-volume">
            Music volume
            <input id="music-volume" type="range" min="0" max="100" value={Math.round(audio.musicVolume * 100)} onChange={(e) => setAudioSettings({ musicVolume: Number(e.target.value) / 100 })} />
          </label>
          <label className="menu__slider" htmlFor="sound-volume">
            Sound volume
            <input id="sound-volume" type="range" min="0" max="100" value={Math.round(audio.soundVolume * 100)} onChange={(e) => setAudioSettings({ soundVolume: Number(e.target.value) / 100 })} />
          </label>
          {myIds.map((id) => {
            const p = state.players.find((x) => x.id === id);
            if (!p || p.out) return null;
            return (
              <button key={id} type="button" className={`btn btn--wide ${p.auto ? 'btn--dark' : ''}`} onClick={() => dispatch({ type: 'setAuto', playerId: id, on: !p.auto })}>
                Auto Play for {p.name}: {p.auto ? 'ON' : 'OFF'}
              </button>
            );
          })}
          {isHost && (
            <button type="button" className="btn btn--wide btn--gold" disabled={!!state.lastRound || state.over} onClick={() => { dispatch({ type: 'endGame' }); setMenu(false); }}>
              {state.lastRound ? 'Last round is on' : 'End Game (last round)'}
            </button>
          )}
          <button type="button" className="btn btn--wide btn--red" onClick={() => { setMenu(false); onExit(); }}>
            {exitLabel}
          </button>
          <button type="button" className="btn btn--wide btn--ghost" onClick={() => setMenu(false)}>
            Close
          </button>
        </Modal>
      )}
      {state.over && !display.busy && <Podium state={state} onHome={onExit} onAgain={onAgain} />}
    </div>
  );
}
