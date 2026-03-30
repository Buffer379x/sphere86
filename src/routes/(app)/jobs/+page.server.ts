import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listJobs, deleteJob } from '$lib/server/jobs/manager.js';

export const load: PageServerLoad = async () => {
	const allJobs = await listJobs(100);
	return { jobs: allJobs };
};

export const actions: Actions = {
	deleteJob: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing job ID.' });
		const ok = await deleteJob(id);
		if (!ok) return fail(400, { error: 'Cannot delete a job that is still running.' });
		return { deleted: true };
	}
};
