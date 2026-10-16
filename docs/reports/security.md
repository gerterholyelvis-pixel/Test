# Security hardening (fix-list items 1-4, plus 10)

All server code is in the `// SECURITY-BEGIN` / `// SECURITY-END` blocks of `server.js` (plus the join code in the `connection` handler). Tests: `tests/security.test.js`.

## 1. The server owns the goblin type and victories
- **New players:** the server rolls the goblin (30/30/30/9/1) and sends it in the first `{queue, goblin, wins}` message. The wheel already spins until that result arrives and then slows to its slot (`menu.js` `wheelStep`), so it lands on the server roll with no menu change.
- **Win:** `{won:{..., ctoken}}`. `ctoken` is `base64url(JSON{c: charId, g: goblin, w: wins, n: name}) + "." + base64url(HMAC-SHA256(secret, payload))`. `wins` is the old count plus 1. `save.js` stores it as `character.token`.
- **Saved character PLAY:** the client joins with `?ctoken=<token>`. If the signature and shape check out, the server uses the goblin, wins, name and charId from inside it. An invalid, missing or empty token gives a fresh roll with wins=0 and `{unverified:1}` in the queue message. The client shows "Character could not be verified — playing as a new goblin."
- **Old saved characters** have no token, so they are unverified once. They keep their local `wins` for display only. After their next win they get a token with `w = 1` and the server count carries on from there.
- `?goblin=` and `?wins=` are ignored unless `GK_DEBUG` is set (tests only).
- Timing-safe compare; payload size capped at 400 chars.

## 2. Connection limits
| What | Rule | Env |
|---|---|---|
| Origin | Allow-list. Default: Origin host equals the Host header, or localhost / 127.0.0.1 / [::1]. A missing Origin (non-browser client) is allowed. Rejected with HTTP 403. | `GK_ORIGINS` (comma list, e.g. `https://play.example.com`) |
| Sockets per IP | 8, then HTTP 429 | `GK_MAX_PER_IP` (default 1000 under GK_DEBUG so tests work) |
| Total matches | 200. At the cap, a join that would need a new match gets `{busy:1}` and is closed. The client shows "Servers are full — retrying…" and retries every 4 s. Joining an existing queue match still works. | `GK_MAX_MATCHES` |
| Match lifetime | 20 min from formation. `timeLimit()` (the round-10 rule) decides it. A match still open 60 s later is closed. | `GK_MATCH_LIFE_MS` (GK_DEBUG only) |

Behind a reverse proxy the per-IP count would see the proxy's address. Set `GK_TRUST_PROXY=1` to use the last `X-Forwarded-For` hop (only do this when the proxy always sets it).

## 3. Static serving
- Files are read once and cached in memory. This covers the client JS and `index.html`, `three.module.js` / `three.core.js`, and the three addons (read on first request, then cached, including known misses).
- Every read is wrapped in try/catch, and an exception gives a 500. A missing file gives a 404.
- Only `/` and `/index.html` return the page. Everything else is the fixed client file list, `/three/three.(module|core).js`, or `/three/addons/**.js`. Other paths, methods and traversal attempts get 404.
- Headers on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`. Cache-Control: `no-cache` for the page and client JS, `public, max-age=86400` for three.js and the addons.
- **CSP:** `default-src 'self'; script-src 'self' <sha256 of each inline script>; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`.
  - The page has two inline scripts (the importmap and the module loader). They are allowed by **hash**, computed at startup from `index.html` (line endings normalised the way the browser does). There is no `'unsafe-inline'` or `'unsafe-eval'` for scripts.
  - `'unsafe-inline'` stays for **styles only**, because the page has inline `<style>`, `style=""` attributes and JS-created style elements. It also allows Google Fonts (CSS and font files), which the page uses.
  - Editing the inline scripts in `index.html` needs only a restart, since the hashes are recomputed.

## 4. Speed hacks
- `MAXV` is 1.1 times the fastest sprint (was 1.25). `BUDGET` is 1.0 m (was 1.2). The per-move slack is 0.3 m. The bounds tolerance `SLACK` is unchanged. Legit sprinting is not corrected: the test runs a king at 7.8 m/s for 10 s with zero corrections. The netcode, bots and combat tests pass.
- Corrections are counted per player in a sliding 10 s window. More than 15 means the player gets `{kicked:'movement'}`, a log line (`kick: player N (name) ...`) and the socket is closed. A kicked player leaves at once (no 15 s grace). Bots and mystery enemies never go through `applyMove`, and `secFix` skips them too.
- Corrections are sent at most every 150 ms, so 16 corrections take at least 2.4 s of continuous cheating. A player with a lag spike gets a few and never reaches the limit.
- A cheater who stays under 1.1 times the max sprint still gets away with about 10 percent. That is the price of tolerating jitter.

## Production setup
```sh
export GK_SECRET="$(openssl rand -hex 32)"      # keep it. If it changes or is lost, every saved token becomes invalid (players just get a new goblin once)
export GK_ORIGINS="https://play.example.com"    # comma list; scheme + host (+ port) exactly as in the browser address bar
export GK_MAX_PER_IP=8 GK_MAX_MATCHES=200       # optional, these are the defaults
# GK_TRUST_PROXY=1                              # only behind a proxy that sets X-Forwarded-For
node server.js
```
On Render (`render.yaml`) add `GK_SECRET` as a secret environment variable (not committed) and `GK_ORIGINS` as a normal one. Without `GK_SECRET` the server logs a warning at startup and uses a random secret, so tokens do not survive a restart, and with several instances they would not verify on each other.

## Limits and notes
- localStorage is still the player's own: someone can copy a valid token to another browser, or keep an old token (a replay of fewer wins). Real accounts and a database (fix-list "to scale") would fix that.
- Tokens are not revoked and carry no expiry.
- Name and charId inside the token come from the server (the name given in that match).
- `?name=` is still client-chosen and sanitised for guests, as before.

## Additions from the playtest pass (Fable session, same day)
- **Heartbeat:** every 30 s the server pings each socket and terminates one that did not answer the previous ping, so a dead connection frees its per-IP slot and starts the reconnect grace instead of lingering.
- **Handler wrapping:** the `message` and `close` handlers run inside try/catch (logged with the player id), and `uncaughtException` / `unhandledRejection` are logged instead of killing every running match. A port clash still exits (`srv.on('error')`).
- **Name filter:** `cleanName()` strips odd characters and swaps a name containing a profanity for a goblin name (fix-list 17). The token's name goes through the same filter.
- Arrays are refused as messages (`[]` is an object to `typeof`).
