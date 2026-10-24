/* ============================================================================
 * modules/effects.js —— 页面装饰特效（雪花 / 星空 / 表情放大）
 * ----------------------------------------------------------------------------
 * 本文件由 source/js/fomal.js 拆出（2026-10-03 屎山重构）。
 * 【重要】这里故意不套 IIFE：主题 pug 模板里有大量内联 onclick="xxx()"，
 *        以及别的脚本会直接调全局函数，所以本文件里的声明必须留在全局作用域。
 * ----------------------------------------------------------------------------
 * 包含的模块（括号内为拆分前在 fomal.js 里的行号）：
 *   · 自然落雪由 modules/snow.js 管理（#snow），本文件保留星空与表情放大
 *   · 星空特效（381-435）—— 首页夜空星星 + 随机流星（#universe）
 *   · 表情放大（439-500）—— 点击正文里的 emoji，原地放大再看一眼
 * ----------------------------------------------------------------------------
 * 纯视觉特效，都可以单独删掉不影响其他功能。
 * 加载方式：_config.fomalhaut.yml 的 inject.bottom 列表里以 <script defer> 引用。
 * ----------------------------------------------------------------------------
 * 【本文件目录】共 2 个顶层声明（行号可能随后续编辑漂移，找不到就 Ctrl+F 搜函数名）
 *    137  dark()
 *    203  owoBig()
 * ========================================================================== */

/* ------------------------------ 雪花特效 ------------------------------ */
/* 落雪与薄积雪由 snow.js 独立管理；这里不再创建第二个动画循环。 */

/* ------------------------------ 星空特效 ------------------------------ */
/* 原 fomal.js 381-435 行，原样搬运，未改逻辑 */
/* 星空特效 start */
function dark() {
  window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
  var n, e, i, h, t = .05,
    s = document.getElementById("universe"),
    o = !0,
    a = "180,184,240",
    r = "226,225,142",
    d = "226,225,224",
    c = [];

  function f() {
    n = window.innerWidth, e = window.innerHeight, i = .216 * n, s.setAttribute("width", n), s.setAttribute("height", e)
  }
  function u() {
    h.clearRect(0, 0, n, e);
    for (var t = c.length, i = 0; i < t; i++) {
      var s = c[i];
      s.move(), s.fadeIn(), s.fadeOut(), s.draw()
    }
  }
  function y() {
    this.reset = function () {
      this.giant = m(3), this.comet = !this.giant && !o && m(10), this.x = l(0, n - 10), this.y = l(0, e), this.r = l(1.1, 2.6), this.dx = l(t, 6 * t) + (this.comet + 1 - 1) * t * l(50, 120) + 2 * t, this.dy = -l(t, 6 * t) - (this.comet + 1 - 1) * t * l(50, 120), this.fadingOut = null, this.fadingIn = !0, this.opacity = 0, this.opacityTresh = l(.2, 1 - .4 * (this.comet + 1 - 1)), this.do = l(5e-4, .002) + .001 * (this.comet + 1 - 1)
    }, this.fadeIn = function () {
      this.fadingIn && (this.fadingIn = !(this.opacity > this.opacityTresh), this.opacity += this.do)
    }, this.fadeOut = function () {
      this.fadingOut && (this.fadingOut = !(this.opacity < 0), this.opacity -= this.do / 2, (this.x > n || this.y < 0) && (this.fadingOut = !1, this.reset()))
    }, this.draw = function () {
      if (h.beginPath(), this.giant) h.fillStyle = "rgba(" + a + "," + this.opacity + ")", h.arc(this.x, this.y, 2, 0, 2 * Math.PI, !1); else if (this.comet) {
        h.fillStyle = "rgba(" + d + "," + this.opacity + ")", h.arc(this.x, this.y, 1.5, 0, 2 * Math.PI, !1); for (var t = 0; t < 30; t++)h.fillStyle = "rgba(" + d + "," + (this.opacity - this.opacity / 20 * t) + ")", h.rect(this.x - this.dx / 4 * t, this.y - this.dy / 4 * t - 2, 2, 2), h.fill()
      } else h.fillStyle = "rgba(" + r + "," + this.opacity + ")", h.rect(this.x, this.y, this.r, this.r);
      h.closePath(), h.fill()
    }, this.move = function () {
      this.x += this.dx, this.y += this.dy, !1 === this.fadingOut && this.reset(), (this.x > n - n / 4 || this.y < 0) && (this.fadingOut = !0)
    }, setTimeout(function () {
      o = !1
    }, 50)
  }
  function m(t) {
    return Math.floor(1e3 * Math.random()) + 1 < 10 * t
  }
  function l(t, i) {
    return Math.random() * (i - t) + t
  }
  f(), window.addEventListener("resize", f, !1), function () {
    h = s.getContext("2d");
    for (var t = 0; t < i; t++) c[t] = new y, c[t].reset();
    u()
  }(), function () {
    /* ---- 2026-10-04 性能修复：画布不可见就不画 ----
     * 原来这里是一句 function t() { ...data-theme == "dark" && u(); requestAnimationFrame(t) }()，
     * 循环只看主题、不看画布到底有没有在显示。于是用美化设置把星空关掉之后
     * （settings.js 把 #universe 的 style.display 改成 none），暗色模式下 u() 依然每帧
     * 重绘整页 canvas —— 纯属白干的重绘。现在加一层可见性判断，不可见时直接跳过 u()。
     * 判定用计算样式而不是 offsetParent：#universe 是 position:fixed，offsetParent 恒为 null。
     * 结果缓存进 starOn，靠 MutationObserver（data-theme / class / style）+ resize + pjax:complete
     * 失效。主题判断（dark）保留，与原逻辑完全一致。
     *
     * 2026-10-05 第二轮：把「不可见就跳过绘制」再升级成「不可见就彻底退出循环」。
     * 原来 rAF 永远在排下一帧、每帧回来问一次「暗色吗 / 可见吗」；而本站 CSS 只在
     * [data-theme="dark"] 下显示 #universe，浅色主题（很多人常驻的状态）下这一问一答
     * 每秒要发生 60~90 次，纯空转。现在条件不成立就 return 且不再排帧，循环归零；
     * 状态一变（切主题 / 开关星空 / resize / pjax）由 starInvalidate 重新起循环，
     * 与上面雪花那段是同一套路。停/起都不降频：暗色下的重绘间隔仍由 STAR_DRAW_INTERVAL 控制。
     */
    var starOn = null, starRunning = false, startStar = null
    function starVisible() {
      if (starOn === null) starOn = window.getComputedStyle(s).display !== "none"
      return starOn
    }
    function starInvalidate() { starOn = null; if (!starRunning && startStar) startStar() }
    new MutationObserver(starInvalidate).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] })
    new MutationObserver(starInvalidate).observe(s, { attributes: true, attributeFilter: ["style"] })
    window.addEventListener("resize", starInvalidate, !1)
    document.addEventListener("pjax:complete", starInvalidate)
    /* ---- 2026-10-04 性能修复（第二轮）：重绘降到 30fps ----
     * 暗色模式下星星数 = 0.216 * 视口宽（1440px 约 311 颗），每颗 move/fadeIn/fadeOut/draw
     * 各一次 beginPath + arc/rect + fill，流星还要再画 30 个 rect —— 原来跟着屏幕刷新率
     * 每帧全量重绘（60Hz 每秒 60 次，144Hz 每秒 144 次）。
     * 星星本身漂得极慢（dx 只有 0.05~0.3px/帧），60fps 和 30fps 肉眼看不出差别，
     * 所以这里限到 30fps：每帧仍按原逻辑走一遍，只是没到间隔就不重绘。
     * 想调回原样：把 STAR_DRAW_INTERVAL 改成 0。
     */
    var STAR_DRAW_INTERVAL = 1000 / 30
    var starLastDraw = -1e9   // 初值取负无穷：切到暗色后第一帧就立刻画，不用等 33ms
    function starLoop(ts) {
      /* 2026-10-05：条件不满足就整条循环退出（不再排下一帧），由 starInvalidate 重新拉起 */
      if (!(document.documentElement.getAttribute("data-theme") == "dark" && starVisible())) { starRunning = false; return }
      starRunning = true
      if (ts === undefined) ts = (window.performance && performance.now) ? performance.now() : Date.now()
      if (ts - starLastDraw >= STAR_DRAW_INTERVAL) { starLastDraw = ts; u() }
      window.requestAnimationFrame(starLoop)
    }
    startStar = starLoop
    starLoop()
  }()
};
dark()
/* 星空特效 end */

