---
name: edit-html-page
description: 修改或新建本仓库任何 HTML 页面（旅游手册、卡片增删、双语文案、PWA 页面）前必读的操作流程。Use when editing or creating any HTML page in this repo, including adding/removing restaurant or attraction cards, bilingual text changes, or PWA page updates.
---

# 改 HTML 页面的标准流程

本仓库页面都已上线（GitHub Pages，网址发过给别人），改坏了用户的家人朋友会直接看到。
照下面顺序做，不许跳步。

## 动手前
1. 读对应的结构笔记：`.claude/notes/travel-pages.md`（五个旅游页）、
   `.claude/notes/expense-tracker.md`、`.claude/notes/fortune.md`、`.claude/notes/xisui.md`。
   按笔记锚点定位要改的区块。
2. 双语页面 → 读 `skills/bilingual-pages.md`（initLang 模式、siteLangUser 统一 key）。
   放图片/视频 → 读 `skills/media-files.md`（视频上 YouTube 不入库、手册图用 Google Places 外链）。

## 硬规则（改的时候）
- 手册卡片必须带图和中英说明，一并补齐不必询问（CLAUDE.md 媒体规则）。
- 外语行话本地化：中文侧翻中文、英文侧翻英文；店名与词典收录词（sushi/ramen 等）保留。
- PWA 页面改内容必须同步升 Service Worker 缓存版本号（位置见结构笔记），否则用户刷新看不到更新。
- 补缺失的关闭标签，先用 `python3 tools/check-html.py 文件 --trace div` 深度追踪定位，禁止肉眼判断。

## 用户上传整份 HTML 时——常见毛病清单（2026-07 两次实战总结）

用户常在外部改好整个文件再丢回来，要求「修好上传」。上传文件必按此清单扫一遍，
每条都是真实踩过的坑：

1. **`</section>` 位置放错**：卡片被关在 section 外，外框变宽、区域筛选漏掉它们
   （check-html.py 只查平衡查不出位置错——需数每个 section 内卡片数是否与筛选 chip 一致）。
2. **中英内容不对称**：一侧有 emoji/信息另一侧漏（如营业时间 chip 中文有 📅 英文没有）；
   用 cn/en span 计数 + 抽查对照。
3. **外语行话残留**：假名/韩文 CI 会拦；**罗马字行话（karaage、盛り→拼盘等）要人工扫**，
   规则见上文「硬规则」。
4. **英文大小写不一致**（如句中 "Open straight"）、多余缩进、`</script>` 后残留注释。
5. **与线上版做 diff 再动手**：`diff 上传文件 线上文件` 先看用户到底改了什么，
   只修不该有的、保留用户的改动意图；上传文件可能基于旧版，先确认没回退掉 main 上更新的内容。
6. **事实核对**：新卡片里的营业时间、星期几（用程序算日期，禁止心算）、地图链接可点。

## 改完后（不通过不准 commit）
1. `python3 tools/check-html.py 改过的文件` —— 必须输出"通过"。CI 会在 PR 上再跑一次把关。
2. read-back 改动处上下文，确认相邻区块没被破坏。
3. 上线流程走 `publish-pages` 技能。

## 大批量修改（3 个文件以上或整页重构）
不要自己动手——派 `html-editor` agent（它内建了本页全部规则），委派 prompt 按
`.claude/rules/templates.md` 模板 3 填写，范例见 `.claude/rules/examples.md`。
