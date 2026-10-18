import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { characterById } from '../data/content';

export const art = (name: string) => `${import.meta.env.BASE_URL}art/${name}.png`;
export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-AU')}`;

/** A character's picture, falling back to a coloured circle until ChatGPT art arrives. */
export function Avatar({ character, size = 44, ring, className = '' }: { character: string; size?: number; ring?: string; className?: string }) {
  const c = characterById(character);
  const [failed, setFailed] = useState(false);
  const src = art(`char-${c.id}`);
  const fallback = c.art ? art(c.art) : null;
  const [current, setCurrent] = useState(src);
  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);
  const style = { width: size, height: size, '--ring': ring ?? c.color } as CSSProperties;
  return (
    <span className={`avatar ${className}`} style={style}>
      {!failed ? (
        <img
          src={current}
          alt={c.animal}
          draggable={false}
          onError={() => {
            if (fallback && current !== fallback) setCurrent(fallback);
            else setFailed(true);
          }}
        />
      ) : (
        <span className="avatar__letter" style={{ background: c.color, fontSize: size * 0.42 }}>
          {c.animal.slice(0, 2)}
        </span>
      )}
    </span>
  );
}

export function Modal({ children, onClose, className = '', label }: { children: ReactNode; onClose?: () => void; className?: string; label: string }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (name) {
    case 'coin':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" fill="#ffc93c" stroke="#b47d00" strokeWidth="2" />
          <path d="M14.5 9c-.5-1-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M12 6v1.5M12 16.5V18" stroke="#7a5200" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'piggy':
      return (
        <svg {...p}>
          <path d="M4 12c0-3.5 3.5-6 8-6 3 0 5 1 6.5 2.5L21 8v4l-1.5.5c-.5 2-2 3.5-4 4V19h-2.5v-2h-3v2H7.5v-2.5C5.5 15.5 4 14 4 12z" fill="#ff8fab" stroke="#c2456a" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="16" cy="10.5" r="1" fill="#7a2140" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...p}>
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#22a45d" />
          <path d="M7 16l3.5-4 3 2.5L17 9" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'gem':
      return (
        <svg {...p}>
          <path d="M6 3h12l4 6-10 12L2 9z" fill="#5ed3ff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M2 9h20M9 3l3 18 3-18" stroke="#fff" strokeWidth="1.2" fill="none" opacity="0.8" />
        </svg>
      );
    case 'cards':
      return (
        <svg {...p}>
          <rect x="3" y="5" width="11" height="15" rx="2" fill="#fff" transform="rotate(-10 8 12)" />
          <rect x="9" y="4" width="11" height="15" rx="2" fill="#e8dcff" stroke="#fff" strokeWidth="1.5" transform="rotate(8 14 11)" />
        </svg>
      );
    case 'bag':
      return (
        <svg {...p}>
          <path d="M4 9h16l-1.5 11h-13z" fill="#fff" />
          <path d="M8 9V7a4 4 0 0 1 8 0v2" stroke="#fff" strokeWidth="2.2" fill="none" />
        </svg>
      );
    case 'dice':
      return (
        <svg {...p}>
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#fff" stroke="#14213d" strokeWidth="1.6" />
          <circle cx="8" cy="8" r="1.7" fill="#14213d" />
          <circle cx="16" cy="8" r="1.7" fill="#14213d" />
          <circle cx="12" cy="12" r="1.7" fill="#e5383b" />
          <circle cx="8" cy="16" r="1.7" fill="#14213d" />
          <circle cx="16" cy="16" r="1.7" fill="#14213d" />
        </svg>
      );
    case 'house':
      return (
        <svg {...p}>
          <path d="M3 11l9-7 9 7v9H3z" fill="#fff" />
          <rect x="10" y="14" width="4" height="6" fill="#22a45d" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'smile':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9.5" fill="#ffc93c" stroke="#c48a00" strokeWidth="1.5" />
          <circle cx="9" cy="10" r="1.3" fill="#14213d" />
          <circle cx="15" cy="10" r="1.3" fill="#14213d" />
          <path d="M7.5 13.5c1 2.5 2.6 3.5 4.5 3.5s3.5-1 4.5-3.5z" fill="#14213d" />
        </svg>
      );
    case 'map':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      );
    case 'scooter':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="17" r="3" />
          <circle cx="18" cy="17" r="3" />
          <path d="M6 17h7l3-8h3M14 5h3" />
        </svg>
      );
    case 'car':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 15l2-6h14l2 6v3H3z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case 'robot':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="5" y="8" width="14" height="11" rx="3" />
          <path d="M12 4v4M9 13h.01M15 13h.01" />
        </svg>
      );
    default:
      return null;
  }
}