/* ------------------------------ 表情放大 ------------------------------ */
/* 原 fomal.js 439-500 行，原样搬运，未改逻辑 */
/* 表情放大 start */
document.addEventListener('pjax:complete', function () {
  if (document.getElementById('post-comment')) owoBig();
});
document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('post-comment')) owoBig();
});

// 表情放大
function owoBig() {
  let flag = 1, // 设置节流阀
    owo_time = '', // 设置计时器
    m = 3; // 设置放大倍数
  // 创建盒子
  let div = document.createElement('div'),
    body = document.querySelector('body');
  // 设置ID
  div.id = 'owo-big';
  // 插入盒子
  body.appendChild(div)

  // 构造observer
  let observer = new MutationObserver(mutations => {

    for (let i = 0; i < mutations.length; i++) {
      let dom = mutations[i].addedNodes,
        owo_body = '';
      if (dom.length == 2 && dom[1].className == 'OwO-body') owo_body = dom[1];
      // 如果需要在评论内容中启用此功能请解除下面的注释
      // else if (dom.length == 1 && dom[0].className == 'tk-comment') owo_body = dom[0];
      else continue;

      // 禁用右键（手机端长按会出现右键菜单，为了体验给禁用掉）
      if (document.body.clientWidth <= 768) owo_body.addEventListener('contextmenu', e => e.preventDefault());
      // 鼠标移入
      owo_body.onmouseover = (e) => {
        if (flag && e.target.tagName == 'IMG') {
          flag = 0;
          // 移入300毫秒后显示盒子
          owo_time = setTimeout(() => {
            let height = e.path[0].clientHeight * m, // 盒子高
              width = e.path[0].clientWidth * m, // 盒子宽
              left = (e.x - e.offsetX) - (width - e.path[0].clientWidth) / 2, // 盒子与屏幕左边距离
              top = e.y - e.offsetY; // 盒子与屏幕顶部距离

            if ((left + width) > body.clientWidth) left -= ((left + width) - body.clientWidth + 10); // 右边缘检测，防止超出屏幕
            if (left < 0) left = 10; // 左边缘检测，防止超出屏幕
            // 设置盒子样式
            div.style.cssText = `display:flex; height:${height}px; width:${width}px; left:${left}px; top:${top}px;`;
            // 在盒子中插入图片
            div.innerHTML = `<img src="${e.target.src}">`
          }, 300);
        }
      };
      // 鼠标移出隐藏盒子
      owo_body.onmouseout = () => { div.style.display = 'none', flag = 1, clearTimeout(owo_time); }
    }

  })
  observer.observe(document.getElementById('post-comment'), { subtree: true, childList: true })
}
/* 表情放大 end */
