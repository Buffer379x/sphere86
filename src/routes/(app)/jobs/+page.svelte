<script lang="ts">
	import type { PageData } from './$types';
	import JobsPanel from '$lib/components/JobsPanel.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Jobs</h1>
		<p class="mt-1 text-sm" style="color: var(--theme-on-surface-variant);">
			Background tasks and operations
		</p>
	</div>

	<div class="card">
		<JobsPanel jobs={data.jobs} emptyVariant="detailed" />
	</div>
</div>
