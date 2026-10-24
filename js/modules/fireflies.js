/* 萤火虫微光：低密度 CSS 动画，无 canvas / RAF / 定时器循环。 */
(function (w, d) {
  'use strict';
  if (w.FOMAL_FIREFLIES) { w.FOMAL_FIREFLIES.refresh(); return; }
  var layer = null, count = 0, wanted = false, away = false;
  var fallback = Object.create(null);
  var motion = typeof w.matchMedia === 'function' ? w.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function read(key, initial) {
    if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
    try { var v = w.localStorage.getItem(key); return v === null ? (key === 'fireflies' ? '0' : initial) : v; }
    catch (error) { return initial; }
  }
  function write(key, value) {
    try { w.localStorage.setItem(key, value); delete fallback[key]; }
    catch (error) { fallback[key] = value; }
  }
  function remove() {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null; count = 0;
  }
  function syncControls() {
    var control = d.getElementById('firefliesSet');
    if (control) control.checked = wanted;
    var snowOn = !wanted && read('snow', 'none') === 'block';
    var snowControl = d.getElementById('snowSet');
    if (snowControl) snowControl.checked = snowOn;
    var snow = d.getElementById('snow');
    if (snow && snow.style.display !== (snowOn ? 'block' : 'none')) snow.style.display = snowOn ? 'block' : 'none';
    var hint = d.getElementById('firefliesHint');
    if (hint) hint.textContent = wanted && motion && motion.matches ? '已开启 · 减少动态效果偏好下暂停' : '下方微光 · 默认关闭 · 与雪花互斥';
  }
  function disableSnow() {
    if (read('snow', 'none') === 'block') write('snow', 'none');
    var snow = d.getElementById('snow');
    if (snow) snow.style.display = 'none';
    var check = d.getElementById('snowSet');
    if (check) check.checked = false;
  }
  function paint() {
    if (!wanted) { remove(); syncControls(); return; }
    disableSnow();
    var paused = away || d.hidden || !!(motion && motion.matches);
    if (layer && layer.parentNode !== d.body) { layer = null; count = 0; }
    var n = w.innerWidth <= 600 ? 8 : 14;
    if (!paused && d.body && (!layer || count !== n)) {
      remove();
      layer = d.createElement('div');
      layer.id = 'fireflies-stage';
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('role', 'presentation');
      for (var i = 0; i < n; i++) {
        var mote = d.createElement('span'), glow = d.createElement('i');
        mote.className = 'ff-mote'; glow.className = 'ff-glow';
        // 分层、错相，避免整片光点同步闪烁或横穿正文。
        mote.style.left = (3 + i * 90 / n + Math.random() * 4) + '%';
        mote.style.top = (12 + Math.random() * 70) + '%';
        mote.style.setProperty('--ff-drift-time', (20 + Math.random() * 14).toFixed(2) + 's');
        mote.style.setProperty('--ff-delay', (-Math.random() * 30).toFixed(2) + 's');
        mote.style.setProperty('--ff-breathe-time', (4 + Math.random() * 4).toFixed(2) + 's');
        mote.style.setProperty('--ff-size', (2.2 + Math.random() * 1.4).toFixed(2) + 'px');
        mote.style.setProperty('--ff-color', i % 3 === 0 ? '178, 241, 158' : '255, 214, 117');
        mote.appendChild(glow); layer.appendChild(mote);
      }
      count = n; d.body.appendChild(layer);
    }
    if (layer) { layer.hidden = !!paused; layer.setAttribute('data-paused', paused ? 'true' : 'false'); }
    syncControls();
  }
  function refresh() { wanted = read('fireflies', wanted ? '1' : '0') === '1'; paint(); }
  function setEnabled(on) { wanted = on === true; write('fireflies', wanted ? '1' : '0'); paint(); }
  w.FOMAL_FIREFLIES = { setEnabled: setEnabled, refresh: refresh, syncControls: syncControls };
  d.addEventListener('visibilitychange', paint);
  d.addEventListener('pjax:complete', refresh);
  w.addEventListener('resize', paint);
  w.addEventListener('pagehide', function () { away = true; paint(); });
  w.addEventListener('pageshow', function () { away = false; refresh(); });
  w.addEventListener('storage', function (event) {
    if (event.key !== null && event.key !== 'fireflies' && event.key !== 'snow') return;
    if (event.key === null) fallback = Object.create(null); else delete fallback[event.key];
    if (event.key === 'snow' && read('snow', 'none') === 'block') setEnabled(false);
    else refresh();
  });
  if (motion) {
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', paint);
    else if (typeof motion.addListener === 'function') motion.addListener(paint);
  }
  if (!d.body) d.addEventListener('DOMContentLoaded', refresh, { once: true });
  refresh();
})(window, document);
