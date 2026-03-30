<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { notify } from '$stores/toast';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let editingId = $state<string | null>(null);
	let deleteOpen = $state(false);
	let deleteMessage = $state('');
	let deleteFormEl: HTMLFormElement | null = $state(null);

	function getEditApp() {
		return data.apps.find((a) => a.id === editingId);
	}

	let sortedApps = $derived([...data.apps].sort((a, b) => a.sunshineAppName.localeCompare(b.sunshineAppName)));

	$effect(() => {
		if (form?.error) notify('error', form.error);
		if (form?.message) notify('success', form.message);
	});

	$effect(() => {
		if (form?.appAction === 'updated') {
			editingId = null;
		}
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Sunshine Applications</h1>
			<p class="mt-1 text-sm" style="color: var(--theme-on-surface-variant);">
				Published 86Box VMs on Sunshine hosts. Use <a href="/machines" class="underline font-medium" style="color: var(--theme-primary);">Virtual Machines</a> → Publish to add entries.
			</p>
		</div>
	</div>

	{#if data.apps.length === 0}
		<div class="card text-center py-12">
			<p class="text-base" style="color: var(--theme-on-surface-variant);">No published applications yet</p>
			<p class="text-sm mt-1" style="color: var(--theme-on-surface-variant);">
				Go to <a href="/machines" class="underline font-medium" style="color: var(--theme-primary);">Virtual Machines</a> and click <strong>Publish</strong> to push a VM to Sunshine.
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each sortedApps as app}
				<div class="card-elevated">
					<div class="flex items-start gap-4">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<h3 class="font-semibold">{app.sunshineAppName}</h3>
								{#if app.sunshineAppIndex != null}
									<span
										class="text-xs px-2 py-0.5 rounded-full font-mono"
										style="background: color-mix(in srgb, var(--theme-secondary) 15%, transparent); color: var(--theme-secondary);"
									>
										idx {app.sunshineAppIndex}
									</span>
								{/if}
							</div>
							<p class="text-sm mt-0.5" style="color: var(--theme-on-surface-variant);">
								VM: <span class="font-medium">{app.profileName}</span>
								{#if app.profileDescription}
									<span class="mx-1 opacity-40">·</span>
									{app.profileDescription}
								{/if}
							</p>
							<p class="text-xs mt-1" style="color: var(--theme-on-surface-variant);">
								Host: <span class="font-medium">{app.hostName}</span>
								{#if app.hostAddress}
									<span class="font-mono ml-1">({app.hostAddress})</span>
								{/if}
							</p>
							<p class="text-xs mt-0.5 font-mono" style="color: var(--theme-on-surface-variant);">
								{app.command}
							</p>
						</div>

						<div class="flex gap-2 flex-shrink-0">
							<button
								class="btn-secondary text-xs py-1 px-3"
								onclick={() => { editingId = editingId === app.id ? null : app.id; }}
							>
								{editingId === app.id ? 'Cancel' : 'Edit'}
							</button>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={app.id} />
								<button
									type="button"
									class="btn-secondary text-xs py-1 px-3"
									style="color: var(--theme-error); border-color: color-mix(in srgb, var(--theme-error) 30%, transparent);"
									onclick={(e) => {
										const f = (e.currentTarget as HTMLButtonElement).closest('form');
										if (!f) return;
										deleteFormEl = f;
										deleteMessage = `Delete application "${app.sunshineAppName}"? This will also re-enable the Publish button on the VM page.`;
										deleteOpen = true;
									}}
								>
									Delete
								</button>
							</form>
						</div>
					</div>

					{#if editingId === app.id}
						{@const ea = getEditApp()}
						<form method="POST" action="?/update" use:enhance class="mt-4 space-y-4 pt-4 border-t" style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent);">
							<input type="hidden" name="id" value={app.id} />
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label for="appName-{app.id}" class="label">App name (in Sunshine)</label>
									<input
										id="appName-{app.id}"
										name="sunshineAppName"
										type="text"
										required
										class="input-field"
										value={ea?.sunshineAppName ?? ''}
									/>
								</div>
								<div class="md:col-span-2">
									<label for="appCmd-{app.id}" class="label">Command</label>
									<input
										id="appCmd-{app.id}"
										name="command"
										type="text"
										class="input-field font-mono text-xs"
										value={ea?.command ?? ''}
									/>
								</div>
							</div>
							<div class="flex justify-end">
								<button type="submit" class="btn-primary text-sm">Save</button>
							</div>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete Sunshine application"
	message={deleteMessage}
	confirmLabel="Delete"
	onConfirm={() => deleteFormEl?.requestSubmit()}
/>
