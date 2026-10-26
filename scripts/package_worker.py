#!/usr/bin/env python3
"""Publish the credential-free Worker source bundle alongside release packages."""
from pathlib import Path
import hashlib,json,subprocess
root=Path(__file__).resolve().parents[1]
out=root/'service/public/downloads/texopub-worker-v2026.10.27.mjs'
subprocess.run([str(root/'.tools/node_modules/.bin/esbuild'),str(root/'service/worker.mjs'),'--bundle','--format=esm','--loader:.html=text','--outfile='+str(out)],check=True)
print(json.dumps({'file':out.name,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
