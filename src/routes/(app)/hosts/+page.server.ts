import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { streamingHosts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { encrypt } from '$lib/server/crypto/index.js';
import {
	testConnection,
	parseSunshineScheme,
	type SunshineHost,
	type SunshineScheme
} from '$lib/server/sunshine/client.js';
import { logAudit } from '$lib/server/audit.js';
import { v4 as uuid } from 'uuid';
import { isIPv6 } from 'node:net';

/** Browser link: explicit HTTPS/HTTP; Auto uses HTTP (typical LAN Sunshine without TLS). */
function schemeForOpenLink(scheme: SunshineScheme): 'http' | 'https' {
	if (scheme === 'https') return 'https';
	if (scheme === 'http') return 'http';
	return 'http';
}

function buildSunshineOpenUrl(host: { address: string; port: number; sunshineScheme?: string | null }): string {
	const raw = host.address.trim();
	const hostname = isIPv6(raw) ? `[${raw}]` : raw;
	const sch = schemeForOpenLink(parseSunshineScheme(host.sunshineScheme));
	return `${sch}://${hostname}:${host.port}/`;
}

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(streamingHosts).all();
	const hosts = rows.map((h) => ({
		...h,
		sunshineOpenUrl: buildSunshineOpenUrl(h)
	}));
	return { hosts };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim();
		const address = data.get('address')?.toString().trim();
		const port = parseInt(data.get('port')?.toString() || '47990');
		const username = data.get('username')?.toString().trim() || 'admin';
		const password = data.get('password')?.toString() || '';
		const tlsVerify = data.get('tlsVerify') === 'on';
		const sunshineScheme = parseSunshineScheme(data.get('sunshineScheme')?.toString());
		const configBasePath = data.get('configBasePath')?.toString().trim() || '/opt/86box/configs';
		const binaryPath = data.get('binaryPath')?.toString().trim() || '/usr/local/bin/86Box';

		if (!name || !address) {
			return fail(400, { error: 'Name and address are required.' });
		}

		const id = uuid();
		const now = new Date().toISOString();

		await db.insert(streamingHosts).values({
			id, name, address, port, username,
			credentialEncrypted: encrypt(password),
			tlsVerify, sunshineScheme, configBasePath, binaryPath,
			status: 'unknown', createdAt: now, updatedAt: now
		});

		await logAudit(locals.user?.id ?? null, 'create', 'streaming_host', id, name);
		return { success: true, hostAction: 'created' as const };
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing host ID.' });

		await db.delete(streamingHosts).where(eq(streamingHosts.id, id));
		await logAudit(locals.user?.id ?? null, 'delete', 'streaming_host', id);
		return { success: true };
	},

	test: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing host ID.' });

		const host = await db.select().from(streamingHosts).where(eq(streamingHosts.id, id)).get();
		if (!host) return fail(404, { error: 'Host not found.' });

		const sunshineHost: SunshineHost = {
			address: host.address,
			port: host.port,
			username: host.username,
			credentialEncrypted: host.credentialEncrypted,
			tlsVerify: host.tlsVerify,
			sunshineScheme: parseSunshineScheme(host.sunshineScheme)
		};

		const result = await testConnection(sunshineHost);
		const now = new Date().toISOString();

		await db.update(streamingHosts).set({
			status: result.ok ? 'online' : 'offline',
			lastCheckedAt: now,
			updatedAt: now
		}).where(eq(streamingHosts.id, id));

		if (!result.ok) {
			return fail(502, { testError: result.error || 'Connection failed' });
		}
		return { testSuccess: true };
	},

	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing host ID.' });

		const name = data.get('name')?.toString().trim();
		const address = data.get('address')?.toString().trim();
		const port = parseInt(data.get('port')?.toString() || '47990');
		const username = data.get('username')?.toString().trim() || 'admin';
		const password = data.get('password')?.toString();
		const tlsVerify = data.get('tlsVerify') === 'on';
		const sunshineScheme = parseSunshineScheme(data.get('sunshineScheme')?.toString());
		const configBasePath = data.get('configBasePath')?.toString().trim() || '/opt/86box/configs';
		const binaryPath = data.get('binaryPath')?.toString().trim() || '/usr/local/bin/86Box';

		if (!name || !address) {
			return fail(400, { error: 'Name and address are required.' });
		}

		const updateData: Record<string, unknown> = {
			name, address, port, username, tlsVerify, sunshineScheme, configBasePath, binaryPath,
			updatedAt: new Date().toISOString()
		};

		if (password) {
			updateData.credentialEncrypted = encrypt(password);
		}

		await db.update(streamingHosts).set(updateData).where(eq(streamingHosts.id, id));
		await logAudit(locals.user?.id ?? null, 'update', 'streaming_host', id, name);
		return { success: true, hostAction: 'updated' as const };
	}
};
