import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { machineProfiles, streamingHosts, sunshineAppLinks } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import {
	generateConfig,
	parseConfig,
	PRESETS,
	normalizeMachineConfig,
	machineConfigFromFormData,
	validateMachineConfig,
	type MachineConfig
} from '$lib/server/86box/config-generator.js';
import { isHardwareDbAvailable, loadHardwareDb } from '$lib/server/86box/hardware-db.js';
import { build86BoxCommand, parseSunshineScheme, type SunshineHost } from '$lib/server/sunshine/client.js';
import * as sunshineClient from '$lib/server/sunshine/client.js';
import { logAudit } from '$lib/server/audit.js';
import { v4 as uuid } from 'uuid';
import { writeFileSync, mkdirSync, unlinkSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { env } from '$env/dynamic/private';

function loadHw() {
	return isHardwareDbAvailable() ? loadHardwareDb() : null;
}

export const load: PageServerLoad = async () => {
	const machines = await db.select().from(machineProfiles).all();
	const hosts = await db.select().from(streamingHosts).all();
	const links = await db.select().from(sunshineAppLinks).all();
	const hw = isHardwareDbAvailable() ? loadHardwareDb() : null;
	return { machines, hosts, presets: PRESETS, links, hw };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim();
		const description = data.get('description')?.toString().trim() || '';
		const hostId = data.get('hostId')?.toString();

		if (!name || !hostId) return fail(400, { error: 'Name and host are required.' });

		const host = await db.select().from(streamingHosts).where(eq(streamingHosts.id, hostId)).get();
		if (!host) return fail(400, { error: 'Host not found.' });

		const hw = loadHw();
		const configMeta = normalizeMachineConfig(machineConfigFromFormData(data));
		const valErr = validateMachineConfig(configMeta, hw);
		if (valErr.length) return fail(400, { error: valErr.join(' ') });
		const configContent = generateConfig(configMeta, hw);
		const id = uuid();
		const deployPath = `vms/${id}/86box.cfg`;
		const now = new Date().toISOString();

		const dataRoot = env.SHARE_ROOT || './data';
		mkdirSync(join(dataRoot, 'vms', id, 'hdd'), { recursive: true });
		mkdirSync(join(dataRoot, 'vms', id, 'nvr'), { recursive: true });

		await db.insert(machineProfiles).values({
			id, name, description, hostId,
			configContent, configMeta: JSON.stringify(configMeta),
			deployPath, deployed: false,
			createdAt: now, updatedAt: now
		});

		await logAudit(locals.user?.id ?? null, 'create', 'machine_profile', id, name);
		return { success: true, profileAction: 'created' as const };
	},

	edit: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString().trim();
		const description = data.get('description')?.toString().trim() || '';
		const hostId = data.get('hostId')?.toString();

		if (!id || !name || !hostId) return fail(400, { error: 'ID, name, and host are required.' });

		const profile = await db.select().from(machineProfiles).where(eq(machineProfiles.id, id)).get();
		if (!profile) return fail(404, { error: 'Profile not found.' });

		const hw = loadHw();
		const configMeta = normalizeMachineConfig(machineConfigFromFormData(data));
		const valErr = validateMachineConfig(configMeta, hw);
		if (valErr.length) return fail(400, { error: valErr.join(' ') });
		const configContent = generateConfig(configMeta, hw);
		const now = new Date().toISOString();

		await db.update(machineProfiles).set({
			name, description, hostId,
			configContent, configMeta: JSON.stringify(configMeta),
			deployed: false, updatedAt: now
		}).where(eq(machineProfiles.id, id));

		await logAudit(locals.user?.id ?? null, 'edit', 'machine_profile', id, name);
		return { success: true, message: 'Configuration updated.', profileAction: 'updated' as const };
	},

	import: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim();
		const hostId = data.get('hostId')?.toString();
		const rawConfig = data.get('configContent')?.toString();

		if (!name || !hostId || !rawConfig) return fail(400, { error: 'Name, host, and config are required.' });

		const parsed = normalizeMachineConfig(parseConfig(rawConfig));
		const id = uuid();
		const now = new Date().toISOString();

		const dataRoot = env.SHARE_ROOT || './data';
		mkdirSync(join(dataRoot, 'vms', id, 'hdd'), { recursive: true });
		mkdirSync(join(dataRoot, 'vms', id, 'nvr'), { recursive: true });

		await db.insert(machineProfiles).values({
			id, name, description: 'Imported configuration',
			hostId, configContent: rawConfig, configMeta: JSON.stringify(parsed as MachineConfig),
			deployPath: `vms/${id}/86box.cfg`, deployed: false,
			createdAt: now, updatedAt: now
		});

		await logAudit(locals.user?.id ?? null, 'import', 'machine_profile', id, name);
		return { success: true, message: 'Configuration imported successfully.', profileAction: 'imported' as const };
	},

	deploy: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing profile ID.' });

		const profile = await db.select().from(machineProfiles).where(eq(machineProfiles.id, id)).get();
		if (!profile) return fail(404, { error: 'Profile not found.' });

		const host = await db.select().from(streamingHosts).where(eq(streamingHosts.id, profile.hostId)).get();
		if (!host) return fail(404, { error: 'Host not found.' });

		const dataRoot = env.SHARE_ROOT || './data';
		const fullPath = join(dataRoot, profile.deployPath);
		try {
			mkdirSync(dirname(fullPath), { recursive: true });
			writeFileSync(fullPath, profile.configContent, 'utf-8');
		} catch (err) {
			return fail(500, { error: `Failed to write config: ${err instanceof Error ? err.message : 'Unknown error'}` });
		}

		await db.update(machineProfiles).set({ deployed: true, updatedAt: new Date().toISOString() })
			.where(eq(machineProfiles.id, id));

		await logAudit(locals.user?.id ?? null, 'deploy', 'machine_profile', id, profile.name);
		return { success: true, message: 'Configuration deployed.' };
	},

	publish: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing profile ID.' });

		const profile = await db.select().from(machineProfiles).where(eq(machineProfiles.id, id)).get();
		if (!profile) return fail(404, { error: 'Profile not found.' });

		const host = await db.select().from(streamingHosts).where(eq(streamingHosts.id, profile.hostId)).get();
		if (!host) return fail(404, { error: 'Host not found.' });

		const configAbsPath = join(host.configBasePath, profile.deployPath);
		const romAbsPath = join(host.configBasePath, 'roms');
		const cmd = build86BoxCommand(host.binaryPath, configAbsPath, romAbsPath);

		const sunshineHost: SunshineHost = {
			address: host.address,
			port: host.port,
			username: host.username,
			credentialEncrypted: host.credentialEncrypted,
			tlsVerify: host.tlsVerify,
			sunshineScheme: parseSunshineScheme(host.sunshineScheme)
		};

		try {
			await sunshineClient.addApp(sunshineHost, {
				name: `86Box: ${profile.name}`, cmd, workingDir: dirname(configAbsPath)
			});
		} catch (err) {
			return fail(502, { error: `Sunshine API error: ${err instanceof Error ? err.message : 'Unknown'}` });
		}

		const linkId = uuid();
		const now = new Date().toISOString();
		await db.insert(sunshineAppLinks).values({
			id: linkId, profileId: profile.id, hostId: host.id,
			sunshineAppName: `86Box: ${profile.name}`, command: cmd,
			createdAt: now, updatedAt: now
		});

		await db.update(machineProfiles).set({ sunshineAppId: linkId, updatedAt: now })
			.where(eq(machineProfiles.id, id));

		await logAudit(locals.user?.id ?? null, 'publish_sunshine', 'machine_profile', id, profile.name);
		return { success: true, message: 'Published to Sunshine!' };
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const deleteMode = data.get('deleteMode')?.toString() || 'db_only';
		if (!id) return fail(400, { error: 'Missing profile ID.' });

		const allowed = new Set(['db_only', 'db_and_config', 'full']);
		if (!allowed.has(deleteMode)) {
			return fail(400, { error: 'Invalid delete mode.' });
		}

		const profile = await db.select().from(machineProfiles).where(eq(machineProfiles.id, id)).get();
		if (!profile) return fail(404, { error: 'Profile not found.' });

		const dataRoot = env.SHARE_ROOT || './data';
		const cfgAbs = join(dataRoot, profile.deployPath);
		const vmDirAbs = join(dataRoot, 'vms', id);

		await db.delete(machineProfiles).where(eq(machineProfiles.id, id));

		if (deleteMode === 'full') {
			try {
				if (existsSync(vmDirAbs)) rmSync(vmDirAbs, { recursive: true, force: true });
			} catch (err) {
				console.error('delete profile directory:', err);
			}
		} else if (deleteMode === 'db_and_config') {
			try {
				if (existsSync(cfgAbs)) unlinkSync(cfgAbs);
			} catch (err) {
				console.error('delete profile config file:', err);
			}
		}

		await logAudit(locals.user?.id ?? null, 'delete', 'machine_profile', id, deleteMode);
		return { success: true, message: 'Machine profile removed.' };
	}
};
