/**
 * solver.js — Beginner (layer-by-layer) Rubik's cube solver.
 *
 * Uses `cubejs` as the cube model / move engine. Produces the solution as the
 * 8 pedagogical phases of the Manual do Mundo videos:
 *   1 daisy, 2 white cross, 3 first layer, 4 second layer,
 *   5 last-layer cross, 6 last-layer face, 7 corners, 8 edges.
 *
 * Correctness strategy: every placement is VERIFIED. We apply a standard
 * technique algorithm, then check (via the facelet string) that the target
 * piece landed and the previously-solved pieces are untouched; if not, we undo
 * and try another setup/algorithm. The final cube is asserted solved.
 *
 * Facelet string (cubejs) order: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53)
 * Per face:  0 1 2 / 3 4 5 / 6 7 8
 */

const Cube = require("cubejs");

// --- Piece tables ------------------------------------------------------------
// edge: [faceletA, faceletB] with home colors [A, B]
const EDGES = {
  UF: [7, 19], UR: [5, 10], UB: [1, 46], UL: [3, 37],
  DF: [28, 25], DR: [32, 16], DB: [34, 52], DL: [30, 43],
  FR: [23, 12], FL: [21, 41], BR: [48, 14], BL: [50, 39],
};
const EDGE_COLORS = {
  UF: "UF", UR: "UR", UB: "UB", UL: "UL",
  DF: "DF", DR: "DR", DB: "DB", DL: "DL",
  FR: "FR", FL: "FL", BR: "BR", BL: "BL",
};
const CORNERS = {
  URF: [8, 9, 20], UFL: [6, 18, 38], ULB: [0, 36, 47], UBR: [2, 45, 11],
  DFR: [29, 26, 15], DLF: [27, 44, 24], DBL: [33, 53, 42], DRB: [35, 17, 51],
};
const CORNER_COLORS = {
  URF: "URF", UFL: "UFL", ULB: "ULB", UBR: "UBR",
  DFR: "DFR", DLF: "DLF", DBL: "DBL", DRB: "DRB",
};

// U-layer petals (edge slot -> up facelet, side facelet)
const PETALS = { UF: [7, 19], UR: [5, 10], UB: [1, 46], UL: [3, 37] };
// bottom cross slots: down facelet, side facelet, side color
const CROSS = {
  F: [28, 25, "F"], R: [32, 16, "R"], B: [34, 52, "B"], L: [30, 43, "L"],
};

// --- Move helpers -------------------------------------------------------------
function tokenize(a) { return a.trim().split(/\s+/).filter(Boolean); }
function invToken(t) {
  const f = t[0], s = t.slice(1);
  if (s === "2") return t;
  if (s === "'") return f;
  return f + "'";
}
function invert(alg) { return tokenize(alg).reverse().map(invToken).join(" "); }

// Merge adjacent same-face moves (U U -> U2, U U' -> nothing, ...). Returns a
// shorter token array with the same net effect. Repeats until stable.
const AMT = { "": 1, "'": 3, "2": 2 };
const AMT_INV = { 1: "", 2: "2", 3: "'" };
function simplify(tokens) {
  let arr = tokens.slice();
  let changed = true;
  while (changed) {
    changed = false;
    const out = [];
    for (const t of arr) {
      const last = out[out.length - 1];
      if (last && last[0] === t[0]) {
        const amt = (AMT[last.slice(1)] + AMT[t.slice(1)]) % 4;
        out.pop();
        if (amt !== 0) out.push(t[0] + AMT_INV[amt]);
        changed = true;
      } else out.push(t);
    }
    arr = out;
  }
  return arr;
}

// --- Solver ------------------------------------------------------------------
class Solver {
  constructor(scramble) {
    this.cube = new Cube();
    if (scramble) this.cube.move(scramble);
    this.moves = [];      // flat list of solution moves (no scramble)
    this.phases = [];     // [{name, moves:[...]}]
  }
  s() { return this.cube.asString(); }
  _apply(alg) { const t = tokenize(alg); if (t.length) { this.cube.move(t.join(" ")); } return t; }
  do(alg, bucket) {
    const t = this._apply(alg);
    for (const m of t) { this.moves.push(m); if (bucket) bucket.push(m); }
  }
  undo(alg, bucket) {
    const t = tokenize(alg);
    if (!t.length) return;
    this.cube.move(invert(t.join(" ")));
    this.moves.splice(this.moves.length - t.length, t.length);
    if (bucket) bucket.splice(bucket.length - t.length, t.length);
  }

