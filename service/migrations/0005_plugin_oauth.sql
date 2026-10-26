CREATE TABLE IF NOT EXISTS oauth_clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,redirects TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_pending(hash TEXT PRIMARY KEY,session_hash TEXT NOT NULL,request TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_codes(hash TEXT PRIMARY KEY,publisher_id TEXT NOT NULL REFERENCES publishers(id),client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,scope TEXT NOT NULL,state TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS oauth_grants(id TEXT PRIMARY KEY,publisher_id TEXT NOT NULL REFERENCES publishers(id),client_id TEXT NOT NULL,name TEXT NOT NULL,scope TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS oauth_grants_owner ON oauth_grants(publisher_id,created);
CREATE TABLE IF NOT EXISTS oauth_tokens(access_hash TEXT PRIMARY KEY,refresh_hash TEXT NOT NULL UNIQUE,grant_id TEXT NOT NULL REFERENCES oauth_grants(id),expires INTEGER NOT NULL,refresh_expires INTEGER NOT NULL,refresh_used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS oauth_tokens_grant ON oauth_tokens(grant_id);
