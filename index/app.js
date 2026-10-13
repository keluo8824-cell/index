(function () {
  'use strict';
  if (window.__redirectAppBooted) return;
  window.__redirectAppBooted = true;
  // 远程域名 JS：将 domains.js 上传到对应路径。备用地址可自行增加。
  // jsDelivr 通常以正确的 JavaScript MIME 类型提供 GitHub 仓库中的文件。
  var REMOTE_DOMAIN_JS = [
    'https://cdn.jsdelivr.net/gh/keluo8824-cell/index@main/index/domains.js'
    // , 'https://你的备用CDN/domains.js'
  ];
  var LOCAL_DOMAIN_JS = './domains.js';
  var TIMEOUT = 3000;
  var STORAGE_KEY = 'redirect_shuffle_bag_js_v1';
  var started = false;

  function message(text, detail) {
    var node = document.getElementById('message');
    if (node) node.textContent = text;
    var info = document.getElementById('detail');
    if (info) info.textContent = detail || '';
  }
  function normalize(data) {
    if (!Array.isArray(data)) return [];
    var seen = Object.create(null), result = [];
    data.forEach(function (item) {
      if (typeof item !== 'string') return;
      var value = item.trim();
      try {
        var url = new URL(value);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname && !seen[value]) {
          seen[value] = true;
          result.push(value);
        }
      } catch (e) {}
    });
    return result;
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var finished = false;
      var timer;
      // Reset before each load to avoid confusing data from earlier sources.
      window.REDIRECT_DOMAINS = undefined;
      function finish(error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (script.parentNode) script.parentNode.removeChild(script);
        if (error) reject(error);
        else {
          var addresses = normalize(window.REDIRECT_DOMAINS);
          if (addresses.length) resolve(addresses);
          else reject(new Error('域名列表为空或格式错误'));
        }
      }
      script.onload = function () { finish(null); };
      script.onerror = function () { finish(new Error('JS 加载失败')); };
      timer = setTimeout(function () { finish(new Error('JS 加载超时')); }, TIMEOUT);
      script.src = src;
      document.head.appendChild(script);
    });
  }
  function getDomains() {
    var sources = REMOTE_DOMAIN_JS.filter(function (x) { return !!x; });
    sources.push(LOCAL_DOMAIN_JS);
    function next(i) {
      if (i >= sources.length) return Promise.reject(new Error('远程和本地 domains.js 都无法加载'));
      return loadScript(sources[i]).catch(function () { return next(i + 1); });
    }
    // When the HTML is opened with file://, prefer the bundled local JS immediately.
    if (location.protocol === 'file:') return loadScript(LOCAL_DOMAIN_JS);
    return next(0);
  }
  function shuffle(items) {
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = items[i]; items[i] = items[j]; items[j] = temp;
    }
    return items;
  }
  function chooseTarget(domains) {
    var state;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    var signature = JSON.stringify(domains.slice().sort());
    if (!state || state.signature !== signature || !Array.isArray(state.queue)) {
      state = { signature: signature, queue: [], last: '' };
    }
    var permitted = Object.create(null), unique = [];
    domains.forEach(function (item) { permitted[item] = true; });
    state.queue.forEach(function (item) {
      if (permitted[item] && unique.indexOf(item) === -1) unique.push(item);
    });
    if (!unique.length) {
      unique = shuffle(domains.slice());
      if (unique.length > 1 && unique[0] === state.last) {
        var temp = unique.shift(); unique.push(temp);
      }
    }
    var target = unique.shift();
    state.queue = unique;
    state.last = target;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    return target;
  }
  // 每次跳转生成一串 13 位随机数字。固定后缀仅作为普通 URL 查询参数。
  var RANDOM_SUFFIX = '.com.Harvard.edu.mit.edu.nyu.edu.neu.edu';
  function randomDigits13() {
    var out = '';
    var bytes = new Uint8Array(13);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length; i++) out += String(bytes[i] % 10);
    } else {
      for (var j = 0; j < 13; j++) out += String(Math.floor(Math.random() * 10));
    }
    // 第一位非 0，保持 13 位外观。
    if (out.charAt(0) === '0') out = '1' + out.slice(1);
    return out;
  }
  function withRandomParameter(address) {
    var url = new URL(address);
    var oldPattern = /^\d+\.com\.Harvard\.edu\.mit\.edu\.nyu\.edu\.neu\.edu$/i;
    var rawQuery = url.search.replace(/^\?/, '');
    // 旧列表中已有同样后缀时，替换它，而不是不断叠加。
    var remaining = rawQuery.split('&').filter(function (part) {
      return part && !oldPattern.test(part);
    });
    remaining.push(randomDigits13() + RANDOM_SUFFIX);
    url.search = '?' + remaining.join('&');
    return url.href;
  }
  function init() {
    if (started) return;
    started = true;
    var retry = document.getElementById('retry');
    if (retry) retry.onclick = function () { location.reload(); };
    getDomains().then(function (domains) {
      message('正在跳转…');
      location.replace(withRandomParameter(chooseTarget(domains)));
    }).catch(function (err) {
      message('地址加载失败，请检查域名文件。', err.message || String(err));
      if (retry) retry.hidden = false;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
