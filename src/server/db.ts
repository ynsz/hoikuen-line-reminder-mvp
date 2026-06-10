import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config";

const dbPath = resolve(config.databasePath);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      nursery_name TEXT,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weekly_rules (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      dropoff_member_id TEXT,
      pickup_member_id TEXT,
      UNIQUE (family_id, child_id, day_of_week),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
      FOREIGN KEY (dropoff_member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY (pickup_member_id) REFERENCES members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS daily_assignments (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      date TEXT NOT NULL,
      dropoff_member_id TEXT,
      pickup_member_id TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      UNIQUE (family_id, child_id, date),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
      FOREIGN KEY (dropoff_member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY (pickup_member_id) REFERENCES members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL UNIQUE,
      previous_day_notify_time TEXT NOT NULL DEFAULT '12:00',
      morning_notify_time TEXT NOT NULL DEFAULT '06:00',
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS line_users (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      line_user_id TEXT NOT NULL UNIQUE,
      display_name TEXT,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS line_destinations (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      destination_type TEXT NOT NULL,
      destination_id TEXT NOT NULL UNIQUE,
      display_name TEXT,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );
  `);
}

export function id(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}
