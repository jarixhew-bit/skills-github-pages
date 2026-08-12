/*
 * 每日自动上线签到 —— 手机端脚本
 * 运行环境：AutoX.js（或 Auto.js 4.1），安卓，不需要 root、不需要电脑
 *
 * 它做什么：到点自动亮屏 → 打开游戏 → 按你配置的步骤，一步步「找图 → 点它」
 *          → 跑完写日志、回桌面。找图失败会等待重试，等不到就按你的设定
 *          决定是中止还是跳过，绝不瞎点。
 *
 * 你要改的只有下面【配置区】那一段。配置区以外的代码不用看懂，也不要改。
 *
 * 第一次用的顺序（详细图文见 index.html）：
 *   1. 先跑 capture-helper.js  —— 拿到游戏包名、截几张图当模板
 *   2. 再跑 selftest.js        —— 确认权限和找图功能都正常
 *   3. 最后跑本脚本            —— 手动跑一次成功后，再设成每日定时
 *
 * 注意：模板图必须是「这台手机、这个分辨率、这个屏幕方向」截出来的。
 *      换手机、改了显示大小、游戏从竖屏变横屏，模板图都要重截。
 */

"auto";  // 告诉 AutoX.js 这个脚本需要无障碍服务（必须写在最前面）

// ============================================================
// 【配置区】—— 只改这一段
// ============================================================

var CONFIG = {

    // 游戏的包名。这里预填的是「暗影紀元-魔幻冒险之旅」（2026-08-12 从
    // Google Play 商店页确认：play.google.com/store/apps/details?id=com.yzzg.mdgame）。
    // 换别的游戏就改这里，不知道包名就跑 capture-helper.js，它会列出来。
    "游戏包名": "com.yzzg.mdgame",

    // 游戏是横屏还是竖屏（横屏游戏一定要填 true，否则截图会歪）
    "横屏": false,

    // 打开游戏后，等它加载多少秒再开始找图（读条久的游戏调大）
    "启动等待秒": 25,

    // 找图相似度。1 = 一模一样，越低越宽松。
    // 找不到图就往下调（0.75），点错东西就往上调（0.9）。
    "相似度": 0.85,

    // 一天只跑一次。定时任务万一重复触发，第二次会自己退出。
    "一天只跑一次": true,

    // 跑完后要不要把游戏关掉（省电，但下次启动更慢）
    "跑完关游戏": true,

    // 全部跑完的总超时（分钟）。超过就强制收工，防止卡住整晚亮着屏。
    "总超时分钟": 10,

    // 想在跑完收到 Telegram 通知就填；不填就只写本地日志。
    // ⚠️ 这两个值是私密的，只填在手机上那一份，不要传回 GitHub 仓库。
    "TG机器人Token": "",
    "TG聊天ID": "",

    // ---------- 每日要做的步骤，从上到下依次执行 ----------
    //
    // 每一步的「类型」可以是：
    //   点图      等这张图出现，出现就点它（最常用）
    //   任选其一  几张图里任何一张出现就点它（应对随机弹窗、A/B 版本）
    //   点掉所有  反复点这张图直到它消失（连续领奖、连续确定）
    //   等图      只等它出现，不点（用来确认「确实进到某个界面了」）
    //   点坐标    点固定位置（建议前一步先用「等图」确认界面，再点坐标）
    //   等待      纯等几秒
    //   返回      按一次系统返回键
    //   存档      截一张图存起来，事后可以翻出来看那一刻发生了什么
    //
    // 每一步的「必须」：
    //   true  = 找不到就中止整个脚本并报错（关键步骤，例如签到按钮）
    //   false = 找不到就跳过继续（可有可无的步骤，例如开屏广告的关闭按钮）
    //
    // 「图」填的是模板图文件名，放在手机的 /sdcard/game-bot/tpl/ 里。
    //
    "步骤": [
        {
            "名字": "关掉开屏广告/公告",
            "类型": "点图",
            "图": "close.png",
            "等待秒": 20,
            "必须": false
        },
        {
            "名字": "确认已进入游戏主界面",
            "类型": "等图",
            "图": "main.png",
            "等待秒": 60,
            "必须": true
        },
        {
            "名字": "点每日签到入口",
            "类型": "点图",
            "图": "signin_entry.png",
            "等待秒": 30,
            "必须": true
        },
        {
            "名字": "点领取奖励",
            "类型": "任选其一",
            "图列表": ["claim.png", "claim2.png"],
            "等待秒": 20,
            "必须": true
        },
        {
            "名字": "把弹出来的领奖框全部点掉",
            "类型": "点掉所有",
            "图": "ok.png",
            "等待秒": 15,
            "必须": false
        },
        {
            "名字": "存一张证据图",
            "类型": "存档",
            "必须": false
        }
    ]
};

