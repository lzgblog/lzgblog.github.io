/* ============================================================================
 * modules/shell.js —— 站点"外壳"行为（快捷键 / 夜间动画 / 标题恶搞 / 搜索框 / 手机滚动条）
 * ----------------------------------------------------------------------------
 * 本文件由 source/js/fomal.js 拆出（2026-10-03 屎山重构）。
 * 【重要】这里故意不套 IIFE：主题 pug 模板里有大量内联 onclick="xxx()"，
 *        以及别的脚本会直接调全局函数，所以本文件里的声明必须留在全局作用域。
 * ----------------------------------------------------------------------------
 * 包含的模块（括号内为拆分前在 fomal.js 里的行号）：
 *   · 禁用f12与按键防抖（204-266）—— 拦 F12/Ctrl+Shift+I 等开发者工具快捷键；同时给防抖工具函数
 *   · 夜间模式切换动画（1161-1233）—— 深浅色切换时的那层扩散/渐变过渡动画（2026-10-11 提速：整屏遮挡 ~3s → ~1.5s）
 *   · 恶搞标题（1271-1305）—— 切走标签页时把标题改成花式文案，切回来恢复
 *   · 搜索框修复（1309-1322）—— 手机端 Algolia 搜索窗口最大高度自适应
 *   · 手机端自绘滚动条（2927-2978）—— 手机浏览器忽略 ::-webkit-scrollbar，这里自绘一条 #mscrollbar
 * ----------------------------------------------------------------------------
 * 不直接对应某个可见组件，属于"整个站点的行为策略"。
 * 加载方式：_config.fomalhaut.yml 的 inject.bottom 列表里以 <script defer> 引用。
 * ----------------------------------------------------------------------------
 * 【本文件目录】（行号随后续编辑漂移，找不到就 Ctrl+F 搜函数名）
 *    32  TT
 *    34  debounce(fn, time)
 *    104  NIGHT_SKY_FADE_MS / NIGHT_PLANET_MS / NIGHT_ICON_MS / NIGHT_NOTIFY_MS / nightModeOverlay
 *    110  nightModeReducedMotion()
 *    119  clearNightModeOverlay()
 *    128  buildNightModeOverlay(toDark)
 *    156  prewarmNightWallpaper()      ← 上面 5 个都是 2026-10-11 夜间动画提速时新增/拆出的
 *    179  switchNightMode()            ← 主题三处 pug 的内联 onclick 调它
 *    246  OriginTitile / PRANK_TITLES / titleTime
 *    284  searchSize()
 * ========================================================================== */

/* ------------------------------ 禁用f12与按键防抖 ------------------------------ */
/* 原 fomal.js 204-266 行，原样搬运，未改逻辑 */
/* 禁用f12与按键防抖 start */
// 防抖全局计时器
let TT = null;    //time用来控制事件的触发
// 防抖函数:fn->逻辑 time->防抖时间
function debounce(fn, time) {
  if (TT !== null) clearTimeout(TT);
  TT = setTimeout(fn, time);
}

// 复制提醒
document.addEventListener("copy", function () {
  debounce(function () {
    fomalNotify({
          title: "哎嘿！复制成功🍬",
          message: "若要转载最好保留原文链接哦，给你一个大大的赞！",
          position: 'top-left',
          offset: 50,
          showClose: true,
          type: "success",
          duration: 5000
        })
  }, 300);
})

/* 禁用F12按键并提醒 */
// document.onkeydown = function () {
//     if (window.event && window.event.keyCode == 123) {
//         event.keyCode = 0;
//         event.returnValue = false;
//         new Vue({
//             data: function () {
//                 this.$notify({
//                     title: "喂喂，小伙子你在干嘛！",
//                     message: "你太坏了，这里可不允许查看源码哦！",
//                     position: 'top-left',
//                     offset: 50,
//                     showClose: false,
//                     type: "error"
//                 });
//                 return { visible: false }
//             }
//         })
//         return false;
//     }
// };

// f12提醒但不禁用
document.onkeydown = function (e) {
  if (123 == e.keyCode || (e.ctrlKey && e.shiftKey && (74 === e.keyCode || 73 === e.keyCode || 67 === e.keyCode)) || (e.ctrlKey && 85 === e.keyCode)) {
    debounce(function () {
      fomalNotify({
            title: "你已被发现😜",
            message: "小伙子，扒源记住要遵循GPL协议！",
            position: 'top-left',
            offset: 50,
            showClose: true,
            type: "warning",
            duration: 5000
          })
    }, 300);
  }
};
/* 禁用f12与按键防抖 end */

