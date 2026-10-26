"""Real remote-client acceptance using an invited publisher; hide fixtures afterwards."""
import base64,hashlib,json,subprocess,sys,tempfile,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from remote_publish import request
admin=json.loads((ROOT/'.secrets/admin.json').read_text())
publisher=json.loads((ROOT/'.secrets/validation-publisher.json').read_text())
api=admin['api']; artifacts=[]; checks=[]
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'CommonplaceRemote/1.0','Cache-Control':'no-cache'}),timeout=60) as r:return r.read(),dict(r.headers)
def client(args,cwd):
    output=subprocess.check_output([sys.executable,str(ROOT/'scripts/remote_publish.py'),'--credential',str(ROOT/'.secrets/validation-publisher.json'),*args],cwd=cwd,text=True)
    return json.loads(output)
try:
    with tempfile.TemporaryDirectory(prefix='outside-commonplace-') as tmp:
        folder=Path(tmp)/'site';folder.mkdir()
        icon=folder/'icon.svg';icon.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#275646" d="M4 4h24v24H4z"/><path fill="#f6f4ea" d="M9 10h14v3H9zm0 8h14v3H9z"/></svg>')
        image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFYoAAAAASUVORK5CYII=')
        (folder/'photo.png').write_bytes(image)
        page=folder/'index.html';page.write_text('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>共创书架远程发布验收</title></head><body><h1>远程发布验收</h1><p>此页面用于验证独立发布凭证、图标、原图及导航自动收录，验收后下架。</p><img src="photo.png"><p>第一版</p><script>window.sample=42;</script></body></html>')
        args=['publish',str(folder),'--slug','cloud-publisher-verification','--title','远程发布验收（临时）','--summary','自动验收后下架','--category','technology/software','--icon',str(icon),'--format','tool']
        first=client(args,tmp);artifacts.append(first['work_id']);checks.append('Independent invited credential and stdlib-only client published from a temporary folder')
        data,headers=get(first['url']);text=data.decode();assert '第一版' in text and 'window.sample=42' in text
        assert 'sandbox' in headers.get('Content-Security-Policy','') and 'allow-same-origin' not in headers['Content-Security-Policy']
        assert 'rel="icon"' in text
        base='https://commonplace-content.ivanliyuanning123.workers.dev/v/'+first['version']+'/'
        original,_=get(base+'photo.png');assert original==image;checks.append('HTML, injected favicon, original image bytes and content isolation verified over HTTP')
        catalog=request(api,'/v1/catalog');assert any(w['id']==first['work_id'] for w in catalog['items']);checks.append('New work is in the authoritative cloud navigation catalog')
        page.write_text(page.read_text().replace('第一版','第二版'))
        updated=client([*args,'--update'],tmp);assert updated['url']==first['url'] and updated['version']!=first['version'];assert '第二版' in get(updated['url'])[0].decode();checks.append('Update preserved the public URL and switched to a new version')
        file=Path(tmp)/'独立素材清单.txt';file.write_text('共创书架独立素材上传验收\n')
        asset=client(['assets',str(file),'--slug','cloud-asset-verification','--title','独立素材验收（临时）'],tmp);artifacts.append(asset['work_id']);assert get(asset['url'])[0]==file.read_bytes()
        materials=request(api,'/v1/materials');assert any(a.get('name')==file.name for a in materials['items']);checks.append('Standalone Chinese-filename asset preserved its bytes and entered the material catalog')
        try:request(api,'/v1/uploads',None,{},'POST');raise AssertionError('anonymous upload succeeded')
        except Exception as e:assert '401' in str(e)
        checks.append('Anonymous upload rejected')
finally:
    for work_id in artifacts:request(api,'/v1/admin/works/'+work_id+'/hide',admin['token'],{},'POST')
    request(api,'/v1/admin/publishers/'+publisher['publisher_id']+'/revoke',admin['token'],{},'POST')
    catalog=request(api,'/v1/catalog');assert {w['id'] for w in catalog['items']}=={'suzhou-museum'}
report={'verified':True,'date':'2026-10-22','checks':checks,'test_works_hidden':artifacts,'test_publisher_revoked':True,'visible_works_after_cleanup':1,'api':api,'note':'This is a real public-HTTP test using another publisher identity and the portable client; no human third-party AI has yet tested it, and no Mac-offline physical test is claimed.'}
(ROOT/'evidence/service-rollout-20261022/live-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
