# fitness/ 减脂力量训练 App 结构笔记

2026-09-30 建。前身是用户上传的 claude.ai artifact（「30分钟全身减脂训练」），动画引擎与
训练内容原样沿用，其余重写成专业版。

## 文件
- `index.html` — 单文件 App。三个 `<script>`：① 火柴人动画引擎 `ANIM`（沿用原版，别动角度约定）；
  ② 训练内容 `EX`/`FIN`/`PLAN`/`WARM`/`COOL`（改动作/次数只改这里）；③ App 逻辑。
- `sw.js` — 离线缓存。**改 index.html 或 manifest 必须升 `CACHE` 版本号**（check-sw-version 会拦）。
- `manifest.webmanifest`、`icon*.png`、`icon.svg`。

## 锚点
- 加重建议：`suggest(id,eq)`（双重进步法；减量周的训练不算进历史 `histFor`）。
- 减量周：`cycleInfo()`，以第一笔训练那周为第 1 周，每第 4 周减量（2 轮、9 成重量）。
- localStorage key：`fit.sessions` / `fit.body` / `fit.draft` / `fit.cfg`。
- 自检挂钩：`window.__fit`。

## 坑
- 数据只在本机浏览器，没有云端。换手机靠「更多 → 导出/导入备份」。
- 原 artifact 的数据存在 claude.ai 那边，不同网域，**无法自动搬过来**。
- 自检：`tools/check-fitness.mjs`（真浏览器，固定日期 2026-09-30）。
