/*
 * 准备工具 —— 跑正式脚本之前，先用它做两件事
 * 运行环境：AutoX.js（或 Auto.js 4.1），安卓
 *
 *   1. 查出游戏的「包名」（填进 daily-login.js 的配置区）
 *   2. 连续截图存到手机里，你再从截图里裁剪出「模板小图」
 *
 * 什么是模板小图：就是把「签到按钮」「关闭的 X」这些你想让脚本点的东西，
 * 从整张截图里裁出来，单独存成一个小图片。脚本每次会拿这张小图去屏幕上
 * 对比，找到了就点。裁的时候只留按钮本身，别把周围会变的东西
 * （数字、倒计时、头像、背景动画）裁进去，否则每天长得不一样就找不到了。
 *
 * 裁好的小图统统放进手机的 /sdcard/game-bot/tpl/ 文件夹，
 * 文件名要和 daily-login.js 配置区里写的一致（close.png、signin_entry.png…）。
 */

"auto";

var 根目录 = "/sdcard/game-bot/";
var 截图目录 = 根目录 + "screens/";
var 模板目录 = 根目录 + "tpl/";

function 确保目录() {
    files.createWithDirs(截图目录 + "x");
    files.createWithDirs(模板目录 + "x");
}

// ---------- 功能一：找包名 ----------

function 列出应用(关键字) {
    var 结果 = [];
    try {
        var pm = context.getPackageManager();
        var 全部 = pm.getInstalledApplications(0);
        for (var i = 0; i < 全部.size(); i++) {
            var a = 全部.get(i);
            var 是系统应用 = (a.flags & 1) !== 0;
            if (是系统应用) continue;
            var 名称 = "";
            try {
                名称 = pm.getApplicationLabel(a).toString();
            } catch (e) {
                名称 = a.packageName;
            }
            if (!关键字 ||
                名称.toLowerCase().indexOf(关键字.toLowerCase()) >= 0 ||
                a.packageName.toLowerCase().indexOf(关键字.toLowerCase()) >= 0) {
                结果.push({ 名称: 名称, 包名: a.packageName });
            }
        }
    } catch (e) {
        // 少数系统拿不到完整列表，退回用应用名精确查
        toast("列不出应用清单，改用精确名字查询");
        if (关键字) {
            var pkg = app.getPackageName(关键字);
            if (pkg) 结果.push({ 名称: 关键字, 包名: pkg });
        }
    }
    结果.sort(function (a, b) { return a.名称 < b.名称 ? -1 : 1; });
    return 结果;
}

function 查包名() {
    var 关键字 = dialogs.rawInput(
        "输入游戏名的一部分（中英文都行，留空 = 列出全部已安装应用）", "");
    if (关键字 === null) return;

    var 清单 = 列出应用(关键字.trim());
    if (清单.length === 0) {
        dialogs.alert("没找到", "换个关键字试试，或者留空列出全部。");
        return;
    }

    var 选项 = [];
    for (var i = 0; i < 清单.length; i++) {
        选项.push(清单[i].名称 + "  ·  " + 清单[i].包名);
    }
    var idx = dialogs.select("找到 " + 清单.length + " 个，选你的游戏", 选项);
    if (idx < 0) return;

    var 选中 = 清单[idx];
    var 文本 = 选中.名称 + "\n包名：" + 选中.包名;
    log("========================================");
    log("游戏：" + 选中.名称);
    log("包名：" + 选中.包名);
    log("把上面这行包名填进 daily-login.js 配置区的「游戏包名」");
    log("========================================");
    try {
        setClip(选中.包名);
        文本 += "\n\n（已复制到剪贴板）";
    } catch (e) {}
    dialogs.alert("这就是包名", 文本 + "\n\n填进 daily-login.js 的「游戏包名」那一行。");
}

// ---------- 功能二：连续截图 ----------

