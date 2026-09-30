// 3D 动作示范：把火柴人引擎（index.html 里的 ANIM）算出的关节位置，套上立体的人体、
// 哑铃、器材和泳池来渲染。每个动作仍由 ANIM 定义，这里只负责「长什么样」。
// 载入失败或设备不支持 WebGL 时，index.html 会继续用 2D 火柴人，不影响使用。
import * as THREE from '../vendor/three/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = () => new THREE.Vector3();

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

// ---------- 场景 ----------
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(28, 4 / 3, 5, 2000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8c88, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 500 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0xffffff, 0.55);
scene.add(rim, rim.target);

const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.62, metalness: 0 }, o));
const M = {
  skin: std(0xd8b596, { roughness: 0.7 }),
  shirt: std(0x0c7666),
  shorts: std(0x24302e),
  suit: std(0x173a5c),
  hair: std(0x2a2522, { roughness: 0.9 }),
  cap: std(0xcf4526, { roughness: 0.45 }),
  shoe: std(0xf1f1ee),
  iron: std(0x3b3f45, { roughness: 0.35, metalness: 0.6 }),
  plate: std(0xcf4526, { roughness: 0.5 }),
  prop: std(0xb9c4c1, { roughness: 0.8 }),
  wood: std(0xc9a57a, { roughness: 0.75 }),
  board: std(0xf2b33d, { roughness: 0.55 }),
  floor: std(0xe5eeeb, { roughness: 0.95 }),
  tile: std(0xbfe3ef, { roughness: 0.9 }),
  water: new THREE.MeshStandardMaterial({ color: 0x3fa7d6, transparent: true, opacity: 0.26, roughness: 0.15, depthWrite: false }),
  surf: new THREE.MeshStandardMaterial({ color: 0x9edcf2, transparent: true, opacity: 0.42, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
};

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m); return m;
}
// 两点之间放一段「胶囊」：长度固定（骨头不会伸缩），只按两点方向转
function seg(r, len, mat) { const m = mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat); m.userData.len = len; return m; }
const tmp = V();
function put(m, a, b) {
  tmp.subVectors(b, a); const L = tmp.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  if (L > 1e-6) m.quaternion.setFromUnitVectors(UP, tmp.divideScalar(L));
  m.scale.y = L / m.userData.len;
}

// ---------- 人体 ----------
const L = { thigh: 24, shin: 24, ua: 18, fa: 17 };
const body = {};
for (const s of ['n', 'f']) {
  body[s + 'thigh'] = seg(4.3, L.thigh, M.skin);
  body[s + 'shorts'] = seg(5.0, 11, M.shorts);
  body[s + 'shin'] = seg(3.4, L.shin, M.skin);
  body[s + 'foot'] = seg(2.4, 6, M.shoe);
  body[s + 'ua'] = seg(3.1, L.ua, M.skin);
  body[s + 'sleeve'] = seg(3.7, 6, M.shirt);
  body[s + 'fa'] = seg(2.7, L.fa, M.skin);
  body[s + 'hand'] = mesh(new THREE.SphereGeometry(2.9, 14, 10), M.skin);
  body[s + 'knee'] = mesh(new THREE.SphereGeometry(4.1, 14, 10), M.skin);
  body[s + 'elbow'] = mesh(new THREE.SphereGeometry(2.9, 12, 8), M.skin);
}
body.chest = seg(7.2, 17, M.shirt); body.chest.scale.z = 1.35;
body.pelvis = seg(6.8, 5, M.shorts); body.pelvis.scale.z = 1.3;
body.neck = seg(2.7, 5, M.skin);
body.head = mesh(new THREE.SphereGeometry(6.4, 28, 20), M.skin);
body.hair = mesh(new THREE.SphereGeometry(6.75, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), M.hair);
body.nose = mesh(new THREE.SphereGeometry(1.25, 10, 8), M.skin);
body.gog = mesh(new THREE.CapsuleGeometry(1.25, 7, 4, 8), std(0x1b2a33, { roughness: 0.2, metalness: 0.4 }));

// 哑铃：握把沿左右方向（z），两头六角片
function dumbbell() {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 11, 10), M.iron); bar.rotation.x = Math.PI / 2;
  g.add(bar);
  for (const z of [-4.6, 4.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 3.2, 6), M.plate); p.rotation.x = Math.PI / 2; p.position.z = z; p.castShadow = true; g.add(p); }
  bar.castShadow = true; scene.add(g); return g;
}
const DB = [dumbbell(), dumbbell()];

