"""Check the public artifact boundary and that agents can follow packaged links."""
from pathlib import Path
import hashlib
import json
import re
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]

class PublicSkillTests(unittest.TestCase):
    def test_public_archive_is_self_contained_and_matches_manifest(self):
        public=ROOT/'service/public'
        manifest=json.loads((public/'for-ai/manifest.json').read_text())
        archive=public/'downloads'/Path(manifest['archive_url']).name
        data=archive.read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(),manifest['sha256'])
        self.assertEqual(len(data),manifest['bytes'])
        self.assertEqual(data,(public/'downloads/commonplace-skill.zip').read_bytes())
        prefix='commonplace-remote-publish/'
        expected={'SKILL.md','references/publish.md','references/discover.md','scripts/commonplace.py'}
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(set(z.namelist()),{prefix+p for p in expected})
            self.assertEqual(z.read(prefix+'scripts/commonplace.py'),(ROOT/'scripts/remote_publish.py').read_bytes())
            for rel in expected:
                body=z.read(prefix+rel)
                self.assertEqual(body,(public/'for-ai'/rel).read_bytes())
                if rel.endswith('.md'):
                    for target in re.findall(r'\]\(([^)]+)\)',body.decode()):
                        if '://' not in target and not target.startswith('#'):
                            resolved=(Path(rel).parent/target).as_posix()
                            self.assertIn(prefix+resolved,z.namelist())
        # Actual private credential bytes must never be included in the public package.
        for path in (ROOT/'.secrets').glob('*.json'):
            secrets=json.loads(path.read_text())
            for key,value in secrets.items():
                if ('token' in key.lower() or 'secret' in key.lower()) and isinstance(value,str) and len(value)>20:
                    for rel in expected:
                        self.assertNotIn(value,(public/'for-ai'/rel).read_text())

if __name__=='__main__':
    unittest.main()
