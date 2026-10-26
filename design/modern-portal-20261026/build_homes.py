"""Build local A/B concepts from the verified public catalog; no production writes."""
from pathlib import Path
from html import escape as esc
import json
import shutil
import hashlib

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
catalog=json.loads((ROOT/'evidence/community-home-ab-20261026/public-catalog.json').read_text())
by_slug={w['slug']:w for w in catalog['items'] if w['listing']=='public'}
slugs=['suzhou-museum','crime-and-punishment','sichuan-university-museum']
assert all(s in by_slug for s in slugs)
taxonomy=json.loads((ROOT/'taxonomy.json').read_text())

def avatar(seed,ai=False):
 digest=hashlib.sha256(seed.encode()).digest()
 cells=[]
 for row in range(5):
  for col in range(3):
   if digest[row*3+col]&1:
    for x in ({col,4-col} if col!=2 else {col}):
     cells.append(f'<rect x="{4+x*3.2:.1f}" y="{4+row*3.2:.1f}" width="2.6" height="2.6" rx="{0.3 if ai else 1.3}"/>')
 return '<svg class="identicon" viewBox="0 0 24 24" aria-hidden="true">'+''.join(cells)+'</svg>'

def category_panel():
 blocks=[]
 for group in taxonomy['groups']:
  gid=group['id'];total=sum(w['category_id'].startswith(gid+'/') for w in by_slug.values())
  options=[f'<button class="category-choice" data-category-filter="{esc(gid)}" data-category-name="{esc(group["name"])}">全部{esc(group["name"])}<span>{total}</span></button>']
  for child in group['children']:
   cid=gid+'/'+child['id'];count=sum(w['category_id']==cid for w in by_slug.values());label=group['name']+' / '+child['name']
   options.append(f'<button class="category-choice" data-category-filter="{esc(cid)}" data-category-name="{esc(label)}">{esc(child["name"])}<span>{count}</span></button>')
  blocks.append(f'<details class="category-group" open><summary>{esc(group["name"])}<span>{total}</span></summary><div class="category-choices">'+''.join(options)+'</div></details>')
 return '<section class="all-categories-panel" id="all-categories-panel" aria-labelledby="all-categories-title" hidden><div class="category-panel-heading"><h2 id="all-categories-title">全部分类</h2><button class="icon-button" id="close-categories" aria-label="收起全部分类">'+icon('close')+'</button></div><p>按主题浏览。数字为当前公开作品数。</p><div class="category-grid">'+''.join(blocks)+'</div></section><div class="category-state" id="category-state" hidden><span id="category-selection"></span><button id="clear-category" type="button">清除分类</button></div>'

def profile_header():
 return f'''<section class="creator-intro compact-profile"><div class="profile-name-row"><div class="avatar-large">{avatar('demo-publisher')}</div><div class="profile-title"><h1>像素园丁</h1><p>@pixel-gardener · 示例署名</p></div></div><div class="partner-strip"><span class="partner-label">AI 伙伴</span><div class="partner-inline"><span class="partner-avatar">{avatar('demo-partner',True)}</span><span class="partner-name">Codex</span><span class="sample-pill">示意</span></div></div></section>'''

def default_cover(w):
 # Zero inference/image-generation dependency: stable title, category and icon treatment.
 return f'''<div class="default-cover-art"><div class="default-cover-top"><span>{esc(w['category_path'][-1])}</span>{icon('ai')}</div><strong>{esc(w['title'])}</strong><div class="default-cover-bottom"><span>TexoPub / 共创作品</span><span>自动排版封面</span></div></div>'''

PATHS={
 'search':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 'arrow':'<path d="M6 18 18 6M6 6h12v12"/>',
 'ai':'<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M8 8h8M12 8v8"/>',
 'avatar':'<path d="M5 6h14M9 6v12m6-12v7M5 13h14"/>',
 'close':'<path d="m6 6 12 12M18 6 6 18"/>',
 'chevron':'<path d="m6 9 6 6 6-6"/>',
 'copy':'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
}
def icon(name):return f'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>'

def author_row(date=True):
 return f'''<div class="author-row"><a class="creator-link" href="creator.html"><span class="avatar">{avatar('demo-publisher')}</span><span class="creator-name">像素园丁</span></a><span class="co-mark">×</span><span class="co-mark">{icon('ai')}Codex</span><span class="partner-tag">伙伴示意</span>{'<span class="date">10.22 更新</span>' if date else ''}</div>'''

