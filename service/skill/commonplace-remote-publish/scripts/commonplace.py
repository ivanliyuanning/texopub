#!/usr/bin/env python3
"""Portable stdlib-only client for the TexoPub API."""
import argparse, base64, posixpath, hashlib, html, json, mimetypes, os, re, sys, tempfile, time, urllib.error, urllib.parse, urllib.request, uuid, zipfile
from pathlib import Path
from html.parser import HTMLParser
DEFAULT_API='https://commonplace-api.ivanliyuanning123.workers.dev'
CODE={'.html','.htm','.css','.js','.mjs','.json','.txt','.xml','.webmanifest','.wasm'}
MEDIA={'.png','.jpg','.jpeg','.webp','.gif','.svg','.avif','.ico','.mp4','.webm','.mov','.mp3','.wav','.m4a','.ogg','.pdf','.zip','.woff','.woff2','.ttf','.csv','.xlsx','.docx','.pptx','.vtt','.srt','.glb','.gltf'}
EXCLUDE={'node_modules','__pycache__','package.json','package-lock.json','_worker.js','_headers','_redirects','wrangler.json','wrangler.jsonc','credential.json','credentials.json','admin.json','service-account.json'}
class Error(Exception):pass

def request(api,path,token=None,body=None,method='GET',idem=None,binary=False):
    headers={'User-Agent':'CommonplaceRemote/1.0'}
    if token: headers['Authorization']='Bearer '+token
    if body is not None:
        if not binary:body=json.dumps(body,ensure_ascii=False).encode();headers['Content-Type']='application/json'
        headers['Content-Length']=str(len(body))
    if idem:headers['Idempotency-Key']=idem
    req=urllib.request.Request(api.rstrip('/')+path,data=body,headers=headers,method=method)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=90) as response:return json.load(response)
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
        if p.suffix.lower() not in {'.html','.htm','.css','.js','.mjs'}:continue
        content=p.read_text();refs=Refs()
        if p.suffix.lower() in {'.html','.htm'}:refs.feed(content)
        refs.urls.extend(m.group(2) for m in re.finditer(r'url\(\s*([\"\']?)(.*?)\1\s*\)',content))
        if p.suffix.lower() in {'.js','.mjs'}:refs.urls.extend(re.findall(r'''(?:fetch\s*\(|new URL\s*\(|from\s+)\s*["']([^"']+)["']''',content))
        for u in refs.urls:
            parsed=urllib.parse.urlsplit(html.unescape(u))
            if parsed.scheme=='file':raise Error('不允许file://本机链接')
            if parsed.scheme or parsed.netloc or not parsed.path:continue
            target=(base/urllib.parse.unquote(parsed.path).lstrip('/') if parsed.path.startswith('/') else p.parent/urllib.parse.unquote(parsed.path)).resolve()
            if not target.is_relative_to(base.resolve()):raise Error('网页依赖越出发布目录')
            if target.is_file():pending.append(target)
            elif Path(parsed.path).suffix.lower() in CODE|MEDIA:raise Error('缺少本地依赖：'+parsed.path)
    return base,source,sorted(found)

def main(argv=None):
    ap=argparse.ArgumentParser(description='TexoPub.ai远程发布客户端：无需Cloudflare账号或Wrangler')
    ap.add_argument('--api',default=DEFAULT_API)
    ap.add_argument('--credential',type=Path,default=Path(os.environ.get('COMMONPLACE_CREDENTIAL',str(Path.home()/'.config/commonplace/credential.json'))))
    subs=ap.add_subparsers(dest='command',required=True)
    subs.add_parser('categories');subs.add_parser('me');subs.add_parser('list');subs.add_parser('materials');subs.add_parser('my-works');subs.add_parser('my-materials')
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
        if command=='assets':p.add_argument('--public',action='store_true',help='仅在明确授权公开该素材时使用；默认私有')
        if command in {'publish','submit'}:p.add_argument('--category',required=True);p.add_argument('--icon',type=Path,required=True);p.add_argument('--format',default='article')
        if command in {'publish','submit'}:p.add_argument('--listing',choices=['unlisted','profile','public'],help='不展示 / 仅个人主页 / 公开展示；三档均可通过链接访问')
        if command=='publish':p.add_argument('--cover')
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
    if not token:raise Error('缺少发布密钥；请到https://texopub.com/space/settings/keys/登录后创建并下载AI凭证，通过--credential指定文件。不要提供短信验证码或云平台密钥。')
    if args.command in {'my-works','my-materials'}:
        route='/v1/me/works' if args.command=='my-works' else '/v1/me/materials'
        print(json.dumps(request(api,route,token),ensure_ascii=False,indent=2));return
    if args.command=='me':print(json.dumps(request(api,'/v1/me',token),ensure_ascii=False,indent=2));return
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
        if args.command in {'publish','submit'} and args.listing is not None:body['listing']=args.listing
        if args.command=='assets':body['visibility']='public' if args.public else 'private'
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
            for name,data in list(payload.items()):
                if not name.lower().endswith(('.html','.htm','.css')):continue
                def extract(match):
                    mime=match.group(1).lower();ext={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/svg+xml':'.svg','image/avif':'.avif'}.get(mime)
                    if not ext:return match.group(0)
                    try:raw=base64.b64decode(re.sub(r'\s','',match.group(2)),validate=True)
                    except ValueError:raise Error('内嵌图片base64无效')
                    dest='assets/embedded-'+hashlib.sha256(raw).hexdigest()[:20]+ext
                    payload[dest]=raw
                    return posixpath.relpath(dest,posixpath.dirname(name) or '.')
                content=re.sub(r'data:(image/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)',extract,data.decode('utf8'))
                payload[name]=content.encode()
            body.update({'category_id':args.category,'format':args.format,'icon':icon_name,'entry':entry.relative_to(base).as_posix()})
            if args.cover:body['cover']=args.cover
        else:
            if source.suffix.lower() not in MEDIA|{'.txt','.json'}:raise Error('不支持的独立素材类型')
            payload={source.name:source.read_bytes()}
        body['files']=[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(payload.items())]
        if args.work_id:body.update({'work_id':args.work_id,'expected_version':args.expected_version})
        elif previous.get('published') and getattr(args,'update',False):body.update({'work_id':previous['work']['id'],'expected_version':previous['work']['version']})
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
