import { chmodSync, readdirSync } from 'fs';
import { join } from 'path';
import { env } from '$env/dynamic/private';

function parseOctalMode(raw: string | undefined, fallback: number): number {
	if (!raw?.trim()) return fallback;
	const t = raw.trim();
	if (/^[0-7]{3,4}$/.test(t)) return parseInt(t, 8);
	const m = t.match(/^0o?([0-7]{3,4})$/);
	if (m) return parseInt(m[1], 8);
	return fallback;
}

/** Directory mode for `vms/<uuid>/` trees (default world-writable dirs so BOX_USER can write when the app runs as root in Docker). */
export function shareVmDirMode(): number {
	return parseOctalMode(env.SHARE_VM_DIR_MODE, 0o777);
}

/** File mode for `86box.cfg` etc. under the VM profile directory. */
export function shareVmFileMode(): number {
	return parseOctalMode(env.SHARE_VM_FILE_MODE, 0o666);
}

/**
 * Apply modes under one VM profile folder so the streaming host user (e.g. sphere86) can write
 * after the panel created dirs as root. chmod may no-op on some CIFS options.
 */
export function chmodVmProfileTree(vmProfileRoot: string): void {
	const dMode = shareVmDirMode();
	const fMode = shareVmFileMode();
	const walk = (abs: string) => {
		chmodSync(abs, dMode);
		for (const ent of readdirSync(abs, { withFileTypes: true })) {
			const p = join(abs, ent.name);
			if (ent.isDirectory()) walk(p);
			else chmodSync(p, fMode);
		}
	};
	try {
		walk(vmProfileRoot);
	} catch {
		// ignore (e.g. SMB noperm)
	}
}
