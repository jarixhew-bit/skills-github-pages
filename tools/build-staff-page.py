#!/usr/bin/env python3
"""从记账 App 生成同事版报账页（staff/index.html）。

    python3 tools/build-staff-page.py          # 生成
    python3 tools/build-staff-page.py --check  # 只检查有没有过期（CI 用）

为什么用生成而不是手写第二份（2026-08-07 用户拍板后定的做法）：

- 用户要的是「界面跟我的 App 一样，但只能记公司账」。手写过一份独立页面，
  结果连撞三个 App 早就解决过的问题（中文乱码、只能开相机、照片不压缩导致
  4G 传不上去），每一个都要用户实机试出来才发现。两份代码必然各自长歪。
- 但也不能像之前那样在同一个文件里靠 `?staff=1` 切换——同事只要把参数去掉
  就能看到老板 App 的完整界面（设置、账户、云同步入口）。用户明确否决了这条。

所以：**一份源码（expense-tracker.html），生成一个物理上只含公司报账的文件**。

两种处理方式，分得很清楚：

1. **整块删掉**（生成出来的文件里根本没有这段）——概览/统计/设置三个 tab、
   账户切换/新增账户/新增类别/循环账单四个弹窗、底部导航的另外三个按钮。
   这些是「个人账本」本身，同事不该有任何路径能走到，所以不是藏，是不存在。
2. **留在 DOM 里用 CSS 收起来**——记账弹窗里同事用不到的几个栏位（收入/支出切换、
   瑞尔、描述、谁报的账、单据号）和标题栏的云同步/账户按钮。
   理由：这些栏位共用的脚本会去读（`saveTx()` 里 `getElementById('tx-desc').value`），
   删掉会让脚本当场抛错，等于把记账功能一起弄坏。留着空栏位没有任何信息泄漏——
   真正属于个人账本的整块界面走的是第 1 类。

另外，同事版的 localStorage / IndexedDB 全部换名（`staffExpense_*`）：两个页面同源，
不换名的话老板在自己手机上打开同事版，会直接读到、甚至覆盖掉他自己的账本。

安全网：每一处删除/替换都锚定在一段唯一的文本上，锚点对不上就**直接报错退出**，
绝不产出一个「删了一半」的页面。App 改版把锚点挪走时，这里会立刻红，而不是
悄悄生成一个坏页面（假绿灯是这个项目栽过的跟头，见 check-staff-page.mjs 的注释）。
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "expense-tracker.html"
OUT = REPO / "staff" / "index.html"


class BuildError(SystemExit):
    def __init__(self, msg):
        super().__init__(f"❌ 生成同事版失败：{msg}\n"
                         f"   （多半是 expense-tracker.html 改版把锚点挪走了，"
                         f"照着 tools/build-staff-page.py 里的锚点更新一下）")


def once(s, needle, what):
    """确认锚点在全文里**恰好出现一次**——出现 0 次或多次都说明锚点不可靠。"""
    n = s.count(needle)
    if n != 1:
        raise BuildError(f"锚点「{what}」应出现 1 次，实际 {n} 次：{needle[:60]!r}")
    return s.index(needle)


def cut_between(s, start, end, what):
    """删掉 [start, end) 这一段，保留 end 本身。"""
    i = once(s, start, what + " 起点")
    j = once(s, end, what + " 终点")
    if j <= i:
        raise BuildError(f"「{what}」的终点在起点之前，锚点搞反了")
    return s[:i] + s[j:]


def replace_once(s, old, new, what):
    once(s, old, what)
    return s.replace(old, new, 1)


def replace_n(s, old, new, what, n):
    """锚点出现 n 次、且全部要换。

    2026-08-13 加：同一句提示语现在同时出现在「新增/编辑」和「改已送出那笔」两条代码
    路径里（saveTxInner 与 editSentCompanyTx），本来就该出现两次。仍然要求写明预期次数
    ——不写死次数就等于放弃锚点检查，将来漏翻一句也不会有人发现。
    """
    got = s.count(old)
    if got != n:
        raise BuildError(f"锚点「{what}」应出现 {n} 次，实际 {got} 次：{old[:60]!r}")
    return s.replace(old, new)


def cut_exact(s, block, what):
    """删掉一段一字不差的文本。"""
    once(s, block, what)
    return s.replace(block, "", 1)


def add_en(html, en):
    """给一段 `<tag ...>中文</tag>` 加上 data-en。"""
    i = html.index(">")
    return html[:i] + f' data-en="{en}"' + html[i:]


def build(src: str) -> str:
    s = src

    # ---------- 1) 整块删掉个人账本的界面 ----------
    s = cut_between(s, "<!-- OVERVIEW TAB -->", "<!-- TRANSACTIONS TAB -->", "概览 tab")
    s = cut_between(s, "<!-- ANALYTICS TAB -->", "<!-- SETTINGS TAB -->", "统计 tab")
    # 终点是「库存 tab」而不是 FAB：库存分页排在设置之后、FAB 之前，而同事版**要**保留
    # 库存（老板与同事在服务端的库存权限相同）。写成 FAB 会把库存一起切掉。
    s = cut_between(s, "<!-- SETTINGS TAB -->", "<!-- INVENTORY TAB -->", "设置 tab")
    s = cut_between(s, "<!-- MODAL: ACCOUNT SWITCHER -->", "<!-- PDF REPORT (hidden) -->",
                    "账户/类别/循环账单的弹窗")
    # 注：备用金的「转钱 / 设起点 / 调整」两个弹窗是老板专用的写入界面，它们摆在
    # ACCOUNT SWITCHER 和 PDF REPORT 之间，**已经被上面那条规则一起切掉了**。
    # 新增老板专用的弹窗时放在这个区间里就自动不会进同事版；放到区间外要另外加一条 cut。

    # 底部导航多一个「老板账」入口（没拿到口令的人看不到它，见 staffSyncMode）
    s = replace_once(s,
                     '  <button class="nav-btn" id="nav-transactions" onclick="switchTab(\'transactions\')">\n'
                     '    <div class="nav-icon">📋</div>明细\n'
                     '  </button>',
                     '  <button class="nav-btn" id="nav-transactions" onclick="staffGoCompany()">\n'
                     '    <div class="nav-icon">📋</div>明细\n'
                     '  </button>\n'
                     '  <button class="nav-btn" id="nav-leave" onclick="openLeaveModal()">\n'
                     '    <div class="nav-icon">🏖</div><span data-en="Leave">请假</span>\n'
                     '  </button>\n'
                     '  <button class="nav-btn" id="nav-boss" style="display:none" onclick="staffGoBoss()">\n'
                     '    <div class="nav-icon">👔</div><span data-en="Boss">老板账</span>\n'
                     '  </button>',
                     "底部导航加老板账入口＋请假入口")

    # 底部导航只留「明细」（「行程」是老板专用快捷入口，同事跟老板行程无关，
    # 2026-08-27 加按钮时一起排除，见 CLAUDE.md 跟记账 app 的连接那节）
    for nav_id, label in (("nav-overview", "概览"), ("nav-analytics", "统计"),
                          ("nav-settings", "设置"), ("nav-trips", "行程")):
        i = once(s, f'id="{nav_id}"', f"底部导航的{label}")
        start = s.rindex("<button", 0, i)
        end = s.index("</button>", i) + len("</button>")
        s = s[:start] + s[end:]

    # ---------- 2) 标题栏 ----------
    s = replace_once(s, '<div class="hdr-title">💰 记账本</div>',
                     '<div class="hdr-title" id="hdr-title">🧾 报账</div>', "标题文字")
    s = replace_once(s,
                     '<div style="display:flex;align-items:center;gap:10px">\n  <div id="hdr-cloud"',
                     '<div style="display:flex;align-items:center;gap:10px">\n'
                     '  <button id="staff-lang-btn" onclick="staffToggleLang()">EN</button>\n'
                     '  <div id="hdr-cloud"',
                     "标题栏右侧（放语言按钮）")
    s = replace_once(s, '<div class="acc-pill" onclick="openAccSwitch()">',
                     '<div class="acc-pill" id="hdr-acc-pill" onclick="openAccSwitch()">',
                     "账户按钮（要收起来，先给它一个 id）")

    # ---------- 3) 给要收起来的栏位加 id ----------
    # 「收入/支出切换」的 id 已经在源码里了（2026-08-08 起：老板 App 自己也要用它，
    # 见 syncCompanyTxFields() 把公司账户下这个切换整块藏起来），这里不用再注入。
    # 日期整组收起来（2026-08-18 用户要求）：同事补记时会往回选日期，账本里就冒出跟
    # 已结束那几天混在一起的记录（单号 57/58 就是这样来的）。一律跟当天走，省掉这个决定。
    s = replace_once(s, '<div class="form-group">\n      <label class="form-label">日期</label>',
                     '<div class="form-group" id="tx-date-group">\n      <label class="form-label">日期</label>',
                     "日期组")
    s = replace_once(s, '<div class="form-group">\n      <label class="form-label" id="tx-desc-label">',
                     '<div class="form-group" id="tx-desc-group">\n      <label class="form-label" id="tx-desc-label">',
                     "描述栏")
    s = replace_once(s, '<div class="form-group">\n        <label class="form-label">谁报的账</label>',
                     '<div class="form-group" id="tx-reporter-group">\n        <label class="form-label">谁报的账</label>',
                     "谁报的账")
    s = replace_once(s, '<div class="form-group">\n        <label class="form-label">单据号（留空自动派）</label>',
                     '<div class="form-group" id="tx-reftag-group">\n        <label class="form-label">单据号（留空自动派）</label>',
                     "单据号")
    s = replace_once(s, '<div class="filter-row">', '<div class="filter-row" id="tx-filter-row">',
                     "全部/支出/收入 筛选")

    # ---------- 4) 明细页上方的合计 + 下方的换钥匙 ----------
    s = replace_once(s, '<div class="tab" id="tab-transactions">',
                     '<div class="tab" id="tab-transactions">\n'
                     '  <a id="staff-install-tip" href="install.html">\n'
                     '    <b data-en="Not on your Home Screen yet — records can vanish">'
                     '还没装到主屏幕——记录可能会不见</b>\n'
                     '    <span data-en="A page opened in Safari gets its data cleared by iPhone on its own. '
                     'Once it sits on your Home Screen it is a real app and iOS leaves it alone.">'
                     '用 Safari 直接开的网页，iPhone 会自己清掉记录。装到主屏幕就是独立 App，系统不会动它。</span>\n'
                     '    <span class="go" data-en="→ How to install (1 min)">→ 怎么装（一分钟）</span>\n'
                     '  </a>\n'
                     '  <div id="staff-boss-note">\n'
                     '    <b data-en="This page goes straight to the Boss\'s own ledger">'
                     '这里记的账直接进老板自己的账本</b>\n'
                     '    <span data-en="Not a company expense claim — these do not go into the '
                     'month-end Excel and are not deducted from your cash on hand.">'
                     '不是公司报账——这里记的不会进月底的 Excel，也不会从你的备用金里扣。</span>\n'
                     '    <div id="staff-boss-queue"></div>\n'
                     '    <div id="staff-boss-cfg"></div>\n'
                     '  </div>\n'
                     '  <div id="staff-boss-cash"></div>\n'
                     '  <div id="staff-petty"></div>\n'
                     '  <div id="staff-summary"></div>',
                     "明细页（放本月合计）")
    s = replace_once(s, '<div id="tx-list" class="tx-list"></div>\n</div>',
                     '<div id="tx-list" class="tx-list"></div>\n'
                     '  <div id="staff-signout-row">\n'
                     '    <button class="btn btn-outline btn-sm" id="staff-restore-btn"\n'
                     '            data-en="Restore this month"\n'
                     '            onclick="staffRestore()">找回本月记录</button>\n'
                     '    <div id="staff-restore-note" data-en="Changed phone or cleared browser data? '
                     'Tap above to pull back the records you already reported.">'
                     '换手机、清过浏览器数据之后，按上面这个把已经报上去的记录拉回来</div>\n'
                     '    <button class="btn btn-outline btn-sm" data-en="Boss ledger key"\n'
                     '            onclick="staffSetBossKey()">老板账口令</button>\n'
                     '    <button class="btn btn-outline btn-sm" data-en="Sign out"\n'
                     '            onclick="staffSignOut()">换钥匙</button>\n'
                     '    <div id="staff-build-note"></div>\n'
                     '  </div>\n</div>',
                     "明细页（放换钥匙按钮）")

    # ---------- 5) 存储位全部换名（跟老板 App 分开，同一台手机上互不干扰）----------
    for old, new, n in STORAGE_KEYS:
        s = replace_n(s, old, new, f"存储位 {old}", n)

    # ---------- 5b) 同源的大件资源在上一层目录 ----------
    # opencv.js 和 tesseract 都刻意优先走**同源**文件（酒店/商家的白名单 WiFi 连不上
    # CDN，见源码里那两段注释）。同事版在 staff/ 子目录，路径不加 ../ 会 404，
    # 于是每次拍收据都退到 CDN——正好在最需要同源的那种网络里退掉了。
    for rel in RELATIVE_ASSETS:
        s = replace_once(s, f"'{rel}'", f"'../{rel}'", f"同源资源 {rel}")

    # ---------- 6) PWA：自己的 manifest 和 service worker ----------
    s = replace_once(s, '<link rel="manifest" href="expense-tracker.webmanifest">',
                     '<link rel="manifest" href="manifest.webmanifest">', "manifest 链接")
    s = replace_once(s, "navigator.serviceWorker.register('expense-tracker-sw.js')",
                     "navigator.serviceWorker.register('staff-sw.js')", "service worker")

    # ---------- 7) 启动流程 ----------
    s = replace_once(s, "  updateHeader();\n  renderOverview();\n  loadIBKR();",
                     "  updateHeader();\n"
                     "  // 同事版没有概览/统计/设置，直接进明细（生成时改的，见 tools/build-staff-page.py）\n"
                     "  switchTab('transactions');",
                     "init() 里的首屏")
    # 全员账本/备用金/待claim 都是老板专用的（服务端只认老板的钥匙），同事版连问都不该问
    s = cut_exact(s,
                  "\n\n  // 公司账本（全员）：开 App 时后台拉一次，首屏那张卡才有「今天」的数。\n"
                  "  // 不 await——拉不到就是卡上写一句「连不上」，不该拖住启动。\n"
                  "  fetchCompanyLedger().then(()=>{ if(state.currentTab==='overview'){ renderAccCards(); renderOvCompany(); renderOvReconcile(); } });\n"
                  "  fetchPetty().then(()=>{ if(state.currentTab==='overview'){ renderAccCards(); renderOvPetty(); renderOvReconcile(); } });\n"
                  "  fetchPendingClaim().then(()=>{ if(state.currentTab==='overview') renderOvReconcile(); });",
                  "启动时拉全员账本/备用金/待claim")
    s = cut_exact(s,
                  "      // 刚进账本的这笔也要算进首屏那张「今天」卡里，重拉一次\n"
                  "      if(r.ok) fetchCompanyLedger(ledMonthNow(), {force:true})"
                  ".then(()=>{ renderAccCards(); renderOvCompany(); renderOvReconcile(); });\n",
                  "入账后重拉全员账本")
    # 就地改完也一样要拿掉（2026-08-13）：同事版没有概览分页，renderOvCompany 找不到
    # 那几个元素会抛 "Cannot set properties of null"，把后面的渲染整串带断。
    s = cut_exact(s,
                  "  // 首屏那张「今天」卡和对账数字都来自公司账本，改完要重拉一次\n"
                  "  fetchCompanyLedger(ledMonthNow(), {force:true})"
                  ".then(()=>{ renderAccCards(); renderOvCompany(); renderOvReconcile(); });\n",
                  "就地改完重拉全员账本")

    # 云同步整个不接：同事版没有登录入口，留着 auth 监听只是白等
    s = replace_once(s,
                     "  // 云同步连不上时 auth 是 null（见顶部 FIREBASE 那段）。这里必须挡一下，\n"
                     "  // 否则 init() 会抛错，后面的启动步骤全都不会执行。\n"
                     "  if(!cloudAvailable) return;",
                     "  return;   // 同事版不接云同步（没有登录入口），公司账走 butler 那条路", "云同步")
    # 身份由钥匙决定：页面上没有「谁报的账」，这里也不许从 DOM 读
    s = replace_once(s, "    const reporter = document.getElementById('tx-company-reporter').value || 'Yang';",
                     "    // 身份由钥匙决定（服务端也以钥匙为准、忽略这个字段），页面上没得选也就选不错\n"
                     "    const reporter = staffIdentity ? staffIdentity.reporter : 'Boss';",
                     "报账人")

    # ---------- 8) 同事看得到的文案加英文 ----------
    for zh_html, en in STAFF_LABELS:
        s = replace_once(s, zh_html, add_en(zh_html, en), f"文案「{en}」")
    for old, new, what in LABEL_REWRITES:
        s = replace_once(s, old, new, what)
    # 日期一律用当天：栏位收起来只是看不到，AI 认收据照样会把票面日期写进去，
    # 不堵这一行等于没关（隐藏 ≠ 不生效，跟备注那次是同一个坑）。
    s = replace_once(s,
                     "    date: document.getElementById('tx-date').value || today(),",
                     "    date: today(),   // 同事版一律记当天（生成时改的，见 tools/build-staff-page.py）",
                     "日期一律当天")

    for entry in DYNAMIC_TEXT:
        old_js, new_js, what = entry[0], entry[1], entry[2]
        n = entry[3] if len(entry) > 3 else 1
        s = replace_n(s, old_js, new_js, what, n)

    # ---------- 8.5) 公司账不留备注（2026-08-13 用户要求）----------
    # 描述栏在公司账那边本来就用 CSS 收起来了，但 AI 认收据会把商户名填进去——同事看不到，
    # 它却跟着送进公司账本、印在 Excel 的 DETAILS 上。所以两头都要堵：不填、也不送。
    # 老板账（body.staff-boss）那边描述栏是露出来的，照旧填、照旧存。
    s = replace_once(s,
                     "    if(descEl && descEl.value.trim()==='' && parsed.merchant){",
                     "    if(descEl && document.body.classList.contains('staff-boss')\n"
                     "       && descEl.value.trim()==='' && parsed.merchant){",
                     "AI 识别不填商户名进描述")
    s = replace_once(s,
                     "      note: description || null,",
                     "      // 公司账不留备注（生成时改的，见 tools/build-staff-page.py）——\n"
                     "      // 描述栏对同事是收起来的，送过去只会变成 Excel 上一段没人认领的字\n"
                     "      note: null,",
                     "公司账不送备注")
    # 改已送出那笔的路径也一样（editSentCompanyTx 里那个 payload，缩排 4 格）：
    # 不堵的话，编辑一笔旧的带备注记录会把旧备注原样再送一次
    s = replace_once(s,
                     "    note: description || null,",
                     "    note: null,   // 公司账不留备注（生成时改的）",
                     "改已送出那笔也不送备注")

    # ---------- 9) 注入同事版的引导逻辑 ----------
    s = replace_once(s, "init();\nrefreshCompanyCategories();\nflushCompanyQueue();",
                     STAFF_BOOTSTRAP + "\ninitStaffPage();", "启动区块")

    # ---------- 10) 闸门的 DOM/样式 + 文件头说明 ----------
    s = replace_once(s, "<title>记账本</title>", "<title>报账 · Expense Report</title>", "标题")
    s = replace_once(s, "<body>\n", "<body>\n" + STAFF_GATE_HTML, "闸门 DOM")
    s = replace_once(s, "</style>", STAFF_CSS + "\n</style>", "同事版样式")
    s = replace_once(s, "<!DOCTYPE html>", BANNER + "<!DOCTYPE html>", "文件头说明")
    return s


# 同事版自己的存储位。两个页面同源，共用存储位的话老板在自己手机上打开同事版
# 会读到、甚至覆盖掉他自己的账本（staffStart() 会重设 data.accounts）。
STORAGE_KEYS = [
    # 4 处：loadData / saveData / 云端合并 / 存完读回确认（verifyTxPersisted）
    ("'expenseTracker_v2'",              "'staffExpense_v2'",         4),
    ("'expenseTrackerFiles'",            "'staffExpenseFiles'",       1),
    ("'expenseTracker_companyToken'",    "'staffExpense_token'",      1),
    ("'expenseTracker_companyReporter'", "'staffExpense_reporter'",   1),
    ("'expenseTracker_companyQueue'",    "'staffExpense_queue'",      1),
    ("'expenseTracker_companyCats'",     "'staffExpense_cats'",       1),
    ("'expenseTracker_aiProvider'",      "'staffExpense_aiProvider'", 1),
    ("'expenseTracker_aiKey_'",          "'staffExpense_aiKey_'",     1),
    ("'expenseTracker_geminiKey'",       "'staffExpense_geminiKey'",  1),
]

# 页面用相对路径引的同源大件（收据识别用的 opencv / tesseract）。
# 同事版在 staff/ 子目录，这些都要往上一层找。
RELATIVE_ASSETS = [
    "expense-tracker-opencv.js",
    "vendor/tesseract/tesseract.min.js",
    "vendor/tesseract/worker.min.js",
    "vendor/tesseract/",
    "vendor/tesseract/lang",
]

# 同事版会看到的固定文案（左边必须跟 expense-tracker.html 里的一字不差）
STAFF_LABELS = [
    ('<label class="form-label">单据照片（选填）</label>', "Receipt photo (optional)"),
    ('<label class="form-label">日期</label>', "Date"),
    ('<label class="form-label">公司类别</label>', "Category"),
    ('<label class="form-label">这一餐算谁的</label>', "Who was this meal for?"),
    ('<span style="flex:1">👀 这个数是从照片认出来的，请跟收据核对一遍</span>',
     "👀 This amount was read from the photo — check it against the receipt"),
    ('<button type="button" class="btn btn-sm" id="tx-amount-ok" onclick="confirmAmount()"\n'
     '          style="flex:none;width:auto;padding:4px 12px;background:#e67e22;color:#fff">对的</button>',
     "It&#39;s right"),
    # 「自己吃」这个标签在页面跑起来后会被 syncCompanyWhoseLabels 改写成「XX 自己吃」
    # （XX = 登入的那个人），这里的静态 data-en 只是它被改写之前的样子
    ('<div class="type-tab active" id="whose-self" onclick="setCompanyWhose(\'self\')">自己吃</div>',
     "I ate it"),
    ('<div class="type-tab" id="whose-boss" onclick="setCompanyWhose(\'boss\')">老板吃</div>',
     "The Boss ate it"),
    ('<button class="btn btn-primary" id="tx-save-btn" onclick="saveTx()">保存</button>', "Save"),
    # add_en 把 data-en 加在这段的第一个 '>' 上，也就是 div 的开标签末尾——所以锚点
    # 必须从 <div 开始带上（开标签因为 style 太长断成了两行）
    ('<div id="tx-sent-lock" style="display:none;padding:10px 12px;background:rgba(230,126,34,.12);\n'
     '      border-radius:10px;margin-bottom:14px;font-size:12px;color:#e67e22;line-height:1.6">\n'
     '      ✏️ 这笔已经报进公司账本了。改<b>金额、类别、描述、车牌</b>会一起改掉公司账本那边；\n'
     '      <b>日期、报账人、单号</b>不能改——要改那三样请删掉重记。',
     "✏️ This one is already filed to the company ledger. Changing the amount, category, "
     "description or plate number updates the company ledger too. The date, reporter and "
     "bill number cannot be changed — to change those, delete it and enter it again."),
    ('<button class="btn btn-danger" onclick="deleteTx()">🗑 删除此记录</button>', "🗑 Delete this record"),
    # ⚠️ 这两个不能走 add_en：按钮里是「emoji span + 文字」两段，add_en 会把 data-en
    # 加到 **emoji 那个 span** 上（它找的是第一个 '>'），切英文时 📷 被换成 "Camera"、
    # 中文「拍照」原样留着，按钮变成「Camera拍照」而且图标没了（2026-08-08 扫出来的，
    # 已经上线过一版）。所以这里整段换掉，让文字自己住一个 span。
    ('<div style="padding:10px 12px;background:var(--p2);border-radius:10px;margin-bottom:14px;\n'
     '        font-size:12px;color:var(--p);line-height:1.6">\n'
     '        🧾 这是公司账户，保存后会同时送进公司账本 —— 跟 Telegram 记的进同一本、出同一份 Excel。',
     "🧾 This is the company account. Saving also files it to the company ledger — "
     "the same ledger and the same Excel as records entered in Telegram."),
]

# 整段替换的文案（结构要动，不只是加个 data-en）
LABEL_REWRITES = [
    ('<span style="font-size:20px">📷</span>拍照',
     '<span style="font-size:20px">📷</span><span data-en="Camera">拍照</span>',
     "拍照按钮"),
    ('<span style="font-size:20px">🖼️</span>从相册选择',
     '<span style="font-size:20px">🖼️</span><span data-en="Gallery">从相册选择</span>',
     "相册按钮"),
    ('<div class="nav-icon">📋</div>明细',
     '<div class="nav-icon">📋</div><span data-en="Records">明细</span>',
     "底部导航"),
    # 库存入口同事也看得到，切英文时不加这条会剩一个中文「库存」挂在导航上
    # （check-staff-page.mjs【14b】会当场抓到）。
    # ⚠️ 文字必须自己住一个 span：add_en 那条路会把 data-en 加到 emoji 那个 div 上，
    # 切英文时图标被换成文字、中文原样留着（2026-08-08 踩过，见上面拍照按钮那条）。
    ('<div class="nav-icon">📦</div>库存',
     '<div class="nav-icon">📦</div><span data-en="Stock">库存</span>',
     "底部导航（库存）"),
    # 「这一餐算谁的」的说明：老板 App 那边讲的是「报账人」（他能替别人记账），
    # 同事版没有那个下拉、报账人永远是他自己，照抄过来会看不懂，所以整段换成他的口径。
    ('          买给老板的餐选「老板吃」，这笔算公司的，进 Excel 左边 Boss 表；\n'
     '          选「自己吃」的话，报账人自己的正餐进右边那张表、算他自己头上。',
     '          <span data-en="Buying a meal for the Boss? Pick &quot;The Boss ate it&quot; — it goes on the '
     'company\'s side. Your own meal stays on yours.">'
     '买给老板吃的那餐选「老板吃」，算公司的账；你自己吃的选「自己吃」，算你的。</span>',
     "这一餐算谁的 说明"),
]

# 脚本画出来的文字：包一层 tt() 才会跟着语言切换
DYNAMIC_TEXT = [
    ("""if(t.company.refTag) parts.push(`📄${t.company.refTag}号`);""",
     """if(t.company.refTag) parts.push(tt(`📄${t.company.refTag}号`, `📄 No.${t.company.refTag}`));""",
     "单号标注"),
    ("""  if(t.company.forBoss) parts.push('👔老板的');""",
     """  if(t.company.forBoss) parts.push(tt('👔老板的','👔 for the Boss'));""",
     "老板的餐标注"),
    ("""  if(st === 'pending') parts.push('⏳待送出');
  else if(st === 'failed') parts.push('⚠️未入账');""",
     """  if(st === 'pending') parts.push(tt('⏳待送出','⏳ not sent yet'));
  else if(st === 'failed') parts.push(tt('⚠️未入账','⚠️ not recorded'));""",
     "送出状态"),
    # 每天一行小计：同事每天要在纸单上抄当天合计，这个数就是他要抄的那个
    ("""      <div class="tx-group-date">${date}</div>""",
     """      <div class="tx-group-date staff-day">${date}<span class="staff-day-total">${
        fmt(list.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0), acc.currency)}</span></div>""",
     "每天小计"),
    # 月份栏「2026 年 8 月」：renderTxList() 每次都重画它，而 staffApplyLang() 会
    # 重跑 renderTxList，所以只要 monthName 自己会说两种话，切语言就跟着变。
    ("""function monthName(year, month){
  return `${year} 年 ${month+1} 月`;
}""",
     """function monthName(year, month){
  const EN = ['January','February','March','April','May','June',
              'July','August','September','October','November','December'];
  return tt(`${year} 年 ${month+1} 月`, `${EN[month]} ${year}`);
}""",
     "月份栏"),
    # 空清单那句「为什么空」是给老板 App 讲云同步的（没登录 Google / 登错帐号）。
    # 同事版没有登录入口、帐也不走云同步，照抄过去会叫他去登录一个根本不存在的东西。
    ("""function emptyListCloudHint(){""",
     """function emptyListCloudHint(){
  // 同事版不接云同步，没有「没登录所以看不到」这回事（生成时改的，见 tools/build-staff-page.py）
  return '';
  // eslint-disable-next-line no-unreachable""",
     "空清单的云同步提示"),
    ("""<div class="empty-text">这个月还没有记录</div>""",
     """<div class="empty-text">${tt('这个月还没有记录','Nothing recorded this month')}</div>""",
     "空清单"),
    ("""        const no = rec0.refTag ? `\\n📄 单据写 ${rec0.refTag} 号` : '';
        toast(`✅ 已入账 ${side}${no}`);""",
     """        const no = rec0.refTag
          ? tt(`\\n📄 单据写 ${rec0.refTag} 号`, `\\n📄 Write No. ${rec0.refTag} on the receipt`)
          : '';
        toast(tt(`✅ 已入账 ${side}${no}`, `✅ Recorded ${side}${no}`));""",
     "入账提示"),
    # 同事没有 Telegram 那条路，改口说 App 里能做的那件事
    ("""    toast('本机已改。公司账本那边改不了——要更正请在 Telegram 里删掉这笔重记');""",
     """    toast(tt('已经送出去的改不了——请把这笔删掉，重记一次',
             'Already submitted — delete this record and enter it again'));""",
     "已送出的改不了"),
    ("""toast('请输入金额（可以填 0）');""",
     """toast(tt('请输入金额（可以填 0）','Please enter an amount (0 is fine)'));""",
     "金额提示", 2),
    ("""if(!categoryEn){ toast('请选择公司类别'); return; }""",
     """if(!categoryEn){ toast(tt('请选择公司类别','Please choose a category')); return; }""",
     "类别提示", 2),
    # 2026-08-13：原本这里是「已报上去的改不了」那句提示，现在改成走 edit 就地改，
    # 那句提示已不存在，换成翻译新路径（editSentCompanyTx / postCompanyEdit）的提示语。
    ("""  if(same){ toast('没有改动'); closeModal('modal-add-tx'); return; }""",
     """  if(same){ toast(tt('没有改动','Nothing changed')); closeModal('modal-add-tx'); return; }""",
     "没有改动"),
    ("""    toast('这笔是旧版本记的，没存下公司账本里的记录编号，改不了那边——请删掉重记');""",
     """    toast(tt('这笔是旧版本记的，没存下公司账本里的记录编号，改不了那边——请删掉重记',
             'This one was filed by an older version with no ledger record id — delete it and enter it again'));""",
     "旧版本没有记录编号"),
    ("""  toast('正在改公司账本那条…');""",
     """  toast(tt('正在改公司账本那条…','Updating the company ledger…'));""",
     "正在改"),
    ("""  if(!r.ok){ showSaveNote(`公司账本那条没改成：${r.message}`); toast('没改成，看保存按钮上方那行字'); return; }""",
     """  if(!r.ok){ showSaveNote(tt(`公司账本那条没改成：${r.message}`,`Could not update the company ledger: ${r.message}`));
    toast(tt('没改成，看保存按钮上方那行字','Update failed — see the line above the Save button')); return; }""",
     "改失败提示"),
    ("""  const side = (r.record && r.record.person) ? `，算 ${r.record.person} 头上` : '';
  toast(`✅ 公司账本已改${side}`);""",
     """  const side = (r.record && r.record.person) ? tt(`，算 ${r.record.person} 头上`,` — filed under ${r.record.person}`) : '';
  toast(tt(`✅ 公司账本已改${side}`,`✅ Company ledger updated${side}`));""",
     "改成功提示"),
    ("""  if(!token) return {ok:false, message:'还没填公司报账密钥（设置 → 公司报账）'};""",
     """  if(!token) return {ok:false, message:tt('还没填公司报账密钥（设置 → 公司报账）','No company key set (Settings → Company)')};""",
     "改：没有密钥"),
    ("""    return {ok:false, message:'现在连不上，公司账本那条没改成——等有网再试'};""",
     """    return {ok:false, message:tt('现在连不上，公司账本那条没改成——等有网再试','No connection — the company ledger was not updated, try again when back online')};""",
     "改：连不上"),
    ("""  return {ok:false, message: body.message || body.error || `改不了（${res.status}）`};""",
     """  return {ok:false, message: body.message || body.error || tt(`改不了（${res.status}）`,`Could not update (${res.status})`)};""",
     "改：服务端错误"),
    ("""    showSaveNote('这个金额是从照片认出来的——请跟收据核对一遍，再按上面那个「对的」');
    toast('请先核对金额，看保存按钮上方那行字');""",
     """    showSaveNote(tt('这个金额是从照片认出来的——请跟收据核对一遍，再按上面那个「对的」',
                    'This amount was read from the photo — check it against the receipt, then tap the button'));
    toast(tt('请先核对金额，看保存按钮上方那行字','Please check the amount — see the line above the Save button'));""",
     "金额待核对提示"),
    ("""    toast('记录已保存');""",
     """    toast(tt('记录已保存','Saved'));""",
     "保存提示"),
    # 删除有两条路（弹窗里的删除键、列表左滑），两处都要翻
    ("""  closeModal('modal-add-tx');
  toast('已删除记录');""",
     """  closeModal('modal-add-tx');
  toast(tt('已删除记录','Deleted'));""",
     "删除提示（弹窗）"),
    ("""  if(attachmentId) deleteAttachmentBlob(attachmentId);
  toast('已删除记录');""",
     """  if(attachmentId) deleteAttachmentBlob(attachmentId);
  toast(tt('已删除记录','Deleted'));""",
     "删除提示（左滑）"),
    # 填错的时候才会看到的三句——刚好是同事最需要看懂的那三句（2026-08-19 补）。
    # 这三句在「新增」和「改已送出那笔」两条路里各有一份，缩排不一样（4 空格那份是
    # 6 空格那份的子串），所以不能用同一个锚点配 n=2，得连着上一行各自锚一次。
    ("""    showSaveNote(`金额看不懂：「${amt0.shown}」——请只填数字，小数点用「.」（例：5.45）`);
    toast('金额格式不对，看保存按钮上方那行字');
    return;""",
     """    showSaveNote(tt(`金额看不懂：「${amt0.shown}」——请只填数字，小数点用「.」（例：5.45）`,
                    `Amount not understood: “${amt0.shown}” — digits only, use “.” for decimals (e.g. 5.45)`));
    toast(tt('金额格式不对，看保存按钮上方那行字','Bad amount — see the line above the Save button'));
    return;""",
     "金额看不懂（新增）"),
    ("""    showSaveNote(`金额看不懂：「${amt0.shown}」——请只填数字，小数点用「.」（例：5.45）`);
    toast('金额格式不对，看保存按钮上方那行字'); return;""",
     """    showSaveNote(tt(`金额看不懂：「${amt0.shown}」——请只填数字，小数点用「.」（例：5.45）`,
                    `Amount not understood: “${amt0.shown}” — digits only, use “.” for decimals (e.g. 5.45)`));
    toast(tt('金额格式不对，看保存按钮上方那行字','Bad amount — see the line above the Save button')); return;""",
     "金额看不懂（改已送出）"),
    ("""      toast('收据编号只能是 1~2 位数字（例：1、12）'); return;""",
     """      toast(tt('收据编号只能是 1~2 位数字（例：1、12）',
               'Receipt number must be 1–2 digits (e.g. 1, 12)')); return;""",
     "收据编号格式"),
]


