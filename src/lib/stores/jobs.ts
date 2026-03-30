import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface ClientJob {
	id: string;
	type: string;
	status: string;
	progress: number;
	message: string;
	createdAt?: string;
	updatedAt?: string;
}

function createJobStore() {
	const { subscribe, update, set } = writable<ClientJob[]>([]);
	let es: EventSource | null = null;

	function connect() {
		if (!browser || es) return;
		es = new EventSource('/api/jobs/ws');

		es.onmessage = (event) => {
			try {
				const job: ClientJob = JSON.parse(event.data);
				update(jobs => {
					const idx = jobs.findIndex(j => j.id === job.id);
					if (idx >= 0) {
						jobs[idx] = job;
						return [...jobs];
					}
					return [job, ...jobs];
				});
			} catch { /* ignore malformed messages */ }
		};

		es.onerror = () => {
			// EventSource auto-reconnects by default
		};
	}

	return {
		subscribe,
		connect,
		remove(id: string) {
			update(jobs => jobs.filter(j => j.id !== id));
		},
		disconnect() {
			es?.close();
			es = null;
		}
	};
}

export const jobStore = createJobStore();
