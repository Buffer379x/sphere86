import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLatestRomsRelease, findRomsAsset } from '$lib/server/86box/updater.js';

export const GET: RequestHandler = async () => {
	try {
		const release = await getLatestRomsRelease();
		const romsAsset = findRomsAsset(release);
		return json({ release, romsAsset });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to fetch' }, { status: 502 });
	}
};
