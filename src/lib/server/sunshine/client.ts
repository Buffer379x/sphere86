import { dirname, join } from 'path';
import { decrypt } from '../crypto/index.js';
import { Agent } from 'undici';

export type SunshineScheme = 'auto' | 'http' | 'https';

export function parseSunshineScheme(raw: string | null | undefined): SunshineScheme {
	if (raw === 'http' || raw === 'https' || raw === 'auto') return raw;
	return 'auto';
}

export interface SunshineHost {
	address: string;
	port: number;
	username: string;
	credentialEncrypted: string;
	tlsVerify: boolean;
	/** Default `auto`: try HTTPS first, then HTTP (LAN installs often use HTTP only). */
	sunshineScheme?: SunshineScheme;
}

export interface SunshineApp {
	name: string;
	output: string;
	cmd: string;
	index?: number;
	'image-path'?: string;
}

interface SunshineAppsResponse {
	env: Record<string, string>;
	apps: SunshineApp[];
}

class SunshineHttpError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SunshineHttpError';
	}
}

function schemesToTry(host: SunshineHost): ('http' | 'https')[] {
	const s = host.sunshineScheme ?? 'auto';
	if (s === 'http') return ['http'];
	if (s === 'https') return ['https'];
	return ['https', 'http'];
}

function authHeaders(host: SunshineHost): HeadersInit {
	const password = decrypt(host.credentialEncrypted);
	const credentials = Buffer.from(`${host.username}:${password}`).toString('base64');
	return {
		Authorization: `Basic ${credentials}`,
		'Content-Type': 'application/json'
	};
}

async function request<T>(host: SunshineHost, path: string, options: RequestInit = {}): Promise<T> {
	const trySchemes = schemesToTry(host);
	let lastErr: Error | null = null;

	for (const scheme of trySchemes) {
		const url = `${scheme}://${host.address}:${host.port}${path}`;
		const fetchOptions: RequestInit = {
			...options,
			headers: {
				...authHeaders(host),
				...options.headers
			}
		};

		if (scheme === 'https' && !host.tlsVerify) {
			(fetchOptions as { dispatcher?: Agent }).dispatcher = new Agent({
				connect: { rejectUnauthorized: false }
			});
		}

		try {
			const response = await fetch(url, fetchOptions);

			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new SunshineHttpError(`Sunshine API ${response.status}: ${text || response.statusText}`);
			}

			const contentType = response.headers.get('content-type');
			if (contentType?.includes('application/json')) {
				return response.json() as Promise<T>;
			}
			return response.text() as unknown as T;
		} catch (err) {
			if (err instanceof SunshineHttpError) {
				throw err;
			}
			lastErr = err instanceof Error ? err : new Error(String(err));
			continue;
		}
	}

	throw lastErr ?? new Error('fetch failed');
}

export async function testConnection(host: SunshineHost): Promise<{ ok: boolean; version?: string; error?: string }> {
	try {
		await request<SunshineAppsResponse>(host, '/api/apps');
		return { ok: true, version: 'connected' };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
	}
}

/** Sunshine log file via Web UI API (GET /api/logs, text/plain). */
export async function getSunshineLogs(host: SunshineHost): Promise<string> {
	return request<string>(host, '/api/logs');
}

/**
 * Restarts the Sunshine process (POST /api/restart).
 * Server-side fetch sends no Origin/Referer, so CSRF is not required (see Sunshine confighttp.cpp).
 */
export async function restartSunshine(host: SunshineHost): Promise<void> {
	await request(host, '/api/restart', {
		method: 'POST',
		body: '{}'
	});
}

export async function getApps(host: SunshineHost): Promise<SunshineApp[]> {
	const result = await request<SunshineAppsResponse>(host, '/api/apps');
	return result.apps || [];
}

