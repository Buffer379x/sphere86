import { mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { env } from '$env/dynamic/private';
import { log } from '$lib/server/logger.js';
import { getHardwareDbPath, reloadHardwareDb } from './hardware-db.js';

const execFileAsync = promisify(execFile);
const dataRoot = env.SHARE_ROOT || './data';
const cacheDir = join(dataRoot, 'cache', '_86box_src');
const configDir = join(dataRoot, 'config');
const parserScript = join(process.cwd(), 'scripts', 'parse_86box.py');
const sourceTarball = 'https://codeload.github.com/86Box/86Box/tar.gz/refs/heads/master';

const CACHE_MAX_AGE_SECONDS = 7 * 24 * 3600;
let running = false;

export function isHardwareDbStale(): boolean {
	const dbPath = getHardwareDbPath();
	if (!existsSync(dbPath)) return true;
	const ageSec = (Date.now() - statSync(dbPath).mtimeMs) / 1000;
	return ageSec > CACHE_MAX_AGE_SECONDS;
}

export async function refreshHardwareDb(force = false): Promise<{ ok: boolean; message: string }> {
	if (running) return { ok: false, message: 'Hardware DB refresh already running.' };

	const dbPath = getHardwareDbPath();
	if (!force && !isHardwareDbStale()) {
		return { ok: true, message: 'Hardware DB is up to date.' };
	}

	running = true;
	try {
		mkdirSync(cacheDir, { recursive: true });
		mkdirSync(configDir, { recursive: true });

		log('INFO', 'Refreshing hardware DB from 86Box source');

		// Download + extract src/ from tarball into cache dir
		await execFileAsync('sh', ['-lc', [
			`rm -rf "${cacheDir}"/*`,
			`mkdir -p "${cacheDir}"`,
			`curl -L "${sourceTarball}" | tar -xz -C "${cacheDir}" --strip-components=1`
		].join(' && ')]);

		// Run parser script (legacy-compatible)
		await execFileAsync('python3', [
			parserScript,
			'--src', join(cacheDir, 'src'),
			'--out', dbPath,
			'--pretty'
		]);

		reloadHardwareDb();
		log('INFO', 'Hardware DB refresh complete', { output: dbPath });
		return { ok: true, message: 'Hardware DB generated successfully.' };
	} catch (err) {
		log('ERROR', 'Hardware DB refresh failed', { error: String(err) });
		return { ok: false, message: err instanceof Error ? err.message : 'Hardware DB refresh failed' };
	} finally {
		running = false;
	}
}

