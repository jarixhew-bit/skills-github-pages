# 项目规则

## 用户环境
- 只使用 **Claude Code 网页版**（claude.ai/code），不用本地 CLI
- 所有「本地安装」都是指远程容器内，session 结束会消失，需靠 SessionStart hook 持久化

## 媒体文件规则
- **视频**：一律上传到 YouTube，设成「不公开」(unlisted)，用 `<iframe>` 嵌入页面，不直接放进仓库
- **图片**：旅游手册一律用 Google Places 图片链接，不上传图片文件到仓库
- **音频**：可以直接放进仓库（文件小，没问题）

## 双语页面规则
- 所有双语（中/英）页面都要加系统语言自动侦测：首次打开时读 `navigator.language`，以 `zh` 开头显示中文，否则显示英文
- 用户手动点过语言切换按钮后，要记住该选择（存 localStorage，用独立 key 如 `xxxLangUser`），之后优先于系统语言侦测
- 参考实现见 `japan-trip-2026.html` 和 `usj-disney-restaurants.html` 的 `initLang()` / `setLangUser()`

## 部署
- 所有页面部署到 GitHub Pages
- 网址格式：`https://jarixhew-bit.github.io/skills-github-pages/文件名`
- 发给别人直接发网址，更新后对方刷新自动同步，不需要重发文件

## 分支策略
- Claude 将改动推送到功能分支，然后**自动创建 PR 并合并到 main**
- 合并方式：squash merge
- 如有冲突先 merge origin/main 解决后再合并

## 上传流程
1. 用户上传修改好的文件（或直接说明需求）
2. Claude 修改文件并 commit push 到功能分支
3. Claude 创建 PR 并自动合并到 main → 内容上线到 GitHub Pages

## 现有项目
- `xisui/` — 洗髓功法练习 App（PWA）
- `japan-trip-2026.html` — 日本旅游手册
- `tokyo-itinerary.html` — 东京行程
- `restaurant-guide.html` — 餐厅指南
- `usj-disney-restaurants.html` — USJ/迪士尼后餐厅
