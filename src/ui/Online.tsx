import { useEffect, useState, useSyncExternalStore } from 'react';
import { characterById } from '../data/content';
import { RULES } from '../data/rules';
import { GuestSession, HostSession } from '../net/session';
import { Member, isValidCode, joinLink, normaliseCode } from '../net/protocol';
import { CallPanel } from './CallPanel';
import { GameScreen } from './GameScreen';
import { Avatar, ConfirmDialog, useJoinChime, useScreenMusic } from './common';
import { Logo, Notice, ProfileForm } from './Screens';
import { useTurnDriver } from './useTurnDriver';

function useSession<T extends HostSession | GuestSession>(make: () => T | null, deps: unknown[]) {
  const [session, setSession] = useState<T | null>(null);
  useEffect(() => {
    const s = make();
    setSession(s);
    return () => s?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return session;
}

function MemberList({ members, isHost, onRemove, started }: { members: Member[]; isHost: boolean; onRemove?: (id: string) => void; started: boolean }) {
  return (
    <ul className="members">
      {members.map((m) => (
        <li key={m.clientId} className="member">
          <Avatar character={m.character} size={48} />
          <span className="member__name">
            {m.name} {m.isHost && <em>Host</em>}
          </span>
          <span className={`dot ${m.connected ? 'dot--on' : ''}`} aria-label={m.connected ? 'Online' : 'Offline'} />
          {isHost && !m.isHost && !started && onRemove && (
            <button type="button" className="btn btn--small" onClick={() => onRemove(m.clientId)}>
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function JoinCode({ onJoin, onBack }: { onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const ok = isValidCode(code);
  return (
    <div className="screen">
      <Logo small />
      <form
        className="card setup"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onJoin(normaliseCode(code));
        }}
      >
        <h1>Join a friend's game</h1>
        <p className="muted">Type the room code your friend sent you, like KOALA-123.</p>
        <label className="field field--wide">
          <span>Room code</span>
          <input id="join-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="KOALA-123" autoCapitalize="characters" autoComplete="off" autoFocus />
        </label>
        <div className="row-center">
          <button type="button" className="btn btn--big" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn btn--go btn--big" disabled={!ok}>
            Find Room
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function HostScreen({ code, profile, onExit }: { code: string; profile: { name: string; character: string } | null; onExit: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [closed] = useState(() => !profile && !HostSession.load(code));
  const session = useSession(() => (closed ? null : new HostSession(code, profile)), [code, attempt]);
  if (closed) {
    return (
      <Notice title="This room is closed" text="Start a new online game from the home screen.">
        <button type="button" className="btn btn--big" onClick={onExit}>
          Home
        </button>
      </Notice>
    );
  }
  if (!session) return null;
  return <HostInner key={attempt} session={session} onExit={onExit} onRetry={() => setAttempt((a) => a + 1)} />;
}

function HostInner({ session, onExit, onRetry }: { session: HostSession; onExit: () => void; onRetry: () => void }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [copied, setCopied] = useState(false);
  const room = snap.room!;
  const link = joinLink(snap.code);
  const playing = room.started && !!snap.game;

  // The host's browser runs the clock and the computer players for everyone.
  const deadline = useTurnDriver(playing ? snap.game : null, (a) => session.applyAuthority(a), playing);
  useEffect(() => session.setDeadline(deadline), [session, deadline]);

  const [asking, setAsking] = useState(false);
  useScreenMusic(playing ? undefined : 'lobby');
  useJoinChime(room.members.filter((m) => m.connected).length + snap.pending.length);
  const close = () => {
    session.endRoom();
    onExit();
  };
  // A finished game just closes; otherwise check first.
  const endRoom = () => (snap.game?.over ? close() : setAsking(true));
  const dialog = asking && (
    <ConfirmDialog
      title="Close this room?"
      text="The game ends for everyone in the room."
      yes="Close Room"
      no="Keep Playing"
      danger
      onNo={() => setAsking(false)}
      onYes={close}
    />
  );

  const call = (
    <CallPanel
      media={session.media}
      members={room.members}
      myPeerId={snap.myPeerId}
      isHost
      onMute={(id) => session.muteMember(id)}
      onRemove={(id) => session.removeFromCall(id)}
    />
  );

  if (snap.status === 'error') {
    return (
      <Notice title="Online play problem" text={snap.message}>
        <button type="button" className="btn btn--big" onClick={close}>
          Close Room
        </button>
        <button type="button" className="btn btn--go btn--big" onClick={onRetry}>
          Try Again
        </button>
      </Notice>
    );
  }

  if (playing) {
    return (
      <>
        <GameScreen
          state={snap.game!}
          myIds={snap.myPlayerId ? [snap.myPlayerId] : []}
          dispatch={(a) => session.dispatch(a)}
          isHost
          deadline={snap.deadline}
          onExit={endRoom}
          exitLabel="Close Room"
          roomCode={snap.code}
          side={call}
          emotes={snap.emotes}
          onEmote={(_, text) => session.emote(text)}
        />
        {dialog}
        {snap.pending.length > 0 && (
          <div className="toast toast--fixed">
            {snap.pending.map((p) => (
              <span key={p.clientId}>
                {p.name} wants to join, but the game has started.{' '}
                <button type="button" className="btn btn--small" onClick={() => session.decline(p.clientId)}>
                  OK
                </button>
              </span>
            ))}
          </div>
        )}
      </>
    );
  }

  const share = async () => {
    const text = `Come and play Australian Adventure with me! Room ${snap.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Australian Adventure', text, url: link });
        return;
      } catch {
        /* fall back to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  return (
    <div className="screen lobby">
      <Logo small />
      <div className="lobby__grid">
        <div className="card">
          <h1>Your room is ready!</h1>
          {snap.status === 'connecting' ? (
            <p className="muted">Opening the room…</p>
          ) : (
            <>
              <p className="muted">Send this link to your friends. They can also type the code.</p>
              <div className="room-code" aria-label="Room code">
                {snap.code}
              </div>
              <div className="lobby__share">
                <input className="link-box" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                <button type="button" className="btn btn--blue" onClick={share}>
                  {copied ? 'Copied!' : 'Share Link'}
                </button>
              </div>
            </>
          )}

          {snap.pending.length > 0 && (
            <div className="requests">
              <h2>Wants to join</h2>
              {snap.pending.map((p) => (
                <div className="request" key={p.clientId}>
                  <Avatar character={p.character} size={44} />
                  <strong>
                    {p.name} <small className="muted">({characterById(p.character).animal})</small>
                  </strong>
                  <button
                    type="button"
                    className="btn btn--go btn--small"
                    disabled={room.members.length >= RULES.maxPlayers}
                    onClick={() => session.accept(p.clientId)}
                  >
                    Accept
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => session.decline(p.clientId)}>
                    No
                  </button>
                </div>
              ))}
            </div>
          )}

          <h2>
            Players ({room.members.length}/{RULES.maxPlayers})
          </h2>
          <MemberList members={room.members} isHost onRemove={(id) => session.removeMember(id)} started={room.started} />

          <label className="switch-row">
            <input type="checkbox" checked={room.locked} onChange={(e) => session.setLocked(e.target.checked)} />
            <span>Lock room (nobody new can ask to join)</span>
          </label>

          <div className="row-center">
            <button type="button" className="btn btn--big" onClick={endRoom}>
              Close Room
            </button>
            <button type="button" className="btn btn--go btn--big" disabled={room.members.length < RULES.minPlayers} onClick={() => session.startGame()}>
              {room.members.length < RULES.minPlayers ? 'Waiting for players…' : 'Start Game!'}
            </button>
          </div>
        </div>
        <div>{call}</div>
      </div>
      {dialog}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function GuestScreen({ code, onExit }: { code: string; onExit: () => void }) {
  const session = useSession(() => new GuestSession(code), [code]);
  if (!session) return null;
  return <GuestInner session={session} onExit={onExit} />;
}

function GuestInner({ session, onExit }: { session: GuestSession; onExit: () => void }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const leave = () => {
    session.leaveRoom();
    onExit();
  };
  const [asking, setAsking] = useState(false);
  const inGame = !!(snap.room?.started && snap.game && snap.status !== 'closed');
  useScreenMusic(inGame ? undefined : 'lobby');
  useJoinChime(snap.room?.members.filter((m) => m.connected).length ?? 0);
  const homeBtn = (
    <button type="button" className="btn btn--big" onClick={leave}>
      Home
    </button>
  );

  if (snap.status === 'closed') {
    return (
      <Notice title="The room is closed" text="The host closed the room. Thanks for playing!">
        {homeBtn}
      </Notice>
    );
  }

  if (snap.status === 'rejected') return <Notice title="Can't join this room" text={snap.message}>{homeBtn}</Notice>;
  if (snap.status === 'error') return <Notice title="Online play problem" text={snap.message}>{homeBtn}</Notice>;

  if (snap.myPlayerId && snap.room) {
    const call = <CallPanel media={session.media} members={snap.room.members} myPeerId={snap.myPeerId} isHost={false} />;
    const banner = snap.status === 'lost' ? <div className="toast toast--warn toast--fixed">{snap.message}</div> : null;
    if (snap.room.started && snap.game) {
      const me = snap.game.players.find((p) => p.id === snap.myPlayerId);
      return (
        <>
          <GameScreen
            state={snap.game}
            myIds={[snap.myPlayerId]}
            dispatch={(a) => session.dispatch(a)}
            isHost={false}
            deadline={snap.deadline}
            onExit={() => (snap.game!.over ? leave() : setAsking(true))}
            exitLabel="Leave Game"
            roomCode={snap.code}
            side={call}
            emotes={snap.emotes}
            onEmote={(_, text) => session.emote(text)}
          />
          {banner}
          {asking && (
            <ConfirmDialog
              title="Leave this game?"
              text="The computer will play for you."
              yes="Leave Game"
              no="Keep Playing"
              danger
              onNo={() => setAsking(false)}
              onYes={leave}
            />
          )}
          {snap.welcomeBack && me?.auto && !me.out && (
            <div className="modal-bg">
              <div className="modal center" role="dialog" aria-label="Welcome back">
                <Avatar character={me.character} size={80} ring={me.color} />
                <h2>Welcome back, {me.name}!</h2>
                <p className="muted">The computer played for you while you were away.</p>
                <button
                  type="button"
                  className="btn btn--go btn--big btn--wide"
                  onClick={() => {
                    session.dispatch({ type: 'setAuto', playerId: me.id, on: false });
                    session.dismissWelcome();
                  }}
                >
                  Take Over
                </button>
                <button type="button" className="btn btn--wide" onClick={() => session.dismissWelcome()}>
                  Keep Auto Play
                </button>
              </div>
            </div>
          )}
        </>
      );
    }
    return (
      <div className="screen lobby">
        <Logo small />
        <div className="lobby__grid">
          <div className="card">
            <h1>You're in!</h1>
            <p className="muted">Waiting for the host to start the game…</p>
            <div className="room-code room-code--small">{snap.code}</div>
            <MemberList members={snap.room.members} isHost={false} started={false} />
            <div className="row-center">{homeBtn}</div>
          </div>
          <div>{call}</div>
        </div>
        {banner}
      </div>
    );
  }

  if (snap.status === 'waiting') {
    return (
      <Notice title="Knock knock!" text={`Waiting for ${snap.info?.hostName ?? 'the host'} to let you in…`}>
        {homeBtn}
      </Notice>
    );
  }

  if (snap.status === 'info' && snap.info) {
    if (snap.info.started) return <Notice title="Game already started" text="This game has already started. Ask your friend to make a new room.">{homeBtn}</Notice>;
    if (snap.info.locked) return <Notice title="Room is locked" text="The host has locked this room.">{homeBtn}</Notice>;
    return (
      <ProfileForm
        title={`Join ${snap.info.hostName}'s game`}
        intro={`Room ${snap.code}. Type your name and pick an animal.`}
        taken={snap.info.takenCharacters}
        submit="Ask to Join"
        onSubmit={(name, character) => session.join(name, character)}
        onBack={leave}
      />
    );
  }

  return (
    <Notice title={snap.status === 'lost' ? 'Looking for the room…' : 'Connecting…'} text={snap.message ?? `Finding room ${snap.code}…`}>
      {homeBtn}
    </Notice>
  );
}

