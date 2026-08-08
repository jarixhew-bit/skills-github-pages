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


def cut_exact(s, block, what):
    """删掉一段一字不差的文本。"""
    once(s, block, what)
    return s.replace(block, "", 1)


def replace_n(s, old, new, what, n):
    """替换全部 n 处——数量对不上就报错（少一处就等于漏了一个存储位）。"""
    got = s.count(old)
    if got != n:
        raise BuildError(f"「{what}」应出现 {n} 次，实际 {got} 次：{old[:60]!r}")
    return s.replace(old, new)


def add_en(html, en):
    """给一段 `<tag ...>中文</tag>` 加上 data-en。"""
    i = html.index(">")
    return html[:i] + f' data-en="{en}"' + html[i:]


def build(src: str) -> str:
    s = src

    # ---------- 1) 整块删掉个人账本的界面 ----------
    s = cut_between(s, "<!-- OVERVIEW TAB -->", "<!-- TRANSACTIONS TAB -->", "概览 tab")
    s = cut_between(s, "<!-- ANALYTICS TAB -->", "<!-- SETTINGS TAB -->", "统计 tab")
    s = cut_between(s, "<!-- SETTINGS TAB -->", "<!-- FAB -->", "设置 tab")
    s = cut_between(s, "<!-- MODAL: ACCOUNT SWITCHER -->", "<!-- PDF REPORT (hidden) -->",
                    "账户/类别/循环账单的弹窗")
    # 注：备用金的「转钱 / 设起点 / 调整」两个弹窗是老板专用的写入界面，它们摆在
    # ACCOUNT SWITCHER 和 PDF REPORT 之间，**已经被上面那条规则一起切掉了**。
    # 新增老板专用的弹窗时放在这个区间里就自动不会进同事版；放到区间外要另外加一条 cut。

    # 底部导航只留「明细」
    for nav_id, label in (("nav-overview", "概览"), ("nav-analytics", "统计"), ("nav-settings", "设置")):
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
    # 全员账本是老板专用的（服务端只认老板的钥匙），同事版连问都不该问
    s = cut_exact(s,
                  "\n  fetchPetty().then(()=>{ if(state.currentTab==='overview') renderOvPetty(); });",
                  "启动时拉全员备用金")
    s = cut_exact(s,
                  "\n\n  // 公司账本（全员）：开 App 时后台拉一次，首屏那张卡才有「今天」的数。\n"
                  "  // 不 await——拉不到就是卡上写一句「连不上」，不该拖住启动。\n"
                  "  fetchCompanyLedger().then(()=>{ if(state.currentTab==='overview') renderOvCompany(); });",
                  "启动时拉全员账本")
    s = cut_exact(s,
                  "      // 刚进账本的这笔也要算进首屏那张「今天」卡里，重拉一次\n"
                  "      if(r.ok) fetchCompanyLedger(ledMonthNow(), {force:true}).then(()=>renderOvCompany());\n",
                  "入账后重拉全员账本")

    # 云同步整个不接：同事版没有登录入口，留着 auth 监听只是白等
    s = replace_once(s,
                     "  // 云同步连不上时 auth 是 null（见顶部 FIREBASE 那段）。这里必须挡一下，\n"
                     "  // 否则 init() 会抛错，后面的启动步骤全都不会执行。\n"
                     "  if(!cloudAvailable) return;",
                     "  return;   // 同事版不接云同步（没有登录入口），公司账走 butler 那条路", "云同步")
    # 身份由钥匙决定：页面上没有「谁报的账」，这里也不许从 DOM 读
    s = replace_once(s, "    const reporter = document.getElementById('tx-company-reporter').value || 'Boss';",
                     "    // 身份由钥匙决定（服务端也以钥匙为准、忽略这个字段），页面上没得选也就选不错\n"
                     "    const reporter = staffIdentity ? staffIdentity.reporter : 'Boss';",
                     "报账人")

    # ---------- 8) 同事看得到的文案加英文 ----------
    for zh_html, en in STAFF_LABELS:
        s = replace_once(s, zh_html, add_en(zh_html, en), f"文案「{en}」")
    for old, new, what in LABEL_REWRITES:
        s = replace_once(s, old, new, what)
    for old_js, new_js, what in DYNAMIC_TEXT:
        s = replace_once(s, old_js, new_js, what)

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
    ('<div class="type-tab active" id="whose-self" onclick="setCompanyWhose(\'self\')">自己吃的</div>',
     "I ate it"),
    ('<div class="type-tab" id="whose-boss" onclick="setCompanyWhose(\'boss\')">老板的</div>',
     "The Boss"),
    ('<label class="form-label">车牌号</label>', "Plate number"),
    ('<button class="btn btn-primary" id="tx-save-btn" onclick="saveTx()">保存</button>', "Save"),
    # add_en 把 data-en 加在这段的第一个 '>' 上，也就是 div 的开标签末尾——所以锚点
    # 必须从 <div 开始带上（开标签因为 style 太长断成了两行）
    ('<div id="tx-sent-lock" style="display:none;padding:10px 12px;background:rgba(230,126,34,.12);\n'
     '      border-radius:10px;margin-bottom:14px;font-size:12px;color:#e67e22;line-height:1.6">\n'
     '      🔒 这笔已经报进公司账本了，改不了——要更正请按下面的「删除此记录」，然后重新记一次。',
     "🔒 This one is already filed to the company ledger and cannot be edited. "
     "To correct it, tap Delete below and enter it again."),
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
    # 车牌栏的说明：选了汽油才展开，所以第一轮扫描没扫到（那时它是 display:none）
    ('          车辆相关的开销要记车牌，会写进 Excel 成「Petrol (NS6868)」这种格式。\n'
     '          这类开销一律算在 Boss 头上（进左边那张表）。',
     '          <span data-en="Vehicle costs need a plate number. It goes into the Excel as '
     '&quot;Petrol (NS6868)&quot;. These are always charged to the Boss (the left-hand table).">'
     '车辆相关的开销要记车牌，会写进 Excel 成「Petrol (NS6868)」这种格式。'
     '这类开销一律算在 Boss 头上（进左边那张表）。</span>',
     "车牌说明"),
    # 「这一餐算谁的」的说明：老板 App 那边讲的是「报账人」（他能替别人记账），
    # 同事版没有那个下拉、报账人永远是他自己，照抄过来会看不懂，所以整段换成他的口径。
    ('          买给老板的餐选「老板的」，这笔算公司的，进 Excel 左边 Boss 表；\n'
     '          选「自己吃的」按原来的规则算——报账人自己的正餐才进右边那张表。',
     '          <span data-en="Buying a meal for the Boss? Pick &quot;The Boss&quot; — it goes on the '
     'company\'s side. Your own meal stays on yours.">'
     '买给老板吃的那餐选「老板的」，算公司的账；你自己吃的选「自己吃的」，算你的。</span>',
     "这一餐算谁的 说明"),
    # placeholder 不是 textContent，staffApplyLang 另外用 data-en-ph 处理
    ('placeholder="例：NS6868"', 'placeholder="例：NS6868" data-en-ph="e.g. NS6868"', "车牌提示字"),
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
     "金额提示"),
    ("""if(!categoryEn){ toast('请选择公司类别'); return; }""",
     """if(!categoryEn){ toast(tt('请选择公司类别','Please choose a category')); return; }""",
     "类别提示"),
    ("""if(needsPlate && !plateRaw){ toast(`${categoryEn} 要填车牌号`); return; }""",
     """if(needsPlate && !plateRaw){ toast(tt(`${categoryEn} 要填车牌号`,`${categoryEn} needs a plate number`)); return; }""",
     "车牌提示"),
    ("""      toast('这笔已经报进公司账本了，改不了——请删掉重记');""",
     """      toast(tt('这笔已经报进公司账本了，改不了——请删掉重记',
               'Already filed to the company ledger — delete it and enter it again'));""",
     "已报上去的改不了"),
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
#hdr-cloud, #hdr-acc-pill, #tx-type-tabs, #tx-riel-toggle,
#tx-desc-group, #tx-reporter-group, #tx-reftag-group,
#tx-filter-row{display:none !important}

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
/* 车牌栏整格是 text-transform:uppercase（车牌本来就写大写），但提示字会跟着被
   拉成大写——中文「例：NS6868」看不出来，英文「e.g. NS6868」变成「E.G. NS6868」，
   像在喊。提示字不是用户输入的内容，不该跟着变形。 */
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
  data.accounts = [acc];            // 同事版只有这一个账户，切不了也就选不错
  data.currentAccountId = acc.id;
  saveData();
  init();
  refreshCompanyCategories();
  flushCompanyQueue();
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
