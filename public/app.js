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

// Short technique reminders (from the Manual do Mundo videos).
const TIPS = [
  "Intuitive: bring the 4 white edges up around the purple centre.",
  "Line each white edge up with its centre, then turn that face twice (F2) to drop it.",
  "Put a white corner above its slot, then R U R' U' until it drops in.",
  "Pair the middle edge and insert it left or right (U R U' R' U' F' U F).",
  "Dot, L or line? Apply F R U R' U' F' until the purple cross appears.",
  "Point the 'fish' to the bottom-left and apply the Sune: R U R' U R U2 R'.",
  "Find the 'headlights' (two matching corners) and cycle the corners.",
  "Cycle the last 3 edges to finish the cube.",
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
function buildSteps(scramble, sv) {
  const cube = new window.Cube();
  cube.move(scramble);
  return sv.phases.map((phase, idx) => {
    const moves = window.CubeSolver.simplify(phase.moves);
    const frames = [cube.asString()];
    const stepMoves = [];
    for (const mv of moves) {
      cube.move(mv);
      frames.push(cube.asString());
      stepMoves.push({ move: mv, instruction: instruction(mv) });
    }
    return { id: idx + 1, title: STEP_META[idx].title, goal: STEP_META[idx].goal, moves: stepMoves, frames };
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
  frameLabel: document.getElementById("frame-label"),
  framePrev: document.getElementById("frame-prev"),
  frameNext: document.getElementById("frame-next"),
  strip: document.getElementById("frame-strip"),
  prev: document.getElementById("btn-prev"),
  next: document.getElementById("btn-next"),
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

function renderStep() {
  const s = step();
  el.counter.textContent = `Step ${currentIndex + 1} of ${steps.length}`;
  el.title.textContent = s.title;
  el.goal.textContent = s.goal;
  el.tip.textContent = TIPS[currentIndex] || "";
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

  el.prev.disabled = currentIndex === 0;
  el.next.disabled = currentIndex === steps.length - 1;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderFrameLabel() {
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

function goStep(d) {
  const n = currentIndex + d;
  if (n < 0 || n >= steps.length) return;
  currentIndex = n;
  renderStep();
}

el.prev.addEventListener("click", () => goStep(-1));
el.next.addEventListener("click", () => goStep(1));
el.framePrev.addEventListener("click", () => stepFrame(-1));
el.frameNext.addEventListener("click", () => stepFrame(1));
el.shuffle.addEventListener("click", newPuzzle);
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") goStep(-1);
  if (e.key === "ArrowRight") goStep(1);
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
    renderStep();
  }, 30);
}

newPuzzle();
