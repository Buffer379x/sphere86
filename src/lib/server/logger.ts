import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	existsSync,
	createWriteStream,
	statSync
} from 'fs';
import { basename, join } from 'path';
import archiver from 'archiver';
import { env } from '$env/dynamic/private';

const dataRoot = env.SHARE_ROOT || './data';
const logsDir = join(dataRoot, 'logs');
const archiveDir = join(logsDir, 'archive');

/** Raw daily .log files kept for this many calendar days (UTC), including today. */
const RAW_LOG_DAYS = 7;
/** Maximum number of archive zip files to retain. */
const MAX_ARCHIVE_ZIPS = 30;

mkdirSync(logsDir, { recursive: true });
mkdirSync(archiveDir, { recursive: true });

function utcYmd(d = new Date()): string {
	return d.toISOString().slice(0, 10);
}

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + deltaDays);
	return dt.toISOString().slice(0, 10);
}

function logFilePathForDate(ymd: string): string {
	return join(logsDir, `sphere86-${ymd}.log`);
}

function logFilePath(): string {
	return logFilePathForDate(utcYmd());
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const logListeners = new Set<(entry: string) => void>();

let maintenanceScheduled = false;

function scheduleLogMaintenance(): void {
	if (maintenanceScheduled) return;
	maintenanceScheduled = true;
	setImmediate(() => {
		void runLogMaintenance()
			.catch(() => {
				/* ignore */
			})
			.finally(() => {
				maintenanceScheduled = false;
			});
	});
}

function parseLogFileName(name: string): string | null {
	const m = name.match(/^sphere86-(\d{4}-\d{2}-\d{2})\.log$/);
	return m ? m[1] : null;
}

function oldestKeptLogYmd(today: string): string {
	return addCalendarDaysYmd(today, -(RAW_LOG_DAYS - 1));
}

function listLogPathsInRetentionWindow(): string[] {
	const today = utcYmd();
	const oldest = oldestKeptLogYmd(today);
	let names: string[];
	try {
		names = readdirSync(logsDir);
	} catch {
		return [];
	}
	const found: { ymd: string; path: string }[] = [];
	for (const name of names) {
		const ymd = parseLogFileName(name);
		if (!ymd || ymd < oldest || ymd > today) continue;
		found.push({ ymd, path: join(logsDir, name) });
	}
	found.sort((a, b) => a.ymd.localeCompare(b.ymd));
	return found.map((f) => f.path);
}

function zipLogFiles(absPaths: string[], destZip: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const output = createWriteStream(destZip);
		const archive = archiver('zip', { zlib: { level: 9 } });
		output.on('close', () => resolve());
		archive.on('error', (err: Error) => reject(err));
		archive.pipe(output);
		for (const p of absPaths) {
			archive.file(p, { name: basename(p) });
		}
		void archive.finalize();
	});
}

async function runLogMaintenance(): Promise<void> {
	const today = utcYmd();
	const oldestKept = oldestKeptLogYmd(today);

	let names: string[];
	try {
		names = readdirSync(logsDir);
	} catch {
		return;
	}

	const toArchive: string[] = [];
	for (const name of names) {
		const ymd = parseLogFileName(name);
		if (!ymd || ymd >= oldestKept) continue;
		const full = join(logsDir, name);
		if (statSync(full).isFile()) toArchive.push(full);
	}

	if (toArchive.length > 0) {
		let zipBase = join(archiveDir, `sphere86-archive-${today}.zip`);
		if (existsSync(zipBase)) {
			zipBase = join(archiveDir, `sphere86-archive-${today}-${Date.now()}.zip`);
		}
		await zipLogFiles(toArchive, zipBase);
		for (const p of toArchive) {
			try {
				unlinkSync(p);
			} catch {
				/* ignore */
			}
		}
	}

	let zipNames: string[];
	try {
		zipNames = readdirSync(archiveDir);
	} catch {
		return;
	}

	const zips = zipNames
		.filter((n) => n.startsWith('sphere86-archive-') && n.endsWith('.zip'))
		.map((n) => {
			const p = join(archiveDir, n);
			return { path: p, mtime: statSync(p).mtimeMs };
		})
		.sort((a, b) => a.mtime - b.mtime);

	if (zips.length <= MAX_ARCHIVE_ZIPS) return;

	const removeCount = zips.length - MAX_ARCHIVE_ZIPS;
	for (let i = 0; i < removeCount; i++) {
		try {
			unlinkSync(zips[i].path);
		} catch {
			/* ignore */
		}
	}
}

export function onLog(listener: (entry: string) => void): () => void {
	logListeners.add(listener);
	return () => logListeners.delete(listener);
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
	const ts = new Date().toISOString();
	const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
	const entry = `[${ts}] [${level}] ${message}${metaStr}`;
	try {
		appendFileSync(logFilePath(), entry + '\n');
	} catch {
		/* disk full / readonly */
	}

	for (const listener of logListeners) {
		try {
			listener(entry);
		} catch {
			/* ignore */
		}
	}

	scheduleLogMaintenance();
}

/** Read one daily log file by UTC date (YYYY-MM-DD). */
export function readLogFile(date?: string): string {
	const d = date || utcYmd();
	const path = logFilePathForDate(d);
	try {
		return readFileSync(path, 'utf-8');
	} catch {
		return '';
	}
}

/**
 * Last `lines` non-empty lines from all raw daily logs in the retention window (last 7 UTC days).
 */
export function readLogTail(lines = 200): string {
	const paths = listLogPathsInRetentionWindow();
	const chunks: string[] = [];
	for (const p of paths) {
		try {
			const c = readFileSync(p, 'utf-8');
			if (c.trim()) chunks.push(c.trimEnd());
		} catch {
			/* missing */
		}
	}
	const merged = chunks.join('\n');
	const all = merged.split('\n').filter(Boolean);
	return all.slice(-lines).join('\n');
}

scheduleLogMaintenance();