function 连拍() {
    var 横屏 = dialogs.confirm("游戏是横屏的吗？",
        "横屏游戏选「是」。选错了截出来的图会是歪的。");

    var 张数文本 = dialogs.rawInput("要连拍几张？（每 3 秒一张）", "20");
    var 张数 = parseInt(张数文本, 10);
    if (isNaN(张数) || 张数 <= 0) 张数 = 20;

    var 拿到了 = 横屏 ? images.requestScreenCapture(true) : images.requestScreenCapture();
    if (!拿到了) {
        dialogs.alert("失败", "没拿到截图权限。弹授权框时要点「立即开始」。");
        return;
    }

    确保目录();
    // 记下分辨率，正式脚本会拿它对照，换机或改了显示大小会提醒你重截
    files.write(模板目录 + "meta.json",
        JSON.stringify({ width: device.width, height: device.height, 横屏: 横屏 }));

    dialogs.alert("准备开始",
        "点确定后有 8 秒时间，请赶快切到游戏里。\n\n" +
        "接下来会每 3 秒截一张，共 " + 张数 + " 张。\n" +
        "这段时间你就正常手动玩一遍每日签到的流程，\n" +
        "脚本会把每一步都拍下来。");

    for (var i = 8; i > 0; i--) {
        toast("还有 " + i + " 秒");
        sleep(1000);
    }

    var 成功 = 0;
    for (var n = 1; n <= 张数; n++) {
        var 屏 = captureScreen();
        if (屏) {
            var 路径 = 截图目录 + "shot_" + (n < 10 ? "0" + n : n) + ".png";
            images.save(屏, 路径);
            try { 屏.recycle(); } catch (e) {}
            成功++;
            toast("已拍 " + 成功 + "/" + 张数);
        }
        sleep(3000);
    }

    log("共拍了 " + 成功 + " 张，存在：" + 截图目录);
    dialogs.alert("拍完了（" + 成功 + " 张）",
        "存放位置：\n" + 截图目录 + "\n\n" +
        "下一步：用手机相册或任意图片编辑 App 打开这些截图，\n" +
        "把要点的按钮单独裁出来存成小图，\n" +
        "放进 " + 模板目录 + "，\n" +
        "文件名跟 daily-login.js 里写的对上即可。");
}

// ---------- 功能三：看看现在屏幕上能不能找到某张模板图 ----------

function 试找图() {
    确保目录();
    var 全部 = files.listDir(模板目录, function (name) {
        return name.toLowerCase().endsWith(".png") || name.toLowerCase().endsWith(".jpg");
    });
    if (!全部 || 全部.length === 0) {
        dialogs.alert("还没有模板图",
            "先用「连续截图」拍几张，裁好按钮小图放进：\n" + 模板目录);
        return;
    }

    var idx = dialogs.select("选一张模板图来试", 全部);
    if (idx < 0) return;
    var 名 = 全部[idx];

    var 横屏 = dialogs.confirm("游戏是横屏的吗？", "要和拍模板图时一致。");
    var 拿到了 = 横屏 ? images.requestScreenCapture(true) : images.requestScreenCapture();
    if (!拿到了) {
        dialogs.alert("失败", "没拿到截图权限。");
        return;
    }

    dialogs.alert("准备", "点确定后有 8 秒，请切到游戏里、停在这张图该出现的那个画面。");
    for (var i = 8; i > 0; i--) {
        toast("还有 " + i + " 秒");
        sleep(1000);
    }

    var tpl = images.read(模板目录 + 名);
    if (!tpl) {
        dialogs.alert("读不出来", "这个文件不是有效图片：" + 名);
        return;
    }

    // 从宽松到严格试一遍，告诉你这张图该配多少相似度
    var 门槛列表 = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7];
    var 屏 = captureScreen();
    var 报告 = [];
    var 最佳 = null;
    for (var k = 0; k < 门槛列表.length; k++) {
        var p = images.findImage(屏, tpl, { threshold: 门槛列表[k] });
        if (p) {
            报告.push("相似度 " + 门槛列表[k] + " → 找到，位置 (" + p.x + ", " + p.y + ")");
            if (!最佳) 最佳 = 门槛列表[k];
        } else {
            报告.push("相似度 " + 门槛列表[k] + " → 找不到");
        }
    }
    try { 屏.recycle(); } catch (e) {}
    try { tpl.recycle(); } catch (e) {}

    var 结论 = 最佳
        ? "建议把 daily-login.js 的「相似度」设成 " + 最佳 + " 或再低一点点。"
        : "六个档位全都找不到。多半是：模板图裁太大（把会变的东西裁进去了）、\n" +
          "或者截模板时的屏幕方向/分辨率跟现在不一样。";

    log(报告.join("\n"));
    dialogs.alert("试找结果：" + 名, 报告.join("\n") + "\n\n" + 结论);
}

// ---------- 菜单 ----------

function main() {
    确保目录();
    while (true) {
        var 选 = dialogs.select("准备工具 —— 想做什么？", [
            "1. 查游戏包名",
            "2. 连续截图（拍下签到流程）",
            "3. 试一张模板图现在找不找得到",
            "退出"
        ]);
        if (选 < 0 || 选 === 3) break;
        if (选 === 0) 查包名();
        if (选 === 1) 连拍();
        if (选 === 2) 试找图();
    }
    toast("再见");
}

main();