/* ------------------------------ 夜间模式切换动画 ------------------------------ */
/* 原 fomal.js 1161-1233 行，原样搬运，未改逻辑 */
/* 夜间模式切换动画 start */
/* 2026-10-11「黄昏落幕」：默认档从「一个 200% 的大转盘」换成三拍小剧场
   （日落/日出 → 暮色与第一批星 → 星夜铺满，最后从点击处圆形揭幕）。
   ── 时间轴：这里的 DM_* 常量 ↔ source/css/site-inject.css 第 18 块 #darkModeStage，两边要一起改
      DM_BEAT1_MS 450（日落/日出） + DM_BEAT2_MS 450（暮色） + DM_BEAT3_MS 600（星夜） = DM_TOTAL_MS 1500
      DM_REVEAL_AT_MS = BEAT1+BEAT2+250 = 1150 开始揭幕、DM_REVEAL_MS 350 揭完；转昼整体 × DM_LIGHT_K(0.8) → 1200ms
   ── 档位 localStorage 'darkTransition'（设置面板「氛围特效 › 昼夜切换」）：
      off 关（不建遮罩，瞬时切）  light 轻（第 17 块那套 1.5s 老转盘，留着）
      standard 标准（默认，三拍 + 揭幕）  flourish 华丽（再加云、第二颗流星，星空与萤火虫跟着一起亮）
   ── 与旧版一致：连点第二次当场收尾不重播；系统「减少动态效果」瞬时切换；
      遮罩自己持有节点引用，收得干净；只动 opacity / transform / mask，不新建 canvas、不跑 rAF
      （手机 ≤600px 星星减半、云由 CSS 关掉） */
var NIGHT_SKY_FADE_MS = 750;   // 「轻」档：天空交叉淡化 / 遮罩淡出时长（CSS 第 17 块同步这个值）
var NIGHT_PLANET_MS = 1000;    // 「轻」档：星球转一圈（CSS 第 17 块同步这个值）
var NIGHT_ICON_MS = 500;       // 太阳 ↔ 月亮互换
var NIGHT_NOTIFY_MS = 1000;    // 「轻」档：切完等多久弹提醒（标准/华丽档改成弹在整屏遮挡结束时）
var DM_BEAT1_MS = 450;         // 第一拍：日落 / 日出
var DM_BEAT2_MS = 450;         // 第二拍：暮色 + 第一批星
var DM_BEAT3_MS = 600;         // 第三拍：星夜铺满 + 揭幕
var DM_TOTAL_MS = DM_BEAT1_MS + DM_BEAT2_MS + DM_BEAT3_MS;   // 1500：整屏遮挡总时长
var DM_REVEAL_LAG_MS = 250;    // 第三拍里再等 250ms 才揭幕（先让星星铺一半，别一揭幕就全黑）
var DM_REVEAL_AT_MS = DM_BEAT1_MS + DM_BEAT2_MS + DM_REVEAL_LAG_MS;   // 1150
var DM_REVEAL_MS = 350;        // 圆形揭幕时长（含在第三拍里）
var DM_LIGHT_K = 0.8;          // 转昼整体 ×0.8 → 1200ms
var DM_TIER_KEY = 'darkTransition';
var DM_TIERS = ['off', 'light', 'standard', 'flourish'];
var DM_STAR_MAX = 40;          // 桌面星星数（手机减半）
var dmLastPoint = null;        // 最后一次按下 / 点击的位置 → 圆形揭幕的圆心
var nightModeOverlay = null;   // 正在播放的遮罩 { node, tier, timers, followers }

/* 记住点击位置（capture 阶段，哪个入口点的都算）——揭幕就从这里开始 */
function dmRememberPoint(e) {
  if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
    dmLastPoint = { x: e.clientX, y: e.clientY };
  }
}
try { document.addEventListener('pointerdown', dmRememberPoint, true); } catch (e) {}

/* 当前档位；没设过 / 值不认识都算标准档 */
function dmTier() {
  try {
    var v = localStorage.getItem(DM_TIER_KEY);
    return DM_TIERS.indexOf(v) >= 0 ? v : 'standard';
  } catch (e) {
    return 'standard';
  }
}

