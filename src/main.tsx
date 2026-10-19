import { createRoot } from 'react-dom/client';
import { App } from './App';
import { sfx, tapSoundsOn, unlockAudio } from './audio/sound';
import './styles.css';

// Sound can only start after a tap; every button also gives a soft click.
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);
window.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.('button');
  if (b && !b.disabled && !b.classList.contains('spin-btn') && tapSoundsOn()) sfx('tap');
});

createRoot(document.getElementById('root')!).render(<App />);
