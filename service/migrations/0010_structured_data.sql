CREATE TABLE IF NOT EXISTS data_resource_pins(app_id TEXT NOT NULL,record_id TEXT NOT NULL,publisher_id TEXT NOT NULL,asset_id TEXT NOT NULL REFERENCES works(id),asset_version TEXT NOT NULL,asset_path TEXT NOT NULL,PRIMARY KEY(app_id,record_id,asset_id,asset_version,asset_path));
CREATE INDEX IF NOT EXISTS data_resource_pins_asset ON data_resource_pins(asset_id);
CREATE TRIGGER IF NOT EXISTS protect_data_resource BEFORE UPDATE OF deleted_at,status ON works WHEN OLD.kind='asset' AND (NEW.deleted_at IS NOT NULL OR NEW.status!='published') BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM data_resource_pins WHERE asset_id=OLD.id) THEN RAISE(ABORT,'resource_in_use') END;
END;
