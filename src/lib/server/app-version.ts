import { readFileSync } from 'fs';
import { join } from 'path';

let cachedVersion: string | null = null;

export function getAppVersion(): string {
	if (cachedVersion) return cachedVersion;
	try {
		const raw = readFileSync(join(process.cwd(), 'VERSION'), 'utf-8').trim();
		if (raw) {
			cachedVersion = raw;
			return raw;
		}
	} catch {
		// ignore and fall back
	}
	cachedVersion = '2.0.0';
	return cachedVersion;
}

