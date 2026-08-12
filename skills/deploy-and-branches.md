# 技能：部署與分支流程（改動如何上線）

> **本檔已於 2026-08-12 併入 `.claude/skills/publish-pages/SKILL.md`，內容不在這裡。**
>
> 併入原因：同一套上線流程原本在兩處各寫一份，結果其中一條規則（「上線後 WebFetch
> `github.io` 驗證」）在雲端根本做不到——修的時候只找到兩份、漏掉第三份，錯的那份
> 又存活了一段時間。這正是 `failure-patterns.md` 第 5、7 條說的「制度副本分岔」。
>
> 保留本檔只為兩件事：不讓 `INDEX.md` 與其他檔案的既有引用斷掉，以及留下這段說明。
> **要看流程請開 `.claude/skills/publish-pages/SKILL.md`**（那是會被自動載入的那一份，
> 也是唯一正本）。

## 為什麼正本放在 `.claude/skills/` 而不是這裡

`.claude/skills/` 底下的 SKILL.md 會被 harness 自動掛成可呼叫的 skill，session 一開始
就在可用清單裡；而 `skills/`（本資料夾）是純 markdown，CLAUDE.md 的路由表並不指向它，
沒有任何機制保證它會被讀到。同一條規則放這兩個地方，被讀到的永遠是前者，
後者只會安靜地過期。所以流程類、每次都要照做的規則，正本一律放 `.claude/skills/`。
