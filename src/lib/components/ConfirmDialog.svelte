<script lang="ts">
	type Props = {
		open: boolean;
		title?: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onConfirm: () => void;
		onCancel?: () => void;
	};

	let {
		open = $bindable(false),
		title = 'Confirm',
		message,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		danger = true,
		onConfirm,
		onCancel
	}: Props = $props();

	function handleCancel() {
		onCancel?.();
		open = false;
	}

	function handleConfirm() {
		onConfirm();
		open = false;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center p-4"
		style="background: color-mix(in srgb, var(--theme-surface) 55%, transparent); backdrop-filter: blur(6px);"
		onkeydown={(e) => {
			if (e.key === 'Escape') handleCancel();
		}}
		onclick={(e) => {
			if (e.target === e.currentTarget) handleCancel();
		}}
		role="presentation"
	>
		<div
			class="w-full max-w-md rounded-xl border shadow-2xl overflow-hidden"
			style="background: var(--theme-surface); border-color: color-mix(in srgb, var(--color-outline-variant) 22%, transparent);"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
		>
			<div
				class="px-6 py-4 border-b"
				style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent);"
			>
				<h2 id="confirm-dialog-title" class="text-base font-semibold">{title}</h2>
			</div>
			<div class="px-6 py-4">
				<p class="text-sm" style="color: var(--theme-on-surface-variant);">{message}</p>
			</div>
			<div
				class="flex justify-end gap-2 px-6 py-4"
				style="background: var(--theme-surface-low); border-top: 1px solid color-mix(in srgb, var(--color-outline-variant) 12%, transparent);"
			>
				<button type="button" class="btn-tertiary text-sm" onclick={handleCancel}>{cancelLabel}</button>
				<button
					type="button"
					class="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
					style={danger
						? 'background: var(--theme-error); color: #fff;'
						: 'background: var(--theme-primary); color: var(--theme-on-primary);'}
					onclick={handleConfirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
