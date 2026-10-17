# Changelog

Format: one section per version, newest first. Versions follow [semver](https://semver.org): the minor number for content and features, the patch number for fixes. `package.json` holds the current version; the menu footer and `/version` show it. How to cut a release: docs/RELEASE.md, "Tagging a release".

## [Unreleased]

## [0.9.0] - 2026-10-16 (release candidate)

First version prepared for a public release.

### The game
- 5x5 arena around THE VAULT with homes, tree rooms, vaultbreaker heists, chest and mystery rooms and merchants. Round 1 in your base (craft, recycle, brew), then each room votes on one door per round.
- Twelve goblin types with their own odds and perks, sculpted in code, with armour and animation.
- Loot economy: tiered items with custom 3D models and baked icons, crafting and the knowledge tree at the workbench, recycling, merchants with rising prices, the vault relic, utility items and charms.
- Combat: melee and bows, lag-compensated hits, health and regeneration, sudden death.
- Multiplayer: matchmaking by victory count, server bots that fill empty seats, spectating, kill feed, scoreboard, emotes, a 15 s reconnect grace.
- Interface: title hall, Characters, Stats, Inventory, Settings (graphics presets picked automatically on first run), Controls, How to play, the Codex.

### Release work (docs/RELEASE.md)
- Production build: `npm run build` writes a minified, content-hashed, Brotli and gzip precompressed client to `dist/`; `NODE_ENV=production` serves it with immutable caching (about 1.8 MB of game code becomes about 0.4 MB over the wire).
- Ops: `/healthz`, `/version`, graceful shutdown on SIGTERM, JSON logs (`GK_LOG=json`), `render.yaml` with a generated `GK_SECRET`, Node 24 pinned.
- Players: friendly screens for an unsupported browser, phones and tablets, a page that fails to load and going offline; loading progress with tips; favicon, share card, a 404 page, a Privacy and terms page, the version in the menu footer.
- Quality gates: `npm run check` (syntax, conflict markers, secrets, page scripts, doc links), `npm run smoke` (plays a real match in a headless browser), `tests/release.test.js`.
- Repo: README rewrite, docs index, licence placeholder, third-party notices, 309 unused screenshots moved to `docs/archive/`.
