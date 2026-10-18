import { useEffect, useState } from 'react';
import { sfx } from '../audio/sound';
import { CARDS, CARD_IDS, CardId, GODS, ITEMS, ITEM_IDS, ItemId, characterById } from '../data/content';
import { PLOTS, REGIONS, regionById } from '../data/map';
import { BUILDINGS, RULES, SPECIALS, SpecialId } from '../data/rules';
import { buildCost, landValue, tollFor, totalAssets } from '../game/engine';
import type { Action, GameState, PlayerState } from '../game/types';
import { Avatar, Icon, Modal, art, money } from './common';

type Dispatch = (a: Action) => void;

// ------------------------------------------------------------------ decisions

export function BuyPanel({ state, plot, dispatch }: { state: GameState; plot: number; dispatch: Dispatch }) {
  const info = PLOTS[plot];
  const region = regionById(info.region);
  const p = state.players[state.current];
  return (
    <div className="decision">
      <div className="deed" style={{ borderColor: region.color }}>
        <div className="deed__head" style={{ background: region.color }}>
          <small>{region.name}</small>
          <strong>{info.name}</strong>
        </div>
        <div className="deed__rows">
          <span>Price</span>
          <b>{money(info.price)}</b>
          <span>Toll now</span>
          <b>{money(Math.round(info.price * RULES.tollRate[0]))}</b>
          <span>Toll as skyscraper</span>
          <b>{money(Math.round(info.price * RULES.tollRate[5]))}</b>
        </div>
      </div>
      <div className="decision__buttons">
        <button type="button" className="btn btn--go btn--big" disabled={p.cash < info.price} onClick={() => dispatch({ type: 'buy', yes: true })}>
          Buy {money(info.price)}
        </button>
        <button type="button" className="btn btn--big" onClick={() => dispatch({ type: 'buy', yes: false })}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function BuildPanel({ state, plot, step, passing, dispatch }: { state: GameState; plot: number; step: number; passing: boolean; dispatch: Dispatch }) {
  const info = PLOTS[plot];
  const level = state.plots[plot].level;
  const cost = buildCost(plot);
  const next = BUILDINGS[Math.min(RULES.maxLevel, level + 1)];
  return (
    <div className="decision">
      <p className="decision__title">
        {step > 1 ? 'Build one more level' : passing ? 'Passing your land' : 'Your land'}: <b>{info.name}</b>
      </p>
      <p className="decision__sub">
        {BUILDINGS[level]} → <b>{next}</b> for {money(cost)}
      </p>
      <div className="decision__buttons">
        <button type="button" className="btn btn--go btn--big" disabled={state.players[state.current].cash < cost} onClick={() => dispatch({ type: 'build', levels: 1 })}>
          Build a {next}
        </button>
        <button type="button" className="btn btn--big" onClick={() => dispatch({ type: 'build', levels: 0 })}>
          Not now
        </button>
      </div>
    </div>
  );
}

export function FlightPanel({ to, fee, dispatch }: { to: number; fee: number; dispatch: Dispatch }) {
  const far = PLOTS.find((pl) => pl.road > to - 3 && pl.road < to + 3);
  const city = far ? regionById(far.region).name : 'the other airport';
  return (
    <div className="decision">
      <p className="decision__title">✈ Fly to {city.charAt(0) + city.slice(1).toLowerCase()}?</p>
      <p className="decision__sub">A plane ticket costs {money(fee)}. You land at the other airport.</p>
      <div className="decision__buttons">
        <button type="button" className="btn btn--blue btn--big" onClick={() => dispatch({ type: 'fly', yes: true })}>
          Fly for {money(fee)}
        </button>
        <button type="button" className="btn btn--big" onClick={() => dispatch({ type: 'fly', yes: false })}>
          Stay here
        </button>
      </div>
    </div>
  );
}

export function ReleasePanel({ state, fee, place, dispatch }: { state: GameState; fee: number; place: 'hospital' | 'jail'; dispatch: Dispatch }) {
  const p = state.players[state.current];
  return (
    <div className="decision">
      <p className="decision__title">
        {p.name} is in {place === 'jail' ? 'Jail' : 'Hospital'} ({p.skip} turn{p.skip > 1 ? 's' : ''} left)
      </p>
      <div className="decision__buttons">
        <button type="button" className="btn btn--go btn--big" disabled={p.cash < fee} onClick={() => dispatch({ type: 'release', pay: true })}>
          Pay {money(fee)} to leave
        </button>
        <button type="button" className="btn btn--big" onClick={() => dispatch({ type: 'release', pay: false })}>
          Stay
        </button>
      </div>
    </div>
  );
}

export function BankPanel({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const p = state.players[state.current];
  const [amount, setAmount] = useState(0);
  const after = { cash: p.cash - amount, savings: p.savings + amount };
  const step = (d: number) => setAmount((a) => Math.max(-p.savings, Math.min(p.cash, a + d)));
  return (
    <Modal label="Bank" className="bank">
      <h2>Aussie Bank</h2>
      <p className="muted">Savings earn {Math.round(RULES.interestRate * 100)}% every day, and cards and gods cannot touch them. Tolls are paid from cash first.</p>
      <div className="bank__grid">
        <div>
          <Icon name="coin" size={30} />
          <span>Cash</span>
          <b>{money(after.cash)}</b>
        </div>
        <div>
          <Icon name="piggy" size={30} />
          <span>Savings</span>
          <b>{money(after.savings)}</b>
        </div>
      </div>
      <div className="bank__buttons">
        <button type="button" className="btn" onClick={() => step(-100)} disabled={after.savings < 100}>
          Take out $100
        </button>
        <button type="button" className="btn" onClick={() => step(100)} disabled={after.cash < 100}>
          Save $100
        </button>
        <button type="button" className="btn" onClick={() => setAmount(-p.savings)} disabled={!p.savings}>
          Take out all
        </button>
        <button type="button" className="btn" onClick={() => setAmount(p.cash)} disabled={!p.cash}>
          Save all
        </button>
      </div>
      <button type="button" className="btn btn--go btn--big btn--wide" onClick={() => dispatch({ type: 'bank', amount })}>
        {amount === 0 ? 'No thanks' : 'Done'}
      </button>
    </Modal>
  );
}

// ------------------------------------------------------------------ shops

export function Shop({ state, kind, dispatch }: { state: GameState; kind: 'card' | 'item'; dispatch: Dispatch }) {
  const p = state.players[state.current];
  const ids = kind === 'card' ? CARD_IDS : ITEM_IDS;
  useEffect(() => sfx('shop'), []);
  const keeper = kind === 'card' ? { name: 'Koala Kate', pic: 'koala-card', line: `G'day, ${p.name}! Pick a card.` } : { name: 'Tess the Turtle', pic: 'turtle-card', line: `Need a ride, ${p.name}? Scooters are popular!` };
  return (
    <div className={`shop shop--${kind}`} role="dialog" aria-label={kind === 'card' ? 'Card Shop' : 'Item Shop'}>
      <div className="shop__awning" aria-hidden="true" />
      <header className="shop__top">
        <h2>{kind === 'card' ? `${keeper.name}'s Card Shop` : `${keeper.name}'s Item Shop`}</h2>
        <div className="shop__right">
          <span className="gems">
            <Icon name="gem" size={26} /> {p.points}
          </span>
          <button type="button" className="btn btn--red" onClick={() => dispatch({ type: 'shopLeave' })}>
            Leave
          </button>
        </div>
      </header>
      <div className="shop__body">
        <aside className="shop__keeper">
          <div className="speech">{keeper.line}</div>
          <img src={art(keeper.pic)} alt={keeper.name} />
          <strong>{keeper.name}</strong>
        </aside>
        <div className="shop__grid">
          {ids.map((id) => {
            const def = kind === 'card' ? CARDS[id as CardId] : ITEMS[id as ItemId];
            const isVehicle = id === 'scooter' || id === 'car';
            const full = kind === 'card' ? p.cards.length >= RULES.maxCards : !isVehicle && p.items.length >= RULES.maxItems;
            return (
              <div key={id} className="ware" style={{ boxShadow: `0 7px 0 ${def.color}, 0 14px 24px rgba(80,40,10,.15)` }}>
                <div className="ware__head">
                  <span className="ware__icon" style={{ background: def.color }}>
                    {def.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <b>{def.name}</b>
                </div>
                <p>{def.desc}</p>
                <div className="ware__foot">
                  <span className="ware__price">
                    <Icon name="gem" size={18} /> {def.price}
                  </span>
                  <button
                    type="button"
                    className="btn btn--small"
                    style={{ background: def.color, color: '#fff' }}
                    disabled={p.points < def.price || full}
                    onClick={() => dispatch({ type: 'shopBuy', id })}
                  >
                    Buy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="shop__tray">
        <b>
          Your {kind === 'card' ? 'cards' : 'items'} {kind === 'card' ? `${p.cards.length}/${RULES.maxCards}` : `${p.items.length}/${RULES.maxItems}`}
        </b>
        {(kind === 'card' ? p.cards.map((c) => CARDS[c].name) : p.items.map((i) => ITEMS[i].name)).map((n, k) => (
          <span key={k} className="tray-chip">
            {n}
          </span>
        ))}
        {kind === 'item' && p.vehicle && <span className="tray-chip tray-chip--ride">Riding a {p.vehicle.kind} ({p.vehicle.days} days)</span>}
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ using cards and items

interface UseProps {
  state: GameState;
  kind: 'card' | 'item';
  canUse: boolean;
  dispatch: Dispatch;
  onClose: () => void;
}

export function UseDrawer({ state, kind, canUse, dispatch, onClose }: UseProps) {
  const p = state.players[state.current];
  const [picked, setPicked] = useState<number | null>(null);
  const list = kind === 'card' ? p.cards : p.items;
  const used = kind === 'card' ? p.usedCard : p.usedItem;
  if (picked !== null) {
    const id = list[picked];
    return (
      <TargetPicker
        state={state}
        kind={kind}
        id={id}
        onCancel={() => setPicked(null)}
        onDone={(extra) => {
          dispatch(kind === 'card' ? { type: 'useCard', index: picked, ...extra } : { type: 'useItem', index: picked, ...extra });
          onClose();
        }}
      />
    );
  }
  return (
    <Modal label={kind === 'card' ? 'Your cards' : 'Your items'} onClose={onClose} className="drawer">
      <h2>
        {p.name}'s {kind === 'card' ? 'cards' : 'items'}
      </h2>
      {!canUse && <p className="muted">You can use these on your turn, before you spin.</p>}
      {canUse && used && <p className="muted">You already used one this turn.</p>}
      {!list.length && <p className="muted">Nothing here yet. Visit the {kind === 'card' ? 'Card Shop or a CARD space' : 'Item Shop'}.</p>}
      <div className="drawer__grid">
        {list.map((id, k) => {
          const def = kind === 'card' ? CARDS[id as CardId] : ITEMS[id as ItemId];
          const passive = id === 'getOutFree';
          return (
            <button key={k} type="button" className="ware ware--button" style={{ borderColor: def.color }} disabled={!canUse || used || passive} onClick={() => setPicked(k)}>
              <div className="ware__head">
                <span className="ware__icon" style={{ background: def.color }}>
                  {def.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <b>{def.name}</b>
              </div>
              <p>{passive ? 'Works by itself when you need it.' : def.desc}</p>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn btn--wide" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}

type Extra = { target?: string; plot?: number; plot2?: number; region?: string; special?: SpecialId; distance?: number; value?: number };

function TargetPicker({ state, kind, id, onCancel, onDone }: { state: GameState; kind: 'card' | 'item'; id: string; onCancel: () => void; onDone: (e: Extra) => void }) {
  const p = state.players[state.current];
  const def = kind === 'card' ? CARDS[id as CardId] : ITEMS[id as ItemId];
  const target = def.target;
  const [first, setFirst] = useState<number | null>(null);
  const others = state.players.filter((o) => !o.out && o.id !== p.id);
  const myPlots = PLOTS.filter((pl) => state.plots[pl.id].owner === p.id);

  let body;
  if (target === 'none') {
    body = (
      <button type="button" className="btn btn--go btn--big btn--wide" onClick={() => onDone({})}>
        Use {def.name}
      </button>
    );
  } else if (target === 'player') {
    body = (
      <div className="pick-grid">
        {others.map((o) => (
          <button key={o.id} type="button" className="pick" onClick={() => onDone({ target: o.id })}>
            <Avatar character={o.character} size={52} ring={o.color} />
            <b>{o.name}</b>
          </button>
        ))}
      </div>
    );
  } else if (target === 'value' || target === 'distance') {
    body = (
      <div className="pick-row">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" className="btn btn--big" onClick={() => onDone(target === 'value' ? { value: n } : { distance: n })}>
            {n}
          </button>
        ))}
      </div>
    );
  } else if (target === 'myRegion') {
    const regions = REGIONS.filter((r) => myPlots.some((pl) => pl.region === r.id));
    body = regions.length ? (
      <div className="pick-grid">
        {regions.map((r) => (
          <button key={r.id} type="button" className="pick" style={{ borderColor: r.color }} onClick={() => onDone({ region: r.id })}>
            <b>{r.name}</b>
          </button>
        ))}
      </div>
    ) : (
      <p className="muted">You need to own a place first.</p>
    );
  } else if (target === 'anyPlot' || target === 'rebuild' || target === 'swap') {
    const pool =
      target === 'rebuild'
        ? myPlots.filter((pl) => state.plots[pl.id].level >= 3 && !state.plots[pl.id].special)
        : target === 'swap' && first !== null
          ? PLOTS.filter((pl) => state.plots[pl.id].owner && state.plots[pl.id].owner !== p.id)
          : target === 'swap'
            ? myPlots
            : PLOTS.filter((pl) => state.plots[pl.id].owner);
    if (target === 'rebuild' && first !== null) {
      body = (
        <div className="pick-grid">
          {(Object.keys(SPECIALS) as SpecialId[]).map((sp) => (
            <button key={sp} type="button" className="pick" onClick={() => onDone({ plot: first, special: sp })}>
              <b>{SPECIALS[sp].name}</b>
              <small>{SPECIALS[sp].desc}</small>
            </button>
          ))}
        </div>
      );
    } else {
      body = pool.length ? (
        <div className="pick-list">
          {pool.map((pl) => {
            const ps = state.plots[pl.id];
            const owner = state.players.find((o) => o.id === ps.owner);
            return (
              <button
                key={pl.id}
                type="button"
                className="pick pick--wide"
                style={{ borderColor: owner?.color }}
                onClick={() => {
                  if (target === 'anyPlot') onDone({ plot: pl.id });
                  else if (target === 'swap' && first === null) setFirst(pl.id);
                  else if (target === 'swap') onDone({ plot: first!, plot2: pl.id });
                  else setFirst(pl.id);
                }}
              >
                <b>{pl.name}</b>
                <small>
                  {owner ? `${owner.name} · ${ps.special ? SPECIALS[ps.special].name : BUILDINGS[ps.level]}` : 'For sale'}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">{target === 'rebuild' ? 'You need a building at level 3 or higher.' : 'There is nothing to pick yet.'}</p>
      );
    }
  }
  const title =
    target === 'player'
      ? 'Who gets it?'
      : target === 'value'
        ? 'Pick the wheel number'
        : target === 'distance'
          ? 'How many spaces ahead?'
          : target === 'swap'
            ? first === null
              ? 'Pick one of your places'
              : 'Pick a friend’s place to swap with'
            : target === 'rebuild'
              ? first === null
                ? 'Pick your building'
                : 'What will you build?'
              : target === 'myRegion'
                ? 'Pick one of your regions'
                : target === 'anyPlot'
                  ? 'Aim the rocket at…'
                  : def.desc;
  return (
    <Modal label={def.name} onClose={onCancel} className="drawer">
      <h2>{def.name}</h2>
      <p className="muted">{def.desc}</p>
      <h3>{title}</h3>
      {body}
      <button type="button" className="btn btn--wide" onClick={onCancel}>
        Back
      </button>
    </Modal>
  );
}

// ------------------------------------------------------------------ info

export function PlayerDetail({ state, player, onClose }: { state: GameState; player: PlayerState; onClose: () => void }) {
  const places = PLOTS.filter((pl) => state.plots[pl.id].owner === player.id);
  return (
    <Modal label={`${player.name} details`} onClose={onClose} className="detail">
      <div className="detail__head">
        <Avatar character={player.character} size={64} ring={player.color} />
        <div>
          <h2>{player.name}</h2>
          <span className="muted">
            {characterById(player.character).animal}
            {player.rescues ? ' · Rescued once' : ''}
            {player.out ? ' · Out' : ''}
          </span>
        </div>
      </div>
      <div className="detail__money">
        <span>Cash</span>
        <b>{money(player.cash)}</b>
        <span>Savings</span>
        <b>{money(player.savings)}</b>
        <span>Land &amp; buildings</span>
        <b>{money(landValue(state, player.id))}</b>
        <span>Total assets</span>
        <b className="big">{money(totalAssets(state, player))}</b>
        <span>Points</span>
        <b>{player.points}</b>
      </div>
      {player.god && (
        <p>
          <b>{GODS[player.god.id].name}</b> is with {player.name} for {player.god.days} more day{player.god.days > 1 ? 's' : ''}.
        </p>
      )}
      <h3>Places ({places.length})</h3>
      <ul className="detail__places">
        {places.map((pl) => {
          const ps = state.plots[pl.id];
          return (
            <li key={pl.id}>
              <span className="dot" style={{ background: regionById(pl.region).color }} />
              {pl.name} · {ps.special ? SPECIALS[ps.special].name : BUILDINGS[ps.level]} · toll {money(tollFor(state, pl.id, null))}
            </li>
          );
        })}
      </ul>
      <p className="muted">
        {player.cards.length} cards · {player.items.length} items{player.vehicle ? ` · ${player.vehicle.kind} for ${player.vehicle.days} days` : ''}
      </p>
      <button type="button" className="btn btn--wide" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}

export function PlotDetail({ state, plot, onClose }: { state: GameState; plot: number; onClose: () => void }) {
  const info = PLOTS[plot];
  const ps = state.plots[plot];
  const region = regionById(info.region);
  const owner = state.players.find((o) => o.id === ps.owner);
  return (
    <Modal label={info.name} onClose={onClose} className="detail">
      <div className="deed" style={{ borderColor: region.color }}>
        <div className="deed__head" style={{ background: region.color }}>
          <small>{region.name}</small>
          <strong>{info.name}</strong>
        </div>
        <div className="deed__rows">
          <span>Price</span>
          <b>{money(info.price)}</b>
          <span>Owner</span>
          <b>{owner ? owner.name : 'For sale'}</b>
          <span>Building</span>
          <b>{ps.special ? SPECIALS[ps.special].name : BUILDINGS[ps.level]}</b>
          <span>Toll now</span>
          <b>{money(owner ? tollFor(state, plot, null) : 0)}</b>
          <span>Each level costs</span>
          <b>{money(buildCost(plot))}</b>
        </div>
        {ps.special && <p className="deed__note">{SPECIALS[ps.special].desc}</p>}
      </div>
      <button type="button" className="btn btn--wide" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="How to play" onClose={onClose} className="howto">
      <h2>How to Play</h2>
      <ol>
        <li>Everyone starts in Sydney with {money(RULES.startCash)}. Pass START to collect {money(RULES.startBonus)}.</li>
        <li>Tap SPIN and travel around Australia. At a crossroads, tap a sign to pick your way: along the coast, through the desert past Uluru, down the Stuart Highway, via Canberra, or by ferry to Tasmania.</li>
        <li>Stop next to empty land to buy it. Stop on your own land to build, one level at a time (up to 2). Walk past it and you may pay to build 1 level.</li>
        <li>Buildings go Tent, Cabin, Holiday House, Hotel, Skyscraper. Bigger buildings mean bigger tolls!</li>
        <li>Pick up money bags, points and mystery boxes lying on the road. Fly between Sydney and Perth airports for {money(RULES.flightFee)}.</li>
        <li>Collect points and spend them in the Card Shop and Item Shop. Use one card and one item before you spin. Watch out for bananas, bombs and Monster Trucks!</li>
        <li>Gods appear on the road. Good ones help for 3 days. Pass a bad one to a friend by walking past them!</li>
        <li>Run out of money and the bank rescues you once. The second time you are out.</li>
        <li>The host taps End Game for a last round. The richest explorer wins!</li>
      </ol>
      <button type="button" className="btn btn--go btn--wide" onClick={onClose}>
        Let's Go!
      </button>
    </Modal>
  );
}
