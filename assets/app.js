(function () {
  'use strict';

  var root = document.documentElement;
  // Language of this shell: index.html is French, en/index.html is English (data-root="../" points back to the site root)
  var LANG = /^en\b/i.test(root.lang) ? 'en' : 'fr';
  var ROOT = root.getAttribute('data-root') || '';
  // Content file in the page's language: katas/x.html → katas/x.en.html in English
  function localized(path) { return ROOT + (LANG === 'en' ? path.replace(/\.html$/, '.en.html') : path); }
  // katas.json text fields are {"fr": …, "en": …} (French if a translation is missing, rather than "undefined")
  function L(v) { return v && typeof v === 'object' ? (v[LANG] || v.fr || '') : v; }

  var MANIFEST = ROOT + 'katas/katas.json';
  var SHARED = localized('shared/kata.html');
  var ABOUT = localized('shared/about.html');
  var UNIFORM = localized('shared/uniforme.html');
  // One-page sections (#/<id>[/anchor]): file, menu label and print cover, with their French fallbacks.
  // crumb: a shorter top-bar label (fil-<id>); noHeading: the printed chapter drops the page's h2, already on the cover;
  // noPrint: no print button (the credits are printed with each chapter instead).
  var PAGES = {
    'histoire': { url: localized('shared/histoire.html'), name: 'Histoire du Shotokan', sub: 'Funakoshi Gichin et la naissance du style' },
    'dojo-kun': { url: localized('shared/dojo-kun.html'), name: 'Préceptes du dojo (Kun)', sub: 'Les cinq préceptes du dojo' },
    'etiquette': { url: localized('shared/etiquette.html'), name: 'Étiquette au dojo (Reigi)', sub: 'Le salut, le cours et les titres' },
    'ceintures': { url: localized('shared/ceintures.html'), name: 'Ceintures et grades (Obi)', sub: 'L’ordre des ceintures, les kyu et les dan' },
    'kihon': { url: localized('shared/kihon.html'), name: 'Les bases (Kihon)', sub: 'Les techniques de base et le passage de grade' },
    'lexique': { url: localized('shared/lexique.html'), name: 'Lexique du karatéka', sub: 'Kohai · les notes d’un élève', crumb: 'Lexique', noHeading: true },
    'credits': { url: localized('shared/credits.html'), name: 'Sources et crédits', sub: '', noPrint: true }
  };
  Object.setPrototypeOf(PAGES, null);  // so a route like #/constructor is not taken for a page
  function pageName(id) { return T('menu-' + id, PAGES[id].name); }
  var HOME = localized('shared/accueil.html');
  var CHANGELOG = localized('shared/changelog.html');
  var LABELS = localized('shared/libelles.html');    // menu and interface labels
  var PRINT_TEXTS = localized('shared/impression.html');  // texts used only in print
  var params = new URLSearchParams(location.search);
  // Version of the assets (?v= on app.js in the shells), reused for the stylesheets Paged.js loads
  var V = (function () { var s = document.querySelector('script[src*="assets/app.js"]'); var m = s && /\?v=[^&]+/.exec(s.getAttribute('src')); return m ? m[0] : ''; })();

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  var cache = {};
  function fetchText(url) {
    if (!cache[url]) {
      cache[url] = fetch(url, { cache: 'no-cache' }).then(function (r) {  // always check for a newer version (a 304 when unchanged)
        if (!r.ok) throw new Error(url + ' (' + r.status + ')');
        return r.text();
      }).catch(function (err) {
        delete cache[url];  // let the next navigation retry
        throw err;
      });
    }
    return cache[url];
  }
  // Content files use paths from the site root (img/…); from /en/ they need ROOT in front
  function rebase(frag) {
    if (!ROOT) return;
    frag.querySelectorAll('[src], [href]').forEach(function (el) {
      ['src', 'href'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && !/^(#|\/|\?|[a-z][a-z0-9+.-]*:)/i.test(v)) el.setAttribute(attr, ROOT + v);
      });
    });
  }
  function fetchFragment(url) {
    return fetchText(url).then(function (html) {
      var t = document.createElement('template');
      t.innerHTML = html;
      rebase(t.content);
      return t.content;
    });
  }
  // Editable texts: [data-text="key"] elements from shared/libelles.html and shared/impression.html
  var texts = {};
  function loadTexts(url) {
    return fetchFragment(url).then(function (frag) {
      frag.querySelectorAll('[data-text]').forEach(function (el) { texts[el.dataset.text] = el.innerHTML.trim(); });
    }).catch(function () {});  // missing file: fall back to the built-in texts
  }
  function T(key, fallback) { return Object.prototype.hasOwnProperty.call(texts, key) ? texts[key] : fallback; }
  function plain(html) {
    var t = document.createElement('template');  // inert: no images load, no scripts run
    t.innerHTML = html;
    return t.content.textContent.trim();
  }

  var manifestPromise = null;
  function getManifest() {
    if (!manifestPromise) {
      manifestPromise = fetchText(MANIFEST).then(JSON.parse).catch(function (err) {
        manifestPromise = null;
        throw err;
      });
    }
    return manifestPromise;
  }
  // A kata is shown when it has a file. "statut": "brouillon" in katas.json keeps it to localhost only.
  // Local = this computer or a private network address (phone on the same Wi-Fi), never the public domain
  var LOCAL = /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|\[::1\]|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname) ||
    /\.local$/.test(location.hostname);
  function isDraft(k) { return k.statut === 'brouillon'; }
  // ?apercu=<kata-id>[,<kata-id>…] shows those drafts on the public site too, to share them before they are published
  var PREVIEW = (params.get('apercu') || '').split(',').filter(Boolean);
  if (PREVIEW.length) document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="noindex">');
  function isPreview(k) { return PREVIEW.indexOf(k.id) >= 0; }
  function isAvailable(k) { return !!k.file && (!isDraft(k) || LOCAL || isPreview(k)); }
  function findKata(manifest, id) {
    return manifest.katas.filter(function (k) { return k.id === id && isAvailable(k); })[0];
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ---------- Print (Paged.js) ----------
  var printSize = params.get('print');
  if (printSize === 'letter' || printSize === 'a4') {
    startPagedPrint(printSize, params.get('chapitre') || params.get('kata') || 'lexique', params.get('noprint') === '1');
    return;
  }

  // Printed chapters: the one-page sections (PAGES), the karate uniform, the general Katas chapter, each kata and the vocabulary. « tout » prints them all, in menu order.
  function chapterIds(manifest, target) {
    if (target !== 'tout') return [target];
    return ['histoire', 'dojo-kun', 'etiquette', 'uniforme', 'ceintures', 'kihon', 'kata'].concat(manifest.katas.filter(isAvailable).map(function (k) { return k.id; }), ['lexique']);
  }
  // Every second move of a tutorial is shaded. Marked once in the markup rather than with :nth-of-type,
  // which would restart on each page when Paged.js splits a long table.
  function markStripes(root) {
    root.querySelectorAll('table.steps').forEach(function (t) {
      t.querySelectorAll('tbody.step').forEach(function (b, n) { b.classList.toggle('step-alt', n % 2 === 1); });
    });
  }
  function cover(title, sub) {
    return '<header class="cover"><h1>' + title + '</h1><p class="sub">' + sub + '</p></header>';
  }
  function unwrap(section, doc) {
    Array.prototype.forEach.call(section.cloneNode(true).childNodes, function (n) { doc.appendChild(n.cloneNode(true)); });
  }

  // Builds one printable chapter: { doc, title }. The cover comes first; the table of contents is added after it.
  function buildChapter(manifest, id) {
    var doc = document.createElement('div');
    if (PAGES[id]) return fetchFragment(PAGES[id].url).then(function (frag) {
      doc.innerHTML = cover(T(id + '-titre', PAGES[id].name), T(id + '-sous-titre', PAGES[id].sub));
      var page = frag.querySelector('section').cloneNode(true);
      var h2 = page.querySelector('h2');
      if (h2 && PAGES[id].noHeading) {
        h2.remove();
        var first = page.querySelector('p');
        if (first) first.classList.add('pb');
      } else if (h2) h2.classList.add('pb');
      unwrap(page, doc);
      return appendCredits(doc, id).then(function () { return { doc: doc, title: plain(T(id + '-titre', PAGES[id].name)) }; });
    });
    if (id === 'uniforme') return fetchFragment(UNIFORM).then(function (uniform) {
      doc.innerHTML = cover(T('uniforme-titre', 'Uniforme de karaté (Dogi)'), T('uniforme-sous-titre', 'Kohai · les notes d’un élève'));
      uniform.querySelectorAll('section[data-view]').forEach(function (s, i) {
        var page = s.cloneNode(true);
        var h2 = page.querySelector('h2');
        if (h2 && i === 0) h2.classList.add('pb');  // the text starts after the table of contents, then flows on
        unwrap(page, doc);
      });
      return appendCredits(doc, 'uniforme').then(function () { return { doc: doc, title: plain(T('uniforme-titre', 'Uniforme de karaté (Dogi)')) }; });
    });
    if (id === 'kata') return fetchFragment(SHARED).then(function (shared) {
      doc.innerHTML = cover(T('kata-titre', 'Katas'), T('kata-sous-titre', 'Qu’est-ce qu’un kata, son esprit et les erreurs fréquentes'));
      shared.querySelectorAll('section[data-view]:not([data-view="liste"])').forEach(function (s) { unwrap(s, doc); });  // the kata cards are for the screen
      return appendCredits(doc, 'kata').then(function () { return { doc: doc, title: plain(T('kata-titre', 'Katas')) }; });
    });
    var kata = findKata(manifest, id);
    if (!kata) return Promise.reject(new Error(plain(T('erreur-kata-introuvable', 'kata introuvable')) + ' (' + id + ')'));
    return fetchFragment(localized(kata.file)).then(function (frag) {
      // Unwrap the screen sections so print flows like one long page: cover, kata content, credits
      frag.querySelectorAll('section[data-view]').forEach(function (s) { unwrap(s, doc); });
      return appendCredits(doc, kata.id).then(function () { return { doc: doc, title: L(kata.name) }; });
    });
  }

  // Several chapters in one document repeat the same ids (#credits, #embusen…): give each chapter its own.
  function prefixIds(node, prefix) {
    var ids = {};
    node.querySelectorAll('[id]').forEach(function (el) { ids[el.id] = true; el.id = prefix + el.id; });
    node.querySelectorAll('*').forEach(function (el) {
      Array.prototype.forEach.call(el.attributes, function (attr) {
        var v = attr.value.replace(/url\(#([^)]+)\)/g, function (m, id) { return ids[id] ? 'url(#' + prefix + id + ')' : m; });
        if (v.charAt(0) === '#' && ids[v.slice(1)]) v = '#' + prefix + v.slice(1);
        if (v !== attr.value) attr.value = v;
      });
    });
  }

  // Footers and table of contents numbers, counted per chapter: « Heian Shodan … 3 / 12 ».
  function numberPages() {
    var chapters = {};
    document.querySelectorAll('.pagedjs_page').forEach(function (page) {
      var ch = page.querySelector('[data-chapter]');
      if (!ch) return;
      var key = ch.getAttribute('data-chapter');
      (chapters[key] = chapters[key] || { name: ch.getAttribute('data-chapter-name'), pages: [] }).pages.push(page);
    });
    var numbers = new Map();
    Object.keys(chapters).forEach(function (key) {
      var c = chapters[key];
      c.pages.forEach(function (page, i) {
        numbers.set(page, i + 1);
        if (i === 0) return;  // no footer on the cover
        page.querySelector('.pagedjs_margin-bottom-left .pagedjs_margin-content').textContent = c.name;
        page.querySelector('.pagedjs_margin-bottom-right .pagedjs_margin-content').textContent = (i + 1) + ' / ' + c.pages.length;
      });
    });
    document.querySelectorAll('.toc-p a[href^="#"]').forEach(function (a) {
      var target = document.getElementById(a.getAttribute('href').slice(1));
      var page = target && target.closest('.pagedjs_page');
      if (page && numbers.has(page)) a.setAttribute('data-page', numbers.get(page));
    });
  }

  // Every printed document ends with its credits (from the credits page) and the disclaimer from the About page.
  function appendCredits(doc, kataId) {
    return Promise.all([fetchFragment(ABOUT), fetchFragment(PAGES.credits.url)]).then(function (res) {
      var about = res[0], credits = res[1];
      var wrap = document.createElement('div');
      var block = kataId && credits.querySelector('[data-credits="' + kataId + '"]');
      if (block) {  // a chapter with no sources of its own goes straight to the disclaimer
        var creditsTitle = T('credits-titre', 'Sources et crédits');
        wrap.innerHTML = '<h2 id="credits" class="pb" data-toc="' + escapeHtml(plain(creditsTitle)) + '">' + creditsTitle + '</h2>';
        var intro = credits.querySelector('#credits + p');
        if (intro) wrap.appendChild(intro.cloneNode(true));
        block = block.cloneNode(true);
        block.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });  // not a table of contents line in print
        wrap.appendChild(block);
      }
      // The About introduction doubles as the printed disclaimer
      var introParas = about.querySelectorAll('.about-head .intro');  // the .lead (who I am) stays on the web page only
      if (introParas.length) {
        var notice = document.createElement('aside');
        notice.className = block ? 'notice' : 'notice pb';
        notice.innerHTML = '<h2>' + T('note-titre', 'À propos de ces notes') + '</h2>';
        Array.prototype.forEach.call(introParas, function (el) {
          var p = document.createElement('p');
          p.innerHTML = el.innerHTML;
          notice.appendChild(p);
        });
        wrap.appendChild(notice);
      }
      wrap.insertAdjacentHTML('beforeend', '<p class="source">' +
        T('pied-de-page', 'Une erreur&nbsp;? Écrivez à me@jonathanlafleur.ca. Version à jour&nbsp;: kohai.jonathanlafleur.ca') + '</p>');
      Array.prototype.slice.call(wrap.childNodes).forEach(function (n) { doc.appendChild(n); });
    });
  }

  function buildPrintToc(doc) {
    var items = doc.querySelectorAll('h2[id], h3[id], [data-toc][id]');
    var html = '<nav class="toc-print"><h2>' + T('table-des-matieres', 'Table des matières') + '</h2><ol class="toc-p">';
    var open = false, started = false, seen = {}, nested = !!doc.querySelector('h2[id]');
    Array.prototype.forEach.call(items, function (el) {
      if (seen[el.id]) return;
      seen[el.id] = true;
      var jp = el.querySelector('.jp');
      var label = el.getAttribute('data-toc')
        ? escapeHtml(el.getAttribute('data-toc')) + (jp ? ' ' + jp.outerHTML : '')
        : el.innerHTML.trim();
      var link = '<a href="#' + el.id + '">' + label + '</a>';
      if (el.tagName === 'H3' && nested) {
        if (!open) { html += '<ol>'; open = true; }
        html += '<li>' + link + '</li>';
      } else {
        if (open) { html += '</ol>'; open = false; }
        html += (started ? '</li>' : '') + '<li>' + link;
        started = true;
      }
    });
    if (open) html += '</ol>';
    html += (started ? '</li>' : '') + '</ol></nav>';
    return html;
  }

  function startPagedPrint(size, target, noPrint) {
    root.setAttribute('data-theme', 'light');
    document.addEventListener('DOMContentLoaded', function () {
      document.body.innerHTML = '<div class="paged-status">…</div>';
      var status = document.body.firstChild;
      Promise.all([loadTexts(PRINT_TEXTS), loadTexts(LABELS)]).then(function () {
        status.innerHTML = T('preparation', 'Préparation de l’impression…');
        return getManifest();
      }).then(function (manifest) {
        return Promise.all(chapterIds(manifest, target).map(function (id) { return buildChapter(manifest, id); }));
      }).then(function (chapters) {
        var title = chapters.length > 1 ? plain(T('tout-titre', 'Toutes les notes')) : chapters[0].title;
        document.title = title + ' · ' + plain(T('site-nom', 'Kohai')) + ' ' + plain(T('onglet-impression', '(impression)'));
        var doc = document.createElement('div');
        chapters.forEach(function (built, i) {
          var chapter = document.createElement('section');
          chapter.className = 'chapter';
          chapter.setAttribute('data-chapter', String(i));
          chapter.setAttribute('data-chapter-name', built.title);
          var cov = built.doc.querySelector('header.cover');
          if (cov) {
            cov.insertAdjacentHTML('afterend', buildPrintToc(built.doc));
            var first = cov.nextElementSibling.nextElementSibling;  // the chapter text starts after the cover and its table of contents
            if (first) first.classList.add('pb');
          }
          built.doc.querySelectorAll('.screen-only, .video-frame').forEach(function (el) { el.remove(); });  // no video iframe loads in print
          markStripes(built.doc);
          if (chapters.length > 1) prefixIds(built.doc, 'c' + i + '-');
          Array.prototype.slice.call(built.doc.childNodes).forEach(function (n) { chapter.appendChild(n); });
          doc.appendChild(chapter);
        });
        doc.querySelectorAll('img[loading]').forEach(function (img) { img.removeAttribute('loading'); });

        var heads = {}, n = 0;
        doc.querySelectorAll('table').forEach(function (t) {
          t.setAttribute('data-tid', 't' + (++n));
          var th = t.querySelector('thead');
          if (th) heads['t' + n] = th.outerHTML;
        });

        var script = document.createElement('script');
        script.src = ROOT + 'assets/vendor/paged.js';
        script.onerror = function () { status.innerHTML = T('erreur-module', 'Impossible de charger le module d’impression.'); };
        script.onload = function () {
          var Paged = window.Paged;
          class RepeatTableHeaders extends Paged.Handler {
            afterPageLayout(pageElement) {
              pageElement.querySelectorAll('table[data-tid][data-split-from]').forEach(function (t) {
                if (t.querySelector('thead') || !heads[t.dataset.tid]) return;
                t.insertAdjacentHTML('afterbegin', heads[t.dataset.tid]);
              });
            }
          }
          Paged.registerHandlers(RepeatTableHeaders);
          var sizeCss = '@page { size: ' + (size === 'a4' ? 'A4' : 'letter') + ' portrait; }';
          var sizeUrl = URL.createObjectURL(new Blob([sizeCss], { type: 'text/css' }));
          var content = document.createElement('template');
          content.content.appendChild(doc);
          new Paged.Previewer()
            .preview(content.content, [ROOT + 'assets/style.css' + V, ROOT + 'assets/print.css' + V, ROOT + 'assets/paged.css' + V, sizeUrl], document.body)
            .then(function (flow) {
              URL.revokeObjectURL(sizeUrl);
              numberPages();
              status.remove();
              root.setAttribute('data-paged-done', String(flow.total));
              if (!noPrint) setTimeout(function () { window.print(); }, 300);
            })
            .catch(function (err) { status.innerHTML = T('erreur-preparation', 'Impossible de préparer l’impression&nbsp;:') + ' ' + escapeHtml(err.message); });
        };
        document.head.appendChild(script);
      }).catch(function (err) {
        status.innerHTML = T('erreur-preparation', 'Impossible de préparer l’impression&nbsp;:') + ' ' + escapeHtml(err.message);
      });
    });
  }

  // ---------- Web app ----------
  var view = document.getElementById('view');
  var tocWeb = document.getElementById('toc-web');
  var toc = document.getElementById('toc');
  var tocTitle = document.getElementById('toc-title');
  var details = document.getElementById('toc-details');
  var crumb = document.getElementById('crumb');
  var printTools = document.getElementById('print-tools');
  var printLink = document.getElementById('print-link');
  var paper = document.getElementById('paper-size');
  var narrow = window.matchMedia('(max-width: 1099px)');
  var printTarget = null;

  // Theme
  var themeButtons = document.querySelectorAll('[data-theme-choice]');
  function applyTheme(choice) {
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    themeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)); });
  }
  applyTheme(load('kohai-theme') || 'auto');
  themeButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      store('kohai-theme', b.dataset.themeChoice);
      applyTheme(b.dataset.themeChoice);
    });
  });

  // Language link: the same page in the other language (both shells use the same routes)
  var langLink = document.getElementById('lang-link');
  function updateLangLink() {
    if (langLink) langLink.href = (LANG === 'fr' ? 'en/' : '../') + location.search + location.hash;  // keeps ?apercu=
  }
  function chooseOtherLang() {
    updateLangLink();  // current hash, even if it changed without a route
    store('kohai-lang', LANG === 'fr' ? 'en' : 'fr');
  }
  if (langLink) {
    langLink.addEventListener('click', chooseOtherLang);
    langLink.addEventListener('auxclick', function (e) { if (e.button === 1) chooseOtherLang(); });  // middle-click: new tab (not right-click)
  }

  // Print link
  var printLabel = printLink.innerHTML;
  var savedPaper = load('kohai-paper');
  if (savedPaper === 'letter' || savedPaper === 'a4') paper.value = savedPaper;
  function updatePrint() {
    printTools.hidden = !printTarget;
    if (!printTarget) return;
    printLink.href = '?print=' + paper.value + '&chapitre=' + encodeURIComponent(printTarget) + (PREVIEW.length ? '&apercu=' + encodeURIComponent(PREVIEW.join(',')) : '');
    printLink.innerHTML = printTarget === 'tout' ? T('imprimer-tout', 'Tout imprimer') : printLabel;
  }
  paper.addEventListener('change', function () { store('kohai-paper', paper.value); updatePrint(); });
  document.addEventListener('keydown', function (e) {
    if (printTarget && printTarget !== 'tout' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {  // « Tout imprimer » only by its button
      e.preventDefault();
      window.open(printLink.href, '_blank', 'noopener');
    }
  });

  // Routes: #/  ·  #/lexique[/anchor]  ·  #/histoire|dojo-kun|etiquette|kihon[/anchor]  ·  #/uniforme[/<view>[/<anchor>]]  ·  #/<kata>[/<view>[/<anchor>]]
  function parseRoute() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { page: parts[0] || '', view: parts[1] || '', anchor: parts[2] || '' };
  }

  // One menu for the whole site. Branches on the current path are open; others stay collapsed unless opened by hand.
  // Branches the reader opened or closed by hand, remembered across visits (kohai-menu)
  var toggled = (function () { try { return JSON.parse(load('kohai-menu')) || {}; } catch (e) { return {}; } })();
  function contains(node, href) {
    return node.href === href || (node.children || []).some(function (c) { return contains(c, href); });
  }
  // Sub-entries of each menu link (href → items). prefetchMenu() fills them for every page, so each foldable entry
  // shows its arrow from the start; the page being shown refreshes its own.
  var menuKids = {};
  function kids(href) { return menuKids[href] && menuKids[href].length ? menuKids[href] : null; }
  function item(href, label) { return { href: href, label: label, children: kids(href) }; }
  function buildMenu(manifest, ctx) {
    return [
      item('#/', T('menu-accueil', 'Accueil')),
      pageItem('histoire'),
      pageItem('dojo-kun'),
      pageItem('etiquette'),
      { href: '#/uniforme', label: T('menu-uniforme', 'Uniforme de karaté (Dogi)'), children: [
        item('#/uniforme/dogi', T('menu-dogi', 'Le dogi')),
        item('#/uniforme/choisir', T('menu-choisir-dogi', 'Choisir son dogi')),
        item('#/uniforme/entretien', T('menu-entretien-dogi', 'Entretien et pliage')),
        item('#/uniforme/obi', T('menu-obi', 'Nouer sa ceinture'))
      ] },
      pageItem('ceintures'),
      pageItem('kihon'),
      { href: '#/kata', label: T('menu-kata', 'Katas'), children: [
        item('#/kata/definition', T('menu-qu-est-ce-qu-un-kata', 'Qu’est-ce qu’un kata ?')),
        item('#/kata/erreurs', T('menu-erreurs', 'Erreurs fréquentes'))
      ].concat(manifest.groups.map(function (g) {
        var ready = manifest.katas.filter(function (k) { return k.group === g.id && isAvailable(k); });
        return { href: '#/kata/liste/g-' + g.id, label: escapeHtml(L(g.name)), open: ctx.sharedView === 'liste' && ready.length > 0,
          children: ready.map(function (k) { return item('#/' + k.id, escapeHtml(L(k.name))); }) };
      })) },
      pageItem('lexique'),
      item('#/a-propos', T('menu-a-propos', 'À propos')),
      pageItem('credits')
    ];
  }
  function pageItem(id) { return item('#/' + id, pageName(id)); }
  var navState = null;
  function nav(manifest, ctx, activeHref) {
    navState = { manifest: manifest, ctx: ctx, active: activeHref };
    setNav(buildMenu(manifest, ctx), activeHref);
  }

  // Menu sub-entries of each kind of page
  function kataKids(kata, frag) {
    var base = '#/' + kata.id;
    return Array.prototype.map.call(frag.querySelectorAll('section[data-view]'), function (s) {
      return { href: base + '/' + s.dataset.view, label: escapeHtml(s.dataset.title), children: childrenOf(s, base + '/' + s.dataset.view) };
    });
  }
  function sharedKids(section, base) {
    return childrenOf(section, base).filter(function (c) { return c.href !== base + '/'; });
  }
  function aboutKids(section) {
    return Array.prototype.map.call(section.querySelectorAll('h2[id]'), function (h) {
      return { href: '#/a-propos/' + h.id, label: escapeHtml(h.textContent.trim()) };
    });
  }
  // Credits of a draft kata stay hidden until it is published
  function dropDraftCredits(manifest, section) {
    section.querySelectorAll('[data-credits]').forEach(function (block) {
      var known = manifest.katas.some(function (x) { return x.id === block.dataset.credits; });
      if (known && !findKata(manifest, block.dataset.credits)) block.remove();
    });
  }
  var menuPrefetched = false;
  function prefetchMenu(manifest) {
    if (menuPrefetched) return;
    menuPrefetched = true;
    var jobs = Object.keys(PAGES).map(function (id) {
      return fetchFragment(PAGES[id].url).then(function (f) {
        var section = f.querySelector('section').cloneNode(true);
        dropDraftCredits(manifest, section);
        menuKids['#/' + id] = childrenOf(section, '#/' + id);
      });
    });
    jobs.push(fetchFragment(UNIFORM).then(function (f) {
      f.querySelectorAll('section[data-view]').forEach(function (s) { menuKids['#/uniforme/' + s.dataset.view] = childrenOf(s, '#/uniforme/' + s.dataset.view); });
    }));
    jobs.push(fetchFragment(SHARED).then(function (f) {
      f.querySelectorAll('section[data-view]').forEach(function (s) {
        if (s.dataset.view !== 'liste') menuKids['#/kata/' + s.dataset.view] = sharedKids(s, '#/kata/' + s.dataset.view);
      });
    }));
    manifest.katas.filter(function (k) { return k.file && isAvailable(k); }).forEach(function (k) {
      jobs.push(fetchFragment(localized(k.file)).then(function (f) { menuKids['#/' + k.id] = kataKids(k, f); }));
    });
    jobs.push(fetchFragment(ABOUT).then(function (f) { menuKids['#/a-propos'] = aboutKids(f.querySelector('section')); }));
    Promise.all(jobs.map(function (j) { return j.catch(function () {}); })).then(function () {
      // Not while the reader is in the menu: rebuilding it would drop their focus. The next page shows the arrows anyway.
      if (navState && !toc.contains(document.activeElement)) setNav(buildMenu(navState.manifest, navState.ctx), navState.active, true);
    });
  }
  function setNav(tree, activeHref, refresh) {
    tocWeb.hidden = false;
    tocTitle.innerHTML = T('menu-titre', 'Menu');
    function list(items) {
      return items.map(function (it) {
        var kids = it.children && it.children.length;
        var isActive = it.href === activeHref;
        var open = toggled.hasOwnProperty(it.href) ? toggled[it.href] : (it.open || contains(it, activeHref));
        var link = '<a href="' + it.href + '"' + (isActive ? ' class="active" aria-current="page"' : '') + '>' + it.label + '</a>';
        if (!kids) return '<li><div class="row"><span class="tw-space"></span>' + link + '</div></li>';
        return '<li class="node' + (open ? ' open' : '') + '"><div class="row">' +
          '<button type="button" class="tw" data-key="' + it.href + '" aria-expanded="' + open + '" aria-label="' + escapeHtml(plain(open ? T('menu-replier', 'Replier') : T('menu-deplier', 'Déplier'))) + '"></button>' +
          link + '</div><ol>' + list(it.children) + '</ol></li>';
      }).join('');
    }
    toc.innerHTML = list(tree);
    if (narrow.matches && !refresh) details.removeAttribute('open');  // close the phone menu after navigating
  }
  function syncMenuToWidth() {
    if (narrow.matches) details.removeAttribute('open'); else details.setAttribute('open', '');
  }
  toc.addEventListener('click', function (e) {
    var btn = e.target.closest('.tw');
    if (!btn) return;
    var li = btn.closest('li');
    var open = !li.classList.contains('open');
    li.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', plain(open ? T('menu-replier', 'Replier') : T('menu-deplier', 'Déplier')));
    toggled[btn.dataset.key] = open;
    store('kohai-menu', JSON.stringify(toggled));
  });

  function setCrumb(text) {
    crumb.hidden = !text;
    crumb.textContent = text || '';
  }

  // Videos load only on click: until then a local placeholder stands in and nothing is requested from YouTube
  function videoFacades(nodes) {
    nodes.querySelectorAll('.video-frame iframe').forEach(function (frame) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'video-facade';
      btn.innerHTML = '<span class="video-facade-play" aria-hidden="true"></span>' +
        '<span class="visually-hidden">' + T('video-lire', 'Lire la vidéo') + '</span>' +
        '<span class="video-facade-title"></span>' +
        '<span class="video-facade-note">' + T('video-note', 'La vidéo se charge depuis YouTube quand vous cliquez.') + '</span>';
      btn.querySelector('.video-facade-title').textContent = frame.title;
      btn.addEventListener('click', function () {
        var url = new URL(frame.getAttribute('src'), location.href);
        url.searchParams.set('autoplay', '1');
        frame.setAttribute('src', url.href);
        frame.setAttribute('allow', 'autoplay; ' + (frame.getAttribute('allow') || ''));
        frame.removeAttribute('loading');
        btn.replaceWith(frame);
      });
      frame.replaceWith(btn);
    });
  }

  var siteFoot = document.querySelector('.site-foot');
  function show(nodes, anchorId) {
    videoFacades(nodes);
    markStripes(nodes);
    view.innerHTML = '';
    view.appendChild(nodes);
    if (siteFoot) view.appendChild(siteFoot);
    var target = anchorId && document.getElementById(anchorId);
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }

  function renderHome(manifest) {
    printTarget = 'tout'; updatePrint();
    setCrumb('');
    nav(manifest, {}, '#/');
    document.title = plain(T('onglet-accueil', 'Kohai · Fiches d’étude des katas'));
    return fetchFragment(HOME).then(function (frag) {
      show(frag.cloneNode(true));
    });
  }

  // Kata cards by family (the « Katas » list, #/kata): fills [data-kata-groups] and [data-ready-count]
  function fillKataList(manifest, wrap) {
    function belt(k) {
      // "marron:2" = brown belt with 2 stripes (kyu); "noire:1" = black belt with 1 bar (dan)
      var name = L(k.belt);
      var chips = (k.beltColors || []).map(function (c) {
        var parts = c.split(':'), marks = '';
        for (var i = 0; i < (parseInt(parts[1], 10) || 0); i++) marks += '<b></b>';
        return '<i class="belt belt-' + parts[0] + '" aria-hidden="true">' + marks + '</i>';
      }).join('');
      return '<span class="belt-bar">' + chips + '</span><span class="belt-label">' + T('carte-ceinture', 'Ceinture') + ' ' + escapeHtml(name.charAt(0).toLowerCase() + name.slice(1)) + '</span>';
    }
    function card(k) {
      var inner =
        '<span class="kata-card-jp" lang="ja">' + escapeHtml(k.kanji) + '</span>' +
        '<span class="kata-card-name">' + escapeHtml(L(k.name)) + '</span>' +
        '<span class="kata-card-meaning">' + escapeHtml(L(k.meaning)) + '</span>' +
        '<span class="kata-card-belt">' + belt(k) + '</span>' +
        '<span class="kata-card-meta">' + (isAvailable(k) ? (isDraft(k) ? '<b class="draft-badge">' + T('carte-brouillon', 'Brouillon') + '</b> ' : '') + (k.moves ? k.moves + ' ' + T('carte-mouvements', 'mouvements') : '') : T('carte-en-preparation', 'En préparation')) + '</span>';
      return isAvailable(k)
        ? '<li><a class="kata-card" href="#/' + k.id + '">' + inner + '</a></li>'
        : '<li><div class="kata-card is-soon" aria-disabled="true">' + inner + '</div></li>';
    }
    var groups = manifest.groups.map(function (g) {
      var list = manifest.katas.filter(function (k) { return k.group === g.id; });
      return '<section class="kata-group" aria-labelledby="g-' + g.id + '">' +
        '<h3 id="g-' + g.id + '">' + escapeHtml(L(g.name)) + ' <span class="jp" lang="ja">' + escapeHtml(g.kanji) + '</span>' +
        '<span class="count">' + list.length + ' ' + T('groupe-kata', 'katas') + '</span></h3>' +
        '<p class="group-desc">' + escapeHtml(L(g.description)) + '</p>' +
        '<ul class="kata-list">' + list.map(card).join('') + '</ul></section>';
    }).join('');
    var slot = wrap.querySelector('[data-kata-groups]');
    if (slot) slot.outerHTML = groups;
    var ready = manifest.katas.filter(function (k) { return k.file && !isDraft(k); }).length;
    var count = wrap.querySelector('[data-ready-count]');
    if (count) count.innerHTML = ready + ' ' + (ready > 1 ? T('carte-disponibles', 'disponibles') : T('carte-disponible', 'disponible'));
  }

  function childrenOf(section, base) {
    return Array.prototype.map.call(section.querySelectorAll('h3[id]'), function (h) {
      var label = h.getAttribute('data-toc');
      if (!label) { var c = h.cloneNode(true); c.querySelectorAll('.jp').forEach(function (j) { j.remove(); }); label = c.textContent.trim(); }
      return { href: base + '/' + h.id, label: escapeHtml(label) };
    });
  }

  function renderPage(manifest, id, anchor) {
    return fetchFragment(PAGES[id].url).then(function (frag) {
      printTarget = PAGES[id].noPrint ? null : id; updatePrint();
      setCrumb(plain(PAGES[id].crumb ? T('fil-' + id, PAGES[id].crumb) : pageName(id)));
      var section = frag.querySelector('section').cloneNode(true);
      dropDraftCredits(manifest, section);
      menuKids['#/' + id] = childrenOf(section, '#/' + id);
      nav(manifest, {}, anchor ? '#/' + id + '/' + anchor : '#/' + id);
      document.title = plain(pageName(id)) + ' · ' + plain(T('site-nom', 'Kohai'));
      show(section, anchor);
    });
  }

  function renderUniform(manifest, viewId, anchor) {
    return fetchFragment(UNIFORM).then(function (frag) {
      var sections = Array.prototype.slice.call(frag.querySelectorAll('section[data-view]'));
      var section = sections.filter(function (s) { return s.dataset.view === viewId; })[0];
      if (!section) { location.hash = sections.length ? '#/uniforme/' + sections[0].dataset.view : '#/'; return; }
      section = section.cloneNode(true);
      printTarget = 'uniforme'; updatePrint();
      setCrumb(plain(T('menu-uniforme', 'Uniforme de karaté (Dogi)')));
      var base = '#/uniforme/' + section.dataset.view;
      menuKids[base] = childrenOf(section, base);
      nav(manifest, {}, anchor ? base + '/' + anchor : base);
      document.title = section.dataset.title + ' · ' + plain(T('site-nom', 'Kohai'));
      show(section, anchor);
    });
  }

  function renderAbout(manifest, anchor) {
    return Promise.all([fetchFragment(ABOUT), fetchFragment(CHANGELOG).catch(function () { return null; })]).then(function (res) {
      var frag = res[0], changelog = res[1];
      printTarget = null; updatePrint();
      setCrumb(plain(T('menu-a-propos', 'À propos')));
      var section = frag.querySelector('section').cloneNode(true);
      var slot = section.querySelector('[data-changelog]');
      if (slot && changelog) slot.replaceWith(changelog.cloneNode(true));
      menuKids['#/a-propos'] = aboutKids(section);
      nav(manifest, {}, anchor ? '#/a-propos/' + anchor : '#/a-propos');
      document.title = plain(T('menu-a-propos', 'À propos')) + ' · ' + plain(T('site-nom', 'Kohai'));
      show(section, anchor);
    });
  }

  // #/kata: the kata cards, under a foldable « Qu’est-ce qu’un kata ? » (#/kata/definition[/anchor] opens it;
  // the old #/kata/esprit lands on its « L’esprit du kata » part); #/kata/<view>: another shared page
  var KATA_FOLDS = ['definition'];
  function renderShared(manifest, viewId, anchor) {
    return fetchFragment(SHARED).then(function (frag) {
      if (viewId === 'esprit') { viewId = 'definition'; anchor = anchor === 'annonce' ? anchor : 'esprit'; }
      var openFold = KATA_FOLDS.indexOf(viewId) >= 0 ? viewId : null;
      if (openFold) viewId = 'liste';
      var section = frag.querySelector('[data-view="' + viewId + '"]');
      if (!section) { location.hash = '#/'; return; }
      section = section.cloneNode(true);
      printTarget = 'kata'; updatePrint();
      setCrumb(section.dataset.title);
      var base = '#/kata/' + viewId;
      if (viewId === 'liste') {
        fillKataList(manifest, section);
        var after = section.querySelector('h2');
        KATA_FOLDS.forEach(function (id) {
          var src = frag.querySelector('[data-view="' + id + '"]');
          if (!src) return;
          src = src.cloneNode(true);
          var fold = document.createElement('details');
          fold.className = 'fold';
          fold.id = id;
          fold.open = openFold === id;
          var title = src.querySelector('h2');
          fold.innerHTML = '<summary>' + (title ? title.innerHTML : escapeHtml(src.dataset.title)) + '</summary>';
          if (title) title.remove();
          while (src.firstChild) fold.appendChild(src.firstChild);
          if (after) after.insertAdjacentElement('afterend', fold); else section.prepend(fold);
          after = fold;
        });
        nav(manifest, { sharedView: viewId }, openFold ? '#/kata/' + openFold + (anchor ? '/' + anchor : '') : anchor ? base + '/' + anchor : '#/kata');
      } else {
        menuKids[base] = sharedKids(section, base);
        nav(manifest, { sharedView: viewId }, anchor ? base + '/' + anchor : base);
      }
      document.title = section.dataset.title + ' · ' + plain(T('site-nom', 'Kohai'));
      var wrap = document.createElement('div');
      wrap.className = 'kata-view';
      if (viewId !== 'liste') wrap.insertAdjacentHTML('beforeend', '<p class="eyebrow"><a href="#/kata">' + T('menu-kata', 'Katas') + '</a></p>');
      wrap.appendChild(section);
      show(wrap, anchor || openFold);
    });
  }

  function renderKata(manifest, kata, viewId, anchor) {
    return fetchFragment(localized(kata.file)).then(function (frag) {
      var sections = Array.prototype.slice.call(frag.querySelectorAll('section[data-view]'));

      var base = '#/' + kata.id;
      var current = sections.filter(function (s) { return s.dataset.view === viewId; })[0] || sections[0];
      menuKids[base] = kataKids(kata, frag);
      printTarget = kata.id; updatePrint();
      setCrumb(L(kata.name));
      nav(manifest, {}, base + '/' + current.dataset.view + (anchor ? '/' + anchor : ''));
      document.title = current.dataset.title + ' · ' + L(kata.name) + ' · ' + plain(T('site-nom', 'Kohai'));

      var idx = sections.indexOf(current);
      var wrap = document.createElement('div');
      wrap.className = 'kata-view';
      if (current.dataset.view !== 'presentation') {
        wrap.insertAdjacentHTML('beforeend', '<p class="eyebrow"><a href="' + base + '/presentation">' + escapeHtml(L(kata.name)) + '</a></p>');
      }
      if (isDraft(kata)) {
        wrap.insertAdjacentHTML('afterbegin', '<p class="draft-banner">' +
          (LOCAL ? T('brouillon-bandeau', 'Brouillon&nbsp;: ce kata n’est visible qu’en local. Mettez «&nbsp;statut&nbsp;» à «&nbsp;publie&nbsp;» dans katas/katas.json pour le publier.')
            : T('brouillon-apercu', 'Aperçu&nbsp;: ce kata n’est pas encore publié. Le contenu peut encore changer.')) + '</p>');
      }
      wrap.appendChild(current.cloneNode(true));
      var prev = sections[idx - 1], next = sections[idx + 1];
      wrap.insertAdjacentHTML('beforeend',
        '<nav class="pager" aria-label="' + escapeHtml(plain(T('page-navigation', 'Section précédente et suivante'))) + '">' +
        (prev ? '<a class="pager-prev" href="' + base + '/' + prev.dataset.view + '"><span>' + T('page-precedente', 'Précédent') + '</span>' + escapeHtml(prev.dataset.title) + '</a>' : '<span></span>') +
        (next ? '<a class="pager-next" href="' + base + '/' + next.dataset.view + '"><span>' + T('page-suivante', 'Suivant') + '</span>' + escapeHtml(next.dataset.title) + '</a>' : '<span></span>') +
        '</nav>');
      show(wrap, anchor);
    });
  }

  var labelsReady = loadTexts(LABELS);

  // Footer: when the site was last published, in Montreal time ("17 h 05 @ 7 octobre 2026").
  // GitHub Pages sends the deploy time as Last-Modified on every file, so ask our own site.
  function showLastUpdate(when) {
    var el = document.getElementById('site-updated');
    var d = new Date(when);
    if (!el || isNaN(d)) return;
    var tz = { timeZone: 'America/Montreal' };
    labelsReady.then(function () {
      var locale = plain(T('locale', 'fr-CA'));
      var time = d.toLocaleTimeString(locale, Object.assign({ hour: 'numeric', minute: '2-digit' }, tz));
      var date = d.toLocaleDateString(locale, Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, tz));
      el.innerHTML = T('pied-mise-a-jour', 'Dernière mise à jour&nbsp;:') + ' <time datetime="' + escapeHtml(d.toISOString()) + '">' +
        escapeHtml(time) + ' @ ' + escapeHtml(date) + '</time>';
      el.hidden = false;
    });
  }
  fetch(MANIFEST, { method: 'HEAD', cache: 'no-cache' })
    .then(function (r) { var lm = r.headers.get('Last-Modified'); if (lm) showLastUpdate(lm); })
    .catch(function () {});  // no date shown if the header is missing
  // Links into the old home page (its kata list and « Qu’est-ce qu’un kata ? ») now live in the Katas section
  function oldHomeLink(anchor) {
    if (anchor === 'about') return '#/kata/definition';
    if (/^g-/.test(anchor)) return '#/kata/liste/' + anchor;
    return '#/kata';
  }
  var routeToken = 0;
  function route() {
    updateLangLink();
    var r = parseRoute();
    var token = ++routeToken;
    Promise.all([getManifest(), labelsReady]).then(function (res) {
      var manifest = res[0];
      var kata = findKata(manifest, r.page);
      var url = !r.page || r.page === 'accueil' ? HOME : PAGES[r.page] ? PAGES[r.page].url : r.page === 'uniforme' ? UNIFORM : r.page === 'a-propos' ? ABOUT : r.page === 'kata' ? SHARED : kata ? localized(kata.file) : null;
      return (url ? fetchText(url) : Promise.resolve()).then(function () { return manifest; });
    }).then(function (manifest) {
      if (token !== routeToken) return;  // the user already navigated somewhere else
      setTimeout(function () { prefetchMenu(manifest); }, 0);
      if (r.page === 'accueil' && r.view) { location.replace(oldHomeLink(r.view)); return; }
      if (!r.page || r.page === 'accueil') return renderHome(manifest);
      if (PAGES[r.page]) return renderPage(manifest, r.page, r.view);
      if (r.page === 'uniforme') return renderUniform(manifest, r.view, r.anchor);
      if (r.page === 'a-propos') return renderAbout(manifest, r.view);
      if (r.page === 'kata') return renderShared(manifest, r.view || 'liste', r.anchor);
      var kata = findKata(manifest, r.page);
      if (!kata) { location.hash = '#/'; return; }
      return renderKata(manifest, kata, r.view, r.anchor);
    }).catch(function (err) {
      if (token !== routeToken) return;
      view.innerHTML = '<p class="error">' + T('erreur-chargement', 'Impossible de charger le contenu. Rechargez la page.') +
        ' <small>(' + escapeHtml(err.message) + ')</small></p>';
    });
  }

  window.addEventListener('hashchange', route);
  narrow.addEventListener('change', syncMenuToWidth);
  syncMenuToWidth();
  route();
})();
