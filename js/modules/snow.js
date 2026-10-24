/* 自然落雪：六臂雪片缓存、时间驱动飘落、有限高度的底部薄积雪。 */
(function (w, d) {
  'use strict';
  if (w.FOMAL_SNOW) { w.FOMAL_SNOW.refresh(); return; }
  var canvas = null, context = null, raf = null, running = false, away = false;
  var width = 0, height = 0, ratio = 1, maxDepth = 0, last = null, epoch = 0;
  var flakes = [], bank = [], sprites = [], spriteRatio = 0, groundGradient = null;
  var reduced = typeof w.matchMedia === 'function' ? w.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mobile = /phone|pad|pod|iPhone|iPod|iPad|Android|Mobile|IEMobile/i.test(w.navigator ? w.navigator.userAgent : '');
  var canvasObserver = typeof w.MutationObserver === 'function' ? new w.MutationObserver(refresh) : null;
  function stop() {
    epoch++; running = false; last = null;
    if (raf !== null && typeof w.cancelAnimationFrame === 'function') w.cancelAnimationFrame(raf);
    raf = null;
  }
  function clear() {
    stop(); flakes = []; bank = [];
    if (context) context.clearRect(0, 0, width, height);
  }
  function bind() {
    var next = d.getElementById('snow');
    if (next === canvas) return;
    clear(); if (canvasObserver) canvasObserver.disconnect();
    canvas = next; context = null; width = 0; height = 0;
    if (canvas && typeof canvas.getContext === 'function') {
      try { context = canvas.getContext('2d'); } catch (error) { context = null; }
      if (canvasObserver) canvasObserver.observe(canvas, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }
  function enabled() {
    if (!canvas || canvas.style.display === 'none') return false;
    try { return w.localStorage.getItem('snow') === 'block'; }
    catch (error) { return canvas.style.display === 'block'; }
  }
  function visible() {
    if (!context || !enabled() || away || d.hidden || mobile || w.innerWidth <= 768 || (reduced && reduced.matches)) return false;
    if (d.documentElement.getAttribute('data-theme') === 'dark') return false;
    if (typeof w.getComputedStyle === 'function') {
      var style = w.getComputedStyle(canvas);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return typeof w.requestAnimationFrame === 'function';
  }
  function measure() {
    var newWidth = Math.max(1, w.innerWidth), newHeight = Math.max(1, w.innerHeight);
    var newRatio = Math.min(2, Math.max(1, w.devicePixelRatio || 1));
    if (newWidth === width && newHeight === height && newRatio === ratio) return;
    var oldBank = bank, oldWidth = width, oldHeight = height;
    width = newWidth; height = newHeight; ratio = newRatio;
    maxDepth = Math.min(30, Math.max(14, height * 0.035));
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    bank = Array.from({ length: Math.ceil(width / 16) + 1 }, function (_, i) {
      var oldIndex = oldBank.length > 1 ? Math.round(i * (oldBank.length - 1) / Math.ceil(width / 16)) : 0;
      return Math.min(maxDepth, oldBank[oldIndex] || 0);
    });
    flakes.forEach(function (flake) {
      flake.x = oldWidth ? flake.x * width / oldWidth : flake.x;
      flake.y = oldHeight ? flake.y * height / oldHeight : flake.y;
    });
    groundGradient = context.createLinearGradient(0, height - maxDepth, 0, height);
    groundGradient.addColorStop(0, 'rgba(255,255,255,.96)');
    groundGradient.addColorStop(1, 'rgba(220,233,243,.97)');
  }
  function createSprites() {
    if (sprites.length && spriteRatio === ratio) return;
    sprites = []; spriteRatio = ratio;
    // 小雪片是细晶，大雪片增加分枝；缓存后每帧只贴图，不重复生成几何。
    for (var type = 0; type < 2; type++) {
      var sprite = d.createElement('canvas'); sprite.width = sprite.height = 40 * ratio;
      var ctx = sprite.getContext('2d'); ctx.scale(ratio, ratio); ctx.translate(20, 20);
      ctx.strokeStyle = 'rgba(255,255,255,.96)'; ctx.lineWidth = type ? 1.8 : 2.2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var arm = 0; arm < 6; arm++) {
        var angle = arm * Math.PI / 3, x = Math.cos(angle), y = Math.sin(angle);
        ctx.moveTo(0, 0); ctx.lineTo(x * 14, y * 14);
        if (type) {
          for (var branch = -1; branch <= 1; branch += 2) {
            var bx = Math.cos(angle + branch * Math.PI / 3), by = Math.sin(angle + branch * Math.PI / 3);
            ctx.moveTo(x * 8, y * 8); ctx.lineTo(x * 8 - bx * 5, y * 8 - by * 5);
          }
        }
      }
      ctx.stroke(); sprites.push(sprite);
    }
  }
  function flake(y) {
    var size = 1.8 + Math.random() * 4.8;
    return { x: Math.random() * width, y: y, size: size, speed: 16 + size * 5,
      phase: Math.random() * Math.PI * 2, angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * .45, opacity: .35 + size * .085, type: size >= 3.8 ? 1 : 0 };
  }
  function seed() {
    var count = Math.max(48, Math.min(96, Math.round(width / 16)));
    if (flakes.length > count) flakes.length = count;
    while (flakes.length < count) flakes.push(flake(Math.random() * height - 8));
  }
  function depthAt(x) {
    var index = Math.max(0, Math.min(bank.length - 1, x / width * (bank.length - 1)));
    var base = Math.floor(index), next = Math.min(base + 1, bank.length - 1);
    return bank[base] * (1 - index + base) + bank[next] * (index - base);
  }
  function deposit(x, size) {
    var center = Math.max(0, Math.min(bank.length - 1, Math.round(x / width * (bank.length - 1))));
    for (var offset = -3; offset <= 3; offset++) {
      var index = center + offset;
      if (index >= 0 && index < bank.length) {
        bank[index] = Math.min(maxDepth, bank[index] + (0.9 + size * .16) * Math.exp(-offset * offset / 3));
      }
    }
  }
  function drawBank() {
    if (!bank.some(function (depth) { return depth > 0; })) return;
    context.globalAlpha = 1; context.fillStyle = groundGradient;
    context.beginPath(); context.moveTo(0, height); context.lineTo(0, height - bank[0]);
    for (var i = 1; i < bank.length; i++) {
      var x = i * width / (bank.length - 1), y = height - bank[i];
      var previousX = (i - 1) * width / (bank.length - 1), previousY = height - bank[i - 1];
      context.quadraticCurveTo(previousX, previousY, (previousX + x) / 2, (previousY + y) / 2);
    }
    context.lineTo(width, height - bank[bank.length - 1]); context.lineTo(width, height);
    context.closePath(); context.fill();
  }
  function schedule() {
    var ticket = epoch;
    raf = w.requestAnimationFrame(function (time) {
      if (ticket !== epoch) return; // 取消后的旧回调不能影响新一轮动画。
      frame(time);
    });
  }
  function frame(time) {
    raf = null;
    if (!running) return;
    if (d.hidden || away || (reduced && reduced.matches)) { stop(); return; }
    var dt = last === null ? 0 : Math.max(0, Math.min(.05, (time - last) / 1000)); last = time;
    context.clearRect(0, 0, width, height);
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i]; f.phase += dt * .8; f.angle += f.spin * dt;
      f.x += (6 + Math.sin(f.phase) * 10) * dt; f.y += f.speed * dt;
      if (f.x < -f.size) f.x = width + f.size;
      if (f.x > width + f.size) f.x = -f.size;
      if (f.y + f.size >= height - depthAt(f.x)) {
        deposit(f.x, f.size); flakes[i] = flake(-8 - Math.random() * 40); continue;
      }
      context.save(); context.translate(f.x, f.y); context.rotate(f.angle); context.globalAlpha = f.opacity;
      context.drawImage(sprites[f.type], -f.size, -f.size, f.size * 2, f.size * 2); context.restore();
    }
    drawBank(); schedule();
  }
  function refresh() {
    bind();
    if (!enabled()) { clear(); return; }
    if (!visible()) { stop(); return; }
    measure(); createSprites(); seed();
    if (!running) { running = true; last = null; schedule(); }
  }
  function reset() { clear(); refresh(); }
  w.FOMAL_SNOW = { refresh: refresh, reset: reset, inspect: function () {
    return { running: running, flakes: flakes.length, depth: bank.length ? Math.max.apply(null, bank) : 0,
      maxDepth: maxDepth, width: width, height: height };
  } };
  if (typeof w.MutationObserver === 'function') {
    new w.MutationObserver(refresh).observe(d.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  }
  d.addEventListener('visibilitychange', refresh); d.addEventListener('pjax:complete', refresh);
  w.addEventListener('resize', refresh);
  w.addEventListener('load', refresh); // 样式/首屏资源就绪后再次判断，不靠轮询。
  d.addEventListener('transitionend', refresh);
  d.addEventListener('animationend', refresh);
  w.addEventListener('pagehide', function () { away = true; stop(); });
  w.addEventListener('pageshow', function () { away = false; refresh(); });
  w.addEventListener('storage', function (event) { if (event.key === 'snow' || event.key === null) refresh(); });
  if (reduced) {
    if (typeof reduced.addEventListener === 'function') reduced.addEventListener('change', refresh);
    else if (typeof reduced.addListener === 'function') reduced.addListener(refresh);
  }
  if (!d.body) d.addEventListener('DOMContentLoaded', refresh, { once: true });
  refresh();
})(window, document);
