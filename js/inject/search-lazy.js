/* ============================================================================
 * inject/search-lazy.js —— Algolia 搜索按需加载（2026-10-04，性能优化第③步）
 * ----------------------------------------------------------------------------
 * 【为什么】
 * 主题默认在【每一页】把 Algolia 三连脚本当成阻塞脚本加载（原
 * themes/fomalhaut/layout/includes/additional-js.pug:25-29）：
 *     algoliasearch-lite.umd.js        13.6 KB（压缩后约 4 KB）
 *     instantsearch.production.min.js 277   KB（压缩后约 88 KB）
 *     /js/search/algolia.js             5   KB
 * 但它们只有在用户点开搜索框之后才用得上。三个都没有 defer，
 * 等于每次访问都在为「可能永远不会用的功能」付一次下载 + 解析，
 * 全站每一页都付。
 *
 * 【怎么做】分两段，对应「聪明做法」：
 *   ① 空闲预取：页面 load 之后的空闲时刻，用 <link rel=prefetch> 把三个文件
 *      静静拉进浏览器 HTTP 缓存。只下载、不执行 —— 所以不占主线程，
 *      也不会和首屏图片抢带宽（等 load 之后才开始）。
 *   ② 点击兜底：万一用户点得比预取快（或者浏览器忽略了 prefetch 提示），
 *      先立刻把搜索面板打开（有反馈，不像卡住），再按顺序注入三个脚本；
 *      就绪后自动聚焦输入框。也就是「最差等于原来的体验，最好等于零等待」。
 *
 * 【地址从哪来】不写死在本文件。主题 additional-js.pug 会把 CDN 配置
 * （_config.fomalhaut.yml 的 CDN.option）解析好的三条 URL 放进
 * window.__SEARCH_LAZY__，本文件只消费它 —— 以后换 CDN 只改配置。
 *
 * 【为什么必须劫持 addEventListener】
 * 主题的 algolia.js 整段包在 window.addEventListener('load', …) 里。
 * 页面已经 load 过之后，load 不会再来第二次 —— 直接注入的话整个搜索模块
 * 永远不会初始化。所以在「readyState 已经是 complete」时，执行 algolia.js
 * 期间临时接管 window.addEventListener，把注册进来的 load 回调当场同步执行，
 * 脚本一执行完就立刻还原。
 * 页面还没 load 的情况（用户第一秒就点搜索）走另一条路：让它照常注册，
 * 等 load 事件跑完初始化之后再认为「就绪」。
 *
 * 【2026-10-11 修的三件事】用户反馈「搜索点开一直显示正在加载」：
 *   ① 卡住提示的根因 —— 老版本把加载提示 innerHTML 写进 #algolia-hits，
 *      并靠 data-search-lazy 属性判断「插过没有」。但 instantsearch 的 hits
 *      组件在【没有 query】时什么都不渲染（主题配置 searchAsYouType:false +
 *      searchFunction 里 helper.state.query 为空就不搜索），提示就一直留在那儿；
 *      而 instantsearch 替换容器内容时属性还挂在容器上，清理分支再也进不去，
 *      于是面板永远停在「正在加载搜索…」。
 *      现在提示由本文件自己的一个节点持有（.search-lazy-tip），插在
 *      #algolia-search-results 里、#algolia-hits 的【前面】（兄弟节点，
 *      不受 #algolia-hits > div 的 max-height/滚动条样式影响），
 *      库就绪时直接 removeChild 掉，不依赖任何属性。
 *   ② 失败要看得见 —— 脚本 onerror 以前被当成成功吞掉，现在会 reject：
 *      网络失败 → 提示「加载失败」+ 状态回 IDLE，再点一次可以重试；
 *      脚本加载成功但主题 algolia.js 因 appId/apiKey/indexName 缺失而
 *      静默 return（它只 console.error('Algolia setting is invalid!')）时，
 *      就绪后 300ms 检查 .ais-SearchBox-input 是否存在，不存在同样给出提示，
 *      不再出现「面板打开却一片空白」。
 *   ③ 新增搜索历史 —— localStorage['search-history-v1']，最多 8 条、去重、
 *      最新在前；显示在搜索框下方，点一条即重新搜索，可单条删除 / 一键清空。
 *      打开面板（含库已就绪时由主题自己打开的那条路径）时恢复显示，
 *      开始输入即收起。记录时机：回车、表单 submit、点搜索按钮、点历史条目。
 *   ④ 搜索结果链接改写（2026-10-11 二改，用户反馈「搜到的固定跳去正式站」）——
 *      Algolia 索引里的 url 是构建时按 _config.yml 的 url 写死的正式域，
 *      本地预览（http://localhost:4000）或镜像域名下点搜索结果会跳出本站。
 *      这里用 MutationObserver 盯着 #algolia-hits，把与当前站点不同源的链接
 *      改写成根路径（/posts/xxx.html）：任何域名下点开都留在当前站点，
 *      中键 / ctrl 点击和「复制链接地址」拿到的也都是本站地址。
 *
 * 【和主题/其他脚本的关系】
 *   · #search-button 在 #body-wrap 里，pjax 换页会被替换，所以这里用
 *     document 上的捕获阶段委托，而不是直接绑按钮。
 *   · #algolia-search / #search-mask 在 #body-wrap 之外（layout.pug:125），
 *     pjax 不会替换它们，面板状态可以跨页保留（搜索历史节点因此也只建一次）。
 *   · 库一旦就绪（state=READY），本文件的点击拦截立刻让位，
 *     完全交回主题 algolia.js 自己的处理函数，只额外补一次「显示历史」。
 *   · source/js/modules/shell.js:211-222 的「搜索框修复」只依赖静态的
 *     #algolia-hits 节点，与库是否加载无关，不受影响。
 *
 * 【回滚】见 bak/perf-search-lazy-20261004/ROLLBACK.txt：
 *   删除本文件 + 从 _config.fomalhaut.yml 的 inject.bottom 去掉那一行 +
 *   把 additional-js.pug 的 search 分支换回三条 <script>。
 *   2026-10-11 这次的改动前副本见 bak/search-toc-fix-20261011/before/。
 * ========================================================================== */
