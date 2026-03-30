import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const themeCookie = cookies.get('theme') as 'dark' | 'light' | undefined;
	return {
		user: locals.user,
		theme: themeCookie || 'dark'
	};
};
