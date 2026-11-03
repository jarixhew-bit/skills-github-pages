/**
 * 把健身 App 每个动作渲染成示范动图（animated WebP，480×360），存进 fitness/anim/<file>.webp。
 *
 * 风格（2026-11-03 用户定稿）：深色渐层背景＋顶光、雕像白的女性健身体型模型、正在用力的肌肉发红光
 * （拉伸／活动度＝被拉开的部位发蓝光，游泳不发光），顶部 6 格部位小图，标题／次数／要领字幕。
 *
 * 资料从哪来：
 *   - 动作（关节角度）：fitness/index.html 里的 ANIM 引擎，App 的简笔画／3D 模式用的是同一份；
 *     往身体两侧开合、转体、脊椎弯曲这些 2D 表达不了的，在渲染台 tools/lib/fitness-render.html 的 OV 里补。
 *   - 每张图的标题、次数、要领、主／次肌肉、机位：tools/lib/fitness-anim-spec.json（研究员查证过的规格）。
 *   - 要渲染哪些：App 的 window.__fit.animCombos()（动作 key＋拿不拿哑铃）。
 *   - 人物模型：tools/lib/models/fitness-female.glb（CC0，已进仓库，不用下载）。
 *
 * 跑法（沙盒）：
 *   python3 -m http.server 8899 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/render-fitness-anim.mjs [file 或动作key ...]
 * 不给参数就全部重渲染。需要 python3 + Pillow（拼动图用）。
 * FRAMES_DIR=<目录> 会把每格 PNG 留在那里（<目录>/<file>/000.png…），并写 <目录>/<file>.json（第几格最用力），给联络表用。
 */
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const PORT = process.env.CHECK_PORT || 8899;
const OUT = process.env.OUT || 'fitness/anim';
const FPS = +process.env.FPS || 12, W = 480, H = 360;
const SPEC = JSON.parse(fs.readFileSync('tools/lib/fitness-anim-spec.json', 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.error('页面错误', e));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text()); });

// 要渲染哪些：App 实际用到的（动作 key＋拿不拿哑铃）组合，由 App 自己列出来
await page.goto(`http://localhost:${PORT}/fitness/`);
const combos = await page.evaluate(() => window.__fit.animCombos());
await page.goto(`http://localhost:${PORT}/tools/lib/fitness-render.html?w=${W}&h=${H}`);
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
const only = process.argv.slice(2);
const todo = combos.filter(c => !only.length || only.includes(c.file) || only.includes(c.anim));
const keep = process.env.FRAMES_DIR;
let bad = 0;
for (const c of todo) {
  const spec = SPEC.find(s => s.file === c.file);
  if (!spec) { console.log('✗ 规格里没有这一张', c.file); bad++; continue; }
  const r = await page.evaluate(([s, cc, fps]) => window.setup(s, cc, fps), [spec, c, FPS]);
  if (!r) { console.log('✗ 没有这个动作', c.anim); bad++; continue; }
  const dir = keep ? path.join(keep, c.file) : fs.mkdtempSync(path.join(os.tmpdir(), 'fitanim-'));
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < r.n; i++) {
    await page.evaluate(i => window.frame(i), i);
    await page.screenshot({ path: path.join(dir, String(i).padStart(3, '0') + '.png'), clip: { x: 0, y: 0, width: W, height: H } });
  }
  execFileSync('python3', ['-I', '-c', `
import glob,sys
from PIL import Image
fs=sorted(glob.glob(sys.argv[1]+'/*.png')); im=[Image.open(f).convert('RGB') for f in fs]
im[0].save(sys.argv[2],save_all=True,append_images=im[1:],duration=int(sys.argv[3]),loop=0,quality=int(sys.argv[4]),method=6)
`, dir, path.join(OUT, c.file + '.webp'), String(r.ms), process.env.QUALITY || '68']);
  if (keep) fs.writeFileSync(path.join(keep, c.file + '.json'), JSON.stringify(r));
  else fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓', c.file, r.n + ' 格', '最用力第 ' + r.peak + ' 格', Math.round(fs.statSync(path.join(OUT, c.file + '.webp')).size / 1024) + 'KB');
}
await browser.close();
if (bad) process.exit(1);
