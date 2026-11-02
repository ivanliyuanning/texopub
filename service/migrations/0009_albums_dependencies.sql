CREATE TABLE IF NOT EXISTS albums (
 id TEXT PRIMARY KEY,publisher_id TEXT NOT NULL REFERENCES publishers(id),slug TEXT NOT NULL,
 title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',listing TEXT NOT NULL DEFAULT 'unlisted' CHECK(listing IN ('unlisted','profile')),
 status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','deleted')),
 cover_asset_id TEXT REFERENCES works(id),cover_version TEXT,cover_path TEXT,
 revision INTEGER NOT NULL DEFAULT 1,deletion_revision INTEGER,change_token TEXT NOT NULL,
 idem TEXT NOT NULL,request_hash TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,
 UNIQUE(publisher_id,slug),UNIQUE(publisher_id,idem)
);
CREATE TABLE IF NOT EXISTS album_items (
 album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
 work_id TEXT NOT NULL REFERENCES works(id),position INTEGER NOT NULL,
 PRIMARY KEY(album_id,work_id),UNIQUE(album_id,position)
);
CREATE INDEX IF NOT EXISTS albums_owner ON albums(publisher_id,status,updated DESC);
CREATE INDEX IF NOT EXISTS album_items_work ON album_items(work_id);
CREATE TABLE IF NOT EXISTS work_dependencies (
 version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES works(id),asset_version TEXT NOT NULL,path TEXT NOT NULL,
 PRIMARY KEY(version_id,asset_id,asset_version,path)
);
CREATE INDEX IF NOT EXISTS dependencies_asset ON work_dependencies(asset_id,asset_version);
CREATE TRIGGER IF NOT EXISTS validate_work_dependency BEFORE INSERT ON work_dependencies BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM versions parent JOIN works page ON page.id=parent.work_id
  JOIN works asset ON asset.id=NEW.asset_id JOIN versions av ON av.id=NEW.asset_version AND av.work_id=asset.id
  JOIN files f ON f.version_id=av.id AND f.path=NEW.path
  WHERE parent.id=NEW.version_id AND page.kind='work' AND page.deleted_at IS NULL
   AND page.publisher_id=asset.publisher_id AND asset.kind='asset' AND asset.status='published' AND asset.deleted_at IS NULL
   AND av.state='published' AND f.ready=1
 ) THEN RAISE(ABORT,'resource_unavailable') END;
END;
CREATE TRIGGER IF NOT EXISTS validate_album_item BEFORE INSERT ON album_items BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM albums a JOIN works w ON w.id=NEW.work_id
 WHERE a.id=NEW.album_id AND a.publisher_id=w.publisher_id AND w.kind='work' AND w.current_version IS NOT NULL AND w.deleted_at IS NULL)
 THEN RAISE(ABORT,'album_member_unavailable') END;
END;
CREATE TRIGGER IF NOT EXISTS validate_album_cover_insert BEFORE INSERT ON albums WHEN NEW.cover_asset_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM works w JOIN versions v ON v.work_id=w.id JOIN files f ON f.version_id=v.id
 WHERE w.id=NEW.cover_asset_id AND w.publisher_id=NEW.publisher_id AND w.kind='asset' AND w.status='published' AND w.deleted_at IS NULL
 AND v.id=NEW.cover_version AND v.state='published' AND f.path=NEW.cover_path AND f.ready=1 AND f.mime IN ('image/png','image/jpeg','image/webp') AND f.bytes<=5242880)
 THEN RAISE(ABORT,'resource_unavailable') END;
END;
CREATE TRIGGER IF NOT EXISTS validate_album_cover_update BEFORE UPDATE OF cover_asset_id,cover_version,cover_path ON albums WHEN NEW.cover_asset_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM works w JOIN versions v ON v.work_id=w.id JOIN files f ON f.version_id=v.id
 WHERE w.id=NEW.cover_asset_id AND w.publisher_id=NEW.publisher_id AND w.kind='asset' AND w.status='published' AND w.deleted_at IS NULL
 AND v.id=NEW.cover_version AND v.state='published' AND f.path=NEW.cover_path AND f.ready=1 AND f.mime IN ('image/png','image/jpeg','image/webp') AND f.bytes<=5242880)
 THEN RAISE(ABORT,'resource_unavailable') END;
END;
CREATE TRIGGER IF NOT EXISTS protect_referenced_resource BEFORE UPDATE OF deleted_at,status ON works
 WHEN OLD.kind='asset' AND (NEW.deleted_at IS NOT NULL OR NEW.status!='published') BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM work_dependencies d JOIN versions v ON v.id=d.version_id JOIN works w ON w.id=v.work_id
 WHERE d.asset_id=OLD.id AND w.deleted_at IS NULL AND (v.state='published' OR v.expires>=unixepoch()))
 OR EXISTS(SELECT 1 FROM albums a WHERE a.cover_asset_id=OLD.id AND a.status!='deleted')
 THEN RAISE(ABORT,'resource_in_use') END;
END;