BANNER = """<!-- ⚠️ 这个文件是**生成**的，不要手改 ⚠️
     源码是 ../expense-tracker.html，生成器是 tools/build-staff-page.py。
     手改这里的话，下次跑生成器就被覆盖掉了；CI 也会因为「产出跟源码对不上」而报红。
     要改同事版：改 expense-tracker.html（两边共用的部分）或改生成器（同事版专属的部分），
     然后跑 `python3 tools/build-staff-page.py`。

     为什么是生成而不是手写第二份：手写过一份，结果连撞三个 App 早就解决过的问题
     （中文乱码、只能开相机、照片不压缩导致 4G 传不上去）。为什么不在同一个文件里
     用 ?staff=1 切换：同事只要把参数去掉就能看到老板 App 的完整界面。
     生成这条路两个问题都没有——个人账本那些区块根本不在这个文件里。 -->
"""

STAFF_CSS = """
/* ===== 同事版（生成时注入，见 tools/build-staff-page.py）===== */
/* 这几个栏位共用的脚本会去读，删掉会让记账当场抛错，所以留在 DOM 里收起来。
   真正属于个人账本的整块界面（概览/统计/设置/账户切换）是**根本没生成进来**，
   不在这张单子上。 */
#hdr-cloud, #hdr-acc-pill, #tx-reporter-group, #tx-reftag-group,
#tx-date-group{display:none !important}
/* 下面这几个只在**公司账**那边收起来。老板账那边它们就是普通的记账栏位，要留着用
   （描述、收入/支出、瑞尔换算、筛选）——所以用 body.staff-boss 分开，而不是写两套。 */
body:not(.staff-boss) #tx-type-tabs,
body:not(.staff-boss) #tx-riel-toggle,
body:not(.staff-boss) #tx-desc-group,
body:not(.staff-boss) #tx-filter-row{display:none !important}
/* 反过来，公司账专属的东西在老板账那边不该出现：备用金卡是公司给的现金、
   本月合计算的是公司账、「找回本月记录」是从公司账本拉的——摆在老板账页面上
   全都是错的数。 */
body.staff-boss #staff-petty,
body.staff-boss #staff-summary,
body.staff-boss #staff-restore-btn,
body.staff-boss #staff-restore-note{display:none !important}
/* 老板账页面顶上那条说明：这两个页面记的账去处完全不同，走错一个是要翻账查的，
   所以每次都写在脸上，不做成「点一下才看得到」。 */
#staff-boss-note{display:none;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:14px;
  padding:12px 14px;margin-bottom:12px;color:#4c1d95;font-size:13.5px;line-height:1.55}
body.staff-boss #staff-boss-note{display:block}
#staff-boss-note b{display:block;font-size:14.5px;margin-bottom:2px}
#staff-boss-queue{margin-top:8px;font-weight:600}
/* 这本账用什么钱：出门带的是现金，币种由老板当场决定，所以做成一行可点的设定，
   不是写死。写死成 USD 的话，日元账目会显示成「US$8000」——差两个数量级，
   同事会以为自己多打了个零。 */
#staff-boss-cfg{margin-top:8px;font-size:12.5px;opacity:.9}
#staff-boss-cfg span{cursor:pointer;text-decoration:underline;font-weight:600}
/* 老板账的 nav 图标用不同颜色：两个入口长得太像会记错地方 */
#nav-boss.active{color:#7c3aed}
/* 手上现金卡：老板给了多少现金、花掉之后还剩多少。
   跟公司账那张 #staff-petty 是**两套东西**——那张的数由 butler 服务端算，这张
   老板账没有服务端，只能本机自己算（起点由同事自己录，花掉的从本机账目减）。
   所以不共用样式类，免得哪天改一边动到另一边。 */
#staff-boss-cash{display:none;background:linear-gradient(135deg,#6d28d9,#4c1d95);color:#fff;
  border-radius:14px;padding:16px;margin-bottom:12px}
body.staff-boss #staff-boss-cash{display:block}
#staff-boss-cash.low{background:linear-gradient(135deg,#b45309,#92400e)}
.bcash-label{font-size:12px;opacity:.85}
.bcash-total{font-size:28px;font-weight:700;margin-top:2px;letter-spacing:.5px}
.bcash-sub{font-size:12px;opacity:.85;margin-top:6px;line-height:1.6}
.bcash-warn{margin-top:10px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.18);
  font-size:13px;font-weight:600}
.bcash-btns{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
.bcash-btn{background:rgba(255,255,255,.2);color:#fff;border:0;border-radius:999px;
  padding:7px 14px;font-size:13px;font-family:inherit;font-weight:600;cursor:pointer}
.bcash-list{margin-top:10px;border-top:1px solid rgba(255,255,255,.25);padding-top:8px}
.bcash-line{display:flex;justify-content:space-between;font-size:12.5px;opacity:.92;padding:2px 0}

#staff-gate{position:fixed;inset:0;z-index:300;background:var(--bg);
  display:flex;flex-direction:column;justify-content:center;padding:24px}
#staff-gate.off{display:none}
#staff-gate h2{margin:0 0 8px;font-size:20px;color:var(--text)}
#staff-gate p{color:var(--sub);font-size:14px;margin:0 0 18px;line-height:1.6}
#staff-gate-msg{margin-top:14px;font-size:14px;color:var(--exp);min-height:20px}
#staff-gate-build{margin-top:auto;padding-top:20px;text-align:center;font-size:11px;color:var(--sub)}
#staff-lang-btn{background:rgba(255,255,255,.22);color:#fff;border:0;border-radius:999px;
  padding:6px 12px;font-size:13px;font-family:inherit;cursor:pointer}
#staff-signout-row{text-align:center;margin:18px 0 4px}
#staff-restore-note{margin:8px 0 16px;font-size:11px;color:var(--sub);line-height:1.6}
/* 版本号：同事回报问题时第一句要问的就是「你手上是哪一版」 */
#staff-build-note{margin-top:8px;font-size:11px;color:var(--sub)}
/* 「还在浏览器里」的提示条：只在**没装到主屏幕**时出现，装好当天就自己消失。
   写得像广告没人点，所以话讲直接：不装记录会不见（2026-08-07 Seryi 实机踩过，
   iOS 会自行清掉 Safari 里的站点数据）。做成一整条可点，手机上不用瞄准小链接。 */
#staff-install-tip{display:none;background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;
  padding:12px 14px;margin-bottom:12px;color:#7c2d12;font-size:13.5px;line-height:1.55;
  text-decoration:none;cursor:pointer}
#staff-install-tip.on{display:block}
#staff-install-tip b{display:block;color:#9a3412;font-size:14.5px;margin-bottom:2px}
#staff-install-tip .go{display:inline-block;margin-top:6px;color:#9a3412;font-weight:700}
/* 车牌那几类的输入框是 text-transform:uppercase（车牌本来就写大写，司机名字不是，
   由 syncCompanyPlateField 按类别设），但提示字会跟着被拉成大写——中文「例：NS6868」
   看不出来，英文「e.g. NS6868」变成「E.G. NS6868」，像在喊。提示字不是用户输入的
   内容，不该跟着变形。 */
#tx-company-plate::placeholder{text-transform:none}
/* 备用金卡：老板给的那笔现金还剩多少。没设起点时整张不出现（见 staffLoadPetty）。 */
#staff-petty{display:none;background:linear-gradient(135deg,#0f766e,#115e59);color:#fff;
  border-radius:14px;padding:16px;margin-bottom:12px}
#staff-petty.on{display:block}
.petty-label{font-size:12px;opacity:.85}
.petty-total{font-size:28px;font-weight:700;margin-top:2px;letter-spacing:.5px}
.petty-sub{font-size:12px;opacity:.85;margin-top:6px;line-height:1.6}
/* 见底了要看得出来——这张卡平时是背景板，只有这一刻需要他去开口要钱 */
#staff-petty.low{background:linear-gradient(135deg,#b45309,#92400e)}
.petty-warn{margin-top:10px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.18);
  font-size:13px;font-weight:600}
.petty-list{margin-top:10px;border-top:1px solid rgba(255,255,255,.25);padding-top:8px}
/* 刻意不叫 .petty-row：老板 App 的共用样式里已经有一个同名的（带下边框、
   字号也不同），同名会被它套上去。生成出来的页面两套 CSS 住同一个文件，
   新增类名前先在源码里搜一遍。 */
.petty-line{display:flex;justify-content:space-between;font-size:12.5px;opacity:.92;padding:2px 0}
#staff-summary{background:var(--card);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.staff-sum-label{font-size:12px;color:var(--sub)}
.staff-sum-total{font-size:26px;font-weight:700;color:var(--text);margin-top:2px}
/* 本月合计小一号：每天真正要抄的是「今天」那个数，别让两个大数字打架 */
.staff-sum-month{font-size:20px}
.staff-sum-divider{height:1px;background:var(--border);margin:12px 0}
.staff-sum-sub{font-size:12px;color:var(--sub);margin-top:6px}
/* 缺收据要显眼——月底纸质单据对不上是要花时间查的 */
.staff-sum-warn{margin-top:10px;padding:8px 10px;border-radius:8px;
  background:rgba(239,68,68,.12);color:var(--exp);font-size:13px;font-weight:600}
/* 每天一行小计：同事每天要在纸单上抄当天合计，这个数就是他要抄的那个 */
.staff-day{display:flex;align-items:baseline;justify-content:space-between}
.staff-day-total{font-size:14px;font-weight:700;color:var(--text)}"""

