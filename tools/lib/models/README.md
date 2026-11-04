# 健身示范用人体模型

- `fitness-female-sport.glb`＋`sport/`（**正式版，2026-11-04 起**，用户选的样品 C「时尚运动风」）：
  glam 女性体型（沙漏型、肌肉 0.6）、马尾、眉毛、睫毛、眼球、白球鞋（shoes05），骨架用 Mixamo 命名。
  由 `tools/build-fitness-muscle-model.py`（female style=glam，环境变量 `MH_ASSETS` 指向 MakeHuman 系统素材、`shoes=1`）生成。
  `sport/` 是渲染台上材质用的贴图（都缩到 ≤1024px）：`skin.jpg`（皮肤 young_caucasian_female 的
  young_lightskinned_female_diffuse）、`hair.webp`（ponytail01）、`brow.webp`（eyebrow001）、`lash.webp`（eyelashes01）、
  `eye.webp`（眼球材质 brownlight）、`shoes.webp`（shoes05）。颜色（小麦肤色、珊瑚色运动服）在渲染台里调。
- `fitness-female.glb`：旧版（雕像白＋深色运动内衣与短裤、无贴图），`?style=classic`／`STYLE=classic` 还能用来对照。

## 授权（仓库是公开的，所以每个素材都要能公开再发布）

全部是 **CC0 1.0**：

1. 人体网格、体型变形、骨架：MPFB2，`https://github.com/makehumancommunity/mpfb2` 的 `LICENSE.ASSETS.md` 是 CC0 1.0 全文。
2. MakeHuman 随附素材整体：`https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md` 第 C 节——
   “The assets are defined as any data contributing to the graphical output of MakeHuman. This includes: The base mesh and proxies,
   Targets and modifiers, Textures, Clothes (any MHCLO-based asset), Poses and expressions. These assets have been released under CC0 1.0 Universal.”
3. 2020 年改授权的官方说明（`https://static.makehumancommunity.org/oldsite/faq/what_changed_regarding_the_license_in_2020.html`）：
   “BEFORE: Assets are per default covered by AGPL / AFTER: Assets are per default released as CC0”。
4. **逐项核对**：官方「makehuman_system_assets」素材包页面
   `https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html`
   的清单里，下列每一项的 Author 都是 makehuman_system、License 都是 **CC0**：
   hair `ponytail01`、eyebrows `eyebrow001`、eyelashes `eyelashes01`、eyes `low-poly`、eyes `brownlight`（眼球贴图）、
   clothes `shoes05`、skins `young_caucasian_female`（皮肤贴图 young_lightskinned_female_diffuse 属于它）。
   （2026-11-04 用仓库的 `fetch-url` workflow 在 CI 抓页面核对；沙盒连不到 makehumancommunity.org。）

注意：当初下载用的镜像 `github.com/dmaugis/makehuman-py3-assets` 里 .mhclo 档头还写着 2016 年的
“This file is licensed AGPLv3”——那是 2020 年改授权前的旧档头；官方仓库里改过的档头（例如 makehuman 仓库的
`makehuman/data/eyes/low-poly/low-poly.mhclo`：“This asset was explicitly released as CC0 in september 2020”）与上面的素材包清单为准。
进仓库的只有转换后的模型与贴图，没有放任何 .mhclo／原始档。

- 对照：旧动图用的 Mixamo X Bot 授权不允许转发原档，所以那个模型从未进仓库。
