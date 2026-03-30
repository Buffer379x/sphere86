import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { verifyLogin, createSession } from '$lib/server/auth.js';
import { checkRateLimit } from '$lib/server/rate-limit.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/dashboard');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const ip = getClientAddress();
		const { allowed, retryAfterMs } = checkRateLimit(`login:${ip}`);
		if (!allowed) {
			return fail(429, {
				error: `Too many attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minutes.`
			});
		}

		const data = await request.formData();
		const username = data.get('username')?.toString().trim() || '';
		const password = data.get('password')?.toString() || '';

		if (!username || !password) {
			return fail(400, { error: 'Username and password are required.' });
		}

		const user = await verifyLogin(username, password);
		if (!user) {
			return fail(401, { error: 'Invalid credentials.' });
		}

		const sessionId = await createSession(user.id);
		cookies.set('session', sessionId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false, // set true in production behind reverse proxy
			maxAge: 7 * 24 * 60 * 60
		});

		throw redirect(303, user.mustChangePassword ? '/settings?changePassword=1' : '/dashboard');
	}
};
