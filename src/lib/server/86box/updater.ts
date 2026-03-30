const GITHUB_86BOX_RELEASES = 'https://api.github.com/repos/86Box/86Box/releases';
const GITHUB_86BOX_ROMS = 'https://api.github.com/repos/86Box/roms/releases';
const GITHUB_HEADERS = {
	'Accept': 'application/vnd.github.v3+json',
	'User-Agent': 'Sphere86/2.0'
};

export interface ReleaseInfo {
	tag: string;
	name: string;
	url: string;
	publishedAt: string;
	tarballUrl: string;
	assets: { name: string; downloadUrl: string; size: number }[];
}

export async function getLatest86BoxRelease(): Promise<ReleaseInfo> {
	const res = await fetch(`${GITHUB_86BOX_RELEASES}/latest`, { headers: GITHUB_HEADERS });
	if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
	return mapRelease(await res.json());
}

export async function getLatestRomsRelease(): Promise<ReleaseInfo> {
	// Try /latest first; some repos don't have actual releases, fall back to tags
	let res = await fetch(`${GITHUB_86BOX_ROMS}/latest`, { headers: GITHUB_HEADERS });
	if (res.ok) {
		return mapRelease(await res.json());
	}

	// Fallback: list releases and pick first
	res = await fetch(GITHUB_86BOX_ROMS, { headers: GITHUB_HEADERS });
	if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
	const releases = await res.json();
	if (Array.isArray(releases) && releases.length > 0) {
		return mapRelease(releases[0]);
	}

	throw new Error('No ROM releases found');
}

function mapRelease(data: any): ReleaseInfo {
	return {
		tag: data.tag_name,
		name: data.name || data.tag_name,
		url: data.html_url,
		publishedAt: data.published_at,
		tarballUrl: data.tarball_url || '',
		assets: (data.assets || []).map((a: any) => ({
			name: a.name,
			downloadUrl: a.browser_download_url,
			size: a.size
		}))
	};
}

export function findLinuxAsset(release: ReleaseInfo): { name: string; downloadUrl: string; size: number } | null {
	return release.assets.find(a =>
		(a.name.toLowerCase().includes('linux') && a.name.toLowerCase().includes('x86_64'))
		|| a.name.endsWith('.AppImage')
	) || null;
}

export function findRomsAsset(release: ReleaseInfo): { name: string; downloadUrl: string } | null {
	// Prefer a .zip asset
	const zip = release.assets.find(a => a.name.endsWith('.zip'));
	if (zip) return { name: zip.name, downloadUrl: zip.downloadUrl };

	// Fallback: use tarball URL from the release
	if (release.tarballUrl) {
		return { name: `roms-${release.tag}.tar.gz`, downloadUrl: release.tarballUrl };
	}

	return release.assets[0] ? { name: release.assets[0].name, downloadUrl: release.assets[0].downloadUrl } : null;
}
