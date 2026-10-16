# Item art pass 2 (existing items)
Reviewed all 60 baked icons at 320 px. Overall already consistent; fixed the weakest spots in itemart.js, existing functions only:
- Steel texture: pits and dark rust blotches were reading as holes on axe heads; now fewer, subtler, warmer.
- Axes (all 5 incl. Executioner's, Battle Axe): polished light-steel edge bevel along the cutting edge (+1 draw call, shared material), so dark heads keep a readable silhouette and metal reads as worn at the edge.
- Wooden Stick, Short/Longbow limbs and bowstring thicker (read at 64 px).
- Knight's Plate: gold heraldic cross; Titan's Aegis: gold sunburst rays round the great gem (plates were samey silver).
- Debug hook: window.GK_ICON_PX overrides the bake size (default 160, unchanged) for high-zoom review.
Tested: re-baked and viewed affected icons; no new console errors. npm test: bots/rules/security timing tests failed (server logic, untouched by this change; ran while many agents loaded the machine); all other files pass.
Not done: viewmodel/world-drop look not re-reviewed; no new screenshots saved.
Merger note: server caches static files at start, restart node to see edits.
