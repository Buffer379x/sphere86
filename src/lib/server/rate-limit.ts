const attempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
	const now = Date.now();
	const entry = attempts.get(key);

	if (!entry || entry.resetAt < now) {
		attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return { allowed: true, retryAfterMs: 0 };
	}

	if (entry.count >= MAX_ATTEMPTS) {
		return { allowed: false, retryAfterMs: entry.resetAt - now };
	}

	entry.count++;
	return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string): void {
	attempts.delete(key);
}

// Periodic cleanup
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of attempts) {
		if (entry.resetAt < now) attempts.delete(key);
	}
}, 60_000);
