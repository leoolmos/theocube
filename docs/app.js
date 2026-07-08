/**
 * Theo's Rubik Cube App — SPA logic (Vanilla JS, ES module).
 *
 * Everything runs client-side: on every page load a fresh random scramble is
 * generated and solved on the spot (window.CubeSolver, from js/solver.js),
 * split into the 8 pedagogical phases of the beginner layer method. Every
 * step and every move is rendered as a real, drag-to-rotate 3D cube
 * (js/cube3d.js) instead of static images, so the on-screen orientation
 * always matches the true cube state.
 */
import { RubiksCube3D } from "./js/cube3d.js";

// Step-by-step technique hints, in the spirit of the Manual do Mundo beginner
// videos. Each entry has a short `lead` and a few plain-language `steps` so a
// beginner understands WHAT is happening, not just which buttons to press.
const TIPS = [
  {
    lead: "Build a daisy on top: the purple centre in the middle, 4 white edges as petals.",
    steps: [
      "Turn the cube so the purple centre is on top.",
      "One at a time, bring a white edge up next to the purple centre.",
      "Ignore the edge's other colour for now — just get 4 white petals up top.",
    ],
  },
  {
    lead: "Drop each petal straight down to build a white cross underneath.",
    steps: [
      "Pick one white petal. Spin the TOP until the edge's side colour matches the centre right below it (red over red, etc.).",
      "Now turn that whole face TWICE (F2) — the white edge drops straight down.",
      "Repeat for all 4. Underneath you now have a white cross, each arm matching its side.",
    ],
  },
  {
    lead: "Finish the white face by dropping in the 4 white corners.",
    steps: [
      "Flip the cube so white is on the BOTTOM.",
      "Find a white corner in the TOP layer and move it right above the empty slot it belongs in (its 2 side colours must match the 2 nearby centres).",
      "Repeat R U R' U' until the corner drops in with white on the bottom.",
      "Corner stuck in the bottom the wrong way? Pop it out first with R U R', then redo.",
    ],
  },
  {
    lead: "Place the 4 middle-layer edges. Look on the TOP for any edge that has NO purple and NO white — those are middle edges temporarily sitting up there.",
    steps: [
      "Keep white on the bottom, purple on top.",
      "Look at the 4 edges on the top layer. Find one with NO purple and NO white — that's a middle-layer edge waiting to be placed.",
      "Spin the top (U) until that edge's FRONT colour matches the centre directly below it (it forms an upside-down T).",
      "Look at the sticker on top of that edge — it points to the side the edge must go.",
      "Goes RIGHT: U R U' R' U' F' U F.   Goes LEFT: U' L' U L U F U' F'.",
      "Why it works: U throws the edge away from the slot, then the algorithm tucks it in without breaking the white layer.",
      "No middle edge on top? One is trapped wrong in the middle layer — run either algorithm once to kick it out, then re-align it.",
    ],
  },
  {
    lead: "Make a purple cross on top. Look at the top-face edges only — you will see a dot, an L, or a line.",
    steps: [
      "Dot (no purple edges on top): apply F R U R' U' F' once — you will get an L or line.",
      "L shape (2 purple edges meeting at a corner): rotate the top until the two purple edges point to the BACK and LEFT — the corner where they meet is at back-left. Then apply F R U R' U' F'.",
      "Line (2 purple edges opposite each other): rotate until the line runs LEFT–RIGHT. Then apply F R U R' U' F'.",
      "Repeat until you see a full purple cross (all 4 edges purple on top).",
    ],
  },
  {
    lead: "Flip all 4 top corners purple-side up using the Sune. Keep going until the whole top face is purple.",
    steps: [
      "Look ONLY at the 4 top corners. Count how many have purple pointing STRAIGHT UP (flat on top, not sideways).",
      "0 purple up → apply the Sune once from any position, then re-count.",
      "1 purple up — this is the FISH. Rotate the cube until that corner sits at the FRONT-RIGHT. You will also see 2 more purples sticking out to the right — those are the fish fins. Apply the Sune.",
      "2 purple up → apply the Sune once from any position. A new pattern will appear. Find the fish, reposition, apply again.",
      "After every Sune, re-count top-corner purples. Adjust U if needed and repeat. Takes 1–4 Sunes. Done when all 4 corners show purple on top.",
    ],
  },
  {
    lead: "Move the top corners into their correct places. Just one algorithm, repeated until they line up.",
    steps: [
      "Look around the top for 'headlights' — a side where the 2 top corners show the SAME colour.",
      "No headlights anywhere? Apply the algorithm once from any position — they will appear.",
      "Turn the whole cube so the headlights face YOU (the front), then apply the algorithm.",
      "All corners in place? If not, repeat from step 1. Then turn the top (U) to finish.",
    ],
  },
  {
    lead: "Cycle the 3 remaining top edges to finish the cube. One edge is already correct — hold it at the BACK.",
    steps: [
      "Look at the 4 top-layer side edges. Find one that already matches the centre colour below it.",
      "Hold that face at the BACK. The 3 other edges (front, right, left) will cycle.",
      "If no edge matches: apply either algorithm once, then find the matching edge, reposition it to the back, and apply again.",
      "Edges cycle clockwise (right →): use Algorithm A.  Edges cycle counter-clockwise (← left): use Algorithm B.",
      "After the algorithm, turn U to align the top layer — the cube is solved!",
    ],
  },
];

