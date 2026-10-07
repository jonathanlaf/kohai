(function () {
  'use strict';

  var MANIFEST = 'katas/katas.json';
  var LEXIQUE = 'shared/lexique.html';
  var SHARED = 'shared/kata.html';
  var ABOUT = 'shared/about.html';
  var params = new URLSearchParams(location.search);
  var root = document.documentElement;

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
  function fetchFragment(url) {
    return fetchText(url).then(function (html) {
      var t = document.createElement('template');
      t.innerHTML = html;
      return t.content;
    });
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
  function findKata(manifest, id) {
    return manifest.katas.filter(function (k) { return k.id === id && k.file; })[0];
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ---------- Print (Paged.js) ----------
  var printSize = params.get('print');
  if (printSize === 'letter' || printSize === 'a4') {
    startPagedPrint(printSize, params.get('kata'), params.get('noprint') === '1');
    return;
  }

  // Builds the full printable document for one kata (or the vocabulary alone).
  function buildPrintDocument(kataId) {
    return getManifest().then(function (manifest) {
      var kata = kataId && findKata(manifest, kataId);
      if (kataId && !kata) throw new Error('kata introuvable (' + kataId + ')');
      var doc = document.createElement('div');
      if (!kata) return fetchFragment(LEXIQUE).then(function (lexique) {
        doc.innerHTML = '<header class="cover"><h1>Lexique du karatéka</h1><p class="sub">Kohai · Club de Karaté Traditionnel Chaleurs</p></header>';
        var lex = lexique.querySelector('section').cloneNode(true);
        var h2 = lex.querySelector('h2');
        if (h2) h2.remove();
        var first = lex.querySelector('p');
        if (first) first.classList.add('pb');
        Array.prototype.forEach.call(lex.childNodes, function (n) { doc.appendChild(n.cloneNode(true)); });
        return appendCredits(doc, null).then(function () { return { doc: doc, title: 'Lexique du karatéka' }; });
      });
      return Promise.all([fetchFragment(kata.file), fetchFragment(SHARED)]).then(function (res2) {
        var frag = res2[0], shared = res2[1];
        var sections = Array.prototype.slice.call(frag.querySelectorAll('section[data-view]'));
        // Unwrap the screen sections so print flows exactly like one long page:
        // cover, spirit of kata, kata content, common mistakes, credits (the vocabulary prints on its own page)
        function append(section) {
          Array.prototype.forEach.call(section.cloneNode(true).childNodes, function (n) { doc.appendChild(n.cloneNode(true)); });
        }
        sections.forEach(function (s) {
          append(s);
          var cover = s.dataset.view === 'presentation' && doc.querySelector('header.cover');
          var esprit = shared.querySelector('[data-view="esprit"]');
          if (cover && esprit) {
            var after = cover;
            Array.prototype.slice.call(esprit.cloneNode(true).childNodes).forEach(function (n) { after.after(n); after = n; });
          }
        });
        var erreurs = shared.querySelector('[data-view="erreurs"]');
        if (erreurs) append(erreurs);
        return appendCredits(doc, kata.id).then(function () {
          fillKataDetails(doc, kata);
          return { doc: doc, title: kata.name };
        });
      });
    });
  }

  // Every printed document ends with its credits and the disclaimer from the About page.
  function appendCredits(doc, kataId) {
    return fetchFragment(ABOUT).then(function (about) {
      var wrap = document.createElement('div');
      wrap.innerHTML = '<h2 id="credits" class="pb" data-toc="Sources et crédits">Sources et crédits</h2>';
      var intro = about.querySelector('#credits + p');
      if (intro) wrap.appendChild(intro.cloneNode(true));
      var block = kataId && about.querySelector('[data-credits="' + kataId + '"]');
      if (block) wrap.appendChild(block.cloneNode(true));
      var notice = about.querySelector('#avertissement');
      if (notice) wrap.appendChild(notice.cloneNode(true));
      wrap.insertAdjacentHTML('beforeend', '<p class="source">Une erreur&nbsp;? Écrivez à me@jonathanlafleur.ca. Version à jour&nbsp;: kohai.jonathanlafleur.ca</p>');
      Array.prototype.slice.call(wrap.childNodes).forEach(function (n) { doc.appendChild(n); });
    });
  }

  // Shared texts carry placeholders that become the kata's own name and Kiai moves when printed.
  function fillKataDetails(root, kata) {
    root.querySelectorAll('[data-kata-name]').forEach(function (el) { el.textContent = kata.name; });
    if (kata.kiai && kata.kiai.length) {
      var nums = ['', 'Le Kiai', 'Les deux Kiai', 'Les trois Kiai', 'Les quatre Kiai'];
      var moves = kata.kiai.length > 1 ? kata.kiai.slice(0, -1).join(', ') + ' et ' + kata.kiai[kata.kiai.length - 1] : String(kata.kiai[0]);
      var text = (nums[kata.kiai.length] || 'Les Kiai') + ' (mouvement' + (kata.kiai.length > 1 ? 's ' : ' ') + moves + ')';
      root.querySelectorAll('[data-kata-kiai]').forEach(function (el) { el.textContent = text; });
    }
  }

  function buildPrintToc(doc) {
    var items = doc.querySelectorAll('h2[id], h3[id], [data-toc][id]');
    var html = '<nav class="toc-print"><h2>Table des matières</h2><ol class="toc-p">';
    var open = false, started = false, seen = {}, nested = !!doc.querySelector('h2[id]');
    Array.prototype.forEach.call(items, function (el) {
      if (seen[el.id]) return;
      seen[el.id] = true;
      var jp = el.querySelector('.jp');
      var label = el.getAttribute('data-toc')
        ? el.getAttribute('data-toc') + (jp ? ' ' + jp.outerHTML : '')
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

  function startPagedPrint(size, kataId, noPrint) {
    root.setAttribute('data-theme', 'light');
    document.addEventListener('DOMContentLoaded', function () {
      document.body.innerHTML = '<div class="paged-status">Préparation de l’impression…</div>';
      var status = document.body.firstChild;
      buildPrintDocument(kataId).then(function (built) {
        document.title = built.title + ' · Kohai (impression)';
        var doc = built.doc;
        var cover = doc.querySelector('header.cover');
        if (cover) cover.insertAdjacentHTML('afterend', buildPrintToc(doc));
        doc.querySelectorAll('.screen-only').forEach(function (el) { el.remove(); });
        doc.querySelectorAll('img[loading]').forEach(function (img) { img.removeAttribute('loading'); });

        var heads = {}, n = 0;
        doc.querySelectorAll('table').forEach(function (t) {
          t.setAttribute('data-tid', 't' + (++n));
          var th = t.querySelector('thead');
          if (th) heads['t' + n] = th.outerHTML;
        });

        var script = document.createElement('script');
        script.src = 'assets/vendor/paged.js';
        script.onerror = function () { status.textContent = 'Impossible de charger le module d’impression.'; };
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
            .preview(content.content, ['assets/style.css', 'assets/print.css', 'assets/paged.css', sizeUrl], document.body)
            .then(function (flow) {
              URL.revokeObjectURL(sizeUrl);
              status.remove();
              root.setAttribute('data-paged-done', String(flow.total));
              if (!noPrint) setTimeout(function () { window.print(); }, 300);
            })
            .catch(function (err) { status.textContent = 'Impossible de préparer l’impression : ' + err.message; });
        };
        document.head.appendChild(script);
      }).catch(function (err) {
        status.textContent = 'Impossible de préparer l’impression : ' + err.message;
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

  // Print link
  var savedPaper = load('kohai-paper');
  if (savedPaper === 'letter' || savedPaper === 'a4') paper.value = savedPaper;
  function updatePrint() {
    printTools.hidden = !printTarget;
    if (printTarget) printLink.href = '?print=' + paper.value + (printTarget === 'lexique' ? '' : '&kata=' + encodeURIComponent(printTarget));
  }
  paper.addEventListener('change', function () { store('kohai-paper', paper.value); updatePrint(); });
  document.addEventListener('keydown', function (e) {
    if (printTarget && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      window.open(printLink.href, '_blank', 'noopener');
    }
  });

  // Routes: #/  ·  #/lexique[/anchor]  ·  #/<kata>[/<view>[/<anchor>]]
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
      { href: '#/', label: 'Accueil', children: [
        { href: '#/accueil/about', label: 'Qu’est-ce qu’un kata ?' }
      ] },
      { href: '#/accueil/kata-title', label: 'Kata', open: true, children: [
        { href: '#/kata/esprit', label: 'L\u2019esprit du kata', children: ctx.sharedView === 'esprit' ? ctx.sharedItems : null },
        { href: '#/kata/erreurs', label: 'Erreurs fréquentes', children: ctx.sharedView === 'erreurs' ? ctx.sharedItems : null }
      ].concat(manifest.groups.map(function (g) {
        var ready = manifest.katas.filter(function (k) { return k.group === g.id && k.file; });
        return { href: '#/accueil/g-' + g.id, label: escapeHtml(g.name), open: ctx.home && ready.length > 0,
          children: ready.map(function (k) {
            return { href: '#/' + k.id, label: escapeHtml(k.name), children: k.id === ctx.kataId ? ctx.kataItems : null };
          }) };
      })) },
      { href: '#/lexique', label: 'Lexique du karatéka', children: ctx.lexItems || null },
      { href: '#/a-propos', label: 'À propos', children: ctx.aboutItems || null }
    ];
  }
  function setNav(tree, activeHref) {
    tocWeb.hidden = false;
    tocTitle.textContent = 'Menu';
    function list(items) {
      return items.map(function (it) {
        var kids = it.children && it.children.length;
        var isActive = it.href === activeHref;
        var open = toggled.hasOwnProperty(it.href) ? toggled[it.href] : (it.open || contains(it, activeHref));
        var link = '<a href="' + it.href + '"' + (isActive ? ' class="active" aria-current="page"' : '') + '>' + it.label + '</a>';
        if (!kids) return '<li><div class="row"><span class="tw-space"></span>' + link + '</div></li>';
        return '<li class="node' + (open ? ' open' : '') + '"><div class="row">' +
          '<button type="button" class="tw" data-key="' + it.href + '" aria-expanded="' + open + '" aria-label="' + (open ? 'Replier' : 'Déplier') + '"></button>' +
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
    btn.setAttribute('aria-label', open ? 'Replier' : 'Déplier');
    toggled[btn.dataset.key] = open;
  });

  function setCrumb(text) {
    crumb.hidden = !text;
    crumb.textContent = text || '';
  }

  var siteFoot = document.querySelector('.site-foot');
  function show(nodes, anchorId) {
    view.innerHTML = '';
    view.appendChild(nodes);
    if (siteFoot) view.appendChild(siteFoot);
    var target = anchorId && document.getElementById(anchorId);
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }

  function renderHome(manifest, anchor) {
    printTarget = null; updatePrint();
    setCrumb('');
    setNav(buildMenu(manifest, { home: true }), anchor ? '#/accueil/' + anchor : '#/');
    document.title = 'Kohai · Fiches d’étude des kata';
    function belt(k) {
      // "marron:2" = brown belt with 2 stripes (kyu); "noire:1" = black belt with 1 bar (dan)
      var chips = (k.beltColors || []).map(function (c) {
        var parts = c.split(':'), marks = '';
        for (var i = 0; i < (parseInt(parts[1], 10) || 0); i++) marks += '<b></b>';
        return '<i class="belt belt-' + parts[0] + '" aria-hidden="true">' + marks + '</i>';
      }).join('');
      return '<span class="belt-bar">' + chips + '</span><span class="belt-label">Ceinture ' + escapeHtml(k.belt.charAt(0).toLowerCase() + k.belt.slice(1)) + '</span>';
    }
    function card(k) {
      var inner =
        '<span class="kata-card-jp" lang="ja">' + escapeHtml(k.kanji) + '</span>' +
        '<span class="kata-card-name">' + escapeHtml(k.name) + '</span>' +
        '<span class="kata-card-meaning">' + escapeHtml(k.meaning) + '</span>' +
        '<span class="kata-card-belt">' + belt(k) + '</span>' +
        '<span class="kata-card-meta">' + (k.file ? k.moves + ' mouvements' : 'En préparation') + '</span>';
      return k.file
        ? '<li><a class="kata-card" href="#/' + k.id + '">' + inner + '</a></li>'
        : '<li><div class="kata-card is-soon" aria-disabled="true">' + inner + '</div></li>';
    }
    var groups = manifest.groups.map(function (g) {
      var list = manifest.katas.filter(function (k) { return k.group === g.id; });
      return '<section class="kata-group" aria-labelledby="g-' + g.id + '">' +
        '<h3 id="g-' + g.id + '">' + escapeHtml(g.name) + ' <span class="jp" lang="ja">' + escapeHtml(g.kanji) + '</span>' +
        '<span class="count">' + list.length + ' kata</span></h3>' +
        '<p class="group-desc">' + escapeHtml(g.description) + '</p>' +
        '<ul class="kata-list">' + list.map(card).join('') + '</ul></section>';
    }).join('');
    var ready = manifest.katas.filter(function (k) { return k.file; }).length;
    var wrap = document.createElement('div');
    wrap.className = 'home';
    wrap.innerHTML =
      '<header class="home-head">' +
        '<h1>Kohai <span class="jp" lang="ja">後輩</span></h1>' +
        '<p class="lead">Fiches d’étude des kata pour les élèves du Club de Karaté Traditionnel Chaleurs.</p>' +
        '<p>Au dojo, le <em>kohai</em> est l’élève qui apprend auprès de ses aînés, les <em>senpai</em>. Ces fiches l’accompagnent entre deux cours : pour chaque kata, son esprit, son embusen, chaque mouvement illustré et expliqué, une vidéo, les erreurs fréquentes et le vocabulaire japonais. Chaque fiche s’imprime avec sa table des matières. Elles complètent l’enseignement du sensei sans le remplacer. <a href="#/a-propos">Qui suis-je et pourquoi ce site\u00a0?</a></p>' +
      '</header>' +
      '<section class="about-kata" aria-labelledby="about">' +
        '<h2 id="about">Qu’est-ce qu’un kata <span class="jp" lang="ja">型</span> ?</h2>' +
        '<p>Un kata (<span lang="ja">型</span>, « forme ») est un enchaînement codifié de techniques, exécuté seul face à des adversaires imaginaires. C’est la mémoire du karaté : chaque kata transmet des techniques, des postures, des déplacements et des principes de combat d’une génération de pratiquants à la suivante.</p>' +
        '<p>Chaque kata suit un tracé précis au sol, l’<em>embusen</em>, commence et se termine au même endroit, et s’ouvre et se ferme par un salut. On l’évalue sur la justesse des postures, la puissance des techniques (<em>kime</em>), l’intensité (<em>kihaku</em>) et la vigilance qui demeure jusqu’au dernier mouvement (<em>zanshin</em>).</p>' +
        '<p>Le Shotokan compte 26 kata, regroupés en quatre familles. On les apprend dans l’ordre, au rythme des passages de grade.</p>' +
      '</section>' +
      '<section aria-labelledby="kata-title"><h2 id="kata-title">Kata <span class="jp" lang="ja">型</span> <span class="count">' + ready + ' disponible' + (ready > 1 ? 's' : '') + '</span></h2>' + groups + '</section>' +
      '<section aria-labelledby="ref-title"><h2 id="ref-title">Référence <span class="jp" lang="ja">参考</span></h2><ul class="kata-list"><li><a class="kata-card" href="#/lexique">' +
      '<span class="kata-card-jp" lang="ja">用語</span><span class="kata-card-name">Lexique du karatéka</span>' +
      '<span class="kata-card-meaning">Les mots japonais pour comprendre les consignes du sensei, avec la prononciation.</span></a></li></ul></section>';
    show(wrap, anchor);
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
      setCrumb('Lexique');
      var section = frag.querySelector('section').cloneNode(true);
      setNav(buildMenu(manifest, { lexItems: childrenOf(section, '#/lexique') }), anchor ? '#/lexique/' + anchor : '#/lexique');
      document.title = 'Lexique du karatéka · Kohai';
      show(section, anchor);
    });
  }

  function renderAbout(manifest, anchor) {
    return fetchFragment(ABOUT).then(function (frag) {
      printTarget = null; updatePrint();
      setCrumb('À propos');
      var section = frag.querySelector('section').cloneNode(true);
      var items = Array.prototype.map.call(section.querySelectorAll('h2[id]'), function (h) {
        return { href: '#/a-propos/' + h.id, label: escapeHtml(h.textContent.trim()) };
      });
      setNav(buildMenu(manifest, { aboutItems: items }), anchor ? '#/a-propos/' + anchor : '#/a-propos');
      document.title = 'À propos · Kohai';
      show(section, anchor);
    });
  }

  function renderShared(manifest, viewId, anchor) {
    return fetchFragment(SHARED).then(function (frag) {
      var section = frag.querySelector('[data-view="' + viewId + '"]');
      if (!section) { location.hash = '#/'; return; }
      section = section.cloneNode(true);
      printTarget = null; updatePrint();
      setCrumb(section.dataset.title);
      var base = '#/kata/' + viewId;
      setNav(buildMenu(manifest, { sharedView: viewId, sharedItems: childrenOf(section, base).filter(function (c) { return c.href !== base + '/'; }) }),
        anchor ? base + '/' + anchor : base);
      document.title = section.dataset.title + ' · Kohai';
      var wrap = document.createElement('div');
      wrap.className = 'kata-view';
      wrap.insertAdjacentHTML('beforeend', '<p class="eyebrow"><a href="#/accueil/kata-title">Kata</a></p>');
      wrap.appendChild(section);
      show(wrap, anchor);
    });
  }

  function renderKata(manifest, kata, viewId, anchor) {
    return fetchFragment(kata.file).then(function (frag) {
      var sections = Array.prototype.slice.call(frag.querySelectorAll('section[data-view]'));

      var base = '#/' + kata.id;
      var current = sections.filter(function (s) { return s.dataset.view === viewId; })[0] || sections[0];
      var items = sections.map(function (s) {
        return { href: base + '/' + s.dataset.view, label: escapeHtml(s.dataset.title),
          children: s === current ? childrenOf(s, base + '/' + s.dataset.view) : null };
      });
      printTarget = kata.id; updatePrint();
      setCrumb(kata.name);
      setNav(buildMenu(manifest, { kataId: kata.id, kataItems: items }), base + '/' + current.dataset.view + (anchor ? '/' + anchor : ''));
      document.title = current.dataset.title + ' · ' + kata.name + ' · Kohai';

      var idx = sections.indexOf(current);
      var wrap = document.createElement('div');
      wrap.className = 'kata-view';
      if (current.dataset.view !== 'presentation') {
        wrap.insertAdjacentHTML('beforeend', '<p class="eyebrow"><a href="' + base + '/presentation">' + escapeHtml(kata.name) + '</a></p>');
      }
      wrap.appendChild(current.cloneNode(true));
      var prev = sections[idx - 1], next = sections[idx + 1];
      wrap.insertAdjacentHTML('beforeend',
        '<nav class="pager" aria-label="Section précédente et suivante">' +
        (prev ? '<a class="pager-prev" href="' + base + '/' + prev.dataset.view + '"><span>Précédent</span>' + escapeHtml(prev.dataset.title) + '</a>' : '<span></span>') +
        (next ? '<a class="pager-next" href="' + base + '/' + next.dataset.view + '"><span>Suivant</span>' + escapeHtml(next.dataset.title) + '</a>' : '<span></span>') +
        '</nav>');
      show(wrap, anchor);
    });
  }

  var routeToken = 0;
  function route() {
    var r = parseRoute();
    var token = ++routeToken;
    getManifest().then(function (manifest) {
      var kata = findKata(manifest, r.page);
      var url = r.page === 'lexique' ? LEXIQUE : r.page === 'a-propos' ? ABOUT : r.page === 'kata' ? SHARED : kata ? kata.file : null;
      return (url ? fetchText(url) : Promise.resolve()).then(function () { return manifest; });
    }).then(function (manifest) {
      if (token !== routeToken) return;  // the user already navigated somewhere else
      if (!r.page || r.page === 'accueil') return renderHome(manifest, r.view);
      if (r.page === 'lexique') return renderLexique(manifest, r.view);
      if (r.page === 'a-propos') return renderAbout(manifest, r.view);
      if (r.page === 'kata') return renderShared(manifest, r.view || 'esprit', r.anchor);
      var kata = findKata(manifest, r.page);
      if (!kata) { location.hash = '#/'; return; }
      return renderKata(manifest, kata, r.view, r.anchor);
    }).catch(function (err) {
      if (token !== routeToken) return;
      view.innerHTML = '<p class="error">Impossible de charger le contenu (' + escapeHtml(err.message) + '). Rechargez la page.</p>';
    });
  }

  window.addEventListener('hashchange', route);
  narrow.addEventListener('change', syncMenuToWidth);
  syncMenuToWidth();
  route();
})();
