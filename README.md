# jarixhew-bit 的 GitHub Pages

私人用的静态页面仓库：旅游手册、记账工具、小玩意，全部部署在 GitHub Pages，改完推到 `main` 自动上线。发链接给别人不需要重发文件，对方刷新即可看到最新内容。

## 在线页面

| 页面 | 说明 |
|---|---|
| [`japan-trip-2026.html`](https://jarixhew-bit.github.io/skills-github-pages/japan-trip-2026.html) | 日本旅游手册（双语） |
| [`singapore-trip/`](https://jarixhew-bit.github.io/skills-github-pages/singapore-trip/) | 新加坡行程页 |
| [`penang-trip/`](https://jarixhew-bit.github.io/skills-github-pages/penang-trip/) | 槟城家庭旅游手册（2026年10月） |
| [`restaurant-guide.html`](https://jarixhew-bit.github.io/skills-github-pages/restaurant-guide.html) | 日本餐厅精选指南 |
| [`usj-disney-restaurants.html`](https://jarixhew-bit.github.io/skills-github-pages/usj-disney-restaurants.html) | USJ / 迪士尼周边餐厅 |
| [`boss-dinner.html`](https://jarixhew-bit.github.io/skills-github-pages/boss-dinner.html) | 老板晚餐页 |
| [`expense-tracker.html`](https://jarixhew-bit.github.io/skills-github-pages/expense-tracker.html) | 记账工具（可安装 PWA，支持公司报账同步） |
| [`fortune.html`](https://jarixhew-bit.github.io/skills-github-pages/fortune.html) | 玄機閣 · 算命占卜 |
| [`xisui/`](https://jarixhew-bit.github.io/skills-github-pages/xisui/) | 洗髓功法练习 App（PWA） |
| [`trading/`](https://jarixhew-bit.github.io/skills-github-pages/trading/) | IBKR 交易分析页面 |

## 仓库规则

改动前请看 [`CLAUDE.md`](./CLAUDE.md)——媒体文件、双语页面、发布流程等规则都在那里，`.claude/playbook/` 和 `.claude/notes/` 有更细的操作说明。

自检脚本在 `tools/`（HTML 结构、密钥泄漏、图片外链等），改动会触发 `.github/workflows/` 里对应的 CI 检查。
