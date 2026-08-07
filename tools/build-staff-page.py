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
    s = replace_once(s, '<!-- type toggle -->\n    <div class="type-tabs" style="margin-bottom:16px">',
                     '<!-- type toggle -->\n    <div class="type-tabs" id="tx-type-tabs" style="margin-bottom:16px">',
                     "收入/支出切换")
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
                     '<div class="tab" id="tab-transactions">\n  <div id="staff-summary"></div>',
                     "明细页（放本月合计）")
    s = replace_once(s, '<div id="tx-list" class="tx-list"></div>\n</div>',
                     '<div id="tx-list" class="tx-list"></div>\n'
                     '  <div id="staff-signout-row">\n'
                     '    <button class="btn btn-outline btn-sm" onclick="staffSignOut()">换钥匙 / Sign out</button>\n'
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
    ("'expenseTracker_v2'",              "'staffExpense_v2'",         3),
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
    ('<label class="form-label">车牌号</label>', "Plate number"),
    ('<button class="btn btn-primary" onclick="saveTx()">保存</button>', "Save"),
    ('<button class="btn btn-danger" onclick="deleteTx()">🗑 删除此记录</button>', "🗑 Delete this record"),
    ('<span style="font-size:20px">📷</span>拍照', "Camera"),
    ('<span style="font-size:20px">🖼️</span>从相册选择', "Gallery"),
]

# 脚本画出来的文字：包一层 tt() 才会跟着语言切换
DYNAMIC_TEXT = [
    ("""if(t.company.refTag) parts.push(`📄${t.company.refTag}号`);""",
     """if(t.company.refTag) parts.push(tt(`📄${t.company.refTag}号`, `📄 No.${t.company.refTag}`));""",
     "单号标注"),
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
/* 版本号：同事回报问题时第一句要问的就是「你手上是哪一版」 */
#staff-build-note{margin-top:8px;font-size:11px;color:var(--sub)}
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
  if(b) b.textContent = '版本 ' + APP_BUILD;
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
