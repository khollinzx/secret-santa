CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, role ENUM('participant','support','super_admin') NOT NULL DEFAULT 'participant',
 suspended BOOLEAN NOT NULL DEFAULT FALSE, totp_secret VARCHAR(64) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL, audience ENUM('participant','admin') NOT NULL,
 expires_at DATETIME NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS events (
 id CHAR(36) PRIMARY KEY, organiser_id CHAR(36) NOT NULL, name VARCHAR(120) NOT NULL, description TEXT NOT NULL,
 budget DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'NGN', exchange_date DATE NOT NULL,
 registration_deadline DATE NOT NULL, picking_deadline DATE NOT NULL,
 status ENUM('draft','registration_open','registration_closed','picking_open','exchange_active','completed','cancelled') NOT NULL DEFAULT 'registration_open',
 round INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(organiser_id) REFERENCES users(id), INDEX(organiser_id,status)
);
CREATE TABLE IF NOT EXISTS event_members (
 id CHAR(36) PRIMARY KEY, event_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
 wishlist TEXT NULL, gift_ready BOOLEAN NOT NULL DEFAULT FALSE, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(event_id,user_id), UNIQUE(event_id,id), FOREIGN KEY(event_id) REFERENCES events(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS invitations (
 id CHAR(36) PRIMARY KEY, event_id CHAR(36) NOT NULL, email VARCHAR(254) NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, accepted_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(event_id) REFERENCES events(id)
);
CREATE TABLE IF NOT EXISTS draw_exclusions (
 event_id CHAR(36) NOT NULL, giver_id CHAR(36) NOT NULL, recipient_id CHAR(36) NOT NULL,
 PRIMARY KEY(event_id,giver_id,recipient_id),
 FOREIGN KEY(event_id,giver_id) REFERENCES event_members(event_id,id),
 FOREIGN KEY(event_id,recipient_id) REFERENCES event_members(event_id,id), CHECK(giver_id <> recipient_id)
);
CREATE TABLE IF NOT EXISTS number_pool_entries (
 event_id CHAR(36) NOT NULL, round INT NOT NULL, number INT NOT NULL, recipient_id CHAR(36) NOT NULL,
 PRIMARY KEY(event_id,round,number), UNIQUE(event_id,round,recipient_id),
 FOREIGN KEY(event_id,recipient_id) REFERENCES event_members(event_id,id)
);
CREATE TABLE IF NOT EXISTS selections (
 event_id CHAR(36) NOT NULL, round INT NOT NULL, giver_id CHAR(36) NOT NULL, number INT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id,round,giver_id), UNIQUE(event_id,round,number),
 FOREIGN KEY(event_id,round,number) REFERENCES number_pool_entries(event_id,round,number),
 FOREIGN KEY(event_id,giver_id) REFERENCES event_members(event_id,id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id CHAR(36) PRIMARY KEY, actor_id CHAR(36) NOT NULL, event_id CHAR(36) NULL,
 action VARCHAR(80) NOT NULL, detail TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(actor_id) REFERENCES users(id), INDEX(event_id,created_at)
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
 id CHAR(36) PRIMARY KEY, event_id CHAR(36) NOT NULL, recipient_email VARCHAR(254) NOT NULL,
 subject VARCHAR(200) NOT NULL, body TEXT NOT NULL,
 status ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0,
 available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at DATETIME NULL, last_error VARCHAR(500) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(event_id) REFERENCES events(id), INDEX(status,available_at)
);
