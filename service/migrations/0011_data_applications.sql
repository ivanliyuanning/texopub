CREATE TABLE IF NOT EXISTS data_application_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0 AND bytes<=16777216),requests INTEGER NOT NULL DEFAULT 0 CHECK(requests>=0 AND requests<=2000));
INSERT OR IGNORE INTO data_application_budget(id) VALUES(1);
CREATE TABLE IF NOT EXISTS data_applications(id TEXT PRIMARY KEY,publisher_id TEXT NOT NULL UNIQUE REFERENCES publishers(id),account_id TEXT NOT NULL REFERENCES accounts(id),purpose TEXT NOT NULL,site_url TEXT NOT NULL DEFAULT '',contact_email TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','handled')),revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS data_applications_status ON data_applications(status,created DESC,id DESC);
CREATE TABLE IF NOT EXISTS data_application_events(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES data_applications(id),actor TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS data_application_events_parent ON data_application_events(application_id,created);
CREATE TABLE IF NOT EXISTS data_application_days(day INTEGER PRIMARY KEY,submissions INTEGER NOT NULL DEFAULT 0 CHECK(submissions<=50));
CREATE TABLE IF NOT EXISTS data_application_mail(application_id TEXT PRIMARY KEY REFERENCES data_applications(id),attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,last_error TEXT NOT NULL DEFAULT '',sent_at INTEGER,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS data_application_mail_pending ON data_application_mail(sent_at,next_attempt,application_id);
CREATE TABLE IF NOT EXISTS data_application_mail_lock(id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS data_application_mail_days(day INTEGER PRIMARY KEY,attempts INTEGER NOT NULL CHECK(attempts<=100));
CREATE TRIGGER IF NOT EXISTS data_application_created AFTER INSERT ON data_applications BEGIN
 UPDATE data_application_budget SET bytes=bytes+1024+length(CAST(NEW.purpose AS BLOB))+length(CAST(NEW.site_url AS BLOB))+length(CAST(NEW.contact_email AS BLOB)),requests=requests+1 WHERE id=1;
 INSERT INTO data_application_days(day,submissions) VALUES(CAST(NEW.created/86400 AS INTEGER),1) ON CONFLICT(day) DO UPDATE SET submissions=submissions+1;
 INSERT INTO data_application_mail(application_id,next_attempt,created) VALUES(NEW.id,NEW.created,NEW.created);
END;
CREATE TRIGGER IF NOT EXISTS data_application_event_budget AFTER INSERT ON data_application_events BEGIN
 UPDATE data_application_budget SET bytes=bytes+512+length(CAST(NEW.note AS BLOB)) WHERE id=1;
END;
