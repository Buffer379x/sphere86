import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyLogin, createSession } from '$lib/server/auth.js';
import { checkRateLimit } from '$lib/server/rate-limit.js';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const { allowed, retryAfterMs } = checkRateLimit(`login:${ip}`);
	if (!allowed) {
		return json({ error: 'Too many attempts.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } });
	}

	const { username, password } = await request.json();
	if (!username || !password) {
		return json({ error: 'Missing credentials.' }, { status: 400 });
	}

	const user = await verifyLogin(username, password);
	if (!user) {
		return json({ error: 'Invalid credentials.' }, { status: 401 });
	}

	const sessionId = await createSession(user.id);
	cookies.set('session', sessionId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 7 * 24 * 60 * 60
	});

	return json({ ok: true, mustChangePassword: user.mustChangePassword });
};
