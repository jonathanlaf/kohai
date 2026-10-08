# Bilingual Site (FR + EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve every page of Kohai in French at `/` and English at `/en/`, with a language switch, a first-visit browser-language redirect, a privacy note, and a commit-time check that both languages are always present.

**Architecture:** One `app.js` for both languages. Each shell (`index.html`, `en/index.html`) declares its language (`<html lang>`) and its path back to the site root (`data-root`). app.js maps every content path to its language twin (`x.html` → `x.en.html`), prefixes root-relative URLs from fetched fragments, and reads `{fr, en}` fields from `katas.json`. A Python script, run by the pre-commit hook, enforces parity.

**Tech Stack:** Plain HTML/CSS/JS (no build, no npm), Paged.js 0.4.3 (vendored), Python 3 standard library (`unittest`) for the parity check, Node 22+ (built-in `fetch`/`WebSocket`, no packages) + Google Chrome for headless browser checks.

**Spec:** `docs/superpowers/specs/2026-10-08-bilingual-design.md`

## Global Constraints

- No build step, no framework, no npm packages. Test through `python3 -m http.server 8765` from the repo root, never `file://`.
- All visible text lives in HTML files, never in `app.js`. Labels: `<span data-text="key">…</span>` in `shared/libelles*.html` / `shared/impression*.html`, read with `T('key', 'fallback')`; the fallback is identical to the French file's text.
- English twin of every `.html` under `katas/` and `shared/`: same folder, `.en.html` suffix. Images stay in `img/` (shared).
- English twins keep the French `id` values: `data-view`, `h2`/`h3` `id`, anchors, `data-credits`, `data-text` keys. Only visible text, `data-title` and `data-toc` are translated.
- `katas.json` translatable fields are `{ "fr": "…", "en": "…" }`: group `name`, `description`; kata `name`, `meaning`, `belt`. All other fields unchanged.
- French: Québec French; `&nbsp;` before `: ; ! ?` and inside « »; « mise à jour » without hyphens.
- English: Canadian spelling (colour, centre); no space before `: ; ! ?`; quotes “ ”; Japanese terms stay rōmaji + `<span class="jp" lang="ja">漢字</span>`; lexique pronunciation written for English speakers; belts “White → yellow”.
- `localStorage` keys: `kohai-theme`, `kohai-paper`, `kohai-lang` (`"fr"` | `"en"`). No cookies.
- Commit messages in English, conventional style, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before each commit with logic changes, run `/code-review` at the level noted in the task. Doc- or translation-only commits skip it.
- Nothing private in committed docs (names, emails, local paths). Personal content stays only in the site's own HTML files.
- Changelog: a content commit (`katas/`, `img/`, `shared/`) with a visible change adds a new top `<li>` to `shared/changelog.html` (and, once it exists, `shared/changelog.en.html`). Commits with no visible change on the live French site may use `git commit --no-verify`; each task says which.

## Review Focus

1. **Deep links with anchors across the switch:** `/#/heian-shodan/tutoriel/<h3-id>` switched to EN must land on the same anchor. Pinned in Task 7 (switch test with anchor).
2. **Redirect safety:** with `?print=` in the URL, with `localStorage` throwing, or on a second visit, the root shell must never redirect (and never loop). Pinned in Task 7.
3. **URL rebasing edge cases:** `img/…` gets `../` under `/en/`; `#…`, `/…`, `?…`, `https:`, `mailto:` and SVG `href="#…"` are untouched; French site unchanged (`ROOT` empty). Pinned in Task 2.
4. **Footer date and print from `/en/`:** the footer uses `en-CA` and the `HEAD` request reaches `../katas/katas.json`; print from `/en/` loads Paged.js and stylesheets from `../assets/` and uses English print texts. Pinned in Tasks 3 and 8.
5. **Draft kata in English:** on localhost the English draft banner/badge is English; on the public host drafts stay hidden in both languages (no change to `isAvailable`). Pinned in Task 6.

---

### Task 1: Parity check script (not wired yet)

**Files:**
- Create: `.githooks/check-i18n.py`
- Create: `tests/test_check_i18n.py`

**Interfaces:**
- Produces: `python3 .githooks/check-i18n.py [--staged]` → exit 0 when OK, exit 1 with one `check-i18n: …` line per problem on stderr. Functions (importable for tests via `importlib`): `twin(path) -> str`, `pair_problems(paths: list[str]) -> list[str]`, `label_keys(html: str) -> list[str]`, `view_ids(html: str) -> list[str]`, `manifest_problems(data: dict) -> list[str]`, `first_entry(html: str) -> str | None`, `run(staged: bool) -> list[str]`.
- Task 8 replaces the body of `.githooks/pre-commit` with a call to this script.

- [ ] **Step 1: Write the failing tests**

`tests/test_check_i18n.py`:

