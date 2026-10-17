# Third-party notices

Goblin King's art, models, sounds and music are made in code in this repository (docs/ART.md). It uses these third-party components.

## Shipped to players

| Component | Used for | Licence | Source |
|---|---|---|---|
| three.js 0.186 (incl. `examples/jsm` addons: postprocessing, RoomEnvironment, BufferGeometryUtils, RoundedBoxGeometry) | 3D rendering in the browser | MIT, Copyright 2010-2025 three.js authors | https://github.com/mrdoob/three.js |
| ws 8 | WebSocket server | MIT, Copyright 2011 Einar Otto Stangvik and contributors | https://github.com/websockets/ws |
| Cinzel Decorative | Display font (title, headings) | SIL Open Font License 1.1 | Google Fonts |
| Barlow Condensed | UI font | SIL Open Font License 1.1 | Google Fonts |
| Barlow, JetBrains Mono | Fonts of the Codex page | SIL Open Font License 1.1 | Google Fonts |

The fonts are loaded from fonts.googleapis.com at run time and are not part of this repository. The minified three.js in `dist/` keeps its licence comment.

## Build only (not shipped)

| Component | Used for | Licence |
|---|---|---|
| esbuild | `npm run build` (minify) | MIT |

## MIT licence text (three.js, ws, esbuild)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Downloaded assets

None so far. Any downloaded asset must be listed in [assets/CREDITS.md](assets/CREDITS.md) with its source and licence.
