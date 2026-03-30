<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const statCards = $derived([
		{ label: 'Streaming Hosts', value: data.stats.hosts, color: 'var(--theme-primary)' },
		{ label: 'Machine Profiles', value: data.stats.machines, color: 'var(--theme-secondary)' },
		{ label: 'Sunshine Apps', value: data.stats.sunshineApps, color: 'var(--theme-success)' },
		{ label: 'Active Jobs', value: data.stats.activeJobs, color: 'var(--theme-warning)' }
	]);
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
		<p class="mt-1 text-sm" style="color: var(--theme-on-surface-variant);">
			Overview of your retro emulation infrastructure
		</p>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
		{#each statCards as stat}
			<div class="card-elevated">
				<p class="text-xs font-medium uppercase tracking-wider"
				   style="color: var(--theme-on-surface-variant);">
					{stat.label}
				</p>
				<p class="text-4xl font-bold mt-2" style="color: {stat.color};">
					{stat.value}
				</p>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<div class="card">
			<h2 class="text-base font-semibold mb-4">Streaming Hosts</h2>
			{#if data.hosts.length === 0}
				<p class="text-sm" style="color: var(--theme-on-surface-variant);">
					No hosts configured. <a href="/hosts" class="underline" style="color: var(--theme-primary);">Add one</a>
				</p>
			{:else}
				<div class="space-y-3">
					{#each data.hosts as host}
						<div class="flex items-center gap-3 px-3 py-2 rounded-lg"
							 style="background: var(--theme-surface-low);">
							<div class="w-2.5 h-2.5 rounded-full {host.status === 'online' ? 'animate-pulse-glow' : ''}"
								 style="background: {host.status === 'online' ? 'var(--theme-success)' : host.status === 'offline' ? 'var(--theme-error)' : 'var(--theme-on-surface-variant)'}; color: {host.status === 'online' ? 'var(--theme-success)' : 'transparent'};">
							</div>
							<div class="flex-1 min-w-0">
								<p class="font-medium text-sm truncate">{host.name}</p>
								<p class="text-xs" style="color: var(--theme-on-surface-variant);">{host.address}:{host.port}</p>
							</div>
							<span class="text-xs px-2 py-0.5 rounded-full"
								  style="background: color-mix(in srgb, {host.status === 'online' ? 'var(--theme-success)' : 'var(--theme-on-surface-variant)'} 15%, transparent); color: {host.status === 'online' ? 'var(--theme-success)' : 'var(--theme-on-surface-variant)'};">
								{host.status}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="card">
			<h2 class="text-base font-semibold mb-4">Recent Machines</h2>
			{#if data.recentMachines.length === 0}
				<p class="text-sm" style="color: var(--theme-on-surface-variant);">
					No machines yet. <a href="/machines" class="underline" style="color: var(--theme-primary);">Create one</a>
				</p>
			{:else}
				<div class="space-y-3">
					{#each data.recentMachines as machine}
						<div class="flex items-center gap-3 px-3 py-2 rounded-lg"
							 style="background: var(--theme-surface-low);">
							<div class="flex-1 min-w-0">
								<p class="font-medium text-sm truncate">{machine.name}</p>
								<p class="text-xs" style="color: var(--theme-on-surface-variant);">{machine.description || 'No description'}</p>
							</div>
							<span class="text-xs px-2 py-0.5 rounded-full"
								  style="background: color-mix(in srgb, {machine.deployed ? 'var(--theme-success)' : 'var(--theme-warning)'} 15%, transparent); color: {machine.deployed ? 'var(--theme-success)' : 'var(--theme-warning)'};">
								{machine.deployed ? 'Deployed' : 'Draft'}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if data.activeJobs.length > 0}
		<div class="card">
			<h2 class="text-base font-semibold mb-4">Active Jobs</h2>
			<div class="space-y-3">
				{#each data.activeJobs as job}
					<div class="px-3 py-2 rounded-lg" style="background: var(--theme-surface-low);">
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm font-medium">{job.type}</span>
							<span class="text-xs" style="color: var(--theme-on-surface-variant);">{Math.round(job.progress * 100)}%</span>
						</div>
						<div class="h-1.5 rounded-full overflow-hidden" style="background: var(--theme-surface-highest);">
							<div class="h-full rounded-full transition-all duration-300"
								 style="width: {job.progress * 100}%; background: var(--theme-primary);">
							</div>
						</div>
						<p class="text-xs mt-1" style="color: var(--theme-on-surface-variant);">{job.message}</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
