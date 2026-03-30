import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Run migrations inline — no external migration files needed for the initial schema.
 * Each migration is idempotent (IF NOT EXISTS).
 */
export function migrate(sqlite: Database.Database) {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'user',
			must_change_password INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS streaming_hosts (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			address TEXT NOT NULL,
			port INTEGER NOT NULL DEFAULT 47990,
			username TEXT NOT NULL DEFAULT '',
			credential_encrypted TEXT NOT NULL DEFAULT '',
			tls_verify INTEGER NOT NULL DEFAULT 0,
			sunshine_scheme TEXT NOT NULL DEFAULT 'auto',
			config_base_path TEXT NOT NULL DEFAULT '/opt/86box/configs',
			binary_path TEXT NOT NULL DEFAULT '/usr/local/bin/86Box',
			status TEXT NOT NULL DEFAULT 'unknown',
			sunshine_version TEXT,
			last_checked_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS machine_profiles (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			host_id TEXT NOT NULL REFERENCES streaming_hosts(id) ON DELETE CASCADE,
			config_content TEXT NOT NULL,
			config_meta TEXT NOT NULL DEFAULT '{}',
			deploy_path TEXT NOT NULL,
			deployed INTEGER NOT NULL DEFAULT 0,
			sunshine_app_id TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sunshine_app_links (
			id TEXT PRIMARY KEY,
			profile_id TEXT NOT NULL REFERENCES machine_profiles(id) ON DELETE CASCADE,
			host_id TEXT NOT NULL REFERENCES streaming_hosts(id) ON DELETE CASCADE,
			sunshine_app_name TEXT NOT NULL,
			sunshine_app_index INTEGER,
			command TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS jobs (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			progress REAL NOT NULL DEFAULT 0,
			message TEXT NOT NULL DEFAULT '',
			result TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS audit_log (
			id TEXT PRIMARY KEY,
			user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
			action TEXT NOT NULL,
			entity_type TEXT NOT NULL,
			entity_id TEXT,
			details TEXT,
			created_at TEXT NOT NULL
		);
	`);

	ensureStreamingHostColumns(sqlite);

	seedDefaultAdmin(sqlite);
	seedDefaultSettings(sqlite);
}

function ensureStreamingHostColumns(sqlite: Database.Database) {
	const cols = sqlite.prepare('PRAGMA table_info(streaming_hosts)').all() as { name: string }[];
	const names = new Set(cols.map((c) => c.name));
	if (!names.has('sunshine_scheme')) {
		sqlite.exec(`ALTER TABLE streaming_hosts ADD COLUMN sunshine_scheme TEXT NOT NULL DEFAULT 'auto'`);
	}
	if (!names.has('x11_display')) {
		sqlite.exec(`ALTER TABLE streaming_hosts ADD COLUMN x11_display TEXT NOT NULL DEFAULT ':0'`);
	}
	if (!names.has('box86_start_fullscreen')) {
		sqlite.exec(`ALTER TABLE streaming_hosts ADD COLUMN box86_start_fullscreen INTEGER NOT NULL DEFAULT 1`);
	}
}

function seedDefaultAdmin(sqlite: Database.Database) {
	const row = sqlite.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
	if (row.cnt === 0) {
		// Default password: "sphere86" — hashed at runtime on first startup via init
		const now = new Date().toISOString();
		sqlite.prepare(
			'INSERT INTO users (id, username, password_hash, role, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		).run(uuid(), 'admin', '__NEEDS_HASH__', 'admin', 1, now, now);
	}
}

function seedDefaultSettings(sqlite: Database.Database) {
	const upsert = sqlite.prepare(
		'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
	);
	const now = new Date().toISOString();
	upsert.run('app_version', '2.0.0', now);
	upsert.run('setup_complete', 'false', now);
	upsert.run('theme', 'dark', now);
}
