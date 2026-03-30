<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import { notify } from '$stores/toast';
	import JobsPanel from '$lib/components/JobsPanel.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let activeTab = $state<'general' | 'logs' | 'jobs'>('general');
	let logPaused = $state(false);
	let logContent = $derived(data.logContent || '');
	let logEl: HTMLPreElement | undefined = $state();

	$effect(() => {
		if (form?.pwError) notify('error', form.pwError);
		if (form?.pwSuccess) notify('success', 'Password changed successfully.');
		if (form?.unError) notify('error', form.unError);
		if (form?.unSuccess) notify('success', 'Username changed successfully.');
		if (form?.jobStarted) notify('info', 'Job started. Check the Jobs tab in Settings.');
		if (form?.ok === true) notify('success', form.message ?? 'Hardware database updated.');
		if (form?.ok === false) notify('error', form.message ?? 'Hardware database refresh failed.');
	});

	function downloadLog() {
		const blob = new Blob([logContent], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sphere86-${new Date().toISOString().slice(0, 10)}.log`;
		a.click();
		URL.revokeObjectURL(url);
	}

	$effect(() => {
		if (logEl && !logPaused) {
			logEl.scrollTop = logEl.scrollHeight;
		}
	});
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
		<p class="mt-1 text-sm" style="color: var(--theme-on-surface-variant);">
			Application configuration, updates, and logs
		</p>
	</div>

	{#if data.changePasswordPrompt}
		<div class="text-sm py-3 px-4 rounded-md"
			 style="background: color-mix(in srgb, var(--theme-warning) 15%, transparent); color: var(--theme-warning);">
			<strong>Security Notice:</strong> You are using the default password. Please change it now.
		</div>
	{/if}

	<div class="flex gap-1 p-1 rounded-lg" style="background: var(--theme-surface-low);">
		<button onclick={() => activeTab = 'general'}
				class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors"
				style="background: {activeTab === 'general' ? 'var(--theme-surface-high)' : 'transparent'};
					   color: {activeTab === 'general' ? 'var(--theme-on-surface)' : 'var(--theme-on-surface-variant)'};">
			General
		</button>
		<button onclick={() => activeTab = 'logs'}
				class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors"
				style="background: {activeTab === 'logs' ? 'var(--theme-surface-high)' : 'transparent'};
					   color: {activeTab === 'logs' ? 'var(--theme-on-surface)' : 'var(--theme-on-surface-variant)'};">
			Logs
		</button>
		<button onclick={() => activeTab = 'jobs'}
				class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors"
				style="background: {activeTab === 'jobs' ? 'var(--theme-surface-high)' : 'transparent'};
					   color: {activeTab === 'jobs' ? 'var(--theme-on-surface)' : 'var(--theme-on-surface-variant)'};">
			Jobs
		</button>
	</div>

	{#if activeTab === 'general'}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div class="card-elevated">
				<h2 class="text-base font-semibold mb-4">Change Username</h2>

				{#if form?.unError}
					<div class="text-sm py-2 px-3 rounded-md mb-3"
						 style="background: color-mix(in srgb, var(--theme-error) 15%, transparent); color: var(--theme-error);">
						{form.unError}
					</div>
				{/if}
				{#if form?.unSuccess}
					<div class="text-sm py-2 px-3 rounded-md mb-3"
						 style="background: color-mix(in srgb, var(--theme-success) 15%, transparent); color: var(--theme-success);">
						Username changed successfully.
					</div>
				{/if}

				<form method="POST" action="?/changeUsername" use:enhance class="space-y-4">
					<div>
						<label for="newUsername" class="label">New Username</label>
						<input id="newUsername" name="newUsername" type="text" required minlength="2"
							   class="input-field" placeholder={data.currentUsername} value={data.currentUsername} />
					</div>
					<button type="submit" class="btn-primary text-sm">Update Username</button>
				</form>
			</div>

			<div class="card-elevated">
				<h2 class="text-base font-semibold mb-4">Change Password</h2>

				{#if form?.pwError}
					<div class="text-sm py-2 px-3 rounded-md mb-3"
						 style="background: color-mix(in srgb, var(--theme-error) 15%, transparent); color: var(--theme-error);">
						{form.pwError}
					</div>
				{/if}
				{#if form?.pwSuccess}
					<div class="text-sm py-2 px-3 rounded-md mb-3"
						 style="background: color-mix(in srgb, var(--theme-success) 15%, transparent); color: var(--theme-success);">
						Password changed successfully.
					</div>
				{/if}

				<form method="POST" action="?/changePassword" use:enhance class="space-y-4">
					<div>
						<label for="newPassword" class="label">New Password</label>
						<input id="newPassword" name="newPassword" type="password" required minlength="6"
							   class="input-field" placeholder="Min. 6 characters" />
					</div>
					<div>
						<label for="confirmPassword" class="label">Confirm Password</label>
						<input id="confirmPassword" name="confirmPassword" type="password" required
							   class="input-field" placeholder="Repeat password" />
					</div>
					<button type="submit" class="btn-primary text-sm">Update Password</button>
				</form>
			</div>
		</div>

		<div class="card-elevated">
			<h2 class="text-base font-semibold mb-4">System</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div class="space-y-1">
					<p class="text-xs uppercase tracking-wider" style="color: var(--theme-on-surface-variant);">App Version</p>
					<p class="text-sm font-mono" style="color: var(--theme-primary);">{data.settings.app_version || '2.0.0'}</p>
				</div>
				<div class="space-y-1">
					<p class="text-xs uppercase tracking-wider" style="color: var(--theme-on-surface-variant);">Data Root</p>
					<p class="text-sm font-mono">{data.shareRoot}</p>
				</div>
			</div>
			<p class="text-xs mt-4" style="color: var(--theme-on-surface-variant);">
				Container health is checked by Docker Compose (<span class="font-mono">healthcheck</span> → <span class="font-mono">GET /api/health</span>).
			</p>
			<div class="mt-5 pt-4" style="border-top: 1px solid color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				<form method="POST" action="?/logout" use:enhance={() => {
					return async () => { goto('/login'); };
				}}>
					<button type="submit" class="text-sm font-medium" style="color: var(--theme-error);">Sign Out</button>
				</form>
			</div>
		</div>

		<div class="card-elevated">
			<h2 class="text-base font-semibold mb-4">Hardware database</h2>
			<p class="text-sm mb-3" style="color: var(--theme-on-surface-variant);">
				Downloads 86Box source and regenerates <span class="font-mono text-xs">86box_hardware_db.json</span> for the Hardware DB page.
			</p>
			<p class="text-xs mb-3" style="color: var(--theme-on-surface-variant);">
				Status: {data.hardwareDbAvailable ? 'JSON file present' : 'Not generated yet'}
			</p>
			<form method="POST" action="?/refreshHardwareDb" use:enhance>
				<button type="submit" class="btn-secondary text-sm">Refresh / Generate hardware DB</button>
			</form>
		</div>

		<div class="card-elevated">
			<h2 class="text-base font-semibold mb-4">86Box Updates</h2>

			{#if form?.jobStarted}
				<div class="text-sm py-2 px-3 rounded-md mb-4"
					 style="background: color-mix(in srgb, var(--theme-primary) 15%, transparent); color: var(--theme-primary);">
					Job started. Open the <button type="button" class="underline font-medium" style="color: inherit;" onclick={() => (activeTab = 'jobs')}>Jobs</button> tab for progress.
				</div>
			{/if}

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="space-y-3">
					<h3 class="text-sm font-semibold" style="color: var(--theme-primary);">86Box Binary</h3>
					{#if data.latestRelease}
						<p class="text-sm">Latest: <span class="font-mono" style="color: var(--theme-primary);">{data.latestRelease.tag}</span></p>
						<p class="text-xs" style="color: var(--theme-on-surface-variant);">
							{data.latestRelease.name} &middot; {new Date(data.latestRelease.publishedAt).toLocaleDateString()}
						</p>
						<form method="POST" action="?/download86Box" use:enhance>
							<button type="submit" class="btn-secondary text-sm">Download Latest 86Box</button>
						</form>
					{:else}
						<p class="text-sm" style="color: var(--theme-on-surface-variant);">Could not fetch release info.</p>
					{/if}
				</div>

				<div class="space-y-3">
					<h3 class="text-sm font-semibold" style="color: var(--theme-primary);">ROM Set</h3>
					{#if data.latestRoms}
						<p class="text-sm">Latest: <span class="font-mono" style="color: var(--theme-primary);">{data.latestRoms.tag}</span></p>
						<p class="text-xs" style="color: var(--theme-on-surface-variant);">
							{data.latestRoms.name} &middot; {new Date(data.latestRoms.publishedAt).toLocaleDateString()}
						</p>
						<form method="POST" action="?/downloadRoms" use:enhance>
							<button type="submit" class="btn-secondary text-sm">Download & Extract ROMs</button>
						</form>
					{:else}
						<p class="text-sm" style="color: var(--theme-on-surface-variant);">Could not fetch ROM set info.</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'jobs'}
		<div class="card-elevated">
			<p class="text-sm mb-4" style="color: var(--theme-on-surface-variant);">
				Background downloads and deployments.
			</p>
			<JobsPanel jobs={data.jobs} showHeading={false} />
		</div>
	{/if}

	{#if activeTab === 'logs'}
		<div class="card-elevated">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
				<div class="min-w-0 flex-1">
					<h2 class="text-base font-semibold">Application log</h2>
					<p class="text-xs mt-1 leading-relaxed" style="color: var(--theme-on-surface-variant);">
						Daily files <span class="font-mono">sphere86-YYYY-MM-DD.log</span> (UTC); same calendar day appends across restarts.
						View merges the last 7 days. Older daily files are zipped into <span class="font-mono">logs/archive/</span> (up to 30 archives, oldest removed).
						Panel actions appear as <span class="font-mono">[INFO] AUDIT</span> lines.
					</p>
				</div>
				<div class="flex gap-2 shrink-0">
					<button onclick={() => logPaused = !logPaused}
							class="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5">
						{#if logPaused}
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
							Resume
						{:else}
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>
							Pause
						{/if}
					</button>
					<button onclick={downloadLog}
							class="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5">
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
						Download .log
					</button>
				</div>
			</div>
			<pre bind:this={logEl}
				 class="text-xs font-mono p-4 rounded-lg overflow-auto"
				 style="background: var(--theme-surface-lowest); color: var(--theme-on-surface); max-height: 60vh; min-height: 300px;"
			>{logContent || 'No log entries yet. Logs are written when actions are performed.'}</pre>
		</div>
	{/if}
</div>
