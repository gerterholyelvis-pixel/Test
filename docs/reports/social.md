# Social: reconnect grace and emotes

Code: `server.js` and `game.js` blocks `SOCIAL-BEGIN/END` (the game.js block sits right after `VIEWMODEL-END`), plus a `SOCIAL` block in `audio.js`. Small hooks elsewhere: server `connection` handler (token/resume, `emote` branch, `close`), the match tick (`socGrace`), `pub()` (adds `dc:1`); client `makeNet` (socket can be reopened), `handleMsg0` (one line), the players loop (`SOC.sync`), the actor loop (`SOC.actor`), after `vmUpdate` (`SOC.fp`). Controls table in `index.html`. No lights, VIEWMODEL block and bot grace logic untouched.

## Reconnect grace (15 s)
- Every join gets a random token (`{queue, goblin, token}`; the client keeps it in `sessionStorage` `gk.token`). Tokens are only used for players in a started match.
- Socket closes while the match is past the queue, the player is alive and the match not over: `p.dc = now`, the goblin stays in `m.players`. It is frozen (no input), can be hit, counts as alive for the win rule, bots and `matchInfo`. The player list carries `dc:1`; a crossed-out signal icon floats over the head. In queue/loading-ready terms a dropped player counts as ready.
- `?token=` on a new socket resumes: the new socket replaces the old key in `m.players`, speed budget reset (`place`), old socket terminated. Server sends a full resync: welcome fields (`you, chests, chestKeys, layout, mystery, shops, drops`), round state, `match`, `players`, `fix`, `inv`, gold, parts, `board`, and `countdown` if one is running. Unknown/expired token: `{resumeFail:1}` and close.
- After `GRACE_MS` (15000; `GK_GRACE_MS` only with `GK_DEBUG=1`) the goblin `die()`s normally: drops, brain, leave, win check.
- Client: `Connection lost` overlay (same CSS as the old one) shows `Reconnecting… N` counting down from 15, retries every 2 s with the token, then offers only Main menu (also immediately on `resumeFail`). Only runs in `GK.mode==='play'` with a token; otherwise the old behaviour. Test hook: `GK.social.drop()` closes the socket.

## Emotes
- Keys 4 to 7 (no other handler used them): taunt (chest beat), laugh, point, dance. Server `{emote:n}` (0..3), 1 s per-player limit, relayed as `{emote:{id,n}}` to everyone else including spectators. Ignored while disconnected or in the queue. Client also rate limits to 1 s and plays its own emote immediately.
- Pose is overlaid after `GA.anim` on head, ears, arms, elbows, torso (laugh, dance also legs and rig) with an ease in/out; a speech-bubble sprite (emoji on a canvas texture, shared textures) shows for 2 s. In first person `SOC.fp` offsets the viewmodel root after `vmUpdate`.
- `audio.js`: `emoteTaunt`, `emoteLaugh`, `emotePoint`, `emoteDance` (procedural, positional for others).
- Controls screen lists the keys.

## Tests
`tests/social.test.js`: resume within the grace period keeps id, inventory, health, full resync, others see `dc` then not; resume after the grace period fails with `resumeFail`, the board shows him dead and the other player wins; emotes relayed, not echoed, invalid ids ignored, 1 s limit. `npm test`: 14 files green.
Browser (GK_DEBUG=1 GK_QUEUE_MS=2000, port 3160): token stored, keys 4 and 7 send emotes, first-person gesture seen in a screenshot, `GK.social.drop()` resumed within a moment (welcome with `resumed`), with reopening disabled the overlay counted `Reconnecting… 12` and ended on Main menu; no new console errors.

## Not tested
Third-person emote poses were not seen on screen (overview is too far, no second human); joint signs were chosen from the existing animation code and may need tuning. Emoji glyphs depend on the system emoji font. Resuming during loading/countdown is untested. A page reload now resumes too: see reload-resume.md. Audio not heard.