// 器材：一组可重复使用的方块
const boxes = []; for (let i = 0; i < 6; i++) { const b = mesh(new THREE.BoxGeometry(1, 1, 1), M.prop); boxes.push(b); }
let nb = 0;
function box(x0, x1, y0, y1, depth, mat, rotZ = 0, cx = null, cy = null) {
  const b = boxes[nb++]; if (!b) return;
  b.visible = true; b.material = mat;
  b.scale.set(Math.max(0.5, Math.abs(x1 - x0)), Math.max(0.5, Math.abs(y1 - y0)), depth);
  b.position.set(cx ?? (x0 + x1) / 2, cy ?? (y0 + y1) / 2, 0); b.rotation.set(0, 0, rotZ);
}

// 地面与泳池
// 地板：一圈淡淡的圆，颜色跟着页面主题；阴影另外投在透明的接影面上
const floorTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#bbb'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
M.floor = new THREE.MeshBasicMaterial({ color: 0xe5eeeb, alphaMap: floorTex, transparent: true, depthWrite: false, toneMapped: false });
const floor = mesh(new THREE.CircleGeometry(80, 48), M.floor, false); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05;
const shadowCatcher = mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.22 }), false); shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.renderOrder = 1;
const tile = mesh(new THREE.PlaneGeometry(700, 400), M.tile, false); tile.rotation.x = -Math.PI / 2; tile.position.y = -0.05;
const water = mesh(new THREE.BoxGeometry(700, 1, 260), M.water, false); water.renderOrder = 2;
const surfGeo = new THREE.PlaneGeometry(700, 260, 70, 26); surfGeo.rotateX(-Math.PI / 2);
const surf = mesh(surfGeo, M.surf, false); surf.renderOrder = 3;
const surfBase = surfGeo.attributes.position.array.slice();

// ---------- 摆姿势 ----------
const P3 = {};
function p3(name, P, z) { const a = P[name]; return (P3[name + z] ||= V()).set(a[0], a[1], z); }

