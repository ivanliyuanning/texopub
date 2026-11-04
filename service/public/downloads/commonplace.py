#!/usr/bin/env python3
"""Portable stdlib-only client for the TexoPub API."""
import argparse, base64, posixpath, hashlib, html, json, mimetypes, os, re, sys, tempfile, time, urllib.error, urllib.parse, urllib.request, uuid, zipfile
from pathlib import Path
from html.parser import HTMLParser
DEFAULT_API='https://commonplace-api.ivanliyuanning123.workers.dev'
UPLOAD_API='https://texopub.com/api'
CODE={'.html','.htm','.css','.js','.mjs','.json','.txt','.xml','.webmanifest','.wasm'}
MEDIA={'.png','.jpg','.jpeg','.webp','.gif','.svg','.avif','.ico','.mp4','.webm','.mov','.mp3','.wav','.m4a','.ogg','.pdf','.zip','.woff','.woff2','.ttf','.csv','.xlsx','.docx','.pptx','.vtt','.srt','.glb','.gltf'}
EXCLUDE={'node_modules','__pycache__','package.json','package-lock.json','_worker.js','_headers','_redirects','wrangler.json','wrangler.jsonc','credential.json','credentials.json','admin.json','service-account.json'}
class Error(Exception):pass

def request(api,path,token=None,body=None,method='GET',idem=None,binary=False):
    headers={'User-Agent':'CommonplaceRemote/1.0'}
    if token: headers['Authorization']='Bearer '+token
    if body is not None:
        if not binary:body=json.dumps(body,ensure_ascii=False).encode();headers['Content-Type']='application/json'
        else:headers['Content-Type']='application/octet-stream'
        headers['Content-Length']=str(len(body))
    if idem:headers['Idempotency-Key']=idem
    transport=UPLOAD_API if binary and api.rstrip('/')==DEFAULT_API else api.rstrip('/')
    req=urllib.request.Request(transport+path,data=body,headers=headers,method=method)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=300 if binary else 90) as response:return json.load(response)
        except urllib.error.HTTPError as exc:
            message=exc.read(4096).decode(errors='replace')
            try:message=json.loads(message).get('error',message)
            except ValueError:pass
            if exc.code in {429,500,502,503,504} and attempt<2:time.sleep(attempt+1);continue
            raise Error(f'HTTP {exc.code}: {message}') from None
        except urllib.error.URLError as exc:
            if attempt<2:time.sleep(attempt+1);continue
            raise Error('网络请求失败：'+str(exc.reason)) from None

def collect(source):
    source=source.resolve()
    base=source if source.is_dir() else source.parent
    def allowed(p):return p.is_file() and not p.is_symlink() and p.suffix.lower() in CODE|MEDIA and not any(x.startswith('.') or x in EXCLUDE for x in p.relative_to(base).parts)
    if source.is_dir():
        files=[p for p in sorted(base.rglob('*')) if allowed(p)]
        entry=base/'index.html'
        if entry not in files:raise Error('文件夹或ZIP需要index.html入口')
        return base,entry,files
    if source.suffix.lower() not in {'.html','.htm'}:raise Error('网页入口应为HTML、文件夹或ZIP；独立素材请用assets')
    class Refs(HTMLParser):
        def __init__(self):super().__init__();self.urls=[]
        def handle_starttag(self,tag,attrs):
            d=dict(attrs)
            if tag=='link' and set((d.get('rel')or'').split())&{'icon','apple-touch-icon'}:return
            for k,v in attrs:
                if v and k in {'src','href','poster','data-src'}:self.urls.append(v)
                if v and k=='srcset':self.urls.extend(x.strip().split()[0] for x in v.split(',') if x.strip() and not v.startswith('data:'))
    found=set();pending=[source]
    while pending:
        p=pending.pop().resolve()
        if p in found:continue
        if not p.is_relative_to(base.resolve()) or not allowed(p):raise Error('网页依赖越界或不支持：'+p.name)
        found.add(p)
        if p.suffix.lower() not in TEXT_EXT:continue
        content=DATA_URI.sub('"embedded-media"',p.read_text());refs=Refs()
        if p.suffix.lower() in {'.html','.htm'}:refs.feed(content)
        refs.urls.extend(m.group(2) for m in re.finditer(r'url\(\s*([\"\']?)(.*?)\1\s*\)',content))
        if p.suffix.lower() in {'.js','.mjs'}:refs.urls.extend(re.findall(r'''(?:fetch\s*\(|new URL\s*\(|from\s+)\s*["']([^"']+)["']''',content))
        for m in QUOTED_URL.finditer(content):
            u=m.group('value');parsed=urllib.parse.urlsplit(u)
            if not parsed.scheme and not parsed.netloc and Path(parsed.path).suffix.lower() in MEDIA:
                candidate=(p.parent/urllib.parse.unquote(parsed.path)).resolve()
                if candidate.is_relative_to(base.resolve()) and candidate.is_file():refs.urls.append(u)
        for u in refs.urls:
            parsed=urllib.parse.urlsplit(html.unescape(u))
            if parsed.scheme=='file':raise Error('不允许file://本机链接')
            if parsed.scheme or parsed.netloc or not parsed.path:continue
            target=(base/urllib.parse.unquote(parsed.path).lstrip('/') if parsed.path.startswith('/') else p.parent/urllib.parse.unquote(parsed.path)).resolve()
            if not target.is_relative_to(base.resolve()):raise Error('网页依赖越出发布目录')
            if target.is_file():pending.append(target)
            elif Path(parsed.path).suffix.lower() in CODE|MEDIA:raise Error('缺少本地依赖：'+parsed.path)
    return base,source,sorted(found)

