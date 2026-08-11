# main 分支的保护规则

`main.json` 是 main 分支保护规则的正本，用 GitHub 的 ruleset 汇出格式写成。

## 它做什么

| 规则 | 作用 |
|---|---|
| `required_status_checks` → `all-green` | **红的 PR 不准合并**。`all-green` 是 `checks.yml` 里的总闸，十项检查有任何一项红它就红 |
| `deletion` | main 不准被删 |
| `non_fast_forward` | main 不准被强推（功能分支不受影响，照样能强推） |

`bypass_actors` 是空的，也就是**没有人可以绕过**——包含仓库拥有者本人。
这一条是关键：留了绕过名单，红着照样合得进去，等于白设
（2026-08-11 实测过：规则没生效时，红的 PR 用 API 合并成功，坏文件进了 main）。

`strict_required_status_checks_policy: false` = 不要求「PR 必须先同步到最新 main」。
开了的话 main 每动一次、所有 PR 都要重新同步再跑一次检查，Actions 页面会多出一堆记录，
而本仓库的检查不依赖 main 的最新状态，没必要。

## 怎么套用

Actions 页面改不了这个，只能在仓库设定里操作：

1. 开 https://github.com/jarixhew-bit/skills-github-pages/settings/rules
2. **New ruleset** → **Import a ruleset**，选这个 `main.json`
3. 确认列表里出现 `main`、状态 `Active`

手动填表也可以，逐项对照上面那张表即可。

## 改了之后一定要实测

**存了不等于生效**。改动这个档案或在网页上改设定之后，要用一个「故意会红的 PR」
实际验一次：合并按钮该是灰的、用 API 合并该被拒绝。
做法：随便加一个标签不平衡的 HTML（`tools/check-html.py` 会红），开 PR，试着合并。
验完把那个文件删掉。

2026-08-11 就是靠这一步才发现规则根本没存进去——网页上表单填得好好的，
但没按到最底下的 Create，而 `mergeable_state` 显示 `unstable` 而不是 `blocked`
就是「必过项没登记上」的迹象。
