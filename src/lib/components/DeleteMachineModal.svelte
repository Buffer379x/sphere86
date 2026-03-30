<script lang="ts">
	type DeleteMode = 'db_only' | 'db_and_config' | 'full';

	let {
		open = $bindable(false),
		machineName = '',
		onConfirm
	}: {
		open: boolean;
		machineName: string;
		onConfirm: (mode: DeleteMode) => void;
	} = $props();

	let mode = $state<DeleteMode>('db_only');

	$effect(() => {
		if (open) mode = 'db_only';
	});

	function cancel() {
		open = false;
	}

	function confirm() {
		onConfirm(mode);
		open = false;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center p-4"
		style="background: color-mix(in srgb, var(--theme-surface) 55%, transparent); backdrop-filter: blur(6px);"
		onkeydown={(e) => {
			if (e.key === 'Escape') cancel();
		}}
		onclick={(e) => {
			if (e.target === e.currentTarget) cancel();
		}}
		role="presentation"
	>
		<div
			class="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
			style="background: var(--theme-surface); border-color: color-mix(in srgb, var(--color-outline-variant) 22%, transparent);"
			role="dialog"
			aria-modal="true"
			aria-labelledby="del-machine-title"
		>
			<div
				class="px-6 py-4 border-b"
				style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent);"
			>
				<h2 id="del-machine-title" class="text-base font-semibold">Delete machine profile</h2>
				<p class="text-sm mt-1" style="color: var(--theme-on-surface-variant);">
					<span class="font-medium" style="color: var(--theme-on-surface);">{machineName}</span>
				</p>
			</div>
			<div class="px-6 py-4 space-y-3">
				<p class="text-sm" style="color: var(--theme-on-surface-variant);">What should be removed?</p>
				<label class="flex gap-3 items-start cursor-pointer rounded-lg p-3 border transition-colors"
					   style="border-color: {mode === 'db_only' ? 'var(--theme-primary)' : 'color-mix(in srgb, var(--color-outline-variant) 25%, transparent)'}; background: {mode === 'db_only' ? 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' : 'transparent'};">
					<input type="radio" name="delmode" bind:group={mode} value="db_only" class="mt-1" />
					<span>
						<span class="text-sm font-medium block" style="color: var(--theme-on-surface);">Database entry only</span>
						<span class="text-xs" style="color: var(--theme-on-surface-variant);">Remove the profile from Sphere86. Files on the data share are left as they are.</span>
					</span>
				</label>
				<label class="flex gap-3 items-start cursor-pointer rounded-lg p-3 border transition-colors"
					   style="border-color: {mode === 'db_and_config' ? 'var(--theme-primary)' : 'color-mix(in srgb, var(--color-outline-variant) 25%, transparent)'}; background: {mode === 'db_and_config' ? 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' : 'transparent'};">
					<input type="radio" name="delmode" bind:group={mode} value="db_and_config" class="mt-1" />
					<span>
						<span class="text-sm font-medium block" style="color: var(--theme-on-surface);">Entry + local config file</span>
						<span class="text-xs" style="color: var(--theme-on-surface-variant);">Also deletes the deployed <span class="font-mono">86box.cfg</span> under the data root (not the whole VM folder).</span>
					</span>
				</label>
				<label class="flex gap-3 items-start cursor-pointer rounded-lg p-3 border transition-colors"
					   style="border-color: {mode === 'full' ? 'var(--theme-error)' : 'color-mix(in srgb, var(--color-outline-variant) 25%, transparent)'}; background: {mode === 'full' ? 'color-mix(in srgb, var(--theme-error) 12%, transparent)' : 'transparent'};">
					<input type="radio" name="delmode" bind:group={mode} value="full" class="mt-1" />
					<span>
						<span class="text-sm font-medium block" style="color: var(--theme-error);">Everything (entire VM directory)</span>
						<span class="text-xs" style="color: var(--theme-on-surface-variant);">Deletes <span class="font-mono">vms/&lt;id&gt;/</span> recursively (config, disk images, etc.). Cannot be undone.</span>
					</span>
				</label>
			</div>
			<div
				class="flex justify-end gap-2 px-6 py-4"
				style="background: var(--theme-surface-low); border-top: 1px solid color-mix(in srgb, var(--color-outline-variant) 12%, transparent);"
			>
				<button type="button" class="btn-tertiary text-sm" onclick={cancel}>Cancel</button>
				<button
					type="button"
					class="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
					style="background: var(--theme-error); color: #fff;"
					onclick={confirm}
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