(function () {
  'use strict'

  var urls = window.__SEARCH_LAZY__
  if (!urls || !urls.length) return

  var STATE_IDLE = 0, STATE_LOADING = 1, STATE_READY = 2
  var state = STATE_IDLE
  var waiters = []
  var dialogShown = false

  var SPINNER_HTML = '<i class="fas fa-spinner fa-spin"></i> 正在加载搜索…'
  var ERROR_HTML = '<i class="fas fa-exclamation-circle"></i> 搜索模块加载失败，'
    + '请检查网络后重新点开搜索'

  /* ------------------------------ 注入 ------------------------------ */

  function appendScript(url, onDone, onFail) {
    var s = document.createElement('script')
    s.src = url
    // 动态插入的 script 默认是 async，关掉它保证「前一个执行完再执行下一个」
    s.async = false
    s.onload = function () { onDone() }
    s.onerror = function () {
      console.warn('[search-lazy] 脚本加载失败：' + url)
      // 以前这里直接 onDone()，把失败当成功 —— 面板会一直转圈。
      if (onFail) onFail(new Error('脚本加载失败：' + url))
      else onDone()
    }
    document.head.appendChild(s)
  }

  // 注入最后一个脚本（algolia.js，负责初始化 InstantSearch）
  function appendInitScript(url, onDone, onFail) {
    if (document.readyState === 'complete') {
      // 页面已经 load 过：临时接管 addEventListener，把它的 load 回调同步跑掉
      var nativeAdd = window.addEventListener
      window.addEventListener = function (type, fn, opts) {
        if (type === 'load' && typeof fn === 'function') {
          try { fn() } catch (err) { console.error('[search-lazy] 搜索初始化异常', err) }
          return
        }
        return nativeAdd.call(window, type, fn, opts)
      }
      appendScript(url, function () {
        window.addEventListener = nativeAdd
        onDone()
      }, function (err) {
        window.addEventListener = nativeAdd
        onFail(err)
      })
    } else {
      // 页面还没 load：algolia.js 会正常注册到 load 上。
      // 先注入（它会注册自己的监听），再挂我们的监听 —— 后注册的后触发，
      // 保证「它的初始化先跑完」才放行。
      appendScript(url, function () {}, onFail)
      window.addEventListener('load', function () { onDone() })
    }
  }

  function load() {
    if (state === STATE_READY) return Promise.resolve(true)
    if (state === STATE_LOADING) return new Promise(function (r) { waiters.push(r) })
    state = STATE_LOADING

    var chain = Promise.resolve()
    urls.forEach(function (url, i) {
      chain = chain.then(function () {
        return new Promise(function (done, fail) {
          if (i === urls.length - 1) appendInitScript(url, done, fail)
          else appendScript(url, done, fail)
        })
      })
    })

    return chain.then(function () {
      state = STATE_READY
      // 库加载完 ≠ 搜索可用：见文件头 ②。给主题初始化留一点时间再检查。
      return new Promise(function (r) { window.setTimeout(r, 300) })
    }).then(function () {
      if (!document.querySelector('#algolia-search .ais-SearchBox-input')) {
        state = STATE_IDLE
        console.error('[search-lazy] 搜索框未渲染：主题 algolia.js 可能未通过配置校验')
        showTip(ERROR_HTML)
        waiters.splice(0).forEach(function (r) { r(false) })
        return false
      }
      hideTip()
      setupHistory()
      normalizeResultLinks()
      waiters.splice(0).forEach(function (r) { r(true) })
      return true
    }).catch(function (err) {
      state = STATE_IDLE
      console.error('[search-lazy] 加载流程出错', err)
      showTip(ERROR_HTML)
      waiters.splice(0).forEach(function (r) { r(false) })
      return false
    })
  }

  /* -------------------- ① 空闲预取（只下载不执行） -------------------- */

  function prefetch() {
    if (state !== STATE_IDLE) return
    urls.forEach(function (url) {
      var l = document.createElement('link')
      l.rel = 'prefetch'
      l.as = 'script'
      l.href = url
      document.head.appendChild(l)
    })
  }

  function onIdle(fn) {
    if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 3000 })
    else window.setTimeout(fn, 1500)
  }

  if (document.readyState === 'complete') onIdle(prefetch)
  else window.addEventListener('load', function () { onIdle(prefetch) })

  /* ---------------------- 提示节点（加载中 / 失败） ---------------------- */

  var tipNode = null

  // 提示放在 #algolia-search-results 里（#algolia-hits 的前一个兄弟），
  // 这样既不会被 hits 组件替换掉，也不受 #algolia-hits > div 的滚动样式影响。
  function resultsHost() {
    return document.getElementById('algolia-search-results')
      || document.getElementById('algolia-hits')
  }

  function showTip(html) {
    var host = resultsHost()
    if (!host) return
    if (!tipNode || !tipNode.parentNode) {
      tipNode = document.createElement('div')
      tipNode.className = 'search-lazy-tip'
      host.insertBefore(tipNode, host.firstChild)
    }
    tipNode.innerHTML = html
  }

  function hideTip() {
    if (tipNode && tipNode.parentNode) tipNode.parentNode.removeChild(tipNode)
    tipNode = null
  }

  /* --------- ③ 搜索结果链接改写成站内相对链接（2026-10-11 二改） --------- */

  var linkFixHost = null

  // Algolia 索引里的 url 是构建时按 _config.yml 的 url 写死的正式域
  // （构建时写死的正式域名）。于是本地预览 http://localhost:4000 或镜像域名
  // 下点搜索结果就会跳出本站。这里把「与当前站点不同源」的链接改写成
  // 根路径形式（/posts/xxx.html）：任何域名下点开都留在当前站点，
  // 中键 / ctrl 点击与「复制链接地址」拿到的也都是本站地址。
  // 用 MutationObserver 盯 hits 容器，因为每次渲染 instantsearch 都会
  // 重写容器内容（属性判断那套已被证明不可靠，见文件头 ①）。
  function normalizeResultLinks() {
    if (typeof MutationObserver === 'undefined'
      || typeof URL === 'undefined'
      || !window.location) return
    var host = document.getElementById('algolia-hits')
    if (!host || host === linkFixHost) return
    linkFixHost = host

    var rewrite = function () {
      var list = host.querySelectorAll('a[href]')
      for (var i = 0; i < list.length; i++) {
        var a = list[i]
        var raw = a.getAttribute('href')
        if (!raw || raw.charAt(0) === '#' || raw.indexOf('javascript:') === 0) continue
        var abs
        try { abs = new URL(raw, window.location.href) } catch (e) { continue }
        if (!abs || abs.host === window.location.host) continue
        a.setAttribute('href', abs.pathname + abs.search + abs.hash)
      }
    }

    var mo = new MutationObserver(rewrite)
    mo.observe(host, { childList: true, subtree: true })
    rewrite()
  }

  /* --------------- ② 库没就绪时，自己负责开关面板 --------------- */

  function searchDialog() { return document.querySelector('#algolia-search .search-dialog') }
  function searchMask() { return document.getElementById('search-mask') }

  function showDialog() {
    var mask = searchMask(), dlg = searchDialog()
    if (!mask || !dlg) return
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    if (typeof btf !== 'undefined' && btf.animateIn) {
      btf.animateIn(mask, 'to_show 0.5s')
      btf.animateIn(dlg, 'titleScale 0.5s')
    } else {
      mask.style.display = 'block'
      dlg.style.display = 'block'
    }
    dialogShown = true
    // 加载期间给个反馈，免得面板打开却是空的（见文件头 ①：不再动 #algolia-hits）
    showTip(SPINNER_HTML)
  }

  function hideDialog() {
    var mask = searchMask(), dlg = searchDialog()
    document.body.style.width = ''
    document.body.style.overflow = ''
    if (typeof btf !== 'undefined' && btf.animateOut) {
      if (dlg) btf.animateOut(dlg, 'search_close .5s')
      if (mask) btf.animateOut(mask, 'to_hide 0.5s')
    } else {
      if (dlg) dlg.style.display = ''
      if (mask) mask.style.display = ''
    }
    dialogShown = false
  }

  function focusInput() {
    var input = document.querySelector('#algolia-search .ais-SearchBox-input')
    if (input) input.focus()
  }

  /* -------------------- ③ 搜索历史（localStorage） -------------------- */

  var HISTORY_KEY = 'search-history-v1'
  var HISTORY_MAX = 8
  var historyNode = null

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function readHistory() {
    try {
      var v = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]')
      if (Object.prototype.toString.call(v) !== '[object Array]') return []
      return v.filter(function (x) { return typeof x === 'string' && x })
    } catch (e) { return [] }
  }

  function writeHistory(list) {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)))
    } catch (e) { /* 隐私模式等情况下静默失败 */ }
  }

  function renderHistory() {
    if (!historyNode) return
    var box = historyNode.querySelector('.search-history-list')
    if (!box) return
    var list = readHistory()
    var html = ''
    list.forEach(function (q) {
      html += '<span class="search-history-item" data-q="' + esc(q) + '">'
        + '<span class="search-history-text">' + esc(q) + '</span>'
        + '<i class="fas fa-times search-history-del" data-del="' + esc(q)
        + '" title="删除这条记录"></i>'
        + '</span>'
    })
    box.innerHTML = html
  }

  // reason: 'open'（刚打开，强制显示）/ 'input'（在输入，有内容就收起）/ 'submit'（已发起搜索）
  function updateHistoryVisibility(reason) {
    if (!historyNode) return
    if (!readHistory().length) { historyNode.hidden = true; return }
    if (reason === 'open') { historyNode.hidden = false; return }
    if (reason === 'submit') { historyNode.hidden = true; return }
    var input = document.querySelector('#algolia-search .ais-SearchBox-input')
    var q = input && input.value ? input.value.trim() : ''
    historyNode.hidden = q !== ''
  }

  function recordCurrent(reason) {
    var input = document.querySelector('#algolia-search .ais-SearchBox-input')
    if (!input) return
    var q = (input.value || '').trim()
    if (q) {
      var list = readHistory().filter(function (x) { return x !== q })
      list.unshift(q)
      writeHistory(list)
      renderHistory()
    }
    updateHistoryVisibility(reason)
  }

  // 用历史条目发起一次搜索：写值 + 触发 input（instantsearch 的 searchBox 监听它），
  // 再点提交按钮 / 提交表单 / 回车，三条路按可用性依次兜底。
  function runQuery(q) {
    var input = document.querySelector('#algolia-search .ais-SearchBox-input')
    if (!input) return
    input.value = q
    input.dispatchEvent(new Event('input', { bubbles: true }))
    var list = readHistory().filter(function (x) { return x !== q })
    list.unshift(q)
    writeHistory(list)
    renderHistory()
    updateHistoryVisibility('submit')
    input.focus()
    var btn = document.querySelector('#algolia-search .ais-SearchBox-submit')
    if (btn) { btn.click(); return }
    var form = document.querySelector('#algolia-search .ais-SearchBox-form')
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      return
    }
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', keyCode: 13, which: 13, bubbles: true,
    }))
  }

  function onHistoryClick(e) {
    var t = e.target
    if (!t || !t.closest) return

    var del = t.closest('.search-history-del')
    if (del) {
      e.preventDefault()
      e.stopPropagation()
      var dq = del.getAttribute('data-del')
      writeHistory(readHistory().filter(function (x) { return x !== dq }))
      renderHistory()
      updateHistoryVisibility('open')
      return
    }

    if (t.closest('.search-history-clear')) {
      e.preventDefault()
      e.stopPropagation()
      writeHistory([])
      renderHistory()
      updateHistoryVisibility('open')
      return
    }

    var item = t.closest('.search-history-item')
    if (item) {
      e.preventDefault()
      e.stopPropagation()
      var q = item.getAttribute('data-q')
      if (q) runQuery(q)
    }
  }

  function onSearchKeydown(e) {
    if (e.key !== 'Enter' && e.keyCode !== 13) return
    var t = e.target
    if (t && t.classList && t.classList.contains('ais-SearchBox-input')) recordCurrent('submit')
  }

  function onSearchSubmit(e) {
    var t = e.target
    if (t && t.classList && t.classList.contains('ais-SearchBox-form')) recordCurrent('submit')
  }

  // 只建一次：#algolia-search 在 #body-wrap 之外，pjax 不会替换它。
  function setupHistory() {
    if (historyNode) return
    var wrap = document.getElementById('algolia-search-input')
    if (!wrap || !wrap.parentNode) return

    var node = document.createElement('div')
    node.className = 'search-history'
    node.hidden = true
    node.innerHTML = '<div class="search-history-head">'
      + '<span class="search-history-title"><i class="fas fa-history"></i> 搜索历史</span>'
      + '<button type="button" class="search-history-clear">清空</button>'
      + '</div>'
      + '<div class="search-history-list"></div>'
    wrap.parentNode.insertBefore(node, wrap.nextSibling)
    historyNode = node

    var root = document.getElementById('algolia-search')
    if (root) {
      // 全部走捕获阶段：先于 instantsearch 自己的处理，记录不受它影响
      root.addEventListener('click', onHistoryClick)
      root.addEventListener('keydown', onSearchKeydown, true)
      root.addEventListener('submit', onSearchSubmit, true)
      root.addEventListener('input', function () { updateHistoryVisibility('input') }, true)
    }

    renderHistory()
    updateHistoryVisibility('open')
  }

  /* -------- 点击拦截：捕获阶段，保证先于主题自己的按钮监听 -------- */

  document.addEventListener('click', function (e) {
    var t = e.target
    var onBtn = t && t.closest && t.closest('#search-button')

    // 库已就绪 —— 面板由主题的 algolia.js 自己打开（带动画和聚焦），
    // 这里只补一次「显示历史」：主题的 openSearch() 不会清空输入框，
    // 重新打开时里面可能还是上次搜的词，历史必须能看见。
    if (state === STATE_READY) {
      if (onBtn) window.setTimeout(function () { updateHistoryVisibility('open') }, 120)
      return
    }

    // 点搜索按钮：先开面板给反馈，再加载
    if (onBtn) {
      e.preventDefault()
      e.stopPropagation()
      var wasShown = dialogShown
      showDialog()
      if (dialogShown) updateHistoryVisibility('open')
      load().then(function (ok) {
        if (!dialogShown) return
        if (ok) window.setTimeout(focusInput, wasShown ? 0 : 60)
        updateHistoryVisibility('open')
      })
      return
    }

    // 就绪前的关闭兜底：否则面板会「关不掉」
    if (dialogShown && t && (t.id === 'search-mask' ||
        (t.closest && t.closest('.search-close-button')))) {
      e.preventDefault()
      e.stopPropagation()
      hideDialog()
    }
  }, true)
})()
