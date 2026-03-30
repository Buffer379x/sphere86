import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createThemeStore() {
	const initial = browser
		? (document.documentElement.classList.contains('light') ? 'light' : 'dark')
		: 'dark';

	const { subscribe, set, update } = writable<'dark' | 'light'>(initial);

	return {
		subscribe,
		toggle() {
			update(current => {
				const next = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					document.documentElement.classList.toggle('light', next === 'light');
					document.cookie = `theme=${next};path=/;max-age=${365 * 24 * 60 * 60}`;
				}
				return next;
			});
		},
		set(value: 'dark' | 'light') {
			set(value);
			if (browser) {
				document.documentElement.classList.toggle('light', value === 'light');
				document.cookie = `theme=${value};path=/;max-age=${365 * 24 * 60 * 60}`;
			}
		}
	};
}

export const theme = createThemeStore();
