<script lang="ts">
	import { toasts } from '$stores/toast';

	const levelAccent: Record<string, string> = {
		info: 'var(--theme-primary)',
		success: 'var(--theme-success)',
		error: 'var(--theme-error)',
		warning: 'var(--theme-warning)'
	};
</script>

{#if $toasts.length > 0}
	<div class="fixed bottom-5 right-5 z-50 flex flex-col-reverse gap-2 max-w-sm pointer-events-none">
		{#each $toasts as toast (toast.id)}
			{@const accent = levelAccent[toast.level] || levelAccent.info}
			<div
				class="pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 shadow-lg text-sm font-medium animate-slide-in border"
				style="background: var(--theme-surface-high); color: var(--theme-on-surface); border-color: color-mix(in srgb, var(--color-outline-variant) 40%, transparent); border-left-width: 4px; border-left-color: {accent};"
				role="alert"
			>
				<span class="flex-1 break-words" style="color: var(--theme-on-surface);">{toast.message}</span>
				<button
					onclick={() => toasts.dismiss(toast.id)}
					class="shrink-0 rounded p-0.5 transition-opacity hover:opacity-100 opacity-70"
					style="color: var(--theme-on-surface-variant);"
					aria-label="Dismiss"
				>
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	@keyframes slide-in {
		from { transform: translateX(100%); opacity: 0; }
		to   { transform: translateX(0);    opacity: 1; }
	}
	.animate-slide-in {
		animation: slide-in 0.25s ease-out;
	}
</style>
