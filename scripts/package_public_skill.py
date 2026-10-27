#!/usr/bin/env python3
"""Package only the public Skill allowlist; never walk the project for release files."""
from pathlib import Path
import hashlib,json,shutil,zipfile
ROOT=Path(__file__).resolve().parents[1]
VERSION='2.3.0'
NAME='commonplace-remote-publish'
BASE=json.loads((ROOT/'cloudflare.json').read_text())['site_url'].rstrip('/')
ALLOWED=['SKILL.md','references/publish.md','references/discover.md','scripts/commonplace.py','en/SKILL.md','en/references/publish.md','en/references/discover.md']
source=ROOT/'service/skill'/NAME
public=ROOT/'service/public'
shutil.copy2(ROOT/'scripts/remote_publish.py',source/'scripts/commonplace.py')
for rel in ALLOWED:
    target=public/'for-ai'/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source/rel,target)
(public/'downloads').mkdir(exist_ok=True)
shutil.copy2(ROOT/'scripts/remote_publish.py',public/'downloads/commonplace.py')
archive=public/'downloads'/f'commonplace-skill-v{VERSION}.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for rel in ALLOWED:
        info=zipfile.ZipInfo(NAME+'/'+rel,date_time=(2026,10,22,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=0o100644<<16
        z.writestr(info,(source/rel).read_bytes())
shutil.copy2(archive,public/'downloads/commonplace-skill.zip')
manifest={'name':NAME,'display_name':'TexoPub.ai','version':VERSION,'skill_url':BASE+'/for-ai/SKILL.md','archive_url':BASE+'/downloads/'+archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'files':ALLOWED,'contains_credentials':False}
(public/'for-ai/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps(manifest,ensure_ascii=False))
