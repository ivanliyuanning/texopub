#!/usr/bin/env python3
"""Read-only checks of the deployed AI onboarding and Skill artifacts."""
from pathlib import Path
import argparse,concurrent.futures,hashlib,io,json,re,urllib.request,zipfile
from datetime import datetime
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
DEFAULT_BASE=json.loads((ROOT/'cloudflare.json').read_text())['site_url']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base',default=DEFAULT_BASE,help='Site origin to verify; defaults to configured primary domain')
parser.add_argument('--output',type=Path,default=ROOT/'build/live-verification.json')
parser.add_argument('--baseline',type=Path,help='Optional pre-deployment evidence directory for catalog preservation checks')
args=parser.parse_args()
BASE=args.base.rstrip('/')
local_manifest=json.loads((ROOT/'service/public/for-ai/manifest.json').read_text())
archive_path='/downloads/'+Path(local_manifest['archive_url']).name
paths=['/','/publish/','/materials/','/for-ai/','/for-ai/SKILL.md','/for-ai/references/publish.md','/for-ai/references/discover.md','/for-ai/scripts/commonplace.py','/for-ai/manifest.json','/for-ai/openapi.json','/downloads/commonplace.py',archive_path,'/downloads/commonplace-skill.zip','/catalog.json','/materials.json','/p/suzhou-museum/','/p/suzhou-museum/_content/index.html','/favicon.svg','/favicon.ico','/brand/logo.svg','/brand/mark-32.png','/brand/app-icon-180.png','/brand/fonts/Manrope.ttf','/brand/fonts/OFL.txt']
paths += ['/space/','/space/works/','/space/materials/','/space/settings/','/space/settings/keys/','/login/','/plugins/texopub/','/account-privacy/','/plugin-manifest.json','/downloads/texopub-plugin.zip','/downloads/texopub-plugin-v0.2.0.zip']
def fetch(path):
    with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'User-Agent':'CommonplacePublisher/1.0'}),timeout=40) as r:
        data=r.read()
        record={'path':path,'status':r.status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'content_type':r.headers.get('Content-Type'),'url':r.url}
    return path,(data,record)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:responses=dict(pool.map(fetch,paths))
def source_bytes(data,record):
    # Proxied custom domains may receive this Cloudflare-managed RUM snippet.
    # Match its exact attribute structure; all application bytes still must match.
    if not record['content_type'].startswith('text/html'):return data
    pattern=rb'<script type="module" src="https://static\.cloudflareinsights\.com/beacon\.min\.js/[a-z0-9]+" integrity="sha512-[A-Za-z0-9+/=]+" data-cf-beacon=\'[^\']+\' crossorigin="anonymous"></script>\n'
    normalized,count=re.subn(pattern,b'',data,count=1)
    if count:
        record['edge_transform']='Cloudflare-managed Web Analytics snippet'
        record['source_sha256']=hashlib.sha256(normalized).hexdigest()
    return normalized
for path,(data,record) in responses.items():
    assert record['status']==200,path
    if path in ['/catalog.json','/materials.json']:continue
    local=ROOT/'build/current/site'/path.lstrip('/')
    if not local.suffix:local=local/'index.html'
    if path!='/p/suzhou-museum/':assert source_bytes(data,record)==local.read_bytes(),f'Deployed application bytes differ: {path}'
archive=responses[archive_path][0]
manifest=json.loads(responses['/for-ai/manifest.json'][0])
assert hashlib.sha256(archive).hexdigest()==manifest['sha256']
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    assert set(z.namelist())=={'commonplace-remote-publish/'+p for p in manifest['files']}
home=responses['/'][0].decode()
assert 'class="nav-publish" href="/publish/"' in home and '>首页</a>' in home and '>我的</a>' in home
assert 'TexoPub.ai' in home and '发现 AI 创造的好网站' in home
assert '共创书架' not in home
publish=responses['/publish/'][0].decode()
assert 'id="copy-ai-prompt"' in publish and 'type="file"' not in publish
before=json.loads((ROOT/'evidence/skill-onboarding-20261022/frontend-before/manifest.json').read_text())
oldguide=next(x for x in before if x['path']=='/p/suzhou-museum/')
viewer=source_bytes(*responses['/p/suzhou-museum/']).decode()
assert 'TexoPub 平台标题栏' in viewer and '<iframe' in viewer
assert 'id="textSize"' not in viewer and '返回 TexoPub</' not in viewer
assert '/p/suzhou-museum/_content/index.html' in viewer
raw=source_bytes(*responses['/p/suzhou-museum/_content/index.html']).decode()
bridge=(ROOT/'templates/work-bridge.html').read_text()
assert raw.count(bridge)==1
assert 'id="textSize"' in raw and 'href="#route"' in raw
old_back='<a href="/" aria-label="返回共创书架">书架</a>'
presentation='<style data-work-presentation="suzhou-museum">'+(ROOT/'source/suzhou-museum/presentation.css').read_text()+'</style>'
assert raw.count(presentation)==1
restored=raw.replace(bridge,'').replace(presentation,'').replace('<div class="bar-inner"><span class="brand">','<div class="bar-inner">'+old_back+'<span class="brand">',1)
assert hashlib.sha256(restored.encode()).hexdigest()==oldguide['sha256'],'Unexpected legacy work changes beyond the known platform link, bridge and owner-approved presentation CSS'
catalog=json.loads(responses['/catalog.json'][0]);materials=json.loads(responses['/materials.json'][0])
assert any('suzhou-museum' in w['url'] for w in catalog['items'])
assert catalog['title']=='TexoPub.ai'
if args.baseline:
    baseline=json.loads((args.baseline/'live-before/catalog.json').read_text())
    old=baseline['items'];assert len(catalog['items'])==len(old);migrated=[w for w in catalog['items'] if w.get('legacy_id')=='suzhou-museum'];assert len(migrated)==1 and migrated[0]['url']=='https://texopub.com/p/suzhou-museum/';assert migrated[0]['title']==old[0]['title'] and migrated[0]['category_id']==old[0]['category_id']
    assert materials==json.loads((args.baseline/'live-before/materials.json').read_text()),'Material catalog changed during branding'
report={'verified_at':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds'),'base':BASE,'checks':'Frontend application bytes match build after removing only the exact Cloudflare-managed RUM snippet where present; all Skill artifacts byte-match; ZIP allowlist and SHA256 match; AI upload entry present; legacy work content unchanged except the known duplicate portal link, bridge and approved presentation CSS, with a separate platform viewer; live indexes accessible.','works':len(catalog['items']),'materials':len(materials['items']),'skill_sha256':manifest['sha256'],'responses':[record for data,record in responses.values()]}
out=args.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='responses'},ensure_ascii=False))
