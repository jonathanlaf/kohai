(function () {
  'use strict';

  // ---------- Language, files and helpers ----------
  var root = document.documentElement;
  // Language of this shell: index.html is French, en/index.html is English (data-root="../" points back to the site root)
  var LANG = /^en\b/i.test(root.lang) ? 'en' : 'fr';
  var ROOT = root.getAttribute('data-root') || '';
  // Content file in the page's language: katas/x.html → katas/x.en.html in English
  function localized(path) { return ROOT + (LANG === 'en' ? path.replace(/\.html$/, '.en.html') : path); }
  // katas.json text fields are {"fr": …, "en": …} (French if a translation is missing, rather than "undefined")
  function L(v) { return v && typeof v === 'object' ? (v[LANG] || v.fr || '') : v; }

  var MANIFEST = ROOT + 'katas/katas.json';
  var HOME = localized('shared/accueil.html');
  var SHARED = localized('shared/kata.html');
  var ABOUT = localized('shared/about.html');
  var UNIFORM = localized('shared/uniforme.html');
  var CHANGELOG = localized('shared/changelog.html');
  var LABELS = localized('shared/libelles.html');    // menu and interface labels
  var PRINT_TEXTS = localized('shared/impression.html');  // texts used only in print
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
  // Print covers of the two other chapters made of shared files
  var COVERS = {
    'uniforme': { name: 'Uniforme de karaté (Dogi)', sub: 'Kohai · les notes d’un élève' },
    'kata': { name: 'Katas', sub: 'Qu’est-ce qu’un kata, son esprit et les erreurs fréquentes' }
  };
  Object.setPrototypeOf(PAGES, null);  // so a route like #/constructor is not taken for a page
  Object.setPrototypeOf(COVERS, null);
  // Site order: the menu and « Tout imprimer » both follow it; the written katas come right after « kata »
  var SECTIONS = ['histoire', 'dojo-kun', 'etiquette', 'uniforme', 'ceintures', 'kihon', 'kata', 'lexique'];
  var params = new URLSearchParams(location.search);
  // Version of the assets (?v= on app.js in the shells), reused for the stylesheets Paged.js loads
  var V = (function () { var s = document.querySelector('script[src*="assets/app.js"]'); var m = s && /\?v=[^&]+/.exec(s.getAttribute('src')); return m ? m[0] : ''; })();

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function toArray(list) { return Array.prototype.slice.call(list); }
  function moveChildren(from, to) { toArray(from.childNodes).forEach(function (n) { to.appendChild(n); }); }
  function settle(promises) { return Promise.all(promises.map(function (p) { return p.catch(function () {}); })); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function plain(html) {
    var t = document.createElement('template');  // inert: no images load, no scripts run
    t.innerHTML = html;
    return t.content.textContent.trim();
  }
  function href(base, anchor) { return anchor ? base + '/' + anchor : base; }

  // ---------- Fetching ----------
  // One request per file and visit; a failure is forgotten so the next navigation retries
  function once(cache, key, make) {
    if (!cache[key]) cache[key] = make().catch(function (err) { delete cache[key]; throw err; });
    return cache[key];
  }
  var texts$ = {};
  function fetchText(url) {
    return once(texts$, url, function () {
      return fetch(url, { cache: 'no-cache' }).then(function (r) {  // always check for a newer version (a 304 when unchanged)
        if (!r.ok) throw new Error(url + ' (' + r.status + ')');
        return r.text();
      });
    });
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
  var manifest$ = {};
  function getManifest() { return once(manifest$, 'm', function () { return fetchText(MANIFEST).then(JSON.parse); }); }

  // Editable texts: [data-text="key"] elements from shared/libelles.html and shared/impression.html
  var texts = {};
  function loadTexts(url) {
    return fetchFragment(url).then(function (frag) {
      frag.querySelectorAll('[data-text]').forEach(function (el) { texts[el.dataset.text] = el.innerHTML.trim(); });
    }).catch(function () {});  // missing file: fall back to the built-in texts
  }
  function T(key, fallback) { return Object.prototype.hasOwnProperty.call(texts, key) ? texts[key] : fallback; }
  function pageName(id) { return T('menu-' + id, PAGES[id].name); }
  // Tab title: « part · part · Kohai »
  function tabTitle() { return toArray(arguments).concat(plain(T('site-nom', 'Kohai'))).join(' · '); }

  // ---------- Katas ----------
  // A kata is shown when it has a file. "statut": "brouillon" in katas.json keeps it to localhost only.
  // Local = this computer or a private network address (phone on the same Wi-Fi), never the public domain
  var LOCAL = /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|\[::1\]|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname) ||
    /\.local$/.test(location.hostname);
  // ?apercu=<kata-id>[,<kata-id>…] shows those drafts on the public site too, to share them before they are published
  var PREVIEW = (params.get('apercu') || '').split(',').filter(Boolean);
  if (PREVIEW.length) document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="noindex">');
  function isDraft(k) { return k.statut === 'brouillon'; }
  function isPreview(k) { return PREVIEW.indexOf(k.id) >= 0; }
  function isAvailable(k) { return !!k.file && (!isDraft(k) || LOCAL || isPreview(k)); }
  function availableKatas(manifest) { return manifest.katas.filter(isAvailable); }
  function findKata(manifest, id) { return manifest.katas.filter(function (k) { return k.id === id && isAvailable(k); })[0]; }
  // Credits of a draft kata stay hidden until it is published
  function isHiddenCredit(manifest, block) {
    var id = block.dataset.credits;
    return manifest.katas.some(function (k) { return k.id === id; }) && !findKata(manifest, id);
  }
  function dropDraftCredits(manifest, node) {
    node.querySelectorAll('[data-credits]').forEach(function (block) { if (isHiddenCredit(manifest, block)) block.remove(); });
  }
  // Every second move of a tutorial is shaded. Marked once in the markup rather than with :nth-of-type,
  // which would restart on each page when Paged.js splits a long table.
  function markStripes(node) {
    node.querySelectorAll('table.steps').forEach(function (t) {
      t.querySelectorAll('tbody.step').forEach(function (b, n) { b.classList.toggle('step-alt', n % 2 === 1); });
    });
  }

  // ---------- Print (Paged.js) ----------
  var printSize = params.get('print');
  if (printSize === 'letter' || printSize === 'a4') {
    startPagedPrint(printSize, params.get('chapitre') || params.get('kata') || 'lexique', params.get('noprint') === '1');
    return;
  }

  // Printed chapters: one id, or « tout » for every chapter in site order
  function chapterIds(manifest, target) {
    if (target !== 'tout') return [target];
    var katas = availableKatas(manifest).map(function (k) { return k.id; });
    return SECTIONS.reduce(function (ids, id) { return ids.concat(id === 'kata' ? [id].concat(katas) : [id]); }, []);
  }
  function cover(title, sub) {
    return '<header class="cover"><h1>' + title + '</h1><p class="sub">' + sub + '</p></header>';
  }
  function coverOf(id) {
    var meta = PAGES[id] || COVERS[id];
    return { title: T(id + '-titre', meta.name), sub: T(id + '-sous-titre', meta.sub) };
  }
  // A page whose cover already shows its title: drop the h2 (the first paragraph then starts the text)
  function dropHeading(section) {
    var h2 = section.querySelector('h2');
    if (h2) h2.remove();
  }
  // The screen sections, unwrapped so print flows like one long page
  function unwrapInto(doc, sections) {
    sections.forEach(function (s) { moveChildren(s.cloneNode(true), doc); });
  }
  // One chapter: { doc, title }. Its cover (from the file itself for a kata) comes first; the table of contents goes after it.
  function chapter(sections, coverHtml, creditsId, title) {
    var doc = document.createElement('div');
    doc.innerHTML = coverHtml;
    unwrapInto(doc, sections);
    return appendCredits(doc, creditsId).then(function () { return { doc: doc, title: title }; });
  }
  // A chapter made of shared files: pick(frag) gives its sections, prepare(section) adjusts each one for print
  function sharedChapter(id, url, pick, prepare) {
    return fetchFragment(url).then(function (frag) {
      var sections = pick(frag).map(function (s) { return s.cloneNode(true); });
      if (prepare) sections.forEach(prepare);
      var c = coverOf(id);
      return chapter(sections, cover(c.title, c.sub), id, plain(c.title));
    });
  }
  function kataChapter(kata) {
    return fetchFragment(localized(kata.file)).then(function (frag) {
      return chapter(toArray(frag.querySelectorAll('section[data-view]')), '', kata.id, L(kata.name));
    });
  }
  function buildChapter(manifest, id) {
    if (PAGES[id]) return sharedChapter(id, PAGES[id].url, function (f) { return [f.querySelector('section')]; }, PAGES[id].noHeading ? dropHeading : null);
    if (id === 'uniforme') return sharedChapter(id, UNIFORM, views);
    if (id === 'kata') return sharedChapter(id, SHARED, function (f) { return views(f).filter(function (s) { return s.dataset.view !== 'liste'; }); });  // the kata cards are for the screen
    var kata = findKata(manifest, id);
    if (!kata) return Promise.reject(new Error(plain(T('erreur-kata-introuvable', 'kata introuvable')) + ' (' + id + ')'));
    return kataChapter(kata);
  }

  // Several chapters in one document repeat the same ids (#credits, #embusen…): give each chapter its own.
  function prefixIds(node, prefix) {
    var ids = {};
    node.querySelectorAll('[id]').forEach(function (el) { ids[el.id] = true; el.id = prefix + el.id; });
    node.querySelectorAll('*').forEach(function (el) {
      toArray(el.attributes).forEach(function (attr) {
        var v = attr.value.replace(/url\(#([^)]+)\)/g, function (m, id) { return ids[id] ? 'url(#' + prefix + id + ')' : m; });
        if (v.charAt(0) === '#' && ids[v.slice(1)]) v = '#' + prefix + v.slice(1);
        if (v !== attr.value) attr.value = v;
      });
    });
  }

  // Footers and table of contents numbers, counted per chapter: « Heian Shodan … 3 / 12 ».
  function pagesByChapter() {
    var chapters = {};
    document.querySelectorAll('.pagedjs_page').forEach(function (page) {
      var ch = page.querySelector('[data-chapter]');
      if (!ch) return;
      var key = ch.getAttribute('data-chapter');
      (chapters[key] = chapters[key] || { name: ch.getAttribute('data-chapter-name'), pages: [] }).pages.push(page);
    });
    return Object.keys(chapters).map(function (key) { return chapters[key]; });
  }
  function setFooter(page, left, right) {
    page.querySelector('.pagedjs_margin-bottom-left .pagedjs_margin-content').textContent = left;
    page.querySelector('.pagedjs_margin-bottom-right .pagedjs_margin-content').textContent = right;
  }
  function numberPages() {
    var numbers = new Map();
    pagesByChapter().forEach(function (c) {
      c.pages.forEach(function (page, i) {
        numbers.set(page, i + 1);
        if (i > 0) setFooter(page, c.name, (i + 1) + ' / ' + c.pages.length);  // no footer on the cover
      });
    });
    document.querySelectorAll('.toc-p a[href^="#"]').forEach(function (a) {
      var target = document.getElementById(a.getAttribute('href').slice(1));
      var page = target && target.closest('.pagedjs_page');
      if (page && numbers.has(page)) a.setAttribute('data-page', numbers.get(page));
    });
  }

  // The chapter's sources, from the credits page (ids dropped: not table of contents lines in print)
  function creditsHtml(credits, id) {
    var block = id && credits.querySelector('[data-credits="' + id + '"]');
    if (!block) return '';
    block = block.cloneNode(true);
    block.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
    var title = T('credits-titre', 'Sources et crédits');
    var intro = credits.querySelector('#credits + p');
    return '<h2 id="credits" class="pb" data-toc="' + escapeHtml(plain(title)) + '">' + title + '</h2>' +
      (intro ? intro.outerHTML : '') + block.outerHTML;
  }
  // The About introduction doubles as the printed disclaimer (the .lead, who I am, stays on the web page only)
  function disclaimerHtml(about, newPage) {
    var paras = toArray(about.querySelectorAll('.about-head .intro'));
    if (!paras.length) return '';
    return '<aside class="notice' + (newPage ? ' pb' : '') + '"><h2>' + T('note-titre', 'À propos de ces notes') + '</h2>' +
      paras.map(function (p) { return '<p>' + p.innerHTML + '</p>'; }).join('') + '</aside>';
  }
  function printFooterHtml() {
    return '<p class="source">' + T('pied-de-page', 'Une erreur&nbsp;? Écrivez à me@jonathanlafleur.ca. Version à jour&nbsp;: kohai.jonathanlafleur.ca') + '</p>';
  }
  // Every printed chapter ends with its credits (if it has sources of its own), the disclaimer and the footer line
  function appendCredits(doc, id) {
    return Promise.all([fetchFragment(ABOUT), fetchFragment(PAGES.credits.url)]).then(function (res) {
      var credits = creditsHtml(res[1], id);
      doc.insertAdjacentHTML('beforeend', credits + disclaimerHtml(res[0], !credits) + printFooterHtml());
    });
  }

  function tocLabel(el) {
    var jp = el.querySelector('.jp');
    return el.getAttribute('data-toc') ? escapeHtml(el.getAttribute('data-toc')) + (jp ? ' ' + jp.outerHTML : '') : el.innerHTML.trim();
  }
  // h2 = a line, h3 = a sub-line under the h2 before it (or a line, when the chapter has no h2)
  function buildPrintToc(doc) {
    var html = '<nav class="toc-print"><h2>' + T('table-des-matieres', 'Table des matières') + '</h2><ol class="toc-p">';
    var open = false, started = false, seen = {}, nested = !!doc.querySelector('h2[id]');
    doc.querySelectorAll('h2[id], h3[id], [data-toc][id]').forEach(function (el) {
      if (seen[el.id]) return;
      seen[el.id] = true;
      var link = '<a href="#' + el.id + '">' + tocLabel(el) + '</a>';
      if (el.tagName === 'H3' && nested) {
        if (!open) { html += '<ol>'; open = true; }
        html += '<li>' + link + '</li>';
      } else {
        if (open) { html += '</ol>'; open = false; }
        html += (started ? '</li>' : '') + '<li>' + link;
        started = true;
      }
    });
    return html + (open ? '</ol>' : '') + (started ? '</li>' : '') + '</ol></nav>';
  }

  // One chapter, ready for layout: table of contents after its cover, screen-only parts out, stripes, unique ids
  function chapterSection(built, i, total) {
    var section = document.createElement('section');
    section.className = 'chapter';
    section.setAttribute('data-chapter', String(i));
    section.setAttribute('data-chapter-name', built.title);
    var cov = built.doc.querySelector('header.cover');
    if (cov) {
      cov.insertAdjacentHTML('afterend', buildPrintToc(built.doc));
      var first = cov.nextElementSibling.nextElementSibling;  // the chapter text starts after the cover and its table of contents
      if (first) first.classList.add('pb');
    }
    built.doc.querySelectorAll('.screen-only, .video-frame').forEach(function (el) { el.remove(); });  // no video iframe loads in print
    markStripes(built.doc);
    if (total > 1) prefixIds(built.doc, 'c' + i + '-');
    moveChildren(built.doc, section);
    return section;
  }
  function printDocument(chapters) {
    var doc = document.createElement('div');
    chapters.forEach(function (built, i) { doc.appendChild(chapterSection(built, i, chapters.length)); });
    doc.querySelectorAll('img[loading]').forEach(function (img) { img.removeAttribute('loading'); });
    return doc;
  }
  // Each table's header, kept to repeat it on every page the table runs onto
  function tableHeads(doc) {
    var heads = {};
    doc.querySelectorAll('table').forEach(function (t, n) {
      t.setAttribute('data-tid', 't' + (n + 1));
      var th = t.querySelector('thead');
      if (th) heads['t' + (n + 1)] = th.outerHTML;
    });
    return heads;
  }
  function registerTableHeads(Paged, heads) {
    class RepeatTableHeaders extends Paged.Handler {
      afterPageLayout(pageElement) {
        pageElement.querySelectorAll('table[data-tid][data-split-from]').forEach(function (t) {
          if (!t.querySelector('thead') && heads[t.dataset.tid]) t.insertAdjacentHTML('afterbegin', heads[t.dataset.tid]);
        });
      }
    }
    Paged.registerHandlers(RepeatTableHeaders);
  }
  function loadPaged() {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = ROOT + 'assets/vendor/paged.js';
      script.onload = function () { resolve(window.Paged); };
      script.onerror = function () { reject({ html: T('erreur-module', 'Impossible de charger le module d’impression.') }); };
      document.head.appendChild(script);
    });
  }
  function layOut(Paged, doc, size) {
    var sizeUrl = URL.createObjectURL(new Blob(['@page { size: ' + (size === 'a4' ? 'A4' : 'letter') + ' portrait; }'], { type: 'text/css' }));
    var content = document.createElement('template');
    content.content.appendChild(doc);
    var sheets = ['style.css', 'print.css', 'paged.css'].map(function (f) { return ROOT + 'assets/' + f + V; }).concat(sizeUrl);
    return new Paged.Previewer().preview(content.content, sheets, document.body).then(function (flow) {
      URL.revokeObjectURL(sizeUrl);
      return flow;
    });
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
        document.title = (chapters.length > 1 ? plain(T('tout-titre', 'Toutes les notes')) : chapters[0].title) + ' · ' +
          plain(T('site-nom', 'Kohai')) + ' ' + plain(T('onglet-impression', '(impression)'));
        var doc = printDocument(chapters);
        var heads = tableHeads(doc);
        return loadPaged().then(function (Paged) {
          registerTableHeads(Paged, heads);
          return layOut(Paged, doc, size);
        });
      }).then(function (flow) {
        numberPages();
        status.remove();
        root.setAttribute('data-paged-done', String(flow.total));
        if (!noPrint) setTimeout(function () { window.print(); }, 300);
      }).catch(function (err) {
        status.innerHTML = err.html || T('erreur-preparation', 'Impossible de préparer l’impression&nbsp;:') + ' ' + escapeHtml(err.message);
      });
    });
  }

  // ---------- Web app: page frame ----------
  var view = document.getElementById('view');
  var tocWeb = document.getElementById('toc-web');
  var toc = document.getElementById('toc');
  var tocTitle = document.getElementById('toc-title');
  var details = document.getElementById('toc-details');
  var crumb = document.getElementById('crumb');
  var printTools = document.getElementById('print-tools');
  var printLink = document.getElementById('print-link');
  var paper = document.getElementById('paper-size');
  var siteFoot = document.querySelector('.site-foot');
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
  function setPrint(target) {
    printTarget = target;
    updatePrint();
  }
  paper.addEventListener('change', function () { store('kohai-paper', paper.value); updatePrint(); });
  document.addEventListener('keydown', function (e) {
    if (printTarget && printTarget !== 'tout' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {  // « Tout imprimer » only by its button
      e.preventDefault();
      window.open(printLink.href, '_blank', 'noopener');
    }
  });

  function setCrumb(text) {
    crumb.hidden = !text;
    crumb.textContent = text || '';
  }

  // Videos load only on click: until then a local placeholder stands in and nothing is requested from YouTube
  function videoFacade(frame) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'video-facade';
    btn.innerHTML = '<span class="video-facade-play" aria-hidden="true"></span>' +
      '<span class="visually-hidden">' + T('video-lire', 'Lire la vidéo') + '</span>' +
      '<span class="video-facade-title"></span>' +
      '<span class="video-facade-note">' + T('video-note', 'La vidéo se charge depuis YouTube quand vous cliquez.') + '</span>';
    btn.querySelector('.video-facade-title').textContent = frame.title;
    btn.addEventListener('click', function () { playVideo(frame, btn); });
    return btn;
  }
  function playVideo(frame, btn) {
    var url = new URL(frame.getAttribute('src'), location.href);
    url.searchParams.set('autoplay', '1');
    frame.setAttribute('src', url.href);
    frame.setAttribute('allow', 'autoplay; ' + (frame.getAttribute('allow') || ''));
    frame.removeAttribute('loading');
    btn.replaceWith(frame);
  }
  function videoFacades(nodes) {
    nodes.querySelectorAll('.video-frame iframe').forEach(function (frame) { frame.replaceWith(videoFacade(frame)); });
  }

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
  // What every page sets around its content: print button, top-bar label, menu, tab title
  function frame(manifest, o) {
    setPrint(o.print || null);
    setCrumb(o.crumb);
    nav(manifest, o.ctx || {}, o.active);
    document.title = o.title;
  }
  // A view under Katas or a kata: an optional banner, a link back up, then the content
  function viewWrap(upHref, upLabel, content) {
    var wrap = document.createElement('div');
    wrap.className = 'kata-view';
    if (upHref) wrap.insertAdjacentHTML('beforeend', '<p class="eyebrow"><a href="' + upHref + '">' + upLabel + '</a></p>');
    wrap.appendChild(content);
    return wrap;
  }

  // ---------- Web app: menu ----------
  // Routes: #/  ·  #/<page>[/anchor] (PAGES)  ·  #/uniforme/<view>[/<anchor>]  ·  #/kata[/<view>[/<anchor>]]  ·  #/a-propos[/anchor]  ·  #/<kata>[/<view>[/<anchor>]]
  function parseRoute() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { page: parts[0] || '', view: parts[1] || '', anchor: parts[2] || '' };
  }

  // Branches the reader opened or closed by hand, remembered across visits (kohai-menu).
  // The other branches are closed, except the one holding the current page.
  var toggled = (function () { try { return JSON.parse(load('kohai-menu')) || {}; } catch (e) { return {}; } })();
  function contains(node, link) {
    return node.href === link || (node.children || []).some(function (c) { return contains(c, link); });
  }
  // Sub-entries of each menu link (href → items). Each page's view function below fills its own; prefetchMenu()
  // runs them all once, so every foldable entry shows its arrow from the start.
  var menuKids = {};
  function item(link, label) { return { href: link, label: label, children: menuKids[link] && menuKids[link].length ? menuKids[link] : null }; }
  function pageItem(id) { return item('#/' + id, pageName(id)); }
  function familyMenu(available, ctx, g) {
    var ready = available.filter(function (k) { return k.group === g.id; });
    return { href: '#/kata/liste/g-' + g.id, label: escapeHtml(L(g.name)), open: ctx.sharedView === 'liste' && ready.length > 0,
      children: ready.map(function (k) { return item('#/' + k.id, escapeHtml(L(k.name))); }) };
  }
  function kataMenu(manifest, ctx) {
    var available = availableKatas(manifest);
    return { href: '#/kata', label: T('menu-kata', 'Katas'), children: [
      item('#/kata/definition', T('menu-qu-est-ce-qu-un-kata', 'Qu’est-ce qu’un kata ?')),
      item('#/kata/erreurs', T('menu-erreurs', 'Erreurs fréquentes'))
    ].concat(manifest.groups.map(function (g) { return familyMenu(available, ctx, g); })) };
  }
  function sectionMenu(manifest, ctx, id) {
    if (id === 'uniforme') return item('#/uniforme', T('menu-uniforme', 'Uniforme de karaté (Dogi)'));
    if (id === 'kata') return kataMenu(manifest, ctx);
    return pageItem(id);
  }
  function buildMenu(manifest, ctx) {
    return [item('#/', T('menu-accueil', 'Accueil'))]
      .concat(SECTIONS.map(function (id) { return sectionMenu(manifest, ctx, id); }))
      .concat([item('#/a-propos', T('menu-a-propos', 'À propos')), pageItem('credits')]);
  }

  function toggleLabel(open) { return plain(open ? T('menu-replier', 'Replier') : T('menu-deplier', 'Déplier')); }
  function menuHtml(items, activeHref) {
    return items.map(function (it) {
      var open = toggled.hasOwnProperty(it.href) ? toggled[it.href] : (it.open || contains(it, activeHref));
      var link = '<a href="' + it.href + '"' + (it.href === activeHref ? ' class="active" aria-current="page"' : '') + '>' + it.label + '</a>';
      if (!(it.children && it.children.length)) return '<li><div class="row"><span class="tw-space"></span>' + link + '</div></li>';
      return '<li class="node' + (open ? ' open' : '') + '"><div class="row">' +
        '<button type="button" class="tw" data-key="' + it.href + '" aria-expanded="' + open + '" aria-label="' + escapeHtml(toggleLabel(open)) + '"></button>' +
        link + '</div><ol>' + menuHtml(it.children, activeHref) + '</ol></li>';
    }).join('');
  }
  function setNav(tree, activeHref, refresh) {
    tocWeb.hidden = false;
    tocTitle.innerHTML = T('menu-titre', 'Menu');
    toc.innerHTML = menuHtml(tree, activeHref);
    if (narrow.matches && !refresh) details.removeAttribute('open');  // close the phone menu after navigating
  }
  var navState = null;
  function nav(manifest, ctx, activeHref) {
    navState = { manifest: manifest, ctx: ctx, active: activeHref };
    setNav(buildMenu(manifest, ctx), activeHref);
  }
  // Not while the reader is in the menu: rebuilding it would drop their focus. The next page shows the arrows anyway.
  function refreshMenu() {
    if (navState && !toc.contains(document.activeElement)) setNav(buildMenu(navState.manifest, navState.ctx), navState.active, true);
  }
  function syncMenuToWidth() {
    if (narrow.matches) details.removeAttribute('open'); else details.setAttribute('open', '');
  }
  toc.addEventListener('click', function (e) {
    var btn = e.target.closest('.tw');
    if (!btn) return;
    var open = btn.closest('li').classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', toggleLabel(open));
    toggled[btn.dataset.key] = open;
    store('kohai-menu', JSON.stringify(toggled));
  });

  // ---------- Web app: views (each one returns what it shows and records its menu sub-entries) ----------
  // The h3 headings of a page, as menu entries (keep(h) can leave some out)
  function headingItems(section, base, keep) {
    return toArray(section.querySelectorAll('h3[id]')).filter(function (h) { return h.id && (!keep || keep(h)); }).map(function (h) {
      var label = h.getAttribute('data-toc');
      if (!label) { var c = h.cloneNode(true); c.querySelectorAll('.jp').forEach(function (j) { j.remove(); }); label = c.textContent.trim(); }
      return { href: base + '/' + h.id, label: escapeHtml(label) };
    });
  }
  function views(frag) { return toArray(frag.querySelectorAll('section[data-view]')); }
  function pageKids(manifest, id, frag) {
    menuKids['#/' + id] = headingItems(frag.querySelector('section'), '#/' + id, function (h) {
      var block = h.closest('[data-credits]');
      return !block || !isHiddenCredit(manifest, block);
    });
  }
  function pageView(manifest, id, frag) {
    pageKids(manifest, id, frag);
    var section = frag.querySelector('section').cloneNode(true);
    dropDraftCredits(manifest, section);
    return section;
  }
  function uniformViews(frag) {
    var sections = views(frag);
    menuKids['#/uniforme'] = sections.map(function (s) {
      var base = '#/uniforme/' + s.dataset.view;
      menuKids[base] = headingItems(s, base);
      return item(base, escapeHtml(s.dataset.title));
    });
    return sections;
  }
  function sharedViews(frag) {
    var sections = views(frag);
    sections.forEach(function (s) { if (s.dataset.view !== 'liste') menuKids['#/kata/' + s.dataset.view] = headingItems(s, '#/kata/' + s.dataset.view); });
    return sections;
  }
  function kataViews(kata, frag) {
    var base = '#/' + kata.id, sections = views(frag);
    menuKids[base] = sections.map(function (s) {
      return { href: base + '/' + s.dataset.view, label: escapeHtml(s.dataset.title), children: headingItems(s, base + '/' + s.dataset.view) };
    });
    return sections;
  }
  function aboutKids(frag) {
    menuKids['#/a-propos'] = toArray(frag.querySelectorAll('section h2[id]')).map(function (h) {
      return { href: '#/a-propos/' + h.id, label: escapeHtml(h.textContent.trim()) };
    });
  }
  function aboutView(frag) {
    aboutKids(frag);
    return frag.querySelector('section').cloneNode(true);
  }
  var menuPrefetched = false;
  function prefetchMenu(manifest) {
    if (menuPrefetched) return;
    menuPrefetched = true;
    var jobs = Object.keys(PAGES).map(function (id) { return fetchFragment(PAGES[id].url).then(function (f) { pageKids(manifest, id, f); }); })
      .concat([fetchFragment(UNIFORM).then(uniformViews), fetchFragment(SHARED).then(sharedViews), fetchFragment(ABOUT).then(aboutKids)])
      .concat(availableKatas(manifest).map(function (k) { return fetchFragment(localized(k.file)).then(function (f) { kataViews(k, f); }); }));
    settle(jobs).then(refreshMenu);
  }

  // ---------- Web app: pages ----------
  function renderHome(manifest) {
    frame(manifest, { print: 'tout', crumb: '', active: '#/', title: plain(T('onglet-accueil', 'Kohai · Fiches d’étude des katas')) });
    return fetchFragment(HOME).then(function (frag) { show(frag.cloneNode(true)); });
  }

  function renderPage(manifest, id, anchor) {
    return fetchFragment(PAGES[id].url).then(function (frag) {
      var section = pageView(manifest, id, frag);
      frame(manifest, { print: PAGES[id].noPrint ? null : id, crumb: plain(PAGES[id].crumb ? T('fil-' + id, PAGES[id].crumb) : pageName(id)),
        active: href('#/' + id, anchor), title: tabTitle(plain(pageName(id))) });
      show(section, anchor);
    });
  }

  function renderUniform(manifest, viewId, anchor) {
    return fetchFragment(UNIFORM).then(function (frag) {
      var sections = uniformViews(frag);
      var section = sections.filter(function (s) { return s.dataset.view === viewId; })[0];
      if (!section) { location.replace(sections.length ? '#/uniforme/' + sections[0].dataset.view : '#/'); return; }
      frame(manifest, { print: 'uniforme', crumb: plain(T('menu-uniforme', 'Uniforme de karaté (Dogi)')),
        active: href('#/uniforme/' + viewId, anchor), title: tabTitle(section.dataset.title) });
      show(section.cloneNode(true), anchor);
    });
  }

  function renderAbout(manifest, anchor) {
    return Promise.all([fetchFragment(ABOUT), fetchFragment(CHANGELOG).catch(function () { return null; })]).then(function (res) {
      var section = aboutView(res[0]);
      var slot = section.querySelector('[data-changelog]');
      if (slot && res[1]) slot.replaceWith(res[1].cloneNode(true));
      frame(manifest, { crumb: plain(T('menu-a-propos', 'À propos')), active: href('#/a-propos', anchor), title: tabTitle(plain(T('menu-a-propos', 'À propos'))) });
      show(section, anchor);
    });
  }

  // Kata cards by family (the « Katas » list, #/kata)
  function beltHtml(k) {
    // "marron:2" = brown belt with 2 stripes (kyu); "noire:1" = black belt with 1 bar (dan)
    var chips = (k.beltColors || []).map(function (c) {
      var parts = c.split(':');
      return '<i class="belt belt-' + parts[0] + '" aria-hidden="true">' + new Array((parseInt(parts[1], 10) || 0) + 1).join('<b></b>') + '</i>';
    }).join('');
    var name = L(k.belt);
    return '<span class="belt-bar">' + chips + '</span><span class="belt-label">' + T('carte-ceinture', 'Ceinture') + ' ' + escapeHtml(name.charAt(0).toLowerCase() + name.slice(1)) + '</span>';
  }
  function cardMeta(k) {
    if (!isAvailable(k)) return T('carte-en-preparation', 'En préparation');
    return (isDraft(k) ? '<b class="draft-badge">' + T('carte-brouillon', 'Brouillon') + '</b> ' : '') + (k.moves ? k.moves + ' ' + T('carte-mouvements', 'mouvements') : '');
  }
  function kataCard(k) {
    var inner =
      '<span class="kata-card-jp" lang="ja">' + escapeHtml(k.kanji) + '</span>' +
      '<span class="kata-card-name">' + escapeHtml(L(k.name)) + '</span>' +
      '<span class="kata-card-meaning">' + escapeHtml(L(k.meaning)) + '</span>' +
      '<span class="kata-card-belt">' + beltHtml(k) + '</span>' +
      '<span class="kata-card-meta">' + cardMeta(k) + '</span>';
    return isAvailable(k)
      ? '<li><a class="kata-card" href="#/' + k.id + '">' + inner + '</a></li>'
      : '<li><div class="kata-card is-soon" aria-disabled="true">' + inner + '</div></li>';
  }
  function kataGroup(manifest, g) {
    var list = manifest.katas.filter(function (k) { return k.group === g.id; });
    return '<section class="kata-group" aria-labelledby="g-' + g.id + '">' +
      '<h3 id="g-' + g.id + '">' + escapeHtml(L(g.name)) + ' <span class="jp" lang="ja">' + escapeHtml(g.kanji) + '</span>' +
      '<span class="count">' + list.length + ' ' + T('groupe-kata', 'katas') + '</span></h3>' +
      '<p class="group-desc">' + escapeHtml(L(g.description)) + '</p>' +
      '<ul class="kata-list">' + list.map(kataCard).join('') + '</ul></section>';
  }
  function readyCountHtml(manifest) {
    var ready = manifest.katas.filter(function (k) { return k.file && !isDraft(k); }).length;
    return ready + ' ' + (ready > 1 ? T('carte-disponibles', 'disponibles') : T('carte-disponible', 'disponible'));
  }
  // Fills [data-kata-groups] with the cards and [data-ready-count] with how many katas are published
  function fillKataList(manifest, section) {
    var slot = section.querySelector('[data-kata-groups]');
    if (slot) slot.outerHTML = manifest.groups.map(function (g) { return kataGroup(manifest, g); }).join('');
    var count = section.querySelector('[data-ready-count]');
    if (count) count.innerHTML = readyCountHtml(manifest);
  }

  // A shared section folded under its own title (its h2 becomes the summary)
  function foldOf(src, open) {
    var fold = document.createElement('details');
    fold.className = 'fold';
    fold.id = src.dataset.view;
    fold.open = open;
    var title = src.querySelector('h2');
    fold.innerHTML = '<summary>' + (title ? title.innerHTML : escapeHtml(src.dataset.title)) + '</summary>';
    if (title) title.remove();
    moveChildren(src, fold);
    return fold;
  }
  // #/kata: the kata cards, under the foldable sections (#/kata/<fold>[/anchor] opens one)
  var KATA_FOLDS = ['definition'];
  function renderKataList(manifest, sections, openFold, anchor) {
    var list = sections.filter(function (s) { return s.dataset.view === 'liste'; })[0];
    if (!list) { location.replace('#/'); return; }
    list = list.cloneNode(true);
    fillKataList(manifest, list);
    var after = list.querySelector('h2');
    sections.filter(function (s) { return KATA_FOLDS.indexOf(s.dataset.view) >= 0; }).forEach(function (s) {
      var fold = foldOf(s.cloneNode(true), s.dataset.view === openFold);
      if (after) after.insertAdjacentElement('afterend', fold); else list.prepend(fold);
      after = fold;
    });
    frame(manifest, { print: 'kata', crumb: list.dataset.title, ctx: { sharedView: 'liste' },
      active: openFold ? href('#/kata/' + openFold, anchor) : anchor ? href('#/kata/liste', anchor) : '#/kata',
      title: tabTitle(list.dataset.title) });
    show(viewWrap(null, '', list), anchor || openFold);
  }
  function renderSharedPage(manifest, sections, viewId, anchor) {
    var section = sections.filter(function (s) { return s.dataset.view === viewId; })[0];
    if (!section) { location.replace('#/'); return; }
    frame(manifest, { print: 'kata', crumb: section.dataset.title, ctx: { sharedView: viewId }, active: href('#/kata/' + viewId, anchor), title: tabTitle(section.dataset.title) });
    show(viewWrap('#/kata', T('menu-kata', 'Katas'), section.cloneNode(true)), anchor);
  }
  // The old #/kata/esprit[/annonce] is now a part of « Qu’est-ce qu’un kata ? »
  function sharedAlias(viewId, anchor) {
    return viewId === 'esprit' ? { view: 'definition', anchor: anchor === 'annonce' ? anchor : 'esprit' } : { view: viewId || 'liste', anchor: anchor };
  }
  function renderShared(manifest, viewId, anchor) {
    return fetchFragment(SHARED).then(function (frag) {
      var r = sharedAlias(viewId, anchor), sections = sharedViews(frag);
      if (r.view === 'liste') return renderKataList(manifest, sections, null, r.anchor);
      if (KATA_FOLDS.indexOf(r.view) >= 0) return renderKataList(manifest, sections, r.view, r.anchor);
      renderSharedPage(manifest, sections, r.view, r.anchor);
    });
  }

  function draftBanner() {
    return '<p class="draft-banner">' + (LOCAL
      ? T('brouillon-bandeau', 'Brouillon&nbsp;: ce kata n’est visible qu’en local. Mettez «&nbsp;statut&nbsp;» à «&nbsp;publie&nbsp;» dans katas/katas.json pour le publier.')
      : T('brouillon-apercu', 'Aperçu&nbsp;: ce kata n’est pas encore publié. Le contenu peut encore changer.')) + '</p>';
  }
  function pagerLink(base, section, cls, labelKey, fallback) {
    if (!section) return '<span></span>';
    return '<a class="' + cls + '" href="' + base + '/' + section.dataset.view + '"><span>' + T(labelKey, fallback) + '</span>' + escapeHtml(section.dataset.title) + '</a>';
  }
  function pagerHtml(base, prev, next) {
    return '<nav class="pager" aria-label="' + escapeHtml(plain(T('page-navigation', 'Section précédente et suivante'))) + '">' +
      pagerLink(base, prev, 'pager-prev', 'page-precedente', 'Précédent') + pagerLink(base, next, 'pager-next', 'page-suivante', 'Suivant') + '</nav>';
  }
  function renderKata(manifest, kata, viewId, anchor) {
    return fetchFragment(localized(kata.file)).then(function (frag) {
      var base = '#/' + kata.id, sections = kataViews(kata, frag);
      var current = sections.filter(function (s) { return s.dataset.view === viewId; })[0] || sections[0];
      var idx = sections.indexOf(current);
      frame(manifest, { print: kata.id, crumb: L(kata.name), active: href(base + '/' + current.dataset.view, anchor),
        title: tabTitle(current.dataset.title, L(kata.name)) });
      var up = current.dataset.view === 'presentation' ? null : base + '/presentation';
      var wrap = viewWrap(up, escapeHtml(L(kata.name)), current.cloneNode(true));
      if (isDraft(kata)) wrap.insertAdjacentHTML('afterbegin', draftBanner());
      wrap.insertAdjacentHTML('beforeend', pagerHtml(base, sections[idx - 1], sections[idx + 1]));
      show(wrap, anchor);
    });
  }

  // ---------- Web app: footer date ----------
  var labelsReady = loadTexts(LABELS);
  // When the site was last published, in Montreal time ("17 h 05 @ 7 octobre 2026").
  // GitHub Pages sends the deploy time as Last-Modified on every file, so ask our own site.
  function lastUpdateHtml(d) {
    var tz = { timeZone: 'America/Montreal' };
    var locale = plain(T('locale', 'fr-CA'));
    var time = d.toLocaleTimeString(locale, Object.assign({ hour: 'numeric', minute: '2-digit' }, tz));
    var date = d.toLocaleDateString(locale, Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, tz));
    return T('pied-mise-a-jour', 'Dernière mise à jour&nbsp;:') + ' <time datetime="' + escapeHtml(d.toISOString()) + '">' + escapeHtml(time) + ' @ ' + escapeHtml(date) + '</time>';
  }
  function showLastUpdate(when) {
    var el = document.getElementById('site-updated');
    var d = new Date(when);
    if (!el || isNaN(d)) return;
    labelsReady.then(function () {
      el.innerHTML = lastUpdateHtml(d);
      el.hidden = false;
    });
  }
  fetch(MANIFEST, { method: 'HEAD', cache: 'no-cache' })
    .then(function (r) { var lm = r.headers.get('Last-Modified'); if (lm) showLastUpdate(lm); })
    .catch(function () {});  // no date shown if the header is missing

  // ---------- Web app: routing ----------
  // Links into the old home page (its kata list and « Qu’est-ce qu’un kata ? ») now live in the Katas section
  function oldHomeLink(anchor) {
    if (anchor === 'about') return '#/kata/definition';
    if (/^g-/.test(anchor)) return '#/kata/liste/' + anchor;
    return '#/kata';
  }
  // What a route needs: the file to load first, then how to show it (or where to send the reader instead)
  function resolveRoute(manifest, r) {
    if (r.page === 'accueil' && r.view) return { redirect: oldHomeLink(r.view) };
    if (!r.page || r.page === 'accueil') return { file: HOME, show: function () { return renderHome(manifest); } };
    if (PAGES[r.page]) return { file: PAGES[r.page].url, show: function () { return renderPage(manifest, r.page, r.view); } };
    if (r.page === 'uniforme') return { file: UNIFORM, show: function () { return renderUniform(manifest, r.view, r.anchor); } };
    if (r.page === 'a-propos') return { file: ABOUT, show: function () { return renderAbout(manifest, r.view); } };
    if (r.page === 'kata') return { file: SHARED, show: function () { return renderShared(manifest, r.view, r.anchor); } };
    var kata = findKata(manifest, r.page);
    if (kata) return { file: localized(kata.file), show: function () { return renderKata(manifest, kata, r.view, r.anchor); } };
    return { redirect: '#/' };
  }
  function showLoadError(err) {
    view.innerHTML = '<p class="error">' + T('erreur-chargement', 'Impossible de charger le contenu. Rechargez la page.') +
      ' <small>(' + escapeHtml(err.message) + ')</small></p>';
  }
  var routeToken = 0;
  function route() {
    updateLangLink();
    var r = parseRoute(), token = ++routeToken;
    Promise.all([getManifest(), labelsReady]).then(function (res) {
      var manifest = res[0], target = resolveRoute(manifest, r);
      return (target.file ? fetchText(target.file) : Promise.resolve()).then(function () { return { manifest: manifest, target: target }; });
    }).then(function (x) {
      if (token !== routeToken) return;  // the user already navigated somewhere else
      setTimeout(function () { prefetchMenu(x.manifest); }, 0);
      if (x.target.redirect) { location.replace(x.target.redirect); return; }
      return x.target.show();
    }).catch(function (err) {
      if (token === routeToken) showLoadError(err);
    });
  }

  window.addEventListener('hashchange', route);
  narrow.addEventListener('change', syncMenuToWidth);
  syncMenuToWidth();
  route();
})();