RESOURCE_EXT={'.png','.jpg','.jpeg','.webp','.gif','.svg','.avif','.ico','.mp4','.webm','.mov','.mp3','.wav','.m4a','.ogg'}
DATA_URI=re.compile(r'data:((?:image|video|audio)/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)')
MIME_EXT={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/svg+xml':'.svg','image/avif':'.avif','image/x-icon':'.ico','video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/mp4':'.m4a','audio/ogg':'.ogg'}
TEXT_EXT={'.html','.htm','.css','.js','.mjs','.json'}
QUOTED_URL=re.compile(r'''(?P<quote>["'])(?P<value>[^"'\r\n<>]{1,2048})(?P=quote)''')

def extract_embedded(payload):
    for name,data in list(payload.items()):
        if Path(name).suffix.lower() not in TEXT_EXT:continue
        def extract(match):
            ext=MIME_EXT.get(match.group(1).lower())
            if not ext:raise Error('暂不支持的内嵌媒体类型：'+match.group(1))
            try:raw=base64.b64decode(re.sub(r'\s','',match.group(2)),validate=True)
            except ValueError:raise Error('内嵌媒体base64无效')
            dest='assets/embedded-'+hashlib.sha256(raw).hexdigest()+ext
            payload[dest]=raw
            return posixpath.relpath(dest,posixpath.dirname(name) or '.')
        payload[name]=DATA_URI.sub(extract,data.decode('utf8')).encode()
    return payload

def replace_resource_urls(payload,resolve):
    rewritten=dict(payload)
    for name,data in payload.items():
        if Path(name).suffix.lower() not in TEXT_EXT:continue
        def quoted(m):
            replacement=resolve(name,m.group('value'))
            return m.group('quote')+replacement+m.group('quote') if replacement is not None else m.group(0)
        text=QUOTED_URL.sub(quoted,data.decode('utf8'))
        def css(m):
            value=m.group(2);replacement=resolve(name,value)
            return 'url('+m.group(1)+replacement+m.group(1)+')' if replacement is not None else m.group(0)
        text=re.sub(r'''url\(\s*(["']?)([^)"']+)\1\s*\)''',css,text)
        def srcset(m):
            items=[]
            for item in m.group(3).split(','):
                bits=item.strip().split(None,1)
                if not bits:continue
                replacement=resolve(name,bits[0])
                items.append((replacement or bits[0])+(' '+bits[1] if len(bits)>1 else ''))
            return m.group(1)+m.group(2)+', '.join(items)+m.group(2)
        text=re.sub(r"""(\bsrcset\s*=\s*)(["'])(.*?)\2""",srcset,text,flags=re.I)
        def bare(m):
            replacement=resolve(name,m.group(2))
            return m.group(1)+replacement if replacement is not None else m.group(0)
        text=re.sub(r'''(\b(?:src|poster)\s*=\s*)([^\s"'<>]+)''',bare,text,flags=re.I)
        rewritten[name]=text.encode()
    return rewritten

def upload_resource_bundle(api,token,payload):
    files=[{'path':p,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for p,b in sorted(payload.items())]
    fingerprint=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
    body={'kind':'asset','slug':'resources-'+fingerprint[:24],'title':'网页依赖资源','listing':'unlisted','files':files,'idempotency_key':'resources-'+fingerprint}
    session=request(api,'/v1/uploads',token,body,'POST',idem=body['idempotency_key'])
    for f in session['files']:
        if not f['ready']:
            print('上传网页资源 '+f['path']+' ('+str(f['bytes'])+' bytes)',file=sys.stderr,flush=True)
            request(api,f['upload_path'],token,payload[f['path']],'PUT',binary=True)
    done=request(api,session['commit_path'],token,{},'POST')
    return {f['path']:{'work_id':done['work']['id'],'version':done['work']['version'],'path':f['path'],'url':f['url']} for f in session['files']}

def externalize_resources(api,token,payload,excluded,old_work_id=None):
    candidates={name for name in payload if Path(name).suffix.lower() in RESOURCE_EXT and name not in excluded}
    used=set()
    def local_path(name,value):
        value=html.unescape(value.replace('\\/','/'));u=urllib.parse.urlsplit(value)
        if u.scheme or u.netloc or not u.path:return None
        relative=posixpath.normpath(urllib.parse.unquote(u.path).lstrip('/') if u.path.startswith('/') else posixpath.join(posixpath.dirname(name),urllib.parse.unquote(u.path)))
        return relative if relative in candidates else None
    def inspect(name,value):
        candidate=local_path(name,value)
        if candidate:used.add(candidate)
        return None
    replace_resource_urls(payload,inspect)
    if any(len(payload[p])>25*1024**2 for p in used):raise Error('单份媒体超过当前25MiB上限；未上传或降低原件质量')
    known=request(api,'/v1/me/materials',token)['items']
    by_url={x['url']:{'work_id':x['work_id'],'version':x['version'],'path':x['name'],'url':x['url']} for x in known if x.get('kind')=='asset'}
    if old_work_id:
        old=request(api,'/v1/me/works/'+old_work_id,token)
        for x in old.get('dependency_files',[]):by_url[x['url']]=x
    mappings={};new={};sha_paths={}
    for name in sorted(used):
        raw=payload[name];sha=hashlib.sha256(raw).hexdigest()
        hit=next((x for x in known if x.get('kind')=='asset' and x.get('sha256')==sha and x['bytes']==len(raw)),None)
        if hit:mappings[name]={'work_id':hit['work_id'],'version':hit['version'],'path':hit['name'],'url':hit['url']}
        else:
            dest='media/'+sha+Path(name).suffix.lower();new[dest]=raw;sha_paths[name]=dest
    batches=[];batch={};total=0
    for name,data in sorted(new.items()):
        if batch and (len(batch)>=250 or total+len(data)>100*1024**2):batches.append(batch);batch={};total=0
        batch[name]=data;total+=len(data)
    if batch:batches.append(batch)
    uploaded={}
    for batch in batches:uploaded.update(upload_resource_bundle(api,token,batch))
    for name,dest in sha_paths.items():mappings[name]=uploaded[dest]
    references={}
    def resolve(name,value):
        u=urllib.parse.urlsplit(html.unescape(value.replace('\\/','/')));candidate=local_path(name,value)
        ref=mappings.get(candidate) if candidate else by_url.get(urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,'','')))
        if not ref:return None
        key=(ref['work_id'],ref['version'],ref['path']);references[key]={k:ref[k] for k in ['work_id','version','path']}
        return ref['url']+('?' +u.query if u.query else '')+('#'+u.fragment if u.fragment else '')
    rewritten=replace_resource_urls(payload,resolve)
    for name in used:rewritten.pop(name,None)
    return rewritten,list(references.values())

