/* 字体选择器：与 settings.js 的同步 setter 分离；只加载当前选择的字体。 */
var APPEARANCE_TEXT_FONTS = [
  ['LXGWScreen', '霞鹜文楷Screen', '屏幕阅读 · 默认', 'reading'],
  ['LXGW', '霞鹜文楷', '温润文楷 · 长文', 'reading'],
  ['LXGWNeoXiHei', '霞鹜新晰黑', '清晰黑体 · 技术文章', 'reading'],
  ['SourceHanSerif', '思源宋体', '书卷气 · 随笔', 'reading'],
  ['default', '系统默认', '无需下载 · 跟随设备', 'reading'],
  ['ZhuZiAWan', '筑紫A丸', '圆润可爱 · 短句', 'decorative'],
  ['HYTMR', '汉仪唐美人', '个性书写 · 标题', 'decorative'],
  ['TTQHB', '甜甜圈海报', '装饰字体 · 标题', 'decorative']
];
var APPEARANCE_CODE_FONTS = [
  ['Monaco_1', 'Monaco', '经典等宽 · 默认'],
  ['Consolas_1', 'Consolas', '清晰紧凑 · 等宽'],
  ['MapleMono_1', 'Maple Mono', '柔和圆润 · 等宽'],
  ['Hack_1', 'Hack', '辨识度优先 · 等宽']
];
var appearanceFontStates = { text: { seq: 0, cancel: null }, code: { seq: 0, cancel: null } };
var APPEARANCE_FONT_TIMEOUT = 12000;
function appearanceFontList(kind) { return kind === 'code' ? APPEARANCE_CODE_FONTS : APPEARANCE_TEXT_FONTS; }
function appearanceFontKey(kind) { return kind === 'code' ? 'codeFont' : 'font'; }
function appearanceFontFamily(key) {
  return key === 'default' ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Lato, Roboto, 'PingFang SC', 'Microsoft JhengHei', 'Microsoft YaHei', sans-serif" : '"' + key + '", system-ui, sans-serif';
}
function appearanceFontStatus(kind, message, error) {
  var el = document.getElementById('ap-' + kind + '-status');
  if (el) { el.textContent = message; el.dataset.state = error ? 'error' : 'ready'; }
}
function syncAppearanceFonts() {
  ['text', 'code'].forEach(function(kind) {
    var selected = localStorage.getItem(appearanceFontKey(kind));
    var item = appearanceFontList(kind).find(function(f) { return f[0] === selected; });
    appearanceFontList(kind).forEach(function(f) {
      var el = document.getElementById((kind === 'code' ? 'swfc_' : 'swf_') + f[0]);
      if (el) el.setAttribute('aria-pressed', String(selected === f[0]));
    });
    var current = document.getElementById('ap-' + kind + '-current');
    if (current) current.textContent = '当前 · ' + (item ? item[1] : '默认字体');
    var preview = document.getElementById('ap-' + kind + '-preview');
    if (preview && item) preview.style.fontFamily = appearanceFontFamily(selected);
  });
}
function initAppearanceFonts() {
  syncAppearanceFonts();
  ['text', 'code'].forEach(function(kind) {
    appearanceFontStatus(kind, appearanceFontStates[kind].cancel ? '字体加载中，当前字体保持不变…' : '点击选项加载并应用，自动保存；失败时可重新点击重试。');
  });
}
function cancelAppearanceFont(kind) {
  var state = appearanceFontStates[kind];
  state.seq++;
  if (state.cancel) state.cancel();
}
function cancelAppearanceFonts() { cancelAppearanceFont('text'); cancelAppearanceFont('code'); }
function chooseAppearanceFont(key, kind) {
  if (typeof kind === 'undefined') kind = 'text';
  if (kind !== 'text' && kind !== 'code') return Promise.resolve(false);
  var item = appearanceFontList(kind).find(function(f) { return f[0] === key; });
  if (!item) return Promise.resolve(false);
  cancelAppearanceFont(kind);
  var state = appearanceFontStates[kind], seq = state.seq;
  function apply() {
    if (state.seq !== seq) return false;
    if (kind === 'code') setCodeFont(key); else setFont(key);
    syncAppearanceFonts();
    appearanceFontStatus(kind, item[1] + '已应用，自动保存。');
    return true;
  }
  if (key === localStorage.getItem(appearanceFontKey(kind)) || key === 'default') return Promise.resolve(apply());
  if (!document.fonts || typeof document.fonts.load !== 'function') {
    appearanceFontStatus(kind, '此浏览器无法确认字体加载，已保留当前字体；可选择系统默认。', true);
    return Promise.resolve(false);
  }
  appearanceFontStatus(kind, '正在加载 ' + item[1] + '，当前字体保持不变…');
  return new Promise(function(resolve) {
    var settled = false, timer;
    function finish(ok, message) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (state.cancel === cancel) state.cancel = null;
      if (state.seq !== seq) { resolve(false); return; }
      if (ok) resolve(apply());
      else { if (message) appearanceFontStatus(kind, message, true); resolve(false); }
    }
    function cancel() { finish(false, ''); }
    state.cancel = cancel;
    timer = setTimeout(function() { finish(false, '字体加载超时，已保留当前字体；点击同一选项可重试。'); }, APPEARANCE_FONT_TIMEOUT);
    var sample = kind === 'code' ? 'const value = 0; // 0O 1lI {} [] () => 中文' : '清风翻书，阅读让世界更清晰。 Abc 0123456789';
    try {
      Promise.resolve(document.fonts.load('16px "' + key + '"', sample)).then(function(faces) {
        finish(!!faces && faces.length > 0, '字体未能加载，已保留当前字体；点击同一选项可重试。');
      }, function() { finish(false, '字体加载失败，已保留当前字体；点击同一选项可重试。'); });
    } catch (err) { finish(false, '字体加载失败，已保留当前字体；点击同一选项可重试。'); }
  });
}
function resetAppearanceFonts() {
  cancelAppearanceFonts();
  setFont('LXGWScreen');
  setCodeFont('Monaco_1');
  initAppearanceFonts();
  appearanceFontStatus('text', '已恢复霞鹜文楷Screen，仅重置字体。');
  appearanceFontStatus('code', '已恢复Monaco，不影响背景、主题色及其他偏好。');
}
function appearanceFontOptions(items, kind) {
  return items.map(function(f) {
    var prefix = kind === 'code' ? 'swfc_' : 'swf_';
    return '<button type="button" class="ap-font-option" id="' + prefix + f[0] + '" data-font-kind="' + kind + '" aria-pressed="false" onclick="chooseAppearanceFont(&quot;' + f[0] + '&quot;,&quot;' + kind + '&quot;)"><span class="ap-font-name">' + f[1] + '</span><small>' + f[2] + '</small><span class="ap-check" aria-hidden="true">✓</span></button>';
  }).join('');
}
function appearanceFontMarkup() {
  return '<section class="ap-panel ap-font-panel" aria-label="字体选择">' +
    '<div class="ap-section-head"><div><p class="ap-eyebrow">阅读的声音</p><p class="ap-hint">先看同一段文字，再选喜欢的字体；预览区随当前选择更新。</p></div><button type="button" class="ap-btn" onclick="resetAppearanceFonts()">恢复字体默认</button></div>' +
    '<h3 class="ap-subtitle">阅读优先</h3><div id="swfs" class="ap-font-grid">' + appearanceFontOptions(APPEARANCE_TEXT_FONTS.filter(function(f) { return f[3] === 'reading'; }), 'text') + '</div>' +
    '<details class="ap-details"><summary>个性装饰 · 更适合标题与短句</summary><div class="ap-font-grid">' + appearanceFontOptions(APPEARANCE_TEXT_FONTS.filter(function(f) { return f[3] === 'decorative'; }), 'text') + '</div></details>' +
    '<div class="ap-preview"><p id="ap-text-current" class="ap-current"></p><p id="ap-text-preview" class="ap-text-sample">清风翻书，阅读让世界更清晰。<br>每一次停顿，都让文字有了呼吸。<br>Abc · 0123456789</p></div><p id="ap-text-status" class="ap-status" role="status" aria-live="polite"></p>' +
    '<h3 class="ap-subtitle">代码字体</h3><div id="swfs_code" class="ap-font-grid ap-code-grid">' + appearanceFontOptions(APPEARANCE_CODE_FONTS, 'code') + '</div>' +
    '<div class="ap-preview"><p id="ap-code-current" class="ap-current"></p><pre id="ap-code-preview" class="ap-code-sample">const greeting = "Hello, 世界";\n// 字形对比：0O · 1lI · {} [] ()\nconst values = [0, 1, 10];\nvalues.map(value =&gt; value + 1);</pre></div><p id="ap-code-status" class="ap-status" role="status" aria-live="polite"></p>' +
    '<details class="ap-details ap-license"><summary>字体来源与授权说明</summary><p class="ap-hint">字体授权以各字体发布方许可为准。装饰字体更适合标题或短句；本站保留现有选项，如有授权问题请联系站长处理。</p></details></section>';
}
