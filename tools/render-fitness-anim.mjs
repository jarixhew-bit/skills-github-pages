/**
 * 把健身 App 每个动作渲染成「写实人物」循环动图（animated WebP），存进 fitness/anim/。
 *
 * 为什么是预先渲染而不是在手机上即时算：人物模型（Mixamo 的 Michelle）授权允许拿来做作品，
 * 但不允许把模型原档公开转发——仓库是公开的，所以只放渲染好的动图，模型每次临时下载。
 *
 * 跑法（沙盒）：
 *   python3 -m http.server 8899 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/render-fitness-anim.mjs [动作key ...]
 * 不给 key 就全部重渲染。需要 python3 + Pillow（拼动图用）。
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const PORT = process.env.CHECK_PORT || 8899;
const MODEL = process.env.MODEL || 'Michelle';
const MODEL_URL = `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/${MODEL}.glb`;
const CACHE = `.photos/fitness-model/${MODEL}.glb`; // .photos/ 在 .gitignore 里，模型不会被提交
const OUT = process.env.OUT || 'fitness/anim';
const EXTRA = process.env.RECOLOR ? '&recolor=1' : '';
const FPS = +process.env.FPS || 12, W = 360, H = 270;

if (!fs.existsSync(CACHE)) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const r = await fetch(MODEL_URL); if (!r.ok) throw new Error('下载人物模型失败 ' + r.status);
  fs.writeFileSync(CACHE, Buffer.from(await r.arrayBuffer()));
}
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.error('页面错误', e));
await page.goto(`http://localhost:${PORT}/tools/lib/fitness-render.html?w=${W}&h=${H}&model=/${CACHE}${EXTRA}`);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });

// 要渲染哪些：App 实际用到的（动作 key＋拿不拿哑铃）组合，由 App 自己列出来
await page.goto(`http://localhost:${PORT}/fitness/`); 
const combos = await page.evaluate(() => window.__fit.animCombos());
await page.goto(`http://localhost:${PORT}/tools/lib/fitness-render.html?w=${W}&h=${H}&model=/${CACHE}${EXTRA}`);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const only = process.argv.slice(2);
const todo = combos.filter(c => !only.length || only.includes(c.file) || only.includes(c.anim));
const tmp = fs.mkdtempSync('/tmp/fitanim-');
for (const c of todo) {
  const r = await page.evaluate(([k, h]) => window.render(k, h, 12, 48), [c.anim, c.hold]);
  if (!r) { console.log('✗ 没有这个动作', c.anim); continue; }
  const dir = path.join(tmp, c.file); fs.mkdirSync(dir, { recursive: true });
  r.frames.forEach((d, i) => fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.png'), Buffer.from(d.split(',')[1], 'base64')));
  execFileSync('python3', ['-c', `
import glob,sys
from PIL import Image
fs=sorted(glob.glob(sys.argv[1]+'/*.png')); im=[Image.open(f).convert('RGBA') for f in fs]
im[0].save(sys.argv[2],save_all=True,append_images=im[1:],duration=int(sys.argv[3]),loop=0,quality=62,method=6,lossless=False)
`, dir, path.join(OUT, c.file + '.webp'), String(r.ms)]);
  console.log('✓', c.file, r.frames.length + ' 格', Math.round(fs.statSync(path.join(OUT, c.file + '.webp')).size / 1024) + 'KB');
}
await browser.close();
