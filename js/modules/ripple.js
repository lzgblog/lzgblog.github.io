/* 点击涟漪（第 4 个互动挂件）：按下处泛开两圈同心水纹，短动画放完自己消失。
   ----------------------------------------------------------------------------
   性能取向与萤火虫微光一致：无 RAF、无定时器循环、无常驻元素。
   只有真正按下那一刻才建 1 个 .ripple-burst + 2 个 <i>，700ms 后连壳一起回收；
   关掉开关时连 pointerdown 监听都不挂，页面等于没有这个功能。
   样式在 source/css/site-inject.css 的「点击涟漪」一节（颜色从 --theme-color 派生）。

   偏好键 rippleOn 与另外两个互动挂件相反：只有显式存过 '1' 才开，没这个键就是关。
   写键的是 settings.js 的 setRipple()（和 nekoOn / cursorOn 放在一起），本文件只读不写。 */
(function (w, d) {
  'use strict';
  if (w.FOMAL_RIPPLE) { w.FOMAL_RIPPLE.refresh(); return; }
  var LAYER_ID = 'ripple-layer';
  var MAX_LIVE = 6;   // 同屏上限：第 7 次按下先收掉最老的一枚，连点不会叠成一片
  var TTL = 700;      // 回收兜底（最长的是第二环：60ms 延迟 + 560ms 时长）
  var layer = null, live = [], wanted = false, bound = false;
  var motion = typeof w.matchMedia === 'function' ? w.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function read() {
    try { var v = w.localStorage.getItem('rippleOn'); return v === null ? null : v; }
    catch (error) { return null; }
  }
  // 少画的条件：没开，或者系统偏好减少动态效果（后者连监听都不挂）
  function quiet() { return !wanted || !!(motion && motion.matches); }

  function ensureLayer() {
    if (layer && layer.parentNode === d.body) return layer;
    if (!d.body) return null;
    layer = d.createElement('div');
    layer.id = LAYER_ID;
    layer.className = 'ripple-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('role', 'presentation');
    d.body.appendChild(layer);
    live.length = 0;
    return layer;
  }

  function drop(burst) {
    var i = live.indexOf(burst);
    if (i >= 0) live.splice(i, 1);
    if (burst._ttl) { w.clearTimeout(burst._ttl); burst._ttl = 0; }
    if (burst.parentNode) burst.parentNode.removeChild(burst);
  }

  function clear() {
    while (live.length) drop(live[0]);
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
  }

  function spawn(x, y) {
    if (quiet()) return;
    var host = ensureLayer();
    if (!host) return;
    while (live.length >= MAX_LIVE) drop(live[0]);
    var burst = d.createElement('div');
    burst.className = 'ripple-burst';
    // 只写不读：坐标直接用事件的 clientX / clientY（和 position:fixed 同坐标系），不碰 getBoundingClientRect
    burst.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    for (var i = 0; i < 2; i++) {
      var ring = d.createElement('i');
      // 第二环错开 60ms 出发：两圈同心、速度略不同，一眼是水波而不是单圈 Material 涟漪
      ring.className = i === 0 ? 'ripple-ring' : 'ripple-ring is-late';
      burst.appendChild(ring);
    }
    host.appendChild(burst);
    live.push(burst);
    burst._ttl = w.setTimeout(function () { burst._ttl = 0; drop(burst); }, TTL);
  }

  function onPointerDown(event) {
    // 只认主指针的左键：右键留给 #rightMenu，多指操作只取第一指，免得一次手势泛出好几圈
    if (!event || event.isPrimary === false) return;
    if (typeof event.button === 'number' && event.button > 0) return;
    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return;
    spawn(event.clientX, event.clientY);
  }

  function bind() {
    if (bound) return;
    d.addEventListener('pointerdown', onPointerDown, { passive: true });
    bound = true;
  }
  function unbind() {
    if (!bound) return;
    d.removeEventListener('pointerdown', onPointerDown);
    bound = false;
  }

  function syncControls() {
    var control = d.getElementById('rippleSet');
    if (control) control.checked = wanted;
    var hint = d.getElementById('rippleHint');
    if (hint) hint.textContent = wanted && motion && motion.matches
      ? '已开启 · 减少动态效果偏好下暂停'
      : '点一下，泛起一圈小波纹 · 默认关闭';
  }

  function paint() {
    if (quiet()) { unbind(); clear(); }
    else bind();
    syncControls();
  }

  function refresh() { wanted = read() === '1'; paint(); }
  function setEnabled(on) { wanted = on === true; paint(); }

  w.FOMAL_RIPPLE = { setEnabled: setEnabled, refresh: refresh, syncControls: syncControls };

  d.addEventListener('pjax:complete', refresh);
  w.addEventListener('storage', function (event) {
    if (event && event.key !== null && event.key !== 'rippleOn') return;
    refresh();
  });
  if (motion) {
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', paint);
    else if (typeof motion.addListener === 'function') motion.addListener(paint);
  }
  if (!d.body) d.addEventListener('DOMContentLoaded', refresh, { once: true });
  refresh();
})(window, document);
