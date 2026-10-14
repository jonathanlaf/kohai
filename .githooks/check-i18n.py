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
