import { db } from '../db/index.js';
import { jobs } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export type JobType = 'download_86box' | 'download_roms' | 'deploy_config' | 'register_sunshine' | 'update_sunshine';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
	id: string;
	type: JobType;
	status: JobStatus;
	progress: number;
	message: string;
	result: string | null;
	createdAt?: string;
	updatedAt?: string;
}

type JobListener = (job: Job) => void;
const listeners = new Map<string, Set<JobListener>>();
const globalListeners = new Set<JobListener>();

export function subscribe(jobId: string, listener: JobListener): () => void {
	if (!listeners.has(jobId)) listeners.set(jobId, new Set());
	listeners.get(jobId)!.add(listener);
	return () => {
		listeners.get(jobId)?.delete(listener);
		if (listeners.get(jobId)?.size === 0) listeners.delete(jobId);
	};
}

function notify(job: Job) {
	listeners.get(job.id)?.forEach(fn => fn(job));
	globalListeners.forEach(fn => fn(job));
}

export function subscribeAll(listener: JobListener): () => void {
	globalListeners.add(listener);
	return () => {
		globalListeners.delete(listener);
	};
}

export async function createJob(type: JobType): Promise<Job> {
	const id = uuid();
	const now = new Date().toISOString();
	await db.insert(jobs).values({
		id, type, status: 'pending', progress: 0, message: 'Queued', createdAt: now, updatedAt: now
	});
	const job: Job = { id, type, status: 'pending', progress: 0, message: 'Queued', result: null, createdAt: now, updatedAt: now };
	notify(job);
	return job;
}

export async function updateJob(id: string, update: Partial<Pick<Job, 'status' | 'progress' | 'message' | 'result'>>): Promise<Job> {
	const now = new Date().toISOString();
	await db.update(jobs).set({ ...update, updatedAt: now }).where(eq(jobs.id, id));
	const row = await db.select().from(jobs).where(eq(jobs.id, id)).get();
	const job = rowToJob(row!);
	notify(job);
	return job;
}

function rowToJob(row: typeof jobs.$inferSelect): Job {
	return {
		id: row.id,
		type: row.type as JobType,
		status: row.status as JobStatus,
		progress: row.progress,
		message: row.message,
		result: row.result,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

export async function getJob(id: string): Promise<Job | null> {
	const row = await db.select().from(jobs).where(eq(jobs.id, id)).get();
	if (!row) return null;
	return rowToJob(row);
}

export async function listJobs(limit = 50): Promise<Job[]> {
	const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit).all();
	return rows.map(r => rowToJob(r));
}

export async function deleteJob(id: string): Promise<boolean> {
	const row = await db.select().from(jobs).where(eq(jobs.id, id)).get();
	if (!row) return false;
	if (row.status === 'running') return false;
	await db.delete(jobs).where(eq(jobs.id, id));
	return true;
}
