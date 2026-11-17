// Three.js viewer for the Stress and 3D views and the failure animation.
// Loaded on demand (dynamic import) the first time a 3D view is opened.
// The viewer renders a "model" built by models.js: parts made of boxes and cylinders
// in metres (x along the member, y up, z across), a stress field, a displacement
// function, crack lines and load arrows. Everything shown is illustrative and driven
// by the computed results; it is not a finite element analysis.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../../vendor/three/OrbitControls.js';

const LOOP = 10;               // seconds per animation loop
const T_REST = 0.6, T_LOAD = 6.6, T_BREAK = 9.0;
const BANDS = 10;

// Blue (low) to red (high), like the usual FEA contour scale.
const STOPS = [[0, [0.10, 0.20, 0.95]], [0.25, [0.05, 0.75, 0.95]], [0.5, [0.15, 0.85, 0.25]], [0.75, [0.98, 0.85, 0.10]], [1, [0.90, 0.10, 0.08]]];
export function rampColor(u) {
  u = Math.max(0, Math.min(1, u));
  for (let i = 1; i < STOPS.length; i++) {
    if (u <= STOPS[i][0]) {
      const [u0, c0] = STOPS[i - 1], [u1, c1] = STOPS[i];
      const k = (u - u0) / (u1 - u0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return STOPS[STOPS.length - 1][1];
}
export const bandColor = (i) => rampColor((i + 0.5) / BANDS);
const css = (c) => 'rgb(' + c.map((v) => Math.round(v * 255)).join(',') + ')';

function bandTexture() {
  const data = new Uint8Array(BANDS * 4);
  for (let i = 0; i < BANDS; i++) { const c = bandColor(i); data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], i * 4); }
  const t = new THREE.DataTexture(data, BANDS, 1, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const MAT = {
  concrete: { color: 0xb8b2a6, roughness: 0.95, metalness: 0 },
  steel: { color: 0x8592a0, roughness: 0.55, metalness: 0.35 },
  rebar: { color: 0xb5532a, roughness: 0.6, metalness: 0.2 },
  bolt: { color: 0x4a4f55, roughness: 0.5, metalness: 0.4 },
  weld: { color: 0x5b5e63, roughness: 0.7, metalness: 0.5 },
  soil: { color: 0x9a7a52, roughness: 1, metalness: 0 },
  soil2: { color: 0x7d6a4c, roughness: 1, metalness: 0 },
  support: { color: 0x5d6670, roughness: 0.8, metalness: 0.2 }
};

// ---- geometry
function boxGeom(g) {
  const [x0, y0, z0] = g.min, [x1, y1, z1] = g.max, s = g.seg || [1, 1, 1];
  const geo = new THREE.BoxGeometry(Math.max(x1 - x0, 1e-4), Math.max(y1 - y0, 1e-4), Math.max(z1 - z0, 1e-4), s[0], s[1], s[2]);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geo;
}
function cylGeom(g) {
  const a = new THREE.Vector3(...g.a), b = new THREE.Vector3(...g.b);
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(g.r, g.r2 != null ? g.r2 : g.r, Math.max(len, 1e-4), g.radial || 10, g.seg || 1);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  geo.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  geo.translate(mid.x, mid.y, mid.z);
  return geo;
}
function merge(geos) {
  let nv = 0, ni = 0;
  geos.forEach((g) => { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, ov * 3);
    if (g.index) { const s = g.index.array; for (let i = 0; i < s.length; i++) idx[oi + i] = s[i] + ov; oi += s.length; }
    else { const n = g.attributes.position.count; for (let i = 0; i < n; i++) idx[oi + i] = ov + i; oi += n; }
    ov += g.attributes.position.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function partGeom(part) {
  const geo = merge(part.geoms.map((g) => (g.type === 'cyl' ? cylGeom(g) : boxGeom(g))));
  if (part.warp) {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const w = part.warp(p[i], p[i + 1], p[i + 2]); p[i] = w[0]; p[i + 1] = w[1]; p[i + 2] = w[2]; }
  }
  geo.computeVertexNormals();
  return geo;
}

// ---- timeline: returns the load factor (fraction of the design load) and break progress
export function timeline(t, lamEnd, fails) {
  const tt = ((t % LOOP) + LOOP) % LOOP;
  if (tt < T_REST) return { lam: 0, brk: 0, phase: 'rest' };
  if (tt < T_LOAD) { const k = (tt - T_REST) / (T_LOAD - T_REST); return { lam: lamEnd * k, brk: 0, phase: 'load' }; }
  if (fails) {
    if (tt < T_BREAK) { const k = (tt - T_LOAD) / (T_BREAK - T_LOAD); return { lam: lamEnd, brk: k * k * (3 - 2 * k), phase: 'break' }; }
    return { lam: lamEnd, brk: 1, phase: 'broken' };
  }
  const k = Math.min(1, (tt - T_LOAD) / (LOOP - T_LOAD - 0.6));
  return { lam: lamEnd * (1 - k), brk: 0, phase: k < 0.05 ? 'peak' : 'unload' };
}

export function createViewer(host) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
  catch (e) { host.appendChild(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'The 3D view needs WebGL, which this browser has turned off.' })); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'vz-canvas';
  canvas.setAttribute('aria-label', '3D view of the member. Drag to orbit, scroll to zoom.');
  host.appendChild(canvas);
  const legend = document.createElement('div'); legend.className = 'vz-legend'; host.appendChild(legend);
  const hud = document.createElement('div'); hud.className = 'vz-hud'; host.appendChild(hud);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1.6, 0.01, 1000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.addEventListener('change', () => { if (!playing) draw(); });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 5, 4); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-4, 2, -3); scene.add(fill);
  const tex = bandTexture();

  let model = null, opts = {}, items = [], cracks = [], arrows = [], group = null, playing = false, raf = 0, t0 = 0, tNow = 0, fitKey = '';
  let bg = null, smax = { main: 1, rebar: 0 }, smaxEnd = { main: 1, rebar: 0 };
  const grp = (part) => (part.mat === 'rebar' && model.hasRebar ? 'rebar' : 'main');

  function size() {
    const w = Math.max(200, host.clientWidth || 600);
    const h = Math.round(Math.max(260, Math.min(460, w * 0.62)));
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { size(); if (!playing) draw(); }) : null;
  if (ro) ro.observe(host);

  function clearModel() {
    items.forEach((it) => { it.mesh.geometry.dispose(); it.mesh.material.dispose(); });
    cracks.forEach((c) => { c.line.geometry.dispose(); c.line.material.dispose(); });
    arrows.forEach((a) => a.obj.dispose && a.obj.dispose());
    if (group) scene.remove(group);
    items = []; cracks = []; arrows = []; group = null;
  }

  function material(part) {
    const stress = opts.view === 'stress';
    const rc = model.hasRebar;
    const see = rc && opts.rebar;
    const base = MAT[part.mat] || MAT.concrete;
    let m;
    if (stress && part.stress !== false) m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    else if (stress) m = new THREE.MeshLambertMaterial({ color: 0xc9c9c9, side: THREE.DoubleSide });
    else m = new THREE.MeshStandardMaterial(Object.assign({ side: THREE.DoubleSide }, base));
    if (part.mat === 'concrete' && see && !part.solid) { m.transparent = true; m.opacity = stress ? 0.5 : 0.32; m.depthWrite = false; }
    if (part.mat === 'soil' || part.mat === 'soil2') { m.transparent = true; m.opacity = stress && part.stress !== false ? 0.55 : 0.22; m.depthWrite = false; }
    if (part.opacity != null) { m.transparent = true; m.opacity = part.opacity; m.depthWrite = false; }
    return m;
  }

  function build() {
    clearModel();
    group = new THREE.Group();
    scene.add(group);
    const showRebar = !model.hasRebar || opts.rebar;
    model.parts.forEach((part) => {
      if (part.inner && !showRebar) return;
      const geo = partGeom(part);
      const mesh = new THREE.Mesh(geo, material(part));
      if (part.mat === 'soil' || part.mat === 'soil2') mesh.renderOrder = -1;
      if (part.mat === 'concrete' && model.hasRebar && opts.rebar) mesh.renderOrder = 2;
      group.add(mesh);
      items.push({ part, mesh, base: Float32Array.from(geo.attributes.position.array) });
    });
    (model.cracks || []).forEach((c) => {
      const n = c.pts.length;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n - 1) * 6), 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x16181b }));
      line.renderOrder = 5;
      group.add(line);
      cracks.push({ c, line });
    });
    (model.loads || []).forEach((l) => {
      const len = l.len || 0.3;
      const obj = new THREE.ArrowHelper(new THREE.Vector3(...l.dir).normalize(), new THREE.Vector3(), len, 0xd9822b, len * 0.3, len * 0.18);
      group.add(obj);
      arrows.push({ l, obj, len });
    });
    // Largest stress at the design load, for the legend scales (reinforcement has its own scale).
    smax = { main: 0, rebar: 0 }; smaxEnd = { main: 0, rebar: 0 };
    const lamTop = Math.max(1, model.lamEnd || 1);
    if (model.stress) items.forEach(({ part, base }) => {
      if (part.stress === false) return;
      const k = grp(part);
      for (let i = 0; i < base.length; i += 3) {
        const v = model.stress.f(base[i], base[i + 1], base[i + 2], part, 1), w = model.stress.f(base[i], base[i + 1], base[i + 2], part, lamTop);
        if (isFinite(v) && v > smax[k]) smax[k] = v;
        if (isFinite(w) && w > smaxEnd[k]) smaxEnd[k] = w;
      }
    });
    if (!(smax.main > 0)) { smax.main = smax.rebar > 0 ? 0 : 1; smaxEnd.main = smax.main; }
  }

  // In the stress view the model is fitted into the area right of the legend.
  function fit(f) {
    const b = model.bounds; // [[x0,y0,z0],[x1,y1,z1]]
    const c = new THREE.Vector3((b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2);
    const dir = new THREE.Vector3(...(model.view || [0.9, 0.55, 1.3])).normalize();
    // Fit the eight corners of the bounding box in both the horizontal and the vertical field of view.
    camera.position.copy(c).addScaledVector(dir, 10);
    camera.lookAt(c);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const tv = Math.tan((camera.fov * Math.PI) / 360), th = tv * camera.aspect * (1 - 2 * f);
    let dist = 0.1;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(b[i & 1][0], b[(i >> 1) & 1][1], b[(i >> 2) & 1][2]).sub(c);
      const x = p.dot(right), y = p.dot(up), z = p.dot(dir);
      dist = Math.max(dist, Math.abs(x) / th + z, Math.abs(y) / tv + z);
    }
    dist *= 1.12;
    const shift = right.clone().multiplyScalar(-f * 2 * dist * tv * camera.aspect);
    c.add(shift);
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
    controls.target.copy(c);
    controls.update();
  }

  // Apply the load state: displacements, stress colors, cracks, arrows.
  function apply(state) {
    const lamEnd = model.lamEnd || 1;
    const s = { lam: state.lam, lamEnd, r: lamEnd ? state.lam / lamEnd : 0, brk: state.brk };
    const stress = opts.view === 'stress' && model.stress;
    const sc = playing ? smaxEnd : smax;
    const lamS = playing ? state.lam : 1;
    items.forEach(({ part, mesh, base }) => {
      const geo = mesh.geometry, p = geo.attributes.position.array;
      const moving = playing && (state.lam > 0 || state.brk > 0);
      for (let i = 0; i < p.length; i += 3) {
        if (moving) { const d = model.disp(base[i], base[i + 1], base[i + 2], part, s); p[i] = base[i] + d[0]; p[i + 1] = base[i + 1] + d[1]; p[i + 2] = base[i + 2] + d[2]; }
        else { p[i] = base[i]; p[i + 1] = base[i + 1]; p[i + 2] = base[i + 2]; }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      if (stress && part.stress !== false) {
        const uv = geo.attributes.uv.array, lo = 0, hi = sc[grp(part)] || 1;
        for (let i = 0, j = 0; i < base.length; i += 3, j += 2) {
          const v = model.stress.f(base[i], base[i + 1], base[i + 2], part, lamS);
          uv[j] = Math.max(0.001, Math.min(0.999, (v - lo) / ((hi - lo) || 1))); uv[j + 1] = 0.5;
        }
        geo.attributes.uv.needsUpdate = true;
      }
    });
    cracks.forEach(({ c, line }) => {
      const show = playing ? (c.brk != null ? state.brk >= c.brk : s.r >= c.at) : false;
      line.visible = show;
      if (!show) return;
      const grow = c.brk != null ? Math.min(1, (state.brk - c.brk) / 0.25 + 0.2) : Math.min(1, (s.r - c.at) / 0.12 + 0.15);
      const n = c.pts.length - 1, upto = Math.max(1, Math.ceil(grow * n));
      const arr = line.geometry.attributes.position.array;
      const part = { piece: c.piece, mat: 'concrete', crack: true };
      for (let k = 0; k < n; k++) {
        const a = c.pts[k], b = c.pts[k + 1];
        const pts = k < upto ? [a, b] : [a, a];
        pts.forEach((q, m) => { const d = model.disp(q[0], q[1], q[2], part, s); arr.set([q[0] + d[0], q[1] + d[1], q[2] + d[2]], (k * 2 + m) * 3); });
      }
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    });
    arrows.forEach(({ l, obj }) => {
      const tip = l.p;
      const d = playing ? model.disp(tip[0], tip[1], tip[2], { piece: l.piece, mat: 'load' }, s) : [0, 0, 0];
      const dir = new THREE.Vector3(...l.dir).normalize();
      obj.position.set(tip[0] + d[0], tip[1] + d[1], tip[2] + d[2]).addScaledVector(dir, -(l.len || 0.3));
      obj.visible = !playing || state.lam > 0 || l.always;
    });
    // HUD
    const lines = [];
    if (playing) {
      if (model.fails) {
        if (state.phase === 'break' || state.phase === 'broken') lines.push('<b class="bad">' + esc(model.failText) + '</b>');
        else lines.push('Load: ' + Math.round(state.lam * 100) + '% of the design load' + (state.lam >= 1 && lamEnd > 1 ? ' (design load passed)' : ''));
      } else lines.push('Load: ' + Math.round(state.lam * 100) + '% of the design load');
      if (model.ampText) lines.push('<span class="muted">' + esc(model.ampText) + '</span>');
    } else if (model.note) lines.push('<span class="muted">' + esc(model.note) + '</span>');
    hud.innerHTML = lines.join('<br>');
    hud.style.display = lines.length ? '' : 'none';
  }

  function drawLegend() {
    const st = opts.view === 'stress' && model && model.stress;
    legend.style.display = st ? '' : 'none';
    if (!st) return;
    const sc = playing ? smaxEnd : smax;
    const fq = opts.fq || ((v) => v.toFixed(1));
    const unit = esc(fq(1, st.q, true).replace(/^[-\d.,\s]+/, ''));
    const scale = (title, max) => {
      const rows = [];
      for (let i = BANDS - 1; i >= 0; i--) rows.push('<div class="vz-row"><span class="vz-sw" style="background:' + css(bandColor(i)) + '"></span><span>' + esc(fq((max * (i + 1)) / BANDS, st.q, false)) + '</span></div>');
      rows.push('<div class="vz-row"><span class="vz-sw vz-none"></span><span>' + esc(fq(0, st.q, false)) + '</span></div>');
      return '<div class="vz-scale">' + (title ? '<div class="vz-lu">' + esc(title) + '</div>' : '') + rows.join('') + '</div>';
    };
    const bars = smax.rebar > 0 && (!model.hasRebar || opts.rebar);
    legend.innerHTML = '<div class="vz-lt">' + esc(st.label) + '</div><div class="vz-lu">' + unit + (playing ? ', scale up to the failure load' : ', at the design load') + '</div>' +
      '<div class="vz-scales">' + (sc.main > 0 ? scale(bars ? 'Concrete' : '', sc.main) : '') + (bars ? scale('Bars', sc.rebar) : '') + '</div>';
  }

  function draw() { renderer.render(scene, camera); }
  function frame(now) {
    if (!playing) return;
    tNow = (now - t0) / 1000;
    apply(timeline(tNow, model.lamEnd || 1, model.fails));
    draw();
    raf = requestAnimationFrame(frame);
  }

  return {
    canvas,
    update(m, o) {
      const rebuild = m !== model || o.view !== opts.view || o.rebar !== opts.rebar;
      const wasPlaying = playing;
      model = m; opts = Object.assign({}, o);
      if (!model) { clearModel(); draw(); return; }
      if (bg !== o.bg) { bg = o.bg; scene.background = new THREE.Color(o.bg || '#f4f5f7'); }
      size();
      if (rebuild) build();
      const key = model.fitKey || JSON.stringify(model.bounds);
      const f = opts.view === 'stress' && (host.clientWidth || 600) > 640 ? Math.min(0.17, 160 / (host.clientWidth || 600)) : 0;
      if (key + f !== fitKey) { fitKey = key + f; fit(f); }
      playing = !!o.playing;
      drawLegend();
      if (playing && !wasPlaying) { t0 = performance.now() - tNow * 1000; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
      if (!playing) { cancelAnimationFrame(raf); tNow = 0; apply({ lam: 1, brk: 0, phase: 'static' }); draw(); }
    },
    // For tests: jump to a time in the loop and draw it.
    seek(t) { if (!model) return null; const s = timeline(t, model.lamEnd || 1, model.fails); const was = playing; playing = true; apply(s); draw(); playing = was; return s; },
    png() { draw(); return canvas.toDataURL('image/png'); },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); clearModel(); tex.dispose(); controls.dispose(); renderer.dispose(); host.innerHTML = ''; }
  };
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
