"""Update the existing ChatGPT-created plugin without changing its identity or scopes."""
from pathlib import Path
import json,zipfile,hashlib,argparse,re
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'service/plugin'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--identity-zip',type=Path,required=True)
parser.add_argument('--version',required=True)
parser.add_argument('--display-name')
parser.add_argument('--output',type=Path)
parser.add_argument('--receipt',type=Path)
args=parser.parse_args()
with zipfile.ZipFile(args.identity_zip) as source:
 NAME=json.loads(source.read('.codex-plugin/plugin.json'))['name']
 APP=json.loads(source.read('.app.json'))['apps'][NAME]['id']
if not re.fullmatch(r'dev-[a-f0-9]{32}',NAME) or not re.fullmatch(r'asdk_app_[a-f0-9]{32}',APP):raise ValueError('Expected exact ChatGPT-created plugin identity')
if not re.fullmatch(r'\d+\.\d+\.\d+',args.version):raise ValueError('Expected numeric package version')
OUT=args.output or ROOT/f'service/public/downloads/texopub-connected-plugin-v{args.version}.zip'
OUT.parent.mkdir(parents=True,exist_ok=True)
meta=json.loads((SRC/'.codex-plugin/plugin.json').read_text());meta.update(name=NAME,version=args.version);meta.pop('mcpServers',None);meta['apps']='./.app.json'
portable=json.loads((SRC/'plugin.json').read_text());portable.update(name=NAME,version=args.version);portable.pop('mcpServers',None);portable['extensions']['com.openai']['apps']='./.app.json'
if args.display_name:
 meta['interface']['displayName']=args.display_name
 portable['extensions']['com.openai']['interface']['displayName']=args.display_name
files={'plugin.json':json.dumps(portable,ensure_ascii=False,indent=2).encode(),'.codex-plugin/plugin.json':json.dumps(meta,ensure_ascii=False,indent=2).encode(),'.app.json':json.dumps({'apps':{NAME:{'id':APP}}},indent=2).encode()}
for p in ['skills/texopub-publish/SKILL.md','assets/icon.png','assets/mark.svg']:files[p]=(SRC/p).read_bytes()
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as z:
 for name,b in files.items():
  if any(marker in b for marker in [b'Bearer txp_',b'Bearer cp_',b'__Host-texopub=',b'"clientSecret"']):raise ValueError('Secret-like data in '+name)
  i=zipfile.ZipInfo(name,date_time=(2026,10,23,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o644<<16;z.writestr(i,b)
receipt={'plugin_name':NAME,'version':args.version,'app_id':APP,'files':list(files),'bytes':OUT.stat().st_size,'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest()}
receipt_path=args.receipt or ROOT/'evidence/texopub-chatgpt-20261023/connected-package.json'
receipt_path.parent.mkdir(parents=True,exist_ok=True)
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