/* 揭幕圆心：优先用最后一次点击的位置，退到模式按钮中心，再退到右上角 */
function dmOrigin() {
  if (dmLastPoint) return dmLastPoint;
  try {
    var btn = document.getElementById('nightmode-button') || document.getElementById('modeicon');
    var r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
    if (r && (r.width || r.height)) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  } catch (e) {}
  return { x: (window.innerWidth || 1200) - 48, y: 64 };
}

function nightModeReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

/* 清掉残留遮罩：连点第二次、或上次动画被打断时用；顺带取消它的定时器、把联动层还原 */
function clearNightModeOverlay() {
  var st = nightModeOverlay;
  nightModeOverlay = null;
  if (!st) return;
  for (var i = 0; i < st.timers.length; i++) clearTimeout(st.timers[i]);
  dmResetFollowers(st);
  if (st.node && st.node.parentNode) st.node.parentNode.removeChild(st.node);
}

/* 把「联动层」（星空 canvas / 萤火虫层）的临时透明度还原，别给页面留脏 inline 样式 */
function dmResetFollowers(st) {
  if (!st || !st.followers) return;
  for (var i = 0; i < st.followers.length; i++) {
    st.followers[i].style.opacity = '';
    st.followers[i].style.transition = '';
  }
  st.followers.length = 0;
}

/* 按档位选剧本：light → 老转盘；standard / flourish → 三拍小剧场 */
function buildNightModeOverlay(toDark) {
  if (dmTier() === 'light') return buildLegacyNightOverlay(toDark);
  return buildStageNightOverlay(toDark, dmTier());
}

/* 「轻」档：原来的大转盘（太阳月亮互换 → 整屏淡出 → 移除）。toDark=true 表示这次是转向夜间 */
function buildLegacyNightOverlay(toDark) {
  var sky = document.createElement('div');
  sky.className = 'Cuteen_DarkSky';
  sky.innerHTML = '<div class="Cuteen_DarkPlanet"><div id="sun"></div><div id="moon"></div></div>';
  document.querySelector('body').appendChild(sky);
  var st = { node: sky, tier: 'light', sun: sky.querySelector('#sun'), moon: sky.querySelector('#moon'), timers: [], followers: [] };
  nightModeOverlay = st;
  // 先设置太阳月亮透明度（与原逻辑一致：转暗先出太阳，转亮先出月亮）
  if (st.sun) st.sun.style.opacity = toDark ? '1' : '0';
  if (st.moon) st.moon.style.opacity = toDark ? '0' : '1';
  st.timers.push(setTimeout(function () {
    if (nightModeOverlay !== st) return;   // 已被后续点击作废
    if (st.sun) st.sun.style.opacity = toDark ? '0' : '1';
    if (st.moon) st.moon.style.opacity = toDark ? '1' : '0';
  }, NIGHT_ICON_MS));
  st.timers.push(setTimeout(function () {
    if (nightModeOverlay !== st) return;
    sky.style.transition = 'opacity ' + NIGHT_SKY_FADE_MS + 'ms';
    sky.style.opacity = '0';
    st.timers.push(setTimeout(function () {
      if (nightModeOverlay === st) nightModeOverlay = null;
      if (sky.parentNode) sky.parentNode.removeChild(sky);
    }, NIGHT_SKY_FADE_MS));
  }, NIGHT_SKY_FADE_MS));
}

/* 华丽档的联动：让站点已有的星空 canvas 与萤火虫层跟着幕布一起亮 / 一起灭，
   而不是切完突然出现。只在它们当前是显示状态时接管，收尾一律还原成空字符串。 */
function dmFollowAmbience(st, toDark) {
  var ids = ['universe', 'fireflies-stage'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (!el || !el.style) continue;
    if (el.style.display === 'none') continue;
    st.followers.push(el);
  }
  if (!st.followers.length) return;
  var k = toDark ? 1 : DM_LIGHT_K;
  var fade = Math.round(DM_BEAT2_MS * k);
  for (var j = 0; j < st.followers.length; j++) {
    st.followers[j].style.transition = 'opacity ' + fade + 'ms ease';
    st.followers[j].style.opacity = toDark ? '0' : '1';
  }
  st.timers.push(setTimeout(function () {
    if (nightModeOverlay !== st) return;
    for (var m = 0; m < st.followers.length; m++) {
      st.followers[m].style.opacity = toDark ? '1' : '0';
    }
  }, Math.round((toDark ? DM_BEAT1_MS : 60) * k)));
}

/* 标准 / 华丽档：搭三拍小剧场的 DOM，并把「揭幕」与「收尾」两个时刻排好。
   动画本身全在 CSS（第 18 块），这里只负责节点、星层、揭幕圆心与两个定时器。 */
