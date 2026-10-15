# Graphics upgrade report

## What changed
- game.js (new block `FX-BEGIN/FX-END`, placed just before `let orbit`): lazy EffectComposer pipeline (dynamic import of three/addons: EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass) with try/catch; plain `renderer.render` is the fallback. `renderWorld(t)` replaces the final `renderer.render` in `frame()`. `resize()` calls `fxResize()` (composer setPixelRatio/setSize, so GK.applySettings resolution scale is honoured). MSAA 4x HalfFloat target inside the composer; bloom runs at half resolution.
- Pass order: Render -> UnrealBloom (strength 0.22, radius 0.2, threshold 2.8 HDR) -> OutputPass (tone mapping + sRGB) -> custom ShaderPass (vignette, light film grain, tiny chromatic aberration). Deliberate deviation: the custom pass is AFTER OutputPass so grain/vignette work in display space.
- Bloom tuning: white walls/floors measure about 1.1-2.5 in linear HDR, so lower thresholds washed the rooms out (reproduced; thresholds 1.35-2.6 and big panel HDR all washed). Now threshold 2.8 with ceiling panels at x3.4 HDR (panelM colour) and door status lamps at x2.6 emissive intensity: white rooms stay crisp, lamps/panels get a soft halo. Settings checkbox off = no composer at all.
- Settings: `fx` (default true) in GK.settings (game.js + menu.js DEFAULTS), checkbox `s-fx` "Post effects (bloom)" in index.html and menu.js, built/persisted exactly like Name tags.
- index.html: only the importmap line (added "three/addons/": "/three/addons/") plus the one checkbox row. server.js: static route `/three/addons/<path>` -> node_modules/three/examples/jsm (resolve + startsWith base + `.js` only, 404 otherwise; ../ and %2e%2e verified 404).
- World: one `THREE.Points` of dust motes (about 340 in the 9 rooms + 12 chest rooms, vertex-shader animated, soft round sprites, normal blending so they show on white); one merged mesh of 28 soft light shafts under the middle-room ceiling panels and chest-room panels (gradient texture, opacity 0.11); floor now has a procedural roughness map (per-tile variation, rough grout) and grout bump; plaster bump map enriched with soft mottling (bumpScale 0.6 -> 0.9); keypad screens pulse gently; door status lamps idle-pulse. No lights were added or removed.
- Debug hook: `GK.fxDebug` (getter for the composer state, and the camera).
- build-artifact.js (scratchpad): importmap (three + three/addons/ -> jsdelivr three@0.158.0), `window.THREE` module, then GK_OFFLINE script, items/save/icons inlined as classic scripts, then game.js and menu.js each as `<script type="module">`. verify-demo.js adapted (routes jsdelivr to local r186 files).

## Measurements
- Draw calls (renderer.info, software GL): spawn room view 3379 with composer vs 3364 plain; middle-room corner 1965 vs 1951; chest room 226 vs 211. My world additions are +2 calls (motes, shafts); the composer adds about 13 fullscreen/mip passes. The high base count (3000+ in spawn rooms) comes from other agents' content (doors/maps/panels), not from this change; worth a look.
- verify-demo: no page errors, 5 actors, composer active, all addon files resolved from the mocked jsdelivr.

## Risks / not checked
- Bloom cost on integrated GPUs is not measured (software GL only); users can turn it off via the Effects checkbox. Pixel ratio 2 + MSAA 4x HalfFloat target is the heaviest part.
- Red lamps have low luminance so they bloom little; threshold is luminance based.
- Offline demo bots showed "moved 0" in the 6 s window of verify-demo (actors do exist); not investigated.
- Artifact uses r158 module addons from the CDN; only tested against local r186 files.
- Other agents' game.js errors (undefined names mid-edit) intermittently blocked testing; the final shots were taken after they were fixed.
