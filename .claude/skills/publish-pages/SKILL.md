---
name: publish-pages
description: 把本仓库的改动发布上线（commit、push、开 PR、合并到 main、GitHub Pages 生效）的标准流程。Use when committing, pushing, creating a PR, merging to main, or deploying/publishing any change in this repo.
---

# 发布上线的标准流程

本仓库 main 分支 = 线上内容（GitHub Pages）。流程完全机械化，照抄即可。

## 步骤
1. **改完先检查**：动过 HTML 就跑 `python3 tools/check-html.py --all`，不通过不准往下走。
   新增文件/脚本/配置（尤其可能带 API key、token 的）跑一次
   `python3 tools/check-secrets.py`，CI 也会拦，但自查更快。
2. **commit 到功能分支**（网页版 session 用自动分配的 `claude/*` 分支），commit message 一句话说清改了什么。
3. **push**：`git push -u origin 分支名`。失败按网络错误重试最多 4 次（2s/4s/8s/16s 退避）。
4. **开 PR 并合并**：用 GitHub MCP 工具开 PR → **squash merge** 到 main。
   有冲突先 `git merge origin/main` 解决再合。
5. **删分支**：合并后删除功能分支（分支不用于分类，见 CLAUDE.md）。
   注意：网页版 session 的 git 代理不允许 `push --delete`（403）——改用 GitHub MCP 的
   actions_run_trigger 触发 `cleanup-branches.yml` workflow（传入分支名），由 CI 代删；
   它有 main 保护和"内容已在 main"验证，删不掉的会在日志里警告而不是误删。
6. **验证真的进了 main**：`git show origin/main:路径` 从 remote 读回抽验——工作区正确
   不代表 commit 进去了。
   ⚠️ **网页版 session 抓不到 `github.io`**（出口代理 403，见 diagnosis.md），所以
   「WebFetch 线上网址确认」这一步在云端做不到，别浪费回合去试。线上那一层由
   `tools/check-live.py` ＋ `live-check.yml` 每天自动验；真实端到端只能请用户开一次。
   本机 CLI 不受此限，可以直接 WebFetch 验。
7. **收工时把本地 HEAD 切回 main**：`git fetch origin main && git checkout -B main origin/main`。
   理由：第 5 步删掉远端分支后，本地还留着一个指向旧分支头的过期远端追踪 ref，平台的
   Stop hook 拿 `origin/<当前分支>..HEAD` 数提交，会把 squash 后的 main 提交算成
   「1 个未推送提交」，每轮都误报一次。切回 main 后 upstream 是 origin/main，计数为 0。
   （光靠 `git fetch --prune` 不够：CI 删分支是异步的，prune 早了过期 ref 会再回来。
   2026-08-12 实测：造出过期 ref 后 A 法照样误报，B 法安静。）

## 回复用户
给完整网址＋一句"刷新即可看到"。对方已有旧链接的，不需要重发文件。

## 禁止
- 直接 push main（本地 CLI 无 PR 工具时例外，但要在回复里说明）。
- 合并后不删分支、或用分支存放长期内容。
- 没跑检查脚本就合并 HTML 改动。