function pose(s, hold, swim, time) {
  const P = s.P;
  // 两只手握同一个哑铃时，手往中间靠
  const together = hold === 'one' && Math.hypot(P.nh[0] - P.fh[0], P.nh[1] - P.fh[1]) < 3;
  const W = { hip: 5.4, knee: 5.4, foot: 5.6, sh: 9.2, elbow: 10, hand: together ? 3.6 : 9.4 };
  if (swim) W.hand = 8;
  for (const [s1, sg] of [['n', 1], ['f', -1]]) {
    const hip = p3('hip', P, sg * W.hip), knee = p3(s1 + 'k', P, sg * W.knee), foot = p3(s1 + 'f', P, sg * W.foot);
    const sh = p3('sh', P, sg * W.sh), el = p3(s1 + 'e', P, sg * W.elbow), hd = p3(s1 + 'h', P, sg * W.hand);
    put(body[s1 + 'thigh'], hip, knee);
    const mid = (P3['m' + s1] ||= V()).lerpVectors(hip, knee, 0.42);
    put(body[s1 + 'shorts'], hip, mid);
    put(body[s1 + 'shin'], knee, foot);
    body[s1 + 'knee'].position.copy(knee);
    // 脚：站着时脚尖朝前；游泳时绷脚背（顺着小腿）
    const sd = (P3['sd' + s1] ||= V()).subVectors(foot, knee).normalize();
    const toe = (P3['to' + s1] ||= V());
    if (swim) toe.copy(sd); else toe.set(-sd.y, sd.x, 0);
    if (toe.x < -0.2 && !swim) toe.negate();
    const tip = (P3['tp' + s1] ||= V()).copy(foot).addScaledVector(toe, 6.5);
    put(body[s1 + 'foot'], foot, tip);
    put(body[s1 + 'ua'], sh, el);
    const sl = (P3['sl' + s1] ||= V()).lerpVectors(sh, el, 0.38);
    put(body[s1 + 'sleeve'], sh, sl);
    put(body[s1 + 'fa'], el, hd);
    body[s1 + 'elbow'].position.copy(el);
    body[s1 + 'hand'].position.copy(hd);
    body[s1 + 'sleeve'].visible = !swim;
  }
  const hipC = p3('hip', P, 0), shC = p3('sh', P, 0), hdC = p3('hd', P, 0);
  const tor = (P3.tor ||= V()).subVectors(shC, hipC).normalize();
  const face = (P3.face ||= V()).set(tor.y, -tor.x, 0);
  const pelTop = (P3.pt ||= V()).copy(hipC).addScaledVector(tor, 6);
  put(body.pelvis, hipC, pelTop);
  const chA = (P3.ca ||= V()).copy(hipC).addScaledVector(tor, 9.5), chB = (P3.cb ||= V()).copy(shC).addScaledVector(tor, -1.5);
  put(body.chest, chA, chB);
  body.chest.material = swim ? M.suit : M.shirt;
  const neckTop = (P3.nt ||= V()).copy(shC).addScaledVector(tor, 5);
  put(body.neck, shC, neckTop);
  body.head.position.copy(hdC);
  // 头发／泳帽：盖在后脑勺上方，看得出脸朝哪边
  const back = (P3.bk ||= V()).copy(tor).multiplyScalar(0.75).addScaledVector(face, -0.66).normalize();
  body.hair.position.copy(hdC); body.hair.quaternion.setFromUnitVectors(UP, back);
  body.hair.material = swim ? M.cap : M.hair;
  body.hair.scale.setScalar(swim ? 1.03 : 1);
  body.nose.position.copy(hdC).addScaledVector(face, 6.3).addScaledVector(tor, -0.6);
  body.gog.visible = swim;
  if (swim) { body.gog.position.copy(hdC).addScaledVector(face, 5.6).addScaledVector(tor, 1.4); body.gog.quaternion.setFromUnitVectors(UP, (P3.z ||= V()).set(0, 0, 1)); }

  // 哑铃
  DB[0].visible = DB[1].visible = false;
  if (hold === 'hands') {
    DB[0].visible = DB[1].visible = true;
    DB[0].position.copy(p3('nh', P, W.hand + 0.5)); DB[1].position.copy(p3('fh', P, -W.hand - 0.5));
  } else if (hold === 'one') {
    DB[0].visible = true; DB[0].position.copy(p3('nh', P, together ? 0 : W.hand + 0.5));
    if (together) { DB[0].rotation.set(0, 0, 0); DB[0].rotation.x = Math.PI / 2; } else DB[0].rotation.set(0, 0, 0);
  }
  if (hold === 'hands') { DB[0].rotation.set(0, 0, 0); DB[1].rotation.set(0, 0, 0); }

  // 器材
  nb = 0; boxes.forEach(b => (b.visible = false));
  const X = n => P[n][0], Y = n => P[n][1];
  for (const pr of s.props) {
    if (pr === 'bench') { const x1 = Math.min(X('sh'), X('hip')) - 7, x2 = Math.max(X('sh'), X('hip')) + 9, top = Math.min(Y('sh'), Y('hip')) - 6; box(x1, x2, top - 5, top, 26, M.prop); box(x1 + 6, x1 + 10, 0, top - 5, 18, M.iron); box(x2 - 10, x2 - 6, 0, top - 5, 18, M.iron); }
    if (pr === 'pad') { const x1 = Math.min(X('sh'), X('nk')) - 3, x2 = Math.max(X('sh'), X('nk')) + 3, top = Math.min(Y('sh'), Y('hip')) - 6; box(x1, x2, top - 5, top, 26, M.prop); box((x1 + x2) / 2 - 2, (x1 + x2) / 2 + 2, 0, top - 5, 14, M.iron); }
    if (pr === 'seat') { const sx = X('hip'), top = Y('hip') - 5.5; box(sx - 13, sx + 14, top - 5, top, 28, M.prop); box(sx - 2, sx + 2, 0, top - 5, 10, M.iron); }
    if (pr === 'back') { const x = X('hip') - 8.5; box(x - 2.5, x + 2.5, Y('hip') - 3, Y('sh') + 6, 24, M.prop); }
    if (pr === 'recline') {
      const a = [X('hip'), Y('hip')], b = [X('sh'), Y('sh')], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 8, nx = Math.sin(ang), ny = -Math.cos(ang); // 背后方向
      const cx = (a[0] + b[0]) / 2 + nx * 7.5, cy = (a[1] + b[1]) / 2 + ny * 7.5;
      box(0, len, 0, 5, 26, M.prop, ang, cx, cy);
      box(X('hip') - 12, X('hip') + 14, Y('hip') - 10.5, Y('hip') - 5.5, 28, M.prop);
      box(X('hip') - 2, X('hip') + 2, 0, Y('hip') - 10.5, 10, M.iron);
    }
    if (pr === 'bar') { const hx = X('nh'), top = Y('nh') + 4; box(hx - 30, hx + 36, top, top + 4, 70, M.wood); box(hx + 30, hx + 34, 0, top, 4, M.wood); }
    if (pr === 'boxF') { const fx = X('ff'); box(fx - 15, fx + 7, 0, Y('ff') - 2.5, 30, M.wood); }
    if (pr === 'boxN') { const nx = X('nf'); box(nx - 18, nx + 17, 0, Y('nf') - 2.5, 34, M.wood); }
    if (pr === 'wallR') { const wx = X('nh') + 4; box(wx, wx + 10, 0, s.pool.surface + 9, 260, M.tile); }
    if (pr === 'wallL') { const wx = s.wallX; box(wx - 10, wx, 0, s.pool.surface + 9, 260, M.tile); }
    if (pr === 'board') { const hx = X('nh'); box(hx - 5, hx + 24, Y('nh') + 1, Y('nh') + 4, 30, M.board); }
  }

  // 地面／泳池
  floor.visible = shadowCatcher.visible = !s.pool;
  tile.visible = water.visible = surf.visible = !!s.pool;
  if (s.pool) {
    const h = s.pool.surface;
    water.scale.y = h; water.position.y = h / 2;
    const a = surfGeo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) a[i + 1] = h + 0.9 * Math.sin(a[i] * 0.06 + time * 1.7) * Math.cos(a[i + 2] * 0.05 + time * 1.1);
    surfGeo.attributes.position.needsUpdate = true; surfGeo.computeVertexNormals();
  }
}

