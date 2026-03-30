import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from '$env/dynamic/private';

function getKey(): Buffer {
	const secret = env.SPHERE86_SECRET || 'change-me-in-production-use-a-random-64-char-string';
	return createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): string {
	const key = getKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [iv.toString('hex'), encrypted.toString('hex'), tag.toString('hex')].join(':');
}

export function decrypt(ciphertext: string): string {
	if (!ciphertext || !ciphertext.includes(':')) return '';
	const [ivHex, encHex, tagHex] = ciphertext.split(':');
	const key = getKey();
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
	decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
	return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}
