import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Docker / OrbStack / reverse proxies often make Origin and request URL differ
		// (localhost vs 127.0.0.1, internal hostnames). Without this, POST actions return
		// 403 and the login form appears to do nothing with use:enhance.
		csrf: {
			trustedOrigins: ['*']
		},
		adapter: adapter({
			out: 'build',
			precompress: true
		}),
		alias: {
			$components: 'src/lib/components',
			$server: 'src/lib/server',
			$stores: 'src/lib/stores'
		}
	}
};

export default config;