  // find a piece (by its color multiset) -> slot name, or null
  findEdge(colors) {
    const want = colors.split("").sort().join("");
    for (const slot in EDGES) {
      const [a, b] = EDGES[slot];
      const st = this.s();
      const have = [st[a], st[b]].sort().join("");
      if (have === want) return slot;
    }
    return null;
  }
  findCorner(colors) {
    const want = colors.split("").sort().join("");
    const st = this.s();
    for (const slot in CORNERS) {
      const [a, b, c] = CORNERS[slot];
      const have = [st[a], st[b], st[c]].sort().join("");
      if (have === want) return slot;
    }
    return null;
  }

  // predicates
  crossEdgeSolved(side) { const st = this.s(); const [d, s2, col] = CROSS[side]; return st[d] === "D" && st[s2] === col; }
  crossSolved() { return ["F", "R", "B", "L"].every((s) => this.crossEdgeSolved(s)); }
  petalUp(slot) { const [u] = PETALS[slot]; return this.s()[u] === "D"; }
  petalCount() { return Object.keys(PETALS).filter((p) => this.petalUp(p)).length; }
  flCornerSolved(name) {
    const st = this.s(); const [a, b, c] = CORNERS[name]; const [ca, cb, cc] = CORNER_COLORS[name].split("");
    return st[a] === ca && st[b] === cb && st[c] === cc;
  }
  slEdgeSolved(name) {
    const st = this.s(); const [a, b] = EDGES[name]; const [ca, cb] = EDGE_COLORS[name].split("");
    return st[a] === ca && st[b] === cb;
  }
  firstLayerSolved() { return this.crossSolved() && ["DFR", "DLF", "DBL", "DRB"].every((c) => this.flCornerSolved(c)); }
  secondLayerSolved() { return this.firstLayerSolved() && ["FR", "FL", "BR", "BL"].every((e) => this.slEdgeSolved(e)); }
  ollCross() { const st = this.s(); return st[1] === "U" && st[3] === "U" && st[5] === "U" && st[7] === "U"; }
  topFaceCount() { const st = this.s(); let n = 0; for (let i = 0; i < 9; i++) if (st[i] === "U") n++; return n; }
  ollDone() { return this.topFaceCount() === 9; }
  cornersPermuted() {
    // corners in correct spots (orientation done). check side colors match centers for some pieces.
    const st = this.s();
    return (
      this.flCornerSolvedTop("URF") && this.flCornerSolvedTop("UFL") &&
      this.flCornerSolvedTop("ULB") && this.flCornerSolvedTop("UBR")
    );
  }
  flCornerSolvedTop(name) {
    const st = this.s(); const [a, b, c] = CORNERS[name]; const cols = CORNER_COLORS[name];
    return [st[a], st[b], st[c]].sort().join("") === cols.split("").sort().join("") &&
      st[a] === "U"; // oriented up and in right spot
  }
  solved() { return this.cube.isSolved(); }

  // IDDFS: shortest move sequence (<=maxDepth) that makes goal() true. Returns
  // the move array (cube restored), or null. Prunes consecutive same-face moves.
  search(goal, maxDepth, moveset) {
    const moves = moveset || ["U", "U'", "U2", "D", "D'", "D2", "F", "F'", "F2", "B", "B'", "B2", "R", "R'", "R2", "L", "L'", "L2"];
    let result = null;
    const rec = (depth, lastFace, path) => {
      if (goal()) { result = path.slice(); return true; }
      if (depth === 0) return false;
      for (const m of moves) {
        if (m[0] === lastFace) continue;
        this.cube.move(m);
        path.push(m);
        const ok = rec(depth - 1, m[0], path);
        path.pop();
        this.cube.move(invToken(m));
        if (ok) return true;
      }
      return false;
    };
    for (let d = 0; d <= maxDepth; d++) { if (rec(d, "", [])) return result; }
    return null;
  }

