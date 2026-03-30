import type { PageServerLoad } from './$types';
import { loadHardwareDb, isHardwareDbAvailable } from '$lib/server/86box/hardware-db.js';

export const load: PageServerLoad = async () => {
	const available = isHardwareDbAvailable();
	const hw = available ? loadHardwareDb() : null;
	return { available, hw };
};
