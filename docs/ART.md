# Goblin King: art bible

Owner decision (2026-10-15): **custom stylized 3D, all made in code**: no downloaded models or textures, one consistent look, unique to this game. Everything is built from three.js geometry plus procedural canvas textures.

## The look in one line
**"Gilded grime":** chunky, hand-sculpted-looking goblins and gear in a clean, too-white facility, where gold and loot are the only warm, saturated things. Think a painted figurine come to life: soft shapes, readable silhouettes, exaggerated proportions, rich materials.

## Pillars
1. **Silhouette first.** Every goblin type and every item must be recognisable as a black shape at 64 px. Big heads, long ears, oversized hands and weapons. Never thin, fiddly or realistic proportions.
2. **Sculpted, not blocky.** Avoid raw boxes and cylinders. Use smooth, organic forms: LatheGeometry, TubeGeometry, extruded and bevelled Shapes, subdivided or vertex-displaced spheres, and capsules. Bevel every hard edge (ExtrudeGeometry `bevelEnabled`, or RoundedBox-style geometry). Merge the parts of a static model into a few meshes.
3. **Material storytelling.** Each material reads instantly:
   - **Skin:** subsurface-ish. Use a warm rim and a slightly emissive red in the ears. MeshPhysicalMaterial with `sheen` or a fresnel rim via `onBeforeCompile`. Add warts and bumps from a procedural bump/normal map.
   - **Metal:** high metalness with IBL reflections, and edge wear (lighter edges, darker crevices, painted into the texture).
   - **Gold:** saturated, polished, with a slight emissive lift so it pops in the white rooms.
   - **Cloth and leather:** high roughness, stitched seams, patches, and visible weave or grain in the texture.
   - **Wood:** grain lines and nicks.
   - **Gems and crystal:** transmission or emissive cores with a glow sprite.
4. **Tier glow language** (matches items.js tiers):

   | Tier | Name | Treatment |
   |---|---|---|
   | 0 | common | dull, worn |
   | 1 | uncommon | clean |
   | 2 | rare | blue accent gem |
   | 3 | mythic | purple runes that pulse |
   | 4 | legendary | gold filigree and an orange ember glow |
   | 5 | transcendent | pale cyan, floating particles, iridescent |

   Accent colours: rare #4a8dff, mythic #a455ff, legendary #ff9a1a, transcendent #3ff0ff. Tier is shown by an accent, never by tinting the whole item.
5. **Palette.**
   - Rooms: off-white #eeeae2, cool grey shadows.
   - Goblins: greens from #6fa83a to #3d6b25, plus a teal wizard and a pale-gold king.
   - Accents: gold #ffc933, blood red #b3122b, warning yellow #f5c451.
   - Never pure black or pure white in materials.
6. **Hard performance budget.**
   - **No new lights, ever.** The owner requires 9 PointLight + 1 Hemisphere. Use emissive materials, glow sprites and IBL instead.
   - Share materials and geometries; cache them by key.
   - Goblin: at most about 12 draw calls each. Item model: at most about 4 draw calls.
   - Textures: at most 512 px, generated once and cached.

## Goblins (game.js `buildGoblin(type)`, 12 types: Small, Medium, Big, Wizard, King, plus Scout, Sneak, Miner, Shaman, Berserker, Bog Goblin, Hobgoblin in the GOBTYPES block)
- Newer types: Scout = tall upright ears, feathers, cloak and bedroll; Sneak = deep hood, face wrap, low crouch; Miner = hard hat with goggles and a candle, apron, pick on the back; Shaman = horned skull headdress, grass skirt; Berserker = red mohawk and war paint, fur kilt; Bog Goblin = wide frog head, lily-pad hat, reeds, tail, webbed feet; Hobgoblin = tall, upright, rust skin (the one non-green goblin), horns, topknot, long coat. All baked into the existing part meshes (same draw calls as before). Screenshot: docs/screens/art-goblin-types.jpg.
- **Shared anatomy:**
  - big head (about 40% of height) with a pronounced brow
  - long, droopy, expressive ears with an inner-ear colour
  - a hooked nose, an underbite with 1-2 tusks, and glowing yellow eyes (emissive, already the style)
  - hunched spine, pot belly, skinny limbs, big three-fingered hands, big feet
- **Personality per type:**
  - **Small:** scrappy, oversized ears, patched rags.
  - **Medium:** a soldier with a leather harness.
  - **Big:** a brute with a hunched mass, small head relative to shoulders, scars, and a spiked pauldron.
  - **Wizard:** tall crooked hat with stars, robe, glowing staff hand, beard of moss.
  - **King:** crown, red-and-ermine cape (the texture already exists), gold jewellery, smug face.
- **Gear shows on the body:** the equipped weapon in the hand, and armour changes the torso look. Base these on the item families, so loot visibly changes your goblin.
- **Animation (code-driven):**
  - idle breathing and ear twitch
  - walk with a bouncy waddle and arm swing
  - attack swing (the combat agent adds this; keep its hooks)
  - hit flinch
  - death slump

  Keep named sub-groups (`head`, `earL`, `earR`, `armL`, `armR`, `legL`, `legR`, `torso`, `hand` socket) so animation and gear attach cleanly.

## Items (20 weapons + 20 armours in items.js)
- **One real 3D model per item key**, family-shared base meshes with per-item variation, built along +y at about 1.5 m. They are used in chest/mystery displays, merchant shelves, loot piles and the goblin's hand.
- **Inventory icons are rendered from those same 3D models.** Use a 3/4 view, soft studio lighting baked into an offscreen render (IBL plus a fixed lighting setup inside the bake scene, not added to the game scene), a transparent background, and a tier-coloured rim or backglow. Cache them as images. This replaces the flat 2D drawings in icons.js, which remain only as a fallback.
- Materials, brains and gold get the same treatment (a gold coin stack, a glistening goblin brain, part icons).

## Rooms
- Keep the clean "white facility" identity (owner's choice), but add craft:
  - floor trims and skirting
  - ceiling coffers
  - wall panel seams
  - hazard stripes at doors
  - goblin graffiti decals (scratched tally marks, crude crown drawings)
  - scattered props: gold coins, bones, a knocked-over bucket, chains
- **The Vault** must feel like the treasure room: gold, marble, a medallion and pillars (they already exist), plus coin piles and a glinting sparkle sprite.
- **Chest/mystery/merchant rooms** each get a distinct mood using emissive accents only:
  - chest: warm gold
  - mystery: purple
  - merchant: teal

## Process
- Opus writes the briefs and reviews screenshots. Sonnet agents implement in clearly delimited blocks or new files.
- Every change comes with before/after screenshots in docs/screens/art-*.jpg and a short report in docs/reports/.
