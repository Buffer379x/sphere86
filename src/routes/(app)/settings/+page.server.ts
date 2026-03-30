import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { settings } from '$lib/server/db/schema.js';
import { changePassword, changeUsername } from '$lib/server/auth.js';
import { getLatest86BoxRelease, getLatestRomsRelease, findLinuxAsset, findRomsAsset } from '$lib/server/86box/updater.js';
import { createJob, updateJob, listJobs, deleteJob } from '$lib/server/jobs/manager.js';
import { logAudit } from '$lib/server/audit.js';
import { readLogTail } from '$lib/server/logger.js';
import { env } from '$env/dynamic/private';
import { refreshHardwareDb as regenerateHardwareDb } from '$lib/server/86box/hardware-sync.js';
import { isHardwareDbAvailable } from '$lib/server/86box/hardware-db.js';
import { streamingHosts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import {
	getSunshineLogs,
	parseSunshineScheme,
	type SunshineHost
} from '$lib/server/sunshine/client.js';

export const load: PageServerLoad = async ({ url, locals }) => {
	const changePasswordPrompt = url.searchParams.get('changePassword') === '1';
	const logHostId = url.searchParams.get('logHost')?.trim() || '';

	let latestRelease = null;
	let latestRoms = null;

	try { latestRelease = await getLatest86BoxRelease(); } catch { /* offline */ }
	try { latestRoms = await getLatestRomsRelease(); } catch { /* offline */ }

	const allSettings = await db.select().from(settings).all();
	const settingsMap = Object.fromEntries(allSettings.map(s => [s.key, s.value]));
	const jobsList = await listJobs(100);

	const hostRows = await db.select().from(streamingHosts).all();
	const logHosts = hostRows.map((h) => ({ id: h.id, name: h.name }));

	let logContent = readLogTail(500);
	let logSourceError: string | null = null;

	if (logHostId) {
		const row = await db.select().from(streamingHosts).where(eq(streamingHosts.id, logHostId)).get();
		if (row) {
			const sunshineHost: SunshineHost = {
				address: row.address,
				port: row.port,
				username: row.username,
				credentialEncrypted: row.credentialEncrypted,
				tlsVerify: row.tlsVerify,
				sunshineScheme: parseSunshineScheme(row.sunshineScheme)
			};
			try {
				logContent = await getSunshineLogs(sunshineHost);
			} catch (err) {
				logSourceError = err instanceof Error ? err.message : 'Failed to load Sunshine logs.';
				logContent = '';
			}
		} else {
			logSourceError = 'Host not found.';
		}
	}

	return {
		changePasswordPrompt,
		latestRelease,
		latestRoms,
		settings: settingsMap,
		shareRoot: env.SHARE_ROOT || '(not configured)',
		currentUsername: locals.user?.username || 'admin',
		logContent,
		logHosts,
		logHostId: logHostId || null,
		logSourceError,
		jobs: jobsList,
		hardwareDbAvailable: isHardwareDbAvailable()
	};
};

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated.' });

		const data = await request.formData();
		const newPassword = data.get('newPassword')?.toString();
		const confirmPassword = data.get('confirmPassword')?.toString();

		if (!newPassword || newPassword.length < 6) {
			return fail(400, { pwError: 'Password must be at least 6 characters.' });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { pwError: 'Passwords do not match.' });
		}

		await changePassword(locals.user.id, newPassword);
		await logAudit(locals.user.id, 'change_password', 'user', locals.user.id);
		return { pwSuccess: true };
	},

	changeUsername: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated.' });

		const data = await request.formData();
		const newUsername = data.get('newUsername')?.toString().trim();

		if (!newUsername || newUsername.length < 2) {
			return fail(400, { unError: 'Username must be at least 2 characters.' });
		}

		try {
			await changeUsername(locals.user.id, newUsername);
			await logAudit(locals.user.id, 'change_username', 'user', locals.user.id, newUsername);
			return { unSuccess: true };
		} catch (err) {
			return fail(400, { unError: err instanceof Error ? err.message : 'Failed.' });
		}
	},

	download86Box: async ({ locals }) => {
		const job = await createJob('download_86box');

		(async () => {
			try {
				await updateJob(job.id, { status: 'running', message: 'Fetching release info...' });
				const release = await getLatest86BoxRelease();
				const asset = findLinuxAsset(release);

				if (!asset) {
					await updateJob(job.id, { status: 'failed', message: 'No Linux asset found in release.' });
					return;
				}

				await updateJob(job.id, { progress: 0.1, message: `Downloading ${asset.name}...` });

				const response = await fetch(asset.downloadUrl);
				if (!response.ok) throw new Error(`Download failed: ${response.status}`);

				const dataRoot = env.SHARE_ROOT || './data';
				const { writeFileSync, mkdirSync } = await import('fs');
				const { join } = await import('path');
				const dir = join(dataRoot, 'cache', '86box');
				mkdirSync(dir, { recursive: true });
				const buffer = Buffer.from(await response.arrayBuffer());
				writeFileSync(join(dir, asset.name), buffer);
				await updateJob(job.id, { status: 'completed', progress: 1, message: `Downloaded ${asset.name} (${release.tag})`, result: release.tag });
			} catch (err) {
				await updateJob(job.id, { status: 'failed', message: err instanceof Error ? err.message : 'Unknown error' });
			}
		})();

		await logAudit(locals.user?.id ?? null, 'download_86box', 'system', job.id);
		return { jobStarted: true, jobId: job.id };
	},

	downloadRoms: async ({ locals }) => {
		const job = await createJob('download_roms');

		(async () => {
			try {
				await updateJob(job.id, { status: 'running', message: 'Fetching ROM set info...' });
				const release = await getLatestRomsRelease();
				const asset = findRomsAsset(release);

				if (!asset) {
					await updateJob(job.id, { status: 'failed', message: 'No ROM set asset found.' });
					return;
				}

				await updateJob(job.id, { progress: 0.1, message: `Downloading ${asset.name}...` });

				const response = await fetch(asset.downloadUrl);
				if (!response.ok) throw new Error(`Download failed: ${response.status}`);

				const dataRoot = env.SHARE_ROOT || './data';
				const { writeFileSync, mkdirSync } = await import('fs');
				const { join } = await import('path');
				const romsDir = join(dataRoot, 'roms');
				mkdirSync(romsDir, { recursive: true });
				const buffer = Buffer.from(await response.arrayBuffer());
				writeFileSync(join(romsDir, asset.name), buffer);

				await updateJob(job.id, { progress: 0.8, message: 'Extracting ROM set...' });

				if (asset.name.endsWith('.zip')) {
					const extractZip = (await import('extract-zip')).default;
					await extractZip(join(romsDir, asset.name), { dir: romsDir });
				} else if (asset.name.endsWith('.tar.gz') || asset.name.endsWith('.tgz')) {
					const { execSync } = await import('child_process');
					execSync(`tar xzf "${join(romsDir, asset.name)}" --strip-components=1 -C "${romsDir}"`);
				}

				await updateJob(job.id, { status: 'completed', progress: 1, message: `ROMs extracted (${release.tag})`, result: release.tag });
			} catch (err) {
				await updateJob(job.id, { status: 'failed', message: err instanceof Error ? err.message : 'Unknown error' });
			}
		})();

		await logAudit(locals.user?.id ?? null, 'download_roms', 'system', job.id);
		return { jobStarted: true, jobId: job.id };
	},

	refreshHardwareDb: async ({ locals }) => {
		const result = await regenerateHardwareDb(true);
		await logAudit(
			locals.user?.id ?? null,
			'refresh_hardware_db',
			'system',
			undefined,
			result.ok ? result.message : result.message
		);
		return result;
	},

	deleteJob: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing job ID.' });
		const ok = await deleteJob(id);
		if (!ok) return fail(400, { error: 'Cannot delete a job that is still running.' });
		return { deleted: true };
	},

	logout: async ({ cookies, locals }) => {
		const { destroySession } = await import('$lib/server/auth.js');
		if (locals.sessionId) await destroySession(locals.sessionId);
		cookies.delete('session', { path: '/' });
		return { loggedOut: true };
	}
};
