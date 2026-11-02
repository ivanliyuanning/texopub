"""Build a local stand-in for separately uploaded immutable webpage resources.
No uploads, transcoding or changes to the original annotation page.
"""
from pathlib import Path
import hashlib,json,argparse
PROJECT=Path(__file__).resolve().parents[2]
EVIDENCE=PROJECT/'evidence/albums-media-20261102'

def prepare(origin='http://127.0.0.1:8793'):
    source=EVIDENCE/'staging/tennis-annotation'
    output=EVIDENCE/'staging/tennis-annotation-resource-urls'
    output.mkdir(parents=True,exist_ok=True)
    receipt=json.loads((EVIDENCE/'annotation-preparation.json').read_text())
    original=(source/'index.html').read_text()
    html=original
    items=[]
    files={}
    def item_for(p,mime,sha,refs):
        resource_path='/resources/'+sha+p.suffix.lower()
        return {'id':sha,'name':p.name,'mime':mime,'type':mime.split('/')[0],
                'bytes':p.stat().st_size,'sha256':sha,'listing':'unlisted','url':origin+resource_path,
                'references':refs,'source_path':str(p)},resource_path
    for relative,info in receipt['assets'].items():
        p=source/relative
        sha=hashlib.sha256(p.read_bytes()).hexdigest()
        if sha!=info['sha256']:raise ValueError('Original resource has changed: '+relative)
        item,url_path=item_for(p,info['mime'],sha,[{'title':'网球位置与击球声 · 试标结果','url':'/p/tennis-annotation/'}])
        html=html.replace(relative,item['url'])
        items.append(item);files[url_path]=p
    wav=EVIDENCE/'preview/007-3-audio.wav'
    if wav.exists():
        item,url_path=item_for(wav,'audio/wav',hashlib.sha256(wav.read_bytes()).hexdigest(),[{'title':'网页内音视频引用验收（技术样例）','url':'/dependency-check/'}])
        items.append(item);files[url_path]=wav
    restored=html
    for relative,info in receipt['assets'].items():
        restored=restored.replace(origin+'/resources/'+info['sha256']+Path(relative).suffix.lower(),relative)
    assert restored==original
    assert 'data:video/' not in html and 'data:audio/' not in html and ';base64,' not in html
    (output/'index.html').write_text(html)
    manifest={'scope':'local_resource_URL_rewrite_not_cloud_upload','source_html_bytes':receipt['source_html_bytes'],
              'html_bytes':len(html.encode()),'webpage_dependency_count':len(receipt['assets']),'webpage_dependency_bytes':sum(x['bytes'] for x in receipt['assets'].values()),
              'webpage_video_count':sum(x['mime'].startswith('video/') for x in receipt['assets'].values()),
              'webpage_image_count':sum(x['mime'].startswith('image/') for x in receipt['assets'].values()),
              'media_bytes_unchanged':True,'rewrite_only_restoration_equal':True,
              'html_sha256':hashlib.sha256(html.encode()).hexdigest(),
              'items':[{k:v for k,v in x.items() if k!='source_path'} for x in items]}
    (EVIDENCE/'preview/dependency-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    return manifest,files,output/'index.html'

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--origin',default='http://127.0.0.1:8793');a=parser.parse_args()
    manifest,_,_=prepare(a.origin)
    print(json.dumps({k:v for k,v in manifest.items() if k!='items'},ensure_ascii=False))