function buildStageNightOverlay(toDark, tier) {
  var stage = document.createElement('div');
  stage.className = 'dm-stage';
  stage.setAttribute('data-to', toDark ? 'dark' : 'light');
  stage.setAttribute('data-tier', tier);
  stage.innerHTML = '<div class="dm-sky"></div><div class="dm-dusk"></div><div class="dm-stars"></div>' +
    '<div class="dm-sun"></div><div class="dm-moon"></div>' +
    (tier === 'flourish' ? '<div class="dm-clouds"><i></i><i></i></div>' : '') +
    '<div class="dm-horizon"></div><div class="dm-glow"></div><div class="dm-meteor"></div>';
  var st = { node: stage, tier: tier, timers: [], followers: [] };
  var p = dmOrigin();
  stage.style.setProperty('--dm-x', Math.round(p.x) + 'px');
  stage.style.setProperty('--dm-y', Math.round(p.y) + 'px');
  // 星层：桌面 40 颗、手机 20 颗；前 20% 在第二拍先亮（暮色那批），剩下的等到第三拍揭幕前铺满
  var total = ((window.innerWidth || 1280) <= 600) ? Math.round(DM_STAR_MAX / 2) : DM_STAR_MAX;
  var first = Math.max(1, Math.round(total * 0.2));
  var box = stage.querySelector('.dm-stars');
  var frag = document.createDocumentFragment();
  for (var i = 0; i < total; i++) {
    var star = document.createElement('span');
    star.className = 'dm-star';
    var delay = (i < first) ? (DM_BEAT1_MS + 30 + i * 20) : (DM_REVEAL_AT_MS - 270 + (i - first) * 12);
    star.style.cssText = '--dm-sx:' + (Math.random() * 98 + 1).toFixed(2) + '%;--dm-sy:' + (Math.random() * 56 + 2).toFixed(2) + '%;' +
      '--dm-ss:' + (Math.random() < 0.25 ? '2.6' : '1.8') + 'px;--dm-sd:' + Math.round(delay) + 'ms;' +
      '--dm-so:' + (0.6 + Math.random() * 0.4).toFixed(2) + ';';
    frag.appendChild(star);
  }
  if (box) box.appendChild(frag);
  document.querySelector('body').appendChild(stage);
  nightModeOverlay = st;
  if (tier === 'flourish') dmFollowAmbience(st, toDark);
  var k = toDark ? 1 : DM_LIGHT_K;
  st.timers.push(setTimeout(function () {
    if (nightModeOverlay !== st) return;
    stage.classList.add('is-reveal');   // 圆形揭幕：--dm-r 0 → 160vmax（CSS 过渡 350ms）
  }, Math.round(DM_REVEAL_AT_MS * k)));
  st.timers.push(setTimeout(function () {
    if (nightModeOverlay === st) nightModeOverlay = null;
    dmResetFollowers(st);
    if (stage.parentNode) stage.parentNode.removeChild(stage);
  }, Math.round(DM_TOTAL_MS * k)));
  return st;
}

/* 空闲时预热夜间壁纸：夜间图平时不在页面上，浏览器不会提前下载，切过去才开取会出现「背景还在加载」的空档。
   读 --darkmode-bg 的计算值而不是写死 URL —— beauty-boot.js 允许访客换自定义壁纸，夜间图会跟着变。 */
function prewarmNightWallpaper() {
  try {
    var raw = getComputedStyle(document.documentElement).getPropertyValue('--darkmode-bg') || '';
    var i = raw.indexOf('url(');
    if (i < 0) return;
    var url = raw.slice(i + 4);
    var j = url.indexOf(')');
    if (j >= 0) url = url.slice(0, j);
    url = url.trim();
    if (url.charAt(0) === '"' || url.charAt(0) === "'") url = url.slice(1);
    if (url.slice(-1) === '"' || url.slice(-1) === "'") url = url.slice(0, -1);
    if (!url) return;
    var img = new Image();
    img.decoding = 'async';
    img.src = url;
  } catch (e) {}
}
if (window.requestIdleCallback) {
  requestIdleCallback(prewarmNightWallpaper, { timeout: 4000 });
} else {
  setTimeout(prewarmNightWallpaper, 2500);
}

