# Design exploration (Signal Gold)

A visual direction explored with the `/impeccable` design tool in September 2026. It is **not** the shipped
design of the app; the production Angular app keeps its own theme (see `frontend/` and the Branding admin screen).

| What | Where |
|---|---|
| Product context the tool works from | `PRODUCT.md` |
| The visual system (colours, type, layout, components) | `DESIGN.md` |
| The 9-step customer wizard built as static pages | `design-prototype/` (open `index.html`) |
| A deployed copy of the prototype | `frontend/public/design-preview/` |
| Tool settings that refer to these files | `.impeccable/config.json` (repo root) |

Keep this folder until the direction is either adopted in the Angular app or dropped; if dropped, delete the whole
folder (and the `.impeccable/config.json` entries for it). The `/impeccable` tool may look for `PRODUCT.md` and
`DESIGN.md` at the repository root; if a run cannot find them, point it at this folder.