// Fixed algorithm reference shown beneath the technique description.
// Each entry maps to the same index as TIPS. null = no fixed alg for that step.
// Colours match the 3D renderer sticker palette from cube3d.js.
const FACE_COLOR = {
  U: { bg: "#9b1fc1", fg: "#ffffff" },
  R: { bg: "#d42a2a", fg: "#ffffff" },
  F: { bg: "#1e5ac8", fg: "#ffffff" },
  D: { bg: "#e2e8f0", fg: "#1e293b" },
  L: { bg: "#f08a24", fg: "#ffffff" },
  B: { bg: "#1f9e57", fg: "#ffffff" },
};
const ALGS = [
  null, // step 1 — daisy (intuitive)
  null, // step 2 — cross (intuitive)
  null, // step 3 — first layer (intuitive)
  {     // step 4 — second layer: two insert directions
    variants: [
      { label: "Edge goes RIGHT →", moves: "U R U' R' U' F' U F" },
      { label: "Edge goes LEFT ←",  moves: "U' L' U L U F U' F'" },
    ],
  },
  {     // step 5 — purple cross
    variants: [
      { label: "Cross algorithm (repeat until cross appears)", moves: "F R U R' U' F'" },
    ],
  },
  {     // step 6 — purple face: Sune only
    variants: [
      { label: "Sune — fish at FRONT-RIGHT (repeat until full face)", moves: "R U R' U R U2 R'" },
    ],
  },
  {     // step 7 — corners: only the Ab perm (as in the beginner video)
    variants: [
      { label: "Headlights facing YOU (front) — repeat until corners are placed", moves: "R B' R F2 R' B R F2 R2" },
    ],
  },
  {     // step 8 — final edges: completed face at BACK, two cycle directions
    variants: [
      { label: "Algorithm A — cycle clockwise →  (matching edge at BACK)", moves: "F2 U L R' F2 L' R U F2"  },
      { label: "Algorithm B — cycle counter-clockwise ←  (matching edge at BACK)", moves: "F2 U' L R' F2 L' R U' F2" },
    ],
  },
];

const STEP_META = [
  { title: "White Daisy", goal: "A purple centre on top with 4 white edges around it — like a daisy." },
  { title: "White Cross", goal: "The white cross on the bottom, each edge matching its side centre." },
  { title: "First Layer", goal: "The whole white face done, with the side colours matching. 1/3 solved." },
  { title: "Second Layer", goal: "The first two layers complete. 2/3 solved." },
  { title: "Purple Cross", goal: "A purple cross formed on top." },
  { title: "Purple Face", goal: "The whole purple face closed on top." },
  { title: "Corners", goal: "All last-layer corners in their correct places." },
  { title: "Final Edges", goal: "The cube is 100% solved!" },
];

const FACE_NAME = { U: "top", D: "bottom", F: "front", R: "right", L: "left", B: "back" };
const DIR = { "": "clockwise", "'": "counter-clockwise", "2": "180°" };
function instruction(move) {
  const f = move[0], suf = move.slice(1);
  if ("xyz".includes(f)) return `Rotate the WHOLE cube (${move})`;
  return `Turn the ${FACE_NAME[f].toUpperCase()} face ${DIR[suf]}`;
}

