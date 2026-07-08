/**
 * public/js/solver.js — browser port of solver.js (same beginner layer-method
 * solver, no changes to the algorithm). Runs client-side so every page load
 * gets its own fresh random scramble. Depends on the global `Cube` from
 * vendor/cubejs.js (loaded before this script).
 *
 * Facelet string (cubejs) order: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53)
 * Per face:  0 1 2 / 3 4 5 / 6 7 8
 */

// --- Piece tables ------------------------------------------------------------
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

const PETALS = { UF: [7, 19], UR: [5, 10], UB: [1, 46], UL: [3, 37] };
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
    this.moves = [];
    this.phases = [];
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
    return (
      this.flCornerSolvedTop("URF") && this.flCornerSolvedTop("UFL") &&
      this.flCornerSolvedTop("ULB") && this.flCornerSolvedTop("UBR")
    );
  }
  flCornerSolvedTop(name) {
    const st = this.s(); const [a, b, c] = CORNERS[name]; const cols = CORNER_COLORS[name];
    return [st[a], st[b], st[c]].sort().join("") === cols.split("").sort().join("") &&
      st[a] === "U";
  }
  solved() { return this.cube.isSolved(); }

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

  // A phase is one pedagogical step. Inside it, `seg(label, fn)` groups the
  // moves that fix ONE piece, so the UI can announce which piece is next.
  // label = { cols:"FR" } (an edge/corner named by its colours) or { note:"…" }.
  phase(name, fn) {
    const bucket = [];
    const segments = [];
    const seg = (label, sfn) => {
      const from = bucket.length;
      sfn();
      if (bucket.length > from) segments.push({ label, from, to: bucket.length });
    };
    fn(bucket, seg);
    this.phases.push({ name, moves: bucket.slice(), segments });
  }
}

const AUF = ["", "U", "U2", "U'"];
const ALL_SETUPS = [];
for (const u of ["", "U", "U2", "U'"]) for (const d of ["", "D", "D2", "D'"]) ALL_SETUPS.push((u + " " + d).trim());

