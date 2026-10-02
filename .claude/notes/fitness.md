# fitness/ 减脂力量训练 App 结构笔记

2026-09-30 建。前身是用户上传的 claude.ai artifact（「30分钟全身减脂训练」），动画引擎与
训练内容原样沿用，其余重写成专业版。

## 文件
- `index.html` — 单文件 App。三个 `<script>`：① 火柴人动画引擎 `ANIM`（沿用原版，别动角度约定）；
  ② 训练内容 `EX`/`FIN`/`PLAN`/`WARM`/`COOL`（改动作/次数只改这里）；③ App 逻辑。
- `anim3d.js` — 3D 渲染（ES module，载入 `../vendor/three/three.module.min.js`）。它不定义动作，
  只拿 `ANIM.sample(key,time)` 给的关节世界座标套上人体/哑铃/器材/泳池来画；载入失败或没有 WebGL
  时 index.html 自动退回 2D 火柴人。设置里可关 3D（`cfg.anim3d`）。
- `photos/` — 真人示范照片（Free Exercise DB，公共领域，缩到 480px，共 35 组×2 张）。对应表在
  index.html 的 `PH_EN`（按动作英文名）与 `PH_ANIM`（热身/放松/收尾按动画 key），照片与动作不完全
  一样（器材、坐站）时第二项写说明，会印在照片上。选照片前**先看过图**：库里同名动作常是别的变体。
  设置「动作示范」：真人（默认，没照片的用 3D）／3D／简笔（`cfg.media`）。
- `anim/<动作>[-<hold>].webp` — 人体模型示范动图（默认示范方式，2026-10-01 用户要「动作的 gif」）。
  由 `tools/render-fitness-anim.mjs`＋`tools/lib/fitness-render.html` 预渲染：抽 index.html 的同一份 ANIM
  引擎算关节，把方向套到 Mixamo「X Bot」人体模型骨架上（逐段对准，最小旋转），再逐格截图拼成
  animated WebP。**模型原档不进仓库**（Mixamo 授权允许做成作品、不允许转发原档），渲染时临时下载到
  `.photos/fitness-model/`（gitignore）。要渲染哪些组合由 App 的 `window.__fit.animCombos()` 列出，
  自检会点名缺图。**改了 ANIM 里任何动作就要重渲染那几张**（`node tools/render-fitness-anim.mjs <key>`），
  并升 sw.js 的 CACHE——图片走缓存优先，档名没变的话手机会一直看旧图。
- 有氧分页（2026-10-02）：`CD_KINDS`（三种练法与心率%）、`CD_WEEKS`（12 周每周排什么）、`cdSteps()`（跟练步骤，
  与力量训练共用全屏播放器，`plMode` 区分）；记录 `fit.cardio`、`fit.vo2`，都进备份。说明文字 `CD_WHY`/`CD_IQOS`/`CD_SAFE`
  每条都附来源链接——研究多为摘要层级（沙盒打不开全文），改数字前要重新查证，标「未查证」的别擅自写成定论。
- `sw.js` — 离线缓存。**改 index.html 或 manifest 必须升 `CACHE` 版本号**（check-sw-version 会拦）。
- `manifest.webmanifest`、`icon*.png`、`icon.svg`。

## 锚点
- 加重建议：`suggest(id,eq)`（双重进步法；减量周的训练不算进历史 `histFor`）。
- 减量周：`cycleInfo()`，以第一笔训练那周为第 1 周，每第 4 周减量（2 轮、9 成重量）。
- localStorage key：`fit.sessions` / `fit.body` / `fit.draft` / `fit.cfg`。
- 自检挂钩：`window.__fit`；3D 画了几格：`window.ANIM3D.frames`。
- 新增动作：在 ANIM 里 `def()` 一个 key 就同时有 2D 与 3D；游泳动作带 `pool:POOL`，
  漂浮高度用帧里的 `lf`、往前滑用 `dx`。器材名（bench/seat/wallR/board…）两边都要各画一次。
- 游泳课：`SWIM_STAGES` / `SWIM`（12 课），进度 localStorage `fit.swim`，也进备份。

## 坑
- 数据只在本机浏览器，没有云端。换手机靠「更多 → 导出/导入备份」。
- 原 artifact 的数据存在 claude.ai 那边，不同网域，**无法自动搬过来**。
- 自检：`tools/check-fitness.mjs`（真浏览器＋SwiftShader 软件 WebGL，固定日期 2026-09-30）。
- SW 对 anim3d.js 与 three 是「缓存优先」：改 anim3d.js 一定要升 `CACHE`（check-sw-version 已盯着）。
