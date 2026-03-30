import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession } from '$lib/server/auth.js';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.sessionId) {
		await destroySession(locals.sessionId);
	}
	cookies.delete('session', { path: '/' });
	return json({ ok: true });
};
