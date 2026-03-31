import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { settings } from '$lib/server/db/schema.js';
import { changePassword, changeUsername } from '$lib/server/auth.js';
import { getLatest86BoxRelease, getLatestRomsRelease, findLinuxAsset, findRomsAsset } from '$lib/server/86box/updater.js';
import { createJob, updateJob, listJobs, deleteJob } from '$lib/server/jobs/manager.js';
import { logAudit } from '$lib/server/audit.js';
import { readLogTail } from '$lib/server/logger.js';
import { refreshHardwareDb as regenerateHardwareDb } from '$lib/server/86box/hardware-sync.js';
import { isHardwareDbAvailable } from '$lib/server/86box/hardware-db.js';
import { streamingHosts } from '$lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import {
	getSunshineLogs,
	getConfig,
	parseSunshineScheme,
	restartSunshine,
	updateConfig,
	type SunshineHost
} from '$lib/server/sunshine/client.js';
import { embeddedHostEnabled } from '$lib/server/embedded-host.js';
import { BOX86_ROMS_PATH, SPHERE86_DATA_ROOT } from '$lib/server/runtime-paths.js';
import { getAppVersion } from '$lib/server/app-version.js';
import {
	getLatestSunshineRelease,
	getInstalledSunshineVersion,
	canRunSunshineUpdate,
	runSunshineUpdate
} from '$lib/server/sunshine/updater.js';

