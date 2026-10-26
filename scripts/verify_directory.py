"""Verify the public deployment against the locally built release."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
config = json.loads((ROOT / 'cloudflare.json').read_text())
reg = json.loads((ROOT / 'library.json').read_text())
site = ROOT / 'build/current/site'
work = reg['works'][0]
checks = [(config['site_url'] + '/' + path, site / path) for path in ['index.html', 'catalog.json', 'categories.json', 'materials.json', 'materials/index.html', 'publish/index.html', 'p/suzhou-museum/index.html', 'favicon.svg']]
# Pages serves index.html at directory paths; inspect the canonical URLs too.
checks = [(url.replace('/index.html', '/'), local) for url, local in checks]
asset = next(a for a in reg['assets'] if a['id'] == work['icon_asset_id'])
checks.append((asset['url'], ROOT / asset['local']))
checks.append((config['assets_url'] + '/favicon.svg', ROOT / 'templates/icons/commonplace.svg'))

def check(item):
    url, local = item
    with urlopen(Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'CommonplacePublisher/1.0'}), timeout=40) as response:
        data = response.read()
        assert response.status == 200
        assert data == local.read_bytes(), 'Content mismatch: ' + url
        result = {'url': url, 'status': response.status, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'mime': response.headers.get('Content-Type')}
        if url.endswith('.json'):
            assert response.headers.get('Access-Control-Allow-Origin') == '*', 'JSON is not accessible to AI clients: ' + url
        return result

with ThreadPoolExecutor(max_workers=5) as pool:
    results = list(pool.map(check, checks))
report = {'verified': True, 'revision': reg['revision'], 'checks': results, 'visual_review': 'not completed; Computer Use rejected the current browser URL'}
(ROOT / 'evidence/directory-live-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({'verified': True, 'urls_checked': len(results), 'revision': reg['revision'], 'museum_category': work['category_id'], 'icon': work['icon']}, ensure_ascii=False))
