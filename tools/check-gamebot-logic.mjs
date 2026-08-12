/*
 * game-bot 步骤引擎的实跑测试 —— 在 node 上跑，不需要安卓。
 *
 * 为什么需要它（2026-08-12）：daily-login.js 的步骤引擎长出了板块结构和
 * 「回主界面」之后，光靠 node --check（语法）和肉眼看已经不够——真正会出事的是
 * 行为：某张模板图没裁时会不会空等？某个板块失败会不会把后面的带塌？
 * 「回主界面」按了返回之后到底有没有回去？这些在手机上要跑一整轮才看得出来，
 * 而手机上跑一轮要好几分钟、还要人盯着。
 *
 * 做法：把 AutoX.js 的安卓 API 全部打桩（captureScreen / images.findImage /
 * click / back / files / device …），喂给脚本一个「假屏幕」状态机，
 * 然后真的把 daily-login.js 跑一遍，检查它做出来的动作序列对不对。
 *
 * 跑法：node tools/check-gamebot-logic.mjs
 * 退出码：0 = 全过；1 = 有断言没过。
 *
 * 副档名是 .mjs 不是 .js：本仓库 package.json 是 type: module，
 * .js 里的 require 会直接失效（diagnosis.md 2026-08-11 记过这个坑）。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "..", "game-bot", "daily-login.js");

// ── 假屏幕：一个状态机。每个界面上「看得见」哪几张模板图。 ──────────────
// 模拟的是一个只配了签到板块的玩家：只裁了 main / signin_entry / claim / ok，
// 其余板块的图都没裁（这正是说明书建议的起步方式，也是最容易出事的情况）。
const 已裁的图 = ["main.png", "signin_entry.png", "claim.png", "ok.png"];

const 界面 = {
    // 主界面：标志物 + 签到入口（入口本来就长在主界面上）
    main: ["main.png", "signin_entry.png"],
    // 点进签到界面：只剩领取按钮，主界面标志物看不见了
    signin: ["claim.png"],
    // 领完弹出奖励框
    signin_claimed: ["ok.png"],
};

// 每张模板图给一个固定坐标，方便从「脚本点了哪个坐标」反推「它点的是哪张图」
const 坐标 = {};
已裁的图.forEach((名, i) => { 坐标[名] = { x: 40 + i * 120, y: 60 }; });
const 模板宽高 = 20;

let 当前界面 = "main";
const 动作 = [];      // 记录脚本做过的每一个动作，最后用来断言
const 日志 = [];

function 现在看得见(名) {
    return (界面[当前界面] || []).indexOf(名) >= 0;
}

function 点到了谁(x, y) {
    for (const 名 of Object.keys(坐标)) {
        const c = { x: 坐标[名].x + 模板宽高 / 2, y: 坐标[名].y + 模板宽高 / 2 };
        // 脚本会给点击加 ±3 像素随机抖动，容差要盖住
        if (Math.abs(x - c.x) <= 4 && Math.abs(y - c.y) <= 4) return 名;
    }
    return null;
}

// ── 安卓 API 打桩 ──────────────────────────────────────────────────
function 假图(名) {
    return {
        __name: 名,
        getWidth: () => 模板宽高,
        getHeight: () => 模板宽高,
        recycle() {},
    };
}

// 虚拟时钟：sleep 推进假时间，脚本里所有 Date.now() 的超时判断都跟着走。
// 不这样做的话，脚本里「等弹窗 12 秒」会变成测试真的空转 12 秒实时（sleep 被打桩
// 成空操作、但超时用的是真实时钟），几个板块加起来直接把测试撑爆。
// 附带好处：跑完能算出这套配置在真机上大约要花多久。
let 虚拟时间 = 1767225600000;   // 固定起点，让每次跑的日志时间戳都一样
const 起始虚拟时间 = 虚拟时间;

class 假Date extends Date {
    constructor(...args) {
        if (args.length === 0) super(虚拟时间);
        else super(...args);
    }
    static now() { return 虚拟时间; }
}

const sandbox = {
    console,
    Math, Date: 假Date, JSON, parseInt, parseFloat, isNaN, String, Number, Object, Array, Error,

    auto: { service: {} },                       // 无障碍已开启
    device: {
        width: 1080, height: 1920,
        wakeUp() { 动作.push("wakeUp"); },
        keepScreenOn() {},
        cancelKeepingAwake() {},
    },
    app: {
        launchPackage(pkg) { 动作.push("launch:" + pkg); return true; },
    },
    images: {
        requestScreenCapture() { return true; },
        read(p) {
            const 名 = path.basename(p);
            return 已裁的图.indexOf(名) >= 0 ? 假图(名) : null;   // 没裁的图读不出来
        },
        save() {},
        findImage(屏, tpl) {
            const 名 = tpl.__name;
            if (!现在看得见(名)) return null;
            return { x: 坐标[名].x, y: 坐标[名].y };
        },
    },
    captureScreen() { return { getWidth: () => 1080, getHeight: () => 1920, recycle() {} }; },
    click(x, y) {
        const 名 = 点到了谁(x, y);
        动作.push("click:" + (名 || `(${x},${y})`));
        // 界面跳转
        if (名 === "signin_entry.png") 当前界面 = "signin";
        else if (名 === "claim.png") 当前界面 = "signin_claimed";
        else if (名 === "ok.png") 当前界面 = "signin";   // 关掉弹窗，留在签到界面
        return true;
    },
    press() { return true; },
    back() {
        动作.push("back");
        // 从任何子界面按返回都回主界面
        当前界面 = "main";
    },
    home() { 动作.push("home"); },
    swipe() {}, gesture() {},
    sleep(ms) { 虚拟时间 += (ms || 0); },          // 推进虚拟时钟，不占实时
    toast() {},
    log(s) { 日志.push(String(s)); },
    exit() { throw { __exit: true }; },
    http: { post() { 动作.push("notify"); } },
    files: {
        // tpl/ 底下只有「已裁的图」那几张存在；state.json / meta.json 一律不存在
        // （模拟今天还没跑过、也没记录过分辨率）
        exists(p) {
            if (String(p).indexOf("/tpl/") >= 0) {
                return 已裁的图.indexOf(path.basename(String(p))) >= 0;
            }
            return false;
        },
        read: () => "{}",
        write() {}, append() {}, createWithDirs() {},
        listDir: () => [],
    },
    dialogs: { confirm: () => false, alert() {}, select: () => -1, rawInput: () => "" },
};
sandbox.global = sandbox;

// ── 跑 ────────────────────────────────────────────────────────────
const 源码 = fs.readFileSync(SCRIPT, "utf8");
const 开始 = Date.now();
try {
    vm.runInNewContext(源码, sandbox, { filename: "daily-login.js", timeout: 20000 });
} catch (e) {
    if (!e || !e.__exit) {
        console.log("✗ 脚本跑崩了：" + (e && e.message ? e.message : e));
        process.exit(1);
    }
}
const 耗时 = Date.now() - 开始;
const 虚拟耗时秒 = Math.round((虚拟时间 - 起始虚拟时间) / 1000);
// 从脚本源码里读出配置的总超时，测试不自己写死一份（写死就会跟配置分叉）
const 超时匹配 = 源码.match(/"总超时分钟"\s*:\s*(\d+)/);
const 配置总超时秒 = 超时匹配 ? parseInt(超时匹配[1], 10) * 60 : 600;

// ── 断言 ──────────────────────────────────────────────────────────
const 全部日志 = 日志.join("\n");
const 动作串 = 动作.join(" | ");
const 失败 = [];

function 要求(条件, 说明, 佐证) {
    if (!条件) 失败.push(说明 + (佐证 ? "\n      实际：" + 佐证 : ""));
}

要求(动作.indexOf("launch:com.yzzg.mdgame") >= 0,
    "应该启动配置里那个包名的游戏", 动作串.slice(0, 160));

要求(动作.indexOf("click:signin_entry.png") >= 0,
    "签到入口应该被点到");

要求(动作.indexOf("click:claim.png") >= 0,
    "签到的领取按钮应该被点到");

要求(动作.indexOf("click:ok.png") >= 0,
    "领奖后的确定框应该被点掉");

// 顺序：必须是先点入口、再点领取。反了说明引擎没按步骤顺序走。
要求(动作.indexOf("click:signin_entry.png") < 动作.indexOf("click:claim.png"),
    "顺序不对：应该先点签到入口，再点领取", 动作串);

// 没裁的图（挂机/体力/邮件/日常）不该产生任何点击
["idle_entry", "idle_claim", "stamina_entry", "stamina_claim",
 "mail_entry", "mail_claim_all", "daily_entry", "daily_claim"].forEach((名) => {
    要求(动作.indexOf("click:" + 名 + ".png") < 0,
        `没裁的模板图 ${名}.png 不该被点到`);
});

// 虚拟耗时 = 这套配置在真机上大约要跑多久。它同时守着两件事：
// (1) 没裁的板块真的立刻跳过（不然这个数字会暴涨）；
// (2) 整轮跑得完，不会撞上配置里的「总超时分钟」而被强制收工。
要求(虚拟耗时秒 < 配置总超时秒,
    `整轮虚拟耗时 ${虚拟耗时秒} 秒，超过配置的总超时 ${配置总超时秒} 秒——真机上会被强制收工`);
要求(虚拟耗时秒 < 240,
    `只配了签到一个板块却要跑 ${虚拟耗时秒} 秒，没裁的板块八成在空等而不是立刻跳过`);

// 「回主界面」要真的把界面带回主界面，而不是盲按一通
要求(全部日志.indexOf("已在主界面") >= 0,
    "「回主界面」应该至少成功确认过一次自己在主界面");

要求(当前界面 === "main",
    "跑完时应该停在主界面", "实际停在：" + 当前界面);

// 整轮不该被判成失败（签到是唯一必须的板块，它有图，应该成功）
要求(全部日志.indexOf("=== 结束：全部完成 ===") >= 0,
    "整轮应该判定为成功完成", 日志.slice(-3).join(" / "));

要求(全部日志.indexOf("脚本崩了") < 0, "脚本不该崩");

// ── 报告 ──────────────────────────────────────────────────────────
if (失败.length > 0) {
    console.log(`不通过（${失败.length} 项）：`);
    失败.forEach((f) => console.log("  ✗ " + f));
    console.log("\n动作序列：\n  " + 动作串);
    process.exit(1);
}
console.log(`通过：步骤引擎实跑 ${动作.length} 个动作——签到板块走通、` +
            `没裁模板的四个板块全部立刻跳过、回主界面有效。\n` +
            `      折算真机耗时约 ${虚拟耗时秒} 秒（配置的总超时是 ${配置总超时秒} 秒），` +
            `测试本身耗时 ${耗时}ms`);
