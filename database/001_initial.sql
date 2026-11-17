CREATE SCHEMA IF NOT EXISTS secret_santa;
REVOKE ALL ON SCHEMA secret_santa FROM PUBLIC;
SET LOCAL search_path = secret_santa, public;

CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, role TEXT CHECK (role IN ('participant','support','super_admin')) NOT NULL DEFAULT 'participant',
 suspended BOOLEAN NOT NULL DEFAULT FALSE, totp_secret VARCHAR(64) NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id UUID NOT NULL, audience TEXT CHECK (audience IN ('participant','admin')) NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS events (
 id UUID PRIMARY KEY, organiser_id UUID NOT NULL, name VARCHAR(120) NOT NULL, description TEXT NOT NULL,
 budget DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'NGN', exchange_date DATE NOT NULL,
 registration_deadline DATE NOT NULL, picking_deadline DATE NOT NULL,
 status TEXT CHECK (status IN ('draft','registration_open','registration_closed','picking_open','exchange_active','completed','cancelled')) NOT NULL DEFAULT 'registration_open',
 round INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(organiser_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS event_members (
 id UUID PRIMARY KEY, event_id UUID NOT NULL, user_id UUID NOT NULL,
 wishlist TEXT NULL, gift_ready BOOLEAN NOT NULL DEFAULT FALSE, joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(event_id,user_id), UNIQUE(event_id,id), FOREIGN KEY(event_id) REFERENCES events(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS invitations (
 id UUID PRIMARY KEY, event_id UUID NOT NULL, email VARCHAR(254) NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(event_id) REFERENCES events(id)
);
CREATE TABLE IF NOT EXISTS draw_exclusions (
 event_id UUID NOT NULL, giver_id UUID NOT NULL, recipient_id UUID NOT NULL,
 PRIMARY KEY(event_id,giver_id,recipient_id),
 FOREIGN KEY(event_id,giver_id) REFERENCES event_members(event_id,id),
 FOREIGN KEY(event_id,recipient_id) REFERENCES event_members(event_id,id), CHECK(giver_id <> recipient_id)
);
CREATE TABLE IF NOT EXISTS number_pool_entries (
 event_id UUID NOT NULL, round INT NOT NULL, number INT NOT NULL, recipient_id UUID NOT NULL,
 PRIMARY KEY(event_id,round,number), UNIQUE(event_id,round,recipient_id),
 FOREIGN KEY(event_id,recipient_id) REFERENCES event_members(event_id,id)
);
CREATE TABLE IF NOT EXISTS selections (
 event_id UUID NOT NULL, round INT NOT NULL, giver_id UUID NOT NULL, number INT NOT NULL,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id,round,giver_id), UNIQUE(event_id,round,number),
 FOREIGN KEY(event_id,round,number) REFERENCES number_pool_entries(event_id,round,number),
 FOREIGN KEY(event_id,giver_id) REFERENCES event_members(event_id,id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id UUID PRIMARY KEY, actor_id UUID NOT NULL, event_id UUID NULL,
 action VARCHAR(80) NOT NULL, detail TEXT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(actor_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
 id UUID PRIMARY KEY, event_id UUID NOT NULL, recipient_email VARCHAR(254) NOT NULL,
 subject VARCHAR(200) NOT NULL, body TEXT NOT NULL,
 status TEXT CHECK (status IN ('pending','sending','sent','failed')) NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0,
 available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TIMESTAMPTZ NULL, last_error VARCHAR(500) NULL,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS events_organiser_status_idx ON events(organiser_id,status);
CREATE INDEX IF NOT EXISTS audit_event_created_idx ON audit_logs(event_id,created_at);
CREATE INDEX IF NOT EXISTS notifications_status_available_idx ON notification_deliveries(status,available_at);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS members_user_idx ON event_members(user_id);
CREATE INDEX IF NOT EXISTS invitations_event_idx ON invitations(event_id);
CREATE INDEX IF NOT EXISTS exclusions_recipient_idx ON draw_exclusions(event_id,recipient_id);
CREATE INDEX IF NOT EXISTS pool_recipient_idx ON number_pool_entries(event_id,recipient_id);
CREATE INDEX IF NOT EXISTS selections_giver_idx ON selections(event_id,giver_id);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS notifications_event_idx ON notification_deliveries(event_id);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_pool_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- No anonymous/authenticated Data API access to secrets, sessions or assignments.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON SCHEMA secret_santa FROM anon;
  REVOKE ALL ON ALL TABLES IN SCHEMA secret_santa FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON SCHEMA secret_santa FROM authenticated;
  REVOKE ALL ON ALL TABLES IN SCHEMA secret_santa FROM authenticated;
 END IF;
END $$;
