import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index.js';
import { streamingHosts, machineProfiles, jobs, sunshineAppLinks } from '$lib/server/db/schema.js';
import { eq, count } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [hostCount] = await db.select({ value: count() }).from(streamingHosts);
	const [machineCount] = await db.select({ value: count() }).from(machineProfiles);
	const [linkedCount] = await db.select({ value: count() }).from(sunshineAppLinks);

	const hosts = await db.select().from(streamingHosts).all();
	const recentMachines = await db.select().from(machineProfiles).limit(5).all();
	const activeJobs = await db.select().from(jobs)
		.where(eq(jobs.status, 'running'))
		.limit(10).all();

	return {
		stats: {
			hosts: hostCount.value,
			machines: machineCount.value,
			sunshineApps: linkedCount.value,
			activeJobs: activeJobs.length
		},
		hosts,
		recentMachines,
		activeJobs
	};
};
