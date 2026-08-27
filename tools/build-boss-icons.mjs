/**
 * 生成老板 App 的主屏图标（PNG）。
 *
 * 为什么要 PNG：iOS 装到主屏时只认 <link rel="apple-touch-icon"> 指的 PNG，
 * manifest 里的 SVG（哪怕是 data URI）在 iPhone 上一概不生效——没有 PNG 的话
 * 主屏上会是一张网页截图，很难看。2026-08-27 用户反映「入口不能做出图标吗」
 * 就是这个原因。
 *
 * 为什么用纯几何图形而不是 emoji 或中文字：这个容器里没有 emoji 字体，也不保证
 * 有中文字体，用字画出来会变成豆腐块。公文包用矩形拼，零字体依赖。
 *
 * 跑法：CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/build-boss-icons.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const NAVY = '#1E3A5F', GOLD = '#C9A227', LIGHT = '#F4F6F9';

// viewBox 512×512。圆角比例按 iOS 的观感调（iOS 自己还会再切一次圆角，
// 所以这里留的圆角要比看起来需要的小一点）。
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="${NAVY}"/>
  <!-- 提手 -->
  <path d="M196 150 q0-34 34-34 h52 q34 0 34 34 v26 h-34 v-20 q0-6-6-6 h-40 q-6 0-6 6 v20 h-34 z" fill="${LIGHT}"/>
  <!-- 箱体 -->
  <rect x="108" y="176" width="296" height="212" rx="26" fill="${LIGHT}"/>
  <!-- 中间那道分隔与锁扣 -->
  <rect x="108" y="262" width="296" height="20" fill="${NAVY}" opacity=".16"/>
  <rect x="232" y="252" width="48" height="40" rx="9" fill="${GOLD}"/>
</svg>`;

const sizes = [
  { file: 'boss/icon-512.png', size: 512 },
  { file: 'boss/icon-192.png', size: 192 },
  { file: 'boss/apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
for (const { file, size } of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">
       <div style="width:${size}px;height:${size}px">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div>
     </body></html>`
  );
  const buf = await page.screenshot({ omitBackground: true });
  writeFileSync(file, buf);
  console.log(`✅ ${file} (${size}×${size}, ${buf.length} 字节)`);
}
await browser.close();
