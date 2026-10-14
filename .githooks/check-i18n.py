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
VOCABULARY = 'shared/lexique.json'
SLUGS = 'shared/slugs.json'
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
    return re.findall(r'<section\b[^>]*\bdata-view(?:="([^"]*)")?', strip_comments(html))


def both(v):
    return isinstance(v, dict) and all(isinstance(v.get(l), str) and v[l].strip() for l in ('fr', 'en'))


def text(v):
    return isinstance(v, str) and v.strip() != ''


def word_problems(w):
    if not isinstance(w, dict):
        return ['{} has a word that is not an object'.format(VOCABULARY)]
    problems = ['{} word {} needs a non-empty "{}"'.format(VOCABULARY, w.get('jp'), f) for f in ('jp', 'kanji') if not text(w.get(f))]
    return problems + ['{} word {} "{}" needs non-empty "fr" and "en"'.format(VOCABULARY, w.get('jp'), f)
                       for f in ('pron', 'meaning') if not both(w.get(f))]


def section_problems(sec):
    if not isinstance(sec, dict):
        return ['{} has a section that is not an object'.format(VOCABULARY)]
    name = sec.get('id')
    problems = ['{} section {} needs a non-empty "{}"'.format(VOCABULARY, name, f) for f in ('id', 'kanji') if not text(sec.get(f))]
    problems += ['{} section {} "{}" needs non-empty "fr" and "en"'.format(VOCABULARY, name, f)
                 for f in ('title',) + (('note',) if 'note' in sec else ()) if not both(sec.get(f))]
    words = sec.get('words')
    if not isinstance(words, list) or not words:
        return problems + ['{} section {} needs a non-empty "words" list'.format(VOCABULARY, name)]
    return problems + [p for w in words for p in word_problems(w)]


def vocabulary_problems(data):
    """shared/lexique.json: unique section ids; id, kanji, jp and French + English text everywhere a reader sees it."""
    if not isinstance(data, dict) or not isinstance(data.get('sections'), list):
        return [VOCABULARY + ' must be an object with a "sections" list']
    problems = [p for sec in data['sections'] for p in section_problems(sec)]
    ids = [sec.get('id') for sec in data['sections'] if isinstance(sec, dict)]
    return problems + ['{} section id {} appears more than once'.format(VOCABULARY, i)
                       for i in sorted({i for i in ids if ids.count(i) > 1}, key=str)]


SHAPES = ('zenkutsu', 'kokutsu', 'kosa', 'kiba', 'other')


def step_problems(name, step):
    """One row of a kata tutorial (katas/<id>.moves.json): a numbered move, or a Rei / Yoi / Yame row with its own head."""
    if not isinstance(step, dict):
        return ['{} has a step that is not an object'.format(name)]
    where = '{} step {}'.format(name, step.get('n', step.get('jp', '?')))
    problems = ['{} "{}" needs non-empty "fr" and "en"'.format(where, f) for f in ('tr', 'stance', 'move') if not both(step.get(f))]
    problems += ['{} "{}" needs non-empty "fr" and "en"'.format(where, f) for f in ('head', 'alt', 'badges', 'note', 'target')
                 if f in step and not both(step[f])]
    if 'jp' in step and not (text(step['jp']) or both(step['jp'])):
        problems.append(where + ' "jp" needs a name, or non-empty "fr" and "en"')
    if 'n' in step:
        if step.get('shape') not in SHAPES:
            problems.append('{} "shape" must be one of {}'.format(where, ', '.join(SHAPES)))
        problems += ['{} needs a non-empty "{}"'.format(where, f) for f in ('count', 'countKanji') if not text(step.get(f))]
    elif not both(step.get('head')):
        problems.append(where + ' needs a number "n" or a "head"')
    if 'lvl' in step and 'target' not in step:
        problems.append(where + ' has a "lvl" but no "target"')
    return problems