```python
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', '.githooks', 'check-i18n.py')
spec = importlib.util.spec_from_file_location('check_i18n', SCRIPT)
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)

MANIFEST = {
    'groups': [{'id': 'heian', 'name': {'fr': 'Heian', 'en': 'Heian'}, 'kanji': '平安',
                'description': {'fr': 'Les cinq kata.', 'en': 'The five kata.'}}],
    'katas': [{'id': 'heian-shodan', 'group': 'heian', 'name': {'fr': 'Heian Shodan', 'en': 'Heian Shodan'},
               'meaning': {'fr': 'Esprit paisible', 'en': 'Peaceful mind'}, 'belt': {'fr': 'Blanche', 'en': 'White'},
               'kanji': '平安初段', 'beltColors': ['blanche']}],
}


class Pure(unittest.TestCase):
    def test_twin(self):
        self.assertEqual(ci.twin('katas/a.html'), 'katas/a.en.html')
        self.assertEqual(ci.twin('katas/a.en.html'), 'katas/a.html')

    def test_pairs(self):
        self.assertEqual(ci.pair_problems(['katas/a.html', 'katas/a.en.html']), [])
        self.assertEqual(len(ci.pair_problems(['katas/a.html'])), 1)
        self.assertEqual(len(ci.pair_problems(['shared/b.en.html'])), 1)
        self.assertEqual(ci.pair_problems(['index.html', 'katas/katas.json', 'img/x/y.png']), [])

    def test_label_keys(self):
        html = '<!-- <span data-text="commented">x</span> -->\n<span data-text="a">A</span><span data-text="b">B</span>'
        self.assertEqual(ci.label_keys(html), ['a', 'b'])

    def test_view_ids(self):
        html = '<section data-view="presentation" data-title="P"></section><section class="x" data-view="embusen">'
        self.assertEqual(ci.view_ids(html), ['presentation', 'embusen'])

    def test_manifest_ok(self):
        self.assertEqual(ci.manifest_problems(MANIFEST), [])

    def test_manifest_missing_language(self):
        bad = json.loads(json.dumps(MANIFEST))
        bad['katas'][0]['meaning'] = {'fr': 'Esprit paisible', 'en': ''}
        bad['groups'][0]['name'] = 'Heian'
        self.assertEqual(len(ci.manifest_problems(bad)), 2)

    def test_first_entry(self):
        html = '<!-- x -->\n<ol>\n  <li><time datetime="2026-10-08">8</time> Un.</li>\n  <li>Deux</li>\n</ol>'
        self.assertEqual(ci.first_entry(html), '<li><time datetime="2026-10-08">8</time> Un.</li>')
        self.assertIsNone(ci.first_entry('<ol></ol>'))


def git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def write(root, path, text):
    full = os.path.join(root, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(text)


CHANGELOG = '<ol class="changelog">\n  <li>{}</li>\n</ol>\n'
KATA = '<section data-view="presentation"></section><section data-view="embusen"></section>'


class Staged(unittest.TestCase):
    """--staged reads the git index and compares changelogs with HEAD."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.root = self.tmp.name
        git(r, 'init', '-q')
        git(r, 'config', 'user.email', 't@example.invalid')
        git(r, 'config', 'user.name', 'T')
        write(r, 'katas/katas.json', json.dumps(MANIFEST))
        write(r, 'katas/heian-shodan.html', KATA)
        write(r, 'katas/heian-shodan.en.html', KATA)
        write(r, 'shared/libelles.html', '<span data-text="a">A</span>')
        write(r, 'shared/libelles.en.html', '<span data-text="a">A</span>')
        write(r, 'shared/changelog.html', CHANGELOG.format('Un'))
        write(r, 'shared/changelog.en.html', CHANGELOG.format('One'))
        git(r, 'add', '-A')
        git(r, 'commit', '-qm', 'init')
        self.cwd = os.getcwd()
        os.chdir(r)

    def tearDown(self):
        os.chdir(self.cwd)
        self.tmp.cleanup()

    def test_no_content_change_passes(self):
        write(self.root, 'assets/app.js', '//')
        git(self.root, 'add', '-A')
        self.assertEqual(ci.run(staged=True), [])

    def test_both_changelogs_new_passes(self):
        write(self.root, 'katas/heian-shodan.html', KATA + '<p>x</p>')
        write(self.root, 'shared/changelog.html', CHANGELOG.format('Deux'))
        write(self.root, 'shared/changelog.en.html', CHANGELOG.format('Two'))
        git(self.root, 'add', '-A')
        self.assertEqual(ci.run(staged=True), [])

    def test_one_changelog_new_fails(self):
        write(self.root, 'katas/heian-shodan.html', KATA + '<p>x</p>')
        write(self.root, 'shared/changelog.html', CHANGELOG.format('Deux'))
        git(self.root, 'add', '-A')
        problems = ci.run(staged=True)
        self.assertEqual(len(problems), 1)
        self.assertIn('changelog.en.html', problems[0])

    def test_missing_twin_fails(self):
        write(self.root, 'shared/lexique.html', '<section></section>')
        write(self.root, 'shared/changelog.html', CHANGELOG.format('Deux'))
        write(self.root, 'shared/changelog.en.html', CHANGELOG.format('Two'))
        git(self.root, 'add', '-A')
        self.assertTrue(any('lexique.en.html' in p for p in ci.run(staged=True)))

    def test_label_mismatch_fails(self):
        write(self.root, 'shared/libelles.en.html', '<span data-text="a">A</span><span data-text="b">B</span>')
        write(self.root, 'shared/changelog.html', CHANGELOG.format('Deux'))
        write(self.root, 'shared/changelog.en.html', CHANGELOG.format('Two'))
        git(self.root, 'add', '-A')
        self.assertTrue(any('libelles' in p and 'b' in p for p in ci.run(staged=True)))

    def test_view_mismatch_fails(self):
        write(self.root, 'katas/heian-shodan.en.html', '<section data-view="presentation"></section>')
        write(self.root, 'shared/changelog.html', CHANGELOG.format('Deux'))
        write(self.root, 'shared/changelog.en.html', CHANGELOG.format('Two'))
        git(self.root, 'add', '-A')
        self.assertTrue(any('data-view' in p for p in ci.run(staged=True)))

    def test_unstaged_files_ignored(self):
        write(self.root, 'shared/lexique.html', '<section></section>')  # not added
        self.assertEqual(ci.run(staged=True), [])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m unittest tests/test_check_i18n.py -v`
Expected: error loading the module (`FileNotFoundError` … `check-i18n.py`).

- [ ] **Step 3: Write the script**

`.githooks/check-i18n.py`:

```python
#!/usr/bin/env python3
"""Both languages are required: every content file has its English twin, and they stay in step.

Run by .githooks/pre-commit with --staged (reads the git index), or by hand on the working tree.
Skip once for a commit with no visible change: git commit --no-verify
"""
import json
import os
import re
import subprocess
import sys

CONTENT = ('katas/', 'img/', 'shared/')
TWINNED = ('katas/', 'shared/')
LABEL_FILES = ('shared/libelles.html', 'shared/impression.html')
CHANGELOGS = ('shared/changelog.html', 'shared/changelog.en.html')
MANIFEST = 'katas/katas.json'
TRANSLATED = {'groups': ('name', 'description'), 'katas': ('name', 'meaning', 'belt')}


def twin(path):
    return path[:-len('.en.html')] + '.html' if path.endswith('.en.html') else path[:-len('.html')] + '.en.html'


def pair_problems(paths):
    present = set(paths)
    return ['{} has no twin {}'.format(p, twin(p)) for p in sorted(present)
            if p.startswith(TWINNED) and p.endswith('.html') and twin(p) not in present]


def strip_comments(html):
    return re.sub(r'<!--.*?-->', '', html, flags=re.S)


def label_keys(html):
    return re.findall(r'data-text="([^"]+)"', strip_comments(html))


def view_ids(html):
    return re.findall(r'<section\b[^>]*\bdata-view="([^"]+)"', strip_comments(html))


def manifest_problems(data):
    problems = []
    for kind, fields in TRANSLATED.items():
        for item in data.get(kind, []):
            for field in fields:
                v = item.get(field)
                if not (isinstance(v, dict) and str(v.get('fr', '')).strip() and str(v.get('en', '')).strip()):
                    problems.append('{} {} "{}" needs non-empty "fr" and "en"'.format(MANIFEST, item.get('id'), field))
    return problems


def first_entry(html):
    m = re.search(r'^[ \t]*(<li[ >].*)$', strip_comments(html), flags=re.M)
    return m.group(1).strip() if m else None


def git(*args):
    r = subprocess.run(['git', *args], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def run(staged):
    if staged:
        files = git('ls-files').splitlines()
        read = lambda p: git('show', ':' + p)
    else:
        files = [os.path.relpath(os.path.join(d, f)).replace(os.sep, '/')
                 for top in TWINNED for d, _, fs in os.walk(top) for f in fs]

        def read(p):
            try:
                with open(p, encoding='utf-8') as f:
                    return f.read()
            except OSError:
                return None

    problems = pair_problems([f for f in files if f.startswith(TWINNED)])

    for fr in LABEL_FILES:
        a, b = read(fr), read(twin(fr))
        if a is not None and b is not None:
            ka, kb = set(label_keys(a)), set(label_keys(b))
            for key in sorted(ka ^ kb):
                problems.append('data-text "{}" is in {} only'.format(key, fr if key in ka else twin(fr)))

    for fr in files:
        if fr.startswith('katas/') and fr.endswith('.html') and not fr.endswith('.en.html') and twin(fr) in files:
            a, b = read(fr), read(twin(fr))
            if a is not None and b is not None and view_ids(a) != view_ids(b):
                problems.append('{} and {} have different data-view ids: {} / {}'.format(fr, twin(fr), view_ids(a), view_ids(b)))

    raw = read(MANIFEST)
    if raw is not None:
        try:
            problems += manifest_problems(json.loads(raw))
        except ValueError as e:
            problems.append('{} is not valid JSON: {}'.format(MANIFEST, e))

    if staged:
        changed = (git('diff', '--cached', '--name-only', '--diff-filter=ACMRD') or '').splitlines()
        content = [p for p in changed if p.startswith(CONTENT) and p not in CHANGELOGS]
        if content:
            for log in CHANGELOGS:
                entry = first_entry(read(log) or '')
                old = git('show', 'HEAD:' + log)
                if not entry:
                    problems.append('no <li> entry found in ' + log)
                elif old is not None and entry in [l.strip() for l in old.splitlines()]:
                    problems.append('content changed: add a new entry at the top of ' + log)
    return problems


def main():
    problems = run(staged='--staged' in sys.argv[1:])
    for p in problems:
        print('check-i18n: ' + p, file=sys.stderr)
    if problems:
        print('  See AGENTS.md (bilingual rules). Use --no-verify only if nothing visible changed.', file=sys.stderr)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
```