async function getEmbeddedHostRow() {
	const row = await db
		.select()
		.from(streamingHosts)
		.where(and(eq(streamingHosts.managed, true), eq(streamingHosts.managedKind, 'embedded')))
		.get();
	return row ?? null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const changePasswordPrompt = url.searchParams.get('changePassword') === '1';
	const logHostId = url.searchParams.get('logHost')?.trim() || '';

	let latestRelease = null;
	let latestRoms = null;
	let latestSunshine = null;
	let installedSunshineVersion: string | null = null;

	try { latestRelease = await getLatest86BoxRelease(); } catch { /* offline */ }
	try { latestRoms = await getLatestRomsRelease(); } catch { /* offline */ }
	try { latestSunshine = await getLatestSunshineRelease(); } catch { /* offline */ }
	try { installedSunshineVersion = getInstalledSunshineVersion(); } catch { /* */ }

	const allSettings = await db.select().from(settings).all();
	const settingsMap = Object.fromEntries(allSettings.map(s => [s.key, s.value]));
	const jobsList = await listJobs(100);

	const hostRows = await db.select().from(streamingHosts).all();
	const logHosts = hostRows.map((h) => ({ id: h.id, name: h.name }));
	const embeddedHost = await getEmbeddedHostRow();
	let embeddedSunshineConfig: Record<string, string> | null = null;
	let embeddedSunshineConfigError: string | null = null;

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

	if (embeddedHost) {
		const embeddedSunshineHost: SunshineHost = {
			address: embeddedHost.address,
			port: embeddedHost.port,
			username: embeddedHost.username,
			credentialEncrypted: embeddedHost.credentialEncrypted,
			tlsVerify: embeddedHost.tlsVerify,
			sunshineScheme: parseSunshineScheme(embeddedHost.sunshineScheme)
		};
		try {
			embeddedSunshineConfig = await getConfig(embeddedSunshineHost);
		} catch (err) {
			embeddedSunshineConfigError =
				err instanceof Error ? err.message : 'Failed to read Sunshine configuration.';
		}
	}

	return {
		changePasswordPrompt,
		latestRelease,
		latestRoms,
		latestSunshine,
		installedSunshineVersion,
		sunshineUpdateAvailable: canRunSunshineUpdate(),
		settings: settingsMap,
		appVersion: getAppVersion(),
		dataRoot: SPHERE86_DATA_ROOT,
		currentUsername: locals.user?.username || 'admin',
		logContent,
		logHosts,
		logHostId: logHostId || null,
		logSourceError,
		embeddedHost,
		embeddedHostEnabled: embeddedHostEnabled(),
		embeddedSunshineConfig,
		embeddedSunshineConfigError,
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

				const { writeFileSync, mkdirSync } = await import('fs');
				const { join } = await import('path');
				const dir = join(SPHERE86_DATA_ROOT, 'cache', '86box');
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

				const { writeFileSync, mkdirSync, existsSync, rmSync, realpathSync, unlinkSync } = await import('fs');
				const { join } = await import('path');
				const romsDir = BOX86_ROMS_PATH;
				const buffer = Buffer.from(await response.arrayBuffer());
				const archivePath = join(SPHERE86_DATA_ROOT, 'cache', 'roms', asset.name);
				mkdirSync(join(SPHERE86_DATA_ROOT, 'cache', 'roms'), { recursive: true });
				writeFileSync(archivePath, buffer);

				await updateJob(job.id, { progress: 0.8, message: 'Extracting ROM set...' });
				// Resolve symlinks so we refresh the persistent target folder, not the symlink node.
				const romsTargetDir = (() => {
					try {
						return realpathSync(romsDir);
					} catch {
						return romsDir;
					}
				})();
				if (existsSync(romsTargetDir)) rmSync(romsTargetDir, { recursive: true, force: true });
				mkdirSync(romsTargetDir, { recursive: true });

				if (asset.name.endsWith('.zip')) {
					const extractZip = (await import('extract-zip')).default;
					await extractZip(archivePath, { dir: romsTargetDir });
				} else if (asset.name.endsWith('.tar.gz') || asset.name.endsWith('.tgz')) {
					const { execSync } = await import('child_process');
					execSync(`tar xzf "${archivePath}" --strip-components=1 -C "${romsTargetDir}"`);
				}
				try {
					unlinkSync(archivePath);
				} catch {
					/* ignore */
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

	updateEmbeddedSunshine: async ({ request, locals }) => {
		const embeddedHost = await getEmbeddedHostRow();
		if (!embeddedHost) {
			return fail(404, { error: 'Embedded host not found.' });
		}
		const data = await request.formData();
		const apiPortRaw = data.get('apiPort')?.toString().trim() || '47990';
		const upnp = data.get('upnp')?.toString().trim() || 'off';
		const originAllowed = data.get('originWebUiAllowed')?.toString().trim() || 'lan';
		const sunshineName = data.get('sunshineName')?.toString().trim() || '';
		const doRestart = data.get('restartAfterSave') === 'on';
		const apiPort = Number(apiPortRaw);

		if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) {
			return fail(400, { embeddedConfigError: 'API port must be an integer between 1024 and 65535.' });
		}
		if (!['on', 'off'].includes(upnp)) {
			return fail(400, { embeddedConfigError: 'UPnP must be either on or off.' });
		}
		if (!['lan', 'pc', 'wan'].includes(originAllowed)) {
			return fail(400, { embeddedConfigError: 'origin_web_ui_allowed must be one of lan, pc, wan.' });
		}

		const sunshineHost: SunshineHost = {
			address: embeddedHost.address,
			port: embeddedHost.port,
			username: embeddedHost.username,
			credentialEncrypted: embeddedHost.credentialEncrypted,
			tlsVerify: embeddedHost.tlsVerify,
			sunshineScheme: parseSunshineScheme(embeddedHost.sunshineScheme)
		};

		try {
			const patch: Record<string, string> = {
				port: String(apiPort),
				upnp,
				origin_web_ui_allowed: originAllowed
			};
			if (sunshineName) patch.sunshine_name = sunshineName;
			await updateConfig(sunshineHost, patch);
			if (doRestart) {
				await restartSunshine(sunshineHost);
			}
		} catch (err) {
			return fail(502, {
				embeddedConfigError:
					err instanceof Error ? err.message : 'Failed to write Sunshine configuration.'
			});
		}

		await logAudit(
			locals.user?.id ?? null,
			'update_embedded_sunshine',
			'streaming_host',
			embeddedHost.id,
			`port=${apiPort}, upnp=${upnp}, origin_web_ui_allowed=${originAllowed}, sunshine_name=${sunshineName || '(unchanged)'}, restart=${doRestart}`
		);
		return { embeddedConfigSaved: true };
	},

	updateSunshine: async ({ locals }) => {
		if (!canRunSunshineUpdate()) {
			return fail(400, { error: 'Sunshine update is only available in embedded/container mode.' });
		}
		const job = await createJob('update_sunshine');

		(async () => {
			try {
				await updateJob(job.id, { status: 'running', message: 'Starting Sunshine update...' });
				await runSunshineUpdate((line) => {
					updateJob(job.id, { message: line }).catch(() => {});
				});
				const newVersion = getInstalledSunshineVersion();
				await updateJob(job.id, {
					status: 'completed',
					progress: 1,
					message: `Sunshine updated to ${newVersion ?? 'latest'}`,
					result: newVersion ?? 'updated'
				});
			} catch (err) {
				await updateJob(job.id, {
					status: 'failed',
					message: err instanceof Error ? err.message : 'Unknown error'
				});
			}
		})();

		await logAudit(locals.user?.id ?? null, 'update_sunshine', 'system', job.id);
		return { jobStarted: true, jobId: job.id };
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
