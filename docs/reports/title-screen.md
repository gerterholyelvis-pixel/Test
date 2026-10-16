# Title screen artwork

- index.html: inline SVG logotype (gilded bevelled GOBLIN / KING with a jewelled crown, glint sweep, SVG specular bevel), refined main-menu buttons (ghost rows, gold primary), richer vignette, film grain (#grain), intro curtain (#tcurtain). Removed the eyebrow and tagline.
- menu.js (TITLE2 block): throne hall backdrop (arch with glowing portal, instanced pillars, torches, throne on a dais), god rays, dust motes, torch sparks, drifting fog, stronger mouse parallax, camera settle on load, push-in plus golden flash on Start. No new lights.
- Presets: Low drops fog, dust, sparks, extra rays, floor mirrors, glint, grain animation and trims embers; Medium trims counts.
- Screens: docs/screens/title-before.jpg, title-after.jpg. Checked at 800x600 and 375x812 (1080p emulation broke the pane screenshots).
- npm test: bots and security tests failed under load from parallel agents (files untouched by this change).