// ============================================================
// 以下是通用逻辑，不用改
// ============================================================

var 根目录 = "/sdcard/game-bot/";
var 模板目录 = 根目录 + "tpl/";
var 日志文件 = 根目录 + "log.txt";
var 状态文件 = 根目录 + "state.json";
var 存档目录 = 根目录 + "shots/";

var 开始时间 = Date.now();
var 模板缓存 = {};
var 失败原因 = null;

function 今天() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function 现在() {
    var d = new Date();
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function 记(msg) {
    var line = "[" + 今天() + " " + 现在() + "] " + msg;
    log(line);
    try {
        files.createWithDirs(日志文件);
        files.append(日志文件, line + "\n");
    } catch (e) {
        // 写不了日志不影响主流程，继续跑
    }
}

function 超时了() {
    return (Date.now() - 开始时间) > CONFIG["总超时分钟"] * 60 * 1000;
}

// 随机小偏移：点击位置每次略有不同，比每天点同一个像素自然，也不容易被
// 「同一坐标重复点击」这类简单检测盯上。
function 抖(n) {
    return n + Math.floor(Math.random() * 7) - 3;
}

function 随机等(基准毫秒) {
    sleep(基准毫秒 + Math.floor(Math.random() * 600));
}

function 读模板(名) {
    if (模板缓存[名]) return 模板缓存[名];
    var 路径 = 模板目录 + 名;
    if (!files.exists(路径)) {
        throw new Error("模板图不存在：" + 路径 + "（先用 capture-helper.js 截图并裁剪好）");
    }
    var img = images.read(路径);
    if (!img) {
        throw new Error("模板图读不出来（可能不是有效图片）：" + 路径);
    }
    模板缓存[名] = img;
    return img;
}

// 在屏幕上找一张模板图。找到返回 {x, y}（已经算成中心点），找不到返回 null。
function 找一次(模板名) {
    var tpl = 读模板(模板名);
    var 屏 = captureScreen();
    if (!屏) return null;
    var p = null;
    try {
        p = images.findImage(屏, tpl, { threshold: CONFIG["相似度"] });
    } finally {
        // 不回收会在循环里吃光内存，跑几分钟就崩——这行不能删
        try { 屏.recycle(); } catch (e) {}
    }
    if (!p) return null;
    return {
        x: p.x + Math.floor(tpl.getWidth() / 2),
        y: p.y + Math.floor(tpl.getHeight() / 2)
    };
}

// 在给定秒数内反复找，找到就立刻返回
function 等图出现(模板名, 等待秒) {
    var 截止 = Date.now() + 等待秒 * 1000;
    while (Date.now() < 截止) {
        if (超时了()) return null;
        var p = 找一次(模板名);
        if (p) return p;
        sleep(1000);
    }
    return null;
}

// 多张图里任何一张先出现就返回 {点: p, 图: 名}
function 等任一出现(图列表, 等待秒) {
    var 截止 = Date.now() + 等待秒 * 1000;
    while (Date.now() < 截止) {
        if (超时了()) return null;
        for (var i = 0; i < 图列表.length; i++) {
            var p = 找一次(图列表[i]);
            if (p) return { 点: p, 图: 图列表[i] };
        }
        sleep(1000);
    }
    return null;
}

// 点一下。click 在少数机型上无效，退回用 press。
function 点(x, y) {
    var ok = false;
    try {
        ok = click(抖(x), 抖(y));
    } catch (e) {
        ok = false;
    }
    if (!ok) {
        try {
            press(抖(x), 抖(y), 60);
            ok = true;
        } catch (e2) {
            ok = false;
        }
    }
    return ok;
}

function 存一张(标签) {
    try {
        files.createWithDirs(存档目录 + "x");
        var 屏 = captureScreen();
        if (!屏) return;
        var 路径 = 存档目录 + 今天() + "_" + 标签 + ".png";
        images.save(屏, 路径);
        try { 屏.recycle(); } catch (e) {}
        记("已存档：" + 路径);
    } catch (e) {
        记("存档失败：" + e.message);
    }
}

function 发通知(内容) {
    var token = CONFIG["TG机器人Token"];
    var chat = CONFIG["TG聊天ID"];
    if (!token || !chat) return;
    try {
        http.post("https://api.telegram.org/bot" + token + "/sendMessage", {
            chat_id: chat,
            text: 内容
        });
    } catch (e) {
        记("Telegram 通知发不出去：" + e.message);
    }
}

// ---------- 单步执行 ----------

function 跑一步(步) {
    var 类型 = 步["类型"];
    var 名字 = 步["名字"] || 类型;
    var 等待秒 = 步["等待秒"] || 15;

    if (类型 === "等待") {
        记("等待 " + 等待秒 + " 秒：" + 名字);
        sleep(等待秒 * 1000);
        return true;
    }

    if (类型 === "返回") {
        记("按返回键：" + 名字);
        back();
        随机等(1200);
        return true;
    }

    if (类型 === "存档") {
        存一张(名字.replace(/[^\w一-龥]/g, "_"));
        return true;
    }

    if (类型 === "点坐标") {
        记("点固定坐标 (" + 步["x"] + ", " + 步["y"] + ")：" + 名字);
        点(步["x"], 步["y"]);
        随机等(1500);
        return true;
    }

    if (类型 === "等图") {
        记("等待画面出现「" + 步["图"] + "」：" + 名字);
        var p0 = 等图出现(步["图"], 等待秒);
        if (!p0) {
            记("✗ 等不到 " + 步["图"]);
            return false;
        }
        记("✓ 画面已确认");
        return true;
    }

    if (类型 === "点图") {
        记("找并点「" + 步["图"] + "」：" + 名字);
        var p1 = 等图出现(步["图"], 等待秒);
        if (!p1) {
            记("✗ 找不到 " + 步["图"]);
            return false;
        }
        点(p1.x, p1.y);
        记("✓ 已点 (" + p1.x + ", " + p1.y + ")");
        随机等(1800);
        return true;
    }

    if (类型 === "任选其一") {
        记("找这几张里任一张并点：" + 步["图列表"].join(" / "));
        var r = 等任一出现(步["图列表"], 等待秒);
        if (!r) {
            记("✗ 一张都没出现");
            return false;
        }
        点(r.点.x, r.点.y);
        记("✓ 点了 " + r.图);
        随机等(1800);
        return true;
    }

    if (类型 === "点掉所有") {
        记("反复点「" + 步["图"] + "」直到它消失：" + 名字);
        var 次数 = 0;
        var 截止 = Date.now() + 等待秒 * 1000;
        while (Date.now() < 截止 && !超时了()) {
            var p2 = 找一次(步["图"]);
            if (!p2) {
                if (次数 > 0) break;   // 已经点过、现在没了 = 点完了
                sleep(1000);
                continue;
            }
            点(p2.x, p2.y);
            次数++;
            随机等(1200);
            if (次数 >= 30) break;     // 保险丝：防止图一直在导致死循环
        }
        记(次数 > 0 ? ("✓ 点掉了 " + 次数 + " 次") : "（没有出现，跳过）");
        return 次数 > 0;
    }

    记("✗ 不认识的步骤类型：" + 类型);
    return false;
}

// ---------- 主流程 ----------

function 检查分辨率() {
    var meta = 模板目录 + "meta.json";
    if (!files.exists(meta)) return;
    try {
        var m = JSON.parse(files.read(meta));
        if (m.width !== device.width || m.height !== device.height) {
            记("⚠️ 分辨率对不上：模板是在 " + m.width + "x" + m.height +
                " 截的，现在是 " + device.width + "x" + device.height +
                "。找图很可能失败，建议重新截模板图。");
        }
    } catch (e) {
        // meta 坏了不影响主流程
    }
}

function 已经跑过了() {
    if (!CONFIG["一天只跑一次"]) return false;
    if (!files.exists(状态文件)) return false;
    try {
        var s = JSON.parse(files.read(状态文件));
        return s.lastSuccess === 今天();
    } catch (e) {
        return false;
    }
}

function 记下跑成功() {
    try {
        files.createWithDirs(状态文件);
        files.write(状态文件, JSON.stringify({ lastSuccess: 今天() }));
    } catch (e) {}
}

function main() {
    记("=== 开始 ===");

    if (已经跑过了()) {
        记("今天已经成功跑过了，退出。");
        exit();
        return;
    }

    // 1. 无障碍服务
    if (!auto.service) {
        记("✗ 无障碍服务没开，脚本点不动屏幕。请到 设置 → 无障碍 里打开 AutoX.js。");
        toast("请先打开 AutoX.js 的无障碍服务");
        发通知("游戏签到失败：无障碍服务没开");
        exit();
        return;
    }

    // 2. 截图权限
    var 拿到了 = false;
    try {
        拿到了 = CONFIG["横屏"]
            ? images.requestScreenCapture(true)
            : images.requestScreenCapture();
    } catch (e) {
        记("✗ 申请截图权限出错：" + e.message);
    }
    if (!拿到了) {
        记("✗ 没拿到截图权限，脚本看不到屏幕。弹出授权框时要点「立即开始」。");
        发通知("游戏签到失败：没拿到截图权限");
        exit();
        return;
    }
    记("截图权限 OK，屏幕 " + device.width + "x" + device.height);
    检查分辨率();

    // 3. 亮屏 + 往上滑一下（应付「上滑解锁」的锁屏；有密码锁的手机滑不开，
    //    那种情况请把这台手机设成免密，或者让它跑的时候屏幕本来就是亮的）
    try {
        device.wakeUp();
        device.keepScreenOn(CONFIG["总超时分钟"] * 60 * 1000);
        sleep(1500);
        var 中 = Math.floor(device.width / 2);
        var 下 = Math.floor(device.height * 0.8);
        var 上 = Math.floor(device.height * 0.3);
        try {
            // 无障碍手势，不需要 root——绝大多数手机走这条
            gesture(400, [中, 下], [中, 上]);
        } catch (e1) {
            // 老版本或特殊机型退回坐标滑动（这条需要 root，没有就静默失败）
            try { swipe(中, 下, 中, 上, 400); } catch (e2) {}
        }
        sleep(1000);
    } catch (e) {
        记("亮屏/解锁这一步出了点状况（不一定有影响）：" + e.message);
    }

    // 4. 打开游戏
    记("启动游戏：" + CONFIG["游戏包名"]);
    var 启动了 = app.launchPackage(CONFIG["游戏包名"]);
    if (启动了 === false) {
        记("✗ 启动不了，包名可能填错了。跑 capture-helper.js 查正确包名。");
        发通知("游戏签到失败：包名不对，启动不了游戏");
        exit();
        return;
    }
    记("等游戏加载 " + CONFIG["启动等待秒"] + " 秒…");
    sleep(CONFIG["启动等待秒"] * 1000);

    // 5. 依次跑每一步
    var 步骤 = CONFIG["步骤"];
    for (var i = 0; i < 步骤.length; i++) {
        var 步 = 步骤[i];
        记("--- 第 " + (i + 1) + "/" + 步骤.length + " 步：" + (步["名字"] || 步["类型"]) + " ---");

        if (超时了()) {
            失败原因 = "总时间超过 " + CONFIG["总超时分钟"] + " 分钟，强制收工";
            记("✗ " + 失败原因);
            break;
        }

        var ok;
        try {
            ok = 跑一步(步);
        } catch (e) {
            ok = false;
            记("✗ 这一步出错：" + e.message);
        }

        if (!ok && 步["必须"]) {
            失败原因 = "第 " + (i + 1) + " 步「" + (步["名字"] || 步["类型"]) + "」没做成";
            存一张("失败_第" + (i + 1) + "步");
            记("✗ 这是必须成功的步骤，中止。已存下当时的屏幕截图。");
            break;
        }
        if (!ok) {
            记("（这一步不是必须的，跳过继续）");
        }
    }

    // 6. 收工
    if (CONFIG["跑完关游戏"]) {
        try {
            home();
            sleep(1000);
        } catch (e) {}
    }

    if (失败原因) {
        记("=== 结束：失败（" + 失败原因 + "）===");
        发通知("❌ 游戏签到失败\n" + 失败原因 + "\n截图在手机 " + 存档目录);
    } else {
        记下跑成功();
        记("=== 结束：全部完成 ===");
        发通知("✅ 游戏签到完成（" + 今天() + "）");
    }
}

try {
    main();
} catch (e) {
    记("✗ 脚本崩了：" + e.message);
    发通知("❌ 游戏签到脚本崩了：" + e.message);
} finally {
    // 释放模板图占的内存
    for (var k in 模板缓存) {
        try { 模板缓存[k].recycle(); } catch (e3) {}
    }
    try { device.cancelKeepingAwake(); } catch (e4) {}
}
