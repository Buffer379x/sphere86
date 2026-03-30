<script lang="ts">
	interface Props {
		name: string;
		checked?: boolean;
		label?: string;
		id?: string;
		disabled?: boolean;
	}
	let { name, checked = false, label, id: idProp, disabled = false }: Props = $props();
	let id = $derived(idProp ?? name);
	let on = $state(false);
	$effect(() => {
		on = checked;
	});
</script>

<div class="flex items-center gap-3 min-h-9">
	{#if label}
		<span id="{id}-label" class="text-sm shrink-0" style="color: var(--theme-on-surface);">{label}</span>
	{/if}
	<input type="hidden" {name} value={on ? 'on' : 'off'} />
	<button
		type="button"
		{id}
		role="switch"
		aria-checked={on}
		aria-labelledby={label ? `${id}-label` : undefined}
		aria-label={label ? undefined : name}
		{disabled}
		onclick={() => {
			if (!disabled) on = !on;
		}}
		class="relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
		style="background: {on ? 'var(--theme-primary)' : 'var(--theme-surface-highest)'}; opacity: {disabled ? 0.45 : 1}; --tw-ring-color: var(--theme-primary); --tw-ring-offset-color: var(--theme-surface);"
	>
		<span
			class="pointer-events-none absolute top-0.5 left-0.5 h-6 w-6 rounded-full shadow-md transition-transform"
			style="background: var(--theme-on-primary, #fff); transform: translateX({on ? '1.25rem' : '0'});"
		></span>
	</button>
</div>