def cover(slug):
 w=by_slug[slug];url=esc(w['url'],quote=True)
 end=f'<span class="cover-link-indicator">{icon("arrow")}</span></a>'
 if slug=='suzhou-museum':
  return f'''<a class="cover" href="{url}" target="_blank" rel="noopener" aria-label="打开江南器物记（新标签页）"><img class="scene-photo" src="../../source/suzhou/dist/assets/4cd76c0cf884b7769761.jpg" alt="苏州博物馆本馆与周边街区俯瞰"><span class="photo-caption">苏州博物馆</span>{end}'''
 if slug=='crime-and-punishment':
  return f'''<a class="cover cover-book" href="{url}" target="_blank" rel="noopener" aria-label="打开罪与罚人物随手查（新标签页）">{default_cover(w)}{end}'''
 return f'''<a class="cover cover-objects" href="{url}" target="_blank" rel="noopener" aria-label="打开川流万物（新标签页）"><div class="objects-art"><div class="object-text"><small>四川大学博物馆</small><strong>川流<br>万物</strong><span>馆藏图文导览</span></div><img class="object-image" src="../../source/sichuan-university-museum/dist/assets/info_1150_2188-0.jpg" alt="馆藏商代玉琮资料图"></div>{end}'''

meta={
 'suzhou-museum':dict(title='江南器物记',category='博物馆与文物',format='图文导览',kind='museum',summary='从史前江南到吴门风雅，读懂展柜里的一件件器物。',idea='想逛博物馆时，多看懂一点展柜背后的故事。',contribution='梳理历史与工艺线索，把资料组织成随身可读的导览。'),
 'crime-and-punishment':dict(title='《罪与罚》人物随手查',category='文学与阅读',format='阅读伴页',kind='literature',summary='34 位人物、多译本姓名与昵称，阅读时随手一查。',idea='读长篇小说时，想随时查清人物名字和基本关系。',contribution='整理人物与异译名，做成适合手机检索的阅读伴页。'),
 'sichuan-university-museum':dict(title='川流万物',category='博物馆与文物',format='图文导览',kind='museum',summary='沿着 36 项馆藏的实物与来历，走进四川大学博物馆。',idea='想从实物与来历出发，认识一座收藏文物和自然标本的博物馆。',contribution='汇集馆藏档案和背景资料，组织成 36 项图文导览。'),
}
def card(slug,field=False):
 m=meta[slug];w=by_slug[slug]
 search=' '.join([w['title'],m['title'],w['summary'],w['category'],'像素园丁 Codex Codex',*w.get('tags',[])]).lower()
 attrs=f'data-work="{esc(slug)}" data-kind="{m["kind"]}" data-category="{esc(w["category_id"])}" data-search="{esc(search,quote=True)}"'
 title=f'<h2 class="work-title"><a href="{esc(w["url"],quote=True)}" target="_blank" rel="noopener" aria-label="{esc(m["title"],quote=True)}（新标签页）">{esc(m["title"])}</a></h2>'
 kind=f'<div class="work-kind">{m["category"]}<span class="dot"></span>{m["format"]}</div>'
 desc=f'<p class="work-description">{m["summary"]}</p>'
 if field:
  notes=f'''<div class="making-note"><div class="making-note-label"><strong>一段共创手记</strong><span>文案示意</span></div><p>{m['idea']}</p><p class="credit">{icon('ai')}AI 参与：{m['contribution']}</p></div>'''
  return f'<article class="work field-work" {attrs}>{cover(slug)}<div class="work-copy">{author_row()}{kind}{title}{desc}{notes}</div></article>'
 return f'<article class="work" {attrs}>{cover(slug)}<div class="work-copy">{kind}{title}{desc}{author_row()}</div></article>'

prompt='''请使用 TexoPub，把我明确指定的作品发布到我的空间。
请先核对我的展示意愿，准备作品封面和简介，并介绍本次实际参与的 AI 伙伴：应用名称、可确认的模型，以及承担的工作。模型不知道就留空；如果你只负责发布，请如实说明。
完成后把作品网址和个人主页中的位置交给我。'''
def handoff():
 return f'''<dialog id="ai-handoff" aria-labelledby="handoff-title"><div class="dialog-title"><h2 id="handoff-title">交给你的 AI</h2><button class="icon-button" id="close-handoff" aria-label="关闭">{icon('close')}</button></div><p class="dialog-copy">让 AI 把作品带到 TexoPub，也留下这次共创的伙伴署名。以下为本地交互提案，默认封面、身份资料和 AI 伙伴规则尚未接入正式服务。</p><div class="ai-paths"><a href="https://texopub.com/plugins/texopub/">使用 ChatGPT 插件 {icon('arrow')}</a><a href="https://texopub.com/for-ai/SKILL.md">使用本地 AI Agent {icon('arrow')}</a></div><label class="prompt-label" for="ai-prompt">把这段话交给 AI</label><textarea id="ai-prompt" rows="6" readonly>{esc(prompt)}</textarea><div class="copy-actions"><p class="copy-status" id="copy-status" role="status" aria-live="polite">这份指令只会复制，不会在预览中执行。</p><button class="ai-button" id="copy-prompt">{icon('copy')}复制提示词</button></div></dialog>'''

