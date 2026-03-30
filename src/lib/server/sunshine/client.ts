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

export async function addApp(host: SunshineHost, app: { name: string; cmd: string; workingDir?: string }): Promise<void> {
	const body: Record<string, string | number | boolean> = {
		name: app.name,
		output: '',
		cmd: app.cmd,
		index: -1,
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

export async function deleteApp(host: SunshineHost, index: number): Promise<void> {
	await request(host, `/api/apps/${index}`, { method: 'DELETE' });
}

export async function getConfig(host: SunshineHost): Promise<Record<string, string>> {
	return request<Record<string, string>>(host, '/api/config');
}

/**
 * Build the 86Box launch command for a Sunshine app (paths absolute on the streaming host).
 * - `-R` / `--rompath` and `-C` / `--config` are official 86Box flags (see 86Box `src/86box.c` help text).
 * - `-L` writes the 86Box log next to the VM config so you can inspect failures on the streaming host.
 * - `DISPLAY` / `QT_QPA_PLATFORM` are required so 86Box opens on the X11 session Sunshine captures.
 */
export function build86BoxCommand(
	binaryPath: string,
	configAbsolutePath: string,
	romAbsolutePath: string
): string {
	const logPath = join(dirname(configAbsolutePath), '86box-sphere86.log');
	return `env DISPLAY=:0 QT_QPA_PLATFORM=xcb "${binaryPath}" -R "${romAbsolutePath}" -C "${configAbsolutePath}" -L "${logPath}"`;
}
