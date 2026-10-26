#!/usr/bin/env python3
"""Upload Pages static assets using a short-lived JWT supplied on hidden stdin.

Never writes a credential. Produces the manifest for the separate deployment call.
"""
import argparse
import base64
import getpass
import json
import mimetypes
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
from blake3 import blake3

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--manifest', type=Path, required=True)
args = parser.parse_args()
print('Ready for short-lived Pages upload JWT on hidden stdin.', flush=True)
token = getpass.getpass('')

def request(endpoint, data):
    payload = json.dumps(data).encode()
    req = urllib.request.Request('https://api.cloudflare.com/client/v4' + endpoint, data=payload,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                result = json.load(response)
            if not result.get('success'):
                raise RuntimeError(str(result.get('errors', [])))
            return result.get('result')
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                # Return API errors only; never print the Request or its headers.
                raise RuntimeError(f'Cloudflare HTTP {exc.code}: {exc.read().decode()[:1000]}') from None
        except urllib.error.URLError:
            if attempt == 2:
                raise RuntimeError('Network connection failed during asset upload') from None
        time.sleep(2 ** attempt)

files = []
manifest = {}
for p in sorted(args.directory.rglob('*')):
    if not p.is_file() or p.name in ('_headers', '_redirects'):
        continue
    encoded = base64.b64encode(p.read_bytes()).decode()
    digest = blake3((encoded + p.suffix[1:]).encode()).hexdigest()[:32]
    manifest['/' + p.relative_to(args.directory).as_posix()] = digest
    files.append({'base64': True, 'key': digest, 'metadata': {
        'contentType': mimetypes.guess_type(p.name)[0] or 'application/octet-stream'}, 'value': encoded})

missing = set(request('/pages/assets/check-missing', {'hashes': sorted(set(manifest.values()))}))
to_upload = {f['key']: f for f in files if f['key'] in missing}
batch, batch_size, uploaded = [], 0, 0
for f in to_upload.values():
    if batch and batch_size + len(f['value']) > 8_000_000:
        request('/pages/assets/upload', batch)
        uploaded += len(batch)
        print(json.dumps({'uploaded': uploaded, 'total_missing': len(to_upload)}), flush=True)
        batch, batch_size = [], 0
    batch.append(f)
    batch_size += len(f['value'])
if batch:
    request('/pages/assets/upload', batch)
    uploaded += len(batch)
request('/pages/assets/upsert-hashes', {'hashes': sorted(set(manifest.values()))})
args.manifest.parent.mkdir(parents=True, exist_ok=True)
args.manifest.write_text(json.dumps(manifest, indent=2))
print(json.dumps({'files': len(manifest), 'uploaded': uploaded,
                  'unchanged': len(set(manifest.values())) - len(to_upload),
                  'manifest': str(args.manifest)}), flush=True)