// Facelet letter → colour word, matching the 3D renderer's sticker palette.
const COLOR = { U: "purple", D: "white", F: "blue", R: "red", L: "orange", B: "green" };
// Turns a segment label into a short "which piece" phrase for the banner.
function pieceName(label) {
  if (!label) return "";
  if (label.note) return label.note;
  if (label.cols) {
    const parts = label.cols.split("").map((c) => COLOR[c]);
    return `${parts.join("-")} ${parts.length === 3 ? "corner" : "edge"}`;
  }
  return "";
}

const FACES = ["U", "D", "L", "R", "F", "B"];
function randomScramble(n = 22) {
  const out = []; let prev = "";
  for (let i = 0; i < n; i++) {
    let f; do { f = FACES[Math.floor(Math.random() * 6)]; } while (f === prev);
    prev = f;
    out.push(f + ["", "'", "2"][Math.floor(Math.random() * 3)]);
  }
  return out.join(" ");
}

// Replays a solved scramble into 8 steps, each with a facelet-string "frame"
// per move (frame 0 = state before the step's first move, last frame = goal).
// Every step's moves are grouped into segments (one piece at a time) so the UI
// can announce which piece the next sequence solves. Each segment is simplified
// on its own, so a piece's algorithm is never merged into its neighbour's.
function buildSteps(scramble, sv) {
  const cube = new window.Cube();
  cube.move(scramble);
  return sv.phases.map((phase, idx) => {
    // Fall back to one whole-phase segment when the phase isn't segmented, or
    // when its segments don't cleanly cover every move (safety for the replay).
    let raw = phase.segments || [];
    const covered = raw.length && raw[0].from === 0 &&
      raw.every((s, i) => i === 0 || s.from === raw[i - 1].to) &&
      raw[raw.length - 1].to === phase.moves.length;
    if (!covered) raw = [{ label: null, from: 0, to: phase.moves.length }];

    const frames = [cube.asString()];
    const stepMoves = [];
    const segments = [];
    for (const sg of raw) {
      const moves = window.CubeSolver.simplify(phase.moves.slice(sg.from, sg.to));
      if (!moves.length) continue;
      const prev = segments[segments.length - 1];
      const sameAsPrev = prev && JSON.stringify(prev.label) === JSON.stringify(sg.label);
      const start = stepMoves.length;
      for (const mv of moves) {
        cube.move(mv);
        frames.push(cube.asString());
        stepMoves.push({ move: mv, instruction: instruction(mv) });
      }
      // Merge consecutive segments that target the same piece.
      if (sameAsPrev) prev.count += moves.length;
      else segments.push({ label: sg.label, start, count: moves.length });
    }
    return { id: idx + 1, title: STEP_META[idx].title, goal: STEP_META[idx].goal, moves: stepMoves, frames, segments };
  });
}

let steps = [];
let currentIndex = 0;
let frameIndex = 0;
let animating = false;
const thumbCache = new Map();

const el = {
  loading: document.getElementById("loading"),
  app: document.getElementById("app"),
  counter: document.getElementById("step-counter"),
  title: document.getElementById("step-title"),
  goal: document.getElementById("step-goal"),
  tip: document.getElementById("step-tip"),
  algSection: document.getElementById("alg-section"),
  algBox: document.getElementById("alg-box"),
  segLabel: document.getElementById("seg-label"),
  frameLabel: document.getElementById("frame-label"),
  framePrev: document.getElementById("frame-prev"),
  frameNext: document.getElementById("frame-next"),
  strip: document.getElementById("frame-strip"),
  stepNav: document.getElementById("step-nav"),
  stepLoading: document.getElementById("step-loading"),
  shuffle: document.getElementById("btn-shuffle"),
};

const goalViewer = new RubiksCube3D(document.getElementById("goal3d"), { interactive: true });
const frameViewer = new RubiksCube3D(document.getElementById("frame3d"), { interactive: true });
const thumbViewer = new RubiksCube3D(document.getElementById("thumb-factory"), { interactive: false });

function step() { return steps[currentIndex]; }

function thumbFor(s, k) {
  const key = s.id + ":" + k;
  if (thumbCache.has(key)) return thumbCache.get(key);
  thumbViewer.setState(s.frames[k]);
  if (k < s.moves.length) thumbViewer.showMoveArrow(s.moves[k].move);
  else thumbViewer.clearMoveArrow();
  const url = thumbViewer.snapshot(96);
  thumbCache.set(key, url);
  return url;
}

