(function () {
  "use strict";
  /* ===== 只需要修改这里的远程 JSON 地址 ===== */
  var REMOTE_JSON_URLS = [
    // "https://raw.githubusercontent.com/keluo8824-cell/index/refs/heads/main/index/domains.json",      // 主远程 JSON
    // "https://backup.example.com/domains.json" // 备用远程 JSON
  ];
  var LOCAL_JSON_URL = "./domains.json"; // 远程全部失败后读取本地 JSON
  var FETCH_TIMEOUT_MS = 2500;          // 每个 JSON 地址的超时毫秒数
  var STORAGE_KEY = "redirect_shuffle_bag_v3";
  /* ===== 其他代码通常不需要修改 ===== */

  function normalize(data) {
    var list = Array.isArray(data) ? data : (data && (data.domains || data.urls));
    if (!Array.isArray(list)) return [];
    var seen = Object.create(null), result = [];
    list.forEach(function (item) {
      if (typeof item !== "string") return;
      var value = item.trim();
      try {
        var u = new URL(value);
        if ((u.protocol === "https:" || u.protocol === "http:") && u.hostname && !seen[value]) {
          seen[value] = true;
          result.push(value);
        }
      } catch (e) {}
    });
    return result;
  }

  function fetchDomains(url) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timerId;
    var request = fetch(url, {
      mode: "cors", cache: "no-store",
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      var domains = normalize(data);
      if (!domains.length) throw new Error("JSON 中没有有效域名");
      return domains;
    });
    var timeout = new Promise(function (_, reject) {
      timerId = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error("读取超时"));
      }, FETCH_TIMEOUT_MS);
    });
    return Promise.race([request, timeout]).then(function (value) {
      clearTimeout(timerId);
      return value;
    }, function (err) {
      clearTimeout(timerId);
      throw err;
    });
  }

  function getDomains() {
    var sources = REMOTE_JSON_URLS.filter(function (s) { return typeof s === "string" && s.trim(); });
    sources.push(LOCAL_JSON_URL);
    function tryAt(i) {
      if (i >= sources.length) return Promise.reject(new Error("远程与本地 JSON 均读取失败"));
      return fetchDomains(sources[i]).catch(function () { return tryAt(i + 1); });
    }
    return tryAt(0);
  }

  function shuffle(items) {
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
    }
    return items;
  }

  // 同一浏览器按队列轮换：一轮内不重复，下一轮避免和上一跳相同。
  function chooseTarget(domains) {
    var state = null;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) {}
    var signature = JSON.stringify(domains.slice().sort());
    if (!state || state.signature !== signature || !Array.isArray(state.queue)) {
      state = {signature: signature, queue: [], last: ""};
    }
    var pool = Object.create(null), queue = [];
    domains.forEach(function (url) { pool[url] = true; });
    state.queue.forEach(function (url) {
      if (pool[url] && queue.indexOf(url) === -1) queue.push(url);
    });
    if (!queue.length) {
      queue = shuffle(domains.slice());
      if (queue.length > 1 && queue[0] === state.last) {
        var oldFirst = queue.shift();
        queue.push(oldFirst);
      }
    }
    var target = queue.shift();
    state.queue = queue;
    state.last = target;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    return target;
  }

  function start() {
    var retry = document.getElementById("retry");
    retry.addEventListener("click", function () { location.reload(); });
    getDomains().then(function (domains) {
      location.replace(chooseTarget(domains));
    }).catch(function (error) {
      document.getElementById("message").textContent = "地址加载失败，请检查网络与配置。";
      document.getElementById("detail").textContent = error.message || String(error);
      retry.hidden = false;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
