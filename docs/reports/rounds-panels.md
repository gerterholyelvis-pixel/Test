# Rounds, timer and door control panels

Status: done, partly verified.

- Server (per match) runs rounds: 30 s first, 45 s after. Clients get `round`, `sel`, `open`, `vaultVotes`, `fizzled`.
- Every grid room has a door control panel on its north wall (x = room centre + 4.5, mirrors the map); chest rooms have one on the left side wall.
  Buttons read like `NORTH · Treasure room`, selected one shows `SELECTED · OPENS AT 0:00`, open doors show `OPEN`.
- Vault buttons show `NEEDS 2 PLAYERS · Vault votes: N/2`. At round end a vault door opens only if 2 different rooms picked vault doors.
  With only 1 pick a red `VAULT NEEDS 2 PLAYERS - TURN WASTED` banner shows and nothing opens.
- HUD timer `ROUND n  m:ss` at the top (last 5 s red and pulsing), `DOORS OPENING` banner when at least one door opened.
- Offline demo runs the same machine locally with bots (a 110 s run showed the vault rule working).
- Test helpers: `GK.panelClick(roomKey, doorIdx)`, `GK.roundInfo()`, `GK.ROOM_DOORS`.

Not checked end to end: click + server vote + banner in one run; crosshair hover capture; `d.p` reaching 1 against the final server.
Screenshots: `docs/screens/panel-*.png`.