/** POST /api/apps — `index: -1` creates a new entry; a non-negative index updates that app (Sunshine has no separate PUT). */
export async function saveSunshineApp(
	host: SunshineHost,
	app: { name: string; cmd: string; workingDir?: string; index: number }
): Promise<void> {
	const body: Record<string, string | number | boolean> = {
		name: app.name,
		output: '',
		cmd: app.cmd,
		index: app.index,
		'exclude-global-prep-cmd': false,
		elevated: false,
		/** If true, Sunshine treats a process that exits with 0 within 5s as a detached “success” (hardcoded in Sunshine process.cpp). Set false so an early 86Box exit is not masked. */
		'auto-detach': false,
		'wait-all': true,
		'exit-timeout': 60
	};

	if (app.workingDir) {
		body['working-dir'] = app.workingDir;
	}

	await request(host, '/api/apps', {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export async function addApp(host: SunshineHost, app: { name: string; cmd: string; workingDir?: string }): Promise<void> {
	await saveSunshineApp(host, { ...app, index: -1 });
}

function appListIndex(app: SunshineApp | undefined): number | null {
	if (app == null) return null;
	const i = app.index;
	return typeof i === 'number' && !Number.isNaN(i) ? i : null;
}

/** Find Sunshine app list index for updating an existing published app. */
export function resolveSunshineAppIndex(
	apps: SunshineApp[],
	opts: { linkAppName?: string; preferredName: string; deployPathSegment: string }
): number | null {
	const { linkAppName, preferredName, deployPathSegment } = opts;
	if (linkAppName) {
		const idx = appListIndex(apps.find((a) => a.name === linkAppName));
		if (idx !== null) return idx;
	}
	const idx2 = appListIndex(apps.find((a) => a.name === preferredName));
	if (idx2 !== null) return idx2;
	return appListIndex(apps.find((a) => (a.cmd || '').includes(deployPathSegment)));
}

export async function deleteApp(host: SunshineHost, index: number): Promise<void> {
	await request(host, `/api/apps/${index}`, { method: 'DELETE' });
}

export async function getConfig(host: SunshineHost): Promise<Record<string, string>> {
	return request<Record<string, string>>(host, '/api/config');
}

/** POST /api/config merges/updates Sunshine runtime config keys. */
export async function updateConfig(host: SunshineHost, patch: Record<string, string>): Promise<void> {
	await request(host, '/api/config', {
		method: 'POST',
		body: JSON.stringify(patch)
	});
}

/** Normalize host UI input: `:2`, `2`, `:2.0` → `:2.0` style for env DISPLAY. */
export function normalizeX11Display(raw: string | null | undefined): string {
	const t = raw?.trim() || '';
	if (!t) return ':0';
	const withColon = t.startsWith(':') ? t : `:${t}`;
	return withColon;
}

/**
 * Build the 86Box launch command for a Sunshine app (paths absolute on the streaming host).
 * - `-R` / `--rompath` and `-C` / `--config` are official 86Box flags (see 86Box `src/86box.c` help text).
 * - `-L` writes the 86Box log next to the VM config so you can inspect failures on the streaming host.
 * - `-F` / `--fullscreen` starts in fullscreen (typical for Moonlight).
 * - `x11Display` must match the active X session (`echo $DISPLAY` on the host), same as Sunshine's systemd `Environment=DISPLAY=`.
 */
export function build86BoxCommand(
	binaryPath: string,
	configAbsolutePath: string,
	romAbsolutePath: string,
	x11Display = ':0',
	startFullscreen = true
): string {
	const display = normalizeX11Display(x11Display);
	const logPath = join(dirname(configAbsolutePath), '86box-sphere86.log');
	const fsFlag = startFullscreen ? ' -F' : '';
	return `env DISPLAY=${display} QT_QPA_PLATFORM=xcb XAUTHORITY="\${XAUTHORITY:-$HOME/.Xauthority}" "${binaryPath}" -R "${romAbsolutePath}" -C "${configAbsolutePath}" -L "${logPath}"${fsFlag}`;
}
