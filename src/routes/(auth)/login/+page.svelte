<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
	let clientError = $state<string | null>(null);
</script>

<svelte:head>
	<title>Sphere86</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4"
	 style="background: var(--theme-bg);">
	<div class="w-full max-w-sm">
		<div class="flex flex-col items-center mb-10">
			<img src="/logo.png" alt="Sphere86" class="w-14 h-14 mb-4" />
			<h1 class="text-2xl font-bold tracking-tight"
				style="color: var(--theme-primary);">
				Sphere86
			</h1>
			<p class="text-sm mt-1" style="color: var(--theme-on-surface-variant);">
				Retro Emulation Orchestrator
			</p>
		</div>

		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				clientError = null;
				return async ({ result, update }) => {
					loading = false;
					if (result && typeof (result as { type?: string }).type !== 'string') {
						const msg = (result as { message?: string }).message;
						clientError =
							msg ||
							'Login request failed. Try another browser URL (same host as the address bar) or rebuild the app.';
						return;
					}
					await update();
				};
			}}
		>
			<div class="card-elevated space-y-5">
				{#if clientError}
					<div class="text-sm py-2 px-3 rounded-md"
						 style="background: color-mix(in srgb, var(--theme-error) 15%, transparent); color: var(--theme-error);">
						{clientError}
					</div>
				{/if}
				{#if form?.error}
					<div class="text-sm py-2 px-3 rounded-md"
						 style="background: color-mix(in srgb, var(--theme-error) 15%, transparent); color: var(--theme-error);">
						{form.error}
					</div>
				{/if}

				<div>
					<label for="username" class="label">Username</label>
					<input id="username" name="username" type="text" required autocomplete="username"
						   class="input-field" placeholder="admin" />
				</div>

				<div>
					<label for="password" class="label">Password</label>
					<input id="password" name="password" type="password" required autocomplete="current-password"
						   class="input-field" placeholder="••••••••" />
				</div>

				<button type="submit" class="btn-primary w-full" disabled={loading}>
					{loading ? 'Signing in...' : 'Sign In'}
				</button>

				<p class="text-xs text-center" style="color: var(--theme-on-surface-variant);">
					Default: admin / sphere86
				</p>
			</div>
		</form>
	</div>
</div>
