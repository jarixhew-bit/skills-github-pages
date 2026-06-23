# 项目规则

## 用户环境
- 只使用 **Claude Code 网页版**（claude.ai/code），不用本地 CLI
- 所有「本地安装」都是指远程容器内，session 结束会消失，需靠 SessionStart hook 持久化

## 媒体文件规则
- **视频**：一律上传到 YouTube，设成「不公开」(unlisted)，用 `<iframe>` 嵌入页面，不直接放进仓库
- **图片**：旅游手册一律用 Google Places 图片链接，不上传图片文件到仓库
- **音频**：可以直接放进仓库（文件小，没问题）

## 部署
- 所有页面部署到 GitHub Pages
- 网址格式：`https://jarixhew-bit.github.io/skills-github-pages/文件名`
- 发给别人直接发网址，更新后对方刷新自动同步，不需要重发文件

## 分支策略
- Claude 只负责将改动推送到功能分支 `claude/vigilant-allen-0yscji`
- **不自动创建 PR，不合并到 main**
- 用户自己在 GitHub 上合并 PR

## 上传流程
1. 用户上传修改好的文件
2. Claude 将文件复制到 `/home/user/skills-github-pages/`
3. Claude commit 并 push 到功能分支
4. 用户在 GitHub 上合并 PR → 内容上线到 GitHub Pages

## 现有项目
- `xisui/` — 洗髓功法练习 App（PWA）
- `japan-trip-2026.html` — 日本旅游手册
- `tokyo-itinerary.html` — 东京行程
- `restaurant-guide.html` — 餐厅指南
- `usj-disney-restaurants.html` — USJ/迪士尼后餐厅
