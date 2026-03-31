import { env } from '$env/dynamic/private';
import { dirname } from 'path';

function filePathFromDatabaseUrl(raw: string): string {
	return (raw || 'file:/data/sphere86/config/sphere86.db').replace(/^file:/, '');
}

const dbFilePath = filePathFromDatabaseUrl(env.DATABASE_URL || 'file:/data/sphere86/config/sphere86.db');

/** Sphere86 local runtime root (no SMB/NFS share dependency). */
export const SPHERE86_DATA_ROOT = env.SPHERE86_DATA_ROOT || dirname(dirname(dbFilePath));

/** 86Box executable path used by published Sunshine commands. */
export const BOX86_BINARY_PATH = env.BOX86_BINARY_PATH || '/usr/local/bin/86Box';

/** Base path for generated VM configs written by Sphere86. */
export const BOX86_CONFIG_BASE_PATH = env.BOX86_CONFIG_BASE_PATH || '/data/86box';

/** Standard ROM folder consumed by 86Box (`-R` path in published command). */
export const BOX86_ROMS_PATH = env.BOX86_ROMS_PATH || '/opt/86box/roms';