const LIFT_ALGS = [
  "F2", "B2", "R2", "L2",
  "F", "F'", "B", "B'", "R", "R'", "L", "L'",
  "F U' F'", "F' U F", "R U' R'", "R' U R", "B U' B'", "B' U B", "L U' L'", "L' U L",
  "F U F'", "R U R'", "B U B'", "L U L'",
  "F' U' F", "R' U' R", "B' U' B", "L' U' L",
];
const CORNER_INSERTS = (() => {
  const out = [
    "R U R'", "R U' R'", "R U2 R'", "F' U' F", "F' U F", "F' U2 F",
    "L' U' L", "L' U L", "L' U2 L", "F U F'", "F U' F'", "F U2 F'",
    "R' U' R", "R' U R", "L U L'", "L U' L'", "B U B'", "B U' B'", "B' U' B", "B' U B",
  ];
  const sexy = ["R U R' U'", "L' U' L U", "F U F' U'", "B' U' B U", "R' U' R U", "B U B' U'"];
  for (const sx of sexy) {
    let s = sx;
    for (let k = 1; k <= 5; k++) { out.push(s.trim()); s += " " + sx; }
  }
  return out;
})();
const CORNER_POP = { DFR: "R U R'", DLF: "L' U' L", DRB: "R' U' R", DBL: "L U L'" };
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

  sv.phase("daisy", (b, seg) => {
    let guard = 0;
    while (sv.petalCount() < 4 && guard++ < 8) {
      const before = sv.petalCount();
      let advanced = false;
      seg({ note: "Bring a white edge up to the daisy" }, () => {
        const seq = sv.search(() => sv.petalCount() > before, 4);
        if (seq && seq.length) { sv.do(seq.join(" "), b); advanced = true; }
      });
      if (!advanced) break;
    }
  });

  sv.phase("cross", (b, seg) => {
    for (const side of ["F", "R", "B", "L"]) {
      if (sv.crossEdgeSolved(side)) continue;
      // The cross edge for this side is white (D) + the side's own colour.
      seg({ cols: "D" + side }, () => {
        const keeps = ["F", "R", "B", "L"]
          .filter((s2) => sv.crossEdgeSolved(s2))
          .map((s2) => () => sv.crossEdgeSolved(s2));
        const goal = () => sv.crossEdgeSolved(side);
        sv.attempt(goal, keeps, [side + "2"], AUF, b) ||
          sv.attempt(goal, keeps, LIFT_ALGS.concat([side + "2"]), ALL_SETUPS, b);
      });
    }
  });

  sv.phase("firstLayer", (b, seg) => {
    const CSLOTS = ["DFR", "DRB", "DBL", "DLF"];
    const hasWhite = (slot) => { const [a, bb, c] = CORNERS[slot]; const s = sv.s(); return s[a] === "D" || s[bb] === "D" || s[c] === "D"; };
    let guard = 0;
    while (!sv.firstLayerSolved() && guard++ < 30) {
      const uCorner = ["URF", "UFL", "ULB", "UBR"].find(hasWhite);
      if (uCorner) {
        const [a, bb, c] = CORNERS[uCorner]; const s = sv.s();
        const cols = [s[a], s[bb], s[c]].sort().join("");
        const home = CSLOTS.find((sl) => CORNER_COLORS[sl].split("").sort().join("") === cols);
        const keeps = CSLOTS.filter((cc) => cc !== home && sv.flCornerSolved(cc)).map((cc) => () => sv.flCornerSolved(cc))
          .concat(["F", "R", "B", "L"].map((s2) => () => sv.crossEdgeSolved(s2)));
        const goal = () => sv.flCornerSolved(home);
        seg(home ? { cols: CORNER_COLORS[home] } : { note: "Place a white corner" }, () => {
          const ok = sv.attempt(goal, keeps, CORNER_INSERTS, AUF, b);
          if (!ok) sv.do("U", b);
        });
      } else {
        const bad = CSLOTS.find((sl) => hasWhite(sl) && !sv.flCornerSolved(sl));
        if (!bad) break;
        seg({ note: "Free a stuck white corner" }, () => sv.do(CORNER_POP[bad], b));
      }
    }
  });

  sv.phase("secondLayer", (b, seg) => {
    // Pedagogical middle layer, exactly like the beginner video: take a top
    // edge that has no top/bottom colour, turn U until its front sticker meets
    // its centre, then insert it to the right or left with the video's algs.
    // Front face F below means "whichever face the edge is aligned with".
    const RIGHT = {
      F: "U R U' R' U' F' U F", R: "U B U' B' U' R' U R",
      B: "U L U' L' U' B' U B", L: "U F U' F' U' L' U L",
    };
    const LEFT = {
      F: "U' L' U L U F U' F'", R: "U' F' U F U R U' R'",
      B: "U' R' U R U B U' B'", L: "U' B' U B U L U' L'",
    };
    const RIGHT_OF = { F: "R", R: "B", B: "L", L: "F" };
    const US = ["UF", "UR", "UB", "UL"];
    const FACE_OF = { UF: "F", UR: "R", UB: "B", UL: "L" };
    // A top edge belongs in the middle when neither sticker is top (U) or bottom (D).
    const insertable = (sl) => {
      const [a, bb] = EDGES[sl]; const s = sv.s();
      return s[a] !== "U" && s[a] !== "D" && s[bb] !== "U" && s[bb] !== "D";
    };

    let guard = 0;
    while (!sv.secondLayerSolved() && guard++ < 30) {
      const start = US.find(insertable);
      if (start) {
        // Track this edge by its colour pair while we turn U to align it.
        const s0 = sv.s();
        const pair = [s0[EDGES[start][0]], s0[EDGES[start][1]]].sort().join("");
        seg({ cols: pair }, () => {
          const frontColor = s0[EDGES[start][1]]; // side sticker → the centre it must meet
          let slot = start, turns = 0;
          while (FACE_OF[slot] !== frontColor && turns++ < 4) {
            sv.do("U", b);
            slot = US.find((sl) => {
              const s = sv.s();
              return [s[EDGES[sl][0]], s[EDGES[sl][1]]].sort().join("") === pair;
            });
          }
          const front = FACE_OF[slot];
          const topColor = sv.s()[EDGES[slot][0]]; // U-face sticker decides the side
          sv.do(topColor === RIGHT_OF[front] ? RIGHT[front] : LEFT[front], b);
        });
      } else {
        // No insertable edge on top → one is stuck wrong in the middle. Run the
        // front-right insert on its slot to kick it up, then the loop re-aligns it.
        const EJECT = {
          FR: "U R U' R' U' F' U F", FL: "U' L' U L U F U' F'",
          BR: "U B U' B' U' R' U R", BL: "U' B' U B U L U' L'",
        };
        const bad = ["FR", "FL", "BR", "BL"].find((e) => !sv.slEdgeSolved(e));
        if (!bad) break;
        seg({ note: "Clear a wrongly-placed edge" }, () => sv.do(EJECT[bad], b));
      }
    }
  });

  sv.phase("llCross", (b) => {
    const F = "F R U R' U' F'";
    const G = "F U R U' R' F'";
    const keep = [() => sv.secondLayerSolved()];
    const algs = [
      F, G,
      F + " U " + F, F + " U' " + F, F + " U2 " + F, F + " " + F,
      F + " U2 " + G, F + " U " + G, G + " U " + F,
    ];
    sv.attempt(() => sv.ollCross(), keep, algs, AUF, b);
  });

  sv.phase("llFace", (b) => {
    const S = "R U R' U R U2 R'";
    const A = "R U2 R' U' R U' R'";
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

  sv.phase("llCorners", (b) => {
    const cornersExact = () => ["URF", "UFL", "ULB", "UBR"].every((c) =>
      [sv.s()[CORNERS[c][0]], sv.s()[CORNERS[c][1]], sv.s()[CORNERS[c][2]]].sort().join("") ===
      CORNER_COLORS[c].split("").sort().join(""));
    const cornersOkAUF = () => AUF.some((su) => { sv.do(su); const ok = cornersExact(); sv.undo(su); return ok; });
    const keep = [() => sv.ollDone()];
    const Aa = "R' F R' B2 R F' R' B2 R2";
    const Ab = "R B' R F2 R' B R F2 R2";
    const algs = [Aa, Ab, Aa + " U " + Aa, Aa + " U' " + Aa, Aa + " U2 " + Aa, Aa + " " + Aa];
    sv.attempt(cornersOkAUF, keep, algs, AUF, b);
    for (const su of AUF) { sv.do(su, b); if (cornersExact()) return; sv.undo(su, b); }
  });

  sv.phase("llEdges", (b) => {
    const solvedAUF = () => AUF.some((su) => { sv.do(su); const ok = sv.solved(); sv.undo(su); return ok; });
    const M = "F2 U R' L F2 R L' U F2";
    const Mi = "F2 U' R' L F2 R L' U' F2";
    const algs = [M, Mi, M + " U " + M, M + " " + M, M + " U2 " + M, M + " U' " + M, Mi + " U " + Mi];
    sv.attempt(solvedAUF, [], algs, AUF, b);
    for (const su of AUF) { sv.do(su, b); if (sv.solved()) return; sv.undo(su, b); }
  });

  return sv;
}

window.CubeSolver = { solve, invert, tokenize, simplify };
