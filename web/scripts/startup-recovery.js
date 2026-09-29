// Включается в HTML сборки, чтобы работать даже при обрыве загрузки main.js.
(function () {
  var attempts = 0;
  var pending = false;
  var notice;
  function ready() {
    window.__citavukReady = true;
    if (notice) notice.remove();
    clearTimeout(timer);
    window.removeEventListener('error', failed, true);
    window.removeEventListener('online', retry);
  }
  function show() {
    if (window.__citavukReady || notice) return;
    notice = document.createElement('div');
    notice.id = 'citavuk-startup-notice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:9999;padding:14px 18px;border:1px solid #b9584a;border-radius:16px;background:#fff8ed;color:#382317;font:15px/1.5 system-ui;box-shadow:0 4px 20px #0002';
    var label = document.createElement('span');
    label.textContent = 'Соединение прервалось. Восстанавливаем загрузку… ';
    var button = document.createElement('button');
    button.textContent = 'Загрузить заново';
    button.style.cssText = 'padding:8px 12px;margin-left:8px;background:#a52c25;color:white;border:0;border-radius:8px;font:inherit';
    button.onclick = function () { window.location.reload(); };
    notice.appendChild(label); notice.appendChild(button); document.body.appendChild(notice);
  }
  function retry() {
    if (window.__citavukReady || pending || attempts >= 2) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      if (window.__citavukReady) return;
      var entry = document.querySelector('script[type="module"][src]:not([data-startup-retry])');
      if (!entry) return;
      var script = document.createElement('script');
      script.type = 'module'; script.setAttribute('data-startup-retry', 'true');
      var url = new URL(entry.src); url.searchParams.set('startup-retry', String(++attempts));
      script.src = url.href; document.head.appendChild(script);
    }, 1000);
  }
  function failed(event) {
    if (event.target && event.target.tagName === 'SCRIPT' && event.target.type === 'module') { show(); retry(); }
  }
  window.addEventListener('error', failed, true);
  window.addEventListener('online', retry);
  window.addEventListener('citavuk-ready', ready, { once: true });
  var timer = setTimeout(function () { if (!window.__citavukReady) { show(); retry(); } }, 15000);
})();
