-- Unified listing controls for websites and standalone assets.
-- Run while deploying the coordinated API/content update. R2 bytes are unchanged.
UPDATE works SET listing=CASE WHEN json_extract(metadata,'$.visibility')='private' THEN 'unlisted' ELSE listing END,
 metadata=json_remove(metadata,'$.visibility'),revision=revision+1
 WHERE kind='asset' AND json_type(metadata,'$.visibility') IS NOT NULL;
UPDATE versions SET metadata=json_set(json_remove(metadata,'$.visibility'),'$.listing',
 CASE WHEN json_extract(metadata,'$.visibility')='private' THEN 'unlisted'
 ELSE COALESCE(json_extract(metadata,'$.listing'),(SELECT listing FROM works WHERE works.id=versions.work_id),'public') END)
 WHERE work_id IN (SELECT id FROM works WHERE kind='asset') AND json_type(metadata,'$.visibility') IS NOT NULL;