def page(mode):
 field=mode=='field';profile=mode=='creator';suffix='B · 共创现场' if field else '个人主页 · AI 伙伴示意' if profile else 'A · 共创画廊'
 bodyclass='field' if field else 'gallery'
 header=f'''<div class="notice"><div class="shell"><span>本地设计预览 · {suffix}</span><span class="notice-detail">真实公开作品 · 作者昵称、AI 伙伴及手记为示意 · 尚未上线</span></div></div><div class="shell"><header class="site-header"><a class="logo" href="gallery.html" aria-label="TexoPub 首页"><img src="../../templates/brand/logo.svg" alt="TexoPub.ai"></a><nav class="nav" aria-label="主导航"><a {'class="active" aria-current="page"' if not profile else ''} href="{'field.html' if field else 'gallery.html'}">发现</a><a {'class="active" aria-current="page"' if profile else ''} href="creator.html">我的主页</a><button class="ai-button" data-open-ai>{icon('ai')}交给 AI</button></nav></header>'''
 if profile:
  main=f'<main id="main">{profile_header()}<div class="profile-section-title"><h2>共创作品</h2><span>3 份公开作品</span></div><section class="gallery-grid" aria-label="创作者作品">'+''.join(card(s) for s in slugs)+'</section></main>'
 else:
  viewlabel='共创现场' if field else '发现作品'
  intro='看作品，也看看它如何从一个想法走到这里。' if field else '导览、阅读伴页与交互作品，打开就能体验。'
  main=f'''<main id="main"><section class="masthead"><div><p class="overline">TEXOPUB / {viewlabel}</p><h1>人类与 AI 的共创社区。</h1><p>{intro}</p></div><label class="search-box">{icon('search')}<input id="work-search" type="search" aria-label="搜索作品、创作者或主题" placeholder="搜索作品、创作者或主题"><kbd class="shortcut" aria-hidden="true">/</kbd></label></section><div class="browse-tools"><div class="topics" aria-label="作品主题"><button data-topic="all" aria-pressed="true">全部作品</button><button data-topic="humanities/museums" aria-pressed="false">博物馆</button><button data-topic="humanities/literature" aria-pressed="false">文学与阅读</button></div><div class="browse-actions"><button class="categories-toggle" id="category-toggle" aria-expanded="false" aria-controls="all-categories-panel">全部分类 {icon('chevron')}</button><span class="result-count" id="result-status" role="status" aria-live="polite">3 份作品</span></div></div>{category_panel()}<section class="{'field-list' if field else 'gallery-grid'}" aria-label="{'共创现场作品' if field else '发现作品'}">{''.join(card(s,field) for s in slugs)}</section><section class="empty" id="empty-results" hidden><h2>还没有找到匹配的作品</h2><p>换个关键词，或看看这里已有的作品。</p><button class="secondary-button" id="reset-search">查看全部作品</button></section><p class="page-bottom-note">{'共创手记与 AI 伙伴信息为展示示意，真实作品的参与记录需由创作者与 AI 提供。' if field else '《罪与罚》展示无需生图的自动排版封面；其余使用作品图片。'}</p></main>'''
 footer='''<footer class="site-footer"><span>© 2026 TexoPub.ai</span><div class="footer-links"><a href="creator.html">认识创作者与 AI 伙伴</a><button class="footer-ai" data-open-ai>让 AI 发布作品</button></div></footer></div>'''
 return f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TexoPub｜{suffix}</title><link rel="stylesheet" href="community.css"><link rel="stylesheet" href="refinements.css"></head><body class="{bodyclass}"><a class="skip" href="#main">跳到作品</a>{header}{main}{footer}{handoff()}<script src="community.js" defer></script></body></html>'

for mode,file in [('gallery','gallery.html'),('field','field.html'),('creator','creator.html')]:
 (HERE/file).write_text(page(mode))
if not (HERE/'draft-02.html').exists():shutil.copyfile(HERE/'index.html',HERE/'draft-02.html')
print('Built gallery.html, field.html and creator.html from 3 verified public works.')
