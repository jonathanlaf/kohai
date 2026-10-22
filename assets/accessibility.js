/* External navigation is announced without replacing the link's accessible name. */
(function () {
  'use strict';
  var hint = document.createElement('span');
  hint.id = 'new-tab-hint';
  hint.className = 'visually-hidden';
  (document.querySelector('header') || document.body).appendChild(hint);
  function enhance() {
    var message = document.documentElement.lang === 'en' ? 'Opens in a new tab' : 'Ouvre dans un nouvel onglet';
    if (hint.textContent !== message) hint.textContent = message;
    document.querySelectorAll('a[href]').forEach(function (a) {
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
      var external = /^https?:$/.test(url.protocol) && url.origin !== location.origin;
      if (external) {
        if (a.target !== '_blank') a.target = '_blank';
        var rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
        rel.add('noopener'); rel.add('noreferrer');
        var value = Array.from(rel).join(' ');
        if (a.getAttribute('rel') !== value) a.setAttribute('rel', value);
      }
      var ids = (a.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) { return id && id !== hint.id; });
      if (a.target === '_blank') ids.push(hint.id);
      var description = ids.join(' ');
      if (description && a.getAttribute('aria-describedby') !== description) a.setAttribute('aria-describedby', description);
    });
  }
  // Hash routers must not interpret the skip link as a different page.
  document.addEventListener('click', function (event) {
    var skip = event.target.closest('.skip-link');
    if (!skip) return;
    var target = document.querySelector(skip.getAttribute('href'));
    if (target) {
      event.preventDefault();
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    }
  });
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    queueMicrotask(function () { pending = false; enhance(); });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'target'] });
  new MutationObserver(enhance).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  enhance();
}());
