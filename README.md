# Goblin King

Multiplayer three.js game: walk through 9 connected rooms and meet other goblins.
The server gives every player a random goblin (30% small, 30% medium, 30% big, 9% wizard, 1% Goblin King).

## Run locally
```
npm install
npm start          # http://localhost:3000  (PORT env var overrides)
```
Open it in two browser tabs to see yourself as two goblins.

## Deploy (Render.com)
Push to GitHub, then in Render choose New > Blueprint (uses `render.yaml`) or New > Web Service
with build command `npm install` and start command `npm start`. Render sets `PORT`; clients use `wss://` automatically.

## Controls
WASD move, mouse look (click to capture, Esc to release), Shift sprint, V overview.
