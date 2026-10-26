#!/usr/bin/env python3
"""Build the one-work example without changing the recovered source."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
if (ROOT / 'library.json').exists():
    raise SystemExit('已启用通用作品库；请运行 commonplace build，旧苏博专用构建已停用。')
parser = argparse.ArgumentParser()
parser.add_argument('--asset-base', default='https://co-created-assets-lyn.pages.dev')
parser.add_argument('--site-base', default='https://co-created-library-lyn.pages.dev')
args = parser.parse_args()
asset_base, site_base = args.asset_base.rstrip('/'), args.site_base.rstrip('/')
source = ROOT / 'source/suzhou/dist'
site, media = ROOT / 'build/site', ROOT / 'build/media'
for path in (site / 'p/suzhou-museum', media / 'suzhou/v1', ROOT / 'evidence'):
    path.mkdir(parents=True, exist_ok=True)

assets = []
for p in sorted((source / 'assets').iterdir()):
    if not p.is_file():
        continue
    relative = 'suzhou/v1/' + p.name
    dest = media / relative
    shutil.copy2(p, dest)
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    assert hashlib.sha256(dest.read_bytes()).hexdigest() == digest
    assets.append({'path': relative, 'bytes': p.stat().st_size, 'sha256': digest,
                   'url': asset_base + '/' + relative})

original = (source / 'index.html').read_text()
guide = original.replace('src="assets/', 'src="' + asset_base + '/suzhou/v1/')
guide = guide.replace('href="assets/', 'href="' + asset_base + '/suzhou/v1/')
guide = guide.replace('<head>', '<head><link rel="canonical" href="' + site_base + '/p/suzhou-museum/">', 1)
marker = '<div class="bar-inner">'
if marker in guide:
    guide = guide.replace(marker, marker + '<a href="/" aria-label="返回共创书架">书架</a>', 1)
assert 'src="assets/' not in guide
assert not re.search(r'(?:file://|/Users/|data:image)', guide)
(site / 'p/suzhou-museum/index.html').write_text(guide)

work = {
    'id': 'suzhou-museum', 'title': '江南器物记',
    'subtitle': '苏州博物馆本馆图文导览', 'category': '文化与旅行',
    'summary': '从史前江南到吴门风雅，沿着历史、人物、考古与制作工艺，读懂展柜里的一件件器物。',
    'url': site_base + '/p/suzhou-museum/', 'path': '/p/suzhou-museum/',
    'cover': asset_base + '/suzhou/v1/4cd76c0cf884b7769761.jpg',
    'language': 'zh-CN', 'content_updated': '2026-10-16', 'published': '2026-10-19',
    'tags': ['苏州博物馆', '文物', '历史', '工艺', '图文导览'],
    'sections': 19, 'entries': 85, 'image_files': len(assets),
    'features': ['全文搜索', '分区筛选', '图片放大', '大字阅读', '本机阅读标记'],
    'scope_note': '独立整理，非馆方官方导览；包含历史陈列与专题背景，非当日全量在展清单。',
    'rights': '未声明开放许可；图片及资料来源见作品内注释。'
}
catalog = {'schema_version': 1, 'title': '共创书架', 'updated': '2026-10-19', 'items': [work]}
(site / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
manifest = {'schema_version': 1, 'work_id': work['id'], 'asset_base': asset_base,
            'files': assets, 'image_bytes': sum(a['bytes'] for a in assets)}
(site / 'p/suzhou-museum/assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
cover = html.escape(work['cover'], quote=True)
index = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#315e51"><title>共创书架｜和 AI 一起留下的作品</title>
<meta name="description" content="把与 AI 一起完成的图文导览、研究与实用网页，留成可以打开、阅读和分享的作品。">
<style>
:root{--paper:#f5f2ea;--ink:#243932;--muted:#626c62;--jade:#315e51;--line:#d6d9cf;--ochre:#9a6135}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.8}a{color:inherit;text-underline-offset:5px}a:focus-visible,summary:focus-visible{outline:3px solid var(--ochre);outline-offset:5px}.wrap{max-width:1120px;margin:auto;padding:0 clamp(22px,5vw,64px)}header{padding:25px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{font-family:"Songti SC",STSong,serif;font-size:24px;font-weight:600;letter-spacing:.12em;text-decoration:none}.byline{font-size:12px;color:var(--muted);letter-spacing:.06em}.intro{padding:clamp(42px,7vw,82px) 0 32px}.eyebrow{font-size:12px;letter-spacing:.16em;color:var(--ochre)}h1,h2{font-family:"Songti SC",STSong,serif;font-weight:500;line-height:1.3}h1{font-size:clamp(32px,4.5vw,50px);margin:14px 0 16px;letter-spacing:.02em}.intro p{margin:0;color:var(--muted);max-width:34em}.work{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:clamp(24px,5vw,58px);align-items:center;padding:24px 0 54px;border-bottom:1px solid var(--line)}.cover{display:block;overflow:hidden;background:#e5e5dc}.cover img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;transition:transform .4s ease}.cover:hover img{transform:scale(1.02)}.work-label{color:var(--ochre);font-size:12px;letter-spacing:.1em}h2{font-size:clamp(34px,5vw,49px);margin:16px 0 6px}.subtitle{font-size:17px;margin:0 0 22px}.description{font-size:15px;color:#526158;margin:0 0 20px;max-width:28em}.meta{font-size:12px;color:var(--muted);margin:0 0 27px}.open{display:inline-block;text-decoration:none;background:var(--jade);color:#fffdf8;padding:12px 22px;min-height:48px}.open:hover{background:#264d42}.note{padding:27px 0;max-width:760px;font-size:13px;color:var(--muted)}summary{cursor:pointer;color:var(--ink);min-height:44px;display:list-item;align-content:center}.note p{margin:12px 0}.note a{color:var(--jade)}footer{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px 0 30px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}@media(max-width:680px){.byline{max-width:120px;text-align:right}.work{grid-template-columns:1fr;gap:26px;padding-top:12px}.cover img{aspect-ratio:16/10}.intro{padding-top:40px}.work h2{margin-top:10px}.open{width:100%;text-align:center}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body><div class="wrap"><header><a class="brand" href="/">共创书架</a><span class="byline">好奇有了形状，作品有了去处。</span></header>
<main><section class="intro"><span class="eyebrow">人与 AI 的共同创作</span><h1>一次好奇，<br>留成一份可以分享的作品。</h1><p>从一份苏博导览开始，收藏那些做过、读过，也值得被更多人打开的网页。</p></section>
<article class="work" aria-labelledby="work-title"><a class="cover" href="/p/suzhou-museum/" aria-label="阅读江南器物记"><img src="__COVER__" alt="苏州博物馆建筑与庭院" width="800" height="600" fetchpriority="high"></a><div><span class="work-label">001 / 文化与旅行</span><h2 id="work-title">江南器物记</h2><p class="subtitle">苏州博物馆本馆图文导览</p><p class="description">在一件器物前停下来，听它讲述自己的时代。沿着历史、人物、考古与制作工艺，从史前江南走向吴门风雅。</p><p class="meta">19 个区域主题 · 85 项解读<br>图文整理于 2026 年 10 月 16 日</p><a class="open" href="/p/suzhou-museum/">打开图文导览 <span aria-hidden="true">→</span></a></div></article>
<details class="note"><summary>关于这份作品</summary><p>这份导览起于一次真实参观，在与 AI 的多轮讨论中，从“看什么”逐渐深入到文物的时代、工艺与来历。支持搜索、分区筛选、图片放大与大字阅读。</p><p>这是独立整理的阅读资料，非馆方官方导览。内容包含历史陈列与专题背景，不代表当日全部在展展品；实际展陈以馆方及现场信息为准。图片与资料来源保留在正文注释中。</p></details></main>
<footer><span>共创书架 · 从第一份作品开始</span><a href="/catalog.json">作品目录 JSON</a></footer></div></body></html>'''
(site / 'index.html').write_text(index.replace('__COVER__', cover))
(site / '404.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>未找到作品</title><body><h1>暂未找到这份作品</h1><p><a href="/">返回共创书架</a></p></body></html>')
(site / '_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/catalog.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300\n')
(media / '_headers').write_text('/suzhou/v1/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n')
(media / '404.html').write_text('<!doctype html><title>Asset not found</title><p>Asset not found.</p>')
report = {'source_commit': 'e48294ea7184250948a4d1f6b7b5a18a772e7088',
          'source_html_bytes': len(original.encode()), 'guide_html_bytes': len(guide.encode()),
          'image_files': len(assets), 'image_bytes': manifest['image_bytes'],
          'images_copied_byte_for_byte': True, 'asset_base': asset_base, 'site_base': site_base,
          'site_files': len([p for p in site.rglob('*') if p.is_file()]),
          'media_files': len([p for p in media.rglob('*') if p.is_file()])}
(ROOT / 'evidence/build.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False))
