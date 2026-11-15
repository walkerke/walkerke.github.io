// Day 15 (Inside out): click a well, and the ground under it opens as a block of rock with the well running through it.
// The map is mapgl; this module is the 3D block (three.js). Data: web/wells.json, web/detail-N.json, web/surfaces.json,
// web/paths.json.
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";

const FT = 0.3048, CHUNK = 1000, G = 22;            // G: samples per block edge
const YOUNGER = { name: "Younger rock", color: "#cdbfa6" };
const fmt = (x) => Math.round(x).toLocaleString("en-US");
const el = (id) => document.getElementById(id);
const narrow = () => window.matchMedia("(max-width: 820px)").matches;
let map, W, S, P = {}, col, details = {}, view = null, current = -1;

// ---- data ----------------------------------------------------------------------------------------------------------
async function load() {
  const [w, s, p] = await Promise.all(["wells", "surfaces", "paths"].map((f) => fetch(`web/${f}.json`).then((r) => r.json())));
  W = w; S = s; P = p; col = Object.fromEntries(w.cols.map((c, i) => [c, i]));
}
async function detail(i) {
  const c = Math.floor(i / CHUNK);
  if (!details[c]) details[c] = fetch(`web/detail-${c}.json`).then((r) => r.json());
  return (await details[c])[W.rows[i][col.api]];
}
// depth (ft) of a unit's top at a point, from the county grid; null where the model has no support
function surfaceAt(u, lon, lat) {
  const [x0, x1, y0, y1] = S.bbox, fx = ((lon - x0) / (x1 - x0)) * (S.nx - 1), fy = ((lat - y0) / (y1 - y0)) * (S.ny - 1);
  if (fx < 0 || fy < 0 || fx > S.nx - 1 || fy > S.ny - 1) return null;
  const ix = Math.min(S.nx - 2, Math.floor(fx)), iy = Math.min(S.ny - 2, Math.floor(fy)), tx = fx - ix, ty = fy - iy, z = S.units[u].z;
  const a = z[iy * S.nx + ix], b = z[iy * S.nx + ix + 1], c = z[(iy + 1) * S.nx + ix], d = z[(iy + 1) * S.nx + ix + 1];
  if (a == null || b == null || c == null || d == null) return null;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

// ---- the path of a well, from its surface hole (x east, y up, z south; metres) ----------------------------------------
// A well with a directional survey on file follows the survey from station to station. Without one, a vertical well
// goes straight down, and a horizontal well goes down, turns through a quarter circle and runs level to the permitted
// bottom hole: a sketch from three numbers. md is the measured depth (metres along the hole) at each point.
function wellPath(i, mx, my) {
  const row = W.rows[i], sv = P[i], pts = [], md = [];
  if (sv) {
    for (let k = 0; k < sv.p.length; k += 4) { md.push(sv.p[k] * FT); pts.push(new THREE.Vector3(sv.p[k + 2] * FT, -sv.p[k + 1] * FT, -sv.p[k + 3] * FT)); }
    return { pts, md, sv: sv.m };
  }
  const td = (row[col.td] || 0) * FT;
  pts.push(new THREE.Vector3(0, 0, 0));
  if (!row[col.h]) pts.push(new THREE.Vector3(0, -Math.max(td, 30), 0));
  else {
    const bx = (row[col.blon] - row[col.lon]) * mx, bz = -(row[col.blat] - row[col.lat]) * my, L = Math.hypot(bx, bz);
    const tvd = td > 300 ? td : 2600, R = Math.min(175, L * 0.5, tvd * 0.5), ux = bx / L, uz = bz / L;
    pts.push(new THREE.Vector3(0, -(tvd - R), 0));
    for (let k = 1; k <= 10; k++) { const a = (k / 10) * Math.PI / 2, h = R * (1 - Math.cos(a)); pts.push(new THREE.Vector3(ux * h, -(tvd - R) - R * Math.sin(a), uz * h)); }
    pts.push(new THREE.Vector3(bx, -tvd, bz));
  }
  md.push(0); for (let k = 1; k < pts.length; k++) md.push(md[k - 1] + pts[k].distanceTo(pts[k - 1]));
  return { pts, md, sv: null };
}
const shift = (path, x, z) => { path.pts.forEach((v) => { v.x += x; v.z += z; }); return path; };
// point at a measured depth (metres along the hole)
function alongPath(path, m) {
  const { pts, md } = path;
  for (let i = 1; i < pts.length; i++) if (md[i] >= m) return pts[i - 1].clone().lerp(pts[i], md[i] > md[i - 1] ? Math.max(0, (m - md[i - 1]) / (md[i] - md[i - 1])) : 0);
  return pts[pts.length - 1].clone();
}
// measured depth (metres) at which the path first reaches a depth below the surface; null if it never gets that deep
function mdAtDepth(path, dep) {
  const { pts, md } = path;
  for (let i = 1; i < pts.length; i++) { const a = -pts[i - 1].y, b = -pts[i].y; if (b >= dep && b > a) return md[i - 1] + ((dep - a) / (b - a)) * (md[i] - md[i - 1]); }
  return null;
}
// which way the hole is heading at a measured depth
function heading(path, m) { const v = alongPath(path, m + 3).sub(alongPath(path, Math.max(0, m - 3))); return v.lengthSq() > 1e-9 ? v.normalize() : new THREE.Vector3(0, -1, 0); }
function subPath(path, m0, m1, n) { const out = []; for (let k = 0; k <= n; k++) out.push(alongPath(path, m0 + ((m1 - m0) * k) / n)); return out; }
function tube(pts, r, color, opacity) {
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.02);
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 10, false), m);
}

