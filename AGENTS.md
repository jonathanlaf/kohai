# AGENTS.md — Kohai

Context and rules for AI coding agents working on this repository.

## Hard rule: nothing private in agent files

This file (and `CLAUDE.md`) is committed and public. Never write in it:
personal information (names of people, emails, phone numbers, addresses, club members, instructors),
credentials, tokens, keys, internal URLs, local machine paths, or anything learned from private conversations.
Describe rules and conventions only. Personal content that the site itself publishes belongs in the site's
HTML files, not here.

## What the project is

A static, French-language study site for karate kata (Shotokan), served by GitHub Pages from `main`
(custom domain in `CNAME`). No build step, no framework, no npm: plain HTML, CSS and one JavaScript file.
Pages are loaded with `fetch`, so test through a local server (`python3 -m http.server 8765`), not `file://`.

## Layout

- `index.html` — app shell: top bar, menu, `<main id="view">`, footer.
- `assets/app.js` — hash router (`#/`, `#/<kata-id>/<section>`, `#/kata/esprit|erreurs`, `#/lexique`, `#/a-propos`),
  menu, theme, print mode (Paged.js). Logic only: user-facing text lives in the HTML files below.
- `assets/style.css` (screen, light/dark tokens), `assets/print.css` (print), `assets/paged.css` (Paged.js only).
- `assets/vendor/paged.js` — vendored Paged.js 0.4.3 (MIT). Do not edit.
- `katas/katas.json` — the 26 kata: family, name, kanji, meaning, belt, and for written ones `file`, `moves`, `kiai`, `statut`.
- `katas/<id>.html` — one kata; each `<section data-view data-title>` is one screen; printing joins them.
- `shared/accueil.html` home, `shared/kata.html` (L'esprit du kata, Erreurs fréquentes), `shared/lexique.html`,
  `shared/about.html` (À propos + credits), `shared/changelog.html` (journal des modifications),
  `shared/libelles.html` (menu and interface labels), `shared/impression.html` (print-only texts).
- `img/<kata-id>/` — images of each kata.
- `.githooks/pre-commit` — refuses content commits without a changelog entry.

## Editable texts

All visible text must be editable in HTML, not in `app.js`. Short labels go in `shared/libelles.html` or
`shared/impression.html` as `<span data-text="key">…</span>`, read in JS with `T('key', 'fallback')`.
Keep the fallback identical to the file's text.

## Changelog (required)

Every commit that changes site content (`katas/`, `img/`, `shared/`) adds one `<li>` at the top of
`shared/changelog.html`: `<time datetime="YYYY-MM-DD">jour mois année</time>` then one short French sentence
describing what a reader will notice. Code-only or style-only commits do not need an entry.
The hook enforces this once enabled with `git config core.hooksPath .githooks` (per clone).

## Draft kata (brouillon)

In `katas/katas.json`, `"statut": "brouillon"` keeps a kata visible only on localhost (card badge + banner);
`"statut": "publie"` (or no `statut`) publishes it. A draft's files are still public in the repo and on the site
if someone knows the URL: drafts are hidden, not secret.

## Writing conventions

- Content in French (Québec). Typography: non-breaking space before `: ; ! ?` and inside « » (`&nbsp;`).
  The noun is « mise à jour » (no hyphens).
- Japanese terms stay in rōmaji, followed by kanji when known: `<span class="jp" lang="ja">前屈立ち</span>`
  (red, Japanese font). Pronunciation in the vocabulary is written « à la française ».
- Belts in `katas.json`: `beltColors` like `"marron:2"` (brown, 2 stripes = kyu) or `"noire:1"` (black, 1 bar = dan).

## Embusen diagrams (SVG in the kata file)

- Each bubble is the body position (centre of the stance) after a move. Same spot = shared bubble (`3 · 4`);
  passing back over a spot in the other direction = two side-by-side lanes.
- Circles = Zenkutsu Dachi, squares = Kokutsu Dachi, red = Kiai, red dotted line = Yame back to the start.
- Turns are drawn as curves; a U-turn on the same line as a rounded loop. Arrowheads need a straight run
  of about 14 px before the target, or they look broken.
- A wide figure (Heian Shodan: main diagram + overview + start detail side by side) also needs a stacked mobile version; a narrow single diagram does not.
- Pills hold several moves at the same spot; a single move is a circle (Zenkutsu Dachi) or a square (Kokutsu Dachi).

## Print

`?print=letter|a4&kata=<id>` lays out one kata with Paged.js: cover + numbered table of contents, L'esprit du kata,
the kata, Erreurs fréquentes, credits and the disclaimer paragraphs from the About page. The vocabulary prints
alone from `#/lexique`. `class="pb"` on an `h2` starts a new page. After layout changes, check that the embusen
section still fits on one page in Letter and A4 (`&noprint=1` previews without the dialog).

## Before committing

Check that the site loads, the menu works, and both print sizes still lay out correctly.
Write commit messages in English, conventional style (`feat:`, `fix:`, `docs:`…).
