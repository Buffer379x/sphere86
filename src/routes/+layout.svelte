<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import Toasts from '$components/Toasts.svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<Toasts />
