import { db } from './db/index.js';
import { auditLog, users } from './db/schema.js';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { log } from './logger.js';

export async function logAudit(
	userId: string | null,
	action: string,
	entityType: string,
	entityId?: string,
	details?: string
) {
	let username: string | null = null;
	if (userId) {
		const row = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get();
		username = row?.username ?? null;
	}

	await db.insert(auditLog).values({
		id: uuid(),
		userId,
		action,
		entityType,
		entityId: entityId ?? null,
		details: details ?? null
	});

	log('INFO', 'AUDIT', {
		user: username ?? '—',
		action,
		entityType,
		entityId: entityId ?? null,
		details: details ?? null
	});
}
