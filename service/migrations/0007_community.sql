ALTER TABLE publishers ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE publishers ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE publishers ADD COLUMN profile_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publishers ADD COLUMN name_source TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE publishers ADD COLUMN lexicon_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS ai_partners (
 id TEXT PRIMARY KEY,
 publisher_id TEXT NOT NULL REFERENCES publishers(id),
 partner_key TEXT NOT NULL,
 application TEXT NOT NULL,
 name TEXT NOT NULL,
 bio TEXT NOT NULL DEFAULT '',
 avatar_url TEXT NOT NULL DEFAULT '',
 show_on_profile INTEGER NOT NULL DEFAULT 0 CHECK(show_on_profile IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 created INTEGER NOT NULL,
 updated INTEGER NOT NULL,
 UNIQUE(publisher_id,partner_key)
);
CREATE INDEX IF NOT EXISTS ai_partners_owner ON ai_partners(publisher_id,created);
