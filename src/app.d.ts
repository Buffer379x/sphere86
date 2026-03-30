declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				username: string;
				role: 'admin' | 'user';
			} | null;
			sessionId: string | null;
		}
		interface Error {
			message: string;
			code?: string;
		}
	}
}

export {};
