import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { setDuck } from '../audio/sound';
import { characterById } from '../data/content';
import type { MediaMesh } from '../net/media';
import type { Member } from '../net/protocol';
import { Avatar } from './common';

interface Props {
  media: MediaMesh;
  members: Member[];
  myPeerId: string | null;
  isHost: boolean;
  onMute?: (clientId: string) => void;
  onRemove?: (clientId: string) => void;
}

export function CallPanel({ media, members, myPeerId, isHost, onMute, onRemove }: Props) {
  const snap = useSyncExternalStore(media.subscribe, media.getSnapshot);
  const [joining, setJoining] = useState(false);
  const inCall = members.filter((m) => m.inCall && m.connected);
  useEffect(() => {
    setDuck(snap.inCall);
    return () => setDuck(false);
  }, [snap.inCall]);

  if (!snap.inCall) {
    return (
      <section className="call">
        <div className="call__head">
          <h3>Voice &amp; Video Chat</h3>
          <span className="call__count">{inCall.length ? `${inCall.length} talking` : 'Nobody yet'}</span>
        </div>
        <button
          type="button"
          className="btn btn--call btn--wide"
          disabled={joining}
          onClick={async () => {
            setJoining(true);
            await media.join();
            setJoining(false);
          }}
        >
          <MicIcon on /> {joining ? 'Connecting...' : 'Join Voice Chat'}
        </button>
        <p className="call__note">Only players in this room can hear you. Camera stays off until you turn it on.</p>
        {snap.error && <p className="call__error">{snap.error}</p>}
      </section>
    );
  }

  return (
    <section className="call">
      <div className="call__tiles">
        {inCall.map((m) => {
          const isMe = m.peerId === myPeerId;
          const stream = isMe ? snap.local : snap.remotes.find((r) => r.peerId === m.peerId)?.stream ?? null;
          return (
            <Tile
              key={m.clientId}
              member={m}
              stream={stream}
              isMe={isMe}
              camOn={isMe ? snap.cam : m.cam}
              micOn={isMe ? snap.mic : m.mic}
              hostControls={isHost && !isMe && !m.isHost}
              onMute={() => onMute?.(m.clientId)}
              onRemove={() => onRemove?.(m.clientId)}
            />
          );
        })}
      </div>
      <div className="call__controls">
        <button type="button" className={`round-btn ${snap.mic ? '' : 'round-btn--off'}`} onClick={() => media.setMic(!snap.mic)} aria-label={snap.mic ? 'Mute microphone' : 'Unmute microphone'}>
          <MicIcon on={snap.mic} />
        </button>
        <button type="button" className={`round-btn ${snap.cam ? '' : 'round-btn--off'}`} onClick={() => media.setCam(!snap.cam)} aria-label={snap.cam ? 'Turn camera off' : 'Turn camera on'}>
          <CamIcon on={snap.cam} />
        </button>
        <button type="button" className="round-btn round-btn--leave" onClick={() => media.leave()} aria-label="Leave chat">
          <PhoneIcon />
        </button>
      </div>
      {snap.error && <p className="call__error">{snap.error}</p>}
    </section>
  );
}

function Tile({ member, stream, isMe, camOn, micOn, hostControls, onMute, onRemove }: {
  member: Member;
  stream: MediaStream | null;
  isMe: boolean;
  camOn: boolean;
  micOn: boolean;
  hostControls: boolean;
  onMute: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) v.play().catch(() => undefined);
  }, [stream]);
  const color = characterById(member.character).color;
  return (
    <div className="tile" style={{ '--ring': color } as React.CSSProperties}>
      {/* The video element also plays the audio, so it stays mounted even with the camera off. */}
      <video ref={ref} autoPlay playsInline muted={isMe} className={camOn && stream ? 'tile__video' : 'tile__video tile__video--hidden'} />
      {!(camOn && stream) && <Avatar character={member.character} size={52} />}
      <span className="tile__name">
        {!micOn && <MicIcon on={false} small />} {isMe ? 'You' : member.name}
      </span>
      {!isMe && !stream && <span className="tile__status">Connecting...</span>}
      {hostControls && (
        <>
          <button type="button" className="tile__more" aria-label={`Options for ${member.name}`} onClick={() => setMenu(!menu)}>
            ⋯
          </button>
          {menu && (
            <div className="tile__menu">
              <button type="button" onClick={() => { onMute(); setMenu(false); }}>Mute</button>
              <button type="button" onClick={() => { onRemove(); setMenu(false); }}>Remove from chat</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MicIcon({ on, small }: { on: boolean; small?: boolean }) {
  const s = small ? 14 : 22;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {!on && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CamIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 15c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5c-2-.7-5-.7-7 0V16l-3 1.5z" />
    </svg>
  );
}
