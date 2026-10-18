# Australian Adventure

A family board game for 2–6 players, in the style of Richman 4: walk the roads of Australia, buy land, build from tents to skyscrapers, collect tolls, use cards and items, and meet good and bad gods.

- Play on one device, or online with friends (room link, the host accepts players).
- Voice chat during online games (camera off until you turn it on).
- Works in Safari on iPad and in laptop browsers.
- The host ends the game with **End Game**: everyone gets one last turn, then the richest explorer wins.

## Run it

```bash
npm install
npm run dev      # play at http://localhost:5173
npm test         # rules tests
npm run build    # production files in dist/
```

Pushing to `main` builds and publishes the game with GitHub Pages
(Settings → Pages → Source: GitHub Actions).

## Pictures

Drop PNG files into `public/art/` and the game uses them automatically:

| File | Used for |
| --- | --- |
| `char-kangaroo.png`, `char-koala.png`, `char-wombat.png`, `char-quokka.png`, `char-platypus.png`, `char-emu.png` | Player pieces and avatars (square, transparent background) |
| `koala-card.png`, `turtle-card.png` | Shopkeepers |
| `home.png` | Picture on the home screen |

Until a picture exists, the game shows a coloured placeholder.

## Online play for testing

Online rooms use PeerJS. To test without the internet, run a local PeerJS server with
`npm run peer-server` and open the game with `?peer=127.0.0.1:9000`.
