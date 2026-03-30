import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { sunshineAppLinks, machineProfiles, streamingHosts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit.js';

export const load: PageServerLoad = async () => {
	const links = await db.select().from(sunshineAppLinks).all();
	const profiles = await db.select().from(machineProfiles).all();
	const hosts = await db.select().from(streamingHosts).all();

	const apps = links.map((link) => {
		const profile = profiles.find((p) => p.id === link.profileId);
		const host = hosts.find((h) => h.id === link.hostId);
		return {
			...link,
			profileName: profile?.name ?? '(deleted)',
			profileDescription: profile?.description ?? '',
			hostName: host?.name ?? '(deleted)',
			hostAddress: host ? `${host.address}:${host.port}` : ''
		};
	});

	return { apps };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing app link ID.' });

		const appName = data.get('sunshineAppName')?.toString().trim();
		const command = data.get('command')?.toString().trim();

		if (!appName) return fail(400, { error: 'App name is required.' });

		const now = new Date().toISOString();
		await db.update(sunshineAppLinks).set({
			sunshineAppName: appName,
			command: command ?? '',
			updatedAt: now
		}).where(eq(sunshineAppLinks.id, id));

		await logAudit(locals.user?.id ?? null, 'update', 'sunshine_app', id, appName);
		return { success: true, appAction: 'updated' as const };
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing app link ID.' });

		const link = await db.select().from(sunshineAppLinks).where(eq(sunshineAppLinks.id, id)).get();

		await db.delete(sunshineAppLinks).where(eq(sunshineAppLinks.id, id));

		if (link) {
			await db.update(machineProfiles).set({
				sunshineAppId: null,
				updatedAt: new Date().toISOString()
			}).where(eq(machineProfiles.id, link.profileId));
		}

		await logAudit(locals.user?.id ?? null, 'delete', 'sunshine_app', id);
		return { success: true, message: 'Application removed.' };
	}
};
