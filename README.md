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

The map and pieces use the PNG files in `public/art/`. Upload new or replacement
pictures there with the same names. `npm run build` shrinks them automatically
(`scripts/optimize-art.mjs`), so large originals are fine.


## Sound

Music and sound effects are made in the browser with the Web Audio API
(`src/audio/sound.ts`), so there are no sound files. Music turns quiet while
you are in the voice chat. The menu has Music and Sound switches.

## Online play for testing

Online rooms use PeerJS. To test without the internet, run a local PeerJS server with
`npm run peer-server` and open the game with `?peer=127.0.0.1:9000`.
