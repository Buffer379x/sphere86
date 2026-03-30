import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLatest86BoxRelease, findLinuxAsset } from '$lib/server/86box/updater.js';

export const GET: RequestHandler = async () => {
	try {
		const release = await getLatest86BoxRelease();
		const linuxAsset = findLinuxAsset(release);
		return json({ release, linuxAsset });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to fetch' }, { status: 502 });
	}
};
