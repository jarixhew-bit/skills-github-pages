/*
 * 自检 —— 在手机上跑，确认「脚本该有的能力现在都是好的」
 * 运行环境：AutoX.js（或 Auto.js 4.1），安卓
 *
 * 什么时候跑它：
 *   · 第一次装好、还没开始配置的时候（确认环境没问题）
 *   · 正式脚本突然失灵的时候（先跑这个，能直接告诉你坏在哪一层）
 *   · 换手机、系统升级、AutoX.js 升级之后
 *
 * 为什么要有它：正式脚本失败时症状都一样（「就是没签到成功」），
 * 但原因可能是无障碍关了、截图权限没给、分辨率变了、模板图裁坏了——
 * 这四件事要分开查。自检就是把这四层各验一遍，直接告诉你是哪一层断的。
 *
 * 特别说明第 4 项「找图功能」：它不只验「找得到」，还验「找不到的时候
 * 真的会说找不到」。只验前者的话，万一 findImage 退化成「永远返回第一个
 * 位置」，自检照样全绿，而正式脚本会每天点错地方。
 */

"auto";

var 模板目录 = "/sdcard/game-bot/tpl/";
var 结果 = [];

function 记(通过, 项目, 说明) {
    结果.push({ 通过: 通过, 项目: 项目, 说明: 说明 });
    log((通过 ? "✓ " : "✗ ") + 项目 + "：" + 说明);
}

// ---------- 1. 无障碍服务 ----------
function 查无障碍() {
    if (auto.service) {
        记(true, "无障碍服务", "已开启，脚本能点得动屏幕");
    } else {
        记(false, "无障碍服务", "没开。去 设置 → 无障碍 → 打开 AutoX.js。不开的话脚本看得到但点不动。");
    }
    return !!auto.service;
}

// ---------- 2. 截图权限 ----------
var 全屏图 = null;

function 查截图权限(横屏) {
    var 拿到了 = false;
    try {
        拿到了 = 横屏 ? images.requestScreenCapture(true) : images.requestScreenCapture();
    } catch (e) {
        记(false, "截图权限", "申请时报错：" + e.message);
        return false;
    }
    if (!拿到了) {
        记(false, "截图权限", "没拿到。弹授权框时要点「立即开始」，别点取消。");
        return false;
    }
    记(true, "截图权限", "已拿到");
    return true;
}

// ---------- 3. 真的截得到画面（不是黑屏） ----------
function 数颜色(img, 采样数) {
    var 见过 = {};
    var 个数 = 0;
    var w = img.getWidth(), h = img.getHeight();
    for (var i = 0; i < 采样数; i++) {
        var x = Math.floor(Math.random() * w);
        var y = Math.floor(Math.random() * h);
        var c = images.pixel(img, x, y);
        if (!见过[c]) { 见过[c] = true; 个数++; }
    }
    return 个数;
}

function 查截图内容() {
    全屏图 = captureScreen();
    if (!全屏图) {
        记(false, "截得到画面", "captureScreen() 什么都没返回");
        return false;
    }
    var w = 全屏图.getWidth(), h = 全屏图.getHeight();
    var 颜色数 = 数颜色(全屏图, 300);
    if (颜色数 <= 2) {
        记(false, "截得到画面",
            "截到的是纯色（" + w + "x" + h + "，只有 " + 颜色数 + " 种颜色）。" +
            "多半是屏幕锁着、或这个 App 禁止截屏。");
        return false;
    }
    记(true, "截得到画面", w + "x" + h + "，采样到 " + 颜色数 + " 种颜色，是真实画面");
    return true;
}

// ---------- 4. 找图功能真的在工作（阳性 + 阴性双向验） ----------
function 查找图() {
    if (!全屏图) {
        记(false, "找图功能", "没有可用的屏幕截图，跳过");
        return false;
    }
    var w = 全屏图.getWidth(), h = 全屏图.getHeight();

    // 从画面里挑一块「花的」区域当模板：纯色区域拿来验证没有意义
    var 块宽 = Math.max(40, Math.floor(w / 10));
    var 块高 = Math.max(40, Math.floor(h / 20));
    var 模板 = null, 起x = 0, 起y = 0, 找到花的 = false;

    for (var 试 = 0; 试 < 12 && !找到花的; 试++) {
        起x = Math.floor(Math.random() * (w - 块宽));
        起y = Math.floor(Math.random() * (h - 块高));
        var 候选 = images.clip(全屏图, 起x, 起y, 块宽, 块高);
        if (数颜色(候选, 60) >= 8) {
            模板 = 候选;
            找到花的 = true;
        } else {
            try { 候选.recycle(); } catch (e) {}
        }
    }
    if (!模板) {
        记(false, "找图功能",
            "当前画面太单调，验不了。请切到一个花一点的画面（游戏里、或相册看张照片）再跑一次。");
        return false;
    }

    var 阳性过 = false, 阴性过 = false;

    // 阳性：这块图确实来自屏幕，必须找得到，而且位置要对得上
    try {
        var p = images.findImage(全屏图, 模板, { threshold: 0.9 });
        if (p && Math.abs(p.x - 起x) <= 3 && Math.abs(p.y - 起y) <= 3) {
            阳性过 = true;
            记(true, "找图（找得到）", "在 (" + p.x + ", " + p.y + ") 找到，和实际位置 (" +
                起x + ", " + 起y + ") 对得上");
        } else if (p) {
            记(false, "找图（找得到）", "找到了但位置不对：说在 (" + p.x + ", " + p.y +
                ")，实际在 (" + 起x + ", " + 起y + ")");
        } else {
            记(false, "找图（找得到）", "从屏幕上裁下来的图，回头却找不到——找图功能不正常");
        }
    } catch (e) {
        记(false, "找图（找得到）", "报错：" + e.message);
    }

    // 阴性：把搜索范围限制在「这块图肯定不在」的地方，必须找不到。
    // 少了这一项，「永远返回找到」的坏掉的实现也能骗过上面那一项。
    try {
        var 别处x = (起x + Math.floor(w / 2)) % Math.max(1, w - 块宽);
        var 别处y = (起y + Math.floor(h / 2)) % Math.max(1, h - 块高);
        // 确保这个范围和模板原位置没有重叠
        if (Math.abs(别处x - 起x) < 块宽) 别处x = (别处x + 块宽 * 2) % Math.max(1, w - 块宽);
        if (Math.abs(别处y - 起y) < 块高) 别处y = (别处y + 块高 * 2) % Math.max(1, h - 块高);

        var q = images.findImage(全屏图, 模板, {
            threshold: 0.9,
            region: [别处x, 别处y, Math.min(块宽 + 10, w - 别处x), Math.min(块高 + 10, h - 别处y)]
        });
        if (!q) {
            阴性过 = true;
            记(true, "找图（找不到时会说找不到）", "限定在无关区域搜索，正确地返回了「没找到」");
        } else {
            记(false, "找图（找不到时会说找不到）",
                "在不该有的区域也报「找到」——这种情况下正式脚本会每天点错位置");
        }
    } catch (e) {
        记(false, "找图（找不到时会说找不到）", "报错：" + e.message);
    }

    try { 模板.recycle(); } catch (e) {}
    return 阳性过 && 阴性过;
}

