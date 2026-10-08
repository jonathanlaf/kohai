# Kohai

Kata study sheets for the Club de Karaté Traditionnel Chaleurs, served at https://kohai.jonathanlafleur.ca (GitHub Pages, no build step).

## Layout

- `index.html` — app shell (top bar, section nav, view).
- `assets/app.js` — hash router (`#/`, `#/<kata>/<section>`, `#/lexique`) and the print mode.
- `assets/style.css` — screen styles, light/dark themes.
- `assets/print.css` — print rules, used by the browser's print and by Paged.js.
- `assets/paged.css` — Paged.js only: page margins, page numbers, TOC page numbers.
- `assets/vendor/paged.js` — Paged.js 0.4.3 (MIT).
- `katas/katas.json` — list of kata shown on the home page.
- `katas/<id>.html` — one file per kata; each `<section data-view="…" data-title="…">` is one screen.
- `shared/accueil.html` — home page text (`#/`). The kata cards are generated from `katas/katas.json` into `[data-kata-groups]`.
- `shared/libelles.html` — menu entries and short interface labels (kata cards, Précédent / Suivant).
- `shared/impression.html` — texts used only in print (table of contents title, credits and notice titles, last-page line, vocabulary cover).
- `shared/lexique.html` — shared vocabulary, shown and printed from `#/lexique`.
- `shared/kata.html` — texts common to every kata (« L'esprit du kata », « Erreurs fréquentes »), shown under « Kata » and inserted into every printed kata. `data-kata-name` and `data-kata-kiai` placeholders become the kata's name and Kiai moves (`kiai` in `katas.json`) when printed.
- `shared/about.html` — « À propos » page (`#/a-propos`): who writes the site, and all sources and credits. Each `[data-credits="<kata id>"]` block and the page's introduction (as a disclaimer) are appended to the end of every printed kata.
- `img/<id>/` — images for each kata.

## Add a kata

1. Copy `katas/heian-shodan.html` to `katas/<id>.html` and replace the content. Keep the section structure:
   - the first section holds `<header class="cover">` (title, subtitle, intro) — the print cover and TOC go there;
   - `h2`/`h3` with an `id` appear in the printed table of contents (`data-toc` sets a shorter label);
   - `class="pb"` on an `h2` starts that part on a new printed page;
   - when printed, « L'esprit du kata » goes right after the cover, and the common mistakes, then the credits and disclaimer are added at the end. The vocabulary is printed separately from the « Lexique » page.
   - add the kata's sources as a `<div class="credits" data-credits="<id>">` block in `shared/about.html`.
2. Put its images in `img/<id>/`.
3. Add an entry to `katas/katas.json`.

## Draft kata

`"statut": "brouillon"` in `katas/katas.json` shows the kata only on localhost (badge on the card, banner on its pages).
Switch it to `"publie"` to publish. Drafts are hidden, not secret: their files are still in the public repo.

## Changelog

Each commit that changes content adds a line at the top of `shared/changelog.html`, shown in « À propos ».
A pre-commit hook enforces it; enable it once per clone with `git config core.hooksPath .githooks`.

## Print

The **Imprimer** button (and Cmd/Ctrl+P) opens `?print=letter|a4&kata=<id>`, which lays the kata out with Paged.js
(cover with numbered table of contents, page numbers, repeated table headers) and then opens the print dialog.
`?print=letter` without `kata` prints the vocabulary alone. Add `&noprint=1` to preview without the dialog.

## Local preview

```sh
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765 (the pages are loaded with `fetch`, so opening `index.html` as a file does not work).
