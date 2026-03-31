import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { migrate } from './migrate.js';
import { env } from '$env/dynamic/private';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { SPHERE86_DATA_ROOT } from '$lib/server/runtime-paths.js';

const dbPath = (env.DATABASE_URL || 'file:./data/sphere86/config/sphere86.db').replace('file:', '');
const dataRoot = SPHERE86_DATA_ROOT;

// Ensure standard folder structure
const dirs = ['vms', 'roms', 'logs', 'config', 'cache'];
for (const dir of dirs) {
	mkdirSync(join(dataRoot, dir), { recursive: true });
}
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { dataRoot };

migrate(sqlite);
