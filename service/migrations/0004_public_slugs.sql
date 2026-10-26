ALTER TABLE works ADD COLUMN public_slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS works_public_slug_unique ON works(public_slug) WHERE public_slug IS NOT NULL;
