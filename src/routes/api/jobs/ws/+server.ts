import type { RequestHandler } from './$types';

/**
 * WebSocket endpoint for job progress streaming.
 * 
 * Note: SvelteKit doesn't natively support WebSocket upgrades.
 * In production, this is handled by the Node adapter's custom server.
 * For development, we provide a fallback SSE endpoint.
 */
export const GET: RequestHandler = async ({ request }) => {
	const { subscribeAll, listJobs } = await import('$lib/server/jobs/manager.js');

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send = (payload: unknown) => {
				if (closed) return;
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
			};

			const keepAlive = setInterval(() => {
				try {
					if (!closed) controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					clearInterval(keepAlive);
				}
			}, 15000);

			listJobs(50).then(jobs => {
				for (const job of jobs) {
					if (job.status === 'running' || job.status === 'pending') {
						send(job);
					}
				}
			});

			const unsubscribe = subscribeAll((job) => {
				send(job);
			});

			request.signal.addEventListener('abort', () => {
				closed = true;
				clearInterval(keepAlive);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// already closed
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