STAFF_GATE_HTML = """
<!-- 钥匙闸门：默认就盖着（不是等脚本跑完才弹），认出身份后才拿掉 -->
<div id="staff-gate">
  <h2>🧾 报账 Expense Report</h2>
  <p>填一次钥匙就好，之后这个手机会记住。<br>
     Enter your key once — this phone will remember it.</p>
  <input class="form-input" id="staff-gate-key" type="password" autocomplete="off"
         placeholder="••••••••••" style="margin-bottom:14px">
  <button class="btn btn-primary" onclick="staffGateSubmit()" id="staff-gate-btn">确定 / Save</button>
  <div id="staff-gate-msg"></div>
  <div id="staff-gate-build"></div>
</div>
"""

STAFF_BOOTSTRAP = """
/* ===================== 同事版引导 =====================
 * 这一段是生成时注入的（tools/build-staff-page.py），源码 App 里没有。
 *
 * 身份由**钥匙**决定：填完钥匙问服务端「我是谁」，服务端回 reporter。
 * 页面上没有选人的地方，所以同事不可能把账记到别人头上；服务端那边也一样
 * 以钥匙为准、忽略请求里写的 reporter（见 butler-bot 的 resolveAppCaller）。
 */
const STAFF_TOKEN_STORAGE = COMPANY_TOKEN_STORAGE;
const STAFF_IDENTITY_STORAGE = 'staffExpense_identity';
let staffIdentity = null;

async function staffWhoAmI(token){
  try{
    const res = await fetch(COMPANY_EXPENSE_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'mine', token })
    });
    if(!res.ok) return { error: res.status === 401 ? 'bad-key' : 'server' };
    const b = await res.json();
    return (b && b.status === 'ok') ? { reporter: b.reporter } : { error:'server' };
  }catch(e){ return { error:'offline' }; }
}

function staffOpenGate(){
  const b = document.getElementById('staff-gate-build');
  // 闸门在语言切换按钮之前出现（那时还没进主界面），所以这里用两种语言都读得懂的
  // 写法，不走 data-en
  if(b) b.textContent = 'v ' + APP_BUILD;
  document.getElementById('staff-gate').classList.remove('off');
}
function staffCloseGate(){ document.getElementById('staff-gate').classList.add('off'); }

async function staffGateSubmit(){
  const input = document.getElementById('staff-gate-key');
  const msg = document.getElementById('staff-gate-msg');
  const btn = document.getElementById('staff-gate-btn');
  const v = (input.value || '').trim();
  if(!v){ msg.textContent = '请先填钥匙 / Please enter your key'; return; }
  btn.disabled = true; msg.textContent = '';
  const who = await staffWhoAmI(v);
  btn.disabled = false;
  if(who.error === 'bad-key'){ msg.textContent = '钥匙不对，请核对后重填 / Wrong key'; return; }
  if(who.error){ msg.textContent = '连不上服务器，稍后再试 / Cannot reach server'; return; }
  localStorage.setItem(STAFF_TOKEN_STORAGE, v);
  localStorage.setItem(STAFF_IDENTITY_STORAGE, JSON.stringify(who));
  staffIdentity = who;
  input.value = '';
  staffCloseGate();
  staffStart();
}

/**
 * 从公司账本把「我这个月已经报上去的」拉回本机清单。
 *
 * 为什么要有（2026-08-07 用户要求：「怕他们没加」）：这台手机上的清单只是本地副本——
 * 换手机、清浏览器数据、iPhone 上七天没打开被 Safari 清掉，清单就空了。钱没丢
 * （服务端有整本账），但同事看不到自己报过什么，也没法照着抄纸单上的合计。
 * 按一下就把服务端那份拉回来。
 *
 * 三条不能破的规矩：
 * 1. 拉回来的每一笔 status 一律标 'sent'。标别的（例如 'pending'）不会当场重送，
 *    但同事一编辑那笔，saveTx 就会把它当成还没报过、真的送一次——butler 那边是
 *    追加不是覆盖，公司账本里于是多一条重复记录，金额直接翻倍。
 * 2. 靠 recordId 去重，按次数多按几下不会变出重复的记录。
 * 3. 只拉「我记的」（服务端按钥匙筛，同事之间互相看不到），这条守在服务端。
 *
 * 只拉当月：同事平时要对的就是这个月的合计；跨月对账是老板那边整本账的活。
 */
async function staffRestore(opts){
  // silent：开页面时自动补的那一次，没东西可补就一声不吭（别每次开页面都弹提示）
  const silent = !!(opts && opts.silent);
  const btn = document.getElementById('staff-restore-btn');
  const token = (localStorage.getItem(STAFF_TOKEN_STORAGE) || '').trim();
  if(!token){ if(!silent) toast(tt('还没填钥匙','No key yet')); return; }
  if(btn) btn.disabled = true;
  if(!silent) toast(tt('正在从公司账本找回…','Fetching from the company ledger…'));
  let body;
  try{
    const res = await fetch(COMPANY_EXPENSE_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'mine', token, month: today().slice(0,7) })
    });
    body = await res.json();
    if(!res.ok || !body || body.status !== 'ok') throw new Error('bad');
  }catch(e){
    if(btn) btn.disabled = false;
    if(!silent) toast(tt('现在连不上，等有网再按一次','Cannot reach the server — try again when online'));
    return;
  }

  const acc = (data.accounts || []).find(a => a.isCompany) || data.accounts[0];
  const have = new Set(data.transactions
    .filter(t => t.company && t.company.recordId).map(t => t.company.recordId));
  let added = 0;
  for(const r of (body.records || [])){
    if(!r || !r.id || have.has(r.id)) continue;
    data.transactions.push({
      id: uid(),
      accountId: acc.id,
      amount: Number(r.amountUsd) || 0,
      type: 'expense',
      // 车牌类项目服务端存成 "Petrol (2AB-1234)"，去掉括号那截才对得上 App 的类别表
      categoryId: COMPANY_CAT_TO_APP[r.categoryEn]
        || COMPANY_CAT_TO_APP[String(r.categoryEn || '').replace(/\s*\(.*\)$/, '')]
        || 'cat_other_exp',
      description: r.note || '',
      date: r.date,
      updatedAt: Date.now(),
      company: {
        reporter: body.reporter,
        categoryEn: r.categoryEn,
        refTag: r.billNo || null,
        plate: null,
        rawAmount: Number(r.amountUsd) || 0,
        rawCurrency: 'USD',
        note: r.note || null,
        // side 是服务端算的「进 Excel 左边还是右边」，拉回来只用于显示
        person: r.side === 'assist' ? body.reporter : 'Boss',
        status: 'sent',          // ← 见上面第 1 条，改这里会导致重复记账
        recordId: r.id,
        error: null,
      },
    });
    added++;
  }
  saveData();
  renderTxList();
  if(btn) btn.disabled = false;
  if(added || !silent){
    toast(added
      ? tt(`找回 ${added} 笔`, `Restored ${added} record(s)`)
      : tt('都在了，没有要找回的','Everything is already here'));
  }
}

function staffSignOut(){
  if(!confirm('要清掉这台手机上的钥匙吗？之后要重新填。\\nRemove the key from this phone?')) return;
  localStorage.removeItem(STAFF_TOKEN_STORAGE);
  localStorage.removeItem(STAFF_IDENTITY_STORAGE);
  location.reload();
}

/** 认出身份之后才真正启动 App。 */
function staffStart(){
  const title = document.getElementById('hdr-title');
  if(title) title.textContent = '🧾 ' + staffIdentity.reporter;
  // 版本号写在页面底部：同事回报问题时，第一件要确认的就是他手上是不是最新那一版
  const bn = document.getElementById('staff-build-note');
  if(bn) bn.textContent = staffIdentity.reporter + ' · ' + APP_BUILD;
  // ⚠️ 必须先 loadData()，再动 data、再 saveData()。
  // 这一行漏掉的话（2026-08-07 上线当天就踩到）：此刻的 data 还是脚本顶上的默认空对象，
  // init() 里的 loadData() 要到下面才跑；先 saveData() 等于拿一个空账本盖掉本机存的记录，
  // 于是「每刷新一次，之前记的全没了」。已经送进公司账本的钱不会丢，但离线待补送的会。
  loadData();
  // 同事只有公司账：没有就建一个并选中，省得他去设置里摸索（这个版本也没有设置页）
  let acc = (data.accounts || []).find(a => a.isCompany);
  if(!acc){
    acc = { id:'acc'+Date.now(), name:'公司报账', currency:'USD', color:'#0f766e',
            isCompany:true, createdAt:Date.now() };
  }
  // 拿到老板账口令的人多一个「老板账」账户；没拿到的跟以前一模一样，只有公司报账这一个。
  data.accounts = staffBossOn()
    ? [acc, staffBossAcc()]
    : [acc];
  // 上次停在哪个账户就还在哪个（刷新一次被弹回公司账，记到一半会记错地方）
  if(!data.accounts.some(a => a.id === data.currentAccountId)) data.currentAccountId = acc.id;
  saveData();
  init();
  refreshCompanyCategories();
  flushCompanyQueue();
  staffSyncMode();
  flushBossQueue();
  staffApplyLang();
  staffShowInstallTip();
  staffLoadPetty();
  // 打开时清单是空的，就自动从公司账本把这个月自己报过的拉回来。
  //
  // 为什么要自动（2026-08-07 Seryi 实机）：他记了好几笔，公司账本三次都收到了，
  // 手机上却一直是「Today US$0.00 · 0 record(s)」——同一次打开期间看得到，一刷新
  // 就空。手机存不住的原因有好几种（无痕模式、iOS 七天没用清站点数据、旧版页面
  // 的清空 bug），但对他来说都是同一件事：记了等于白记，还以为按钮坏了。
  // 与其教他记得去按「找回本月记录」，不如空的时候自己去拉一次。
  // 安全：拉回来的一律标已送出、按 recordId 去重，多拉几次不会重复记账。
  if((data.transactions || []).length === 0) staffRestore({ silent:true });
}

/* —— 备用金：老板给的那笔现金还剩多少 ——
 *
 * 数字**全部由服务端算**（butler 的 pettyCashBalances），这边一个数都不加不减。
 * 原因跟公司账本那张卡一样：Telegram 和 App 是同一本账的两个窗口，算法住两处迟早分岔。
 *
 * 老板还没设起点时整张卡不出现——服务端回 unset 就是「这个人还没开始记」，
 * 编一个 0 出来会被当成「花光了」。
 *
 * 缓存：余额存一份在本机，没网时照样看得到，但会明说「离线显示」。同事常在外面
 * 没信号，一片空白比一个标注过的旧数字更没用。
 */
const STAFF_PETTY_CACHE = 'staffExpense_petty';

async function staffLoadPetty(){
  const token = (localStorage.getItem(STAFF_TOKEN_STORAGE) || '').trim();
  if(!token) return;
  let row = null, stale = false;
  try{
    const res = await fetch(COMPANY_EXPENSE_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'petty', token })
    });
    const body = await res.json();
    if(!res.ok || !body || body.status !== 'ok') throw new Error('bad');
    row = (body.people || [])[0] || null;
    try{ localStorage.setItem(STAFF_PETTY_CACHE, JSON.stringify(row)); }catch(e){}
  }catch(e){
    // 没网/服务端出错：退回上次拿到的那份，并标明是旧的
    try{ row = JSON.parse(localStorage.getItem(STAFF_PETTY_CACHE) || 'null'); }catch(e2){ row = null; }
    stale = true;
  }
  staffRenderPetty(row, stale);
}

function staffRenderPetty(row, stale){
  const el = document.getElementById('staff-petty');
  if(!el) return;
  if(!row || row.status !== 'ok'){ el.classList.remove('on'); el.innerHTML = ''; return; }
  const cur = 'USD';
  // 负数 = 他自己先垫了钱，公司欠他。跟「快用完了」是两回事：一个是该去要钱，
  // 一个是钱已经从他口袋里出去了。对着「公司欠你 52 块」写「快用完了记得跟老板要」，
  // 他会以为自己还有钱。（2026-08-08 用户指出他们上个月就是负的。）
  const owed = row.balance < 0;
  const low = !owed && row.balance < 100;
  el.classList.toggle('low', low || owed);
  // 本机还没送出去的那几笔：钱已经花掉了，但服务端还不知道，所以余额里没扣。
  // 不在这边替它减——只把事实写出来，让他自己心里有数（钱的数不许 App 自己算）。
  const pend = (data.transactions || []).filter(t =>
    t.company && (t.company.status === 'pending' || t.company.status === 'failed'));
  const pendSum = pend.reduce((s,t) => s + (t.amount || 0), 0);
  const rows = (row.topups || []).slice(0, 5).map(e => `
      <div class="petty-line"><span>${e.date}</span><span>+${fmt(e.amountUsd, cur)}</span></div>`).join('');
  el.innerHTML = `
    <div class="petty-label">${owed ? tt('公司欠你','The company owes you') : tt('备用金余额','Cash on hand')}</div>
    <div class="petty-total">${fmt(owed ? -row.balance : row.balance, cur)}</div>
    <div class="petty-sub">${tt(
        `起点 ${fmt(row.opened, cur)}（${row.openedDate}）· 已花 ${fmt(row.spent, cur)}`,
        `Started at ${fmt(row.opened, cur)} (${row.openedDate}) · spent ${fmt(row.spent, cur)}`)}${
      stale ? tt('　·　离线显示，可能不是最新','　·　offline, may be out of date') : ''}</div>
    ${owed ? `<div class="petty-warn">${tt(
        `⚠️ 你先垫了 ${fmt(-row.balance, cur)}，公司还没还给你`,
        `⚠️ You are ${fmt(-row.balance, cur)} out of pocket — the company owes you`)}</div>` : ''}
    ${low ? `<div class="petty-warn">${tt('⚠️ 快用完了，记得跟老板要','⚠️ Running low — ask the boss for a top-up')}</div>` : ''}
    ${pend.length ? `<div class="petty-warn">${tt(
        `还有 ${pend.length} 笔 ${fmt(pendSum, cur)} 没送出去，这个数里还没扣`,
        `${pend.length} record(s) ${fmt(pendSum, cur)} not sent yet — not deducted above`)}</div>` : ''}
    ${rows ? `<div class="petty-list">
      <div class="petty-label">${tt('收到的钱','Top-ups received')}</div>${rows}</div>` : ''}`;
  el.classList.add('on');
}

/** 还在浏览器里（没装到主屏幕）就把安装提示条打开。
 *
 * 为什么要有这条：iOS 会自行清掉 Safari 里的站点数据，同事记了几笔、隔天打开就
 * 全空（2026-08-07 Seryi 实机）。装到主屏幕之后是独立的 App 沙盒，系统不会去动它，
 * 所以「装没装」直接决定他的记录会不会消失，不是好不好看的问题。
 *
 * 判别用两个信号：iOS Safari 只认 navigator.standalone；Android/桌面浏览器认
 * display-mode: standalone。任一为真就当已装好，提示条不出现——装好的人不该
 * 每天被念一次。两个都读不到（很旧的浏览器）时按「没装」处理：多提醒一次的
 * 代价，远小于漏提醒导致记录丢失。
 */
function staffShowInstallTip(){
  const el = document.getElementById('staff-install-tip');
  if(!el) return;
  let installed = false;
  try{
    installed = window.navigator.standalone === true ||
      (typeof window.matchMedia === 'function' &&
       window.matchMedia('(display-mode: standalone)').matches);
  }catch(e){}
  el.classList.toggle('on', !installed);
}

async function initStaffPage(){
  const tok = (localStorage.getItem(STAFF_TOKEN_STORAGE) || '').trim();
  if(!tok){ staffOpenGate(); return; }
  const who = await staffWhoAmI(tok);
  if(who.error === 'bad-key'){ staffOpenGate(); return; }
  if(who.error){
    // 连不上服务器时别把人挡在门外——他可能正在没信号的地方要记账
    const cached = localStorage.getItem(STAFF_IDENTITY_STORAGE);
    if(cached){ try{ staffIdentity = JSON.parse(cached); }catch(e){} }
    if(!staffIdentity){ staffOpenGate(); return; }
  } else {
    staffIdentity = who;
    localStorage.setItem(STAFF_IDENTITY_STORAGE, JSON.stringify(who));
  }
  staffCloseGate();
  staffStart();
}

/* —— 本月合计 + 缺收据提醒 ——
 * 用包一层的写法接在共用的 renderTxList() 后面，不去改共用代码：
 * App 那边多画一行少画一行都不会碰到这里。
 */
const _staffRenderTxList = renderTxList;
renderTxList = function(){
  _staffRenderTxList.apply(this, arguments);
  staffRenderSummary();
  // 老板账那张「手上现金」卡的数也是从账目现算的，同样挂在这里重画：记账、删除、
  // 找回记录、收件后重画全都会经过 renderTxList，逐个入口去补一定会漏，
  // 而漏掉的表现是余额停在旧数字上——那种错要人肉比对才发现。
  renderBossCash();
};
function staffRenderSummary(){
  const box = document.getElementById('staff-summary');
  const acc = curAcc();
  if(!box || !acc) return;
  const txs = monthTxs(acc.id, state.txYear, state.txMonth).filter(t => t.type === 'expense');
  const total = txs.reduce((s,t)=>s+t.amount, 0);
  // 缺收据 = 这笔没有存照片。月底纸质单据要跟 Excel 对上，缺一张就得回头找。
  const noPhoto = txs.filter(t => !t.attachmentId).length;
  // 「今天合计」摆在最上面：同事每天要在纸单上抄当天总数，这就是他要抄的那个数。
  // 翻到别的月份时不显示——那时候「今天」不在画面里，摆着只会看错。
  const t0 = today();
  const todayTxs = txs.filter(t => t.date === t0);
  const isThisMonth = t0.slice(0,7) === `${state.txYear}-${String(state.txMonth+1).padStart(2,'0')}`;
  box.innerHTML = `
    ${isThisMonth ? `
      <div class="staff-sum-label">${tt('今天合计','Today')}</div>
      <div class="staff-sum-total">${fmt(todayTxs.reduce((s,t)=>s+t.amount,0), acc.currency)}</div>
      <div class="staff-sum-sub">${tt(`今天 ${todayTxs.length} 笔`, `${todayTxs.length} record(s) today`)}</div>
      <div class="staff-sum-divider"></div>` : ''}
    <div class="staff-sum-label">${tt('本月合计','This month')}</div>
    <div class="staff-sum-total staff-sum-month">${fmt(total, acc.currency)}</div>
    <div class="staff-sum-sub">${tt(`${txs.length} 笔`, `${txs.length} record(s)`)}</div>
    ${noPhoto ? `<div class="staff-sum-warn">${tt(
        `⚠️ 有 ${noPhoto} 笔没有收据照片`,
        `⚠️ ${noPhoto} record(s) without a receipt photo`)}</div>` : ''}`;
}

/* 余额什么时候重拉：
 * 1) 记完一笔之后——钱刚花掉，余额该跟着变。等 2.5 秒是让入账请求先到服务端；
 *    没到也没关系，下面第 2 条会补上。
 * 2) 页面重新回到前台——老板刚给他转了钱、或上一次没拉到，切回来就是最自然的刷新时机，
 *    比定时轮询省电也省流量。
 */
const _staffSaveTx = saveTx;
saveTx = function(){
  _staffSaveTx.apply(this, arguments);
  setTimeout(staffLoadPetty, 2500);
};
document.addEventListener('visibilitychange', ()=>{
  if(!document.hidden && staffIdentity) staffLoadPetty();
});

/* 弹窗标题是脚本写死的中文，包一层让它跟着语言走 */
const _staffShowAddTx = showAddTx, _staffEditTx = editTx;
showAddTx = function(){ _staffShowAddTx.apply(this, arguments); staffModalTitle('新增记录','New expense'); };
editTx = function(){ _staffEditTx.apply(this, arguments); staffModalTitle('编辑记录','Edit expense'); };
function staffModalTitle(zh, en){
  const el = document.getElementById('tx-modal-title');
  if(!el) return;
  el.dataset.zh = zh; el.dataset.en = en;
  el.textContent = tt(zh, en);
}

/* —— 中英切换：同事不一定读中文 —— */
const STAFF_LANG_KEY = 'siteLangUser';
let staffLang = 'zh';
function staffApplyLang(){
  document.querySelectorAll('[data-en]').forEach(el=>{
    if(el.dataset.zh === undefined) el.dataset.zh = el.textContent;
    el.textContent = staffLang === 'en' ? el.dataset.en : el.dataset.zh;
  });
  // 输入框的提示字不是 textContent，得另外换（换错地方会把整个 input 的内容清掉）
  document.querySelectorAll('[data-en-ph]').forEach(el=>{
    if(el.dataset.zhPh === undefined) el.dataset.zhPh = el.getAttribute('placeholder') || '';
    el.setAttribute('placeholder', staffLang === 'en' ? el.dataset.enPh : el.dataset.zhPh);
  });
  const btn = document.getElementById('staff-lang-btn');
  if(btn) btn.textContent = staffLang === 'en' ? '中' : 'EN';
  document.documentElement.lang = staffLang === 'en' ? 'en' : 'zh';
  if(state.currentTab === 'transactions') renderTxList();
  // 日期提醒是脚本画的，不带 data-en，切语言时要自己重画一次
  syncDateHint();
  // 标题（🧾 Seryi ／ 👔 老板账）和老板账那块说明也是脚本画的，同上
  if(staffIdentity) staffSyncMode();
  // 请假弹窗的内容也是脚本画的（renderLeaveBody 里用 leaveT 翻），开着的时候要重画
  if(document.getElementById('modal-leave')?.classList.contains('open')) renderLeaveBody();
}
function staffToggleLang(){
  staffLang = staffLang === 'en' ? 'zh' : 'en';
  localStorage.setItem(STAFF_LANG_KEY, staffLang);
  staffApplyLang();
}
(function(){
  const saved = localStorage.getItem(STAFF_LANG_KEY);
  staffLang = saved ? saved : ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
})();
window.addEventListener('storage', e=>{
  if(e.key === STAFF_LANG_KEY && e.newValue && e.newValue !== staffLang){
    staffLang = e.newValue; staffApplyLang();
  }
});
/** 同事版的动态文字用这个翻。 */
function tt(zh, en){ return staffLang === 'en' ? en : zh; }

/* ===================== 老板账（投递箱）=====================
 *
 * 这一页记的账**不走 butler、也不进公司账本**——写进 Firestore 的 inbox_boss 集合，
 * 老板的 App 开起来收走、并进他自己的账户。规则底稿见仓库根目录 firestore.rules。
 *
 * 谁看得到这一页：手上有「老板账口令」的人。口令不写在页面源码里（网址是公开的
 * GitHub Pages，写进源码等于没有口令），只住在 Firestore 规则里和这台手机的
 * localStorage 里，老板私下发给谁谁才有。
 *
 * 两个页面的账去处完全不同，走错一个是要翻账才查得出来的，所以：
 * 底部两个入口图标/颜色不一样、老板账页面顶上永远挂着一条说明。
 */
const STAFF_BOSS_KEY_STORAGE = 'staffExpense_bossKey';
const STAFF_BOSS_QUEUE = 'staffExpense_bossQueue';
const STAFF_BOSS_ACC_ID = 'acc_boss_inbox';
const STAFF_BOSS_CUR_STORAGE = 'staffExpense_bossCur';
const STAFF_BOSS_CASH = 'staffExpense_bossCash';

function staffBossKey(){ return (localStorage.getItem(STAFF_BOSS_KEY_STORAGE) || '').trim(); }
function staffBossOn(){ return !!staffBossKey(); }
/**
 * 这本账的币种。老板那边收件时是按**他自己选的目标账户**记的，币种以那边为准；
 * 这里这个只影响同事屏幕上的符号——但旅行时这个符号很要命，日元跟美元差两个
 * 数量级，显示成 US$ 会让人以为自己多打了一个零。所以做成可设，老板给现金时
 * 顺口说一声「选日元」即可。
 */
function staffBossCur(){
  return (localStorage.getItem(STAFF_BOSS_CUR_STORAGE) || '').trim() || 'USD';
}
function staffBossAcc(){
  const cur = staffBossCur();
  const old = (data.accounts || []).find(a => a.id === STAFF_BOSS_ACC_ID);
  // 账户对象第一次建好就存进 data 了，之后改币种要顺手把存着的那份也改掉，
  // 否则设定看着变了、列表里的数字还是旧符号。
  if(old){ old.currency = cur; return old; }
  return { id: STAFF_BOSS_ACC_ID, name:'老板账', currency: cur, color:'#7c3aed',
           createdAt: Date.now() };
}

/** 换币种。只认 App 本来就支持的那几种（CUR_SYMBOLS），乱填会变成「XYZ 300.00」。 */
function staffSetBossCur(){
  const list = Object.keys(CUR_SYMBOLS);
  const v = prompt(tt(
    '这本账用什么钱？填代码即可：\\n' + list.join(' / '),
    'Which currency does this ledger use? Type the code:\\n' + list.join(' / ')), staffBossCur());
  if(v === null) return;
  const code = v.trim().toUpperCase();
  if(!CUR_SYMBOLS[code]){ toast(tt('不认得这个代码：' + code, 'Unknown code: ' + code)); return; }
  localStorage.setItem(STAFF_BOSS_CUR_STORAGE, code);
  const acc = (data.accounts || []).find(a => a.id === STAFF_BOSS_ACC_ID);
  if(acc){ acc.currency = code; saveData(); }
  updateHeader();
  renderTxList();
  staffSyncMode();
  toast(tt('这本账改用 ' + code, 'This ledger now uses ' + code));
}

/* —— 手上现金：老板给了多少、还剩多少 ——————————————————————
 *
 * 跟公司账那张备用金卡不是同一件事：那边的数由 butler 服务端算，这边老板账
 * 根本没有服务端，只能本机算。算法就一句：收到的钱 − 记的支出 ＋ 记的收入。
 *
 * 刻意**全部本机算、连没送出去的也扣**：现金离开他口袋的那一刻就该扣，
 * 跟账送没送到老板那边没关系。（公司账那张相反，因为那边的权威数在服务端。）
 * 送没送到另外写一行提醒，不混进这个数里。
 */
function loadBossCash(){
  try{
    const o = JSON.parse(localStorage.getItem(STAFF_BOSS_CASH) || 'null');
    return (o && Array.isArray(o.topups)) ? o : { topups: [] };
  }catch(e){ return { topups: [] }; }
}
function saveBossCash(o){
  try{ localStorage.setItem(STAFF_BOSS_CASH, JSON.stringify(o)); }catch(e){}
}

function bossCashAdd(){
  const v = prompt(tt('老板给了你多少现金？（' + staffBossCur() + '）',
                      'How much cash did the Boss give you? (' + staffBossCur() + ')'), '');
  if(v === null) return;
  const n = Number(String(v).replace(/[^\\d.\\-]/g, ''));
  if(!(n > 0)){ toast(tt('请填一个大于 0 的数', 'Please enter a number above 0')); return; }
  const o = loadBossCash();
  o.topups.push({ date: today(), amount: Math.round(n * 100) / 100 });
  saveBossCash(o);
  renderBossCash();
  toast(tt('记下了：收到 ' + fmt(n, staffBossCur()), 'Recorded: received ' + fmt(n, staffBossCur())));
}

/** 记错起点时用。只清「收到的钱」，记过的账一笔都不动。 */
function bossCashReset(){
  if(!confirm(tt(
    '把「收到的钱」全部清掉重记？\\n\\n你记过的账一笔都不会动，只是这张卡要重新填收到多少。',
    'Clear all cash top-ups and start over?\\n\\nYour recorded expenses are untouched — '
    + 'you just re-enter how much cash you received.'))) return;
  saveBossCash({ topups: [] });
  renderBossCash();
}

function renderBossCash(){
  const el = document.getElementById('staff-boss-cash');
  if(!el) return;
  const cur = staffBossCur();
  const o = loadBossCash();
  const got = o.topups.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // 还没填收到多少：不编一个 0 出来（那看起来像「花光了」），直接请他填
  if(!o.topups.length){
    el.classList.remove('low');
    el.innerHTML = `
      <div class="bcash-label">${tt('手上现金','Cash on hand')}</div>
      <div class="bcash-sub" style="margin-top:4px">${tt(
        '老板给你现金后按下面这个记一笔，之后每记一笔账这里会自动扣，随时看得到还剩多少。',
        'Tap below when the Boss hands you cash. Every record you make is deducted here, '
        + 'so you always know what is left.')}</div>
      <div class="bcash-btns">
        <button class="bcash-btn" onclick="bossCashAdd()">${tt('＋ 收到现金','+ Received cash')}</button>
      </div>`;
    return;
  }

  const mine = (data.transactions || []).filter(t => t.accountId === STAFF_BOSS_ACC_ID);
  const spent = mine.filter(t => t.type !== 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const back = mine.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const left = Math.round((got - spent + back) * 100) / 100;
  const notSent = mine.filter(t => t.inbox && t.inbox.status !== 'sent').length;
  const over = left < 0;
  el.classList.toggle('low', over || left < got * 0.15);

  const rows = o.topups.slice(-5).reverse().map(t => `
      <div class="bcash-line"><span>${t.date}</span><span>+${fmt(t.amount, cur)}</span></div>`).join('');

  el.innerHTML = `
    <div class="bcash-label">${over ? tt('超支了','Over budget') : tt('手上现金','Cash on hand')}</div>
    <div class="bcash-total">${fmt(over ? -left : left, cur)}</div>
    <div class="bcash-sub">${tt(
      `收到 ${fmt(got, cur)} · 已花 ${fmt(spent, cur)}`,
      `Received ${fmt(got, cur)} · spent ${fmt(spent, cur)}`)}${
      back ? tt(` · 退回 ${fmt(back, cur)}`, ` · refunds ${fmt(back, cur)}`) : ''}</div>
    ${over ? `<div class="bcash-warn">${tt(
      `⚠️ 你自己先垫了 ${fmt(-left, cur)}，记得跟老板要回来`,
      `⚠️ You are ${fmt(-left, cur)} out of pocket — ask the Boss to pay you back`)}</div>` : ''}
    ${notSent ? `<div class="bcash-warn">${tt(
      `⏳ 有 ${notSent} 笔还没送到老板那边（这个余额已经扣过了）`,
      `⏳ ${notSent} record(s) not sent to the Boss yet (already deducted above)`)}</div>` : ''}
    <div class="bcash-btns">
      <button class="bcash-btn" onclick="bossCashAdd()">${tt('＋ 又收到现金','+ Got more cash')}</button>
      <button class="bcash-btn" onclick="bossCashReset()">${tt('重填','Start over')}</button>
    </div>
    <div class="bcash-list">
      <div class="bcash-label">${tt('收到的钱','Cash received')}</div>${rows}</div>`;
}

/** 填/换/清掉老板账口令。填错了送不出去时会说明白（见 submitInboxTx 的 permission-denied）。 */
function staffSetBossKey(){
  const cur = staffBossKey();
  const v = prompt(tt(
    '老板账口令（老板私下给你的那个）。留空并确定＝清掉，这个页面就不见了。',
    "The Boss ledger passcode (the Boss gives it to you). Leave empty to remove this page."), cur);
  if(v === null) return;                       // 按了取消：什么都不动
  const k = v.trim();
  if(k) localStorage.setItem(STAFF_BOSS_KEY_STORAGE, k);
  else localStorage.removeItem(STAFF_BOSS_KEY_STORAGE);
  // 账户清单要跟着变（多一个/少一个），最省事也最不会出错的做法是重来一遍
  location.reload();
}

/** 底部两个入口、body 上的模式 class、标题，全部对齐当前账户。 */
function staffSyncMode(){
  const onBoss = data.currentAccountId === STAFF_BOSS_ACC_ID;
  document.body.classList.toggle('staff-boss', onBoss);
  const navBoss = document.getElementById('nav-boss');
  if(navBoss){
    navBoss.style.display = staffBossOn() ? '' : 'none';
    navBoss.classList.toggle('active', onBoss);
  }
  const navTx = document.getElementById('nav-transactions');
  if(navTx) navTx.classList.toggle('active', !onBoss);
  const title = document.getElementById('hdr-title');
  if(title && staffIdentity){
    title.textContent = onBoss ? tt('👔 老板账','👔 Boss') : ('🧾 ' + staffIdentity.reporter);
  }
  renderBossQueue();
  renderBossCfg();
  renderBossCash();
}

/** 说明块底下那一行设定：这本账用什么钱。 */
function renderBossCfg(){
  const el = document.getElementById('staff-boss-cfg');
  if(!el) return;
  el.innerHTML = tt('这本账用的钱：', 'This ledger uses: ')
    + `<span onclick="staffSetBossCur()">${staffBossCur()} ✎</span>`;
}

/**
 * 切账户。**不能用共用的 switchAccount()**——它末尾会 closeModal('modal-acc-switch')，
 * 而账户切换弹窗在同事版里是整块没生成进来的，getElementById 回 null，
 * 当场抛「Cannot read properties of null」，切换只做到一半（账户变了、界面没跟上）。
 * 这里只做同事版需要的那几步。
 */
function staffSwitchAcc(id){
  data.currentAccountId = id;
  saveData();
  updateHeader();
  switchTab('transactions');
  staffSyncMode();
}
function staffGoCompany(){
  staffSwitchAcc((data.accounts.find(a => a.isCompany) || data.accounts[0]).id);
}
function staffGoBoss(){ staffSwitchAcc(STAFF_BOSS_ACC_ID); }

/**
 * 投递箱要一个 Firebase 身份才写得进去（规则里 request.auth != null 那条）。
 * 用匿名登录：同事不用注册任何账号，打开就有一个临时身份。
 *
 * 注意：同事版的 onAuthStateChanged 在生成时已经被拿掉了（第 7 步），所以匿名登录
 * **不会**让 currentUser 变成非 null，也就不会有人把同事的账本推上老板的云端——
 * 改动这一段前先确认那条还在。
 */
async function staffEnsureAnon(){
  if(!cloudAvailable) return false;
  try{
    if(!auth.currentUser) await auth.signInAnonymously();
    return !!auth.currentUser;
  }catch(e){ console.warn('匿名登录失败', e); return false; }
}

async function submitInboxTx(tx){
  const k = staffBossKey();
  if(!k) return { ok:false, retriable:false, message: tt('还没填老板账口令','No Boss passcode yet') };
  if(!(await staffEnsureAnon()))
    return { ok:false, retriable:true, message: tt('现在连不上，等有网自动送','Offline — will send later') };

  const payload = {
    k,
    from: (staffIdentity ? staffIdentity.reporter : '同事').slice(0, 40),
    // 整笔账压成一个字符串送（规则里只校验长度，不逐字段校验——字段校验住老板 App
    // 那边，收进来时不认的类别会退回「其他」，坏数据直接丢掉不入账）
    tx: JSON.stringify({
      srcId: tx.id, date: tx.date, amount: tx.amount, type: tx.type,
      categoryId: tx.categoryId, description: tx.description || ''
    })
    // 刻意不带 createdAt：那要用 firebase.firestore.FieldValue.serverTimestamp()，
    // 等于让这条路多依赖一个全局对象；而「什么时候收到的」老板那边收件时自己盖章
    // （fromStaff.at）就够了。规则允许这个字段存在，只是我们不送。
  };
  // 收据照片一起送，老板那份账户明细 PDF 的凭证页才有图。太大就只送文字——
  // 照片没了还能回头问人补，账送不出去才是真丢。
  if(tx.attachmentId){
    try{
      const blob = await getAttachmentBlob(tx.attachmentId);
      if(blob){
        const dataUrl = await blobToBase64(blob);
        if(dataUrl.length < 700 * 1024) payload.photo = dataUrl;
      }
    }catch(e){ console.warn('照片读不出来，只送文字', e); }
  }

  try{
    await db.collection(INBOX_COLLECTION).add(payload);
    return { ok:true };
  }catch(e){
    // 口令不对 / 老板还没设好权限：重试一百次也是同样结果，要当场说清楚
    if(e && e.code === 'permission-denied')
      return { ok:false, retriable:false,
               message: tt('口令不对，或者老板那边还没设好','Wrong passcode, or the Boss has not set it up') };
    return { ok:false, retriable:true, message: tt('现在送不出去，等有网自动送','Offline — will send later') };
  }
}

function loadBossQueue(){
  try{ return JSON.parse(localStorage.getItem(STAFF_BOSS_QUEUE) || '[]'); }catch(e){ return []; }
}
function saveBossQueue(q){
  try{ localStorage.setItem(STAFF_BOSS_QUEUE, JSON.stringify(q)); }catch(e){}
}

/**
 * saveTxInner 存完本机之后调这里（钩子在 expense-tracker.html 末尾）。
 *
 * 送不出去绝不丢账：本机永远先存好（那一步已经做完了），这里只管送；
 * 网络问题进队列自动重试，口令错才标 failed 并写在列表上。
 * 重送安全：老板那边按 srcId 去重覆盖同一笔，送两次不会变成两条。
 */
function onTxSaved(tx){
  if(tx.accountId !== STAFF_BOSS_ACC_ID) return;
  const local = data.transactions.find(t => t.id === tx.id);
  if(local){ local.inbox = { status:'pending', error:null }; saveData(); }
  const q = loadBossQueue();
  if(!q.includes(tx.id)){ q.push(tx.id); saveBossQueue(q); }
  renderTxList();
  renderBossQueue();
  flushBossQueue({ loud:true });
}

async function flushBossQueue(opts){
  const loud = !!(opts && opts.loud);
  let q = loadBossQueue();
  if(!q.length) return;
  if(!staffBossOn()) return;
  for(const txId of [...q]){
    const tx = data.transactions.find(t => t.id === txId);
    if(!tx){ q = q.filter(x => x !== txId); saveBossQueue(q); continue; }
    const r = await submitInboxTx(tx);
    const local = data.transactions.find(t => t.id === txId);
    if(r.ok){
      if(local) local.inbox = { status:'sent', error:null };
      q = q.filter(x => x !== txId); saveBossQueue(q);
      if(loud) toast(tt('✅ 已送到老板那边','✅ Sent to the Boss'));
    } else if(r.retriable){
      if(local) local.inbox = { status:'pending', error:null };
      if(loud) toast(r.message);
      break;                      // 还是没网，剩下的留着下次
    } else {
      if(local) local.inbox = { status:'failed', error:r.message };
      q = q.filter(x => x !== txId); saveBossQueue(q);
      if(loud) toast('⚠️ ' + r.message);
    }
    saveData();
  }
  renderTxList();
  renderBossQueue();
}

/** 老板账页面顶上那块说明里的一行状态：还有几笔没送到。 */
function renderBossQueue(){
  const el = document.getElementById('staff-boss-queue');
  if(!el) return;
  const pend = (data.transactions || []).filter(t => t.inbox && t.inbox.status === 'pending').length;
  const failed = (data.transactions || []).filter(t => t.inbox && t.inbox.status === 'failed');
  const parts = [];
  if(pend) parts.push(tt(`⏳ 有 ${pend} 笔还没送到，有网时自动送`,
                         `⏳ ${pend} record(s) not sent yet — will go out when you are online`));
  // 删除也会排队（没网时）。不显示的话，同事以为删干净了，其实老板那边还没收到通知。
  const delPend = loadBossDelQueue().length;
  if(delPend) parts.push(tt(`⏳ 有 ${delPend} 笔的删除还没通知到老板，有网时自动通知`,
                            `⏳ ${delPend} deletion(s) not yet sent to the Boss — will go out when you are online`));
  if(failed.length) parts.push(tt(
    `⚠️ 有 ${failed.length} 笔送不出去：${failed[0].inbox.error || ''}`,
    `⚠️ ${failed.length} record(s) failed: ${failed[0].inbox.error || ''}`));
  el.innerHTML = parts.join('<br>');
}

/* 已经送到老板那边的，删掉时**连老板那边一起删**（2026-09-01 用户要求：
   「让他们能删除掉自己的记录，一删我这边就能看到」）。
   在这之前删除只删本机、老板账本里那条还留着，同事以为删干净了，其实没有。 */
const _staffConfirmDeleteTx = confirmDeleteTx;
confirmDeleteTx = function(t){
  if(t && t.inbox && t.inbox.status === 'sent'){
    return confirm(tt(
      '这笔已经送到老板那边了。\\n\\n删除会**同时**通知老板那边一起删掉'
      + '（他下次开 App 收件时生效）。\\n\\n确定删除？',
      'This one already went to the Boss.\\n\\nDeleting will also remove it on the Boss side '
      + '(it takes effect next time the Boss opens the app).\\n\\nDelete?'));
  }
  return _staffConfirmDeleteTx.apply(this, arguments);
};

/* —— 把「这笔删掉了」也送进投递箱 ————————————————————————
 *
 * 走的是**同一个投递箱、同一条 Firestore 规则**：payload 形状一模一样，只是 tx 那个
 * 字符串里多一个 op:'delete'。规则只校验「tx 是字符串、够短」，所以后台那份规则
 * 一个字都不用改——要是新开一个集合或多一个字段，老板就得再去 Console 贴一次规则，
 * 那是他唯一必须亲自动手的地方，能不碰就不碰。
 *
 * 队列跟记账那条分开存：那条按 tx.id 去 data.transactions 里捞完整的账，
 * 而这笔账已经被删掉了，捞不到——共用一条队列的话删除请求会被当成「找不到，丢弃」。
 */
const STAFF_BOSS_DEL_QUEUE = 'staffExpense_bossDelQueue';
function loadBossDelQueue(){
  try{ return JSON.parse(localStorage.getItem(STAFF_BOSS_DEL_QUEUE) || '[]'); }catch(e){ return []; }
}
function saveBossDelQueue(q){
  try{ localStorage.setItem(STAFF_BOSS_DEL_QUEUE, JSON.stringify(q)); }catch(e){}
}

async function submitInboxDelete(srcId){
  const k = staffBossKey();
  if(!k) return { ok:false, retriable:false };
  if(!(await staffEnsureAnon())) return { ok:false, retriable:true };
  try{
    await db.collection(INBOX_COLLECTION).add({
      k,
      from: (staffIdentity ? staffIdentity.reporter : '同事').slice(0, 40),
      tx: JSON.stringify({ op:'delete', srcId: String(srcId).slice(0, 40) })
    });
    return { ok:true };
  }catch(e){
    // 口令不对／规则没设好：重试多少次都一样，别把它永远留在队列里堵着
    if(e && e.code === 'permission-denied') return { ok:false, retriable:false };
    return { ok:false, retriable:true };
  }
}

async function flushBossDelQueue(opts){
  const loud = !!(opts && opts.loud);
  let q = loadBossDelQueue();
  if(!q.length || !staffBossOn()) return;
  for(const srcId of [...q]){
    const r = await submitInboxDelete(srcId);
    if(r.ok){
      q = q.filter(x => x !== srcId); saveBossDelQueue(q);
      if(loud) toast(tt('✅ 已通知老板那边一起删掉','✅ The Boss side will remove it too'));
    } else if(r.retriable){
      if(loud) toast(tt('现在连不上，有网时会自动通知老板','Offline — the Boss will be told when you are back online'));
      break;                      // 没网，剩下的留着下次
    } else {
      q = q.filter(x => x !== srcId); saveBossDelQueue(q);
      if(loud) toast(tt('⚠️ 通知不了老板那边（口令或权限的问题），请直接跟他说',
                        '⚠️ Could not notify the Boss (passcode/permission) — tell him directly'));
    }
  }
  renderBossQueue();
}

/**
 * expense-tracker.html 的两处删除路径都会叫这里（钩子 onTxDeleted）。
 * 只管已经送到老板那边的那种：还没送出去的，老板压根没见过，不用通知。
 * 记账队列里若还排着它（送出去之前就删了），顺手撤掉，免得等一下又把它送上去。
 */
function onTxDeleted(t){
  if(!t || t.accountId !== STAFF_BOSS_ACC_ID) return;
  const q0 = loadBossQueue();
  if(q0.includes(t.id)) saveBossQueue(q0.filter(x => x !== t.id));
  if(!(t.inbox && t.inbox.status === 'sent')) return;
  const q = loadBossDelQueue();
  if(!q.includes(t.id)){ q.push(t.id); saveBossDelQueue(q); }
  flushBossDelQueue({ loud:true });
}

// 网络恢复时把没送到的补上（跟公司账那条队列同一个思路）
window.addEventListener('online', ()=>{ flushBossQueue(); flushBossDelQueue(); });
"""


def main():
    check_only = "--check" in sys.argv
    src = SRC.read_text(encoding="utf-8")
    out = build(src)
    if check_only:
        cur = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if cur != out:
            print("❌ staff/index.html 跟 expense-tracker.html 对不上了。\n"
                  "   跑一次 `python3 tools/build-staff-page.py` 重新生成并提交。", file=sys.stderr)
            sys.exit(1)
        print("通过：staff/index.html 是最新生成的")
        return
    OUT.write_text(out, encoding="utf-8")
    print(f"已生成 {OUT.relative_to(REPO)}（{len(out.splitlines())} 行，"
          f"源码 {len(src.splitlines())} 行）")


if __name__ == "__main__":
    main()
