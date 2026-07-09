/**
 * cube3d.js — real 3D Rubik's cube renderer (Three.js) with drag-to-orbit.
 *
 * Each of the 26 outer cubies is a fixed-position box mesh. Colors are set
 * purely from a cubejs facelet string (no cubie-identity/permutation
 * tracking): `setState(facelets)` recolors every sticker from scratch, so
 * jumping to any move index is always correct. `playMove(token)` adds a
 * temporary turning animation on top, purely visual — it always ends by
 * snapping back to the fixed grid and recoloring from the true state.
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const FACE_OFFSET = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const STICKER_HEX = {
  U: 0x9b1fc1, D: 0xfdfdfd, F: 0x1e5ac8, R: 0xd42a2a, L: 0xf08a24, B: 0x1f9e57,
};
const PLASTIC = 0x16181d;

// Given a face letter and a cubie's fixed grid coords, return the facelet
// string index for that cubie's sticker on that face (or -1 if the cubie
// doesn't touch that face at all). Derived from solver.js's own EDGES /
// CORNERS tables, so it matches the solver's facelet convention exactly.
function stickerIndex(face, x, y, z) {
  let onFace, r, c;
  switch (face) {
    case "U": onFace = y === 1; c = x + 1; r = z + 1; break;
    case "D": onFace = y === -1; c = x + 1; r = 1 - z; break;
    case "F": onFace = z === 1; c = x + 1; r = 1 - y; break;
    case "B": onFace = z === -1; c = 1 - x; r = 1 - y; break;
    case "R": onFace = x === 1; c = 1 - z; r = 1 - y; break;
    case "L": onFace = x === -1; c = z + 1; r = 1 - y; break;
  }
  return onFace ? FACE_OFFSET[face] + r * 3 + c : -1;
}

// x/y/z are whole-cube rotations (same direction as R/U/F respectively),
// used by a couple of the solver's setup sequences alongside face turns.
const AXIS = {
  U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0],
  x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1],
  // Slice moves turn the same visual direction as the face they follow:
  // M like L, E like D, S like F.
  M: [-1, 0, 0], E: [0, -1, 0], S: [0, 0, 1],
};
const LAYER = {
  U: (u) => u.y === 1, D: (u) => u.y === -1,
  F: (u) => u.z === 1, B: (u) => u.z === -1,
  R: (u) => u.x === 1, L: (u) => u.x === -1,
  x: () => true, y: () => true, z: () => true,
  M: (u) => u.x === 0, E: (u) => u.y === 0, S: (u) => u.z === 0,
};

const GAP = 1.03; // spacing between cubie centers
const ARROW_COLOR = 0xffd400;
const ARROW_OUTLINE = 0x000000;
const FACE_PLANE_OFFSET = 1.68; // hovers just outside the cube's outer surface

function faceCenter(face) {
  const [ax, ay, az] = AXIS[face];
  return new THREE.Vector3(ax, ay, az).multiplyScalar(FACE_PLANE_OFFSET);
}

// Points along a curved arrow on `face`'s plane, curling in the true turn
// direction (same axis + sign convention as playMove, so the arrow always
// matches the actual animation). Also returns the tangent at the tip, used
// to orient the arrowhead cone.
function arcGeometry(face, clockwise) {
  const axis = new THREE.Vector3(...AXIS[face]).normalize();
  const candidate = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const radial = candidate.clone().sub(axis.clone().multiplyScalar(candidate.dot(axis))).normalize();
  const sign = clockwise ? -1 : 1;
  const sweep = THREE.MathUtils.degToRad(110) * sign;
  const stopFrac = 0.82; // leave a gap at the end for the arrowhead
  const center = faceCenter(face);
  const R = 1.05;
  const samples = 24;
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const ang = sweep * stopFrac * (i / samples);
    const v = radial.clone().applyAxisAngle(axis, ang);
    pts.push(center.clone().addScaledVector(v, R));
  }
  const endRadial = radial.clone().applyAxisAngle(axis, sweep * stopFrac);
  const tangent = axis.clone().cross(endRadial).multiplyScalar(sign).normalize();
  const tip = center.clone().addScaledVector(endRadial, R);
  return { pts, tip, tangent };
}

// One tube + cone at the given radii/color/renderOrder. Drawing this once in
// black (fatter, behind) and once in yellow (thinner, in front) gives the
// arrow a solid black outline so it reads on any sticker colour.
//
// depthTest:true lets the opaque cube (drawn first, writes depth) occlude the
// arrow, so when the target face is rotated to the back the arrow disappears
// behind the cube instead of floating in front. depthWrite:false keeps the two
// arrow layers from occluding each other, so painter order (renderOrder) alone
// decides that yellow paints over black — the outline survives.
function arrowLayer(curve, tip, tangent, { color, tubeR, coneR, coneH, renderOrder }) {
  const layer = new THREE.Group();
  const mat = () => new THREE.MeshBasicMaterial({
    color, depthTest: true, depthWrite: false, transparent: true,
  });

  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, tubeR, 10, false), mat());
  tube.renderOrder = renderOrder;
  layer.add(tube);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 14), mat());
  cone.position.copy(tip).addScaledVector(tangent, 0.1);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  cone.renderOrder = renderOrder;
  layer.add(cone);

  return layer;
}

function buildArrowGroup(face, clockwise) {
  const { pts, tip, tangent } = arcGeometry(face, clockwise);
  const curve = new THREE.CatmullRomCurve3(pts);
  const group = new THREE.Group();

  // black outline underneath, then the yellow arrow on top
  group.add(arrowLayer(curve, tip, tangent,
    { color: ARROW_OUTLINE, tubeR: 0.072, coneR: 0.155, coneH: 0.32, renderOrder: 998 }));
  group.add(arrowLayer(curve, tip, tangent,
    { color: ARROW_COLOR, tubeR: 0.045, coneR: 0.11, coneH: 0.26, renderOrder: 999 }));

  return group;
}

// setTimeout-based tick instead of requestAnimationFrame: rAF is throttled to
// (near-)never on hidden/background tabs, which would silently freeze an
// in-flight move animation's Promise forever.
const tick = (fn) => setTimeout(fn, 16);

// Free a group's GPU resources (geometries + materials) before dropping it.
function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

export class RubiksCube3D {
  constructor(container, { interactive = true, cameraDistance = 10.5 } = {}) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.style.cursor = interactive ? "grab" : "default";

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.65);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-5, -3, -4);
    this.scene.add(fill);

    // Default orientation matches the tutorial framing: U (purple) on top,
    // F (blue) and R (red) both visible — the classic three-quarter hold.
    this.radius = cameraDistance;
    this.theta = Math.PI / 4;           // azimuth
    this.phi = Math.PI / 2 - 0.5;       // polar (from +Y)
    this._updateCamera();

    this.cubies = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
          const mats = [0, 1, 2, 3, 4, 5].map(
            () => new THREE.MeshStandardMaterial({ color: PLASTIC, roughness: 0.55, metalness: 0.05 })
          );
          const mesh = new THREE.Mesh(geo, mats);
          const pos = new THREE.Vector3(x * GAP, y * GAP, z * GAP);
          mesh.position.copy(pos);
          mesh.userData = { x, y, z, origPos: pos.clone() };
          this.scene.add(mesh);
          this.cubies.push(mesh);
        }
      }
    }

    this._renderScheduled = false;
    if (interactive) this._enableDrag();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
    this.requestRender();
  }

  _updateCamera() {
    const { radius, theta, phi } = this;
    this.camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(0, 0, 0);
  }

  _enableDrag() {
    const el = this.renderer.domElement;
    let dragging = false, lastX = 0, lastY = 0;
    el.addEventListener("pointerdown", (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this.theta -= dx * 0.008;
      this.phi = Math.min(Math.PI - 0.2, Math.max(0.2, this.phi - dy * 0.008));
      this._updateCamera();
      this.requestRender();
    });
    const stop = (e) => { dragging = false; el.style.cursor = "grab"; };
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
    el.addEventListener("pointerleave", stop);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.radius = Math.min(18, Math.max(7, this.radius + e.deltaY * 0.006));
      this._updateCamera();
      this.requestRender();
    }, { passive: false });
  }

  resize() {
    const w = this.container.clientWidth || 240;
    const h = this.container.clientHeight || w;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.requestRender();
  }

  // Render once. On-demand only — there is no perpetual loop, so an idle cube
  // costs nothing. Every mutator (setState, camera drag/zoom, arrow, resize)
  // asks for a frame via requestRender(); playMove drives its own frames.
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Coalesce many mutations in one tick into a single render.
  requestRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    this._raf = tick(() => { this._renderScheduled = false; this.render(); });
  }

  /** Recolor every sticker from a cubejs facelet string. No animation. */
  setState(facelets) {
    for (const cubie of this.cubies) {
      const { x, y, z } = cubie.userData;
      const mats = cubie.material;
      const sides = [["R", 0], ["L", 1], ["U", 2], ["D", 3], ["F", 4], ["B", 5]];
      for (const [face, slot] of sides) {
        const idx = stickerIndex(face, x, y, z);
        mats[slot].color.set(idx === -1 ? PLASTIC : STICKER_HEX[facelets[idx]]);
      }
    }
    this.requestRender();
  }

  /** Show a curved arrow on `token`'s face pointing in its true turn direction. */
  showMoveArrow(token) {
    this.clearMoveArrow();
    if (!token) return;
    const face = token[0], suffix = token.slice(1);
    if ("xyzMES".includes(face)) return; // whole-cube / slice: no single face to mark
    this._arrow = buildArrowGroup(face, suffix !== "'");
    this.scene.add(this._arrow);
    this.requestRender();
  }

  clearMoveArrow() {
    if (this._arrow) {
      this.scene.remove(this._arrow);
      disposeGroup(this._arrow); // free GPU geometry/materials — else it leaks per step
      this._arrow = null;
      this.requestRender();
    }
  }

  /** Animate one face turn (e.g. "R", "U'", "F2"), then snap + recolor to `nextFacelets`. */
  playMove(token, nextFacelets, duration = 380) {
    this.clearMoveArrow();
    return new Promise((resolve) => {
      const face = token[0], suffix = token.slice(1);
      const axis = new THREE.Vector3(...AXIS[face]);
      const test = LAYER[face];
      const affected = this.cubies.filter((c) => test(c.userData));

      const pivot = new THREE.Group();
      this.scene.add(pivot);
      for (const c of affected) pivot.attach(c);

      const clockwise = suffix !== "'"; // '2' and unprimed both start clockwise
      const target = (suffix === "2" ? Math.PI : Math.PI / 2) * (clockwise ? -1 : 1);
      const t0 = performance.now();

      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.quaternion.setFromAxisAngle(axis, target * eased);
        this.render(); // drive each animation frame directly
        if (t < 1) {
          tick(() => step(performance.now()));
        } else {
          for (const c of affected) {
            this.scene.attach(c);
            c.position.copy(c.userData.origPos);
            c.quaternion.identity();
          }
          this.scene.remove(pivot);
          this.setState(nextFacelets); // requestRender inside
          resolve();
        }
      };
      step(performance.now());
    });
  }

  /** Render the current scene into a small PNG data URL (for thumbnails). */
  snapshot(size = 100) {
    const w = this.renderer.domElement.width, h = this.renderer.domElement.height;
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    return url;
  }

  dispose() {
    this.clearMoveArrow();
    clearTimeout(this._raf);
    this._resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