function switchNightMode() {
  // 先存取时间戳
  localStorage.setItem("lastTime", Date.now());

  // 上一次动画还没播完就又点了 → 立刻收尾（清定时器 + 移除遮罩），这次瞬时切换，不重播
  var animate = true;
  if (nightModeOverlay) {
    clearNightModeOverlay();
    animate = false;
  }
  // 系统开了「减少动态效果」→ 不做动画
  if (nightModeReducedMotion()) animate = false;
  // 档位关掉 → 不做动画
  var tier = dmTier();
  if (tier === 'off') animate = false;

  const nowMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  if (animate) buildNightModeOverlay(nowMode === 'light');
  prewarmNightWallpaper();

  // 提醒的时机：动画没播 = 立刻；「轻」档按老节奏；标准 / 华丽档等整屏遮挡快结束时再弹
  var notifyAfter = 0;
  if (animate) {
    notifyAfter = (tier === 'light') ? NIGHT_NOTIFY_MS
      : Math.round((DM_TOTAL_MS - 150) * (nowMode === 'light' ? 1 : DM_LIGHT_K));
  }

  setTimeout(function () {
    document.querySelector('body').classList.contains('DarkMode') ? (document.querySelector('body').classList.remove('DarkMode'), localStorage.setItem('isDark', '0'), document.getElementById('modeicon').setAttribute('xlink:href', '#icon-moon')) : (document.querySelector('body').classList.add('DarkMode'), localStorage.setItem('isDark', '1'), document.getElementById('modeicon').setAttribute('xlink:href', '#icon-sun'))
  }, 0)
  if (nowMode === 'light') {
    activateDarkMode()
    saveToLocal.set('theme', 'dark', 2)
    // GLOBAL_CONFIG.Snackbar !== undefined && btf.snackbarShow(GLOBAL_CONFIG.Snackbar.day_to_night)
    document.getElementById('modeicon').setAttribute('xlink:href', '#icon-sun')
    // 延时弹窗提醒
    setTimeout(() => {
      fomalNotify({
            title: "关灯啦🌙",
            message: "当前已成功切换至夜间模式！",
            position: 'top-left',
            offset: 50,
            showClose: true,
            type: "success",
            duration: 5000
          })
    }, notifyAfter)
  } else {
    activateLightMode()
    saveToLocal.set('theme', 'light', 2)
    document.querySelector('body').classList.add('DarkMode'), document.getElementById('modeicon').setAttribute('xlink:href', '#icon-moon')
    setTimeout(() => {
      fomalNotify({
            title: "开灯啦🌞",
            message: "当前已成功切换至白天模式！",
            position: 'top-left',
            offset: 50,
            showClose: true,
            type: "success",
            duration: 5000
          })
    }, notifyAfter)
  }
  // handle some cases
  typeof utterancesTheme === 'function' && utterancesTheme()
  typeof FB === 'object' && window.loadFBComment()
  window.DISQUS && document.getElementById('disqus_thread').children.length && setTimeout(() => window.disqusReset(), 200)
}

/* 夜间模式切换动画 end */

/* ------------------------------ 恶搞标题 ------------------------------ */
/* 原 fomal.js 1271-1305 行，原样搬运，未改逻辑 */
/* 恶搞标题 start */
//动态标题
// OriginTitile 不能只在加载时抓一次：本站是 pjax 换页，换页后 document.title 已经是新页面的标题，
// 这份「原始标题」不跟着更新的话，切走标签再切回来，两秒后会把标签改回【上一个页面】的标题（偶现）。
var OriginTitile = document.title;
var PRANK_TITLES = ['👀跑哪里去了~', '🐖抓到你啦～'];
var titleTime;
(function keepRealTitle() {
  function note() {
    var t = document.title;
    if (PRANK_TITLES.indexOf(t) < 0) OriginTitile = t; // 只记真标题，不记恶搞标题
  }
  var el = document.querySelector('title');
  if (el && window.MutationObserver) {
    new MutationObserver(note).observe(el, { childList: true, characterData: true, subtree: true });
  }
  // MutationObserver 万一没兜住（老浏览器、或 pjax 手写 title），换页后再补一道
  document.addEventListener('pjax:complete', function () { setTimeout(note, 0); });
})();
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    //离开当前页面时标签显示内容
    document.title = '👀跑哪里去了~';
    clearTimeout(titleTime);
  } else {
    //返回当前页面时标签显示内容
    document.title = '🐖抓到你啦～';
    //两秒后变回正常标题
    titleTime = setTimeout(function () {
      titleTime = null;
      document.title = OriginTitile;
    }, 2000);
  }
});
/* 恶搞标题 end */