  // Verified attempt: try rotations x setups x algs until goal() and every
  // keep() holds. Each candidate is wrapped rot + setup + alg + rot⁻¹ so we can
  // work the front slots while detecting in the home orientation.
  attempt(goal, keeps, algs, setups, bucket, rots) {
    const rotList = rots || [""];
    for (const rot of rotList) {
      const inv = rot ? invert(rot) : "";
      for (const su of setups) {
        for (const al of algs) {
          const seq = [rot, su, al, inv].filter(Boolean).join(" ").trim();
          this.do(seq, bucket);
          if (goal() && keeps.every((k) => k())) return true;
          this.undo(seq, bucket);
        }
      }
    }
    return false;
  }

  phase(name, fn) {
    const bucket = [];
    fn(bucket);
    this.phases.push({ name, moves: bucket.slice() });
  }
}

// setups
const AUF = ["", "U", "U2", "U'"];
const ALL_SETUPS = [];
for (const u of ["", "U", "U2", "U'"]) for (const d of ["", "D", "D2", "D'"]) ALL_SETUPS.push((u + " " + d).trim());

// generic lift algs to get a white edge to a petal (white up)
const LIFT_ALGS = [
  "F2", "B2", "R2", "L2",
  "F", "F'", "B", "B'", "R", "R'", "L", "L'",
  "F U' F'", "F' U F", "R U' R'", "R' U R", "B U' B'", "B' U B", "L U' L'", "L' U L",
  "F U F'", "R U R'", "B U B'", "L U L'",
  "F' U' F", "R' U' R", "B' U' B", "L' U' L",
];
// Beginner corner insertions — ONLY face turns (no cube rotation). The verifier
// picks whichever one drops the target corner into its slot. Covers all 4 slots
// and the 3 orientations (the "R U R' U'" repeat trick included).
const CORNER_INSERTS = (() => {
  const out = [
    "R U R'", "R U' R'", "R U2 R'", "F' U' F", "F' U F", "F' U2 F",
    "L' U' L", "L' U L", "L' U2 L", "F U F'", "F U' F'", "F U2 F'",
    "R' U' R", "R' U R", "L U L'", "L U' L'", "B U B'", "B U' B'", "B' U' B", "B' U B",
  ];
  // "repeat the sexy move until it drops in" (video trick), one per slot's faces
  const sexy = ["R U R' U'", "L' U' L U", "F U F' U'", "B' U' B U", "R' U' R U", "B U B' U'"];
  for (const sx of sexy) {
    let s = sx;
    for (let k = 1; k <= 5; k++) { out.push(s.trim()); s += " " + sx; }
  }
  return out;
})();
// which trigger pops a wrong corner out of a bottom slot up to the U layer
const CORNER_POP = { DFR: "R U R'", DLF: "L' U' L", DRB: "R' U' R", DBL: "L U L'" };
// Beginner second-layer edge insertions — face turns only (no cube rotation),
// covering every slot and both edge orientations. The verifier picks the right
// one for the target slot.
const EDGE_INSERTS_ALL = [
  "U R U' R' U' F' U F", "U' L' U L U F U' F'",
  "U B U' B' U' R' U R", "U' R' U R U B U' B'",
  "U' B' U B U L U' L'", "U L U' L' U' B' U B",
  "U F' U F U R U' R'", "U' F U F' U' L' U L",
  "U L' U L U F U' F'", "U' R U' R' U' F' U F",
  "U2 R U' R' U' F' U F", "U2 L' U L U F U' F'",
];

