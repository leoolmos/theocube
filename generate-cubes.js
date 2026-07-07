/**
 * generate-cubes.js
 * -----------------------------------------------------------------------------
 * Generates the images for "Theo's Rubik Cube App".
 *
 * ONE random scramble is solved with the beginner layer method (solver.js). The
 * solution is split into the 8 video steps. For every step we render:
 *
 *   [id]-goal.svg      -> the OBJECTIVE (how the cube looks once the step ends).
 *   [id]-move-k.svg    -> the sub-steps that LEAD to that objective. Each frame
 *                         shows the cube + an arrow for the move to perform.
 *                         The LAST frame is exactly the objective.
 *
 * A manifest.json records, per step, every move with a plain-English "what and
 * where to turn" instruction.
 *
 * The cube's yellow is rendered as PURPLE (per request).
 * -----------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const dom = new JSDOM("<!DOCTYPE html><body></body>");
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

const pg = require("sr-puzzlegen/dist/bundle/puzzleGen.min.js");
const { SVG, Type } = pg;
const { solve, simplify } = require("./solver.js");

// --- Colors (yellow -> purple) -----------------------------------------------
const C = {
  P: { value: "#9B1FC1" }, W: { value: "#FDFDFD" }, R: { value: "#D42A2A" },
  B: { value: "#1E5AC8" }, O: { value: "#F08A24" }, G: { value: "#1F9E57" },
};
const SCHEME = { U: C.P, D: C.W, F: C.B, R: C.R, L: C.O, B: C.G };

// --- Step meta (titles + technique reminder from the videos) ------------------
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

// --- Move -> instruction + arrow ---------------------------------------------
const FACE_NAME = { U: "top", D: "bottom", F: "front", R: "right", L: "left", B: "back" };
const DIR = { "": "clockwise", "'": "counter-clockwise", "2": "180°" };
function instruction(move) {
  const f = move[0], suf = move.slice(1);
  if ("xyz".includes(f)) {
    const d = suf === "'" ? "backwards" : suf === "2" ? "180°" : "forwards";
    return `Rotate the WHOLE cube (${move})`;
  }
  return `Turn the ${FACE_NAME[f].toUpperCase()} face ${DIR[suf]}`;
}
const ARROW_PAIR = { U: [0, 2], F: [0, 2], R: [0, 2], D: [0, 2], L: [2, 8], B: [6, 8] };
function arrowFor(move) {
  const f = move[0], suf = move.slice(1);
  const pair = ARROW_PAIR[f];
  if (!pair) return []; // whole-cube rotation: no face arrow
  let [a, b] = pair;
  if (suf === "'") [a, b] = [b, a];
  return [{ start: { face: f, sticker: a }, end: { face: f, sticker: b } }];
}

// --- Rendering ---------------------------------------------------------------
function renderSvg(alg, arrows) {
  const container = document.createElement("div");
  SVG(container, Type.CUBE, {
    width: 400, height: 400, strokeWidth: 0.02, arrowStrokeWidth: 0.06,
    puzzle: { scheme: SCHEME, alg: alg.trim(), arrows: arrows || [] },
  });
  const svg = container.querySelector("svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML;
}

// --- Random scramble ---------------------------------------------------------
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

// --- Main --------------------------------------------------------------------
function main() {
  const outDir = path.join(__dirname, "public", "assets", "cubes");
  fs.mkdirSync(outDir, { recursive: true });
  // clear old svgs
  for (const f of fs.readdirSync(outDir)) if (f.endsWith(".svg")) fs.unlinkSync(path.join(outDir, f));

  // solve one scramble; retry until every phase is non-trivial-ish
  let sv, scramble;
  for (let tries = 0; tries < 50; tries++) {
    scramble = randomScramble();
    sv = solve(scramble);
    if (sv.solved()) break;
  }
  if (!sv.solved()) throw new Error("solver failed to solve the scramble");

  const manifest = { scramble, steps: [] };
  let prefix = [scramble]; // moves applied so far (scramble + finished steps)

  sv.phases.forEach((phase, idx) => {
    const id = idx + 1;
    const moves = simplify(phase.moves);
    const startAlg = prefix.join(" ");

    // frames 0..N: frame i = start + first i moves (+ arrow of move i); last = goal
    const stepMoves = [];
    for (let i = 0; i <= moves.length; i++) {
      const alg = [startAlg, ...moves.slice(0, i)].join(" ");
      const arrows = i < moves.length ? arrowFor(moves[i]) : [];
      fs.writeFileSync(path.join(outDir, `${id}-move-${i}.svg`), renderSvg(alg, arrows));
      if (i < moves.length) stepMoves.push({ move: moves[i], instruction: instruction(moves[i]) });
    }

    // objective image = last frame (state after the whole step)
    const goalAlg = [startAlg, ...moves].join(" ");
    fs.writeFileSync(path.join(outDir, `${id}-goal.svg`), renderSvg(goalAlg, []));

    manifest.steps.push({
      id, title: STEP_META[idx].title, goal: STEP_META[idx].goal, moves: stepMoves,
    });
    console.log(`✓ Step ${id} (${STEP_META[idx].title}): ${moves.length} moves + goal`);

    prefix.push(...moves);
  });

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nScramble: ${scramble}`);
  console.log(`Total solution moves: ${sv.moves.length}`);
  console.log(`Done! Wrote a full coherent walkthrough to ${outDir}`);
}

main();
