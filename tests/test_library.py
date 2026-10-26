import base64
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import shutil
import unittest
import zipfile

module_path = Path(__file__).resolve().parents[1] / 'scripts/library.py'
spec = importlib.util.spec_from_file_location('publisher', module_path)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class LibraryTests(unittest.TestCase):
    def test_platform_return_preserves_source_and_does_not_parse_script_as_body_end(self):
        root=module_path.parents[1]
        original='<html><head></head><body><script>const example="</body>";</script><p>Work</p></body></html>'
        fragment=(root/'templates/work-bridge.html').read_text()
        result=p.with_work_bridge(original,root)
        self.assertEqual(result.replace(fragment,''),original)
        self.assertTrue(result.endswith(fragment+'</body></html>'))
        self.assertEqual(p.with_work_bridge(result,root),result)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config = {'site_url': 'https://library.example', 'assets_url': 'https://assets.example'}
        self.reg = {'revision': 'test', 'works': [], 'assets': []}
        (self.root / 'templates').mkdir()
        shutil.copytree(module_path.parents[1] / 'templates', self.root / 'templates', dirs_exist_ok=True)
        shutil.copy2(module_path.parents[1] / 'taxonomy.json', self.root / 'taxonomy.json')
        self.icon = self.root / 'templates/icons/suzhou-museum.svg'
        self.source = self.root / 'input'
        self.source.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def publish(self, slug='first', **kwargs):
        kwargs.setdefault('category', 'humanities/museums')
        kwargs.setdefault('icon', self.icon)
        return p.prepare_work(self.root, self.reg, self.config, self.source, slug, **kwargs)

    def test_add_and_update_preserve_prior_work_and_assets(self):
        (self.source / 'index.html').write_text('<title>第一份</title><img src="one.png">')
        (self.source / 'one.png').write_bytes(b'original-image')
        first = self.publish()
        self.publish('second', title='第二份')
        (self.source / 'index.html').write_text('<title>更新</title><img src="one.png"><p>updated</p>')
        updated = self.publish(update=True, title='新标题')
        self.assertEqual(len(self.reg['works']), 2)
        self.assertEqual(len(self.reg['assets']), 2)
        self.assertEqual(first['url'], updated['url'])
        self.assertEqual((self.root / first['snapshot'] / 'index.html').read_text().count('updated'), 0)
        report = p.build(self.root, self.reg, self.config)
        catalog = json.loads((Path(report['site']) / 'catalog.json').read_text())
        self.assertEqual({w['id'] for w in catalog['items']}, {'first', 'second'})
        self.assertNotIn('snapshot', catalog['items'][0])
        self.assertTrue((Path(report['media']) / p.urllib.parse.unquote(self.reg['assets'][0]['public_path'])).exists())

    def test_css_srcset_and_embedded_image_are_independent(self):
        (self.source / 'one.png').write_bytes(b'image')
        (self.source / 'style.css').write_text('body{background:url(one.png)}')
        inline = base64.b64encode(b'embedded').decode()
        (self.source / 'index.html').write_text('<title>Test</title><link href="style.css"><img srcset="one.png 1x, one.png 2x"><img src="data:image/png;base64,' + inline + '">')
        w = self.publish()
        text = (self.root / w['snapshot'] / 'index.html').read_text()
        css = (self.root / w['snapshot'] / 'style.css').read_text()
        self.assertNotIn('data:image', text)
        self.assertIn('https://assets.example/files/', css)
        self.assertEqual(len(self.reg['assets']), 3)
        self.assertIn(' 1x, https://assets.example/', text)
        self.assertNotIn('srcset="one.png', text)

    def test_single_html_does_not_publish_unrelated_parent_files(self):
        (self.source / 'one.png').write_bytes(b'image')
        (self.source / 'private.json').write_text('{"private":"not-a-dependency"}')
        page = self.source / 'report.html'
        page.write_text('<title>Report</title><img src="one.png">')
        w = p.prepare_work(self.root, self.reg, self.config, page, 'report', category='humanities/museums', icon=self.icon)
        self.assertEqual(w['files'], ['index.html'])
        self.assertEqual(len(self.reg['assets']), 2)
        self.assertFalse((self.root / w['snapshot'] / 'private.json').exists())

    def test_missing_reference_and_escape_fail(self):
        (self.source / 'index.html').write_text('<img src="missing.png">')
        with self.assertRaisesRegex(p.PublishError, '缺失'):
            self.publish()
        (self.source / 'index.html').write_text('<img src="../private.png">')
        with self.assertRaisesRegex(p.PublishError, '越出'):
            self.publish()
        self.assertEqual(len(self.reg['works']), 0)

    def test_requires_explicit_update(self):
        (self.source / 'index.html').write_text('<title>Test</title>')
        self.publish()
        with self.assertRaisesRegex(p.PublishError, '--update'):
            self.publish()

    def test_asset_dedup_and_original_bytes(self):
        a = p.add_blob(self.root, self.reg, self.config, b'original', '原图.png', '素材')
        b = p.add_blob(self.root, self.reg, self.config, b'original', 'another.png', '其他')
        self.assertEqual(a['url'], b['url'])
        self.assertEqual((self.root / a['local']).read_bytes(), b'original')
        self.assertEqual(len(self.reg['assets']), 1)

    def test_oversize_fails_before_upload(self):
        big = self.source / 'big.mp4'
        with big.open('wb') as f:
            f.truncate(p.LIMIT + 1)
        with self.assertRaisesRegex(p.PublishError, '25 MiB'):
            p.safe_file(big, self.source)

    def test_zip_traversal_rejected_and_normal_zip_works(self):
        archive = self.root / 'bad.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('../private.html', 'escape')
        with self.assertRaisesRegex(p.PublishError, '越界'):
            p.prepare_work(self.root, self.reg, self.config, archive, 'bad', category='humanities/museums', icon=self.icon)
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('site/index.html', '<title>ZIP works</title>')
        w = p.prepare_work(self.root, self.reg, self.config, archive, 'zip', category='humanities/museums', icon=self.icon)
        self.assertEqual(w['title'], 'ZIP works')

    def test_public_materials_do_not_include_local_paths(self):
        (self.source / 'index.html').write_text('<title>Test</title>')
        self.publish()
        p.add_blob(self.root, self.reg, self.config, b'%PDF', '讲义.pdf', '文档')
        report = p.build(self.root, self.reg, self.config)
        public = (Path(report['site']) / 'materials.json').read_text()
        self.assertNotIn('"local"', public)
        self.assertNotIn(str(self.root), public)
        self.assertTrue((Path(report['site']) / 'materials/index.html').exists())
        self.assertTrue((Path(report['site']) / 'publish/index.html').exists())

    def test_requires_valid_leaf_category_and_new_work_icon(self):
        (self.source / 'index.html').write_text('<title>Test</title>')
        for category in [None, 'humanities', '文化与旅行', 'unknown/missing']:
            with self.assertRaisesRegex(p.PublishError, '二级分类'):
                p.prepare_work(self.root, self.reg, self.config, self.source, 'new', category=category, icon=self.icon)
        with self.assertRaisesRegex(p.PublishError, '专属标签页图标'):
            self.publish(icon=None)
        self.assertEqual(self.reg['works'], [])
        self.assertEqual(self.reg['assets'], [])

    def test_icons_are_uploaded_injected_in_every_html_and_reused_on_update(self):
        (self.source / 'index.html').write_text('<html><head><title>Test</title><link rel="shortcut icon" href="missing.ico"></head><body><a href="detail.html">详情</a><script>const original = 42;</script></body></html>')
        (self.source / 'detail.html').write_text('<html><head><title>Detail</title></head><body>详情</body></html>')
        work = self.publish(content_format='guide')
        self.assertEqual(work['category_path'], ['人文与艺术', '博物馆与文物'])
        self.assertEqual(work['format'], 'guide')
        for rel in work['files']:
            text = (self.root / work['snapshot'] / rel).read_text()
            self.assertEqual(text.count('rel="icon"'), 1)
            self.assertIn(work['icon'], text)
            self.assertNotIn('missing.ico', text)
        self.assertIn('const original = 42;', (self.root / work['snapshot'] / 'index.html').read_text())
        updated = self.publish(update=True, icon=None)
        self.assertEqual(work['icon'], updated['icon'])
        self.assertEqual(len(self.reg['assets']), 1)
        report = p.build(self.root, self.reg, self.config)
        directory = (Path(report['site']) / 'index.html').read_text()
        self.assertIn('data-category="humanities/museums"', directory)
        self.assertIn('data-category-id="humanities/museums"', directory)
        self.assertIn('id="format-filter"', directory)
        self.assertIn(work['icon'], directory)
        self.assertIn('rel="icon"', (Path(report['site']) / 'materials/index.html').read_text())
        self.assertEqual(len(json.loads((Path(report['site']) / 'categories.json').read_text())['groups']), 8)

    def test_invalid_icon_fails_and_build_rejects_incomplete_registration(self):
        (self.source / 'index.html').write_text('<title>Test</title>')
        bad = self.root / 'bad.svg'
        for data in ['not an SVG', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><script>alert(1)</script></svg>', '<svg xmlns="http://www.w3.org/2000/svg"/>']:
            bad.write_text(data)
            with self.assertRaisesRegex(p.PublishError, '图标格式无效'):
                self.publish(icon=bad)
        self.publish()
        self.reg['works'][0].pop('icon_asset_id')
        with self.assertRaisesRegex(p.PublishError, '已上传图标'):
            p.build(self.root, self.reg, self.config)

    def test_favicon_injection_preserves_scripts_comments_and_doctype(self):
        script = '''<script>const template = '<link rel="icon" href="inside-script.svg">'; const end = '</head>';</script>'''
        comment = '<!-- <link rel="icon" href="inside-comment.svg"> -->'
        source = '<!doctype html><html><head><title>Test</title>' + script + comment + '<link rel="shortcut icon" href="old.ico"></head><body>Content</body></html>'
        result = p.with_icon(source, 'https://assets.example/new.svg')
        self.assertTrue(result.startswith('<!doctype html>'))
        self.assertIn(script, result)
        self.assertIn(comment, result)
        self.assertNotIn('href="old.ico"', result)
        self.assertIn('<link rel="icon" href="https://assets.example/new.svg"></head>', result)
        self.assertEqual(p.with_icon(result, 'https://assets.example/new.svg'), result)
        self.assertTrue(p.with_icon('<!doctype html><title>Fragment</title>', 'icon.svg').startswith('<!doctype html><head>'))


if __name__ == '__main__':
    unittest.main()