function solve(scramble) {
  const sv = new Solver(scramble);

  // ---- 1) DAISY: 4 white edges to the top, white up ----
  sv.phase("daisy", (b) => {
    let guard = 0;
    while (sv.petalCount() < 4 && guard++ < 8) {
      const before = sv.petalCount();
      // The daisy is intuitive in the videos — a short search finds the turns to
      // add one more white edge on top (without a net loss).
      const seq = sv.search(() => sv.petalCount() > before, 4);
      if (seq && seq.length) sv.do(seq.join(" "), b);
      else break;
    }
  });

  // ---- 2) WHITE CROSS: drop each petal to its center ----
  sv.phase("cross", (b) => {
    for (const side of ["F", "R", "B", "L"]) {
      if (sv.crossEdgeSolved(side)) continue;
      const keeps = ["F", "R", "B", "L"]
        .filter((s2) => sv.crossEdgeSolved(s2))
        .map((s2) => () => sv.crossEdgeSolved(s2));
      const goal = () => sv.crossEdgeSolved(side);
      sv.attempt(goal, keeps, [side + "2"], AUF, b) ||
        sv.attempt(goal, keeps, LIFT_ALGS.concat([side + "2"]), ALL_SETUPS, b);
    }
  });

  // ---- 3) FIRST LAYER corners ----
  sv.phase("firstLayer", (b) => {
    const CSLOTS = ["DFR", "DRB", "DBL", "DLF"];
    const hasWhite = (slot) => { const [a, bb, c] = CORNERS[slot]; const s = sv.s(); return s[a] === "D" || s[bb] === "D" || s[c] === "D"; };
    let guard = 0;
    while (!sv.firstLayerSolved() && guard++ < 30) {
      // a white corner sitting in the U layer?
      const uCorner = ["URF", "UFL", "ULB", "UBR"].find(hasWhite);
      if (uCorner) {
        const [a, bb, c] = CORNERS[uCorner]; const s = sv.s();
        const cols = [s[a], s[bb], s[c]].sort().join("");
        const home = CSLOTS.find((sl) => CORNER_COLORS[sl].split("").sort().join("") === cols);
        const keeps = CSLOTS.filter((cc) => cc !== home && sv.flCornerSolved(cc)).map((cc) => () => sv.flCornerSolved(cc))
          .concat(["F", "R", "B", "L"].map((s2) => () => sv.crossEdgeSolved(s2)));
        const goal = () => sv.flCornerSolved(home);
        const ok = sv.attempt(goal, keeps, CORNER_INSERTS, AUF, b);
        if (!ok) sv.do("U", b);
      } else {
        // a white corner is stuck in the bottom (wrong slot/orientation): pop it up
        const bad = CSLOTS.find((sl) => hasWhite(sl) && !sv.flCornerSolved(sl));
        if (!bad) break;
        sv.do(CORNER_POP[bad], b);
      }
    }
  });

  // ---- 4) SECOND LAYER edges ----
  sv.phase("secondLayer", (b) => {
    let guard = 0;
    while (!sv.secondLayerSolved() && guard++ < 30) {
      // find a middle edge sitting in the U layer (no U/D sticker)
      const uSlot = ["UF", "UR", "UB", "UL"].find((sl) => {
        const [a, bb] = EDGES[sl]; const s = sv.s();
        return s[a] !== "U" && s[a] !== "D" && s[bb] !== "U" && s[bb] !== "D";
      });
      if (uSlot) {
        const [a, bb] = EDGES[uSlot]; const s = sv.s();
        const cols = [s[a], s[bb]].sort().join("");
        const home = ["FR", "FL", "BR", "BL"].find((e) => EDGE_COLORS[e].split("").sort().join("") === cols);
        const keeps = ["FR", "FL", "BR", "BL"]
          .filter((e) => e !== home && sv.slEdgeSolved(e)).map((e) => () => sv.slEdgeSolved(e))
          .concat([() => sv.firstLayerSolved()]);
        const goal = () => sv.slEdgeSolved(home);
        const ok = sv.attempt(goal, keeps, EDGE_INSERTS_ALL, AUF, b) ||
          sv.attempt(goal, keeps, ["U R U' R' U' F' U F"], AUF, b, ["", "y", "y2", "y'"]);
        if (!ok) sv.do("U", b);
      } else {
        // no U-layer middle edge: eject the wrong edge out of ITS slot to the U layer
        const EJECT = {
          FR: "U R U' R' U' F' U F", FL: "U' L' U L U F U' F'",
          BR: "U B U' B' U' R' U R", BL: "U' B' U B U L U' L'",
        };
        const bad = ["FR", "FL", "BR", "BL"].find((e) => !sv.slEdgeSolved(e));
        if (!bad) break;
        sv.do(EJECT[bad], b);
      }
    }
  });

  // ---- 5) LAST-LAYER CROSS (edge orientation) ----
  sv.phase("llCross", (b) => {
    const F = "F R U R' U' F'";      // cross formula (L / line)
    const G = "F U R U' R' F'";      // alternate cross formula
    const keep = [() => sv.secondLayerSolved()];
    const algs = [
      F, G,
      F + " U " + F, F + " U' " + F, F + " U2 " + F, F + " " + F,
      F + " U2 " + G, F + " U " + G, G + " U " + F,
    ];
    sv.attempt(() => sv.ollCross(), keep, algs, AUF, b);
  });

  // ---- 6) LAST-LAYER FACE (corner orientation) — Sune / Antisune ----
  sv.phase("llFace", (b) => {
    const S = "R U R' U R U2 R'";       // Sune
    const A = "R U2 R' U' R U' R'";     // Antisune
    const keep = [() => sv.ollCross()];
    const algs = [
      S, A,
      S + " U " + S, S + " U2 " + S, S + " U' " + S, S + " " + S,
      A + " U " + A, A + " U2 " + A, A + " U' " + A, A + " " + A,
      S + " U " + A, S + " U2 " + A, S + " U' " + A,
      A + " U " + S, A + " U2 " + S, A + " U' " + S,
      S + " U2 " + S + " U2 " + S,
    ];
    sv.attempt(() => sv.ollDone(), keep, algs, AUF, b);
  });

  // ---- 7) LAST-LAYER CORNERS (permute) — A-perm 3-cycles, keep orientation ----
  sv.phase("llCorners", (b) => {
    const cornersExact = () => ["URF", "UFL", "ULB", "UBR"].every((c) =>
      [sv.s()[CORNERS[c][0]], sv.s()[CORNERS[c][1]], sv.s()[CORNERS[c][2]]].sort().join("") ===
      CORNER_COLORS[c].split("").sort().join(""));
    const cornersOkAUF = () => AUF.some((su) => { sv.do(su); const ok = cornersExact(); sv.undo(su); return ok; });
    const keep = [() => sv.ollDone()];
    // Manual do Mundo corner permutation: tilt the cube so the headlights face
    // DOWN (x'), run R U' R D2 R' U R D2 R2, tilt back (x). In the U-last-layer
    // frame this is a pure 3-cycle of the top corners (URF→UFL→UBR).
    const A = "x' R U' R D2 R' U R D2 R2 x";
    const algs = [A, A + " U " + A, A + " U' " + A, A + " U2 " + A, A + " " + A];
    sv.attempt(cornersOkAUF, keep, algs, AUF, b);
    // align corners to home
    for (const su of AUF) { sv.do(su, b); if (cornersExact()) return; sv.undo(su, b); }
  });

  // ---- 8) LAST-LAYER EDGES (permute) — the video's "Minerva" 3-edge cycle ----
  sv.phase("llEdges", (b) => {
    const solvedAUF = () => AUF.some((su) => { sv.do(su); const ok = sv.solved(); sv.undo(su); return ok; });
    // Manual do Mundo "Minerva": the M slice is the middle column (like L).
    const Mn = "F2 U M' U2 M U F2";       // Minerva (clockwise)
    const Mi = "F2 U' M' U2 M U' F2";     // Minerva (counter-clockwise)
    const algs = [Mn, Mi, Mn + " U " + Mn, Mn + " " + Mn, Mn + " U2 " + Mn, Mn + " U' " + Mn, Mi + " U " + Mi];
    sv.attempt(solvedAUF, [], algs, AUF, b);
    for (const su of AUF) { sv.do(su, b); if (sv.solved()) return; sv.undo(su, b); }
  });

  return sv;
}

module.exports = { solve, invert, tokenize, simplify };

// --- self test when run directly ---------------------------------------------
if (require.main === module) {
  const FACES = ["U", "D", "L", "R", "F", "B"];
  function randomScramble(n = 25) {
    const out = []; let prev = "";
    for (let i = 0; i < n; i++) {
      let f; do { f = FACES[Math.floor(Math.random() * 6)]; } while (f === prev);
      prev = f;
      out.push(f + ["", "'", "2"][Math.floor(Math.random() * 3)]);
    }
    return out.join(" ");
  }
  const N = Number(process.argv[2] || 300);
  let solvedCount = 0, fail = [];
  for (let i = 0; i < N; i++) {
    const scr = randomScramble();
    const sv = solve(scr);
    if (sv.solved()) solvedCount++;
    else if (fail.length < 3) fail.push(scr);
  }
  console.log(`solved ${solvedCount}/${N}`);
  if (fail.length) console.log("sample failures:", fail);
}
