import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { validateSession, ensureDefaultAdminHashed } from '$lib/server/auth.js';
import { refreshHardwareDb } from '$lib/server/86box/hardware-sync.js';
import { startHostStatusPolling } from '$lib/server/host-poll.js';
import { ensureEmbeddedHost } from '$lib/server/embedded-host.js';

let initialized = false;

const init: Handle = async ({ event, resolve }) => {
	if (!initialized) {
		await ensureDefaultAdminHashed();
		await ensureEmbeddedHost();
		// Start background hardware DB generation on first startup.
		void refreshHardwareDb(false);
		startHostStatusPolling();
		initialized = true;
	}
	return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-XSS-Protection', '1; mode=block');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return response;
};

const auth: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const user = await validateSession(sessionId);
		if (user) {
			event.locals.user = { id: user.id, username: user.username, role: user.role };
			event.locals.sessionId = sessionId;
		} else {
			event.cookies.delete('session', { path: '/' });
			event.locals.user = null;
			event.locals.sessionId = null;
		}
	} else {
		event.locals.user = null;
		event.locals.sessionId = null;
	}

	const path = event.url.pathname;

	// Public routes
	if (path === '/login' || path.startsWith('/api/auth') || path.startsWith('/api/health')) {
		return resolve(event);
	}

	// Protect everything else
	if (!event.locals.user) {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return new Response(null, {
			status: 303,
			headers: { Location: '/login' }
		});
	}

	return resolve(event);
};

export const handle = sequence(init, securityHeaders, auth);