def main(argv=None):
    ap=argparse.ArgumentParser(description='TexoPub.ai远程发布客户端：无需Cloudflare账号或Wrangler')
    ap.add_argument('--api',default=DEFAULT_API)
    ap.add_argument('--credential',type=Path,default=Path(os.environ.get('COMMONPLACE_CREDENTIAL',str(Path.home()/'.config/commonplace/credential.json'))))
    subs=ap.add_subparsers(dest='command',required=True)
    data_cmd=subs.add_parser('data');data_cmd.add_argument('operation',choices=['capabilities','usage','apps','app','create-app','config','state','grants','revoke-grant','delete-app','delete-collection','query','get','create','update','remove','history','restore','clear-history','export']);data_cmd.add_argument('--app');data_cmd.add_argument('--collection');data_cmd.add_argument('--body',type=Path);data_cmd.add_argument('--output',type=Path)
    subs.add_parser('categories');subs.add_parser('me');subs.add_parser('list');subs.add_parser('materials');subs.add_parser('my-works');subs.add_parser('my-materials')
    subs.add_parser('my-albums')
    album_show=subs.add_parser('album');album_show.add_argument('album_id')
    album_save=subs.add_parser('album-save');album_save.add_argument('body',type=Path);album_save.add_argument('--album-id')
    album_delete=subs.add_parser('album-delete');album_delete.add_argument('album_id');album_delete.add_argument('--expected-revision',type=int,required=True);album_delete.add_argument('--confirm',action='store_true',required=True)
    subs.add_parser('profile');subs.add_parser('partners')
    profile_update=subs.add_parser('profile-update');profile_update.add_argument('--expected-revision',type=int,required=True)
    profile_names=profile_update.add_mutually_exclusive_group();profile_names.add_argument('--name');profile_names.add_argument('--reset-name',action='store_true')
    profile_update.add_argument('--bio');profile_update.add_argument('--avatar-url')
    partner=subs.add_parser('partner');partner.add_argument('--key',required=True);partner.add_argument('--expected-revision',type=int,required=True)
    for field in ['application','name','bio','avatar-url']:partner.add_argument('--'+field)
    partner.add_argument('--show-on-profile',choices=['true','false'])
    asset_visibility=subs.add_parser('asset-visibility');asset_visibility.add_argument('work_id');asset_visibility.add_argument('--expected-version',required=True);asset_visibility.add_argument('--expected-revision',type=int,required=True);asset_scope=asset_visibility.add_mutually_exclusive_group(required=True);asset_scope.add_argument('--listing',choices=['unlisted','profile','public']);asset_scope.add_argument('--visibility',choices=['private','unlisted','profile','public'],help='兼容旧参数：private等同unlisted；均可匿名访问')
    configure=subs.add_parser('configure');configure.add_argument('file',type=Path)
    show=subs.add_parser('show');show.add_argument('work_id')
    delete=subs.add_parser('delete');delete.add_argument('work_id');delete.add_argument('--expected-version',required=True,help='当前版本；无版本草稿用draft');delete.add_argument('--confirm',action='store_true',required=True)
    listing=subs.add_parser('listing');listing.add_argument('work_id');listing.add_argument('--expected-version',required=True);listing.add_argument('--expected-revision',type=int);listing.add_argument('--listing',choices=['unlisted','profile','public'],required=True)
    preferences=subs.add_parser('preferences');preferences.add_argument('--default-listing',choices=['unlisted','profile','public'],required=True)
    archive=subs.add_parser('archive');archive.add_argument('work_id');archive.add_argument('--expected-version',required=True)
    withdraw=subs.add_parser('withdraw');withdraw.add_argument('work_id');withdraw.add_argument('--expected-version',required=True)
    invite=subs.add_parser('invite');invite.add_argument('--name',required=True);invite.add_argument('--output',type=Path,required=True)
    revoke=subs.add_parser('revoke');revoke.add_argument('publisher_id')
    hide=subs.add_parser('hide');hide.add_argument('work_id')
    for command in ['publish','assets','submit']:
        p=subs.add_parser(command);p.add_argument('source',type=str if command=='submit' else Path);p.add_argument('--slug',required=True);p.add_argument('--title',required=True);p.add_argument('--summary',default='');p.add_argument('--tags',default='');p.add_argument('--license',default='未声明开放许可');p.add_argument('--work-id');p.add_argument('--expected-version');p.add_argument('--receipt',type=Path);p.add_argument('--update',action='store_true')
        if command=='assets':p.add_argument('--public',action='store_true',help='兼容旧参数，等同--listing public；不传时采用空间默认展示范围')
        if command in {'publish','submit'}:p.add_argument('--category',required=True);p.add_argument('--icon',type=Path,required=True);p.add_argument('--format',default='article')
        if command in {'publish','submit'}:p.add_argument('--ai-partners',type=Path,help='真实AI参与记录JSON文件；省略沿用，空数组清空')
        p.add_argument('--listing',choices=['unlisted','profile','public'],help='不展示 / 仅个人主页 / 公开展示；三档均可通过链接访问')
        if command=='publish':
            p.add_argument('--data-binding',type=Path,help='configure_data_app返回的data_binding JSON');p.add_argument('--cover');p.add_argument('--dependencies',type=Path);p.add_argument('--keep-media-in-package',action='store_true',help='兼容选项：媒体作为网页包内文件，不单独托管')
        if command=='submit':p.add_argument('--link-status',choices=['unchecked','unavailable'],default='unchecked')
    args=ap.parse_args(argv)
    if args.command=='configure':
        value=json.loads(args.file.expanduser().read_text())
        if not isinstance(value.get('token'),str) or not value.get('token') or not str(value.get('api','')).startswith('https://'):raise Error('需要有效的HTTPS API地址和密钥')
        args.credential.parent.mkdir(parents=True,exist_ok=True)
        if args.credential.exists():raise Error('目标凭证已存在；请指定新的--credential路径，不自动覆盖')
        fd=os.open(args.credential,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:json.dump(value,f,ensure_ascii=False,indent=2)
        print(json.dumps({'credential_file':str(args.credential.resolve()),'token_printed':False},ensure_ascii=False));return
    credential={}
    if args.credential.is_file():credential=json.loads(args.credential.read_text())
    api=credential.get('api',args.api);token=credential.get('token')
    if args.command in {'categories','list','materials'}:
        route={'categories':'/v1/categories','list':'/v1/catalog','materials':'/v1/materials','show':'/v1/works/'+getattr(args,'work_id','')}[args.command]
        result=request(api,route);print(json.dumps(result,ensure_ascii=False,indent=2));return
    if args.command=='data':
        op=args.operation;body=json.loads(args.body.read_text()) if args.body else {};route='/v1/data/'+({'capabilities':'capabilities','usage':'usage','apps':'apps','create-app':'apps'}.get(op,'apps/'+str(args.app)))
        if op not in {'capabilities','usage','apps','create-app'} and not re.fullmatch('[a-f0-9]{32}',args.app or ''):raise Error('需要--app标识')
        read=op in {'capabilities','usage','apps','app','grants'}
        if op in {'config','state','grants','revoke-grant','delete-app'}:route+='/'+{'revoke-grant':'grants/revoke','delete-app':'delete'}.get(op,op)
        elif op in {'query','get','create','update','remove','history','restore','clear-history','export','delete-collection'}:
            if not re.fullmatch('[a-z][a-z0-9_]{0,39}',args.collection or ''):raise Error('需要--collection')
            route+='/collections/'+args.collection+'/'+('delete' if op=='delete-collection' else op.replace('-','_'))
        if op!='capabilities' and not token:raise Error('需要独立数据凭证；现有发布密钥不含数据权限')
        result=request(api,route,token,None if read else body,'GET' if read else 'POST')
        if op=='export' and args.output:
            args.output.parent.mkdir(parents=True,exist_ok=True)
            if args.output.exists():raise Error('导出目标已存在，不覆盖现有文件')
            partial=args.output.with_name(args.output.name+'.partial')
            fd=os.open(partial,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as out:
                while True:
                    for record in result['records']:out.write(json.dumps(record,ensure_ascii=False)+'\n')
                    if not result.get('next_cursor'):break
                    result=request(api,route,token,{**body,'cursor':result['next_cursor']},'POST')
            os.link(partial,args.output);partial.unlink()
            print(json.dumps({'exported':str(args.output.resolve())},ensure_ascii=False))
        else:print(json.dumps(result,ensure_ascii=False,indent=2))
        return
    if not token:raise Error('缺少发布密钥；请到https://texopub.com/space/settings/keys/登录后创建并下载AI凭证，通过--credential指定文件。不要提供短信验证码或云平台密钥。')
    if args.command in {'my-works','my-materials'}:
        route='/v1/me/works' if args.command=='my-works' else '/v1/me/materials'
        print(json.dumps(request(api,route,token),ensure_ascii=False,indent=2));return
    if args.command in {'my-albums','album','album-save','album-delete'}:
        route='/v1/me/albums';body=None
        if args.command=='album':route+='/'+args.album_id
        elif args.command=='album-save':
            body=json.loads(args.body.read_text());route+=('/'+args.album_id) if args.album_id else ''
        elif args.command=='album-delete':route+='/'+args.album_id+'/delete';body={'expected_revision':args.expected_revision,'confirm':True}
        print(json.dumps(request(api,route,token,body,'POST' if body is not None else 'GET'),ensure_ascii=False,indent=2));return
    if args.command=='me':print(json.dumps(request(api,'/v1/me',token),ensure_ascii=False,indent=2));return
    if args.command in {'profile','partners'}:
        print(json.dumps(request(api,'/v1/me/'+('profile' if args.command=='profile' else 'ai-partners'),token),ensure_ascii=False,indent=2));return
    if args.command=='profile-update':
        body={'expected_revision':args.expected_revision}
        if args.reset_name:body['name']=None
        for field in ['name','bio','avatar_url']:
            value=getattr(args,field,None)
            if value is not None:body[field]=value
        print(json.dumps(request(api,'/v1/me/profile',token,body,'POST'),ensure_ascii=False,indent=2));return
    if args.command=='partner':
        body={'key':args.key,'expected_revision':args.expected_revision}
        for field in ['application','name','bio','avatar_url']:
            value=getattr(args,field,None)
            if value is not None:body[field]=value
        if args.show_on_profile is not None:body['show_on_profile']=args.show_on_profile=='true'
        print(json.dumps(request(api,'/v1/me/ai-partners',token,body,'POST'),ensure_ascii=False,indent=2));return
    if args.command=='asset-visibility':
        print(json.dumps(request(api,'/v1/me/works/'+args.work_id+'/visibility',token,{'expected_version':args.expected_version,'expected_revision':args.expected_revision,'listing':args.listing or ('unlisted' if args.visibility=='private' else args.visibility)},'POST'),ensure_ascii=False,indent=2));return
    if args.command=='show':
        print(json.dumps(request(api,'/v1/me/works/'+args.work_id,token),ensure_ascii=False,indent=2));return
    if args.command=='preferences':
        print(json.dumps(request(api,'/v1/me/preferences',token,{'default_listing':args.default_listing},'POST'),ensure_ascii=False));return
    if args.command=='listing':
        body={'expected_version':None if args.expected_version=='draft' else args.expected_version,'listing':args.listing}
        if args.expected_revision is not None:body['expected_revision']=args.expected_revision
        print(json.dumps(request(api,'/v1/me/works/'+args.work_id+'/listing',token,body,'POST'),ensure_ascii=False));return
    if args.command=='delete':
        body={'expected_version':None if args.expected_version=='draft' else args.expected_version,'confirm':True}
        for _ in range(100):
            result=request(api,'/v1/me/works/'+args.work_id+'/delete',token,body,'POST')
            if result.get('deleted'):print(json.dumps(result,ensure_ascii=False));return
        raise Error('访问已关闭，剩余文件仍在清理。请使用相同参数重试，未报告删除完成。')
    if args.command=='archive':
        print(json.dumps(request(api,'/v1/me/works/'+args.work_id+'/archive',token,{'expected_version':args.expected_version},'POST'),ensure_ascii=False));return
    if args.command=='withdraw':
        print(json.dumps(request(api,'/v1/works/'+args.work_id+'/withdraw',token,{'expected_version':args.expected_version},'POST'),ensure_ascii=False));return
    if args.command=='invite':
        if args.output.exists():raise Error('凭证输出文件已存在，不覆盖')
        result=request(api,'/v1/admin/publishers',token,{'name':args.name},'POST')
        args.output.parent.mkdir(parents=True,exist_ok=True)
        fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:json.dump({'api':api,**result},f,ensure_ascii=False,indent=2)
        print(json.dumps({'publisher_id':result['publisher_id'],'name':result['name'],'credential_file':str(args.output.resolve()),'token_printed':False},ensure_ascii=False));return
    if args.command in {'revoke','hide'}:
        route='/v1/admin/publishers/'+args.publisher_id+'/revoke' if args.command=='revoke' else '/v1/admin/works/'+args.work_id+'/hide'
        print(json.dumps(request(api,route,token,{},'POST')));return
    source=args.source if args.command=='submit' else args.source.expanduser().resolve()
    if args.command!='submit' and not source.exists():raise Error('输入不存在：'+str(source))
    receipt=args.receipt or Path.cwd()/('.commonplace-'+args.slug+'.json')
    if receipt.exists():previous=json.loads(receipt.read_text())
    else:previous={}
    with tempfile.TemporaryDirectory(prefix='commonplace-remote-') as temp:
        if args.command=='publish' and source.suffix.lower()=='.zip':
            folder=Path(temp)
            with zipfile.ZipFile(source) as z:
                if len(z.infolist())>250 or sum(i.file_size for i in z.infolist())>100*1024**2:raise Error('ZIP超过250个文件或100MiB解包范围')
                for i in z.infolist():
                    if not (folder/i.filename).resolve().is_relative_to(folder) or ((i.external_attr>>16)&0o170000)==0o120000:raise Error('ZIP包含越界路径或符号链接')
                z.extractall(folder)
            children=list(folder.iterdir());source=children[0] if len(children)==1 and children[0].is_dir() else folder
        body={'slug':args.slug,'title':args.title,'summary':args.summary,'tags':[x.strip() for x in args.tags.split(',') if x.strip()],'license':args.license,'kind':'asset' if args.command=='assets' else 'work'}
        if args.listing is not None:body['listing']=args.listing
        if args.command in {'publish','submit'} and args.ai_partners is not None:
            contributors=json.loads(args.ai_partners.expanduser().read_text())
            if not isinstance(contributors,list):raise Error('AI参与记录需要JSON数组')
            body['ai_partners']=contributors
        if args.command=='assets' and args.public:
            if args.listing not in {None,'public'}:raise Error('--public与--listing冲突')
            body['listing']='public'
        if args.command=='submit':
            parsed=urllib.parse.urlsplit(source)
            if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:raise Error('收录需要公开HTTPS网址，不接受登录凭证或本机链接')
            icon=args.icon.expanduser().resolve()
            if not icon.is_file() or icon.suffix.lower() not in {'.svg','.png','.ico'}:raise Error('需要专属SVG/PNG/ICO图标')
            if icon.resolve()==args.credential.resolve():raise Error('不能上传凭证文件')
            icon_name='commonplace-icon'+icon.suffix.lower();payload={icon_name:icon.read_bytes()}
            body.update({'source':'external','external_url':source,'category_id':args.category,'format':args.format,'icon':icon_name,'link_status':args.link_status})
        elif args.command=='publish':
            base,entry,files=collect(source);payload={p.relative_to(base).as_posix():p.read_bytes() for p in files if p.resolve()!=args.credential.resolve()}
            icon=args.icon.expanduser().resolve()
            if not icon.is_file() or icon.suffix.lower() not in {'.svg','.png','.ico'}:raise Error('需要专属SVG/PNG/ICO图标')
            icon_name='commonplace-icon'+icon.suffix.lower()
            if icon_name in payload and payload[icon_name]!=icon.read_bytes():raise Error('图标文件名冲突')
            payload[icon_name]=icon.read_bytes()
            for name,data in list(payload.items()):
                if name.lower().endswith(('.html','.htm')):
                    content=data.decode('utf8')
                    if 'file://' in content:raise Error('HTML含本机file://链接')
                    if not re.search(r'<head(?:\s|>)',content,re.I):content=re.sub(r'(<html\b[^>]*>)',r'\1<head></head>',content,count=1,flags=re.I) if re.search(r'<html\b',content,re.I) else '<!doctype html><html><head></head><body>'+content+'</body></html>'
                    payload[name]=content.encode()
            payload=extract_embedded(payload)
            body.update({'category_id':args.category,'format':args.format,'icon':icon_name,'entry':entry.relative_to(base).as_posix()})
            if args.cover:
                if args.cover in payload:body['cover']=args.cover
                else:
                    cover_path=Path(args.cover).expanduser()
                    if not cover_path.is_absolute():cover_path=base/cover_path
                    if not cover_path.is_file() or cover_path.suffix.lower() not in {'.png','.jpg','.jpeg','.webp','.gif','.svg','.avif'}:raise Error('封面需要图片文件')
                    cover_name='commonplace-cover'+cover_path.suffix.lower()
                    cover_bytes=cover_path.read_bytes()
                    if cover_name in payload and payload[cover_name]!=cover_bytes:raise Error('封面文件名冲突')
                    payload[cover_name]=cover_bytes;body['cover']=cover_name
        else:
            if source.is_dir():
                files=[p for p in sorted(source.rglob('*')) if p.is_file() and not p.is_symlink() and p.suffix.lower() in MEDIA|{'.txt','.json'} and not any(x.startswith('.') or x in EXCLUDE for x in p.relative_to(source).parts)]
                if not files:raise Error('素材文件夹中没有支持的文件')
                payload={p.relative_to(source).as_posix():p.read_bytes() for p in files if p.resolve()!=args.credential.resolve()}
            else:
                if source.suffix.lower() not in MEDIA|{'.txt','.json'}:raise Error('不支持的独立素材类型')
                payload={source.name:source.read_bytes()}
        if args.work_id:body.update({'work_id':args.work_id,'expected_version':args.expected_version})
        elif previous.get('published') and getattr(args,'update',False):body.update({'work_id':previous['work']['id'],'expected_version':previous['work']['version']})
        if args.command=='publish':
            if args.data_binding:body['data_binding']=json.loads(args.data_binding.read_text())
            supplied_refs=json.loads(args.dependencies.read_text()) if args.dependencies else []
            if not isinstance(supplied_refs,list) or any(not isinstance(r,dict) or any(not isinstance(r.get(k),str) or not r[k] for k in ['work_id','version','path']) for r in supplied_refs):raise Error('dependencies需要包含work_id、version和path的资源引用数组')
            if any(len(b)>2*1024**2 for n,b in payload.items() if Path(n).suffix.lower() in {'.html','.htm'}):raise Error('提取媒体后的HTML仍超过2MiB，请先精简页面')
            refs=[]
            if not args.keep_media_in_package:payload,refs=externalize_resources(api,token,payload,{body['icon'],body.get('cover')},body.get('work_id'))
            refs.extend(supplied_refs)
            body['dependencies']=list({(r['work_id'],r['version'],r['path']):r for r in refs}.values())
        body['files']=[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(payload.items())]
        fingerprint=hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        idem=previous.get('idempotency_key') if previous.get('fingerprint')==fingerprint and not previous.get('published') else uuid.uuid4().hex
        session=request(api,'/v1/uploads',token,body,'POST',idem=idem)
        record={'api':api,'fingerprint':fingerprint,'idempotency_key':idem,'upload_id':session['upload_id'],'published':False}
        receipt.write_text(json.dumps(record,ensure_ascii=False,indent=2))
        for f in session['files']:
            if not f['ready']:request(api,f['upload_path'],token,payload[f['path']],'PUT',binary=True)
        result=request(api,session['commit_path'],token,{},'POST')
        receipt.write_text(json.dumps({**record,**result},ensure_ascii=False,indent=2))
        print(json.dumps({'published':result['published'],'url':result['work']['url'],'work_id':result['work']['id'],'version':result['work']['version'],'listing':result['work'].get('listing'),'receipt':str(receipt.resolve())},ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except (Error,OSError,ValueError,zipfile.BadZipFile) as exc:print('发布未完成：'+str(exc),file=sys.stderr);sys.exit(1)
