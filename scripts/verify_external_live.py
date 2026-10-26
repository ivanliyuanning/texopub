"""Temporary, independent-publisher acceptance for the external listing service."""
import hashlib, io, json, os, subprocess, sys, tempfile, urllib.request, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from remote_publish import request, Error
EVIDENCE=ROOT/'evidence/external-listing-20261022'
admin=json.loads((ROOT/'.secrets/admin.json').read_text())
api=admin['api']; checks=[]; publisher=None; records=[]
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'CommonplacePublisher/1.0'}),timeout=40) as r:return r.read()
def rejected(fn,status):
    try:fn()
    except Error as exc:
        assert f'HTTP {status}:' in str(exc),str(exc)
    else:raise AssertionError(f'Expected HTTP {status}')
try:
    assert request(api,'/health')['version']==2
    publisher=request(api,'/v1/admin/publishers',admin['token'],{'name':'外部收录自动验收','quota_bytes':262144},'POST')
    with tempfile.TemporaryDirectory(prefix='texopub-external-') as tmp:
        tmp=Path(tmp);credential=tmp/'credential.json'
        fd=os.open(credential,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:json.dump({'api':api,'token':publisher['token']},f)
        manifest=json.loads(get('https://texopub.com/for-ai/manifest.json'));assert manifest['version']=='1.6.0'
        archive=get(manifest['archive_url']);assert hashlib.sha256(archive).hexdigest()==manifest['sha256']
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            assert set(z.namelist())=={'commonplace-remote-publish/'+p for p in manifest['files']}
            z.extractall(tmp/'skill')
        client=tmp/'skill/commonplace-remote-publish/scripts/commonplace.py'
        def cli(args):return json.loads(subprocess.check_output([sys.executable,str(client),'--credential',str(credential),*args],cwd=tmp,text=True))
        icon=tmp/'icon.svg';icon.write_bytes((ROOT/'templates/icons/suzhou-museum.svg').read_bytes())
        original='https://texopub.com/p/suzhou-museum/'
        args=['submit',original,'--slug','external-acceptance','--title','外部收录验收（临时）','--summary','验证后自动移除，仅链接已有公开案例','--category','humanities/museums','--icon',str(icon),'--format','guide']
        first=cli(args);records.append(first);assert first['url']==original
        work=request(api,'/v1/works/'+first['work_id']);assert work['source']=='external';assert work['external_domain']=='texopub.com'
        assert get(work['icon'])==icon.read_bytes()
        assert any(w['id']==first['work_id'] for w in request(api,'/v1/catalog')['items'])
        assert not any(x.get('publisher_id')==publisher['publisher_id'] for x in request(api,'/v1/materials')['items'])
        checks.append('Downloaded v1.6.0 Skill and its stdlib client published an external listing under an independent invited identity; original URL, category, icon and catalog verified')
        # A second slug cannot claim the same normalized URL.
        duplicate={'source':'external','slug':'duplicate','title':'重复验收','external_url':original+'#same-page','category_id':'humanities/museums','icon':'icon.svg','files':[{'path':'icon.svg','bytes':icon.stat().st_size,'sha256':hashlib.sha256(icon.read_bytes()).hexdigest()}]}
        rejected(lambda:request(api,'/v1/uploads',publisher['token'],duplicate,'POST',idem='external-duplicate-check'),409)
        rejected(lambda:request(api,'/v1/works/'+first['work_id']+'/withdraw',admin['token'],{'expected_version':first['version']},'POST'),401)
        updated=cli([*args,'--update','--link-status','unavailable']);records.append(updated)
        assert updated['work_id']==first['work_id'] and updated['url']==first['url'] and updated['version']!=first['version']
        assert cli(['show',first['work_id']])['link_status']=='unavailable'
        rejected(lambda:request(api,'/v1/works/'+first['work_id']+'/withdraw',publisher['token'],{'expected_version':first['version']},'POST'),409)
        checks.append('Duplicate URL rejection, identity isolation, same-record update, explicit unavailable flag and stale-version removal rejection verified')
        removed=cli(['withdraw',first['work_id'],'--expected-version',updated['version']]);assert removed['removed']
        rejected(lambda:request(api,'/v1/works/'+first['work_id']),404)
        assert not any(w['id']==first['work_id'] for w in request(api,'/v1/catalog')['items'])
        assert 'TexoPub' in get(original).decode()
        checks.append('Publisher removed the listing; it disappeared from catalog while the original site remained accessible')
finally:
    if publisher:
        # Recover every test record, including a session created before a client error.
        mine=request(api,'/v1/me',publisher['token'])
        for w in mine['works']:request(api,'/v1/admin/works/'+w['id']+'/hide',admin['token'],{},'POST')
        request(api,'/v1/admin/publishers/'+publisher['publisher_id']+'/revoke',admin['token'],{},'POST')
before=json.loads((EVIDENCE/'live-before/catalog.json').read_text())
catalog=request(api,'/v1/catalog');materials=request(api,'/v1/materials')
assert catalog['items']==before['items']
assert materials==json.loads((EVIDENCE/'live-before/materials.json').read_text())
rejected(lambda:request(api,'/v1/me',publisher['token']),401)
report={'verified':True,'date':'2026-10-22','checks':checks,'records':records,'test_publisher_revoked':True,'catalog_restored':True,'works':len(catalog['items']),'materials':len(materials['items']),'scope':'Real public HTTP acceptance with a temporary invited test identity, not a human external-author trial'}
(EVIDENCE/'external-live-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='records'},ensure_ascii=False))
