<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { jobStore } from '$stores/jobs';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	type JobRow = {
		id: string;
		type: string;
		status: string;
		progress: number;
		message: string;
		createdAt: string;
	};

	let {
		jobs = [],
		showHeading = true,
		emptyVariant = 'compact'
	}: {
		jobs: JobRow[];
		showHeading?: boolean;
		/** compact = one line; detailed = large empty state (standalone Jobs page) */
		emptyVariant?: 'compact' | 'detailed';
	} = $props();

	const statusColors: Record<string, string> = {
		pending: 'var(--theme-on-surface-variant)',
		running: 'var(--theme-warning)',
		completed: 'var(--theme-success)',
		failed: 'var(--theme-error)'
	};

	let mergedJobs = $derived.by((): JobRow[] => {
		const live = $jobStore;
		const m = new Map<string, JobRow>();
		for (const j of jobs) {
			m.set(j.id, {
				id: j.id,
				type: j.type,
				status: j.status,
				progress: j.progress,
				message: j.message,
				createdAt: j.createdAt ?? ''
			});
		}
		for (const j of live) {
			const prev = m.get(j.id);
			m.set(j.id, {
				id: j.id,
				type: j.type,
				status: j.status,
				progress: j.progress,
				message: j.message,
				createdAt: prev?.createdAt ?? j.createdAt ?? ''
			});
		}
		return [...m.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	});

	function pct(p: number) {
		return Math.min(100, Math.max(0, Math.round(p <= 1 ? p * 100 : p)));
	}

	function canDismiss(status: string) {
		return status === 'completed' || status === 'failed' || status === 'pending';
	}

	let removeConfirmOpen = $state(false);
	let formToSubmit: HTMLFormElement | null = $state(null);
</script>

<div class="space-y-4">
	{#if showHeading && !(emptyVariant === 'detailed' && mergedJobs.length === 0)}
		<h2 class="text-base font-semibold">Jobs</h2>
	{/if}

	{#if mergedJobs.length === 0}
		{#if emptyVariant === 'detailed'}
			<div class="text-center py-12">
				<p class="text-base" style="color: var(--theme-on-surface-variant);">No jobs yet</p>
				<p class="text-sm mt-1" style="color: var(--theme-on-surface-variant);">
					Jobs appear here when you trigger downloads, deployments, or updates
				</p>
			</div>
		{:else}
			<p class="text-sm" style="color: var(--theme-on-surface-variant);">No jobs yet.</p>
		{/if}
	{:else}
		<div class="space-y-2 max-h-[min(70vh,32rem)] overflow-y-auto pr-1">
			{#each mergedJobs as job (job.id)}
				<div
					class="flex items-center gap-3 px-3 py-2 rounded-lg"
					style="background: var(--theme-surface-low);"
				>
					<div
						class="w-2 h-2 rounded-full shrink-0 {job.status === 'running' ? 'animate-pulse' : ''}"
						style="background: {statusColors[job.status]};"
					></div>
					<span class="text-sm font-medium shrink-0">{job.type}</span>
					<span
						class="text-xs px-2 py-0.5 rounded-full shrink-0"
						style="background: color-mix(in srgb, {statusColors[job.status]} 18%, transparent); color: {statusColors[job.status]};"
					>
						{job.status}
					</span>
					<div class="flex-1 min-w-0">
						<div class="h-1.5 rounded-full overflow-hidden mb-1" style="background: var(--theme-surface-highest);">
							<div
								class="h-full rounded-full transition-all duration-300"
								style="width: {pct(job.progress)}%; background: var(--theme-primary);"
							></div>
						</div>
						<p class="text-xs truncate" style="color: var(--theme-on-surface-variant);">{job.message}</p>
					</div>
					<span class="text-xs tabular-nums shrink-0" style="color: var(--theme-on-surface-variant);">
						{pct(job.progress)}%
					</span>
					{#if canDismiss(job.status)}
						<form
							method="POST"
							action="?/deleteJob"
							use:enhance={() => {
								return async ({ result, update }) => {
									await update({ reset: false });
									if (result.type === 'success') {
										jobStore.remove(job.id);
										await invalidateAll();
									}
								};
							}}
							class="contents"
						>
							<input type="hidden" name="id" value={job.id} />
							<button
								type="button"
								class="text-xs px-2 py-1 rounded-md transition-colors shrink-0"
								style="color: var(--theme-on-surface-variant); border: 1px solid color-mix(in srgb, var(--color-outline-variant) 35%, transparent);"
								title="Remove"
								onclick={(e) => {
									e.preventDefault();
									const f = (e.currentTarget as HTMLButtonElement).closest('form');
									if (f) {
										formToSubmit = f;
										removeConfirmOpen = true;
									}
								}}
							>
								Remove
							</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={removeConfirmOpen}
	title="Remove job"
	message="Remove this job from the list?"
	confirmLabel="Remove"
	danger={true}
	onConfirm={() => formToSubmit?.requestSubmit()}
/>