def moves_problems(name, data, kata=None):
    """A kata's tutorial: valid steps, moves numbered 1 to N, and its count and Kiai as katas.json says."""
    if not isinstance(data, dict) or not isinstance(data.get('steps'), list):
        return [name + ' must be an object with a "steps" list']
    problems = [p for step in data['steps'] for p in step_problems(name, step)]
    numbered = [s for s in data['steps'] if isinstance(s, dict) and 'n' in s]
    nums = [s['n'] for s in numbered]
    if nums != list(range(1, len(nums) + 1)):
        problems.append('{} moves must be numbered 1 to {} in order'.format(name, len(nums)))
    if kata:
        if kata.get('moves') is not None and kata['moves'] != len(nums):
            problems.append('{} has {} moves, katas.json says {}'.format(name, len(nums), kata['moves']))
        kiai = [s['n'] for s in numbered if s.get('kiai')]
        if kata.get('kiai') is not None and kata['kiai'] != kiai:
            problems.append('{} has Kiai on {}, katas.json says {}'.format(name, kiai, kata['kiai']))
    return problems


def tutorial_problems(read):
    """Every written kata in katas.json needs its katas/<id>.moves.json beside its file."""
    raw = read(MANIFEST)
    try:
        katas = json.loads(raw).get('katas', []) if raw else []
    except (ValueError, AttributeError):
        return []  # already reported by the manifest check
    problems = []
    for kata in katas:
        if not isinstance(kata, dict) or not kata.get('file'):
            continue
        name = re.sub(r'\.html$', '.moves.json', kata['file'])
        body = read(name)
        if body is None:
            problems.append('{} has no {}'.format(kata.get('id'), name))
            continue
        try:
            problems += moves_problems(name, json.loads(body), kata)
        except ValueError as e:
            problems.append('{} is not valid JSON: {}'.format(name, e))
    return problems


