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

export async function getApps(host: SunshineHost): Promise<SunshineApp[]> {
	const result = await request<SunshineAppsResponse>(host, '/api/apps');
	return result.apps || [];
}

export async function addApp(host: SunshineHost, app: { name: string; cmd: string; workingDir?: string }): Promise<void> {
	const body: Record<string, string | number> = {
		name: app.name,
		output: '',
		cmd: app.cmd,
		index: -1,
		'exclude-global-prep-cmd': 'false',
		elevated: 'false',
		'auto-detach': 'true',
		'wait-all': 'true',
		'exit-timeout': '5'
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
 * Build the 86Box launch command for a Sunshine app.
 * The config path is absolute on the streaming host.
 */
export function build86BoxCommand(binaryPath: string, configAbsolutePath: string): string {
	return `"${binaryPath}" -C "${configAbsolutePath}"`;
}
