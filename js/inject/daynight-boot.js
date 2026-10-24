/* ============================================================================
 * source/js/inject/daynight-boot.js —— 全站「日间 / 夜间」首屏预置脚本
 * ----------------------------------------------------------------------------
 * 2026-10-14 新增，修「夜间模式下点『随便逛逛』跳转后变回白天」。
 *
 * 病根：访客**没手动选过**深浅色时，模式本该由当天的真实日出日落决定，
 *   但这条规则的唯一执行者是 /js/aside-calendar.js —— 它挂在 source/_data/widget.yml
 *   的日历卡里，而日历卡**只有首页**会渲染（文章页 HTML 里连这个 <script> 都没有）。
 *   于是：
 *     首页   ：aside-calendar.js 解析期调 applyDayNight() → 夜里自动变黑 ✔
 *     文章页 ：只剩主题 head 里的内联脚本，它读不到 localStorage 'theme' 就什么都不做
 *              → 保持 layout 的 display_mode: light → 变白天 ✘
 *   为什么偏偏「随便逛逛」暴露：randomPost() 用 location.href 整页跳转，head 会重新
 *   执行；站内普通链接走 pjax 不重新加载，<html data-theme> 一直留着，所以平时看不出来。
 *
 * 做法：把「没选择 → 按日出日落定深浅」这一半搬到 head 里同步执行（早于首帧，
 *   不会先亮后暗地闪一下），每一页都跑：
 *     1) 有未过期的手动选择（'theme' 键）→ 什么都不做（那一半仍由主题内联脚本负责）；
 *     2) 没有选择 → 用与 aside-calendar.js 逐字同源的 sunTimes() / geo() 判日 / 夜，
 *        立刻写 <html data-theme>，DOM 就绪后补 body.DarkMode 与 #modeicon；
 *     3) 把算法挂到 window.fomalDayNight，aside-calendar.js 优先委托它 ——
 *        同一个算法只留一份实现，免得两边哪天改歪了。
 *
 * 口径（与 source/js/aside-calendar.js 的 sunTimes / geo / setMode 逐字对齐）：
 *   - 坐标优先级：① window.fomalNightConfig.latLng（_config.fomalhaut.yml 里写死的站点坐标）
 *     → ② fomal.js 拿到 IP 定位后的 global.ipLoacation → ③ localStorage 'asideCalGeo' 缓存
 *     → ④ 兜底 { lat: 22.5319, lng: 访客时区推的经度 }。head 里跑得太早，②通常还没到。
 *   - 极昼极夜（cosOmega 越界）→ 返回 null，什么都不做，交给主题默认。
 *   - body.DarkMode 的语义与 shell.js:343 的切换约定一致：有它 = 当前是夜间模式。
 *
 * 旋钮（2026-10-14 补）：坐标与开关原本只写在 aside-calendar.js 的 CONFIG 里，而那个文件只在
 *   首页存在 —— 「写了坐标」就变成首页按站点坐标、文章页按访客 IP，两处打架；dayNight.enable
 *   也关不干净。现在统一由 _config.fomalhaut.yml 注入的一行 window.fomalNightConfig 决定：
 *     window.fomalNightConfig = { enabled: true, latLng: null, themeKey: 'theme' }
 *       enabled  false = 关掉「访客没手动选过就按日出日落自动定深浅」（fomal.js 那段 8 小时
 *                自动切换也读它，见 source/js/modules/settings.js）；
 *       latLng   [纬度, 经度] = 站点写死坐标，null = 按访客定位；
 *       themeKey 访客的手动选择存在哪个 localStorage 键（默认 'theme'，与主题内联脚本一致）。
 *   运行期也能改：window.fomalDayNight.setConfig({ latLng: [22.53, 114.06] }) 会立刻重算一次；
 *   aside-calendar.js 启动时把文件里那几个旧旋钮汇报上来（那边没写的才补），旧配置不失效。
 *
 * 回滚：删掉 _config.fomalhaut.yml 里这两行（配置那行 + 下面这行）即可 ——
 *   - <script>window.fomalNightConfig=…</script>
 *   - <script src="/js/inject/daynight-boot.js?v=20261014-nightboot2"></script>
 *   （首页行为不受影响，aside-calendar.js 自带完整实现；非首页退回主题默认的 light，
 *     也就是回到修复之前的样子。）
 * ========================================================================== */

