"""Build an allowlisted, credential-free TexoPub plugin package."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
FILES=['plugin.json','mcp.json','.codex-plugin/plugin.json','.mcp.json','skills/texopub-publish/SKILL.md','assets/mark.svg','assets/icon.png']
def main():
 src=ROOT/'service/plugin';out=ROOT/'service/public/downloads';out.mkdir(exist_ok=True,parents=True)
 meta=json.loads((src/'plugin.json').read_text());version=meta['version'];dest=out/f'texopub-plugin-v{version}.zip'
 with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
  for name in FILES:
   content=(src/name).read_bytes()
   if any(marker in content for marker in [b'Bearer txp_',b'Bearer cp_',b'__Host-texopub=',b'"clientSecret"']):raise ValueError('Secret-like data in '+name)
   info=zipfile.ZipInfo('texopub/'+name,date_time=(2026,10,23,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,content)
 stable=out/'texopub-plugin.zip';stable.write_bytes(dest.read_bytes())
 receipt={'name':meta['name'],'version':version,'url':'https://texopub.com/downloads/'+dest.name,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,'files':FILES,'mcp_url':'https://texopub.com/api/mcp'}
 (ROOT/'service/public/plugin-manifest.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main()
