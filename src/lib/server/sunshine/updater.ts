import { execSync, execFile } from 'child_process';
import { existsSync } from 'fs';

const GITHUB_SUNSHINE_RELEASES = 'https://api.github.com/repos/LizardByte/Sunshine/releases';
const GITHUB_HEADERS = {
	Accept: 'application/vnd.github.v3+json',
	'User-Agent': 'Sphere86/2.0'
};

export interface SunshineReleaseInfo {
	tag: string;
	name: string;
	url: string;
	publishedAt: string;
	assets: { name: string; downloadUrl: string; size: number }[];
}

function mapRelease(data: Record<string, unknown>): SunshineReleaseInfo {
	const assets = Array.isArray(data.assets) ? data.assets : [];
	return {
		tag: String(data.tag_name ?? ''),
		name: String(data.name ?? data.tag_name ?? ''),
		url: String(data.html_url ?? ''),
		publishedAt: String(data.published_at ?? ''),
		assets: assets.map((a: Record<string, unknown>) => ({
			name: String(a.name ?? ''),
			downloadUrl: String(a.browser_download_url ?? ''),
			size: Number(a.size ?? 0)
		}))
	};
}

export async function getLatestSunshineRelease(): Promise<SunshineReleaseInfo> {
	const res = await fetch(`${GITHUB_SUNSHINE_RELEASES}/latest`, { headers: GITHUB_HEADERS });
	if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
	return mapRelease(await res.json());
}

export function getInstalledSunshineVersion(): string | null {
	try {
		const out = execSync('sunshine --version 2>&1 || true', {
			encoding: 'utf-8',
			timeout: 5_000
		}).trim();
		const match = out.match(/v?\d+\.\d+[\w.-]*/);
		return match ? match[0] : out.split('\n')[0]?.trim() || null;
	} catch {
		return null;
	}
}

const UPDATE_SCRIPT = '/app/scripts/container/update-sunshine.sh';

export function canRunSunshineUpdate(): boolean {
	return existsSync(UPDATE_SCRIPT);
}

/**
 * Run the Sunshine update script in a child process.
 * Returns a promise that resolves with stdout on success or rejects with stderr on failure.
 */
export function runSunshineUpdate(
	onProgress?: (line: string) => void
): Promise<{ stdout: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const child = execFile('/bin/bash', [UPDATE_SCRIPT], {
			timeout: 300_000,
			env: { ...process.env }
		});

		let stdout = '';
		let stderr = '';

		child.stdout?.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			stdout += text;
			if (onProgress) {
				for (const line of text.split('\n').filter(Boolean)) {
					onProgress(line);
				}
			}
		});

		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, exitCode: code ?? 0 });
			} else {
				reject(new Error(`Update script exited with code ${code}:\n${stderr || stdout}`));
			}
		});

		child.on('error', (err) => {
			reject(err);
		});
	});
}
