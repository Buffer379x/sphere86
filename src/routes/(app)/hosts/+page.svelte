<script lang="ts">
	import ToggleSwitch from '$lib/components/ToggleSwitch.svelte';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { notify } from '$stores/toast';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showCreate = $state(false);
	let editingId = $state<string | null>(null);
	let deleteHostOpen = $state(false);
	let deleteHostMessage = $state('');
	let hostFormToSubmit: HTMLFormElement | null = $state(null);

	function getEditHost() {
		return data.hosts.find(h => h.id === editingId);
	}

	let sortedHosts = $derived([...data.hosts].sort((a, b) => a.name.localeCompare(b.name)));

	$effect(() => {
		if (form?.error) notify('error', form.error);
		if (form?.testError) notify('error', `Connection failed: ${form.testError}`);
		if (form?.testSuccess) notify('success', 'Connection successful!');
		if (form?.restartError) notify('error', `Restart failed: ${form.restartError}`);
		if (form?.restartSuccess) notify('success', 'Sunshine restart requested.');
	});

	$effect(() => {
		const a = form?.hostAction;
		if (a === 'created' || a === 'updated') {
			showCreate = false;
			editingId = null;
		}
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Sunshine Hosts</h1>
			<p class="mt-1 text-sm" style="color: var(--theme-on-surface-variant);">
				Manage Sunshine streaming servers for Moonlight access
			</p>
		</div>
		<button class="btn-primary text-sm" onclick={() => { showCreate = !showCreate; editingId = null; }}>
			{showCreate ? 'Cancel' : '+ Add Host'}
		</button>
	</div>

	{#if data.hosts.length === 0 && !showCreate}
		<div class="card text-center py-12">
			<p class="text-base" style="color: var(--theme-on-surface-variant);">No streaming hosts configured</p>
			<p class="text-sm mt-1" style="color: var(--theme-on-surface-variant);">
				Add a Sunshine server to start managing 86Box instances
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each sortedHosts as host}
				<div class="card-elevated flex items-center gap-4">
					<div class="w-3 h-3 rounded-full flex-shrink-0 {host.status === 'online' ? 'animate-pulse-glow' : ''}"
						 style="background: {host.status === 'online' ? 'var(--theme-success)' : host.status === 'offline' ? 'var(--theme-error)' : 'var(--theme-on-surface-variant)'}; color: {host.status === 'online' ? 'var(--theme-success)' : 'transparent'};">
					</div>

					<div class="flex-1 min-w-0">
						<p class="font-medium">{host.name}</p>
						<p class="text-sm" style="color: var(--theme-on-surface-variant);">
							<a
								href={host.sunshineOpenUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="font-mono underline decoration-from-font hover:opacity-90"
								style="color: var(--theme-primary);"
								title="Open Sunshine UI (sign in manually)"
							>
								{host.address}:{host.port}
							</a>
							<span class="mx-1">&middot;</span>
							{host.configBasePath}
						</p>
					</div>

					{#if host.sunshineVersion}
						<span class="text-xs px-2 py-1 rounded-full"
							  style="background: color-mix(in srgb, var(--theme-secondary) 15%, transparent); color: var(--theme-secondary);">
							Sunshine {host.sunshineVersion}
						</span>
					{/if}

					<div class="flex gap-2 flex-wrap">
						<form method="POST" action="?/test" use:enhance>
							<input type="hidden" name="id" value={host.id} />
							<button type="submit" class="btn-secondary text-xs py-1 px-3">Test</button>
						</form>
						<form method="POST" action="?/restartSunshine" use:enhance>
							<input type="hidden" name="id" value={host.id} />
							<button type="submit" class="btn-secondary text-xs py-1 px-3" title="POST /api/restart on this host">
								Restart Sunshine
							</button>
						</form>
						<button class="btn-secondary text-xs py-1 px-3"
								onclick={() => { editingId = host.id; showCreate = false; }}>
							Edit
						</button>
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={host.id} />
							<button
								type="button"
								class="btn-secondary text-xs py-1 px-3"
								style="color: var(--theme-error); border-color: color-mix(in srgb, var(--theme-error) 30%, transparent);"
								onclick={(e) => {
									const f = (e.currentTarget as HTMLButtonElement).closest('form');
									if (!f) return;
									hostFormToSubmit = f;
									deleteHostMessage = `Delete Sunshine host “${host.name}”? This cannot be undone.`;
									deleteHostOpen = true;
								}}
							>
								Delete
							</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={deleteHostOpen}
	title="Delete Sunshine host"
	message={deleteHostMessage}
	confirmLabel="Delete"
	onConfirm={() => hostFormToSubmit?.requestSubmit()}
/>

{#if showCreate || editingId}
	{@const editing = getEditHost()}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: color-mix(in srgb, var(--theme-surface) 60%, transparent); backdrop-filter: blur(6px);"
		onkeydown={(e) => { if (e.key === 'Escape') { showCreate = false; editingId = null; } }}
		onclick={(e) => { if (e.target === e.currentTarget) { showCreate = false; editingId = null; } }}
	>
		<div
			class="w-full max-w-2xl rounded-xl border shadow-2xl flex flex-col"
			style="max-height: 85vh; background: var(--theme-surface); border-color: color-mix(in srgb, var(--color-outline-variant) 22%, transparent);"
		>
			<div
				class="flex items-center justify-between px-6 py-4 shrink-0 border-b"
				style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent);"
			>
				<h2 class="text-base font-semibold">
					{editingId ? 'Edit Host' : 'New Streaming Host'}
				</h2>
				<button
					class="p-1.5 rounded-lg transition-colors"
					style="color: var(--theme-on-surface-variant);"
					onclick={() => { showCreate = false; editingId = null; }}
					title="Close"
				>
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			</div>
			<form method="POST" action={editingId ? '?/update' : '?/create'} use:enhance class="flex-1 overflow-y-auto p-6">
				{#if editingId}
					<input type="hidden" name="id" value={editingId} />
				{/if}

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="name" class="label">Name</label>
						<input id="name" name="name" type="text" required class="input-field"
							   placeholder="My Streaming VM" value={editing?.name ?? ''} />
					</div>
					<div>
						<label for="address" class="label">Address (IP / Hostname)</label>
						<input id="address" name="address" type="text" required class="input-field"
							   placeholder="192.168.1.100" value={editing?.address ?? ''} />
					</div>
					<div>
						<label for="port" class="label">Sunshine Port</label>
						<input id="port" name="port" type="number" class="input-field"
							   placeholder="47990" value={editing?.port ?? 47990} />
					</div>
					<div>
						<label for="sunshineScheme" class="label">Sunshine API URL scheme</label>
						<select
							id="sunshineScheme"
							name="sunshineScheme"
							class="input-field"
							value={editing?.sunshineScheme ?? 'auto'}
						>
							<option value="auto">Auto (HTTPS first, then HTTP)</option>
							<option value="http">HTTP only</option>
							<option value="https">HTTPS only</option>
						</select>
						<p class="text-xs mt-1" style="color: var(--theme-on-surface-variant);">
							Use Auto or HTTP only when Sunshine is reachable without TLS (typical on a LAN).
						</p>
					</div>
					<div>
						<label for="username" class="label">Username</label>
						<input id="username" name="username" type="text" class="input-field"
							   placeholder="admin" value={editing?.username ?? 'admin'} />
					</div>
					<div>
						<label for="password" class="label">Password / PIN</label>
						<input id="password" name="password" type="password" class="input-field"
							   placeholder={editingId ? '(unchanged)' : 'Sunshine password'} />
					</div>
					<div>
						<label for="configBasePath" class="label">Config Base Path (on host)</label>
						<input id="configBasePath" name="configBasePath" type="text" class="input-field"
							   placeholder="/opt/86box/configs" value={editing?.configBasePath ?? '/opt/86box/configs'} />
					</div>
					<div>
						<label for="binaryPath" class="label">86Box Binary Path</label>
						<input id="binaryPath" name="binaryPath" type="text" class="input-field"
							   placeholder="/usr/local/bin/86Box" value={editing?.binaryPath ?? '/usr/local/bin/86Box'} />
					</div>
					<div class="pt-5">
						<ToggleSwitch
							id="tlsVerify"
							name="tlsVerify"
							checked={editing?.tlsVerify ?? false}
							label="Verify TLS certificate"
						/>
					</div>
				</div>

				<div class="flex justify-end gap-3 pt-6">
					<button type="button" class="btn-tertiary text-sm"
							onclick={() => { showCreate = false; editingId = null; }}>
						Cancel
					</button>
					<button type="submit" class="btn-primary text-sm">
						{editingId ? 'Save Changes' : 'Add Host'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
