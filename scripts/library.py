#!/usr/bin/env python3
"""Local, owner-authorized publisher for the existing Cloudflare Pages library."""
import argparse
import base64
import copy
from datetime import datetime
import fcntl
import hashlib
import html
from html.parser import HTMLParser
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 25 * 1024 * 1024
CODE = {'.html', '.htm', '.css', '.js', '.mjs', '.json', '.txt', '.xml', '.webmanifest', '.map', '.wasm'}
MEDIA = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.ico', '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.pdf', '.zip', '.woff', '.woff2', '.ttf', '.otf', '.csv', '.xlsx', '.docx', '.pptx', '.glb', '.gltf', '.vtt', '.srt'}
ATTR = re.compile(r'''\b(src|href|poster|data-src|srcset|style)\s*=\s*(["'])(.*?)\2''', re.I | re.S)
CSSURL = re.compile(r'''url\(\s*(["']?)(.*?)\1\s*\)''', re.I)


class PublishError(Exception):
    pass


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    tmp.replace(path)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def today():
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()


def escaped(s):
    return html.escape(str(s), quote=True)


FORMATS = {'guide': '图文导览', 'article': '文章', 'report': '研究报告', 'tutorial': '教程', 'tool': '交互工具', 'visualization': '可视化', 'portfolio': '作品集'}


def taxonomy(root):
    return read_json(root / 'taxonomy.json')


def category_info(root, category):
    for group in taxonomy(root)['groups']:
        for leaf in group['children']:
            if category == group['id'] + '/' + leaf['id']:
                return [group['name'], leaf['name']]
    raise PublishError('必须选择有效的二级分类 ID；运行 commonplace categories 查看，例如 humanities/museums。')


def validate_icon(path):
    if not path.is_file() or path.suffix.lower() not in {'.svg', '.png', '.ico'}:
        raise PublishError('作品图标需要本地 SVG、PNG 或 ICO 文件，请通过 --icon 提供。')
    data = path.read_bytes()
    if len(data) > 1024 * 1024:
        raise PublishError('标签页图标应不超过 1 MiB。')
    valid = False
    if path.suffix.lower() == '.svg':
        try:
            node = ET.fromstring(data)
            valid = node.tag == '{http://www.w3.org/2000/svg}svg' and ('viewBox' in node.attrib or {'width', 'height'} <= node.attrib.keys())
            for el in node.iter():
                if el.tag.split('}')[-1].lower() in {'script', 'foreignobject', 'image'}:
                    valid = False
                if any(k.lower().startswith('on') or ('href' in k.lower() and not v.startswith('#')) for k, v in el.attrib.items()):
                    valid = False
            if re.search(rb'@import|url\(\s*["\']?(?!#)', data, re.I):
                valid = False
        except ET.ParseError:
            pass
    elif path.suffix.lower() == '.png':
        valid = len(data) >= 33 and data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR' and 0 < int.from_bytes(data[16:20], 'big') <= 1024 and 0 < int.from_bytes(data[20:24], 'big') <= 1024
    else:
        valid = len(data) >= 22 and data[:4] == b'\x00\x00\x01\x00' and int.from_bytes(data[4:6], 'little') > 0
    if not valid:
        raise PublishError('图标格式无效；SVG 需为自包含矢量图，PNG/ICO 需为有效图像。')
    return data


