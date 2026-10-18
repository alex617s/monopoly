import { useState } from 'react';
import { CHARACTERS } from '../data/content';
import { RULES } from '../data/rules';
import { Avatar, art } from './common';

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? 'logo--small' : ''}`}>
      <span className="logo__top">AUSTRALIAN</span>
      <span className="logo__bottom">ADVENTURE</span>
    </div>
  );
}

const ONLINE = import.meta.env.VITE_NO_ONLINE !== '1';

export function Home(p: {
  canResume: boolean;
  hostRoom: string | null;
  onLocal: () => void;
  onResume: () => void;
  onHost: () => void;
  onJoin: () => void;
  onReopen: (code: string) => void;
  onHelp: () => void;
}) {
  return (
    <div className="home">
      <div className="home__art">
        <img src={art('home')} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
      </div>
      <div className="home__panel">
        <Logo />
        <p className="home__tag">Explore Australia with family and friends!</p>
        {p.canResume && (
          <button type="button" className="btn btn--go btn--big btn--wide" onClick={p.onResume}>
            Resume Game
          </button>
        )}
        <button type="button" className={`btn btn--big btn--wide ${p.canResume ? '' : 'btn--go'}`} onClick={p.onLocal}>
          Play on This Device
        </button>
        {ONLINE ? (
          <>
            <button type="button" className="btn btn--big btn--wide btn--blue" onClick={p.onHost}>
              Play Online with Friends
            </button>
            <button type="button" className="btn btn--wide" onClick={p.onJoin}>
              Join a Friend's Game
            </button>
            {p.hostRoom && (
              <button type="button" className="btn btn--wide" onClick={() => p.onReopen(p.hostRoom!)}>
                Reopen Room {p.hostRoom}
              </button>
            )}
          </>
        ) : (
          <p className="muted center">Online play and video chat work on the full game website.</p>
        )}
        <button type="button" className="btn btn--wide btn--ghost" onClick={p.onHelp}>
          How to Play
        </button>
      </div>
    </div>
  );
}

export interface SetupPlayer {
  name: string;
  character: string;
  auto: boolean;
}

export function CharacterPicker({ value, taken, onChange }: { value: string; taken: string[]; onChange: (id: string) => void }) {
  return (
    <div className="char-picker" role="radiogroup" aria-label="Pick an animal">
      {CHARACTERS.map((c) => {
        const blocked = taken.includes(c.id) && c.id !== value;
        return (
          <button key={c.id} type="button" role="radio" aria-checked={value === c.id} disabled={blocked} className={`char ${value === c.id ? 'char--on' : ''}`} onClick={() => onChange(c.id)}>
            <Avatar character={c.id} size={52} />
            <span>{c.animal}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LocalSetup({ onStart, onBack }: { onStart: (players: SetupPlayer[]) => void; onBack: () => void }) {
  const [players, setPlayers] = useState<SetupPlayer[]>([
    { name: '', character: 'kangaroo', auto: false },
    { name: '', character: 'koala', auto: true },
  ]);
  const update = (i: number, patch: Partial<SetupPlayer>) => setPlayers((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const add = () => {
    const used = new Set(players.map((p) => p.character));
    setPlayers((ps) => [...ps, { name: '', character: CHARACTERS.find((c) => !used.has(c.id))!.id, auto: true }]);
  };
  return (
    <div className="screen">
      <Logo small />
      <div className="card setup">
        <h1>Who's playing?</h1>
        <p className="muted">
          {RULES.minPlayers} to {RULES.maxPlayers} players. Pick an animal and type your name. Computer players play by themselves.
        </p>
        {players.map((p, i) => (
          <div className="setup__row" key={i}>
            <label className="field">
              <span>Player {i + 1} name</span>
              <input id={`player-${i}`} value={p.name} maxLength={14} placeholder={p.auto ? 'Computer' : `Player ${i + 1}`} onChange={(e) => update(i, { name: e.target.value })} />
            </label>
            <CharacterPicker value={p.character} taken={players.filter((_, k) => k !== i).map((x) => x.character)} onChange={(character) => update(i, { character })} />
            <div className="seg" role="group" aria-label={`Who plays player ${i + 1}`}>
              <button type="button" className={!p.auto ? 'on' : ''} onClick={() => update(i, { auto: false })}>
                Person
              </button>
              <button type="button" className={p.auto ? 'on' : ''} onClick={() => update(i, { auto: true })}>
                Computer
              </button>
            </div>
            {players.length > RULES.minPlayers && (
              <button type="button" className="round round--small" aria-label={`Remove player ${i + 1}`} onClick={() => setPlayers((ps) => ps.filter((_, k) => k !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {players.length < RULES.maxPlayers && (
          <button type="button" className="btn" onClick={add}>
            + Add Player
          </button>
        )}
      </div>
      <div className="row-center">
        <button type="button" className="btn btn--big" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn--go btn--big"
          onClick={() =>
            onStart(
              players.map((p, i) => ({
                ...p,
                name: p.name.trim() || (p.auto ? `${CHARACTERS.find((c) => c.id === p.character)!.animal}` : `Player ${i + 1}`),
              })),
            )
          }
        >
          Start the Adventure!
        </button>
      </div>
    </div>
  );
}

export function ProfileForm({ title, intro, taken, submit, onSubmit, onBack }: { title: string; intro: string; taken: string[]; submit: string; onSubmit: (name: string, character: string) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [character, setCharacter] = useState(() => CHARACTERS.find((c) => !taken.includes(c.id))?.id ?? 'kangaroo');
  return (
    <div className="screen">
      <Logo small />
      <form
        className="card setup"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim(), character);
        }}
      >
        <h1>{title}</h1>
        <p className="muted">{intro}</p>
        <label className="field field--wide">
          <span>Your name (a nickname is fine)</span>
          <input id="profile-name" value={name} maxLength={14} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emma" autoFocus />
        </label>
        <CharacterPicker value={character} taken={taken} onChange={setCharacter} />
        <div className="row-center">
          <button type="button" className="btn btn--big" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn btn--go btn--big" disabled={!name.trim()}>
            {submit}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Notice({ title, text, children }: { title: string; text?: string | null; children?: React.ReactNode }) {
  return (
    <div className="screen">
      <Logo small />
      <div className="card setup center">
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        <div className="row-center">{children}</div>
      </div>
    </div>
  );
}
