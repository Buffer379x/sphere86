import { and, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/index.js';
import { streamingHosts } from '$lib/server/db/schema.js';
import { encrypt } from '$lib/server/crypto/index.js';
import { normalizeX11Display, parseSunshineScheme } from '$lib/server/sunshine/client.js';
import { BOX86_BINARY_PATH, BOX86_CONFIG_BASE_PATH } from '$lib/server/runtime-paths.js';

function envEnabled(raw: string | undefined): boolean {
	const v = (raw || '').trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function toPort(raw: string | undefined, fallback: number): number {
	const n = Number(raw);
	if (Number.isInteger(n) && n > 0 && n <= 65535) return n;
	return fallback;
}

export function embeddedHostEnabled(): boolean {
	return envEnabled(env.SPHERE86_EMBEDDED_HOST) || envEnabled(env.SPHERE86_SINGLE_IMAGE_MODE);
}

export async function ensureEmbeddedHost(): Promise<void> {
	if (!embeddedHostEnabled()) return;

	const now = new Date().toISOString();
	const name = (env.SPHERE86_EMBEDDED_HOST_NAME || 'Embedded Local Host').trim();
	const address = (env.SPHERE86_EMBEDDED_HOST_ADDRESS || '127.0.0.1').trim();
	const port = toPort(env.SPHERE86_EMBEDDED_HOST_PORT, 47990);
	const username = (env.SUNSHINE_WEB_USERNAME || 'admin').trim();
	const password = env.SUNSHINE_WEB_PASSWORD || 'sunshine';
	const configBasePath = (env.SPHERE86_EMBEDDED_CONFIG_BASE_PATH || BOX86_CONFIG_BASE_PATH).trim();
	const binaryPath = (env.SPHERE86_EMBEDDED_86BOX_BINARY_PATH || BOX86_BINARY_PATH).trim();
	const x11Display = normalizeX11Display(env.SPHERE86_EMBEDDED_X11_DISPLAY || ':0');
	const sunshineScheme = parseSunshineScheme(env.SPHERE86_EMBEDDED_SUNSHINE_SCHEME || 'auto');
	const tlsVerify = envEnabled(env.SPHERE86_EMBEDDED_TLS_VERIFY);
	const credentialEncrypted = encrypt(password);

	const existing = await db
		.select()
		.from(streamingHosts)
		.where(and(eq(streamingHosts.managed, true), eq(streamingHosts.managedKind, 'embedded')))
		.get();

	if (existing) {
		await db
			.update(streamingHosts)
			.set({
				name,
				address,
				port,
				username,
				credentialEncrypted,
				tlsVerify,
				sunshineScheme,
				configBasePath,
				binaryPath,
				x11Display,
				managed: true,
				managedKind: 'embedded',
				updatedAt: now
			})
			.where(eq(streamingHosts.id, existing.id));
		return;
	}

	await db.insert(streamingHosts).values({
		id: uuid(),
		name,
		managed: true,
		managedKind: 'embedded',
		address,
		port,
		username,
		credentialEncrypted,
		tlsVerify,
		sunshineScheme,
		configBasePath,
		binaryPath,
		x11Display,
		box86StartFullscreen: true,
		status: 'unknown',
		createdAt: now,
		updatedAt: now
	});
}

