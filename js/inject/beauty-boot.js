/* ============================================================================
 * source/js/inject/beauty-boot.js —— 美化模块首屏预置脚本
 * ----------------------------------------------------------------------------
 * 本文件由 _config.fomalhaut.yml 的 inject.head 段抽出（2026-10-03 屎山重构）：
 *   原位置 _config.fomalhaut.yml:1383-1434，原来是内联的 <script id="beautyBoot">。
 *   配置里仍是同步 <script src>（没有加 defer），所以执行时机与内联时完全一样。
 * ----------------------------------------------------------------------------
 * 首屏预置脚本：内联在 head 里同步执行（早于 body 解析、早于首帧），把 localStorage 里的美化设置
 * 提前写进上面这些 style 标签，消除「刷新时先闪默认壁纸 / 默认字体，再跳成自定义」的一帧闪烁。
 * 取值与 source/js/fomal.js 的初始化逐字一致（键缺失时用 fomal.js 的应用默认值）。
 * ========================================================================== */

(function () {
  var d = document.documentElement;
  function ls(k) {
    try {
      var s = (typeof localStorage !== "undefined" && localStorage) ? localStorage : ((typeof window !== "undefined" && window.localStorage) ? window.localStorage : null);
      return s ? s.getItem(k) : null;
    } catch (e) { return null; }
  }
  function def(v, dv) { return (v == null || v === "" || v === "undefined" || v === "null") ? dv : v; }
  function tag(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
  var SAME = ";--darkmode-bg:";
  // 新增互动偏好：首帧就隐藏关闭的挂件（猫咪由 deferred 脚本创建）。
  d.classList.toggle('beauty-neko-off', ls('nekoOn') === '0');
  // 1) 自定义壁纸
  var bg = def(ls("blogbg"), "default").replace(/^\s+|\s+$/g, "");
  if (bg !== "default" && /^(#|url\(|linear-gradient|radial-gradient|https?:)/.test(bg)) {
    tag("defineBg", ":root{--default-bg:" + bg + SAME + bg + ";--mobileday-bg:" + bg + ";--mobilenight-bg:" + bg + ";}");
  }
  // 2) 卡片透明度
  tag("transPercent", ":root{--trans-light: rgba(250, 250, 250, " + def(ls("transNum"), "98") + "%) !important; --trans-dark: rgba(28, 28, 28, " + def(ls("transNum"), "98") + "%) !important} ");
  // 3) 背景滤镜
  if (def(ls("bgFilterOn"), "1") === "0") { tag("bgFilterParam", ":root{--bg-filter:none;}"); }
  else { var bfv = ls("bgFilterVal"); if (bfv) { tag("bgFilterParam", ":root{--bg-filter:" + bfv + ";}"); } }
  // 4) 主题色
  var cmap = { red: "rgb(239, 90, 90)", orange: "rgb(215, 146, 77)", yellow: "rgb(196, 166, 74)", green: "rgb(57, 197, 187)", puregreen: "rgb(77, 175, 135)", blue: "rgb(74, 156, 199)", heoblue: "rgb(97, 106, 209)", matcha: "rgb(102, 179, 77)", darkblue: "rgb(113, 133, 156)", purepurple: "rgb(147, 90, 205)", pink: "rgb(237, 112, 155)" };
  var tc = def(ls("themeColor"), "green");
  if (tc === "purple") tc = "purepurple";
  else if (tc === "gray" || tc === "black") tc = "darkblue";
  var custom = ls("themeCustomColor");
  var color = tc === "custom" && /^#[0-9a-f]{6}$/i.test(custom || "") ? custom :
    (Object.prototype.hasOwnProperty.call(cmap, tc) ? cmap[tc] : cmap.green);
  tag("themeColor", ":root{--theme-color:" + color + " !important}");
  // 4b) 主题色实底上的前景色（首帧就得有，否则浅色预设会先闪一下白字；算法与 settings.js 一致）
  var lin = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  var ch = String(color).match(/(\d+)/g) || [];
  var L = ch.length >= 3 ? 0.2126 * lin(+ch[0]) + 0.7152 * lin(+ch[1]) + 0.0722 * lin(+ch[2]) : 0;
  d.style.setProperty("--on-theme", L > 0.19 ? "#141a1c" : "#ffffff");
  // 4b-2) 渐变按钮（公告栏下载按钮）要往「远离前景色」的方向调，否则深色那头会把字吃掉
  d.style.setProperty("--on-theme-away", L > 0.19 ? "#ffffff" : "#000000");
  // 4c) 实底图标块（右侧工具条那排 38×38）现在直接用主题色原色 + 白图标 + 轻微投影
  //     （见 source/css/site-inject.css 的 #rightside 块，2026-10-15 第三版），
  //     不再需要单独的 --theme-solid 计算。hover 仍是主题自带的浅橙 #FF7242。
  // 5) 字体
  var ft = def(ls("font"), "LXGW");
  if (ft === "default") {
    // 系统默认字体栈：与 source/js/fomal.js 的 setFont 逐字一致。原来只写 -apple-system，
    // 这个关键字在 Windows 上不存在，会让只声明 var(--global-font) 的标题掉到浏览器默认字体。
    var sysStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Lato, Roboto, 'PingFang SC', 'Microsoft JhengHei', 'Microsoft YaHei', sans-serif";
    d.style.setProperty("--global-font", sysStack);
    var st = document.createElement("style");
    st.textContent = "body{font-family:" + sysStack + "}";
    (document.head || document.getElementsByTagName("head")[0]).appendChild(st);
  } else { d.style.setProperty("--global-font", ft); }
  // 6) 侧边部件 / 侧栏显隐 / 侧栏位置 / 顶栏常驻 / 霓虹灯 / 帧率
  if (def(ls("rs"), "block") === "none") { tag("rightSide", ":root{--rightside-display: none}"); }
  else { tag("rightSide", ":root{--rightside-display: block}"); }
  if (def(ls("aside"), "1") === "0") { tag("aside-show", ":root{--layout-justify-content: center; --aside-content-display: none;}"); }
  else { tag("aside-show", ":root{--layout-justify-content: unset; --aside-content-display: block;}"); }
  if (def(ls("asidePos"), "1") === "0") { tag("aside-pos", ":root{--first-child-order: 2; --recent-post-item-margin: 0px 0px 20px 1%;}"); }
  else { tag("aside-pos", ":root{--first-child-order: 0; --recent-post-item-margin: 0px 1% 20px 0px;}"); }
  if (def(ls("nav"), "1") === "0") { tag("nav-display", ":root{--nav-visible-display:inline-flex;--nav-fixed-display:none;}"); }
  else { tag("nav-display", ":root{--nav-visible-display:none;--nav-fixed-display:inline-flex;}"); }
  if (def(ls("light"), "true") === "false") { tag("menu_shadow", ":root{--menu-shadow: none;}"); }
  else { tag("menu_shadow", ":root{--menu-shadow: 0 0 1px var(--theme-color);}"); }
  var fp = document.getElementById("fps");
  if (fp) fp.style.display = (def(ls("fpson"), "1") == 1) ? "block" : "none";
})();
