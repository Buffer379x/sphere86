import { db } from './db/index.js';
import { users, sessions } from './db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import * as argon2 from 'argon2';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_PASSWORD = 'sphere86';

export async function ensureDefaultAdminHashed(): Promise<void> {
	const admin = await db.select().from(users).where(eq(users.username, 'admin')).get();
	if (admin && admin.passwordHash === '__NEEDS_HASH__') {
		const hash = await argon2.hash(DEFAULT_PASSWORD);
		await db.update(users).set({ passwordHash: hash, updatedAt: new Date().toISOString() })
			.where(eq(users.id, admin.id));
	}
}

export async function verifyLogin(username: string, password: string) {
	const user = await db.select().from(users).where(eq(users.username, username)).get();
	if (!user) return null;

	if (user.passwordHash === '__NEEDS_HASH__') {
		await ensureDefaultAdminHashed();
		return verifyLogin(username, password);
	}

	const valid = await argon2.verify(user.passwordHash, password);
	if (!valid) return null;

	return { id: user.id, username: user.username, role: user.role as 'admin' | 'user', mustChangePassword: user.mustChangePassword };
}

export async function createSession(userId: string): Promise<string> {
	const id = uuid();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
	await db.insert(sessions).values({ id, userId, expiresAt });
	return id;
}

export async function validateSession(sessionId: string) {
	const session = await db.select().from(sessions)
		.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date().toISOString())))
		.get();
	if (!session) return null;

	const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
	if (!user) return null;

	return { id: user.id, username: user.username, role: user.role as 'admin' | 'user', mustChangePassword: user.mustChangePassword };
}

export async function destroySession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
	const hash = await argon2.hash(newPassword);
	await db.update(users).set({
		passwordHash: hash,
		mustChangePassword: false,
		updatedAt: new Date().toISOString()
	}).where(eq(users.id, userId));
}

export async function changeUsername(userId: string, newUsername: string): Promise<void> {
	const existing = await db.select().from(users).where(eq(users.username, newUsername)).get();
	if (existing && existing.id !== userId) {
		throw new Error('Username already taken.');
	}
	await db.update(users).set({
		username: newUsername,
		updatedAt: new Date().toISOString()
	}).where(eq(users.id, userId));
}