// ---------- 5. 模板图与分辨率 ----------
function 查模板() {
    if (!files.exists(模板目录)) {
        记(false, "模板图", "目录还不存在：" + 模板目录 + "（先跑 capture-helper.js）");
        return false;
    }
    var 全部 = files.listDir(模板目录, function (name) {
        var n = name.toLowerCase();
        return n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg");
    });
    if (!全部 || 全部.length === 0) {
        记(false, "模板图", "一张都没有。先跑 capture-helper.js 截图并裁出按钮小图。");
        return false;
    }

    var 坏的 = [];
    var 太大的 = [];
    for (var i = 0; i < 全部.length; i++) {
        var img = null;
        try {
            img = images.read(模板目录 + 全部[i]);
        } catch (e) {
            img = null;
        }
        if (!img) {
            坏的.push(全部[i]);
            continue;
        }
        if (img.getWidth() > device.width || img.getHeight() > device.height) {
            太大的.push(全部[i] + "(" + img.getWidth() + "x" + img.getHeight() + ")");
        }
        try { img.recycle(); } catch (e) {}
    }

    if (坏的.length > 0) {
        记(false, "模板图", "这几个读不出来（不是有效图片）：" + 坏的.join("、"));
    } else if (太大的.length > 0) {
        记(false, "模板图", "这几张比屏幕还大，永远找不到：" + 太大的.join("、"));
    } else {
        记(true, "模板图", "共 " + 全部.length + " 张，全部可读：" + 全部.join("、"));
    }

    // 分辨率对照
    var meta = 模板目录 + "meta.json";
    if (files.exists(meta)) {
        try {
            var m = JSON.parse(files.read(meta));
            if (m.width === device.width && m.height === device.height) {
                记(true, "分辨率", "和截模板时一致（" + device.width + "x" + device.height + "）");
            } else {
                记(false, "分辨率",
                    "对不上：模板是在 " + m.width + "x" + m.height + " 截的，现在是 " +
                    device.width + "x" + device.height + "。改过「显示大小」或换了手机，模板图要重截。");
            }
        } catch (e) {
            记(false, "分辨率", "meta.json 读不出来，重跑一次 capture-helper.js 的连拍会重新生成");
        }
    } else {
        记(true, "分辨率", "没有 meta.json（旧版留下的模板图），无法对照，跳过");
    }
    return 坏的.length === 0 && 太大的.length === 0;
}

// ---------- 汇总 ----------
function main() {
    log("========== 开始自检 ==========");

    var 横屏 = dialogs.confirm("游戏是横屏的吗？", "选错的话截图会是歪的，自检结果不准。");

    查无障碍();
    if (查截图权限(横屏)) {
        if (查截图内容()) {
            查找图();
        }
    }
    查模板();

    if (全屏图) { try { 全屏图.recycle(); } catch (e) {} }

    var 失败 = [];
    for (var i = 0; i < 结果.length; i++) {
        if (!结果[i].通过) 失败.push("✗ " + 结果[i].项目 + "\n   " + 结果[i].说明);
    }

    log("========== 自检结束 ==========");
    if (失败.length === 0) {
        log("全部通过（" + 结果.length + " 项）");
        dialogs.alert("自检通过 ✅",
            "" + 结果.length + " 项全过。\n\n环境没问题，可以跑 daily-login.js 了。\n" +
            "第一次请手动跑一次看着它走完，确认没问题再设定时。");
    } else {
        log("不通过，" + 失败.length + " 项有问题");
        dialogs.alert("自检不通过（" + 失败.length + " 项）", 失败.join("\n\n"));
    }
}

main();
