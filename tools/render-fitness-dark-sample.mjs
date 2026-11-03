/**
 * 深色风格示范动图「样品」（2026-11-03，用户看了别家 App 的动图想换风格，先做肩推一张给他看）。
 * 背后机位、手肘朝外的肩推、肩膀按用力程度发红光、画面上有动作名／次数／要领与部位小图。
 * 渲染台是 tools/lib/fitness-render-dark.html；用户拍板后再决定要不要并进 render-fitness-anim.mjs。
 * 跑法（沙盒）：python3 -m http.server 8899 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/render-fitness-dark-sample.mjs <输出路径前缀> [只截哪几格,逗号分隔]
 * 模型 Xbot.glb 要先在 .photos/fitness-model/（render-fitness-anim.mjs 用 MODEL=Xbot 跑一次会自动下载）。
 */
import { chromium } from 'playwright';
import fs from 'fs'; import { execFileSync } from 'child_process';
const [W,H]=[480,360], out=process.argv[2], only=process.argv[3];
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage({viewport:{width:W,height:H}});
pg.on('pageerror',e=>console.error('ERR',e.message)); 
await pg.goto(`http://localhost:8899/tools/lib/fitness-render-dark.html?w=${W}&h=${H}&model=/.photos/fitness-model/${process.env.MODEL||'Xbot'}.glb`);
await pg.waitForFunction(()=>window.ready,null,{timeout:120000});
const r=await pg.evaluate(()=>window.renderDark({name:'哑铃肩推',reps:'8–12',cue:'手肘在身体略前方，推到手臂接近伸直',group:'shoulder'}));
await pg.waitForTimeout(300);
const dir=out+'_f'; fs.mkdirSync(dir,{recursive:true});
const idx = only? only.split(',').map(Number) : [...Array(r.n).keys()];
for(const i of idx){ await pg.evaluate(([i,n])=>window.frameAt(i,n),[i,r.n]); await pg.screenshot({path:`${dir}/${String(i).padStart(3,'0')}.png`,clip:{x:0,y:0,width:W,height:H}}); }
await b.close(); console.log(r.n, r.ms);
if(!only) execFileSync('python3',['-I','-c',`
import glob,sys
from PIL import Image
fs=sorted(glob.glob(sys.argv[1]+'/*.png')); im=[Image.open(f).convert('RGB') for f in fs]
im[0].save(sys.argv[2],save_all=True,append_images=im[1:],duration=int(sys.argv[3]),loop=0,quality=70,method=6)
`,dir,out+'.webp',String(r.ms)]);
