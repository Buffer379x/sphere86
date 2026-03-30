/**
 * WebSocket server for real-time job updates.
 * Attached to the Node HTTP server when running in production (adapter-node).
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { subscribe, listJobs } from './jobs/manager.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function attachWebSocket(server: import('http').Server) {
	wss = new WebSocketServer({ server, path: '/api/jobs/ws' });

	wss.on('connection', async (ws) => {
		clients.add(ws);

		// Send current running jobs
		const active = await listJobs(20);
		for (const job of active) {
			if (job.status === 'running' || job.status === 'pending') {
				ws.send(JSON.stringify(job));
			}
		}

		ws.on('close', () => {
			clients.delete(ws);
		});
	});
}

export function broadcastJob(job: { id: string; type: string; status: string; progress: number; message: string }) {
	const msg = JSON.stringify(job);
	for (const client of clients) {
		if (client.readyState === 1) {
			client.send(msg);
		}
	}
}
