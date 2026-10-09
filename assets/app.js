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
  var LEXIQUE = localized('shared/lexique.html');
  var SHARED = localized('shared/kata.html');
  var ABOUT = localized('shared/about.html');
  var UNIFORM = localized('shared/uniforme.html');
  var HOME = localized('shared/accueil.html');
  var CHANGELOG = localized('shared/changelog.html');
  var LABELS = localized('shared/libelles.html');    // menu and interface labels
  var PRINT_TEXTS = localized('shared/impression.html');  // texts used only in print
  var params = new URLSearchParams(location.search);

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  var cache = {};
  function fetchText(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (r) {
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
  function isAvailable(k) { return !!k.file && (!isDraft(k) || LOCAL); }
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

  // Printed chapters: each kata, the karate uniform and the vocabulary. « tout » prints them all, in menu order.
  function chapterIds(manifest, target) {
    if (target !== 'tout') return [target];
    return ['uniforme', 'kata'].concat(manifest.katas.filter(isAvailable).map(function (k) { return k.id; }), ['lexique']);
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
    if (id === 'lexique') return fetchFragment(LEXIQUE).then(function (lexique) {
      doc.innerHTML = cover(T('lexique-titre', 'Lexique du karatéka'), T('lexique-sous-titre', 'Kohai · les notes d’un élève'));
      var lex = lexique.querySelector('section').cloneNode(true);
      var h2 = lex.querySelector('h2');
      if (h2) h2.remove();
      var first = lex.querySelector('p');
      if (first) first.classList.add('pb');
      unwrap(lex, doc);
      return appendCredits(doc, null).then(function () { return { doc: doc, title: plain(T('lexique-titre', 'Lexique du karatéka')) }; });
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
      doc.innerHTML = cover(T('kata-titre', 'Katas'), T('kata-sous-titre', 'L’esprit du kata et les erreurs fréquentes'));
      shared.querySelectorAll('section[data-view]').forEach(function (s) { unwrap(s, doc); });
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

  // Every printed document ends with its credits and the disclaimer from the About page.
  function appendCredits(doc, kataId) {
    return fetchFragment(ABOUT).then(function (about) {
      var wrap = document.createElement('div');
      var creditsTitle = T('credits-titre', 'Sources et crédits');
      wrap.innerHTML = '<h2 id="credits" class="pb" data-toc="' + escapeHtml(plain(creditsTitle)) + '">' + creditsTitle + '</h2>';
      var intro = about.querySelector('#credits + p');
      if (intro) wrap.appendChild(intro.cloneNode(true));
      var block = kataId && about.querySelector('[data-credits="' + kataId + '"]');
      if (block) wrap.appendChild(block.cloneNode(true));
      // The About introduction doubles as the printed disclaimer
      var introParas = about.querySelectorAll('.about-head .intro');  // the .lead (who I am) stays on the web page only
      if (introParas.length) {
        var notice = document.createElement('aside');
        notice.className = 'notice';
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
            .preview(content.content, [ROOT + 'assets/style.css', ROOT + 'assets/print.css', ROOT + 'assets/paged.css', sizeUrl], document.body)
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
    if (langLink) langLink.href = (LANG === 'fr' ? 'en/' : '../') + location.hash;
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
    printLink.href = '?print=' + paper.value + '&chapitre=' + encodeURIComponent(printTarget);
    printLink.innerHTML = printTarget === 'tout' ? T('imprimer-tout', 'Tout imprimer') : printLabel;
  }
  paper.addEventListener('change', function () { store('kohai-paper', paper.value); updatePrint(); });
  document.addEventListener('keydown', function (e) {
    if (printTarget && printTarget !== 'tout' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {  // « Tout imprimer » only by its button
      e.preventDefault();
      window.open(printLink.href, '_blank', 'noopener');
    }
  });

  // Routes: #/  ·  #/lexique[/anchor]  ·  #/uniforme[/<view>[/<anchor>]]  ·  #/<kata>[/<view>[/<anchor>]]
  function parseRoute() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { page: parts[0] || '', view: parts[1] || '', anchor: parts[2] || '' };
  }

  // One menu for the whole site. Branches on the current path are open; others stay collapsed unless opened by hand.
  var toggled = {};
  function contains(node, href) {
    return node.href === href || (node.children || []).some(function (c) { return contains(c, href); });
  }
  function buildMenu(manifest, ctx) {
    return [
      { href: '#/', label: T('menu-accueil', 'Accueil'), children: [
        { href: '#/accueil/about', label: T('menu-qu-est-ce-qu-un-kata', 'Qu’est-ce qu’un kata ?') }
      ] },
      { href: '#/uniforme', label: T('menu-uniforme', 'Uniforme de karaté (Dogi)'), children: [
        { href: '#/uniforme/dogi', label: T('menu-dogi', 'Le dogi'), children: ctx.uniformView === 'dogi' ? ctx.uniformItems : null },
        { href: '#/uniforme/choisir', label: T('menu-choisir-dogi', 'Choisir son dogi'), children: ctx.uniformView === 'choisir' ? ctx.uniformItems : null },
        { href: '#/uniforme/entretien', label: T('menu-entretien-dogi', 'Entretien et pliage'), children: ctx.uniformView === 'entretien' ? ctx.uniformItems : null },
        { href: '#/uniforme/obi', label: T('menu-obi', 'Nouer sa ceinture'), children: ctx.uniformView === 'obi' ? ctx.uniformItems : null }
      ] },
      { href: '#/accueil/kata-title', label: T('menu-kata', 'Katas'), open: true, children: [
        { href: '#/kata/esprit', label: T('menu-esprit', 'L\u2019esprit du kata'), children: ctx.sharedView === 'esprit' ? ctx.sharedItems : null },
        { href: '#/kata/erreurs', label: T('menu-erreurs', 'Erreurs fréquentes'), children: ctx.sharedView === 'erreurs' ? ctx.sharedItems : null }
      ].concat(manifest.groups.map(function (g) {
        var ready = manifest.katas.filter(function (k) { return k.group === g.id && isAvailable(k); });
        return { href: '#/accueil/g-' + g.id, label: escapeHtml(L(g.name)), open: ctx.home && ready.length > 0,
          children: ready.map(function (k) {
            return { href: '#/' + k.id, label: escapeHtml(L(k.name)), children: k.id === ctx.kataId ? ctx.kataItems : null };
          }) };
      })) },
      { href: '#/lexique', label: T('menu-lexique', 'Lexique du karatéka'), children: ctx.lexItems || null },
      { href: '#/a-propos', label: T('menu-a-propos', 'À propos'), children: ctx.aboutItems || null }
    ];
  }
  function setNav(tree, activeHref) {
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
    if (narrow.matches) details.removeAttribute('open');  // close the phone menu after navigating
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
    view.innerHTML = '';
    view.appendChild(nodes);
    if (siteFoot) view.appendChild(siteFoot);
    var target = anchorId && document.getElementById(anchorId);
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }

  function renderHome(manifest, anchor) {
    printTarget = 'tout'; updatePrint();
    setCrumb('');
    setNav(buildMenu(manifest, { home: true }), anchor ? '#/accueil/' + anchor : '#/');
    document.title = plain(T('onglet-accueil', 'Kohai · Fiches d’étude des katas'));
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
    var ready = manifest.katas.filter(function (k) { return k.file && !isDraft(k); }).length;
    return fetchFragment(HOME).then(function (frag) {
      var wrap = frag.cloneNode(true);
      var slot = wrap.querySelector('[data-kata-groups]');
      if (slot) slot.outerHTML = groups;
      var count = wrap.querySelector('[data-ready-count]');
      if (count) count.innerHTML = ready + ' ' + (ready > 1 ? T('carte-disponibles', 'disponibles') : T('carte-disponible', 'disponible'));
      show(wrap, anchor);
    });
  }

  function childrenOf(section, base) {
    return Array.prototype.map.call(section.querySelectorAll('h3[id]'), function (h) {
      var label = h.getAttribute('data-toc');
      if (!label) { var c = h.cloneNode(true); c.querySelectorAll('.jp').forEach(function (j) { j.remove(); }); label = c.textContent.trim(); }
      return { href: base + '/' + h.id, label: escapeHtml(label) };
    });
  }

  function renderLexique(manifest, anchor) {
    return fetchFragment(LEXIQUE).then(function (frag) {
      printTarget = 'lexique'; updatePrint();
      setCrumb(plain(T('fil-lexique', 'Lexique')));
      var section = frag.querySelector('section').cloneNode(true);
      setNav(buildMenu(manifest, { lexItems: childrenOf(section, '#/lexique') }), anchor ? '#/lexique/' + anchor : '#/lexique');
      document.title = plain(T('menu-lexique', 'Lexique du karatéka')) + ' · ' + plain(T('site-nom', 'Kohai'));
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
      setNav(buildMenu(manifest, { uniformView: section.dataset.view, uniformItems: childrenOf(section, base) }), anchor ? base + '/' + anchor : base);
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
      // Credits of a draft kata stay hidden until it is published
      section.querySelectorAll('[data-credits]').forEach(function (block) {
        var known = manifest.katas.some(function (x) { return x.id === block.dataset.credits; });
        if (known && !findKata(manifest, block.dataset.credits)) block.remove();
      });
      var slot = section.querySelector('[data-changelog]');
      if (slot && changelog) slot.replaceWith(changelog.cloneNode(true));
      var items = Array.prototype.map.call(section.querySelectorAll('h2[id]'), function (h) {
        return { href: '#/a-propos/' + h.id, label: escapeHtml(h.textContent.trim()) };
      });
      setNav(buildMenu(manifest, { aboutItems: items }), anchor ? '#/a-propos/' + anchor : '#/a-propos');
      document.title = plain(T('menu-a-propos', 'À propos')) + ' · ' + plain(T('site-nom', 'Kohai'));
      show(section, anchor);
    });
  }

  function renderShared(manifest, viewId, anchor) {
    return fetchFragment(SHARED).then(function (frag) {
      var section = frag.querySelector('[data-view="' + viewId + '"]');
      if (!section) { location.hash = '#/'; return; }
      section = section.cloneNode(true);
      printTarget = 'kata'; updatePrint();
      setCrumb(section.dataset.title);
      var base = '#/kata/' + viewId;
      setNav(buildMenu(manifest, { sharedView: viewId, sharedItems: childrenOf(section, base).filter(function (c) { return c.href !== base + '/'; }) }),
        anchor ? base + '/' + anchor : base);
      document.title = section.dataset.title + ' · ' + plain(T('site-nom', 'Kohai'));
      var wrap = document.createElement('div');
      wrap.className = 'kata-view';
      wrap.insertAdjacentHTML('beforeend', '<p class="eyebrow"><a href="#/accueil/kata-title">' + T('menu-kata', 'Katas') + '</a></p>');
      wrap.appendChild(section);
      show(wrap, anchor);
    });
  }

  function renderKata(manifest, kata, viewId, anchor) {
    return fetchFragment(localized(kata.file)).then(function (frag) {
      var sections = Array.prototype.slice.call(frag.querySelectorAll('section[data-view]'));

      var base = '#/' + kata.id;
      var current = sections.filter(function (s) { return s.dataset.view === viewId; })[0] || sections[0];
      var items = sections.map(function (s) {
        return { href: base + '/' + s.dataset.view, label: escapeHtml(s.dataset.title),
          children: s === current ? childrenOf(s, base + '/' + s.dataset.view) : null };
      });
      printTarget = kata.id; updatePrint();
      setCrumb(L(kata.name));
      setNav(buildMenu(manifest, { kataId: kata.id, kataItems: items }), base + '/' + current.dataset.view + (anchor ? '/' + anchor : ''));
      document.title = current.dataset.title + ' · ' + L(kata.name) + ' · ' + plain(T('site-nom', 'Kohai'));

      var idx = sections.indexOf(current);
      var wrap = document.createElement('div');
      wrap.className = 'kata-view';
      if (current.dataset.view !== 'presentation') {
        wrap.insertAdjacentHTML('beforeend', '<p class="eyebrow"><a href="' + base + '/presentation">' + escapeHtml(L(kata.name)) + '</a></p>');
      }
      if (isDraft(kata)) {
        wrap.insertAdjacentHTML('afterbegin', '<p class="draft-banner">' +
          T('brouillon-bandeau', 'Brouillon&nbsp;: ce kata n’est visible qu’en local. Mettez «&nbsp;statut&nbsp;» à «&nbsp;publie&nbsp;» dans katas/katas.json pour le publier.') + '</p>');
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
  var routeToken = 0;
  function route() {
    updateLangLink();
    var r = parseRoute();
    var token = ++routeToken;
    Promise.all([getManifest(), labelsReady]).then(function (res) {
      var manifest = res[0];
      var kata = findKata(manifest, r.page);
      var url = !r.page || r.page === 'accueil' ? HOME : r.page === 'lexique' ? LEXIQUE : r.page === 'uniforme' ? UNIFORM : r.page === 'a-propos' ? ABOUT : r.page === 'kata' ? SHARED : kata ? localized(kata.file) : null;
      return (url ? fetchText(url) : Promise.resolve()).then(function () { return manifest; });
    }).then(function (manifest) {
      if (token !== routeToken) return;  // the user already navigated somewhere else
      if (!r.page || r.page === 'accueil') return renderHome(manifest, r.view);
      if (r.page === 'lexique') return renderLexique(manifest, r.view);
      if (r.page === 'uniforme') return renderUniform(manifest, r.view, r.anchor);
      if (r.page === 'a-propos') return renderAbout(manifest, r.view);
      if (r.page === 'kata') return renderShared(manifest, r.view || 'esprit', r.anchor);
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