// ---------- 镜头：3/4 侧面，按这个动作整个循环的范围取景 ----------
function frame(s, W, H, orbit, time) {
  const b = s.b, pad = 10;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const w = b.x1 - b.x0 + pad * 2 + 16, h = b.y1 - b.y0 + pad * 2 + 16;
  cam.aspect = W / H;
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const D = Math.max((h / 2) / t, (w / 2) / (t * cam.aspect)) * (orbit ? 1.1 : 1.0) + (orbit ? 24 : 8);
  const yaw = THREE.MathUtils.degToRad(orbit ? 30 + 16 * Math.sin(time * 0.35) : 30);
  const pitch = THREE.MathUtils.degToRad(s.pool ? 14 : 10);
  cam.position.set(cx + D * Math.sin(yaw) * Math.cos(pitch), cy + D * Math.sin(pitch), D * Math.cos(yaw) * Math.cos(pitch));
  cam.lookAt(cx, cy, 0);
  cam.updateProjectionMatrix();
  sun.target.position.set(cx, 0, 0); sun.position.set(cx + 70, 190, 110);
  rim.target.position.set(cx, cy, 0); rim.position.set(cx - 120, cy + 60, -90);
}

// 每种画布尺寸共用一个渲染器（缩图都一样大，所以通常只有 2–3 个）
const pool = new Map();
function renderer(W, H) {
  const k = W + 'x' + H;
  let r = pool.get(k);
  if (r) { pool.delete(k); pool.set(k, r); return r; }
  r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(1); r.setSize(W, H, false);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  pool.set(k, r);
  if (pool.size > 4) { const [fk, fr] = pool.entries().next().value; fr.dispose(); fr.forceContextLoss(); pool.delete(fk); }
  return r;
}

let lastTheme = '';
function theme(colors) {
  const key = colors.acc + colors.soft;
  if (key === lastTheme) return; lastTheme = key;
  M.shirt.color.set(colors.acc); M.plate.color.set(colors.wt); M.cap.color.set(colors.wt);
  if (colors.soft) M.floor.color.set(colors.soft);
}

const api = { ok: true, frames: 0, draw: null };
function draw(ctx, W, H, key, time, opts = {}) {
  const s = window.ANIM.sample(key, time); if (!s) return false;
  if (opts.colors) theme(opts.colors);
  pose(s, opts.hold || null, !!s.pool, time);
  frame(s, W, H, !!opts.orbit, time);
  const r = renderer(W, H);
  r.render(scene, cam);
  api.frames++;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(r.domElement, 0, 0, W, H);
  return true;
}

api.draw = draw;
if (webglOK() && window.ANIM && window.ANIM.sample) {
  window.ANIM3D = api;
  document.documentElement.dataset.anim = '3d';
}