/* ------------------------------ 搜索框修复 ------------------------------ */
/* 原 fomal.js 1309-1322 行，原样搬运，未改逻辑 */
/* 搜索框修复 start */
searchSize();
window.addEventListener('resize', searchSize)
// 搜索窗口自适应
function searchSize() {
  // 只需要适应手机端
  if (document.body.clientWidth > 768) return
  let div = document.querySelector('#algolia-hits')
  // 监听插入，如果有插入则根据可视高度动态设置最大高度
  div.addEventListener('DOMNodeInserted', () => {
    div.children[0].style.maxHeight = (document.documentElement.clientHeight - 210) + 'px'
  })
}
/* 搜索框修复 ennd */

/* ------------------------------ 手机端自绘滚动条 ------------------------------ */
/* 原 fomal.js 2927-2978 行，原样搬运，未改逻辑 */
/* 手机端自绘滚动条 start
   手机浏览器用的是系统 overlay 滚动条，会完全忽略 ::-webkit-scrollbar，
   电脑端那条主题色斜条纹在手机宽度下不会出现，所以这里画一条一样的：
   固定在右边缘、长度按可视比例、位置随滚动进度走；只要页面能滚就一直显示，
   与电脑端“滚动条不隐藏”的取舍保持一致（样式见 custom.css 的 #mscrollbar）。 */
(function () {
  var TRACK_ID = "mscrollbar", THUMB_ID = "mscrollbar-thumb";
  var MIN_THUMB = 30;
  var track = null, thumb = null, frame = null;
  var lastHeight = null, lastTransform = null, shown = false;

  function ensure(body) {
    // PJAX 可能替换整条轨道，也可能只替换滑块；不能只验证 track。
    if (track && thumb && body.contains(track) && track.contains(thumb)) return;
    track = document.getElementById(TRACK_ID);
    if (!track || !body.contains(track)) {
      track = document.createElement("div");
      track.id = TRACK_ID;
      body.appendChild(track);
    }
    thumb = document.getElementById(THUMB_ID);
    if (!thumb || !track.contains(thumb)) {
      thumb = document.createElement("div");
      thumb.id = THUMB_ID;
      track.appendChild(thumb);
    }
    // 新绑定节点以当前值为基准，不继承旧 DOM 的写入缓存。
    lastHeight = thumb.style.height;
    lastTransform = thumb.style.transform;
    shown = track.classList.contains("mscrollbar-on");
  }

  function setVisible(visible) {
    if (shown === visible) return;
    track.classList[visible ? "add" : "remove"]("mscrollbar-on");
    shown = visible;
  }

  function skipDesktop() {
    // 桌面必须在任何高度/滚动布局读取以及节点创建之前退出。
    if (window.innerWidth <= 768) return false;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    if (track && document.body && document.body.contains(track)) {
      setVisible(false);
    } else {
      track = thumb = null;
    }
    return true;
  }

  function update() {
    frame = null;
    if (skipDesktop()) return;
    var body = document.body;
    if (!body) return;
    var doc = document.documentElement;
    // 读阶段：所有滚动/布局值先采样，随后创建节点和写样式，避免读写交错。
    var vh = window.innerHeight || doc.clientHeight;
    var total = Math.max(body.scrollHeight, doc.scrollHeight, body.offsetHeight, doc.offsetHeight);
    var visible = total > vh + 1;
    var height, transform;
    if (visible) {
      var h = Math.max(MIN_THUMB, Math.round(vh * vh / total));
      var ratio = (window.pageYOffset || doc.scrollTop || 0) / (total - vh);
      if (ratio < 0) ratio = 0;
      if (ratio > 1) ratio = 1;
      height = h + "px";
      transform = "translateY(" + Math.round(ratio * (vh - h)) + "px)";
    }
    // 写阶段：节点替换时重绑；相同的像素值和可见状态不重复写入。
    ensure(body);
    if (visible) {
      if (lastHeight !== height) {
        thumb.style.height = height;
        lastHeight = height;
      }
      if (lastTransform !== transform) {
        thumb.style.transform = transform;
        lastTransform = transform;
      }
    }
    setVisible(visible);
  }

  function schedule() {
    if (skipDesktop() || frame !== null) return;
    frame = window.requestAnimationFrame(update);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  document.addEventListener("DOMContentLoaded", schedule);
  document.addEventListener("pjax:complete", schedule);
  if (document.readyState !== "loading") schedule();
})();
/* 手机端自绘滚动条 end */
