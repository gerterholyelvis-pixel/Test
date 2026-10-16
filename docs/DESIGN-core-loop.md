# Goblin King: core loop and unique-feature design

Written by the Opus parent on 2026-10-16. These are proposals that build on the owner's rules in FEATURES.md, and nothing here overrides them. The **(owner?)** tag marks anything that needs the owner's decision. Each section ends in concrete tasks for Sonnet agents.

## What makes this game itself
Goblin King isn't a shooter in a box. Its identity is **a 3x3 facility where the doors are the weapon**. Each round, every room votes for one door to open, so where you can go, and who can reach you, is decided collectively and politically. Gold, gear and knowledge pull you outward to the 12 rooms behind the outer walls, while THE VAULT pulls everyone inward. Death costs everything, so every fight is a real decision.

Design rule: **every new feature should create a decision about doors, rooms or risk.** If it doesn't, it's generic.

## 1. Doors as strategy (deepen the existing round system)
- **Shared panels create politics.** Two goblins in one room fight over the panel; the last selection before 0:00 wins. Show who selected it with a goblin-head icon on the panel screen.
- **Door intel.** The wall map shows which doors other rooms selected *last* round, and the tick icons the feel agent added for claimed rooms. Information decides alliances.
- **Sabotage (gameplay item, tier 1 craft):** a "Jam Spike" used on a panel locks that room's choice for one round. **(owner?)**
- **Closing doors.** Open doors currently stay open. Proposal: each open door has a 2-round lifetime and then shuts with a warning klaxon, splitting the map again so stalemates break. **(owner?)**

## 2. THE VAULT as the objective (gives "last goblin standing" a centre of gravity)
- The vault opens only with 2 rooms' votes (existing rule). Inside: the medallion dais.
- **Proposal, Crown win (owner?):** standing on the dais for 20 uninterrupted seconds crowns you Goblin King. That's an alternative win to last-standing. Everyone gets an alert ("Mizzle is claiming the crown!"), and a progress ring shows over the dais. It forces confrontation at the centre late in the match and is far more distinctive than pure elimination.
- The vault holds the best loot: one guaranteed tier 3+ item on a pedestal.

## 3. Outer rooms: risk vs. reward
- **Chest rooms:** safe, small reward (already in).
- **Mystery rooms:** a gamble. Enemy goblins should *actually fight* (next server task). The troll is rare and lethal but drops tier 2+. Plushie stays a joke item. Make it throwable to distract bots.
- **Merchant:** gold sink. Prices should scale with the round number so early decisions matter.
- **Gold has a purpose:** buying items, and a **bribe** at a door panel (pay 50 gold to add +1 weight to your vote). **(owner?)**

## 4. Goblin brains and knowledge (the unique progression)
- Knowledge gates crafting tiers (knowledge tree, existing). Eating a brain gives 5% of that goblin's knowledge (existing).
- **Make it visible:** your goblin's head literally glows brighter with knowledge (an emissive on the eyes or veins). A Wizard with 3 brains looks scary.
- **Brain greed:** a King's brain gives a big knowledge jump, so Kings are hunted. That's a natural bounty system with no extra rules.

## 5. Death and spectating
- Death loses everything (owner rule). Soften the *experience*, not the cost: spectate the killer, show the kill cam (the last 3 s of the killer's viewpoint, cheap with snapshots), and offer instant requeue.

## 6. Bots (makes the game playable at any population)
- The server fills empty match slots with bots, so a match always has 8 goblins. Bots use the same rules as players: they vote on doors (random, but they prefer the vault after round 3), loot rooms, use the merchant, fight within 6 m, and flee at low HP.
- Bots have goblin names and show "BOT" in the scoreboard, never in the world (immersion).
- Mystery-room enemies share the bot brain but stay in their room.

## Task queue for Sonnet (in order)
1. **Server bots + mystery enemies** (§6, §3): after the matchmaking merge, through the `fillWithBots(m)` hook.
2. **Panel politics + door intel** (§1, the first two bullets): no owner decision needed.
3. **Knowledge glow + King bounty visibility** (§4).
4. **Spectate + kill cam** (§5), together with the multiplayer-fun phase from PLAN-netcode-perf-fun.md.
5. Owner-decision items (Crown win, closing doors, Jam Spike, bribes) wait for the owner. Listed in HANDOFF open questions.
