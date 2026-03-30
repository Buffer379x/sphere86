import { writable } from 'svelte/store';

export type ToastLevel = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
	id: string;
	level: ToastLevel;
	message: string;
	timestamp: number;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);
	let counter = 0;

	function push(level: ToastLevel, message: string, autoMs = 5000) {
		const id = `t${++counter}`;
		const toast: Toast = { id, level, message, timestamp: Date.now() };
		update(list => [...list, toast]);
		if (autoMs > 0) {
			setTimeout(() => dismiss(id), autoMs);
		}
		return id;
	}

	function dismiss(id: string) {
		update(list => list.filter(t => t.id !== id));
	}

	return {
		subscribe,
		info:    (msg: string, ms?: number) => push('info', msg, ms),
		success: (msg: string, ms?: number) => push('success', msg, ms),
		error:   (msg: string, ms?: number) => push('error', msg, ms ?? 8000),
		warning: (msg: string, ms?: number) => push('warning', msg, ms ?? 6000),
		dismiss
	};
}

export const toasts = createToastStore();

export function notify(level: ToastLevel, message: string, autoMs?: number) {
	toasts[level](message, autoMs);
}