// Shows an arrow on the face/direction of the move about to be played, or
// clears it once the step's objective has been reached.
function syncArrow() {
  const s = step();
  if (frameIndex < s.moves.length) frameViewer.showMoveArrow(s.moves[frameIndex].move);
  else frameViewer.clearMoveArrow();
}

// Renders a structured hint: a bold lead line plus a numbered list of small,
// plain-language steps. Uses textContent per node so cube notation (R U R')
// can never be interpreted as HTML.
function renderTip(tip) {
  el.tip.innerHTML = "";
  if (!tip) return;
  if (typeof tip === "string") { el.tip.textContent = tip; return; }
  const lead = document.createElement("p");
  lead.className = "font-bold mb-1";
  lead.textContent = tip.lead;
  el.tip.appendChild(lead);
  if (tip.steps && tip.steps.length) {
    const ol = document.createElement("ol");
    ol.className = "list-decimal pl-5 space-y-1 font-medium text-slate-700";
    for (const s of tip.steps) {
      const li = document.createElement("li");
      li.textContent = s;
      ol.appendChild(li);
    }
    el.tip.appendChild(ol);
  }
}

// Renders the algorithm reference box: one row of colour-coded chips per variant.
function renderAlgs(alg) {
  if (!alg) { el.algSection.classList.add("hidden"); return; }
  el.algSection.classList.remove("hidden");
  el.algBox.innerHTML = "";
  alg.variants.forEach((v, vi) => {
    if (vi > 0) {
      const hr = document.createElement("hr");
      hr.className = "border-slate-100";
      el.algBox.appendChild(hr);
    }
    const wrap = document.createElement("div");
    const lbl = document.createElement("p");
    lbl.className = "text-xs font-semibold text-slate-500 mb-1";
    lbl.textContent = v.label;
    wrap.appendChild(lbl);
    const row = document.createElement("div");
    row.className = "flex flex-wrap gap-1";
    for (const m of window.CubeSolver.tokenize(v.moves)) {
      const fc = FACE_COLOR[m[0]] || { bg: "#64748b", fg: "#fff" };
      const chip = document.createElement("span");
      chip.className = "alg-chip";
      chip.style.background = fc.bg;
      chip.style.color = fc.fg;
      chip.textContent = m;
      row.appendChild(chip);
    }
    wrap.appendChild(row);
    el.algBox.appendChild(wrap);
  });
}

