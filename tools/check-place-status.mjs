#!/usr/bin/env node
// 抓图器（tools/fetch-photos.mjs）的「营业状态」判断自检。不开浏览器、不连网，沙盒与 CI 都能跑。
//
// 为什么要它（2026-10-31）：用户指出「有些是已经关门的了」——抓图器原本不看营业状态，
// 停业的店照样抓得到图，于是混进手册。判断写在 placeStatus() 里，最容易错的两件事：
//   (1) 只认得英文：Google 有时用印尼文、中文显示（Tutup permanen／永久停业），漏认＝当成营业；
//   (2) 把营业时间那行的「Closed ⋅ Opens 11 AM」当成停业：那是今天还没开门，天天都有。
// 这里直接 import 发布出去的那个函数来测（不另抄一份逻辑）。
//
// 页面改版后线上抓不抓得到那段文字，归 fetch-photos.yml 实跑时的 status 字段管，不归这里。
//
// 跑法：node tools/check-place-status.mjs      退出码 0 = 全过；1 = 有不符
import { placeStatus } from './fetch-photos.mjs';

const CASES = [
  ['英文永久停业', 'Hanare by Takayama\n4.4(312)\nJapanese restaurant\nPermanently closed', 'permanently_closed'],
  ['英文暂时停业', 'Some Cafe\n4.5(80)\nCafe\nTemporarily closed', 'temporarily_closed'],
  ['印尼文永久停业', 'Restoran X\n4.3(1.204)\nRestoran Tionghoa\nTutup permanen', 'permanently_closed'],
  ['印尼文暂时停业', 'Angke Heritage\n4.6(2.311)\nRestoran Kanton\nTutup sementara', 'temporarily_closed'],
  ['中文永久停业', '某某酒家\n4.4(500)\n粤菜馆\n永久停业', 'permanently_closed'],
  ['中文暂时停业', '某某酒家\n4.4(500)\n粤菜馆\n暂时停业', 'temporarily_closed'],
  ['繁体永久停业', '某某酒家\n永久停業', 'permanently_closed'],
  ['正常营业', "T'ang Court\n4.7(1,532)\nCantonese restaurant\nOpen ⋅ Closes 10 PM", 'open'],
  // 营业时间那行写的「Closed」只是今天还没开门，不能当成停业
  ['还没开门不算停业', 'Din Tai Fung\n4.6(3,100)\nClosed ⋅ Opens 11 AM', 'open'],
  ['印尼文还没开门不算停业', 'Din Tai Fung\nTutup ⋅ Buka pukul 11.00', 'open'],
  ['两种字样都有时取永久', 'Temporarily closed\nPermanently closed', 'permanently_closed'],
  ['大小写不敏感', 'PERMANENTLY CLOSED', 'permanently_closed'],
  ['空字符串', '', 'unknown'],
  ['只有空白', '  \n ', 'unknown'],
  ['没拿到（undefined）', undefined, 'unknown'],
];

let pass = 0;
const fails = [];
for (const [desc, text, want] of CASES) {
  const got = placeStatus(text);
  if (got === want) pass++;
  else fails.push(`${desc}：期望 ${want}，实际 ${got}`);
}

if (fails.length) {
  console.log(`不通过：${fails.length} 项不符（${pass} 项通过）`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`通过：营业状态判断 ${pass} 项全对`);
