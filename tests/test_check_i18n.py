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

    def test_view_ids_bare_attribute(self):
        self.assertEqual(ci.view_ids('<section data-view><section data-view="a">'), ['', 'a'])

    def test_manifest_null_language(self):
        bad = json.loads(json.dumps(MANIFEST))
        bad['katas'][0]['belt'] = {'fr': 'Blanche', 'en': None}
        self.assertEqual(len(ci.manifest_problems(bad)), 1)

    def test_manifest_not_an_object(self):
        self.assertEqual(len(ci.manifest_problems([])), 1)

    def test_manifest_missing_language(self):
        bad = json.loads(json.dumps(MANIFEST))
        bad['katas'][0]['meaning'] = {'fr': 'Esprit paisible', 'en': ''}
        bad['groups'][0]['name'] = 'Heian'
        self.assertEqual(len(ci.manifest_problems(bad)), 2)

    def test_first_entry(self):
        html = '<!-- x -->\n<ol>\n  <li><time datetime="2026-10-08">8</time> Un.</li>\n  <li>Deux</li>\n</ol>'
        self.assertEqual(ci.first_entry(html), '<li><time datetime="2026-10-08">8</time> Un.</li>')
        self.assertIsNone(ci.first_entry('<ol></ol>'))


ISOLATED = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')


def git(cwd, *args):
    # Isolated from the user's global git config (signing, hooksPath…)
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True, env=ISOLATED).stdout


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

    def new_changelogs(self):
        write(self.root, 'shared/changelog.html', CHANGELOG.format('Deux'))
        write(self.root, 'shared/changelog.en.html', CHANGELOG.format('Two'))

    def test_duplicate_label_fails(self):
        write(self.root, 'shared/libelles.en.html', '<span data-text="a">A</span><span data-text="a">B</span>')
        self.new_changelogs()
        git(self.root, 'add', '-A')
        self.assertTrue(any('libelles' in p for p in ci.run(staged=True)))

    def test_shared_view_mismatch_fails(self):
        write(self.root, 'shared/kata.html', '<section data-view="esprit"></section><section data-view="erreurs"></section>')
        write(self.root, 'shared/kata.en.html', '<section data-view="esprit"></section><section data-view="mistakes"></section>')
        self.new_changelogs()
        git(self.root, 'add', '-A')
        self.assertTrue(any('data-view' in p for p in ci.run(staged=True)))

    def test_non_ascii_image_needs_changelog(self):
        write(self.root, 'img/heian-shodan/mouvement-é.png', 'x')
        git(self.root, 'add', '-A')
        self.assertEqual(len(ci.run(staged=True)), 2)

    def test_working_tree_from_subfolder(self):
        write(self.root, 'shared/lexique.html', '<section></section>')  # not staged: working tree sees it
        os.chdir(os.path.join(self.root, 'katas'))
        self.assertTrue(any('lexique.en.html' in p for p in ci.run(staged=False)))

    def test_outside_git_reports_problem(self):
        with tempfile.TemporaryDirectory() as empty:
            os.chdir(empty)
            problems = ci.run(staged=True)
        self.assertEqual(len(problems), 1)
        self.assertIn('git', problems[0])

    def test_unstaged_files_ignored(self):
        write(self.root, 'shared/lexique.html', '<section></section>')  # not added
        self.assertEqual(ci.run(staged=True), [])


if __name__ == '__main__':
    unittest.main()