def with_icon(text, url):
    # Record source offsets: never rewrite scripts, comments or page content.
    offsets = [0]
    offsets.extend(m.end() for m in re.finditer(r'\n', text))
    class Icons(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.remove, self.head_end, self.head_start, self.html_start, self.decl_end = [], None, None, None, None
        def position(self):
            line, col = self.getpos()
            return offsets[line - 1] + col
        def handle_starttag(self, tag, attrs):
            raw = self.get_starttag_text()
            start = self.position()
            if tag == 'link' and set((dict(attrs).get('rel') or '').lower().split()) & {'icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'}:
                self.remove.append((start, start + len(raw), ''))
            if tag == 'head' and self.head_start is None:
                self.head_start = start + len(raw)
            if tag == 'html' and self.html_start is None:
                self.html_start = start + len(raw)
        def handle_startendtag(self, tag, attrs):
            self.handle_starttag(tag, attrs)
        def handle_endtag(self, tag):
            if tag == 'head' and self.head_end is None:
                self.head_end = self.position()
        def handle_decl(self, decl):
            self.decl_end = text.find('>', self.position()) + 1
    parser = Icons()
    parser.feed(text)
    link = '<link rel="icon" href="' + escaped(url) + '">'
    insert = parser.head_end if parser.head_end is not None else parser.head_start
    if insert is None:
        insert = parser.html_start or parser.decl_end or 0
        link = '<head>' + link + '</head>'
    edits = parser.remove + [(insert, insert, link)]
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    return text


def with_work_bridge(text, root):
    """Add only the child-to-viewer bridge, preserving original work markup."""
    fragment = (root / 'templates/work-bridge.html').read_text()
    if fragment in text:
        return text
    offsets = [0] + [m.end() for m in re.finditer(r'\n', text)]
    class End(HTMLParser):
        insert = None
        def handle_endtag(self, tag):
            if tag == 'body' and self.insert is None:
                line, col = self.getpos()
                self.insert = offsets[line - 1] + col
    parser = End(convert_charrefs=False)
    parser.feed(text)
    insert = parser.insert if parser.insert is not None else len(text)
    return text[:insert] + fragment + text[insert:]


def work_viewer(root, original, icon, source, public_root, raw_root, entry):
    class Title(HTMLParser):
        inside = False
        parts = []
        def handle_starttag(self, tag, attrs):
            if tag == 'title':
                self.inside = True
        def handle_endtag(self, tag):
            if tag == 'title':
                self.inside = False
        def handle_data(self, data):
            if self.inside:
                self.parts.append(data)
    parser = Title()
    parser.parts = []
    parser.feed(original)
    title = ''.join(parser.parts).strip() or 'TexoPub 作品'
    values = {'TITLE': escaped(title), 'ICON': escaped(icon), 'SOURCE': escaped(source),
              # These are the existing owner's static pages, already trusted at the
              # main origin. Keep their storage and interactions; cloud uploads use
              # an opaque-origin sandbox without allow-same-origin instead.
              'SANDBOX': 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads',
              'CONFIG': json.dumps({'publicRoot': public_root, 'rawRoot': raw_root, 'entry': entry}, ensure_ascii=False).replace('<', '\\u003c')}
    return re.sub(r'\{\{(TITLE|ICON|SOURCE|SANDBOX|CONFIG)\}\}', lambda m: values[m[1]], (root / 'templates/work-viewer.html').read_text())


def remote_bytes(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'CommonplacePublisher/1.0', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def clean_slug(value):
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', value or ''):
        raise PublishError('slug 只能使用小写英文字母、数字和连字符，例如 suzhou-museum。')
    return value


def safe_file(path, base):
    path = path.resolve()
    if not path.is_relative_to(base.resolve()):
        raise PublishError('本地引用超出了发布文件夹：' + path.name)
    if any(part.startswith('.') or part in {'node_modules', '__pycache__'} for part in path.relative_to(base.resolve()).parts):
        raise PublishError('不能发布隐藏文件或依赖目录：' + path.name)
    if path.name.lower() in {'_worker.js', '_headers', '_redirects', 'wrangler.json', 'wrangler.jsonc', 'package-lock.json', 'package.json'}:
        raise PublishError('这是部署或依赖配置，不能作为普通网页发布：' + path.name)
    if path.suffix.lower() not in CODE | MEDIA:
        raise PublishError('暂不支持此类型：' + path.name)
    if path.stat().st_size > LIMIT:
        raise PublishError(f'{path.name} 超过 Pages 单文件 25 MiB 上限；大文件需要接入 R2，未上传。')
    return path


def add_blob(root, reg, config, data, name, collection, mime=None):
    if len(data) > LIMIT:
        raise PublishError(f'{name} 超过单文件 25 MiB 上限，未上传。')
    sha = digest(data)
    mime = mime or mimetypes.guess_type(name)[0] or 'application/octet-stream'
    # Include MIME type: identical bytes served as different types are distinct assets.
    existing = next((a for a in reg['assets'] if a['sha256'] == sha and a['mime'] == mime), None)
    if existing:
        return existing
    name = Path(name).name
    local = Path('content/blobs') / sha / name
    dest = root / local
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    public_path = 'files/' + sha[:24] + '/' + urllib.parse.quote(name, safe='-._~')
    asset = {'id': sha, 'sha256': sha, 'name': name, 'title': name, 'mime': mime,
             'bytes': len(data), 'collection': collection, 'created': today(),
             'local': str(local), 'public_path': public_path,
             'url': config['assets_url'] + '/' + public_path}
    reg['assets'].append(asset)
    return asset


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if not value:
                continue
            if key in {'src', 'href', 'poster', 'data-src'}:
                self.urls.append(value)
            elif key == 'srcset':
                self.urls.extend(m.group(1) for m in re.finditer(r'(data:[^,\s]+,[A-Za-z0-9+/=]+|[^\s,]+)(?:\s+[\d.]+[wx])?', value))
            elif key == 'style':
                self.urls.extend(m.group(2) for m in CSSURL.finditer(value))


def local_path(value, file, base):
    value = html.unescape(value)
    if value.startswith('file:'):
        raise PublishError('网页含 file:// 本机链接，请把对应文件放入发布文件夹。')
    p = urllib.parse.urlsplit(value)
    if p.scheme or p.netloc or not p.path:
        return None
    path = urllib.parse.unquote(p.path)
    candidate = (base / path.lstrip('/') if path.startswith('/') else file.parent / path).resolve()
    if not candidate.is_relative_to(base.resolve()):
        raise PublishError('相对链接越出了发布文件夹：' + value)
    return candidate


def collect_single(entry, base):
    """A lone HTML publishes only its local dependencies, never its whole parent."""
    pending, found = [entry], set()
    while pending:
        p = pending.pop()
        if p in found:
            continue
        p = safe_file(p, base)
        found.add(p)
        if p.suffix.lower() not in {'.html', '.htm', '.css', '.js', '.mjs'}:
            continue
        text = p.read_text()
        refs = References()
        if p.suffix.lower() in {'.html', '.htm'}:
            refs.feed(text)
        refs.urls.extend(m.group(2) for m in CSSURL.finditer(text))
        if p.suffix.lower() in {'.js', '.mjs'}:
            refs.urls.extend(re.findall(r'''(?:fetch\s*\(|new URL\s*\(|from\s+)\s*["']([^"']+)["']''', text))
        for value in refs.urls:
            target = local_path(value, p, base)
            if target and target.is_file():
                pending.append(target)
    return sorted(found)


def unpack(source, destination):
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        if len(infos) > 20000 or sum(i.file_size for i in infos) > 1024**3:
            raise PublishError('ZIP 超过 20,000 文件或 1 GiB 解包范围。')
        for info in infos:
            target = (destination / info.filename).resolve()
            if not target.is_relative_to(destination.resolve()) or (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise PublishError('ZIP 含越界路径或符号链接，未解包。')
        archive.extractall(destination)


def prepare_work(root, reg, config, source, slug, title=None, summary=None, category=None, tags=None, cover=None, update=False, icon=None, content_format=None):
    clean_slug(slug)
    previous = next((w for w in reg['works'] if w['id'] == slug), None)
    if previous and not update:
        raise PublishError('同名作品已存在。更新原作品请加 --update，网址会保留。')
    if update and not previous:
        raise PublishError('要更新的作品不存在：' + slug)
    category_path = category_info(root, category)
    if content_format is not None and content_format not in FORMATS:
        raise PublishError('内容形式无效。')
    icon_asset = None
    if icon is not None:
        icon = Path(icon).resolve()
        icon_data = validate_icon(icon)
    elif previous and previous.get('icon_asset_id'):
        icon_asset = next((a for a in reg['assets'] if a['id'] == previous['icon_asset_id']), None)
        if not icon_asset:
            raise PublishError('旧作品图标丢失，请通过 --icon 重新提供。')
    else:
        raise PublishError('每份新作品必须提供专属标签页图标：--icon /absolute/path/icon.svg。请由 AI 根据网页主题制作。')
    source = source.resolve()
    if not source.exists():
        raise PublishError('文件不存在：' + str(source))
    with tempfile.TemporaryDirectory(prefix='commonplace-input-') as temp:
        if source.suffix.lower() == '.zip':
            source_zip = source
            source = Path(temp)
            unpack(source_zip, source)
            children = list(source.iterdir())
            if len(children) == 1 and children[0].is_dir():
                source = children[0]
        source = source.resolve()
        if source.is_dir():
            base, entry = source, source / 'index.html'
            if not entry.is_file():
                raise PublishError('文件夹/ZIP 需要 index.html 作为入口。')
            files = []
            for p in sorted(base.rglob('*')):
                if not p.is_file() or any(part.startswith('.') or part in {'node_modules', '__pycache__'} for part in p.relative_to(base).parts):
                    continue
                if p.suffix.lower() in CODE | MEDIA and p.name.lower() not in {'_worker.js', '_headers', '_redirects', 'package.json', 'package-lock.json', 'wrangler.json', 'wrangler.jsonc'}:
                    files.append(safe_file(p, base))
        else:
            base, entry = source.parent, source
            if source.suffix.lower() not in {'.html', '.htm'}:
                raise PublishError('作品入口应为 HTML、含 index.html 的文件夹或 ZIP。单独素材请用 assets 命令。')
            files = collect_single(entry, base)
        if len(files) > 19000:
            raise PublishError('作品文件过多，超过当前发布范围。')
        original = entry.read_text()
        title_match = re.search(r'<title[^>]*>(.*?)</title>', original, re.I | re.S)
        title = title or (previous or {}).get('title') or (html.unescape(title_match.group(1).strip()) if title_match else slug)
        collection = title
        if icon_asset is None:
            icon_asset = add_blob(root, reg, config, icon_data, icon.name, title + ' · 网页图标')
        local_assets, used_assets, redirects = {}, [], []
        for p in files:
            if p.suffix.lower() in MEDIA:
                a = add_blob(root, reg, config, p.read_bytes(), p.name, collection)
                local_assets[p] = a
                used_assets.append(a['id'])
                redirects.append(['/p/' + slug + '/' + urllib.parse.quote(p.relative_to(base).as_posix(), safe='/'), a['url']])
        version = uuid.uuid4().hex
        snapshot = Path('content/works') / slug / version
        dest = root / snapshot
        dest.mkdir(parents=True)
        missing = []

        def rewrite(value, file, required=True):
            value = html.unescape(value)
            if value.startswith('data:'):
                match = re.fullmatch(r'data:([^;,]+)(;base64)?,(.*)', value, re.S)
                if not match:
                    return value
                mime, encoded, payload = match.groups()
                data = base64.b64decode(payload, validate=True) if encoded else urllib.parse.unquote_to_bytes(payload)
                ext = mimetypes.guess_extension(mime) or '.bin'
                if ext not in MEDIA:
                    return value
                a = add_blob(root, reg, config, data, 'embedded-' + digest(data)[:12] + ext, collection, mime)
                used_assets.append(a['id'])
                return a['url']
            target = local_path(value, file, base)
            if target is None:
                return value
            parsed = urllib.parse.urlsplit(value)
            suffix = ('?' + parsed.query if parsed.query else '') + ('#' + parsed.fragment if parsed.fragment else '')
            if target in local_assets:
                return local_assets[target]['url'] + suffix
            if target.is_file():
                if target not in files:
                    raise PublishError('引用了未包含的文件：' + value)
                if target == entry:
                    return '/p/' + slug + '/' + suffix
                if parsed.path.startswith('/'):
                    return '/p/' + slug + '/' + urllib.parse.quote(target.relative_to(base).as_posix(), safe='/') + suffix
                return value
            if required:
                missing.append(value)
            return value

        def css(text, file):
            return CSSURL.sub(lambda m: 'url("' + rewrite(m.group(2), file) + '")', text)

        class Rewriter(HTMLParser):
            def __init__(self, file):
                super().__init__(convert_charrefs=False)
                self.out, self.file, self.in_style = [], file, False

            def handle_starttag(self, tag, attrs):
                if tag == 'link' and set((dict(attrs).get('rel') or '').lower().split()) & {'icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'}:
                    return
                def attr(m):
                    key, quote, value = m.groups()
                    if key.lower() == 'style':
                        result = css(html.unescape(value), self.file)
                    elif key.lower() == 'srcset':
                        pattern = r'(data:[^,\s]+,[A-Za-z0-9+/=]+|[^\s,]+)(\s+[\d.]+[wx])?'
                        result = re.sub(pattern, lambda n: rewrite(n.group(1), self.file) + (n.group(2) or ''), html.unescape(value))
                    else:
                        required = key.lower() != 'href' or tag in {'link', 'script'}
                        result = rewrite(value, self.file, required)
                    return key + '=' + quote + escaped(result) + quote
                self.out.append(ATTR.sub(attr, self.get_starttag_text()))
                self.in_style = tag.lower() == 'style' or self.in_style

            def handle_startendtag(self, tag, attrs):
                self.handle_starttag(tag, attrs)

            def handle_endtag(self, tag):
                self.out.append('</' + tag + '>')
                if tag.lower() == 'style':
                    self.in_style = False

            def handle_data(self, data):
                self.out.append(css(data, self.file) if self.in_style else data)

            def handle_entityref(self, name): self.out.append('&' + name + ';')
            def handle_charref(self, name): self.out.append('&#' + name + ';')
            def handle_comment(self, data): self.out.append('<!--' + data + '-->')
            def handle_decl(self, decl): self.out.append('<!' + decl + '>')
            def handle_pi(self, data): self.out.append('<?' + data + '>')

        code_files = []
        for p in files:
            if p.suffix.lower() not in CODE:
                continue
            rel = Path('index.html') if p == entry else p.relative_to(base)
            output = dest / rel
            output.parent.mkdir(parents=True, exist_ok=True)
            if p.suffix.lower() in {'.html', '.htm'}:
                rewriter = Rewriter(p)
                rewriter.feed(p.read_text())
                result = ''.join(rewriter.out)
                if re.search(r'(?i)(?:src|href)\s*=\s*["\']file:', result):
                    raise PublishError('含本机文件链接。')
                output.write_text(with_icon(result, icon_asset['url']))
            elif p.suffix.lower() == '.css':
                output.write_text(css(p.read_text(), p))
            else:
                shutil.copy2(p, output)
            code_files.append(rel.as_posix())
        if missing:
            raise PublishError('本地素材/依赖缺失：' + ', '.join(sorted(set(missing))[:8]))
        if cover:
            cover_file = (base / cover).resolve()
            if cover_file in local_assets:
                cover_url = local_assets[cover_file]['url']
            elif cover.startswith(('https://', 'http://')):
                cover_url = cover
            else:
                raise PublishError('封面应是发布文件夹中的图片，或 HTTP(S) 图片地址。')
        else:
            cover_url = (previous or {}).get('cover') or next((a['url'] for a in local_assets.values() if a['mime'].startswith('image/')), '')
            if not cover_url:
                cover_url = next((a['url'] for a in reg['assets'] if a['id'] in used_assets and a['mime'].startswith('image/')), '')
        work = dict(previous or {})
        work.update({'id': slug, 'title': title, 'summary': summary if summary is not None else work.get('summary', ''),
                     'category': ' / '.join(category_path), 'category_id': category, 'category_path': category_path,
                     'format': content_format or work.get('format', 'article'),
                     'icon': icon_asset['url'], 'icon_asset_id': icon_asset['id'],
                     'tags': tags if tags is not None else work.get('tags', []),
                     'cover': cover_url, 'published': work.get('published', today()), 'updated': today(),
                     'path': '/p/' + slug + '/', 'url': config['site_url'] + '/p/' + slug + '/',
                     'snapshot': str(snapshot), 'files': code_files, 'asset_ids': sorted(set(used_assets + [icon_asset['id']])), 'redirects': redirects})
        reg['works'] = [w for w in reg['works'] if w['id'] != slug]
        reg['works'].append(work)
        return work


def public_work(w):
    return {k: v for k, v in w.items() if k not in {'snapshot', 'files', 'asset_ids', 'redirects'}}


def public_asset(a):
    return {k: v for k, v in a.items() if k not in {'local'}}


def shell(root, title, content, extra_css=''):
    css = (root / 'templates/style.css').read_text() + extra_css
    config = read_json(root / 'cloudflare.json') if (root / 'cloudflare.json').is_file() else {}
    icon_version = digest((root / 'templates/brand/mark.svg').read_bytes())[:12] if (root / 'templates/brand/mark.svg').is_file() else 'texopub'
    if config.get('api_url'):
        css += '</style><meta name="commonplace-api" content="' + escaped(config['api_url']) + '"><style>'
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#C74727"><meta name="description" content="TexoPub.ai：发现、使用和发布人与 AI 一起做出的网页、导览与小工具。"><title>' + escaped(title) + '</title><link rel="icon" type="image/x-icon" sizes="16x16 32x32 64x64" href="/favicon.ico?v=' + icon_version + '"><link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=' + icon_version + '"><link rel="icon" type="image/png" sizes="32x32" href="/brand/mark-32.png?v=' + icon_version + '"><link rel="apple-touch-icon" href="/brand/app-icon-180.png"><style>' + css + '</style></head><body><a class="skip-link" href="#main">跳到正文</a><div class="wrap"><header><a class="brand" href="/" aria-label="TexoPub.ai 首页"><img src="/brand/logo.svg" alt="TexoPub.ai" width="473" height="100"></a><nav aria-label="主导航"><a href="/">首页</a><a href="/space/">我的</a><a class="nav-publish" href="/publish/">发布 <span aria-hidden="true">＋</span></a></nav></header><main id="main">' + content + '</main><footer><span>TexoPub.ai · 让好作品被发现</span><span><a href="/categories.json">分类表</a> · <a href="/catalog.json">作品索引</a> · <a href="/materials.json">素材索引</a></span></footer></div></body></html>'


def ai_publish_page(root):
    config = read_json(root / 'cloudflare.json') if (root / 'cloudflare.json').is_file() else {}
    base = config.get('site_url', 'https://co-created-library-lyn.pages.dev').rstrip('/')
    manifest_path = root / 'service/public/for-ai/manifest.json'
    manifest = read_json(manifest_path) if manifest_path.is_file() else {}
    archive = manifest.get('archive_url', base + '/downloads/commonplace-skill.zip')
    version_label = ' · v' + manifest['version'] if manifest.get('version') else ''
    instructions = '请安装并使用「TexoPub.ai」Skill。先了解这个 AI 共创作品门户，再帮我把明确指定的网页发布到我的空间。发布前询问展示范围：不展示、仅个人主页、公开展示（默认，可按我的设置调整）；如已有明确选择或长期指示则直接执行。选择主题分类、制作专属图标，并返回作品网址与导航位置。'
    asset_instructions = '请安装并使用「TexoPub.ai」Skill。先了解这个 AI 共创作品门户，再帮我把明确指定的图片、音视频或文档上传到我的私有素材库，核对身份并返回仅本人可访问的文件地址。只有我明确授权时才公开素材。'
    suffix = '\n\n技能包：' + archive + '\n技能说明：' + base + '/for-ai/SKILL.md\n\n如果当前 Agent 不支持安装，请先读取技能说明，按文档使用客户端；如果尚未配置个人发布凭证，请引导我到 https://texopub.com/space/settings/keys/ 登录，在“AI 密钥”创建并下载凭证（默认六个月，可自定和延长有效期）；不要索取我的短信或邮箱验证码。'
    external_instructions = '请安装并使用「TexoPub.ai」Skill，把我明确指定的已有网站收录到主题目录。我会提供公开 HTTPS 网址；保留原站托管，只提交网址、简介、分类和专属图标，不复制或重新部署网站。发布前询问展示范围：不展示、仅个人主页、公开展示（默认，可按我的设置调整）；如已有明确选择或长期指示则直接执行。完成后核验并返回原站链接。'
    prompts = {'work': instructions + suffix, 'asset': asset_instructions + suffix, 'external': external_instructions + suffix}
    template = (root / 'templates/ai-publish.html').read_text()
    content = template.replace('{{SKILL_VERSION}}', escaped(version_label)).replace('{{PROMPT}}', escaped(prompts['work'])).replace('{{SKILL_ARCHIVE}}', escaped(archive)).replace('{{PROMPTS_JSON}}', json.dumps(prompts, ensure_ascii=False).replace('<', '\\u003c')).replace('{{SCRIPT}}', (root / 'templates/ai-publish.js').read_text())
    return shell(root, '让 AI 上传作品｜TexoPub.ai', content, (root / 'templates/ai-publish.css').read_text())


def directory_page(root, reg):
    groups = taxonomy(root)['groups']
    works = reg['works']
    def count(category):
        return sum(w['category_id'] == category or w['category_id'].startswith(category + '/') for w in works)
    icons = read_json(root / 'templates/category-icons.json')
    def button(category, label, n, style=''):
        icon = icons.get(category.split('/')[-1] or 'all', icons['all'])
        svg = '<svg class="category-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + icon + '"></path></svg>'
        return f'<button type="button" class="{style}" data-category="{escaped(category)}" data-label="{escaped(label)}" aria-pressed="false">{svg}<span class="category-label">{escaped(label)}</span><span class="count">{n}</span></button>'
    sidebar = button('', '全部作品', len(works))
    for group in groups:
        children = ''
        for leaf in group['children']:
            cid = group['id'] + '/' + leaf['id']
            num = count(cid)
            children += button(cid, leaf['name'], num, '' if num else 'unfilled')
        sidebar += f'<section class="topic-group">{button(group["id"], group["name"], count(group["id"]))}<div class="topic-children">{children}</div></section>'
    entries = ''
    for w in sorted(works, key=lambda w: w.get('updated', w['published']), reverse=True):
        format_name = FORMATS[w['format']]
        terms = ' '.join([w['title'], w.get('subtitle', ''), w.get('summary', ''), w['category'], format_name, *w.get('tags', [])]).lower()
        thumb = f'<a class="entry-thumb" href="{escaped(w["path"])}" tabindex="-1" aria-hidden="true"><img src="{escaped(w["cover"])}" alt="" loading="lazy" width="150" height="112"></a>' if w.get('cover') else ''
        tags = ''.join('<span>#' + escaped(t) + '</span>' for t in w.get('tags', [])[:5])
        entries += f'''<article class="directory-entry" data-updated="{escaped(w.get('updated',w['published']))}" data-work-id="{escaped(w['id'])}" data-category-id="{escaped(w['category_id'])}" data-format="{escaped(w['format'])}" data-search="{escaped(terms)}"><div><div class="work-label">{escaped(w['category'])}</div><div class="entry-heading"><img class="entry-icon" src="{escaped(w['icon'])}" alt="" width="28" height="28"><h3><a href="{escaped(w['path'])}">{escaped(w['title'])} ↗</a></h3></div><p class="description">{escaped(w.get('subtitle') or w.get('summary', ''))}</p><p class="description">{escaped(w.get('summary', '')) if w.get('subtitle') else ''}</p><div class="entry-meta"><span>{format_name}</span><span>更新于 {escaped(w.get('updated', w['published']))}</span></div><div class="tags">{tags}</div></div>{thumb}</article>'''
    formats = ''.join(f'<option value="{k}">{v}</option>' for k, v in FORMATS.items())
    js = (root / 'templates/directory.js').read_text().replace('/* CLOUD_DIRECTORY */', (root / 'templates/cloud-directory.js').read_text() if (root / 'cloudflare.json').is_file() and read_json(root / 'cloudflare.json').get('api_url') else '')
    return f'''<div class="directory-layout"><aside class="sidebar" aria-label="主题导航"><p class="sidebar-title">浏览分类</p><div class="topic-nav">{sidebar}</div><p class="sidebar-note">按主题发现作品<br><a href="/materials/">公开素材 →</a></p></aside><div class="directory-main"><section class="directory-lead"><div><h1>发现 AI 创造的好网站。</h1><p>从一份导览、一个小工具出发。发现有用的 AI 作品，也让你的作品被更多人看见。</p></div><span class="edition">开放阅览 · 持续收录</span></section><div class="search-bar" role="search"><div class="search-field"><label for="work-search">搜索作品</label><input type="search" id="work-search" placeholder="搜索标题、主题或标签" autocomplete="off"></div><div class="format-field"><label for="format-filter">内容形式</label><select id="format-filter"><option value="">全部形式</option>{formats}</select></div></div><section class="results" id="results" aria-labelledby="results-heading"><div class="section-heading results-heading"><h2 id="results-heading">最近更新</h2><div class="result-tools"><button type="button" id="reset-filters" class="text-button" hidden>清除筛选</button><p id="result-status" role="status" aria-live="polite">{len(works)} 份作品</p></div></div><div id="work-results">{entries}</div><div id="no-results" class="no-results" hidden><h3>这里暂时没有作品</h3><p>可以试试其他分类。</p><a href="/publish/">了解如何收录作品 →</a></div><p class="directory-caption">每个分类旁的数字是已收录作品数。目录刚刚开始，从一份苏博导览出发。</p></section></div></div><script>{js}</script>'''


def build(root, reg, config, destination=None):
    destination = destination or root / 'build/current'
    site, media = destination / 'site', destination / 'media'
    if destination.exists():
        shutil.rmtree(destination)
    site.mkdir(parents=True)
    media.mkdir(parents=True)
    shutil.copy2(root / 'templates/brand/mark.svg', site / 'favicon.svg')
    shutil.copytree(root / 'templates/brand', site / 'brand')
    shutil.copy2(root / 'templates/brand/favicon.ico', site / 'favicon.ico')
    shutil.copy2(root / 'templates/icons/commonplace.svg', media / 'favicon.svg')
    for a in reg['assets']:
        data = (root / a['local']).read_bytes()
        if len(data) > LIMIT or digest(data) != a['sha256']:
            raise PublishError('素材丢失、变化或超限：' + a['name'])
        dest = media / urllib.parse.unquote(a['public_path'])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    redirects = []
    for w in reg['works']:
        category_info(root, w.get('category_id'))
        if w.get('format') not in FORMATS or not any(a['id'] == w.get('icon_asset_id') and a['url'] == w.get('icon') for a in reg['assets']):
            raise PublishError('作品缺少有效内容形式或已上传图标：' + w['id'])
        for rel in w['files']:
            target = site / 'p' / w['id'] / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            source_file = root / w['snapshot'] / rel
            if target.suffix.lower() in {'.html', '.htm'}:
                original = source_file.read_text()
                # Remove only the known platform link from this legacy work's own
                # toolbar; its text size, table of contents, search and CSS stay put.
                work = original.replace('<a href="/" aria-label="返回共创书架">书架</a>', '')
                raw_root = '/p/' + w['id'] + '/_content/'
                raw_target = site / 'p' / w['id'] / '_content' / rel
                raw_target.parent.mkdir(parents=True, exist_ok=True)
                # Owner-approved presentation fixes are separate from the immutable source snapshot.
                presentation = root / 'source' / w['id'] / 'presentation.css'
                if presentation.is_file():
                    fix = '<style data-work-presentation="' + w['id'] + '">' + presentation.read_text() + '</style>'
                    work = work.replace('</head>', fix + '</head>', 1)
                raw_target.write_text(with_work_bridge(with_icon(work, w['icon']), root))
                target.write_text(work_viewer(root, original, w['icon'], raw_root + rel, '/p/' + w['id'] + '/', raw_root, 'index.html'))
            else:
                shutil.copy2(source_file, target)
                raw_target = site / 'p' / w['id'] / '_content' / rel
                raw_target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, raw_target)
        redirects.extend(w.get('redirects', []))
    if len(redirects) > 2000:
        raise PublishError('兼容旧素材路径的重定向超过 2,000 条；请改用发布后的素材链接。')
    if redirects:
        (site / '_redirects').write_text('\n'.join(a + ' ' + b + ' 302' for a, b in redirects) + '\n')
    catalog = {'schema_version': 3, 'title': 'TexoPub.ai', 'updated': today(), 'revision': reg['revision'], 'taxonomy_url': config['site_url'] + '/categories.json', 'items': [public_work(w) for w in reg['works']]}
    materials = {'schema_version': 1, 'updated': today(), 'revision': reg['revision'], 'items': [public_asset(a) for a in reg['assets']]}
    write_json(site / 'catalog.json', catalog)
    write_json(site / 'materials.json', materials)
    write_json(site / 'categories.json', {**taxonomy(root), 'formats': FORMATS})
    (site / 'index.html').write_text(shell(root, 'TexoPub.ai｜发现 AI 创造的好网站', directory_page(root, {**reg, 'works': []} if config.get('cloud_catalog') else reg)))
    visible_assets = [] if config.get('cloud_catalog') else reg['assets']
    material_html = '<section class="intro"><span class="eyebrow">可单独引用的文件</span><h1>素材目录</h1><p>图片、音视频与文档各有自己的链接，可以用在多份作品里。共 ' + str(len(visible_assets)) + ' 个文件。</p><label class="search-label" for="asset-search">查找素材</label><input id="asset-search" type="search" placeholder="按名称或作品查找"></section><p id="asset-status" aria-live="polite"></p><div class="asset-grid">'
    for a in visible_assets:
        kind = a['mime'].split('/')[0]
        preview = '<img src="' + escaped(a['url']) + '" alt="' + escaped(a.get('title', a['name'])) + '" loading="lazy">' if kind == 'image' else '<span class="file-type">' + escaped(a['mime']) + '</span>'
        material_html += '<article class="asset" data-search="' + escaped((a.get('title', a['name']) + ' ' + a['collection']).lower()) + '"><a class="asset-preview" href="' + escaped(a['url']) + '" target="_blank" rel="noopener">' + preview + '</a><p class="asset-name">' + escaped(a.get('title', a['name'])) + '</p><p class="meta">' + escaped(a['collection']) + ' · ' + str(round(a['bytes'] / 1024, 1)) + ' KB</p><button class="copy-link" data-url="' + escaped(a['url']) + '">复制链接</button></article>'
    material_html += '</div><script>' + (root / 'templates/materials.js').read_text() + '</script>'
    (site / 'materials').mkdir()
    (site / 'materials/index.html').write_text(shell(root, '素材目录｜TexoPub.ai', material_html))
    (site / 'publish').mkdir()
    publish_html = '<section class="intro"><span class="eyebrow">从做好，到发布</span><h1>把作品交给 AI，<br>让它把发布也做完。</h1><p>在已配置发布工具的电脑上，让 AI 使用“TexoPub.ai 发布”技能即可。发布权限属于网站所有者，访客可以阅读和引用公开内容。</p></section><section class="instructions"><h2>发布一份网页</h2><p>把 HTML、包含 index.html 的文件夹或 ZIP 交给 AI，说：</p><blockquote>把这份网页发布到TexoPub.ai，标题叫「……」，分类为「……」。</blockquote><p>工具会上传网页与素材、更新导航，并返回作品链接。同名作品使用更新模式，保留原网址。</p><h2>只上传素材</h2><blockquote>把这些图片上传到我的素材库，把可以直接引用的链接发给我。</blockquote><p>图片、音频、视频、PDF、压缩包、字体和常用文档都可单独发布。当前每个文件须不超过 25 MiB；更大的文件需接入对象存储。原文件按字节保留，已有文件按内容去重。</p><h2>准备文件</h2><p>完整文件夹最适合含脚本、样式与数据的网页；单个 HTML 会带上它直接引用的本地依赖。内嵌图片也会提取成独立素材。网页应能直接在浏览器运行，不包含后端服务或私有凭证。</p><p>公开作品与素材的索引分别在 <a href="/catalog.json">catalog.json</a> 和 <a href="/materials.json">materials.json</a>，便于 AI 读取。</p></section>'
    publish_html = publish_html.replace('分类为「……」。', '请你选择合适的二级分类，并制作一个专属网页图标。')
    publish_html += '<section class="instructions"><h2>每份作品都有自己的位置和图标</h2><p>AI 发布前从<a href="/categories.json">分类表</a>中选择一个二级主题；标签可补充跨主题关联。导览、报告、教程、交互工具等另记为内容形式。例如苏博导览归入「人文与艺术 → 博物馆与文物」，形式为「图文导览」。分类可以继续扩展。</p><p>每份新作品都需要由 AI 制作与主题相符的 SVG、PNG 或 ICO 标签页图标，并随作品上传。图标会出现在作品的所有 HTML 页面和导航条目中；更新时可以沿用该作品图标。</p><p>本机 AI 可先运行 <code>commonplace categories</code> 读取分类，发布时指定 <code>--category humanities/museums --icon /path/to/icon.svg --format guide</code>。缺少分类、分类无效或新作品没有图标时，发布会停止。</p></section>'
    if config.get('api_url'):
        (site / 'publish/index.html').write_text(ai_publish_page(root))
        for path, title in [('space','我的'), ('space/works','我的作品'), ('space/materials','我的素材'), ('space/settings','设置'), ('space/settings/keys','AI 密钥'), ('login','登录')]:
            target = site / path
            target.mkdir(parents=True, exist_ok=True)
            (target / 'index.html').write_text(shell(root, title + '｜TexoPub.ai', (root / 'templates/space.html').read_text() + '<script>' + (root / 'templates/space.js').read_text() + '</script>', (root / 'templates/space.css').read_text()))
        (site / 'u').mkdir(exist_ok=True)
        (site / 'u/index.html').write_text(shell(root, '创作者主页｜TexoPub.ai', '<section class="intro"><span class="eyebrow">创作者主页</span><h1 id="profile-title">正在打开主页…</h1><p>这里展示创作者主动公开的网页与外站收录。</p></section><div id="profile-works"></div><script>' + (root / 'templates/profile.js').read_text() + '</script>'))
        (site / 'profile').mkdir(exist_ok=True)
        shutil.copy2(site / 'u/index.html', site / 'profile/index.html')
        # Rewrite to a canonical directory outside /u/* to avoid index normalization loops.
        with (site / '_redirects').open('a') as f: f.write('/u/* /profile/ 200\n')
        (site / 'plugins/texopub').mkdir(parents=True, exist_ok=True)
        (site / 'plugins/texopub/index.html').write_text(shell(root, 'TexoPub 插件测试版', (root / 'templates/plugin.html').read_text()))
        (site / 'account-privacy').mkdir(exist_ok=True)
        (site / 'account-privacy/index.html').write_text(shell(root, '账号与隐私说明｜TexoPub.ai', (root / 'templates/account-privacy.html').read_text()))
    else:
        (site / 'publish/index.html').write_text(shell(root, '发布方式｜TexoPub.ai', publish_html))
    (site / '404.html').write_text(shell(root, '未找到作品', '<section class="intro"><h1>暂未找到这份作品</h1><a href="/">返回 TexoPub.ai</a></section>'))
    (media / '404.html').write_text('<!doctype html><html><head><title>Asset not found</title><link rel="icon" href="/favicon.svg"></head><body><p>Asset not found.</p></body></html>')
    (site / '_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/catalog.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-cache\n/materials.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-cache\n/categories.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-cache\n')
    if config.get('api_url'):
        script_hash = base64.b64encode(hashlib.sha256((root / 'templates/space.js').read_bytes()).digest()).decode()
        with (site / '_headers').open('a') as f:
            f.write("/space/*\n  X-Frame-Options: DENY\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  Cross-Origin-Opener-Policy: same-origin\n  Content-Security-Policy: default-src 'self'; script-src 'sha256-" + script_hash + "'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\n")
            f.write("/login/*\n  X-Frame-Options: DENY\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  Cross-Origin-Opener-Policy: same-origin\n  Content-Security-Policy: default-src 'self'; script-src 'sha256-" + script_hash + "'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\n")
    (media / '_headers').write_text('/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n')
    if config.get('api_url'):
        with (site / '_redirects').open('a') as f:
            f.write('/catalog.json ' + config['api_url'] + '/v1/catalog 302\n/materials.json ' + config['api_url'] + '/v1/materials 302\n')
    if (root / 'service/public').is_dir():
        for source in (root / 'service/public').rglob('*'):
            if source.is_file():
                target = site / source.relative_to(root / 'service/public')
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
    if config.get('api_url'):
        (site / 'for-ai').mkdir(exist_ok=True)
        (site / 'for-ai/index.html').write_text(ai_publish_page(root))
    for directory in (site, media):
        files = [p for p in directory.rglob('*') if p.is_file()]
        if len(files) > 20000 or any(p.stat().st_size > LIMIT for p in files):
            raise PublishError('构建超出 Pages 文件数量或大小限制。')
    return {'site': str(site), 'media': str(media), 'works': len(reg['works']), 'assets': len(reg['assets']), 'revision': reg['revision']}


def bootstrap(root, config):
    if (root / 'library.json').exists():
        return
    old = root / 'build/site'
    catalog = read_json(old / 'catalog.json')
    w = catalog['items'][0]
    snapshot = Path('content/works') / w['id'] / 'initial'
    (root / snapshot).mkdir(parents=True, exist_ok=True)
    shutil.copy2(old / 'p/suzhou-museum/index.html', root / snapshot / 'index.html')
    assets = []
    for f in read_json(old / 'p/suzhou-museum/assets.json')['files']:
        p = root / 'build/media' / f['path']
        assets.append({'id': f['sha256'], 'sha256': f['sha256'], 'name': p.name, 'title': p.name,
                       'mime': 'image/jpeg', 'bytes': f['bytes'], 'collection': '苏博导览', 'created': '2026-10-19',
                       'local': str(p.relative_to(root)), 'public_path': f['path'], 'url': f['url']})
    # Public captions become useful searchable names, rather than opaque filenames.
    class Labels(HTMLParser):
        def handle_starttag(self, tag, attrs):
            d = dict(attrs)
            if tag == 'img' and d.get('src') and d.get('alt'):
                for a in assets:
                    if a['url'] == d['src']:
                        a['title'] = d['alt']
    Labels().feed((root / snapshot / 'index.html').read_text())
    # Move legacy originals out of build so rebuilding can never remove them.
    for a in assets:
        target = Path('content/legacy-media') / a['name']
        (root / target).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / a['local'], root / target)
        a['local'] = str(target)
    w.update({'snapshot': str(snapshot), 'files': ['index.html'], 'asset_ids': [a['id'] for a in assets], 'redirects': [], 'updated': w.get('content_updated', '2026-10-16')})
    write_json(root / 'library.json', {'schema_version': 1, 'revision': uuid.uuid4().hex, 'works': [w], 'assets': assets})
    (root / 'templates').mkdir(exist_ok=True)
    original = (old / 'index.html').read_text()
    style = re.search(r'<style>(.*?)</style>', original, re.S).group(1)
    style += '\nnav{display:flex;gap:22px;font-size:13px}nav a{text-decoration:none}.search-label{display:block;font-size:13px;margin-top:24px}input[type=search]{width:100%;max-width:460px;padding:12px;border:1px solid var(--line);background:#fffdf8;color:var(--ink);font:inherit}.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:32px 22px;padding-bottom:50px}.asset-preview{display:flex;align-items:center;justify-content:center;background:#e8e8df;aspect-ratio:4/3;overflow:hidden}.asset-preview img{width:100%;height:100%;object-fit:contain}.asset-name{font-size:13px;margin:10px 0 3px;overflow-wrap:anywhere}.asset .meta{font-size:11px;margin:0 0 8px}.copy-link{background:transparent;border:1px solid var(--line);color:var(--jade);padding:8px 13px;min-height:40px;cursor:pointer}.file-type{font-size:12px;overflow-wrap:anywhere;padding:15px}.instructions{max-width:700px;padding-bottom:50px}.instructions h2{font-size:26px;margin:34px 0 16px}.instructions p{font-size:15px}.instructions blockquote{margin:20px 0;padding:20px;background:#e7eee4}.text-cover{aspect-ratio:4/3;display:grid;place-items:center;font-family:serif;font-size:80px;color:var(--jade);background:#e7eee4}[hidden]{display:none!important}@media(max-width:480px){nav{gap:12px;font-size:12px}.brand{font-size:21px}.asset-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 14px}}'
    (root / 'templates/style.css').write_text(style)
    remote = remote_bytes(config['site_url'] + '/catalog.json')
    write_json(root / 'publication-state.json', {'remote_catalog_sha256': digest(remote)})


def wrangler(root, arguments):
    binary = root / '.tools/node_modules/wrangler/bin/wrangler.js'
    if not binary.is_file():
        raise PublishError('发布依赖缺失；运行 npm install --prefix .tools --no-fund --no-audit。')
    env = dict(os.environ, WRANGLER_SEND_METRICS='false')
    if arguments and arguments[0] == 'pages':
        # Missing login must fail clearly, never trigger an implicit broad-scope login.
        env['CI'] = 'true'
    result = subprocess.run(['node', str(binary), *arguments], cwd=root, env=env, text=True)
    if result.returncode:
        raise PublishError('Cloudflare 命令未成功；本地文件已保留，修复登录或网络后重试 deploy。')


def deploy(root, reg, config, report):
    state_path = root / 'publication-state.json'
    state = read_json(state_path)
    def guard():
        actual = digest(remote_bytes(config['site_url'] + '/catalog.json'))
        if actual != state['remote_catalog_sha256']:
            raise PublishError('远端目录已被另一次发布修改；为避免覆盖，本次已停止。请先同步远端和本地作品库。')
    guard()
    env_before = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    os.environ['CLOUDFLARE_ACCOUNT_ID'] = config['account_id']
    try:
        for name, project in [('media', config['assets_project']), ('site', config['site_project'])]:
            if name == 'site':
                guard()
            print('发布阶段：' + name, flush=True)
            wrangler(root, ['pages', 'deploy', report[name], '--project-name', project, '--branch', 'main', '--commit-dirty=true', '--commit-message', 'Commonplace library ' + reg['revision']])
    finally:
        if env_before is None:
            os.environ.pop('CLOUDFLARE_ACCOUNT_ID', None)
        else:
            os.environ['CLOUDFLARE_ACCOUNT_ID'] = env_before
    expected = (Path(report['site']) / 'catalog.json').read_bytes()
    verified = False
    for attempt in range(6):
        if remote_bytes(config['site_url'] + '/catalog.json') == expected:
            verified = True
            break
        time.sleep(2)
    if not verified:
        raise PublishError('部署命令已返回，但主域名目录尚未更新。不要重复发布；先检查 Cloudflare 部署状态。')
    state.update({'remote_catalog_sha256': digest(expected), 'published_revision': reg['revision'], 'published_at': today()})
    write_json(state_path, state)
    write_json(root / 'evidence/latest-publish.json', {**report, 'site_url': config['site_url'], 'verified': True, 'date': today()})


def main(argv=None):
    parser = argparse.ArgumentParser(description='共创书架：发布网页、自动导航和独立素材')
    parser.add_argument('--root', type=Path, default=ROOT, help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ['init', 'build', 'deploy', 'list', 'login', 'whoami', 'categories']:
        sub.add_parser(name)
    p = sub.add_parser('publish')
    p.add_argument('source', type=Path)
    p.add_argument('--slug', required=True)
    p.add_argument('--title')
    p.add_argument('--summary')
    p.add_argument('--category', required=True, help='二级分类 ID，运行 commonplace categories 查看')
    p.add_argument('--icon', type=Path, help='AI 制作的专属 SVG/PNG/ICO 标签页图标，新作品必填')
    p.add_argument('--format', dest='content_format', choices=FORMATS)
    p.add_argument('--tags', help='逗号分隔')
    p.add_argument('--cover')
    p.add_argument('--update', action='store_true')
    p.add_argument('--dry-run', action='store_true')
    p.add_argument('--prepare-only', action='store_true')
    a = sub.add_parser('assets')
    a.add_argument('files', type=Path, nargs='+')
    a.add_argument('--collection', default='独立素材')
    a.add_argument('--dry-run', action='store_true')
    a.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args(argv)
    root = args.root.resolve()
    config = read_json(root / 'cloudflare.json')
    if args.command == 'categories':
        print(json.dumps({**taxonomy(root), 'formats': FORMATS}, ensure_ascii=False, indent=2))
        return
    if config.get('cloud_catalog') and args.command in {'publish', 'assets', 'deploy'}:
        raise PublishError('此站已启用多人云端目录。请使用 commonplace remote 发布；首页维护使用单独的站点部署流程，旧全量发布已禁用。')
    if args.command in {'login', 'whoami'}:
        arguments = ['whoami'] if args.command == 'whoami' else ['login', '--scopes', 'account:read', 'user:read', 'pages:write', '--use-keyring']
        wrangler(root, arguments)
        return
    with (root / '.publish.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        bootstrap(root, config)
        reg = read_json(root / 'library.json')
        if args.command == 'init':
            print(json.dumps({'works': len(reg['works']), 'assets': len(reg['assets'])}))
            return
        if args.command == 'list':
            print(json.dumps({'works': [public_work(w) for w in reg['works']], 'assets': len(reg['assets'])}, ensure_ascii=False, indent=2))
            return
        dry = getattr(args, 'dry_run', False)
        result = None
        if args.command == 'publish':
            result = prepare_work(root, reg, config, args.source, args.slug, args.title, args.summary, args.category,
                                  args.tags.split(',') if args.tags is not None else None, args.cover, args.update, args.icon, args.content_format)
        elif args.command == 'assets':
            result = []
            for p in args.files:
                if not p.is_file() or p.suffix.lower() not in MEDIA | {'.txt', '.json'}:
                    raise PublishError('素材应为支持类型的单独文件：' + str(p))
                if p.stat().st_size > LIMIT:
                    raise PublishError(p.name + ' 超过单文件 25 MiB 上限，未上传。')
                result.append(add_blob(root, reg, config, p.read_bytes(), p.name, args.collection))
        if args.command in {'publish', 'assets'}:
            reg['revision'] = uuid.uuid4().hex
            if not dry:
                before = root / 'history' / (datetime.now().strftime('%Y%m%d-%H%M%S-') + reg['revision'][:8] + '.json')
                write_json(before, read_json(root / 'library.json'))
                write_json(root / 'library.json', reg)
        destination = root / 'build' / ('dry-run-' + uuid.uuid4().hex[:8] if dry else 'current')
        report = build(root, reg, config, destination)
        print(json.dumps({'prepared': report, 'dry_run': dry}, ensure_ascii=False), flush=True)
        if args.command == 'deploy' or (args.command in {'publish', 'assets'} and not dry and not args.prepare_only):
            deploy(root, reg, config, report)
            if args.command == 'publish':
                print(json.dumps({'published': True, 'url': result['url'], 'navigation': config['site_url']}, ensure_ascii=False))
            elif args.command == 'assets':
                print(json.dumps({'published': True, 'assets': [public_asset(a) for a in result], 'materials': config['site_url'] + '/materials/'}, ensure_ascii=False))
        elif result:
            print(json.dumps({'prepared_result': public_work(result) if isinstance(result, dict) else [public_asset(a) for a in result]}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (PublishError, OSError, ValueError, zipfile.BadZipFile) as exc:
        print('发布未完成：' + str(exc), file=sys.stderr)
        sys.exit(1)
