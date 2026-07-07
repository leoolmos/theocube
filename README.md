# Theo's Rubik Cube App 🧩

Static web app that solves **one freshly-scrambled cube, step by step**, using
the **beginner layer method (8 steps)** from the Manual do Mundo videos (Renan
Serp). Every page load shuffles a brand-new random cube and solves it live in
the browser — no two visits show the same scramble.

For each step the app shows:

- **🎯 Goal** — a real, drag-to-rotate **3D cube** showing how the cube should
  look once that step is done (the actual objective for _this_ cube — hold and
  drag to see every face).
- **📝 Technique** — a short reminder of the method.
- **🔄 Follow the moves** — the sub-steps that lead to the goal, **one 3D frame
  per move**. Tapping ▶ animates the real face turn on the cube itself. The
  **last frame of every step is exactly the goal state**, so the whole thing is
  coherent from the same scramble down to the solved cube.

The cube's yellow is rendered as **purple** (per request). The default camera
framing (top + front + right visible) matches how the cube is held in the
tutorial videos.

**Stack:** HTML5 · Vanilla JS (ES modules) · Tailwind (CDN) · Three.js (CDN,
3D rendering) · [`cubejs`](https://www.npmjs.com/package/cubejs) (vendored,
cube move engine).

## How it works

Everything runs **client-side**, in the browser, on every load:

- **`docs/vendor/cubejs.js`** — the `cubejs` cube model/move engine,
  vendored as a plain script (sets `window.Cube`).
- **`docs/js/solver.js`** — a real beginner layer-by-layer solver (browser
  port of `solver.js`, same algorithm, sets `window.CubeSolver`). It produces
  the solution grouped into the 8 pedagogical phases (daisy, white cross,
  first layer, second layer, last-layer cross, last-layer face, corners,
  edges). Every placement is **verified** against the facelet state, and the
  algorithm is tested to solve **1000/1000** random scrambles (`node solver.js
  1000`).
- **`docs/js/cube3d.js`** — a real 3D Rubik's cube (Three.js): 26 fixed-slot
  cubie meshes recolored from a cubejs facelet string, drag-to-orbit camera
  (pointer events, works on touch too), and an animated `playMove()` for
  watching a single turn happen.
- **`docs/app.js`** — on load, generates a random scramble, solves it, and
  drives the SPA: builds the 8 steps + per-move facelet frames, and renders
  them into the 3D viewers.
- **`solver.js`** / **`generate-cubes.js`** (repo root, Node) — the original
  solver + a static-SVG image pipeline, kept for solver regression testing
  (`node solver.js 1000`); no longer used by the live app.

## Structure

```
theocube/
├── solver.js                 # beginner layer-method solver (Node, for testing)
├── generate-cubes.js         # legacy: static SVG pipeline (unused by the app)
├── server.js                 # tiny static server for local dev
├── docs/                      # site root (served by GitHub Pages, Source: /docs)
│   ├── index.html
│   ├── app.js                 # SPA logic (ES module)
│   ├── assets/logo.svg        # wordmark
│   ├── vendor/cubejs.js       # vendored cube engine
│   └── js/
│       ├── solver.js          # browser port of the solver
│       └── cube3d.js          # 3D cube renderer (Three.js)
└── .github/workflows/deploy.yml
```

Test the solver on N random scrambles:

```bash
node solver.js 1000  # -> "solved 1000/1000"
```

## Run locally

```bash
npm start            # zero-dependency static server
# open http://localhost:4321
```

Keyboard: **← / →** change step, **A / D** animate through the moves. Drag any
3D cube to rotate it; scroll to zoom. Tap **🔀** for a new random scramble.

## Deploy to GitHub Pages

Pages is served straight from the `docs/` folder (Settings → Pages → Source:
Deploy from a branch → `main` / `/docs`). The optional
`.github/workflows/deploy.yml` publishes `docs/` on push to `main`
(Settings → Pages → Source: GitHub Actions). The images are committed, so Pages
just serves the files.
