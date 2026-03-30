<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/stores';
	import { theme } from '$stores/theme';
	import { jobStore } from '$stores/jobs';
	import { onMount } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let sidebarCollapsed = $state(false);

	onMount(() => {
		jobStore.connect();
		return () => jobStore.disconnect();
	});

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
		{ href: '/machines', label: 'Virtual Machines', icon: 'cpu' },
		{ href: '/hardware', label: 'Hardware DB', icon: 'library' },
		{ href: '/hosts', label: 'Sunshine Hosts', icon: 'server' },
		{ href: '/apps', label: 'Sunshine Applications', icon: 'apps' },
		{ href: '/settings', label: 'Settings', icon: 'settings' }
	];
</script>

<svelte:head>
	<title>Sphere86</title>
</svelte:head>

<div class="flex h-screen overflow-hidden" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true">
	<aside class="flex flex-col transition-all duration-200 relative sticky top-0 h-screen shrink-0"
		   data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true"
		   style="background: var(--theme-surface-low); width: {sidebarCollapsed ? '64px' : '220px'};">
		<div class="flex items-center gap-3 px-4 py-5"
			 style="border-bottom: 1px solid color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
			<img src="/logo.png" alt="Sphere86" class="w-8 h-8 flex-shrink-0"
				 data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true" />
			{#if !sidebarCollapsed}
				<span class="text-base font-semibold" style="color: var(--theme-primary);">
					Sphere86
				</span>
			{/if}
		</div>

		<nav class="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
			{#each navItems as item}
				{@const active = $page.url.pathname.startsWith(item.href)}
				<a href={item.href}
				   class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
				   style="background: {active ? 'var(--theme-surface-high)' : 'transparent'};
						  color: {active ? 'var(--theme-primary)' : 'var(--theme-on-surface-variant)'};"
				   title={item.label}>
					{#if item.icon === 'apps'}
						<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
					{:else if item.icon === 'library'}
						<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>
					{:else if item.icon === 'dashboard'}
						<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
					{:else if item.icon === 'cpu'}
						<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
					{:else if item.icon === 'server'}
						<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
					{:else if item.icon === 'settings'}
						<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
					{/if}
					{#if !sidebarCollapsed}
						<span>{item.label}</span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="px-3 py-3 space-y-1"
			 style="border-top: 1px solid color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
			<button onclick={() => theme.toggle()}
					class="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors"
					style="color: var(--theme-on-surface-variant);"
					data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true"
					title="Toggle theme">
				{#if $theme === 'dark'}
					<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
				{:else}
					<svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
				{/if}
				{#if !sidebarCollapsed}
					<span>{$theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
				{/if}
			</button>

			<button onclick={() => sidebarCollapsed = !sidebarCollapsed}
					class="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors"
					style="color: var(--theme-on-surface-variant);"
					data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true"
					title={sidebarCollapsed ? 'Expand' : 'Collapse'}>
				<svg class="w-[18px] h-[18px] flex-shrink-0 transition-transform {sidebarCollapsed ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>
				</svg>
				{#if !sidebarCollapsed}
					<span>Collapse</span>
				{/if}
			</button>
		</div>
	</aside>

	<main class="flex-1 min-h-0 overflow-y-auto flex flex-col min-w-0">
		<div
			class="mx-auto px-6 py-8 flex-1 flex flex-col min-h-0 min-w-0 w-full transition-[max-width] duration-200 ease-out"
			style="max-width: {sidebarCollapsed ? 'none' : '80rem'};"
		>
			{@render children()}
		</div>
	</main>
</div>
