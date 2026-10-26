CREATE UNIQUE INDEX IF NOT EXISTS works_external_url_unique ON works(json_extract(metadata,'$.external_key')) WHERE status='published' AND json_extract(metadata,'$.source')='external';
