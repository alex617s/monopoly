import { useCallback, useEffect, useState } from 'react';
import { setMusic } from './audio/sound';
import { RuleError, createGame, reduce } from './game/engine';
import type { Action, GameState } from './game/types';
import { makeRoomCode, normaliseCode } from './net/protocol';
import { savedHostRoom } from './net/session';
import { GameScreen } from './ui/GameScreen';
import { GuestScreen, HostScreen, JoinCode } from './ui/Online';
import { Home, LocalSetup, ProfileForm, SetupPlayer } from './ui/Screens';
import { HowToPlay } from './ui/panels';
import { useTurnDriver } from './ui/useTurnDriver';
import { uid } from './util';

type Screen =
  | { name: 'home' }
  | { name: 'local-setup' }
  | { name: 'local-game' }
  | { name: 'host-form' }
  | { name: 'host'; code: string; profile: { name: string; character: string } | null }
  | { name: 'join-code' }
  | { name: 'join'; code: string };

const LOCAL_KEY = 'aa2-local-game';

function loadLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const g = raw ? (JSON.parse(raw) as GameState) : null;
    return g && g.version === 2 && !g.over ? g : null;
  } catch {
    return null;
  }
}

function screenFromHash(): Screen | null {
  const m = window.location.hash.match(/^#\/(join|host)\/([A-Za-z]+-\d{3})$/);
  if (!m) return null;
  const code = normaliseCode(m[2]);
  return m[1] === 'join' ? { name: 'join', code } : { name: 'host', code, profile: null };
}

const hashFor = (s: Screen) => (s.name === 'join' ? `#/join/${s.code}` : s.name === 'host' ? `#/host/${s.code}` : '');

export function App() {
  const [screen, setScreen] = useState<Screen>(() => screenFromHash() ?? { name: 'home' });
  const [local, setLocal] = useState<GameState | null>(loadLocal);
  const [help, setHelp] = useState(false);

  useEffect(() => setMusic('main'), []);

  useEffect(() => {
    const onHash = () => {
      const s = screenFromHash();
      if (s) setScreen(s);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    try {
      if (local && !local.over) localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
      else localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [local]);

  // Online screens keep their room in the URL so a reload goes straight back in.
  const go = (s: Screen) => {
    const hash = hashFor(s);
    if (hash !== window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search + hash);
    setScreen(s);
  };
  const home = () => go({ name: 'home' });

  const startLocal = (players: SetupPlayer[]) => {
    setLocal(createGame(players.map((p) => ({ id: uid(), name: p.name, character: p.character, auto: p.auto }))));
    go({ name: 'local-game' });
  };

  const localDispatch = useCallback((a: Action) => {
    setLocal((g) => {
      if (!g) return g;
      try {
        return reduce(g, a);
      } catch (e) {
        if (e instanceof RuleError) return g;
        throw e;
      }
    });
  }, []);

  const playingLocal = screen.name === 'local-game' && !!local;
  const deadline = useTurnDriver(playingLocal ? local : null, localDispatch, playingLocal);

  let view;
  switch (screen.name) {
    case 'home':
      view = (
        <Home
          canResume={!!local}
          hostRoom={savedHostRoom()}
          onLocal={() => go({ name: 'local-setup' })}
          onResume={() => go({ name: 'local-game' })}
          onHost={() => go({ name: 'host-form' })}
          onJoin={() => go({ name: 'join-code' })}
          onReopen={(code) => go({ name: 'host', code, profile: null })}
          onHelp={() => setHelp(true)}
        />
      );
      break;
    case 'local-setup':
      view = <LocalSetup onStart={startLocal} onBack={home} />;
      break;
    case 'local-game':
      view = local ? (
        <GameScreen
          state={local}
          myIds={local.players.map((p) => p.id)}
          dispatch={localDispatch}
          isHost
          deadline={deadline}
          onExit={() => {
            if (local.over) setLocal(null);
            home();
          }}
          exitLabel={local.over ? 'Home' : 'Save & Go Home'}
          onAgain={() => {
            setLocal(createGame(local.players.map((p) => ({ id: uid(), name: p.name, character: p.character, auto: p.auto }))));
          }}
        />
      ) : (
        <LocalSetup onStart={startLocal} onBack={home} />
      );
      break;
    case 'host-form':
      view = (
        <ProfileForm
          title="Play online with friends"
          intro={`You'll get a link to send to up to 5 friends. You decide who can come in.`}
          taken={[]}
          submit="Create Room"
          onSubmit={(name, character) => go({ name: 'host', code: makeRoomCode(), profile: { name, character } })}
          onBack={home}
        />
      );
      break;
    case 'host':
      view = <HostScreen code={screen.code} profile={screen.profile} onExit={home} />;
      break;
    case 'join-code':
      view = <JoinCode onJoin={(code) => go({ name: 'join', code })} onBack={home} />;
      break;
    case 'join':
      view = <GuestScreen code={screen.code} onExit={home} />;
      break;
  }

  return (
    <>
      {view}
      {help && <HowToPlay onClose={() => setHelp(false)} />}
    </>
  );
}