function renderStep() {
  const s = step();
  el.counter.textContent = `Step ${currentIndex + 1} of ${steps.length}`;
  el.title.textContent = s.title;
  el.goal.textContent = s.goal;
  renderTip(TIPS[currentIndex]);
  renderAlgs(ALGS[currentIndex]);
  goalViewer.setState(s.frames[s.frames.length - 1]);

  el.strip.innerHTML = "";
  for (let k = 0; k <= s.moves.length; k++) {
    const btn = document.createElement("button");
    btn.className = "frame-thumb";
    btn.dataset.k = String(k);
    const label = k < s.moves.length ? s.moves[k].move : "✓";
    const img = document.createElement("img");
    img.alt = `frame ${k}`;
    img.src = thumbFor(s, k);
    const span = document.createElement("span");
    span.textContent = label;
    btn.append(img, span);
    btn.addEventListener("click", () => setFrame(k));
    el.strip.appendChild(btn);
  }

  frameIndex = 0;
  frameViewer.setState(s.frames[0]);
  syncArrow();
  renderFrameLabel();

  renderStepNav();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Bottom bar: one button per step. Builds the buttons once, then just
// updates the highlighted (current) one on each render.
function buildStepNav() {
  el.stepNav.innerHTML = "";
  for (let i = 0; i < steps.length; i++) {
    const b = document.createElement("button");
    b.dataset.i = String(i);
    b.title = `Step ${i + 1}: ${steps[i].title}`;
    b.textContent = String(i + 1);
    b.className =
      "py-2 rounded-lg font-bold text-sm active:scale-95 transition";
    b.addEventListener("click", () => goStep(i));
    el.stepNav.appendChild(b);
  }
}

function renderStepNav() {
  el.stepNav.querySelectorAll("button").forEach((b) => {
    const active = Number(b.dataset.i) === currentIndex;
    b.className =
      "py-2 rounded-lg font-bold text-sm active:scale-95 transition " +
      (active
        ? "bg-amber-400 text-slate-900 ring-2 ring-amber-500"
        : "bg-slate-200 text-slate-600 hover:bg-slate-300");
  });
}

// Banner above the move player: names the piece the upcoming sequence solves.
function renderSegLabel() {
  const s = step();
  const seg = (s.segments || []).find((g) => frameIndex >= g.start && frameIndex < g.start + g.count);
  const label = seg && seg.label;
  if (frameIndex >= s.moves.length || !label) {
    el.segLabel.classList.add("hidden");
    el.segLabel.textContent = "";
  } else {
    el.segLabel.classList.remove("hidden");
    // A named piece ("Now solving: blue-red edge") vs. a plain action note.
    el.segLabel.innerHTML = label.note ? `🧩 ${label.note}` : `🧩 Now solving: <b>${pieceName(label)}</b>`;
  }
}

function renderFrameLabel() {
  renderSegLabel();
  const s = step();
  const total = s.moves.length;
  if (frameIndex >= total) {
    el.frameLabel.innerHTML = `<b>✓ Objective reached</b> — this matches the goal above`;
  } else {
    const m = s.moves[frameIndex];
    el.frameLabel.innerHTML =
      `Move <b>${frameIndex + 1}</b> of ${total} &nbsp;<span class="move-badge">${m.move}</span><br>${m.instruction}`;
  }
  el.framePrev.disabled = animating || frameIndex === 0;
  el.frameNext.disabled = animating || frameIndex >= total;
  el.strip.querySelectorAll(".frame-thumb").forEach((t) => {
    t.classList.toggle("active", Number(t.dataset.k) === frameIndex);
  });
}

function setFrame(k) {
  if (animating || k < 0 || k > step().moves.length) return;
  frameIndex = k;
  frameViewer.setState(step().frames[frameIndex]);
  syncArrow();
  renderFrameLabel();
}

async function stepFrame(delta) {
  if (animating) return;
  const s = step();
  const target = frameIndex + delta;
  if (target < 0 || target > s.moves.length) return;
  animating = true;
  renderFrameLabel();
  const token = delta > 0 ? s.moves[frameIndex].move : window.CubeSolver.invert(s.moves[target].move);
  await frameViewer.playMove(token, s.frames[target]);
  frameIndex = target;
  syncArrow();
  animating = false;
  renderFrameLabel();
}

// Jumps to an absolute step index. Rendering a step builds up to ~20 cube
// thumbnails synchronously, which can freeze slower devices, so we paint a
// loading overlay first and defer the heavy render to the next tick.
function goStep(n) {
  if (n < 0 || n >= steps.length || n === currentIndex || animating) return;
  el.stepLoading.classList.remove("hidden");
  setTimeout(() => {
    currentIndex = n;
    renderStep();
    el.stepLoading.classList.add("hidden");
  }, 30);
}

el.framePrev.addEventListener("click", () => stepFrame(-1));
el.frameNext.addEventListener("click", () => stepFrame(1));
el.shuffle.addEventListener("click", newPuzzle);
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") goStep(currentIndex - 1);
  if (e.key === "ArrowRight") goStep(currentIndex + 1);
  if (e.key === "a" || e.key === "A") stepFrame(-1);
  if (e.key === "d" || e.key === "D") stepFrame(1);
});

function newPuzzle() {
  el.loading.classList.remove("hidden");
  el.app.classList.add("hidden");
  el.loading.querySelector("p").textContent = "Shuffling a new cube and solving it…";
  thumbCache.clear();
  // Let the loading state paint before the (synchronous) solve runs. Uses
  // setTimeout (not rAF) because rAF never fires on a hidden/background tab.
  setTimeout(() => {
    let sv, scramble, ok = false;
    for (let tries = 0; tries < 50; tries++) {
      scramble = randomScramble();
      sv = window.CubeSolver.solve(scramble);
      if (sv.solved()) { ok = true; break; }
    }
    if (!ok) {
      el.loading.querySelector("p").textContent = "Could not solve this scramble — tap 🔀 to try again.";
      return;
    }
    steps = buildSteps(scramble, sv);
    currentIndex = 0;
    el.loading.classList.add("hidden");
    el.app.classList.remove("hidden");
    goalViewer.resize();
    frameViewer.resize();
    buildStepNav();
    renderStep();
  }, 30);
}

newPuzzle();

// Register the service worker so the app is installable and works offline.
// Path is relative so it works under the GitHub Pages sub-path.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
