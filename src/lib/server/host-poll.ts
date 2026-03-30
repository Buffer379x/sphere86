import { db } from '$lib/server/db/index.js';
import { streamingHosts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { testConnection, parseSunshineScheme, type SunshineHost } from '$lib/server/sunshine/client.js';

const INTERVAL_MS = 120_000;

let started = false;

async function pollAllHosts(): Promise<void> {
	const rows = await db.select().from(streamingHosts).all();
	const now = new Date().toISOString();

	for (const row of rows) {
		const sunshineHost: SunshineHost = {
			address: row.address,
			port: row.port,
			username: row.username,
			credentialEncrypted: row.credentialEncrypted,
			tlsVerify: row.tlsVerify,
			sunshineScheme: parseSunshineScheme(row.sunshineScheme)
		};

		const result = await testConnection(sunshineHost);

		await db
			.update(streamingHosts)
			.set({
				status: result.ok ? 'online' : 'offline',
				lastCheckedAt: now,
				updatedAt: now
			})
			.where(eq(streamingHosts.id, row.id));
	}
}

/** Background poll so host online/offline reflects reality without manual Test. */
export function startHostStatusPolling(): void {
	if (started) return;
	started = true;
	void pollAllHosts().catch(() => {
		/* ignore */
	});
	setInterval(() => {
		void pollAllHosts().catch(() => {
			/* ignore */
		});
	}, INTERVAL_MS);
}