def slug_problems(data, live=frozenset()):
    """shared/slugs.json: clean URL words; one English word per French word; an English word never also a French word
    with another meaning, and an old id never leading somewhere else than its English twin."""
    if not isinstance(data, dict) or not all(isinstance(data.get(k), dict) for k in ('en', 'aliases')):
        return [SLUGS + ' must be an object with "en" and "aliases" objects']
    en, aliases = data['en'], data['aliases']
    problems = ['{} "{}": "{}" is not a URL word (a-z, 0-9, -)'.format(SLUGS, k, v) for k, v in list(en.items()) + list(aliases.items())
                if not (isinstance(v, str) and re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', v))]
    values = list(en.values())
    problems += ['{} English word "{}" is used for more than one French word'.format(SLUGS, v) for v in sorted({v for v in values if values.count(v) > 1}, key=str)]
    back = {v: k for k, v in en.items()}
    problems += ['{} English word "{}" (for "{}") is also a French word'.format(SLUGS, v, k) for k, v in en.items()
                 if v != k and v in en and en[v] != v]
    problems += ['{} old id "{}" leads to "{}", but the English word "{}" means "{}"'.format(SLUGS, k, v, k, back[k])
                 for k, v in aliases.items() if k in back and back[k] != v]
    # An old id is no longer in use, and leads straight to a current one (no chain, no loop, no English word)
    problems += ['{} old id "{}" is a current id: it would send that page elsewhere'.format(SLUGS, k) for k in aliases if k in live]
    problems += ['{} old id "{}" leads to "{}", which is itself an old id or an English word'.format(SLUGS, k, v)
                 for k, v in aliases.items() if v in aliases or (v in back and back[v] != v)]
    return problems


def live_ids(files, read):
    """Every id a URL can name today: views and ids of the French pages, vocabulary sections and kata ids."""
    ids = set()
    for f in files:
        if f.startswith(TWINNED) and f.endswith('.html') and not f.endswith('.en.html'):
            ids.update(re.findall(r'\b(?:id|data-view)="([^"]+)"', read(f) or ''))
    for path, key in ((VOCABULARY, 'sections'), (MANIFEST, 'katas')):
        try:
            ids.update(x.get('id') for x in json.loads(read(path) or '{}').get(key, []) if isinstance(x, dict))
        except (ValueError, AttributeError):
            pass
    return ids


def manifest_problems(data):
    if not isinstance(data, dict):
        return [MANIFEST + ' must be a JSON object']
    problems = []
    for kind, fields in TRANSLATED.items():
        for item in data.get(kind, []):
            for field in fields:
                v = item.get(field)
                if not both(v):
                    problems.append('{} {} "{}" needs non-empty "fr" and "en"'.format(MANIFEST, item.get('id'), field))
    return problems


def first_entry(html):
    m = re.search(r'^[ \t]*(<li[ >].*)$', strip_comments(html), flags=re.M)
    return m.group(1).strip() if m else None


def git(*args):
    r = subprocess.run(['git', *args], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def paths(out):
    return [p for p in (out or '').split('\0') if p]  # -z output: no quoting of non-ASCII names


def reader(staged):
    """The files to check and how to read one: the git index with --staged, else the working tree."""
    if staged:
        return paths(git('ls-files', '-z')), lambda p: git('show', ':' + p)

    def read(p):
        try:
            with open(p, encoding='utf-8') as f:
                return f.read()
        except OSError:
            return None
    files = [os.path.relpath(os.path.join(d, f)).replace(os.sep, '/')
             for top in TWINNED for d, _, fs in os.walk(top) for f in fs]
    return files, read


def label_problems(read):
    problems = []
    for fr in LABEL_FILES:
        a, b = read(fr), read(twin(fr))
        if a is None or b is None:
            continue
        ka, kb = label_keys(a), label_keys(b)
        for key in sorted(set(ka) ^ set(kb)):
            problems.append('data-text "{}" is in {} only'.format(key, fr if key in ka else twin(fr)))
        for name, keys in ((fr, ka), (twin(fr), kb)):
            for key in sorted({k for k in keys if keys.count(k) > 1}):
                problems.append('data-text "{}" appears more than once in {}'.format(key, name))
    return problems


def view_problems(files, read):
    problems = []
    for fr in files:
        if fr.startswith(TWINNED) and fr.endswith('.html') and not fr.endswith('.en.html') and twin(fr) in files:
            a, b = read(fr), read(twin(fr))
            if a is not None and b is not None and view_ids(a) != view_ids(b):
                problems.append('{} and {} have different data-view ids: {} / {}'.format(fr, twin(fr), view_ids(a), view_ids(b)))
    return problems


def json_file_problems(read, path, check):
    raw = read(path)
    if raw is None:
        return []
    try:
        return check(json.loads(raw))
    except ValueError as e:
        return ['{} is not valid JSON: {}'.format(path, e)]


def changelog_problems(read):
    """A staged content change needs a new entry at the top of both changelogs."""
    changed = paths(git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRD'))
    if not [p for p in changed if p.startswith(CONTENT) and p not in CHANGELOGS]:
        return []
    problems = []
    for log in CHANGELOGS:
        entry = first_entry(read(log) or '')
        old = git('show', 'HEAD:' + log)
        if not entry:
            problems.append('no <li> entry found in ' + log)
        elif old is not None and entry in [l.strip() for l in old.splitlines()]:
            problems.append('content changed: add a new entry at the top of ' + log)
    return problems


def run(staged):
    top = git('rev-parse', '--show-toplevel')
    if top:
        os.chdir(top.strip())
    elif staged:
        return ['--staged needs a git work tree (git rev-parse failed)']
    files, read = reader(staged)
    problems = pair_problems([f for f in files if f.startswith(TWINNED)])
    problems += label_problems(read) + view_problems(files, read)
    problems += json_file_problems(read, MANIFEST, manifest_problems) + json_file_problems(read, VOCABULARY, vocabulary_problems)
    problems += tutorial_problems(read) + json_file_problems(read, SLUGS, lambda d: slug_problems(d, live_ids(files, read)))
    if staged:
        problems += changelog_problems(read)
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