let disc = null;
function discTexture() {                                   // a round dot for the wells marked on the map slice
  if (disc) return disc;
  const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
  return (disc = new THREE.CanvasTexture(c));
}

// ---- build the block --------------------------------------------------------------------------------------------------
function buildBlock(i, d) {
  const row = W.rows[i], lat = row[col.lat], mx = 111320 * Math.cos((lat * Math.PI) / 180), my = 110574;
  // the block is centred on the ground the well covers and sized to hold it
  const path = wellPath(i, mx, my), px = path.pts.map((v) => v.x), pz = path.pts.map((v) => v.z);
  const cx = (Math.min(...px) + Math.max(...px)) / 2, cz = (Math.min(...pz) + Math.max(...pz)) / 2;
  const span = Math.max(Math.max(...px) - Math.min(...px), Math.max(...pz) - Math.min(...pz));
  const side = Math.min(9000, Math.max(3200, span > 150 ? span * 1.2 + 900 : 0)), h = side / 2;
  const lon0 = row[col.lon] + cx / mx, lat0 = lat - cz / my;
  shift(path, -cx, -cz);
  // deep enough for the hole and for the tops placed by vertical depth
  const holeDepth = Math.max(...path.pts.map((v) => -v.y));
  const deepestTop = Math.max(0, ...d.tops.filter((t) => t[3] && (!path.sv || t[1] * FT <= holeDepth + 15)).map((t) => t[1] * FT));
  let depth = Math.max(holeDepth, deepestTop) * 1.08 + 180; depth = Math.max(depth, 900);

  // sample each unit's top on a G x G grid over the block. A sample is null where the county model has no support
  // there, and stays null: nothing is filled in and nothing is moved.
  const xs = Array.from({ length: G + 1 }, (_, k) => -h + (side * k) / G);
  const shown = [];
  S.units.forEach((u, ui) => {
    const z = []; let shallow = Infinity;
    for (let j = 0; j <= G; j++) for (let k = 0; k <= G; k++) { const v = surfaceAt(ui, lon0 + xs[k] / mx, lat0 - xs[j] / my); z.push(v == null ? null : v * FT); if (v != null) shallow = Math.min(shallow, v * FT); }
    if (shallow < depth - 40) shown.push({ ui, name: u.name, color: u.color, z });
  });
  const at = (u, j, k) => { const v = u.z[j * (G + 1) + k]; return v == null ? null : Math.min(v, depth); };
  // the next modeled top down at this sample, or the bottom of the block
  const below = (a, j, k, none = depth) => { for (let b = a + 1; b < shown.length; b++) { const v = at(shown[b], j, k); if (v != null) return v; } return none; };
  // bands: each runs from one modeled top down to the next modeled top at that spot. Where a unit has no support its
  // band closes to nothing and the band above runs through. Where no unit is modeled at all, nothing is drawn.
  const bands = [{ ...YOUNGER, top: () => 0, bot: (j, k) => below(-1, j, k, 0) }];
  shown.forEach((u, a) => bands.push({ name: u.name, color: u.color, top: (j, k) => at(u, j, k) ?? below(a, j, k), bot: (j, k) => below(a, j, k) }));

  const group = new THREE.Group(), walls = [];
  // walls: one strip per side and band. Only the sides facing away from the camera are drawn, so the block reads as a cutaway.
  const sides = [
    { n: new THREE.Vector3(0, 0, 1), p: (t) => [-h + side * t, h], jk: (s) => [G, s], shade: 1 },        // south
    { n: new THREE.Vector3(0, 0, -1), p: (t) => [h - side * t, -h], jk: (s) => [0, G - s], shade: 1 },    // north
    { n: new THREE.Vector3(1, 0, 0), p: (t) => [h, h - side * t], jk: (s) => [G - s, G], shade: 0.82 },   // east
    { n: new THREE.Vector3(-1, 0, 0), p: (t) => [-h, -h + side * t], jk: (s) => [s, 0], shade: 0.82 },    // west
  ];
  sides.forEach((sd) => {
    const g = new THREE.Group(); g.userData.n = sd.n;
    g.userData.samples = Array.from({ length: G + 1 }, (_, s) => { const [x, z] = sd.p(s / G), [j, k] = sd.jk(s); return { x, z, j, k }; });
    bands.forEach((b) => {
      const pos = [], idx = [];
      for (let s = 0; s <= G; s++) { const [x, z] = sd.p(s / G), [j, k] = sd.jk(s); pos.push(x, -b.top(j, k), z, x, -b.bot(j, k), z); }
      for (let s = 0; s < G; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      const c = new THREE.Color(b.color).multiplyScalar(sd.shade);
      g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })));
    });
    walls.push(g); group.add(g);
  });
  // the top of each unit as a sheet through the block
  shown.forEach((u) => {
    const pos = [], idx = [];
    for (let j = 0; j <= G; j++) for (let k = 0; k <= G; k++) pos.push(xs[k], -(at(u, j, k) ?? 0), xs[j]);
    for (let j = 0; j < G; j++) for (let k = 0; k < G; k++) {            // cells with an unsupported corner are left open
      if ([at(u, j, k), at(u, j, k + 1), at(u, j + 1, k), at(u, j + 1, k + 1)].some((v) => v == null)) continue;
      const a = j * (G + 1) + k; idx.push(a, a + G + 1, a + 1, a + 1, a + G + 1, a + G + 2);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: u.color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })));
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(side, side), new THREE.MeshBasicMaterial({ color: "#0e1418", side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -depth; group.add(floor);

  // the land surface: satellite imagery of the block, lifted like a lid
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(side, side), new THREE.MeshBasicMaterial({ color: "#3b4a3a", side: THREE.DoubleSide }));
  lid.rotation.x = -Math.PI / 2;
  const hinge = new THREE.Group(); hinge.add(lid); group.add(hinge);
  const box = [lon0 - h / mx, lat0 - h / my, lon0 + h / mx, lat0 + h / my].map((v) => v.toFixed(6)).join(",");
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${box}]/1024x1024@2x?access_token=${mapboxgl.accessToken}&attribution=false&logo=false`;
  new THREE.TextureLoader().setCrossOrigin("anonymous").load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; lid.material.map = t; lid.material.color.set("#ffffff"); lid.material.needsUpdate = true; }, undefined, () => {});
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(side, depth, side)), new THREE.LineBasicMaterial({ color: "#e5e9ec", transparent: true, opacity: 0.35 }));
  edge.position.y = -depth / 2; group.add(edge);

  // other wells in the block, as thin lines
  let others = 0; const picks = [], dots = [];
  const lineMat = new THREE.LineBasicMaterial({ color: "#dbe4ea", transparent: true, opacity: 0.4 });
  const inside = (x, z) => Math.abs(x) <= h && Math.abs(z) <= h;
  // the stretch of the segment a-b that lies in the block, as the two fractions along it, or null if none does
  const lo = [-h, -depth, -h], hi = [h, 1, h];
  const clip = (a, b) => { let t0 = 0, t1 = 1; const s = [a.x, a.y, a.z], e = [b.x, b.y, b.z];
    for (let n = 0; n < 3; n++) { const dn = e[n] - s[n];
      if (Math.abs(dn) < 1e-9) { if (s[n] < lo[n] || s[n] > hi[n]) return null; continue; }
      const ta = (lo[n] - s[n]) / dn, tb = (hi[n] - s[n]) / dn; t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
      if (t0 >= t1) return null; }
    return [t0, t1]; };
  W.rows.forEach((r, k) => {
    if (k === i) return;
    const x = (r[col.lon] - lon0) * mx, z = -(r[col.lat] - lat0) * my;
    if (Math.abs(x) > h + 7000 || Math.abs(z) > h + 7000) return;
    let run = [], drawn = false;                        // each stretch of the path that lies inside the block
    const flush = () => { if (run.length > 1) { const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), lineMat); ln.userData.i = k; picks.push(ln); group.add(ln); drawn = true; } run = []; };
    const pts = shift(wellPath(k, mx, my), x, z).pts;
    for (let q = 1; q < pts.length; q++) {              // a path is cut where it leaves the block, through a side or the floor; no point is moved
      const c = clip(pts[q - 1], pts[q]);
      if (!c) { flush(); continue; }
      if (c[0] > 0 || !run.length) { flush(); run.push(pts[q - 1].clone().lerp(pts[q], c[0])); }
      run.push(pts[q - 1].clone().lerp(pts[q], c[1]));
      if (c[1] < 1) flush();
    }
    flush(); if (drawn) others++;
    if (inside(x, z)) dots.push(new THREE.Vector3(x, 0, z));
  });

  // the well itself, its perforations and the tops reported on it
  const r = side * 0.0045, len = path.md[path.md.length - 1];
  // The same wells on the map slice above the block: every well in the block as a dot where it starts, and this
  // well in the map's highlight colour with its path and the point where it ends. The lid is a plane lying in its
  // own x-y, so a point at (x, z) on the ground is (x, -z) on it.
  const up = side * 0.0015, onLid = (v, lift = up) => new THREE.Vector3(v.x, -v.z, lift);
  if (dots.length) lid.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(dots.map((v) => onLid(v))),
    new THREE.PointsMaterial({ color: "#f1f5f9", size: 5, sizeAttenuation: false, map: discTexture(), alphaTest: 0.5, transparent: true })));
  const HI = "#fbbf24", flat = path.pts.map((v) => onLid(v, up * 2)), end = flat[flat.length - 1];
  if (flat[0].distanceTo(end) > side * 0.01) {
    lid.add(tube(flat, r * 0.9, HI, 1));
    const toe = new THREE.Mesh(new THREE.RingGeometry(r * 1.6, r * 3, 28), new THREE.MeshBasicMaterial({ color: HI, side: THREE.DoubleSide })); toe.position.copy(end); toe.position.z = up * 3; lid.add(toe);
  }
  const spot = new THREE.Mesh(new THREE.CircleGeometry(r * 3, 28), new THREE.MeshBasicMaterial({ color: HI, side: THREE.DoubleSide })); spot.position.copy(flat[0]); spot.position.z = up * 3; lid.add(spot);
  group.add(tube(path.pts, r, "#ffffff", 1));
  const head = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.4, r * 2.4, r * 3, 16), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  head.position.copy(path.pts[0]); head.position.y += r * 1.5; group.add(head);
  // Perforations are laid along the path by their depth on file, which on a surveyed well is the survey's own measured
  // depth. What runs past the end of the path as drawn is not drawn, and is counted so the panel can say so.
  const cut = { past: 0, whole: 0, lenFt: len / FT };
  d.perfs.forEach(([a, b]) => {
    cut.past = Math.max(cut.past, b - len / FT); if (a * FT >= len) cut.whole++;
    const m0 = Math.min(a * FT, len), m1 = Math.min(Math.max(b, a + 15) * FT, len);
    if (m1 - m0 < 1) return;
    group.add(tube(subPath(path, m0, m1, Math.max(2, Math.ceil((m1 - m0) / 40))), r * 1.9, "#ff5a36", 1));
  });
  // Reported tops. The record does not say whether a depth is vertical or along the hole; a ring goes where the path
  // reaches that depth below the surface. On a straight hole the two are the same. A top deeper than the hole ever
  // gets is not placed.
  const labels = [], unplaced = new Set();
  d.tops.forEach(([name, dep, u, placed], ti) => {
    if (!placed) { unplaced.add(ti); return; }
    let m = mdAtDepth(path, dep * FT), p = null, dir = new THREE.Vector3(0, -1, 0);
    if (m != null) { p = alongPath(path, m); dir = heading(path, m); }
    else if (!path.sv && !row[col.h]) p = new THREE.Vector3(path.pts[0].x, -dep * FT, path.pts[0].z);   // straight hole: below the end of the bore drawn
    if (!p) { unplaced.add(ti); return; }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 3, r * 0.7, 8, 28), new THREE.MeshBasicMaterial({ color: u == null ? "#e5e9ec" : S.units[u].color }));
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); ring.position.copy(p); group.add(ring);   // the ring sits around the hole
    labels.push({ kind: "top", pos: p.clone(), text: `${name} ${fmt(dep)} ft`, color: u == null ? "#e5e9ec" : S.units[u].color });
  });
  // Each modeled top is named where it meets the block's edge, and a depth scale runs down the opposite edge; both are
  // placed each frame on the edges farthest from the camera. The colored band under a top runs to the next modeled top.
  labels.push({ kind: "unit", band: bands[0], text: bands[0].name, color: bands[0].color });
  shown.forEach((u) => labels.push({ kind: "utop", unit: u, text: `${u.name} top`, color: u.color }));
  for (let f = 0; f * FT <= depth; f += depth / FT > 9000 ? 2000 : 1000) labels.push({ kind: "tick", depth: f * FT, text: f === 0 ? "Surface" : `${fmt(f)} ft` });
  return { group, walls, lid, hinge, labels, side, depth, h, others, shown, bands, lon0, lat0, picks, cut, unplaced, path };
}

// ---- the viewer --------------------------------------------------------------------------------------------------------
function setupView() {
  const host = el("scene"), renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setClearColor("#05080b");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 10, 200000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotateSpeed = 0.45; controls.addEventListener("start", () => (controls.autoRotate = false));
  const v = { renderer, scene, camera, controls, block: null, intro: null, labelEls: [], size: () => size() };
  // click one of the thin lines to move to that well
  const ray = new THREE.Raycaster(), down = new THREE.Vector2(); let moved = false;
  const hit = (ev) => { const r = renderer.domElement.getBoundingClientRect(); ray.params.Line.threshold = v.block.side * 0.006;
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObjects(v.block.picks, false); return h.length ? h[0].object : null; };
  renderer.domElement.addEventListener("pointerdown", (ev) => { down.set(ev.clientX, ev.clientY); moved = false; });
  renderer.domElement.addEventListener("pointermove", (ev) => { if (ev.buttons) { if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) moved = true; return; }
    renderer.domElement.style.cursor = v.block && !v.intro && hit(ev) ? "pointer" : "grab"; });
  renderer.domElement.addEventListener("pointerup", (ev) => { if (moved || !v.block || v.intro) return; const o = hit(ev); if (o) openWell(o.userData.i); });
  // on a narrow screen the card is a sheet along the bottom and the scene takes the space above it
  const size = () => { const pad = narrow() ? document.querySelector("#inside .card").offsetHeight + 16 : 0;
    host.style.bottom = el("labels").style.bottom = pad + "px"; el("credit").style.bottom = pad + 6 + "px";
    const w = host.clientWidth, h = Math.max(120, host.clientHeight); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (v.block && v.block.fit && !v.intro) {          // keep the block the same size in the scene when the scene changes shape
      const f = fitDist(v.block), k = f / v.block.fit; v.block.fit = f; controls.minDistance = f * 0.15; controls.maxDistance = f * 3;
      camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
    } };
  window.addEventListener("resize", size); size();
  const tmp = new THREE.Vector3();
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (!v.block || el("inside").classList.contains("off")) return;
    const b = v.block;
    if (v.intro) {            // open: start straight above the lid, swing down beside the block while the lid lifts
      const t = Math.min(1, (now - v.intro.t0) / v.intro.ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const pol = THREE.MathUtils.lerp(0.02, v.intro.polar, e), az = THREE.MathUtils.lerp(v.intro.az0, v.intro.az1, e), dist = THREE.MathUtils.lerp(v.intro.d0, v.intro.d1, e);
      controls.target.set(0, THREE.MathUtils.lerp(0, -b.depth * 0.45, e), 0);
      camera.position.set(controls.target.x + dist * Math.sin(pol) * Math.sin(az), controls.target.y + dist * Math.cos(pol), controls.target.z + dist * Math.sin(pol) * Math.cos(az));
      camera.lookAt(controls.target);
      openLid(b, v.intro.az1, e * 0.5);
      if (t >= 1) { v.intro = null; controls.update(); controls.autoRotate = true; }
    } else controls.update();
    // cutaway: hide the walls between the camera and the middle of the block
    b.walls.forEach((w) => { w.visible = tmp.copy(camera.position).sub(controls.target).dot(w.userData.n) < 0 || camera.position.y < -b.depth; });
    renderer.render(scene, camera);
    placeLabels(v);
  };
  requestAnimationFrame(frame);
  return v;
}
// The land surface swings up like a lid, hinged on the edge nearest the camera, so its imagery faces the viewer.
function openLid(b, az, angle) {
  const sx = Math.sin(az), sz = Math.cos(az), h = b.h;
  if (Math.abs(sz) >= Math.abs(sx)) { const s = Math.sign(sz) || 1; b.hinge.position.set(0, 0, s * h); b.lid.position.set(0, 0, -s * h); b.hinge.rotation.set(s * angle, 0, 0); }
  else { const s = Math.sign(sx); b.hinge.position.set(s * h, 0, 0); b.lid.position.set(-s * h, 0, 0); b.hinge.rotation.set(0, 0, -s * angle); }
}
function placeLabels(v) {
  const b = v.block, cam = v.camera, w = v.renderer.domElement.clientWidth, h = v.renderer.domElement.clientHeight, p = new THREE.Vector3();
  // unit names sit outside the block's left-hand edge as seen on screen, the depth scale outside its right-hand edge
  let left = null, right = null, lx = Infinity, rx = -Infinity;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c) => { const x = p.set(c[0] * b.h, -b.depth / 2, c[1] * b.h).project(cam).x; if (x < lx) { lx = x; left = c; } if (x > rx) { rx = x; right = c; } });
  // a name goes on the walls in view, at the leftmost spot on screen where its layer is modeled
  const q = new THREE.Vector3();
  const leftmost = (depthAt) => { let best = Infinity;
    b.walls.forEach((wl) => { if (!wl.visible) return; wl.userData.samples.forEach((sm) => { const dz = depthAt(sm); if (dz == null) return; const x = q.set(sm.x, -dz, sm.z).project(cam).x; if (x < best) { best = x; p.set(sm.x, -dz, sm.z); } }); });
    return best < Infinity; };
  const tops = [], names = [];
  b.labels.forEach((L, i) => {
    const e = v.labelEls[i]; let ok = true;
    if (L.kind === "top") p.copy(L.pos);
    else if (L.kind === "unit") ok = leftmost((sm) => { const t = L.band.top(sm.j, sm.k), bt = L.band.bot(sm.j, sm.k); return bt - t > b.depth * 0.02 ? (t + bt) / 2 : null; });
    else if (L.kind === "utop") ok = leftmost((sm) => { const z = L.unit.z[sm.j * (G + 1) + sm.k]; return z != null && z < b.depth ? z : null; });
    else p.set(right[0] * b.h, -L.depth, right[1] * b.h);
    p.project(cam);
    const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h, on = ok && p.z < 1 && x > -50 && x < w + 50 && y > 0 && y < h;
    e.style.display = on ? "" : "none";
    if (!on) return;
    if (L.kind === "top") tops.push({ e, x, y });
    else if (L.kind === "tick") { e.style.left = x + "px"; e.style.top = y + "px"; }
    else names.push({ e, x, y });
  });
  [[tops, 17], [names, 15]].forEach(([set, gap]) => {   // keep labels from stacking on each other
    set.sort((a, c) => a.y - c.y);
    for (let i = 1; i < set.length; i++) if (set[i].y - set[i - 1].y < gap) set[i].y = set[i - 1].y + gap;
    set.forEach((t) => { t.e.style.left = (set === names ? Math.max(t.x, t.e.offsetWidth + 12) : t.x) + "px"; t.e.style.top = t.y + "px"; });
  });
}

// camera distance: far enough that the block fits the scene's height and its width, with room at the sides for the
// layer names and the depth scale (which take a fixed number of pixels, so more of a narrow screen)
function fitDist(b) {
  const sw = view.renderer.domElement.clientWidth, asp = view.camera.aspect, room = Math.max(0.45, (sw - (narrow() ? 170 : 230)) / sw);
  return Math.max(b.side * 1.9 * 0.76, b.depth * 2.4 * 0.76, (b.side * 1.5) / (asp * room)) / (2 * Math.tan((view.camera.fov * Math.PI) / 360));
}
async function openWell(i) {
  if (!W) return;
  current = i;
  const row = W.rows[i], d = await detail(i);
  if (current !== i) return;
  if (!view) view = setupView();
  if (view.block) { view.scene.remove(view.block.group); view.block.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
  const b = buildBlock(i, d); view.block = b; view.scene.add(b.group);
  // labels
  const host = el("labels"); host.innerHTML = "";
  view.labelEls = b.labels.map((L) => { const e = document.createElement("div"); e.className = "lab " + L.kind; e.textContent = L.text; if (L.color && L.kind !== "tick") { const c = new THREE.Color(L.color), hsl = {}; c.getHSL(hsl); if (hsl.l < 0.5) c.setHSL(hsl.h, hsl.s, 0.62); e.style.setProperty("--c", "#" + c.getHexString()); } host.appendChild(e); return e; });
  panel(i, row, d, b); view.size();
  const asp = view.camera.aspect, dist = (b.fit = fitDist(b));
  view.controls.minDistance = dist * 0.15; view.controls.maxDistance = dist * 3;
  const a0 = b.path.pts[0], a1 = b.path.pts[b.path.pts.length - 1], run = Math.hypot(a1.x - a0.x, a1.z - a0.z);        // look across the hole, not along it
  const az0 = 0, az1 = run > 150 ? Math.atan2(a1.x - a0.x, a1.z - a0.z) + Math.PI / 2 + 0.35 : 0.6;
  view.controls.autoRotate = false;
  view.intro = { t0: performance.now() + 500, ms: 3600, polar: 1.36, az0, az1, d0: b.side / Math.min(1, asp) / (2 * Math.tan((view.camera.fov * Math.PI) / 360)) * 1.08, d1: dist };
  view.camera.position.set(0, view.intro.d0, 1); view.camera.lookAt(0, 0, 0);
  el("inside").classList.remove("off");
  // bring the map to the same spot, straight down, so the lid and the map agree when you go back
  map.easeTo({ center: [b.lon0, b.lat0], zoom: Math.log2((40075016.686 * Math.cos((b.lat0 * Math.PI) / 180)) / (512 * (b.side / Math.min(window.innerHeight, window.innerWidth) / 0.8))), pitch: 0, bearing: 0, duration: 600 });
  map.setFilter("picked", ["==", ["get", "i"], i]);
}
function closeWell() { el("inside").classList.add("off"); current = -1; }

function panel(i, row, d, b) {
  const status = W.status[row[col.status]], sv = b.path.sv, horiz = !!row[col.h];
  const level = horiz || (sv && sv.inc >= 80);         // permitted as horizontal, or surveyed to within 10 degrees of level
  const reach = horiz ? Math.hypot((row[col.blon] - row[col.lon]) * 111320 * Math.cos((row[col.lat] * Math.PI) / 180), (row[col.blat] - row[col.lat]) * 110574) / FT : 0;
  const r = (a, c) => `<tr><td>${a}</td><td>${c}</td></tr>`;
  const pmax = d.perfs.length ? Math.max(...d.perfs.map((p) => p[1])) : 0, td = row[col.td];
  el("w-name").textContent = d.name || "Well " + row[col.api];
  el("w-sub").textContent = [d.op, status + (level ? ", horizontal" : ""), d.field].filter(Boolean).join(" · ");
  // what a visitor wants to know about the well; how it was drawn is one plain sentence where it matters
  const first = d.perfs.length ? Math.min(...d.perfs.map((p) => p[0])) : 0, depth = sv ? sv.tvd : td;
  const side = sv ? (sv.reach >= 300 ? sv.reach : 0) : horiz ? reach : 0;
  el("w-stats").innerHTML =
    r("Path", sv ? "Directional survey" : "Sketch") +
    (sv && sv.carried ? r("Depth on file", fmt(td) + " ft") + r("Survey depth", fmt(sv.tvd) + " ft")
                      : r(sv ? "Depth" : "Depth on file", depth ? fmt(depth) + " ft" : "Not on file")) +
    (sv && sv.md - sv.tvd > 100 ? r("Length of the hole", fmt(sv.md) + " ft") : "") +
    (side ? r("Sideways reach", fmt(side) + " ft") : "") +
    r("Perforated", d.perfs.length ? `${fmt(first)} to ${fmt(pmax)} ft` : "None on file") +
    (d.first ? r("Production on file", d.first + (d.last && d.last !== d.first ? " to " + d.last : "")) : "");
  const notes = [], c = b.cut;
  if (sv) {
    if (sv.tie === "assumed" || sv.tie === "printed") notes.push(`The survey starts at ${fmt(sv.md0)} ft; the hole above is drawn straight.`);
    if (sv.carried) notes.push(`The survey ends at ${fmt(sv.md)} ft. Below that the hole is drawn straight down.`);
    if (sv.north) notes.push(`The survey does not say which north it uses, so the far end could sit about ${fmt(sv.ngap)} ft to one side.`);
    if (c.past > 1) notes.push(`Perforations extend ${fmt(c.past)} ft beyond the drawn path and are clipped there.`);
  }
  else if (row[col.dev]) notes.push(`Perforations run ${fmt(pmax - td)} ft deeper than this well\u2019s depth on file, so it probably turns sideways. No usable path is available here, so this well is drawn straight down.`);
  else if (!td && horiz) notes.push(`No depth is on file for this well. Its level section is drawn at an assumed ${fmt(2600 / FT)} ft.`);
  else if (!td) notes.push("With no depth on file, the vertical stem is a placeholder.");
  else if (c.past > 1 && horiz) notes.push(`This path is a sketch from the drilling permit. Perforations extend ${fmt(c.past)} ft beyond it and are clipped there.`);
  else if (c.past > 1) notes.push(`Perforations extend ${fmt(c.past)} ft below the depth on file and are clipped there.`);
  if (b.unplaced.size) notes.push(`${fmt(b.unplaced.size)} reported top${b.unplaced.size > 1 ? "s are" : " is"} deeper than the hole as drawn and ${b.unplaced.size > 1 ? "have" : "has"} no ring.`);
  el("w-note").textContent = notes.join(" "); el("w-note").style.display = notes.length ? "" : "none";
  const tag = (ti) => (b.unplaced.has(ti) ? " <span>not placed</span>" : "");
  el("w-tops").innerHTML = d.tops.length
    ? d.tops.map(([n, dep, u], ti) => `<tr${b.unplaced.has(ti) ? " class='off'" : ""}><td><i style="background:${u == null ? "#e5e9ec" : S.units[u].color}"></i>${n}${tag(ti)}</td><td>${fmt(dep)} ft</td></tr>`).join("")
    : "<tr><td colspan='2' class='none'>No formation tops on file for this well. The layers shown come from nearby wells.</td></tr>";
}

window.initInside = async function (m) {
  map = m;
  await load();
  map.on("click", "wells", (e) => openWell(e.features[0].properties.i));
  map.on("mouseenter", "wells", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "wells", () => (map.getCanvas().style.cursor = ""));
  el("back").addEventListener("click", closeWell);
  // on a narrow screen a card folds down to its title and buttons; the well card starts folded so the block is in view
  if (narrow()) document.querySelector("#inside .card").classList.add("folded");
  document.addEventListener("click", (e) => { const f = e.target.closest(".fold"); if (!f) return; f.closest(".card").classList.toggle("folded"); if (view) view.size(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWell(); });
  const good = window.DAY15.good, pick = () => openWell(good[Math.floor(Math.random() * good.length)]);
  el("random").addEventListener("click", pick); el("another").addEventListener("click", pick);
  const sv = window.DAY15.surveyed; el("random-sv").addEventListener("click", () => openWell(sv[Math.floor(Math.random() * sv.length)]));
  window.day15Open = openWell; window.day15Close = closeWell; window.day15View = () => view; window.day15THREE = THREE;
  document.body.classList.add("ready");
};