Then: `chmod +x .githooks/check-i18n.py`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest tests/test_check_i18n.py -v`
Expected: all 14 tests `ok`.

- [ ] **Step 5: Run on the current tree (expected to fail: no English yet)**

Run: `python3 .githooks/check-i18n.py; echo "exit $?"`
Expected: one `has no twin` line per `katas/*.html` and `shared/*.html`, 3 × 26 + 2 × 4 = 86 manifest lines, `exit 1`. This confirms it sees the whole tree; it stays unwired until Task 8.

- [ ] **Step 6: Review and commit**

Run `/code-review medium` on the two files, then:

```bash
git add .githooks/check-i18n.py tests/test_check_i18n.py
git commit -m "feat: add bilingual parity check script (not wired yet)"
```

---

### Task 2: app.js language plumbing (French unchanged)

**Files:**
- Modify: `assets/app.js`
- Modify: `katas/katas.json` (fields become `{fr, en}`, with the English translations)
- Modify: `shared/libelles.html` (new keys `groupe-kata`, `locale`)
- Modify: `shared/impression.html` (new keys `kiai-1` … `kiai-et`)
- Create: `tests/cdp.mjs` (headless Chrome driver)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (inside app.js, used by later tasks): `LANG` (`'fr'|'en'`), `ROOT` (`''` or `'../'`), `localized(path) -> string`, `L(value) -> string`, `rebase(fragment)`. `tests/cdp.mjs <url> [js-expr…]` prints each expression's JSON value and third-party request URLs; `SHOT=<png>` saves a 1200×900 screenshot; `WIDTH=<px>` overrides the width.

- [ ] **Step 1: Create the browser driver**

`tests/cdp.mjs`:

```js
// Headless Chrome over the DevTools protocol, no packages (Node 22+).
// Usage: node tests/cdp.mjs <url> [js-expression …]   (SHOT=out.png screenshot, WIDTH=390 phone, LANGS=en-CA,en browser languages; default fr-CA,fr)
// Prints the JSON value of each expression (promises are awaited) and every non-localhost request.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const [url, ...steps] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'kohai-cdp-')), 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = {}; const requests = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Network.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.WIDTH || 1200), height: 900, deviceScaleFactor: 1, mobile: false });
// Browser languages (navigator.languages): French by default so the first-visit redirect does not fire unless asked
const ua = (await send('Browser.getVersion')).result.userAgent;
await send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: process.env.LANGS || 'fr-CA,fr' });
await send('Page.navigate', { url });
await sleep(2500);
for (const s of steps) {
  const r = await send('Runtime.evaluate', { expression: s, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result.result?.value ?? r.result.exceptionDetails?.exception?.description ?? null));
  await sleep(1500);
}
console.log('third-party:', JSON.stringify(requests.filter((u) => !/^(http:\/\/localhost|blob:|data:)/.test(u))));
if (process.env.SHOT) writeFileSync(process.env.SHOT, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
ws.close(); proc.kill(); process.exit(0);
```

Start the server once for all browser checks (leave it running): `python3 -m http.server 8765` (background).

- [ ] **Step 2: Record the French baseline (before any change)**

Run:

```bash
node tests/cdp.mjs 'http://localhost:8765/#/' \
  "[document.title, document.querySelectorAll('.kata-card').length, document.querySelector('.kata-card-meaning').textContent, document.querySelector('.belt-label').textContent, document.querySelector('.count').textContent]" \
  "location.hash='#/heian-shodan/presentation'; new Promise(r=>setTimeout(()=>r([document.title, document.getElementById('crumb').textContent]),800))" \
  "location.hash='#/kata/esprit'; new Promise(r=>setTimeout(()=>r(document.querySelector('.eyebrow').textContent),800))" \
  "document.getElementById('site-updated').textContent"
node tests/cdp.mjs 'http://localhost:8765/?print=letter&kata=heian-shodan&noprint=1' \
  "new Promise(r=>{const t=setInterval(()=>{const d=document.documentElement.dataset.pagedDone;if(d){clearInterval(t);r(d)}},300)})" \
  "[...document.querySelectorAll('[data-kata-kiai]')].map(e=>e.textContent)"
```

Save the output to the scratchpad as `baseline.txt`. Expected shape: title `Kohai · Fiches d’étude des kata`, 26 cards, `Esprit paisible, premier niveau`, `Ceinture blanche → jaune`, `5 kata`, `Présentation · Heian Shodan · Kohai`, eyebrow `Kata`, footer `Dernière mise à jour : … @ … 2026`, a page count N, Kiai text `Les deux Kiai (mouvements 9 et 17)`.

- [ ] **Step 3: Convert `katas/katas.json` to `{fr, en}`**

Write a one-off Python script in the scratchpad (not committed) that loads the JSON and, for each group (`name`, `description`) and each kata (`name`, `meaning`, `belt`), replaces the string with `{"fr": <existing>, "en": <translation>}` from a dict you fill in by translating each value (follow the English rules in Global Constraints; kata and group names stay the same in English, e.g. `{"fr": "Heian Shodan", "en": "Heian Shodan"}`; belts like `"Blanche → jaune"` → `"White → yellow"`, `"Marron"` → `"Brown"`, `"Noire"` → `"Black"`). Write it back keeping the existing layout: groups pretty-printed, **one kata per line** in the same key order as before. Then check:

Run: `python3 -c "import json,importlib.util as u;s=u.spec_from_file_location('c','.githooks/check-i18n.py');m=u.module_from_spec(s);s.loader.exec_module(m);print(m.manifest_problems(json.load(open('katas/katas.json'))))"`
Expected: `[]`

Run: `git diff --stat katas/katas.json`
Expected: only that file, about 30 lines changed (4 groups + 26 katas).

- [ ] **Step 4: Add the language constants and helpers**

In `assets/app.js`, replace the start of the IIFE up to and including `var root = document.documentElement;`:

```js
(function () {
  'use strict';

  var root = document.documentElement;
  // Language of this shell: index.html is French, en/index.html is English (data-root="../" points back to the site root)
  var LANG = root.lang === 'en' ? 'en' : 'fr';
  var ROOT = root.getAttribute('data-root') || '';
  // Content file in the page's language: katas/x.html → katas/x.en.html in English
  function localized(path) { return ROOT + (LANG === 'en' ? path.replace(/\.html$/, '.en.html') : path); }
  // katas.json text fields are {"fr": …, "en": …}
  function L(v) { return v && typeof v === 'object' ? v[LANG] : v; }

  var MANIFEST = ROOT + 'katas/katas.json';
  var LEXIQUE = localized('shared/lexique.html');
  var SHARED = localized('shared/kata.html');
  var ABOUT = localized('shared/about.html');
  var HOME = localized('shared/accueil.html');
  var CHANGELOG = localized('shared/changelog.html');
  var LABELS = localized('shared/libelles.html');    // menu and interface labels
  var PRINT_TEXTS = localized('shared/impression.html');  // texts used only in print
  var params = new URLSearchParams(location.search);
```

- [ ] **Step 5: Rebase relative URLs in fetched fragments**

Replace `fetchFragment`:

```js
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
```

- [ ] **Step 6: Use `localized()` for kata files and `L()` for manifest text**

Make exactly these replacements in `assets/app.js`:

| Where | Before | After |
|---|---|---|
| `buildPrintDocument` | `fetchFragment(kata.file)` | `fetchFragment(localized(kata.file))` |
| `buildPrintDocument` | `title: kata.name` | `title: L(kata.name)` |
| `fillKataDetails` | `el.textContent = kata.name;` | `el.textContent = L(kata.name);` |
| `buildMenu` | `escapeHtml(g.name)` | `escapeHtml(L(g.name))` |
| `buildMenu` | `escapeHtml(k.name)` | `escapeHtml(L(k.name))` |
| `renderHome` `belt()` | `escapeHtml(k.belt.charAt(0).toLowerCase() + k.belt.slice(1))` | `escapeHtml(L(k.belt).charAt(0).toLowerCase() + L(k.belt).slice(1))` |
| `renderHome` `card()` | `escapeHtml(k.name)` / `escapeHtml(k.meaning)` | `escapeHtml(L(k.name))` / `escapeHtml(L(k.meaning))` |
| `renderHome` groups | `escapeHtml(g.name)` / `escapeHtml(g.description)` | `escapeHtml(L(g.name))` / `escapeHtml(L(g.description))` |
| `renderKata` | `fetchFragment(kata.file)` | `fetchFragment(localized(kata.file))` |
| `renderKata` | `setCrumb(kata.name)`, `' · ' + kata.name + ' · '`, `escapeHtml(kata.name)` | `L(kata.name)` in all three |
| `route()` | `kata ? kata.file : null` | `kata ? localized(kata.file) : null` |

`isAvailable` keeps `!!k.file` (presence test only). Verify none are left:
Run: `grep -nE '\b(k|kata|g)\.(name|meaning|belt|description)\b|fetchFragment\(kata\.file|\? kata\.file' assets/app.js`
Expected: no output.

- [ ] **Step 7: Move the remaining French literals to labels**

a) Group count. In `renderHome`, replace `list.length + ' kata</span></h3>'` with `list.length + ' ' + T('groupe-kata', 'kata') + '</span></h3>'`.

b) Eyebrow in `renderShared`: replace `'<p class="eyebrow"><a href="#/accueil/kata-title">Kata</a></p>'` with `'<p class="eyebrow"><a href="#/accueil/kata-title">' + T('menu-kata', 'Kata') + '</a></p>'`.

c) Footer locale in `showLastUpdate`: before `var time = …` add `var locale = plain(T('locale', 'fr-CA'));` and replace both `'fr-CA'` with `locale`. Because labels may still be loading at that point, move the two `toLocale…` lines inside the `labelsReady.then(function () { … })` callback, before `el.innerHTML = …`.

d) Kiai sentence. Replace the `if (kata.kiai && kata.kiai.length) { … }` block in `fillKataDetails` with:

```js
    if (kata.kiai && kata.kiai.length) {
      var n = kata.kiai.length;
      var lead = n <= 4 ? T('kiai-' + n, ['', 'Le Kiai', 'Les deux Kiai', 'Les trois Kiai', 'Les quatre Kiai'][n]) : T('kiai-n', 'Les Kiai');
      var moves = n > 1 ? kata.kiai.slice(0, -1).join(', ') + ' ' + plain(T('kiai-et', 'et')) + ' ' + kata.kiai[n - 1] : String(kata.kiai[0]);
      var text = plain(lead) + ' (' + plain(n > 1 ? T('kiai-mouvements', 'mouvements') : T('kiai-mouvement', 'mouvement')) + ' ' + moves + ')';
      root.querySelectorAll('[data-kata-kiai]').forEach(function (el) { el.textContent = text; });
    }
```

e) `shared/libelles.html`: after the `carte-disponibles` line add

```html
<span data-text="groupe-kata">kata</span>          <!-- after the number of kata in a group title: « 5 kata » -->
```

and at the end of the file add

```html
<!-- Language code for dates (footer). fr-CA here, en-CA in libelles.en.html -->
<span data-text="locale">fr-CA</span>
```

f) `shared/impression.html`: at the end add

```html
<!-- Kiai sentence in « L'esprit du kata », filled with the kata's own moves: « Les deux Kiai (mouvements 9 et 17) » -->
<span data-text="kiai-1">Le Kiai</span>
<span data-text="kiai-2">Les deux Kiai</span>
<span data-text="kiai-3">Les trois Kiai</span>
<span data-text="kiai-4">Les quatre Kiai</span>
<span data-text="kiai-n">Les Kiai</span>
<span data-text="kiai-mouvement">mouvement</span>
<span data-text="kiai-mouvements">mouvements</span>
<span data-text="kiai-et">et</span>
```

- [ ] **Step 8: Use ROOT for Paged.js assets**

In `startPagedPrint`: `script.src = ROOT + 'assets/vendor/paged.js';` and the stylesheet list becomes `[ROOT + 'assets/style.css', ROOT + 'assets/print.css', ROOT + 'assets/paged.css', sizeUrl]`.

- [ ] **Step 9: Verify French is unchanged**

Re-run both commands from Step 2.
Expected: output identical to `baseline.txt` (same titles, 26 cards, same meaning/belt/count, eyebrow `Kata`, same footer format, same page count, same Kiai text), `third-party: []`.

- [ ] **Step 10: Verify the rebase rules (Review Focus 3)**

Run (temporarily simulating the English shell on the French page):

```bash
node tests/cdp.mjs 'http://localhost:8765/#/' \
  "(()=>{const t=document.createElement('template');t.innerHTML='<img src=\"img/a.png\"><a href=\"#/x\"></a><a href=\"/y\"></a><a href=\"?print=a4\"></a><a href=\"https://e.ca\"></a><a href=\"mailto:a@b.c\"></a><svg><use href=\"#arrow\"/></svg><a href=\"shared/z.html\"></a>';const ROOT='../';t.content.querySelectorAll('[src],[href]').forEach(el=>['src','href'].forEach(a=>{const v=el.getAttribute(a);if(v&&!/^(#|\/|\?|[a-z][a-z0-9+.-]*:)/i.test(v))el.setAttribute(a,ROOT+v)}));return [...t.content.querySelectorAll('[src],[href]')].map(e=>e.getAttribute('src')||e.getAttribute('href'))})()"
```

Expected: `["../img/a.png","#/x","/y","?print=a4","https://e.ca","mailto:a@b.c","#arrow","../shared/z.html"]`. (Task 6 checks the real function: kata images load from `/en/` through `../img/`.)

- [ ] **Step 11: Review and commit**

Run `/code-review medium` on `assets/app.js`, then:

```bash
git add assets/app.js katas/katas.json shared/libelles.html shared/impression.html tests/cdp.mjs
git commit --no-verify -m "feat: language plumbing in app.js, bilingual katas.json"
```

(`--no-verify`: nothing visible changes on the French site.)

---

### Task 3: English shell and English labels

**Files:**
- Create: `en/index.html`
- Create: `shared/libelles.en.html`
- Create: `shared/impression.en.html`

**Interfaces:**
- Consumes: `LANG`, `ROOT`, `localized()` from Task 2.
- Produces: `/en/` loads app.js in English. Task 7 adds the language link and hreflang to both shells.

- [ ] **Step 1: Create `en/index.html`**

Copy `index.html` to `en/index.html`, then change:
- `<html lang="fr">` → `<html lang="en" data-root="../">`
- `<meta name="description">` → `Study notes on the kata of the Club de Karaté Traditionnel Chaleurs: spirit of the kata, embusen, illustrated moves, videos and Japanese vocabulary.`
- `href="assets/style.css"` → `href="../assets/style.css"`; `href="assets/print.css"` → `href="../assets/print.css"`; `src="assets/app.js"` → `src="../assets/app.js"`
- `aria-label="Fil d'Ariane"` → `aria-label="Breadcrumb"`; `aria-label="Thème"` → `aria-label="Theme"`
- Theme buttons: `Clair` → `Light`, `Auto` stays, `Sombre` → `Dark`
- `Format du papier` → `Paper size`; options `Lettre` → `Letter`, `A4` stays; `Imprimer` → `Print`
- `aria-label="Sections"` and `<summary>Sections</summary>` stay (same word)
- `Chargement…` → `Loading…`; noscript → `This page needs JavaScript to show the study notes.`
- Footer: `les notes d'un élève` → `a student’s notes`; `À propos` → `About`; `Sources et crédits` → `Sources and credits`; `Signaler une erreur` → `Report an error`, and in its `mailto:` keep the address, change only the subject to `Kohai%20%E2%80%94%20error%20to%20fix`.
- Inline theme script: unchanged.

- [ ] **Step 2: Create `shared/libelles.en.html` and `shared/impression.en.html`**

Copy each French file to its `.en.html` twin. Translate the HTML comments and every text between the tags; keep every `data-text` value. Specific values: `menu-accueil` Home, `menu-qu-est-ce-qu-un-kata` What is a kata?, `menu-esprit` The spirit of the kata, `menu-erreurs` Common mistakes, `menu-lexique` Karateka’s vocabulary, `menu-a-propos` About, `menu-replier` Collapse, `menu-deplier` Expand, `carte-ceinture` Belt, `carte-mouvements` moves, `carte-en-preparation` In preparation, `carte-disponible`/`carte-disponibles` available, `groupe-kata` kata, `page-precedente` Previous, `page-suivante` Next, `pied-mise-a-jour` Last update:, `fil-lexique` Vocabulary, `onglet-accueil` Kohai · Kata study notes, `video-lire` Play the video, `video-note` The video loads from YouTube when you click., `locale` en-CA, `carte-brouillon` Draft, `brouillon-bandeau` Draft: this kata is only visible locally. Set “statut” to “publie” in katas/katas.json to publish it., `table-des-matieres` Contents, `credits-titre` Sources and credits, `note-titre` About these notes, `lexique-titre` Karateka’s vocabulary, `onglet-impression` (print), `preparation` Preparing to print…, `kiai-1` The Kiai, `kiai-2` The two Kiai, `kiai-3` The three Kiai, `kiai-4` The four Kiai, `kiai-n` The Kiai, `kiai-mouvement` move, `kiai-mouvements` moves, `kiai-et` and. Translate the remaining keys (`pied-de-page`, `lexique-sous-titre`, error messages, `page-navigation`, `menu-titre`) the same way; in `pied-de-page`, keep the email address and the site address unchanged.

Run: `python3 -c "import importlib.util as u;s=u.spec_from_file_location('c','.githooks/check-i18n.py');m=u.module_from_spec(s);s.loader.exec_module(m);[print(f, set(m.label_keys(open(f).read()))^set(m.label_keys(open(f.replace('.html','.en.html')).read()))) for f in ('shared/libelles.html','shared/impression.html')]"`
Expected: `shared/libelles.html set()` and `shared/impression.html set()`.

- [ ] **Step 3: Verify the English shell (Review Focus 4)**

Run:

```bash
node tests/cdp.mjs 'http://localhost:8765/en/#/' \
  "new Promise(r=>setTimeout(()=>r([document.documentElement.lang, document.getElementById('toc-title').textContent, [...document.querySelectorAll('#toc a')].slice(0,3).map(a=>a.textContent), document.getElementById('site-updated').textContent, getComputedStyle(document.body).backgroundColor!=='rgba(0, 0, 0, 0)']),1500))"
```

Expected: `"en"`, `"Menu"`, `["Home","What is a kata?","Kata"]`, footer starting `Last update:` with an English date (e.g. `5:05 p.m. @ October 8, 2026`), `true` (stylesheet loaded from `../assets/`). The view itself shows the load error (`accueil.en.html` 404) — expected until Task 4. `third-party: []`.

- [ ] **Step 4: Commit**

Translation and new files only; app.js untouched.

```bash
git add en/index.html shared/libelles.en.html shared/impression.en.html
git commit --no-verify -m "feat: English shell and English interface labels"
```

(`--no-verify`: no visible change on the French site; `/en/` is not linked yet.)

---

### Task 4: English home, shared kata pages and vocabulary

**Files:**
- Create: `shared/accueil.en.html`, `shared/kata.en.html`, `shared/lexique.en.html`

**Interfaces:**
- Consumes: the English shell (Task 3).
- Produces: English twins with identical ids, including `id="about"`, `id="kata-title"`, `data-kata-groups`, `data-ready-count` in the home page, `data-view="esprit"`/`"erreurs"` and `data-kata-name`/`data-kata-kiai` placeholders in `kata.en.html`, and every `h3 id` in the lexique.

- [ ] **Step 1: Translate the three files**

For each, copy the French file to its `.en.html` twin and translate the visible text, `data-title`, `data-toc` and HTML comments. Keep all tags, classes, `id`s, `data-*` attributes and `<span class="jp" lang="ja">…</span>` content identical. Lexique: rōmaji entries stay; definitions in English; the pronunciation column is rewritten for English speakers (e.g. `zenkutsu` → `zen-KOOT-soo`), and any sentence saying pronunciation is « à la française » says it is written for English speakers.

- [ ] **Step 2: Verify the ids match**

Run:

```bash
for f in accueil kata lexique; do diff <(grep -oE '(id|data-view|data-kata-[a-z]+|data-ready-count)="?[^" >]*' shared/$f.html) <(grep -oE '(id|data-view|data-kata-[a-z]+|data-ready-count)="?[^" >]*' shared/$f.en.html) && echo "$f ok"; done
```

Expected: `accueil ok`, `kata ok`, `lexique ok`.

- [ ] **Step 3: Verify in the browser**

Run:

```bash
node tests/cdp.mjs 'http://localhost:8765/en/#/' \
  "new Promise(r=>setTimeout(()=>r([document.title, document.querySelectorAll('.kata-card').length, document.querySelector('.kata-card-meaning').textContent, document.querySelector('.belt-label').textContent, document.querySelector('.count').textContent]),1500))" \
  "location.hash='#/kata/esprit'; new Promise(r=>setTimeout(()=>r([document.querySelector('.eyebrow').textContent, document.querySelector('#view h2').textContent]),800))" \
  "location.hash='#/lexique'; new Promise(r=>setTimeout(()=>r([document.getElementById('crumb').textContent, document.querySelectorAll('#toc a').length > 5]),800))"
```

Expected: `Kohai · Kata study notes`, `26`, `Peaceful mind, first level` (or your translation of the manifest meaning), `Belt white → yellow`, `5 kata`; `Kata` + English heading; `Vocabulary`, `true`.

Also open `http://localhost:8765/en/#/` at phone width: `WIDTH=390 SHOT=$SCRATCH/en-home-phone.png node tests/cdp.mjs 'http://localhost:8765/en/#/'`, then read the image: no text overflow, no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add shared/accueil.en.html shared/kata.en.html shared/lexique.en.html
git commit --no-verify -m "feat: English home, spirit of the kata, common mistakes and vocabulary"
```

---

### Task 5: About page in English, privacy note, English changelog

**Files:**
- Modify: `shared/about.html` (new privacy section)
- Create: `shared/about.en.html`, `shared/changelog.en.html`
- Modify: `shared/changelog.html` (new entry)

**Interfaces:**
- Consumes: the English shell (Task 3).
- Produces: `h2 id="confidentialite"` in both About pages (shown in the About sub-menu automatically, since `renderAbout` lists every `h2[id]`). `shared/changelog.en.html` with the same structure as the French one (`<ol class="changelog">`, one `<li>` per entry, newest first).

- [ ] **Step 1: Add the privacy note to `shared/about.html`**

Insert before `<h2 id="credits">`:

```html
  <h2 id="confidentialite">Confidentialité</h2>
  <p>Ce site ne dépose aucun témoin (cookie) et n’utilise aucun outil de statistiques ni de suivi.</p>
  <p>Vos choix de thème, de format de papier et de langue sont enregistrés dans votre navigateur (stockage local). Ils ne sont envoyés nulle part et s’effacent avec les données du site dans votre navigateur.</p>
  <p>Les vidéos viennent de YouTube (Google) et ne se chargent que lorsque vous cliquez pour les lancer. À partir de ce moment, la politique de confidentialité de Google s’applique.</p>
  <p>Le site est hébergé par GitHub Pages, qui conserve des journaux techniques (dont l’adresse IP) pour des raisons de sécurité, selon la déclaration de confidentialité de GitHub.</p>

```

- [ ] **Step 2: Create `shared/about.en.html`**

Copy `shared/about.html` and translate all visible text and the HTML comment. Keep every `id`, `class`, `data-credits`, `data-changelog`, link `href` and `<span class="jp">` identical. The privacy section in English:

```html
  <h2 id="confidentialite">Privacy</h2>
  <p>This site sets no cookies and uses no analytics or tracking tools.</p>
  <p>Your theme, paper size and language choices are saved in your browser (local storage). They are never sent anywhere and are erased with this site’s data in your browser.</p>
  <p>Videos come from YouTube (Google) and only load when you click to play them. From that moment, Google’s privacy policy applies.</p>
  <p>The site is hosted on GitHub Pages, which keeps technical logs (including IP addresses) for security purposes, under GitHub’s privacy statement.</p>
```

The `.about-head .intro` paragraphs become the printed disclaimer in English print; translate them faithfully. The credits intro (“Les textes tirés de sources en anglais ont été traduits en français…”) becomes: “Texts drawn from English-language sources have been adapted and modified for these notes. Thanks to their authors.” Keep source titles as they are (they are titles of external works).

At the end of the task report, list for the owner every passage of the About page whose English wording you were unsure of (personal voice, idioms).

- [ ] **Step 3: Create `shared/changelog.en.html` and add the new entry to both**

Copy `shared/changelog.html`, translate the comment (“Change log, shown in About (#/a-propos/changelog)… then a short sentence in English.”) and every entry, with dates as `<time datetime="2026-10-07">October 7, 2026</time>`. Then add at the top of each list:

- FR: `<li><time datetime="2026-10-08">8 octobre 2026</time> Nouvelle section «&nbsp;Confidentialité&nbsp;» dans «&nbsp;À propos&nbsp;»&nbsp;: aucun témoin, aucun suivi.</li>`
- EN: `<li><time datetime="2026-10-08">October 8, 2026</time> New “Privacy” section on the About page: no cookies, no tracking.</li>`

- [ ] **Step 4: Verify**

Run:

```bash
diff <(grep -oE '(id|data-credits)="[^"]*"' shared/about.html) <(grep -oE '(id|data-credits)="[^"]*"' shared/about.en.html) && echo ids ok
node tests/cdp.mjs 'http://localhost:8765/#/a-propos/confidentialite' \
  "new Promise(r=>setTimeout(()=>r([[...document.querySelectorAll('#toc a')].map(a=>a.textContent).includes('Confidentialité'), document.querySelector('.changelog li').textContent.slice(0,40)]),1500))"
node tests/cdp.mjs 'http://localhost:8765/en/#/a-propos/confidentialite' \
  "new Promise(r=>setTimeout(()=>r([[...document.querySelectorAll('#toc a')].map(a=>a.textContent).includes('Privacy'), document.querySelector('.changelog li').textContent.slice(0,40)]),1500))"
```

Expected: `ids ok`; `[true,"8 octobre 2026 Nouvelle section « Confid"]`; `[true,"October 8, 2026 New “Privacy” section o"]`.

- [ ] **Step 5: Commit**

The French site shows a new section, so this commit goes through the (still French-only) hook without `--no-verify`:

```bash
git add shared/about.html shared/about.en.html shared/changelog.html shared/changelog.en.html
git commit -m "feat: privacy note on the About page; English About and change log"
```

---

### Task 6: English kata pages

**Files:**
- Create: `katas/heian-shodan.en.html`, `katas/heian-nidan.en.html`, `katas/heian-sandan.en.html`, `katas/heian-yondan.en.html`, `katas/heian-godan.en.html`

**Interfaces:**
- Consumes: `localized(kata.file)` (Task 2), English labels (Task 3).
- Produces: one English twin per kata with identical `data-view` order, identical `h2`/`h3`/anchor `id`s, identical image `src`s and SVG structure.

- [ ] **Step 1: Translate the five kata files**

Copy each French file to its twin and translate: visible text, `data-title`, `data-toc`, `alt`, figcaption text (including `.print-only` sentences), iframe `title` stays (it is the YouTube video's own title), SVG `<text>` labels that are words (not move numbers), and HTML comments. Keep every `id`, class, `data-*`, `src`, SVG coordinates and paths identical. Japanese terms stay rōmaji + kanji spans.

- [ ] **Step 2: Verify structure**

Run:

```bash
for k in heian-shodan heian-nidan heian-sandan heian-yondan heian-godan; do
  diff <(grep -oE '(id|data-view|src)="[^"]*"' katas/$k.html) <(grep -oE '(id|data-view|src)="[^"]*"' katas/$k.en.html) && echo "$k ok"
done
python3 .githooks/check-i18n.py; echo "exit $?"
```

Expected: five `ok` lines; `check-i18n` prints nothing and `exit 0` (every twin now exists, labels/views/manifest in step).

- [ ] **Step 3: Verify in the browser, including drafts (Review Focus 5)**

Run:

```bash
node tests/cdp.mjs 'http://localhost:8765/en/#/heian-shodan/embusen' \
  "new Promise(r=>setTimeout(()=>r([document.title, [...document.querySelectorAll('#view img')].every(i=>i.complete&&i.naturalWidth>0), document.querySelector('.pager-next span').textContent]),2000))" \
  "location.hash='#/heian-nidan/presentation'; new Promise(r=>setTimeout(()=>r([document.querySelector('.draft-banner')?.textContent.slice(0,6), document.title]),1000))"
```

Expected: `Embusen · Heian Shodan · Kohai`, `true` (images load through `../img/`), `Next`; `["Draft:", "Presentation · Heian Nidan · Kohai"]` (on localhost; public-host hiding is unchanged code in `isAvailable`).

Screenshot the English embusen at desktop and phone width and read both images: `SHOT=$SCRATCH/en-embusen.png node tests/cdp.mjs 'http://localhost:8765/en/#/heian-shodan/embusen'` and the same with `WIDTH=390`. Expected: SVG labels readable, stacked mobile diagram shown at 390 px.

- [ ] **Step 4: Commit**

```bash
git add katas/*.en.html
git commit --no-verify -m "feat: English kata pages for Heian Shodan to Godan"
```

(`--no-verify`: no visible change on the French site; the English site is announced in Task 8.)

---

### Task 7: Language switch, first-visit redirect, hreflang

**Files:**
- Modify: `index.html`, `en/index.html`
- Modify: `assets/app.js`
- Modify: `assets/style.css`

**Interfaces:**
- Consumes: `LANG`, `store()` from app.js; both shells.
- Produces: `<a id="lang-link" class="lang-link">` in both top bars; `kohai-lang` in localStorage.

- [ ] **Step 1: Add hreflang and the language link to both shells**

In both `index.html` and `en/index.html`, after `<meta name="color-scheme" …>` add (the site is served at the domain root):

```html
<link rel="alternate" hreflang="fr" href="/">
<link rel="alternate" hreflang="en" href="/en/">
<link rel="alternate" hreflang="x-default" href="/">
```

In `index.html`, inside `<div class="tools">` as its first child:

```html
    <a id="lang-link" class="lang-link" href="en/" hreflang="en" lang="en" aria-label="English version">EN</a>
```

In `en/index.html`, same place:

```html
    <a id="lang-link" class="lang-link" href="../" hreflang="fr" lang="fr" aria-label="Version française">FR</a>
```

- [ ] **Step 2: First-visit redirect in `index.html` only**

Replace the inline theme `<script>` in `index.html` `<head>` with:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('kohai-theme');
      if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      // First visit only: an English browser goes to /en/. After that the URL decides (shared links keep their language).
      if (!localStorage.getItem('kohai-lang') && !/[?&]print=/.test(location.search)) {
        var langs = navigator.languages || [navigator.language || ''], lang = 'fr';
        for (var i = 0; i < langs.length; i++) {
          var p = String(langs[i]).slice(0, 2).toLowerCase();
          if (p === 'fr' || p === 'en') { lang = p; break; }
        }
        localStorage.setItem('kohai-lang', lang);
        if (lang === 'en') location.replace('en/' + location.hash);
      }
    } catch (e) {}
  })();
</script>
```

`en/index.html` keeps the theme-only script (no redirect from English).

- [ ] **Step 3: Keep the link on the same page, remember the choice**

In `assets/app.js`, in the web-app section after the theme block, add:

```js
  // Language link: the same page in the other language (both shells use the same routes)
  var langLink = document.getElementById('lang-link');
  function updateLangLink() {
    if (langLink) langLink.href = (LANG === 'fr' ? 'en/' : '../') + location.hash;
  }
  if (langLink) langLink.addEventListener('click', function () { store('kohai-lang', LANG === 'fr' ? 'en' : 'fr'); });
```

and call `updateLangLink();` as the first line of `route()`.

- [ ] **Step 4: Style the link**

In `assets/style.css`, next to the `.theme-switch` rules, add a rule that makes `.lang-link` match the theme buttons (same height, border, radius, font size, `color: var(--fg)`, `text-decoration: none`, `font-weight: 600`, padding `0 10px`, `display: inline-flex; align-items: center`). Copy the exact values from the existing `.theme-switch button` rule. In `assets/print.css`, add `.lang-link` to the hidden list on line 8: `.topbar, .toc-web, .screen-only, .video-frame, .pager, .eyebrow, .lang-link { display: none !important; }`.

- [ ] **Step 5: Verify the switch, with an anchor (Review Focus 1)**

Run:

```bash
node tests/cdp.mjs 'http://localhost:8765/#/heian-shodan/tutoriel' \
  "new Promise(r=>setTimeout(()=>{const id=document.querySelector('#view h3[id]').id;location.hash='#/heian-shodan/tutoriel/'+id;setTimeout(()=>r([id, document.getElementById('lang-link').getAttribute('href')]),800)},1200))" \
  "document.getElementById('lang-link').click(); new Promise(r=>setTimeout(()=>r([location.pathname, location.hash, document.documentElement.lang, Math.round(document.getElementById(location.hash.split('/').pop()).getBoundingClientRect().top)<200, localStorage.getItem('kohai-lang')]),2000))" \
  "document.getElementById('lang-link').getAttribute('href')"
```

Expected: `[<h3-id>, "en/#/heian-shodan/tutoriel/<h3-id>"]`; `["/en/", "#/heian-shodan/tutoriel/<h3-id>", "en", true, "en"]`; `"../#/heian-shodan/tutoriel/<h3-id>"`.

- [ ] **Step 6: Verify the redirect rules (Review Focus 2)**

Run each (each run uses a fresh profile, so storage starts empty; `LANGS` sets `navigator.languages`):

```bash
LANGS=en-CA,en node tests/cdp.mjs 'http://localhost:8765/#/lexique' "[location.pathname, location.hash, localStorage.getItem('kohai-lang')]"
LANGS=fr-CA,en node tests/cdp.mjs 'http://localhost:8765/#/lexique' "[location.pathname, localStorage.getItem('kohai-lang')]"
LANGS=en-CA node tests/cdp.mjs 'http://localhost:8765/?print=letter&noprint=1' "[location.pathname, location.search]"
LANGS=en-CA node tests/cdp.mjs 'http://localhost:8765/#/' "localStorage.setItem('kohai-lang','fr'); location.href='http://localhost:8765/#/lexique'; new Promise(r=>setTimeout(()=>r(location.pathname),1500))"
```

Expected: `["/en/","#/lexique","en"]`; `["/","fr"]`; `["/","?print=letter&noprint=1"]` (no redirect); `"/"` on the second visit (stored choice wins, no redirect).

Storage blocked: in the redirect script `localStorage` throws inside `try`, so no redirect happens; confirm by reading the code path (the whole block is inside `try { … } catch (e) {}`).

- [ ] **Step 7: Review and commit**

Run `/code-review medium` on `index.html`, `en/index.html`, `assets/app.js`, `assets/style.css`, then:

```bash
git add index.html en/index.html assets/app.js assets/style.css assets/print.css
git commit -m "feat: language switch, first-visit browser-language redirect, hreflang"
```

(No content folder touched, so the hook does not ask for a changelog entry.)

---

### Task 8: Wire the parity check, docs, announcement, full verification

**Files:**
- Modify: `.githooks/pre-commit`
- Modify: `AGENTS.md`
- Modify: `shared/changelog.html`, `shared/changelog.en.html`

**Interfaces:**
- Consumes: `.githooks/check-i18n.py` (Task 1); all English files (Tasks 3–6).

- [ ] **Step 1: Replace the pre-commit hook body**

`.githooks/pre-commit`:

```bash
#!/bin/bash
# Both languages are required: see .githooks/check-i18n.py (twins, labels, views, katas.json, both changelogs).
# Skip once for a commit with no visible change: git commit --no-verify
exec python3 "$(dirname "$0")/check-i18n.py" --staged
```

- [ ] **Step 2: Update AGENTS.md**

Keep the file's style (rules only, nothing private). Changes:
- “What the project is”: “A static, bilingual (French at `/`, English at `/en/`) study site…”.
- Layout: add `en/index.html — English shell (data-root="../"); same app.js`, the `.en.html` twin rule, and `tests/` (`test_check_i18n.py`, `cdp.mjs` headless Chrome driver, Node 22+).
- New section “Two languages (required)”: every `.html` under `katas/` and `shared/` has an `.en.html` twin; twins keep the French ids (`data-view`, `h2`/`h3` ids, `data-credits`, `data-text`); `katas.json` text fields are `{fr, en}`; a change to one shell is made in the other; both changelogs get an entry; `.githooks/check-i18n.py` enforces this (run it by hand anytime).
- Changelog section: entries in both `changelog.html` (French) and `changelog.en.html` (English, date as `October 8, 2026`).
- Writing conventions: add the English rules (Canadian spelling, no space before punctuation, “ ” quotes, lexique pronunciation for English speakers).
- Router line: routes are identical in both languages.
- Before committing: “Check both `/` and `/en/`; print both sizes in both languages; run `python3 -m unittest tests/test_check_i18n.py`.”

- [ ] **Step 3: Announce the English version in both changelogs**

- FR top entry: `<li><time datetime="2026-10-08">8 octobre 2026</time> Le site existe maintenant en anglais&nbsp;: bouton EN en haut à droite.</li>`
- EN top entry: `<li><time datetime="2026-10-08">October 8, 2026</time> The site is now available in English: FR button at the top right to switch back to French.</li>`

- [ ] **Step 4: Full verification (Review Focus 4)**

Run each and compare with expectations:

```bash
python3 -m unittest tests/test_check_i18n.py -v          # all ok
python3 .githooks/check-i18n.py; echo "exit $?"          # exit 0
for lang in '' 'en/'; do for size in letter a4; do
  node tests/cdp.mjs "http://localhost:8765/${lang}?print=$size&kata=heian-shodan&noprint=1" \
    "new Promise(r=>{const t=setInterval(()=>{const d=document.documentElement.dataset.pagedDone;if(d){clearInterval(t);r(d)}},300)})" \
    "[document.title, document.querySelector('.toc-print h2').textContent, [...document.querySelectorAll('[data-kata-kiai]')].map(e=>e.textContent)[0], (()=>{const h=document.getElementById('embusen');const p=h&&h.closest('.pagedjs_page');return p?[...p.querySelectorAll('svg')].length:0})()]"
done; done
node tests/cdp.mjs 'http://localhost:8765/en/?print=letter&noprint=1' \
  "new Promise(r=>{const t=setInterval(()=>{const d=document.documentElement.dataset.pagedDone;if(d){clearInterval(t);r(d)}},300)})" "document.title"
```

Expected: French print titles `Heian Shodan · Kohai (impression)`, `Table des matières`, `Les deux Kiai (mouvements 9 et 17)`; English `Heian Shodan · Kohai (print)`, `Contents`, `The two Kiai (moves 9 and 17)`; the embusen page contains its diagram SVGs in all four runs; page count of the French runs equals the Task 2 baseline. English lexique print title `Karateka’s vocabulary · Kohai (print)`.

Then check the embusen visually in both sizes and languages: `SHOT=$SCRATCH/print-en-a4.png node tests/cdp.mjs 'http://localhost:8765/en/?print=a4&kata=heian-shodan&noprint=1' "new Promise(r=>{const t=setInterval(()=>{if(document.documentElement.dataset.pagedDone){clearInterval(t);document.getElementById('embusen').scrollIntoView();r(1)}},300)})"` (and `letter`, and French). Read the images: the whole embusen section (heading, diagrams, legend) is on one page. If the English version spills over, shorten the English legend text in `katas/heian-shodan.en.html` rather than changing layout.

Finally, the hook itself: stage a throwaway edit to `shared/lexique.html` only (`echo >> shared/lexique.html && git add shared/lexique.html && git commit -m test`), expect the commit to be refused with two `content changed: add a new entry` lines, then `git restore --staged shared/lexique.html && git checkout shared/lexique.html`.

- [ ] **Step 5: Review and commit**

Run `/code-review low` on `.githooks/pre-commit` (AGENTS.md and changelogs are doc/content), then:

```bash
git add .githooks/pre-commit AGENTS.md shared/changelog.html shared/changelog.en.html
git commit -m "feat: enforce both languages at commit; announce the English site"
```

The hook runs `check-i18n.py --staged` on this very commit; it must pass.
