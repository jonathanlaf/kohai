# AGENTS.md — Kohai

Context and rules for AI coding agents working on this repository.

## Hard rule: nothing private in agent files

This file (and `CLAUDE.md`) is committed and public. Never write in it:
personal information (names of people, emails, phone numbers, addresses, club members, instructors),
credentials, tokens, keys, internal URLs, local machine paths, or anything learned from private conversations.
Describe rules and conventions only. Personal content that the site itself publishes belongs in the site's
HTML files, not here.

## What the project is

A static, bilingual study site for karate kata (Shotokan), French at `/` and English at `/en/`, served by GitHub Pages from `main`
(custom domain in `CNAME`). No build step, no framework, no npm: plain HTML, CSS and one JavaScript file.
Pages are loaded with `fetch`, so test through a local server (`python3 -m http.server 8765`), not `file://`.

## Layout

- `index.html` — French app shell: top bar, menu, `<main id="view">`, footer.
- `en/index.html` — English app shell (`lang="en" data-root="../"`), same `app.js`. A change to one shell is made in the other.
- `assets/app.js` — hash router (`#/`, `#/<kata-id>/<section>`, `#/kata/esprit|erreurs`, `#/lexique`, `#/a-propos`;
  identical in both languages), menu, theme, language link, print mode (Paged.js). Logic only: user-facing text lives in the HTML files below.
- `assets/style.css` (screen, light/dark tokens), `assets/print.css` (print), `assets/paged.css` (Paged.js only).
- `assets/vendor/paged.js` — vendored Paged.js 0.4.3 (MIT). Do not edit.
- `katas/katas.json` — the kata: family, name, kanji, meaning, belt, and for written ones `file`, `moves`, `kiai`, `statut`.
  Text fields (`name`, `meaning`, `belt`, group `name` and `description`) are `{"fr": …, "en": …}`.
- `katas/<id>.html` — one kata; each `<section data-view data-title>` is one screen; printing joins them.
- `shared/accueil.html` home, `shared/kata.html` (L'esprit du kata, Erreurs fréquentes), `shared/lexique.html`,
  `shared/about.html` (À propos + credits), `shared/changelog.html` (journal des modifications),
  `shared/libelles.html` (menu and interface labels), `shared/impression.html` (print-only texts).
- `img/<kata-id>/` — images of each kata.
- Every `.html` under `katas/` and `shared/` has an English twin next to it: `x.html` + `x.en.html`.
- `.githooks/pre-commit` runs `.githooks/check-i18n.py --staged` (see « Two languages »).
- `tests/` — `test_check_i18n.py` (`python3 -m unittest tests/test_check_i18n.py`) and `cdp.mjs`, a headless Chrome
  driver with no packages (Node 22+): `node tests/cdp.mjs <url> [js-expression …]`.

## Two languages (required)

Every page exists in French and in English; a content commit is refused unless both are in step.

- Each `.html` under `katas/` and `shared/` has an `.en.html` twin. The twin keeps the French ids: `data-view`,
  `h2`/`h3` ids, anchors, `data-credits`, `data-text` keys. Only visible text, `data-title` and `data-toc` change,
  so the language link lands on the same page and anchor.
- `katas.json` text fields are `{"fr", "en"}`, both non-empty.
- Both shells (`index.html`, `en/index.html`) change together.
- `.githooks/check-i18n.py` checks all of this (twins, label keys, `data-view` lists, `katas.json`, both changelogs).
  Run it by hand anytime from anywhere in the repo.
- The root shell sends the home page (`/`, `/#/`) to `/en/` when the reader's language is English: their saved choice,
  else their browser's. Deep links keep their language; print URLs and crawlers are never redirected.
  Preferences live in `localStorage` (`kohai-theme`, `kohai-paper`, `kohai-lang`); the site sets no cookies.

## Editable texts

All visible text must be editable in HTML, not in `app.js`. Short labels go in `shared/libelles.html` or
`shared/impression.html` (and their `.en.html` twins) as `<span data-text="key">…</span>`, read in JS with `T('key', 'fallback')`.
Keep the fallback identical to the French file's text.

## Changelog (required)

Every commit that changes site content (`katas/`, `img/`, `shared/`) adds one `<li>` at the top of both
`shared/changelog.html` (`<time datetime="YYYY-MM-DD">jour mois année</time>` then one short French sentence) and
`shared/changelog.en.html` (`<time datetime="YYYY-MM-DD">Month day, year</time>` then the same in English),
describing what a reader will notice. Code-only or style-only commits do not need an entry.
The hook enforces this once enabled with `git config core.hooksPath .githooks` (per clone);
`git commit --no-verify` skips it for a commit with no visible change.

## Draft kata (brouillon)

In `katas/katas.json`, `"statut": "brouillon"` keeps a kata visible only on localhost (card badge + banner);
`"statut": "publie"` (or no `statut`) publishes it. A draft's files are still public in the repo and on the site
if someone knows the URL: drafts are hidden, not secret.

## Writing conventions

- French content: Québec French. Typography: non-breaking space before `: ; ! ?` and inside « » (`&nbsp;`).
  The noun is « mise à jour » (no hyphens).
- English content: Canadian spelling (colour, centre); no space before `: ; ! ?`; quotes “ ”; belts like
  “White → yellow”. The vocabulary's pronunciation column is written for English speakers.
- Japanese terms stay in rōmaji, followed by kanji when known: `<span class="jp" lang="ja">前屈立ち</span>`
  (red, Japanese font). In the French vocabulary, pronunciation is written « à la française ».
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
section still fits on one page in Letter and A4, in both languages (`&noprint=1` previews without the dialog;
`/en/?print=…` prints in English).

## Before committing

Check that `/` and `/en/` load, the menu and language link work, and both print sizes still lay out correctly in
both languages. Run `python3 -m unittest tests/test_check_i18n.py` after touching the parity check.
Write commit messages in English, conventional style (`feat:`, `fix:`, `docs:`…).
