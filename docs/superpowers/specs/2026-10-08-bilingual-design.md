# Bilingual site (French + English) — design

Date: 2026-10-08
Status: draft, awaiting review

## Goal

Every page of Kohai exists in French and in English: interface, home, kata pages, L'esprit du kata,
Erreurs fréquentes, lexique, À propos (with changelog and a new privacy note), and print.
A reader switches language from the top bar and lands on the same page in the other language.
Both languages are required: a content change is not committed unless both versions are present.

## Decisions

| Topic | Decision |
|---|---|
| Scope | Everything, full parity. |
| Who translates | Claude drafts all English text; the site owner proofreads before publishing. |
| Missing translation | Not allowed: commit-time check enforces both languages. |
| URL | French at `/`, English at `/en/` (same hash routes: `/en/#/heian-shodan/embusen`). |
| Default language | Home page only (`/`, `/#/`): redirected to `/en/` when the reader's language is English (saved choice, else browser). Deep links keep their language. |
| File layout | English twin next to each French file: `x.html` + `x.en.html`. Images shared. |
| Manifest | Translatable fields in `katas.json` become `{ "fr": …, "en": … }`. |
| Changelog | Both `changelog.html` and `changelog.en.html`, each gets a new top entry per content commit. |
| Privacy | New privacy note on the About page (both languages). No cookies, no consent banner needed. |

## 1. Shell and URLs

- `index.html` stays the French shell. New `en/index.html` is the English shell:
  `<html lang="en" data-root="../">`, English static texts (top bar, footer, noscript, meta description),
  stylesheets and script from `../assets/`.
- Both shells carry `<link rel="alternate" hreflang="fr|en|x-default">` pointing to `/` and `/en/`.
- Top bar gets a language link (`EN` on the French site, `FR` on the English site). Its `href` is the other
  shell plus the current hash, updated on every route change. Clicking it stores `kohai-lang`.
- Language redirect (revised after review, see the plan ledger): a small inline script in the root shell's `<head>`.
  The reader's language is `kohai-lang` if set, else the first of `fr`/`en` in `navigator.languages` (then stored).
  Only the home page (`/` or `/#/`) is sent to `/en/` when that language is English; deep links always open in their
  own language. Skipped for `?print=` URLs and for crawler user agents (`bot|crawl|spider|slurp`), so the French
  page stays indexable. The English shell stores `en` on a first visit; the language link stores the other language
  on click or middle-click.
- Shell static texts are duplicated in the two shells; a change to one shell is made in both (AGENTS.md rule).

## 2. app.js

Logic only; every new visible string goes to the label files.

- `LANG = root.lang === 'en' ? 'en' : 'fr'`, `ROOT = root.dataset.root || ''`.
- `localized(path)`: prefixes `ROOT`; in English, `.html` becomes `.en.html`. Used for every content fetch
  (`kata.file`, shared pages, label files). `katas.json` keeps `"file": "katas/x.html"`; it is fetched once,
  from `ROOT + 'katas/katas.json'`.
- Rebase: after a fragment is parsed, relative `src` and `href` attributes (not starting with `#`, `/`,
  a scheme, or `mailto:`) get `ROOT` prepended, so `img/heian-shodan/yoi.png` resolves from `/en/`.
- Print: `paged.js` and the Paged.js stylesheets are loaded from `ROOT + 'assets/…'`. The print link `?print=…`
  is relative and stays in the current shell.
- `L(v)`: returns `v[LANG]` when `v` is an object, else `v`. Applied to group `name`, `description`,
  kata `name`, `meaning`, `belt`.
- French hard-coded in app.js moves to labels:
  - Kiai sentence in `fillKataDetails` (`Le Kiai`, `Les deux Kiai`, …, `mouvement(s)`, `et`) → label keys.
  - Eyebrow link text `Kata` in `renderShared` → `menu-kata`.
  - Group count ` kata` → label key.
  - Footer date locale `fr-CA` → label key `locale` (`fr-CA` / `en-CA`).
- Facade videos (see section 7) use label keys too.

## 3. Content files

- Every `.html` under `katas/` and `shared/` gets an `.en.html` twin, including `libelles`, `impression`,
  `changelog`, `about`.
- English twins keep the French `id` values: `data-view` ids, `h2`/`h3` ids, anchors, `data-credits`,
  `data-text` keys. Only visible text and `data-title`/`data-toc` change. This makes the language switch map
  one-to-one and keeps label lookups identical.
- `katas.json`: `name`, `meaning`, `belt` (kata) and `name`, `description` (group) become `{fr, en}`.
  `id`, `group`, `kanji`, `moves`, `kiai`, `file`, `statut`, `beltColors` are unchanged.

## 4. Parity check (both languages required)

New `.githooks/check-i18n.py` (Python 3, standard library), called from `.githooks/pre-commit` on the staged
tree and runnable by hand on the working tree. It fails when:

1. a `katas/*.html` or `shared/*.html` has no `.en.html` twin, or an `.en.html` has no French file;
2. `libelles.html` / `libelles.en.html` (and `impression.*`) do not have the same set of `data-text` keys;
3. a kata file and its twin do not have the same ordered list of `data-view` ids;
4. a translatable field in `katas.json` is not an object with non-empty `fr` and `en`;
5. content changed and the first `<li>` of either changelog is not new (extends the current hook rule to both files).

`--no-verify` remains the escape hatch for commits with no visible change.

## 5. Translation conventions (English)

- Canadian English spelling (colour, centre).
- Japanese terms stay in rōmaji followed by kanji, same markup (`<span class="jp" lang="ja">`).
- Lexique pronunciation is written for English speakers (instead of « à la française »).
- No French typography rules in English (no space before `: ; ! ?`; quotes are “ ”).
- Belts: “White → yellow”, etc.
- The About page is personal: translated closely; uncertain passages are listed for the owner to review.
- Existing changelog entries are translated.

## 6. Privacy note

New section on the About page (`shared/about.html` and `.en.html`), `h2 id="confidentialite"`, listed in the
About sub-menu. Content:

- The site sets no cookies and has no analytics or tracking.
- Theme, paper size and language preferences are saved in the browser (localStorage), never sent anywhere,
  and can be cleared with the browser's site data.
- Videos come from YouTube (Google) and load only when the reader clicks play; from then on, Google's privacy
  policy applies.
- The host, GitHub Pages, keeps standard server logs (IP address) for security, under GitHub's privacy statement.

No consent banner: the only storage is strictly necessary preference storage chosen by the reader.

## 7. Video facade (implemented separately, before the bilingual work)

YouTube iframes in content files stay as written. At render time, app.js replaces each `.video-frame iframe`
with a local button (play icon + video title + note “loads from YouTube”), with no request to Google.
On click the original iframe is restored with `autoplay=1`. In print, `.video-frame` is removed before layout
so no iframe loads.

## 8. Docs

AGENTS.md: bilingual rules (twins, French ids kept, both changelogs, both shells, English conventions,
`check-i18n.py`), updated layout list.

## 9. Testing (manual, local server)

- `/` and `/en/` load; menu, home cards, kata pages, lexique, About work in both languages.
- Language link keeps the current hash in both directions.
- Images load under `/en/`.
- First visit with cleared storage and an English browser redirects once; a later visit to `/` does not.
- Print Letter and A4 for Heian Shodan and the lexique in both languages; embusen still fits one page.
- `check-i18n.py` fails on each of its five cases (temporary test changes) and passes on the final tree.
- Video facade: no request to YouTube/Google before click (network panel); video plays after click.

## Out of scope

- More than two languages.
- Translating kanji/rōmaji or the site name.
- Self-hosting video thumbnails.
