#!/usr/bin/env python3
"""Build a fresh checkout without the owner's local registry or hosted works.

This is a frontend build for development/self-hosting, not a production deploy.
It intentionally does not touch library.json or publication-state.json.
"""
from pathlib import Path
import json
import library

root = Path(__file__).resolve().parents[1]
config = json.loads((root / 'cloudflare.json').read_text())
registry = {'schema_version': 1, 'revision': 'source-build', 'works': [], 'assets': []}
print(json.dumps(library.build(root, registry, config, root / 'build/public'), ensure_ascii=False))