(function (global) {
  'use strict';

  var GEO_KEY = 'asideCalGeo';   // 与 aside-calendar.js 同一个缓存键
  var FALLBACK_LAT = 22.5319;    // 与 aside-calendar.js CONFIG.sun.fallbackLat 一致
  var FALLBACK_DAY_FROM = 7;     // 算不出日出日落时的兜底：早 7 点
  var FALLBACK_DAY_TO = 19;      // …到晚 7 点（与 aside-calendar.js 的 isDayNow() 一致）
  var DEFAULT_THEME_KEY = 'theme'; // 与主题 head 内联脚本 / shell.js 的 saveToLocal.set('theme', …, 2) 同一个键

  /* ---- 站点旋钮：_config.fomalhaut.yml 注入的 window.fomalNightConfig ----
   * 这个对象是手写在 YAML 里的，写错一个字符不该让整页脚本挂掉 —— 非法值一律按「没写」处理。 */
  function pickLatLng(raw) {
    var c = raw;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { return null; } }
    if (!c || typeof c !== 'object' || c.length !== 2) return null;
    var lat = +c[0], lng = +c[1];
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return [lat, lng];
  }

  function resolveConfig(raw) {
    var out = { enabled: true, latLng: null, themeKey: DEFAULT_THEME_KEY };
    if (raw && typeof raw === 'object') {
      out.enabled = raw.enabled !== false;
      out.latLng = pickLatLng(raw.latLng);
      if (typeof raw.themeKey === 'string' && raw.themeKey) out.themeKey = raw.themeKey;
    }
    return out;
  }

  var CFG = resolveConfig(global.fomalNightConfig);

  function store() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
      return global.localStorage || null;
    } catch (e) { return null; }
  }

  /* ---- 日出 / 日落：Sunrise equation（Wikipedia）那套简化式，误差 1 分钟上下 ---- */
  function sinDeg(x) { return Math.sin(x * Math.PI / 180); }

  function fromJulian(j) { return new Date((j - 2440587.5) * 86400000); }

  // 返回访客本机时区的 { rise, set }；极昼极夜返回 null
  function sunTimes(date, lat, lng) {
    if (!isFinite(lat) || !isFinite(lng)) return null;
    // n = 自 J2000（2000-01-01 12:00 UT）起的天数。取当天 00:00 UT 再向上取整，
    // 用 floor 会整体早一天（aside-calendar.js 踩过这个坑，这里照抄它的写法）
    var n = Math.ceil((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(2000, 0, 1, 12)) / 86400000 + 0.0008);
    var Jstar = n - lng / 360;
    var M = (357.5291 + 0.98560028 * Jstar) % 360;
    var C = 1.9148 * sinDeg(M) + 0.02 * sinDeg(2 * M) + 0.0003 * sinDeg(3 * M);
    var lambda = (M + C + 180 + 102.9372) % 360;
    var transit = 2451545 + Jstar + 0.0053 * sinDeg(M) - 0.0069 * sinDeg(2 * lambda);
    var sinDec = sinDeg(lambda) * sinDeg(23.44);
    var cosDec = Math.sqrt(1 - sinDec * sinDec);
    var cosLat = Math.cos(lat * Math.PI / 180);
    var cosOmega = (sinDeg(-0.833) - sinDeg(lat) * sinDec) / (cosLat * cosDec);
    if (!isFinite(cosOmega) || cosOmega > 1 || cosOmega < -1) return null;
    var omega = Math.acos(cosOmega) * 180 / Math.PI;
    return {
      rise: fromJulian(transit - omega / 360),
      set: fromJulian(transit + omega / 360)
    };
  }

  /* ---- 坐标：站点写死 > IP 定位 > 缓存 > 兜底 ---- */
  function readGeo() {
    try {
      var s = store();
      var raw = s && s.getItem(GEO_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && isFinite(o.lat) && isFinite(o.lng)) return { lat: +o.lat, lng: +o.lng, src: 'cache' };
    } catch (e) { }
    return null;
  }

  // 没有定位时按访客时区估经度：UTC+8 → 东经 120°
  function timezoneLng() { return -new Date().getTimezoneOffset() / 4; }

  function geo() {
    // _config.fomalhaut.yml 里写死了坐标就用它（语义与 aside-calendar.js 的 CONFIG.sun.latLng 相同：
    // 「写了就用它」，只是现在每页都认，不再是只有首页的卡片认）
    if (CFG.latLng) return { lat: CFG.latLng[0], lng: CFG.latLng[1], src: 'config' };
    var ip = global.ipLoacation;                 // fomal.js（defer）到位后才会有，通常比本脚本晚
    var loc = ip && ip.result && ip.result.location;
    if (loc && isFinite(loc.lat) && isFinite(loc.lng)) return { lat: +loc.lat, lng: +loc.lng, src: 'ip' };
    return readGeo() || { lat: FALLBACK_LAT, lng: timezoneLng(), src: 'tz' };
  }

  /* ---- 日间 / 夜间 ---- */
  // 访客自己选过没有？判据与主题 head 脚本、aside-calendar.js 一致：saveToLocal('theme')
  // （键名可由 window.fomalNightConfig.themeKey 改，默认 'theme'），
  // 过期（shell.js 写的是 2 天有效期）就当作没选过、自动模式重新接管。
  function hasChoice() {
    var s = store();
    if (!s) return false;
    try {
      var raw = s.getItem(CFG.themeKey);
      if (!raw || raw === 'null' || raw === 'undefined') return false;
      var o = null;
      try { o = JSON.parse(raw); } catch (e) { }
      if (o && typeof o === 'object' && o.expiry && Date.now() > o.expiry) {
        s.removeItem(CFG.themeKey);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // 换主题模式：data-theme 和 body 上的 DarkMode 必须一起改
  // （shell.js:343 的切换方向靠它，少写一个访客第一次点月亮按钮就会「没反应」）
  function setMode(isDark) {
    var doc = global.document;
    if (!doc) return;
    if (isDark && typeof global.activateDarkMode === 'function') global.activateDarkMode();
    else if (!isDark && typeof global.activateLightMode === 'function') global.activateLightMode();
    else if (doc.documentElement) doc.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (doc.body && doc.body.classList) doc.body.classList[isDark ? 'add' : 'remove']('DarkMode');
    var icon = doc.getElementById && doc.getElementById('modeicon');
    if (icon) icon.setAttribute('xlink:href', isDark ? '#icon-sun' : '#icon-moon');
  }

  // 当天此刻是白天吗？极昼极夜算不出来时返回 null
  function isDayAt(d) {
    var g = geo();
    var t = sunTimes(d, g.lat, g.lng);
    if (!t) return null;
    return d >= t.rise && d < t.set;
  }

  // true = 白天 / false = 夜间 / null = 没插手（站点关了自动模式，或访客有手动选择，或极昼极夜）
  function apply(d) {
    if (!CFG.enabled) return null;
    if (hasChoice()) return null;
    d = d || new Date();
    var day = isDayAt(d);
    if (day === null) return null;
    setMode(!day);
    return day;
  }

  // 给外部用（settings.js 那段「8 小时自动切换」问的是同一件事）：
  // 算不出日出日落就退回原来的早 7 点 / 晚 7 点
  function isDayNow() {
    var d = new Date();
    var day = isDayAt(d);
    if (day === null) return d.getHours() >= FALLBACK_DAY_FROM && d.getHours() < FALLBACK_DAY_TO;
    return day;
  }

  // 运行期改旋钮：aside-calendar.js 启动时用它把文件里那几个旧配置汇报上来。
  // 调用方先看 api.config 再决定传什么 —— 已经写明的那几项不会被这里的默认值盖掉。
  function setConfig(patch) {
    if (!patch || typeof patch !== 'object') return api.config;
    var merged = { enabled: CFG.enabled, latLng: CFG.latLng, themeKey: CFG.themeKey };
    if ('enabled' in patch) merged.enabled = patch.enabled !== false;
    if ('themeKey' in patch && typeof patch.themeKey === 'string' && patch.themeKey) merged.themeKey = patch.themeKey;
    if ('latLng' in patch) merged.latLng = patch.latLng === null ? null : (pickLatLng(patch.latLng) || CFG.latLng);
    CFG = resolveConfig(merged);
    apply();                       // 立刻按新旋钮重算一次（访客有手动选择时它自己会不作声）
    return api.config;
  }

  var api = {
    version: '20261014-nightboot2',
    apply: apply,
    isDayNow: isDayNow,
    hasChoice: hasChoice,
    geo: geo,
    sunTimes: sunTimes,
    setMode: setMode,
    setConfig: setConfig,
    get config() {
      return { enabled: CFG.enabled, latLng: CFG.latLng ? CFG.latLng.slice() : null, themeKey: CFG.themeKey };
    },
    get themeKey() { return CFG.themeKey; }
  };

  global.fomalDayNight = api;

  // ① head 里同步执行：此刻 <body> 还不存在，只能先定 <html data-theme> —— 这一句决定首帧颜色
  apply();

  // ② DOM 就绪后补 body.DarkMode 与按钮图标（幂等重算一次即可），
  //    顺带覆盖「页面一直开着、跨过了日出 / 日落」的情况（首页另有 aside-calendar 每分钟重算）
  var doc = global.document;
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { apply(); });
    else apply();
  }
})(typeof window !== 'undefined' ? window : globalThis);
