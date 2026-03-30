<script lang="ts">
	import ToggleSwitch from '$lib/components/ToggleSwitch.svelte';
	import { PRESET_LABELS, presetLabel } from '$lib/86box/preset-labels';
	import { withBusGroups, groupByCategory } from '$lib/86box/bus-groups';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { notify } from '$stores/toast';
	import DeleteMachineModal from '$lib/components/DeleteMachineModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { untrack, tick } from 'svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showCreate = $state(false);
	let showImport = $state(false);
	let editingId = $state<string | null>(null);
	let selectedMachine = $state<string | null>(null);
	let formNonce = $state(0);
	let deleteMachineModalOpen = $state(false);
	let deleteMachineName = $state('');
	let machineDeleteId = $state('');
	let machineDeleteMode = $state<'db_only' | 'db_and_config' | 'full'>('db_only');
	let machineDeleteFormEl: HTMLFormElement | undefined = $state();

	async function handleMachineDeleteConfirm(mode: 'db_only' | 'db_and_config' | 'full') {
		machineDeleteMode = mode;
		await tick();
		machineDeleteFormEl?.requestSubmit();
	}

	type VmTab =
		| 'general'
		| 'machine'
		| 'display'
		| 'sound'
		| 'network'
		| 'controllers'
		| 'hdd'
		| 'floppy'
		| 'cdrom'
		| 'ports'
		| 'other';

	const VM_NAV: { id: VmTab; label: string; icon: string }[] = [
		{ id: 'general', label: 'General', icon: 'settings' },
		{ id: 'machine', label: 'Machine', icon: 'cpu' },
		{ id: 'display', label: 'Display', icon: 'monitor' },
		{ id: 'sound', label: 'Sound', icon: 'volume' },
		{ id: 'network', label: 'Network', icon: 'network' },
		{ id: 'controllers', label: 'Controllers', icon: 'server' },
		{ id: 'hdd', label: 'Hard Disks', icon: 'harddrive' },
		{ id: 'floppy', label: 'Floppy Drives', icon: 'save' },
		{ id: 'cdrom', label: 'CD-ROM Drives', icon: 'disc' },
		{ id: 'ports', label: 'Ports & Input', icon: 'usb' },
		{ id: 'other', label: 'Other', icon: 'settings2' }
	];

	const IDE_CHANNEL_LABELS: Record<string, string> = {
		'0:0': 'Primary Master',
		'0:1': 'Primary Slave',
		'1:0': 'Secondary Master',
		'1:1': 'Secondary Slave',
		'2:0': 'Tertiary Master',
		'2:1': 'Tertiary Slave',
		'3:0': 'Quaternary Master',
		'3:1': 'Quaternary Slave'
	};

	const DEFAULT_HDD_CH = ['0:0', '0:1', '1:0', '1:1', '2:0', '2:1', '3:0', '3:1'] as const;
	const DEFAULT_CD_CH = ['1:0', '1:1', '2:0', '2:1'] as const;

	const RAM_STOPS = [64, 128, 256, 512, 640, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144];
	const RAM_QUICK = new Set([640, 1024, 4096, 16384, 65536]);

	function hddAt(m: Record<string, any> | null, i: number) {
		const d = m?.storage?.hdds?.[i];
		return (
			d ?? {
				enabled: i === 0,
				bus: 'ide',
				sizeMb: 512,
				cylinders: null,
				heads: null,
				spt: null,
				speedPreset: '1997_5400rpm',
				ideChannel: DEFAULT_HDD_CH[i] ?? '0:0',
				file: `hdd/hdd${i + 1}.img`,
			}
		);
	}

	function fddAt(m: Record<string, any> | null, i: number) {
		const f = m?.storage?.floppies?.[i];
		if (f) return f;
		const legacyA = m?.storage?.floppyA;
		const legacyB = m?.storage?.floppyB;
		if (i === 0 && legacyA) return { type: legacyA, turbo: false, checkBpb: true, fn: '' };
		if (i === 1 && legacyB) return { type: legacyB, turbo: false, checkBpb: true, fn: '' };
		return { type: i < 2 ? '525_2dd' : 'none', turbo: false, checkBpb: true, fn: '' };
	}

	function cdAt(m: Record<string, any> | null, i: number) {
		const c = m?.storage?.cdroms?.[i];
		return (
			c ?? {
				enabled: false,
				bus: 'ide',
				ideChannel: DEFAULT_CD_CH[i] ?? '1:0',
				speed: 24,
				driveType: '',
				fn: '',
			}
		);
	}

	function fmtKb(kb: number): string {
		return kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`;
	}

	type HddSlot = { enabled: boolean; bus: string; sizeMb: number; cylinders: string | null; heads: string | null; spt: string | null; speedPreset: string; ideChannel: string; file: string };
	type FddSlot = { type: string; turbo: boolean; checkBpb: boolean; fn: string };
	type CdSlot = { enabled: boolean; bus: string; ideChannel: string; speed: number; driveType: string; fn: string };

	let machineType = $state('ibm_at');
	let memoryKb = $state(4096);
	let cpuFamily = $state('');
	let cpuSpeedIndex = $state(0);
	let fallbackCpuHz = $state(8_000_000);
	let vmTab = $state<VmTab>('general');

	let hdds = $state<HddSlot[]>([]);
	let fdds = $state<FddSlot[]>([]);
	let cdroms = $state<CdSlot[]>([]);

	let deleteStorageOpen = $state(false);
	let deleteStorageMessage = $state('');
	let deleteStorageAction = $state<(() => void) | null>(null);

	function confirmDeleteStorage(label: string, action: () => void) {
		deleteStorageMessage = `Remove ${label}? The form fields will be cleared.`;
		deleteStorageAction = action;
		deleteStorageOpen = true;
	}

	function getMachineConfig(id: string) {
		return data.machines.find(m => m.id === id)?.configContent || '';
	}

	function getMachineMeta(id: string): Record<string, any> {
		const m = data.machines.find(m => m.id === id);
		try {
			return JSON.parse(m?.configMeta || '{}');
		} catch {
			return {};
		}
	}

	function vmMachineSummary(meta: Record<string, any> | null): string {
		if (!data.hw) return '—';
		const type = meta?.general?.machineType ?? '';
		const m = data.hw.machines.find((x) => x.id === type);
		return m ? `${m.name} (${type})` : type || '—';
	}

	function vmCpuSummary(meta: Record<string, any> | null): string {
		if (!data.hw) return '—';
		const machineType = meta?.general?.machineType ?? '';
		const cpuId = meta?.general?.cpuFamily ?? '';
		const fams = data.hw.cpu_families[machineType] ?? [];
		const fam = fams.find((f) => f.id === cpuId);
		return fam ? `${fam.name} (${cpuId})` : cpuId || '—';
	}

	function vmCpuMhzSummary(meta: Record<string, any> | null): string {
		if (!data.hw) return '—';
		const cpuId = meta?.general?.cpuFamily ?? '';
		const idx = meta?.general?.cpuSpeedIndex ?? 0;
		const fallback = meta?.general?.cpuSpeed ?? 8_000_000;
		const speeds = data.hw.cpu_family_cpus[cpuId] ?? [];
		const hz =
			speeds.length && idx >= 0 && idx < speeds.length ? speeds[idx].hz : fallback;
		return `${Math.round(hz / 1_000_000)} MHz`;
	}

	function vmRamSummary(meta: Record<string, any> | null): string {
		const kb = meta?.general?.memory;
		if (kb == null) return '—';
		return fmtKb(kb);
	}

	function vmHddSummary(meta: Record<string, any> | null): string {
		const parts: string[] = [];
		for (let i = 0; i < 8; i++) {
			const hd = hddAt(meta, i);
			if (hd.enabled) parts.push(`${hd.sizeMb} MB`);
		}
		return parts.length ? parts.join(', ') : '—';
	}

	function getSunshineLink(profileId: string) {
		return data.links.find(l => l.profileId === profileId);
	}

	function toggleCreate() {
		const next = !showCreate;
		showCreate = next;
		showImport = false;
		editingId = null;
		if (next) formNonce++;
	}

	function startEdit(id: string) {
		editingId = id;
		showCreate = false;
		showImport = false;
		formNonce++;
	}

	function closeModal() {
		showCreate = false;
		editingId = null;
	}

	$effect(() => {
		void formNonce;
		if (!showCreate && !editingId) return;
		vmTab = 'general';
		untrack(() => {
			const meta = editingId ? getMachineMeta(editingId) : null;
			machineType =
				meta?.general?.machineType ??
				data.hw?.machines?.[0]?.id ??
				data.presets.machineTypes[0] ??
				'ibm_at';
			memoryKb = meta?.general?.memory ?? 4096;
			cpuFamily = meta?.general?.cpuFamily ?? '';
			cpuSpeedIndex = meta?.general?.cpuSpeedIndex ?? 0;
			fallbackCpuHz = meta?.general?.cpuSpeed ?? 8_000_000;

			const initHdds: HddSlot[] = [];
			for (let i = 0; i < 8; i++) {
				const hd = hddAt(meta, i);
				if (hd.enabled) initHdds.push({ ...hd, enabled: true });
			}
			hdds = initHdds;

			const initFdds: FddSlot[] = [];
			if (editingId) {
				for (let i = 0; i < 4; i++) {
					const fd = fddAt(meta, i);
					if (fd.type !== 'none') initFdds.push(fd);
				}
			}
			fdds = initFdds;

			const initCds: CdSlot[] = [];
			for (let i = 0; i < 4; i++) {
				const cd = cdAt(meta, i);
				if (cd.enabled) initCds.push({ ...cd, enabled: true });
			}
			cdroms = initCds;
		});
	});

	let machineBus = $derived(data.hw?.machines.find(m => m.id === machineType)?.bus_flags ?? 0);

	function busOk(card: { id: string; bus_flags?: number }) {
		return card.id === 'none' || !card.bus_flags || (machineBus & card.bus_flags);
	}

	let ramBounds = $derived.by(() => {
		const m = data.hw?.machines.find(x => x.id === machineType);
		return {
			min: m?.ram_min ?? 64,
			max: m?.ram_max ?? 131072,
			step: m?.ram_step ?? 64
		};
	});

	let videoOptions = $derived(data.hw?.video_cards.filter(v => busOk(v)) ?? []);
	let soundOptions = $derived(data.hw?.sound_cards.filter(s => busOk(s)) ?? []);
	let networkOptions = $derived(data.hw?.network_cards.filter(n => busOk(n)) ?? []);
	let hdcOptions = $derived(
		(data.hw?.hdd_controllers ?? []).filter((c) => c.id !== 'ide_ter' && c.id !== 'ide_qua')
	);

	let videoGrouped = $derived(groupByCategory(withBusGroups(videoOptions)));
	let soundGrouped = $derived(groupByCategory(withBusGroups(soundOptions)));
	let networkGrouped = $derived(groupByCategory(withBusGroups(networkOptions)));
	let hdcGrouped = $derived(groupByCategory(withBusGroups(hdcOptions)));

	let cpuFamiliesForMachine = $derived(data.hw?.cpu_families[machineType] ?? []);

	let speedEntries = $derived(
		cpuFamily && data.hw?.cpu_family_cpus?.[cpuFamily] ? data.hw.cpu_family_cpus[cpuFamily] : []
	);

	let resolvedCpuHz = $derived(
		speedEntries.length && cpuSpeedIndex >= 0 && cpuSpeedIndex < speedEntries.length
			? speedEntries[cpuSpeedIndex].hz
			: fallbackCpuHz
	);

	$effect(() => {
		const fams = cpuFamiliesForMachine;
		if (fams.length && !fams.some((f) => f.id === cpuFamily)) {
			cpuFamily = fams[0].id;
			cpuSpeedIndex = 0;
		}
	});

	$effect(() => {
		if (speedEntries.length && (cpuSpeedIndex < 0 || cpuSpeedIndex >= speedEntries.length)) {
			cpuSpeedIndex = Math.max(0, speedEntries.length - 1);
		}
	});

	let validRamStops = $derived(RAM_STOPS.filter(s => s >= ramBounds.min && s <= ramBounds.max));
	let ramSliderIndex = $derived(
		validRamStops.indexOf(memoryKb) !== -1 ? validRamStops.indexOf(memoryKb) : 0
	);

	$effect(() => {
		const { min, max } = ramBounds;
		if (memoryKb < min || memoryKb > max) {
			const nearest = validRamStops.length ? validRamStops.reduce((a, b) =>
				Math.abs(b - memoryKb) < Math.abs(a - memoryKb) ? b : a
			) : min;
			memoryKb = nearest;
		}
	});

	let hddSpeedGroups = $derived.by((): [string, { id: string; name: string }[]][] => {
		const map = new Map<string, { id: string; name: string }[]>();
		for (const p of data.hw?.hdd_speed_presets ?? []) {
			const cat = p.category ?? 'Other';
			if (!map.has(cat)) map.set(cat, []);
			map.get(cat)!.push({ id: p.id, name: p.name });
		}
		return [...map.entries()];
	});

	let sortedMachines = $derived([...data.machines].sort((a, b) => a.name.localeCompare(b.name)));

	let liveChannelMap = $derived.by((): Record<string, string> => {
		const map: Record<string, string> = {};
		hdds.forEach((hd, i) => {
			if (hd.enabled && hd.bus === 'ide' && hd.ideChannel) map[hd.ideChannel] = `HDD ${i + 1}`;
		});
		cdroms.forEach((cd, i) => {
			if (cd.enabled && cd.bus === 'ide' && cd.ideChannel) map[cd.ideChannel] = `CD-ROM ${i + 1}`;
		});
		return map;
	});

	function nextFreeIdeChannel(exclude?: string): string | null {
		const channels = ['0:0', '0:1', '1:0', '1:1'];
		return channels.find((ch) => ch !== exclude && !liveChannelMap[ch]) ?? null;
	}

	$effect(() => {
		if (form?.error) notify('error', form.error);
		if (form?.message) notify('success', form.message);
	});

	$effect(() => {
		const a = form?.profileAction;
		if (a === 'created' || a === 'updated' || a === 'imported') {
			closeModal();
			showImport = false;
		}
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Virtual Machines</h1>
			<p class="mt-1 text-sm" style="color: var(--theme-on-surface-variant);">
				Create and manage 86Box configurations
			</p>
		</div>
		<div class="flex gap-2">
			<button
				class="btn-secondary text-sm"
				onclick={() => {
					showImport = !showImport;
					showCreate = false;
					editingId = null;
				}}
			>
				Import .cfg
			</button>
			<button class="btn-primary text-sm" onclick={toggleCreate}>
				{showCreate ? 'Cancel' : '+ New Machine'}
			</button>
		</div>
	</div>

	{#if showImport}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-50 flex items-center justify-center p-4"
			style="background: color-mix(in srgb, var(--theme-surface) 60%, transparent); backdrop-filter: blur(6px);"
			onkeydown={(e) => { if (e.key === 'Escape') showImport = false; }}
			onclick={(e) => { if (e.target === e.currentTarget) showImport = false; }}
		>
			<div
				class="w-full max-w-2xl rounded-xl border shadow-2xl flex flex-col"
				style="max-height: 85vh; background: var(--theme-surface); border-color: color-mix(in srgb, var(--color-outline-variant) 22%, transparent);"
			>
				<div class="flex items-center justify-between px-6 py-4 shrink-0 border-b"
					 style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent);">
					<h2 class="text-base font-semibold">Import Existing 86box.cfg</h2>
					<button class="p-1.5 rounded-lg transition-colors" style="color: var(--theme-on-surface-variant);"
							onclick={() => (showImport = false)} title="Close">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
					</button>
				</div>
				<form method="POST" action="?/import" use:enhance class="flex-1 overflow-y-auto p-6 space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label for="imp-name" class="label">Name</label>
							<input id="imp-name" name="name" type="text" required class="input-field" placeholder="My Retro PC" />
						</div>
						<div>
							<label for="imp-host" class="label">Target Host</label>
							<select id="imp-host" name="hostId" required class="input-field">
								<option value="">Select host...</option>
								{#each data.hosts as host}
									<option value={host.id}>{host.name} ({host.address})</option>
								{/each}
							</select>
						</div>
					</div>
					<div>
						<label for="imp-config" class="label">86box.cfg Content</label>
						<textarea
							id="imp-config"
							name="configContent"
							required
							class="input-field font-mono text-xs"
							rows="12"
							placeholder="Paste your 86box.cfg here..."
						></textarea>
					</div>
					<div class="flex justify-end gap-3">
						<button type="button" class="btn-tertiary text-sm" onclick={() => (showImport = false)}>Cancel</button>
						<button type="submit" class="btn-primary text-sm">Import</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if data.machines.length === 0 && !showCreate && !showImport && !editingId}
		<div class="card text-center py-12">
			<p class="text-base" style="color: var(--theme-on-surface-variant);">No machine profiles yet</p>
			<p class="text-sm mt-1" style="color: var(--theme-on-surface-variant);">
				Create a new 86Box configuration or import an existing one
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each sortedMachines as machine}
				{@const link = getSunshineLink(machine.id)}
				{@const listMeta = getMachineMeta(machine.id)}
				<div class="card-elevated">
					<div class="flex items-start gap-4">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<h3 class="font-semibold">{machine.name}</h3>
								<span
									class="text-xs px-2 py-0.5 rounded-full"
									style="background: color-mix(in srgb, {machine.deployed ? 'var(--theme-success)' : 'var(--theme-warning)'} 15%, transparent); color: {machine.deployed ? 'var(--theme-success)' : 'var(--theme-warning)'};"
								>
									{machine.deployed ? 'Deployed' : 'Draft'}
								</span>
								{#if link}
									<span
										class="text-xs px-2 py-0.5 rounded-full"
										style="background: color-mix(in srgb, var(--theme-primary) 15%, transparent); color: var(--theme-primary);"
									>
										Published
									</span>
								{/if}
							</div>
							<p class="text-sm mt-0.5" style="color: var(--theme-on-surface-variant);">
								{machine.description || 'No description'} ·
								<span class="font-mono text-xs" title="Profile ID">{machine.id}</span>
							</p>
							<p class="text-xs mt-1.5 leading-relaxed" style="color: var(--theme-on-surface-variant);">
								<span class="font-medium" style="color: var(--theme-on-surface);">Machine</span>
								{vmMachineSummary(listMeta)}
								<span class="mx-1.5 opacity-40">·</span>
								<span class="font-medium" style="color: var(--theme-on-surface);">CPU</span>
								{vmCpuSummary(listMeta)}
								<span class="mx-1.5 opacity-40">·</span>
								<span class="font-medium" style="color: var(--theme-on-surface);">Frequenz</span>
								{vmCpuMhzSummary(listMeta)}
								<span class="mx-1.5 opacity-40">·</span>
								<span class="font-medium" style="color: var(--theme-on-surface);">RAM</span>
								{vmRamSummary(listMeta)}
								<span class="mx-1.5 opacity-40">·</span>
								<span class="font-medium" style="color: var(--theme-on-surface);">HDD</span>
								{vmHddSummary(listMeta)}
							</p>
						</div>

						<div class="flex gap-2 flex-shrink-0 flex-wrap">
							<button
								class="btn-secondary text-xs py-1 px-3"
								onclick={() => (selectedMachine = selectedMachine === machine.id ? null : machine.id)}
							>
								{selectedMachine === machine.id ? 'Hide' : 'View'}
							</button>
							<button class="btn-secondary text-xs py-1 px-3" onclick={() => startEdit(machine.id)}>
								Edit
							</button>
							<form method="POST" action="?/deploy" use:enhance>
								<input type="hidden" name="id" value={machine.id} />
								<button type="submit" class="btn-secondary text-xs py-1 px-3">Deploy</button>
							</form>
							<form method="POST" action="?/publish" use:enhance>
								<input type="hidden" name="id" value={machine.id} />
								<button
									type="submit"
									class="btn-primary text-xs py-1 px-3"
									title={link
										? 'Push the current launch command to Sunshine again (e.g. after host or fullscreen settings change)'
										: 'Register this VM as a Sunshine application'}
								>
									{link ? 'Re-publish' : 'Publish'}
								</button>
							</form>
							<button
								type="button"
								class="btn-secondary text-xs py-1 px-3"
								style="color: var(--theme-error); border-color: color-mix(in srgb, var(--theme-error) 30%, transparent);"
								onclick={() => {
									machineDeleteId = machine.id;
									deleteMachineName = machine.name;
									deleteMachineModalOpen = true;
								}}
							>
								Delete
							</button>
						</div>
					</div>

					{#if selectedMachine === machine.id}
						<pre
							class="mt-4 text-xs font-mono p-4 rounded-lg overflow-auto max-h-64"
							style="background: var(--theme-surface-lowest); color: var(--theme-on-surface);"
						>{getMachineConfig(machine.id)}</pre>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<DeleteMachineModal
	bind:open={deleteMachineModalOpen}
	machineName={deleteMachineName}
	onConfirm={handleMachineDeleteConfirm}
/>

<form
	bind:this={machineDeleteFormEl}
	method="POST"
	action="?/delete"
	use:enhance
	class="fixed w-px h-px overflow-hidden opacity-0 pointer-events-none"
	aria-hidden="true"
>
	<input type="hidden" name="id" value={machineDeleteId} />
	<input type="hidden" name="deleteMode" value={machineDeleteMode} />
	<button type="submit" tabindex="-1">Submit</button>
</form>

<!-- ===================== VM Create/Edit Modal ===================== -->
{#if showCreate || editingId}
	{@const meta = editingId ? getMachineMeta(editingId) : null}
	{@const editMachine = editingId ? data.machines.find(m => m.id === editingId) : null}
	{@const scsiAvailable = (meta?.storage?.scsiCard ?? 'none') !== 'none'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: color-mix(in srgb, var(--theme-surface) 60%, transparent); backdrop-filter: blur(6px);"
		onkeydown={(e) => { if (e.key === 'Escape') closeModal(); }}
		onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
	>
		<div class="relative w-full max-w-5xl" style="height: 85vh;">
			<!-- Floating IDE channel indicators (controllers/hdd/cdrom tabs) -->
			{#if (vmTab === 'controllers' || vmTab === 'hdd' || vmTab === 'cdrom') && data.hw}
				<div class="absolute -right-36 top-[57px] flex flex-col gap-2 z-10 hidden xl:flex">
					{#each ['0:0', '0:1', '1:0', '1:1'] as ch}
						{@const occupant = liveChannelMap[ch]}
						<div
							class="px-3 py-1.5 rounded-lg w-32 transition-colors"
							style="background: color-mix(in srgb, {occupant ? 'var(--theme-warning)' : 'var(--theme-success)'} 15%, transparent);"
						>
							<div class="text-[10px] font-medium leading-tight"
								 style="color: {occupant ? 'var(--theme-warning)' : 'var(--theme-success)'};">
								{IDE_CHANNEL_LABELS[ch]}
							</div>
							<div class="text-xs font-bold leading-tight mt-0.5"
								 style="color: var(--theme-on-surface);">
								{occupant || 'Free'}
							</div>
						</div>
					{/each}
					{#if scsiAvailable}
						<div class="px-3 py-1.5 rounded-lg w-32"
							 style="background: color-mix(in srgb, var(--theme-primary) 15%, transparent);">
							<div class="text-[10px] font-medium leading-tight" style="color: var(--theme-primary);">SCSI</div>
							<div class="text-xs font-bold leading-tight mt-0.5" style="color: var(--theme-on-surface);">Available</div>
						</div>
					{/if}
				</div>
			{/if}

			<div
				class="h-full rounded-xl border shadow-2xl flex flex-col overflow-hidden"
				style="background: var(--theme-surface); border-color: color-mix(in srgb, var(--color-outline-variant) 22%, transparent);"
			>
				<!-- Header -->
				<div
					class="flex items-center justify-between px-6 py-4 shrink-0 border-b"
					style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent);"
				>
					<h2 class="text-base font-semibold">
						{editingId ? `Edit profile · ${editMachine?.name}` : 'New 86Box profile'}
					</h2>
					<button
						class="p-1.5 rounded-lg transition-colors"
						style="color: var(--theme-on-surface-variant);"
						onclick={closeModal}
						title="Close"
					>
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
					</button>
				</div>

				<!-- Sidebar + Content -->
				<form method="POST" action={editingId ? '?/edit' : '?/create'} use:enhance class="flex flex-1 min-h-0 min-w-0">
					{#if editingId}
						<input type="hidden" name="id" value={editingId} />
					{/if}
					{#if data.hw}
						<input type="hidden" name="cpuFamily" value={cpuFamily} />
						<input type="hidden" name="cpuSpeedIndex" value={cpuSpeedIndex} />
						<input type="hidden" name="cpuSpeed" value={resolvedCpuHz} />
					{/if}

					<!-- Left sidebar tabs (legacy style) -->
					<div
						class="w-44 flex-shrink-0 py-3 px-2 space-y-0.5 overflow-y-auto border-r"
						style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent); background: var(--theme-surface-low);"
					>
						{#each VM_NAV as item}
							<button
								type="button"
								onclick={() => (vmTab = item.id)}
								class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left font-medium"
								style="background: {vmTab === item.id
									? 'color-mix(in srgb, var(--theme-primary) 22%, transparent)'
									: 'transparent'};
									color: {vmTab === item.id ? 'var(--theme-primary)' : 'var(--theme-on-surface)'};
									box-shadow: {vmTab === item.id
										? 'inset 0 0 0 1px color-mix(in srgb, var(--theme-primary) 45%, transparent)'
										: 'none'};"
							>
								{#if item.icon === 'settings'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
								{:else if item.icon === 'cpu'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
								{:else if item.icon === 'monitor'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
								{:else if item.icon === 'volume'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
								{:else if item.icon === 'network'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>
								{:else if item.icon === 'server'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
								{:else if item.icon === 'harddrive'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>
								{:else if item.icon === 'save'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
								{:else if item.icon === 'disc'}
									<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>
							{:else if item.icon === 'usb'}
								<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="1"/><circle cx="4" cy="20" r="1"/><path d="M4.7 19.3 19 5"/><path d="m21 3-3 1 2 2Z"/><path d="M9.26 7.68 5 12l2 5"/><path d="m10 14 5 2 3.5-3.5"/><circle cx="18" cy="12" r="1"/></svg>
							{:else if item.icon === 'settings2'}
								<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
							{/if}
								{item.label}
							</button>
						{/each}
					</div>

					<!-- Right content area -->
					<div class="flex-1 min-w-0 flex flex-col">
						<div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">

		<!-- ── General ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'general'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Sphere86 profile
			</h4>
			<p class="text-xs" style="color: var(--theme-on-surface-variant);">
				Display name, description, and host are not written into 86box.cfg.
			</p>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
				<div>
					<label for="name" class="label">Display name</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						class="input-field"
						placeholder="DOS Gaming PC"
						value={editMachine?.name ?? ''}
					/>
				</div>
				<div>
					<label for="description" class="label">Description</label>
					<input
						id="description"
						name="description"
						type="text"
						class="input-field"
						placeholder="Optional"
						value={editMachine?.description ?? ''}
					/>
				</div>
				<div class="md:col-span-2">
					<label for="hostId" class="label">Target host</label>
					<select id="hostId" name="hostId" required class="input-field">
						<option value="">Select host…</option>
						{#each data.hosts as host}
							<option value={host.id} selected={host.id === editMachine?.hostId}>{host.name}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- ── Machine ─────────────────────────────────────── -->
		<div class="space-y-6" hidden={vmTab !== 'machine'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				System
			</h4>
			<div class="space-y-5">
				<div>
					<label for="machineType" class="label">Machine</label>
					<p class="text-xs mt-0.5 mb-2" style="color: var(--theme-on-surface-variant);">Motherboard / machine type</p>
					<select id="machineType" name="machineType" class="input-field" bind:value={machineType}>
						{#if data.hw}
							{#each data.hw.machines as m}
								<option value={m.id}>{m.name} ({m.id})</option>
							{/each}
						{:else}
							{#each data.presets.machineTypes as mt}
								<option value={mt}>{presetLabel(PRESET_LABELS.machineTypes, mt)} ({mt})</option>
							{/each}
						{/if}
					</select>
				</div>
				{#if data.hw && cpuFamiliesForMachine.length}
					<div>
						<label for="cpuFamilySel" class="label">CPU type</label>
						<p class="text-xs mt-0.5 mb-2" style="color: var(--theme-on-surface-variant);">
							Only CPUs supported by this machine
						</p>
						<select id="cpuFamilySel" class="input-field" bind:value={cpuFamily}>
							{#each cpuFamiliesForMachine as fam}
								<option value={fam.id}>{fam.name} ({fam.id})</option>
							{/each}
						</select>
					</div>
				{/if}
				{#if data.hw && speedEntries.length}
					<div>
						<label class="label">CPU frequency</label>
						<p class="text-xs mt-0.5 mb-2" style="color: var(--theme-on-surface-variant);">
							Valid speed grades for the selected CPU family
						</p>
						<div class="space-y-2">
							<div class="flex justify-between text-xs" style="color: var(--theme-on-surface-variant);">
								<span>{Math.round(speedEntries[0].hz / 1_000_000)} MHz</span>
								<span class="font-medium" style="color: var(--theme-on-surface);">
									{Math.round(resolvedCpuHz / 1_000_000)} MHz
								</span>
								<span>{Math.round(speedEntries[speedEntries.length - 1].hz / 1_000_000)} MHz</span>
							</div>
							<input
								type="range"
								min="0"
								max={speedEntries.length - 1}
								bind:value={cpuSpeedIndex}
								class="w-full"
								style="accent-color: var(--theme-primary);"
							/>
							<div class="flex flex-wrap gap-1">
								{#each speedEntries as s, idx}
									<button
										type="button"
										class="text-xs px-2 py-0.5 rounded border transition-colors"
										style="background: {cpuSpeedIndex === idx ? 'color-mix(in srgb, var(--theme-primary) 15%, transparent)' : 'transparent'};
											border-color: {cpuSpeedIndex === idx ? 'var(--theme-primary)' : 'color-mix(in srgb, var(--color-outline-variant) 25%, transparent)'};
											color: {cpuSpeedIndex === idx ? 'var(--theme-primary)' : 'var(--theme-on-surface-variant)'};"
										onclick={() => (cpuSpeedIndex = idx)}
									>
										{Math.round(s.hz / 1_000_000)} MHz
									</button>
								{/each}
							</div>
						</div>
					</div>
				{:else if !data.hw}
					<div>
						<label for="cpuSpeedFallback" class="label">CPU speed (Hz)</label>
						<p class="text-xs mt-0.5 mb-2" style="color: var(--theme-on-surface-variant);">
							Hardware database not loaded — set clock in Hz manually.
						</p>
						<input
							id="cpuSpeedFallback"
							name="cpuSpeed"
							type="number"
							class="input-field max-w-xs font-mono text-sm"
							bind:value={fallbackCpuHz}
							min="1"
							step="1"
						/>
					</div>
				{/if}
			</div>

			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Memory
			</h4>
			<div>
				<label class="label">RAM</label>
				<p class="text-xs mt-0.5 mb-2" style="color: var(--theme-on-surface-variant);">
					System memory — range depends on the selected machine
				</p>
				{#if validRamStops.length}
					<input type="hidden" name="memory" value={memoryKb} />
					<div class="space-y-2">
						<div class="flex justify-between text-xs" style="color: var(--theme-on-surface-variant);">
							<span>{fmtKb(ramBounds.min)}</span>
							<span class="font-medium" style="color: var(--theme-on-surface);">{fmtKb(memoryKb)}</span>
							<span>{fmtKb(ramBounds.max)}</span>
						</div>
						<input
							type="range"
							min="0"
							max={validRamStops.length - 1}
							value={ramSliderIndex}
							oninput={(e) => { memoryKb = validRamStops[parseInt(e.currentTarget.value)] || ramBounds.min; }}
							class="w-full"
							style="accent-color: var(--theme-primary);"
						/>
						<div class="flex gap-1 flex-wrap">
							{#each validRamStops.filter(s => RAM_QUICK.has(s) && s <= ramBounds.max) as s}
								<button
									type="button"
									class="text-xs px-2 py-0.5 rounded border transition-colors"
									style="background: {memoryKb === s ? 'color-mix(in srgb, var(--theme-primary) 15%, transparent)' : 'transparent'};
										border-color: {memoryKb === s ? 'var(--theme-primary)' : 'color-mix(in srgb, var(--color-outline-variant) 25%, transparent)'};
										color: {memoryKb === s ? 'var(--theme-primary)' : 'var(--theme-on-surface-variant)'};"
									onclick={() => (memoryKb = s)}
								>
									{fmtKb(s)}
								</button>
							{/each}
						</div>
					</div>
				{:else}
					<select id="memory" name="memory" class="input-field max-w-md" bind:value={memoryKb}>
						{#each [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536] as kb}
							<option value={kb}>{fmtKb(kb)}</option>
						{/each}
					</select>
				{/if}
			</div>

			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Processor
			</h4>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
				<div class="md:col-span-2 flex flex-wrap gap-6">
					<ToggleSwitch
						name="cpuUseDynarec"
						checked={meta?.general?.cpuUseDynarec === true}
						label="Dynamic recompiler"
						id="cpuUseDynarec"
					/>
					<ToggleSwitch
						name="fpuSoftfloat"
						checked={meta?.general?.fpuSoftfloat === true}
						label="Softfloat FPU"
						id="fpuSoftfloat"
					/>
				</div>
				<div>
					<label for="cpuWaitstates" class="label">Wait states</label>
					<input
						id="cpuWaitstates"
						name="cpuWaitstates"
						type="number"
						class="input-field"
						value={meta?.general?.cpuWaitstates ?? meta?.general?.waitStates ?? 0}
						min="0"
					/>
				</div>
				<div>
					<label for="fpuType" class="label">FPU</label>
					<select id="fpuType" name="fpuType" class="input-field">
						{#each ['none', '8087', '287', '387', 'internal'] as ft}
							<option value={ft} selected={(meta?.general?.fpuType ?? 'none') === ft}>{ft}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="pitMode" class="label">PIT mode</label>
					<input
						id="pitMode"
						name="pitMode"
						type="number"
						class="input-field"
						value={meta?.general?.pitMode ?? 0}
						min="0"
					/>
				</div>
				<div>
					<label for="timeSyncSel" class="label">Time synchronization</label>
					<select id="timeSyncSel" name="timeSync" class="input-field">
						<option value="off" selected={(meta?.general?.timeSync ?? 'local') === 'off'}>Disabled</option>
						<option value="local" selected={(meta?.general?.timeSync ?? 'local') === 'local'}>Local time</option>
						<option value="utc" selected={meta?.general?.timeSync === 'utc'}>UTC</option>
					</select>
				</div>
			</div>
		</div>

		<!-- ── Display ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'display'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Video
			</h4>
			<div>
				<label for="vidRenderer" class="label">Qt renderer</label>
				<select id="vidRenderer" name="vidRenderer" class="input-field max-w-md">
					{#each ['qt_software', 'qt_opengl', 'qt_vulkan'] as r}
						<option value={r} selected={(meta?.video?.vidRenderer ?? 'qt_software') === r}>{r}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="videoCard" class="label">Video card</label>
				<select id="videoCard" name="videoCard" class="input-field">
					{#if data.hw}
						{#each videoGrouped as [cat, items]}
							<optgroup label={cat}>
								{#each items as v}
									<option value={v.id} selected={v.id === meta?.video?.card}>{v.name} ({v.id})</option>
								{/each}
							</optgroup>
						{/each}
					{:else}
						{#each data.presets.videoCards as vc}
							<option value={vc} selected={vc === meta?.video?.card}>
								{presetLabel(PRESET_LABELS.videoCards, vc)} ({vc})
							</option>
						{/each}
					{/if}
				</select>
			</div>
			<div class="flex flex-wrap gap-6 items-start">
				<ToggleSwitch name="voodoo" checked={meta?.video?.voodoo} label="Voodoo" id="voodoo" />
				<div>
					<label for="voodooType" class="label">Voodoo type</label>
					<select id="voodooType" name="voodooType" class="input-field max-w-xs mt-1">
						{#each ['voodoo1', 'voodoo2', 'voodoo_banshee'] as vt}
							<option value={vt} selected={(meta?.video?.voodooType ?? 'voodoo1') === vt}>{vt}</option>
						{/each}
					</select>
				</div>
				<ToggleSwitch
					name="showSecondMonitors"
					checked={meta?.video?.showSecondMonitors === true}
					label="Second monitors"
					id="showSecondMonitors"
				/>
			</div>
		</div>

		<!-- ── Sound ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'sound'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Sound
			</h4>
			<div>
				<label for="soundCard" class="label">Sound card</label>
				<select id="soundCard" name="soundCard" class="input-field">
					{#if data.hw}
						{#each soundGrouped as [cat, items]}
							<optgroup label={cat}>
								{#each items as s}
									<option value={s.id} selected={s.id === meta?.sound?.card}>{s.name} ({s.id})</option>
								{/each}
							</optgroup>
						{/each}
					{:else}
						{#each data.presets.soundCards as sc}
							<option value={sc} selected={sc === meta?.sound?.card}>
								{presetLabel(PRESET_LABELS.soundCards, sc)} ({sc})
							</option>
						{/each}
					{/if}
				</select>
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
				<div>
					<label for="midiOut" class="label">MIDI out device</label>
					<select id="midiOut" name="midiOut" class="input-field">
						<option value="none" selected={(meta?.sound?.midiOut ?? 'none') === 'none'}>None</option>
						{#if data.hw}
							{#each data.hw.midi_devices as md}
								<option value={md.id} selected={md.id === meta?.sound?.midiOut}>{md.name} ({md.id})</option>
							{/each}
						{/if}
					</select>
				</div>
				<div>
					<label for="midiIn" class="label">MIDI in device</label>
					<select id="midiIn" name="midiIn" class="input-field">
						<option value="none" selected={(meta?.sound?.midiIn ?? 'none') === 'none'}>None</option>
						{#if data.hw}
							{#each data.hw.midi_devices as md}
								<option value={md.id} selected={md.id === meta?.sound?.midiIn}>{md.name} ({md.id})</option>
							{/each}
						{/if}
					</select>
				</div>
				<div class="md:col-span-2 flex flex-wrap gap-6">
					<ToggleSwitch
						name="mpu401Standalone"
						checked={meta?.sound?.mpu401Standalone === true}
						label="MPU-401 standalone"
						id="mpu401Standalone"
					/>
					<div>
						<label for="fmDriver" class="label">FM driver</label>
						<select id="fmDriver" name="fmDriver" class="input-field max-w-xs mt-1">
							{#each ['nuked', 'ymfm'] as fd}
								<option value={fd} selected={(meta?.sound?.fmDriver ?? 'nuked') === fd}>{fd}</option>
							{/each}
						</select>
					</div>
					<ToggleSwitch
						name="soundIsFloat"
						checked={meta?.sound?.soundIsFloat === true}
						label="Float sound"
						id="soundIsFloat"
					/>
				</div>
			</div>
		</div>

		<!-- ── Network ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'network'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Network
			</h4>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
				<div>
					<label for="networkType" class="label">Network type</label>
					<select id="networkType" name="networkType" class="input-field">
						{#each data.presets.networkTypes as nt}
							<option value={nt} selected={nt === meta?.network?.type}>
								{presetLabel(PRESET_LABELS.networkTypes, nt)}
							</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="networkCard" class="label">Network card</label>
					<select id="networkCard" name="networkCard" class="input-field">
						{#if data.hw}
							{#each networkGrouped as [cat, items]}
								<optgroup label={cat}>
									{#each items as n}
										<option value={n.id} selected={n.id === meta?.network?.card}>{n.name} ({n.id})</option>
									{/each}
								</optgroup>
							{/each}
						{:else}
							{#each data.presets.networkCards as nc}
								<option value={nc} selected={nc === meta?.network?.card}>
									{presetLabel(PRESET_LABELS.networkCards, nc)} ({nc})
								</option>
							{/each}
						{/if}
					</select>
				</div>
				<div class="md:col-span-2">
					<label for="netHostDev" class="label">Host device (optional)</label>
					<input
						id="netHostDev"
						name="netHostDev"
						type="text"
						class="input-field max-w-lg font-mono text-sm"
						value={meta?.network?.hostDev ?? ''}
					/>
				</div>
			</div>
		</div>

		<!-- ── Controllers ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'controllers'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Storage controllers
			</h4>
			<div class="space-y-4">
				<div>
					<label for="hddController" class="label">Hard disk controller</label>
					<select id="hddController" name="hddController" class="input-field">
						<option value="none" selected={(meta?.storage?.hddController ?? 'ide_isa') === 'none'}>None</option>
						{#each hdcGrouped as [cat, items]}
							<optgroup label={cat}>
								{#each items as c}
									<option value={c.id} selected={c.id === (meta?.storage?.hddController ?? 'ide_isa')}>{c.name} ({c.id})</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</div>
				<div class="flex flex-wrap gap-6">
					<ToggleSwitch
						name="ide_ter_enabled"
						checked={meta?.storage?.ideTerEnabled === true}
						label="Tertiary IDE (IDE 3)"
						id="ide_ter_enabled"
					/>
					<ToggleSwitch
						name="ide_qua_enabled"
						checked={meta?.storage?.ideQuaEnabled === true}
						label="Quaternary IDE (IDE 4)"
						id="ide_qua_enabled"
					/>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="scsiCard" class="label">SCSI card</label>
						<select id="scsiCard" name="scsiCard" class="input-field">
							<option value="none" selected={(meta?.storage?.scsiCard ?? 'none') === 'none'}>None</option>
							{#if data.hw}
								{#each data.hw.scsi_cards.filter((x) => busOk(x)) as sc}
									<option value={sc.id} selected={sc.id === meta?.storage?.scsiCard}>{sc.name} ({sc.id})</option>
								{/each}
							{/if}
						</select>
					</div>
					<div>
						<label for="fdcCard" class="label">Floppy controller</label>
						<select id="fdcCard" name="fdcCard" class="input-field">
							<option value="none" selected={(meta?.storage?.fdcCard ?? 'none') === 'none'}>None</option>
							{#if data.hw}
								{#each data.hw.fdc_cards.filter((x) => busOk(x)) as fc}
									<option value={fc.id} selected={fc.id === meta?.storage?.fdcCard}>{fc.name} ({fc.id})</option>
								{/each}
							{/if}
						</select>
					</div>
				</div>
			</div>
		</div>

		<!-- ── Hard Disks ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'hdd'}>
			<div class="flex items-center justify-between pb-2 border-b"
				 style="border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				<h4 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--theme-on-surface-variant);">
					Hard disks ({hdds.length} / 8)
				</h4>
				{#if hdds.length < 8}
					<button
						type="button"
						class="btn-secondary text-xs py-1 px-3 flex items-center gap-1"
						onclick={() => {
							const ch = nextFreeIdeChannel();
							hdds = [...hdds, { enabled: true, bus: 'ide', sizeMb: 512, cylinders: null, heads: null, spt: null, speedPreset: '1997_5400rpm', ideChannel: ch ?? '0:0', file: `hdd/hdd${hdds.length + 1}.img` }];
						}}
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
						Add disk
					</button>
				{/if}
			</div>
			{#if hdds.length === 0}
				<p class="text-sm py-4 text-center" style="color: var(--theme-on-surface-variant);">No hard disks configured. Click "Add disk" to get started.</p>
			{/if}
			{#each hdds as hd, diskIdx}
				{@const hn = String(diskIdx + 1).padStart(2, '0')}
				<input type="hidden" name={'hdd_' + hn + '_enabled'} value="on" />
				<div
					class="rounded-lg border p-4 space-y-3"
					style="border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);"
				>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<span class="text-sm font-medium">Disk {diskIdx + 1}</span>
						<button
							type="button"
							class="text-xs py-1 px-2 rounded transition-colors"
							style="color: var(--theme-error);"
							onclick={() => confirmDeleteStorage(`Hard Disk ${diskIdx + 1}`, () => { hdds = hdds.filter((_, j) => j !== diskIdx); })}
						>
							<svg class="w-3.5 h-3.5 inline-block mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
							Remove
						</button>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						<div>
							<label class="label text-xs" for={'hdd_' + hn + '_bus'}>Bus</label>
							<select id={'hdd_' + hn + '_bus'} name={'hdd_' + hn + '_bus'} class="input-field"
								bind:value={hdds[diskIdx].bus}>
								{#each ['ide', 'mfm', 'rll', 'esdi', 'scsi'] as b}
									<option value={b}>{b}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="label text-xs" for={'hdd_' + hn + '_size_mb'}>Size (MB)</label>
							<input
								id={'hdd_' + hn + '_size_mb'}
								name={'hdd_' + hn + '_size_mb'}
								type="number"
								class="input-field"
								bind:value={hdds[diskIdx].sizeMb}
								min="1"
							/>
						</div>
						<div>
							<label class="label text-xs" for={'hdd_' + hn + '_fn'}>Image path</label>
							<input
								id={'hdd_' + hn + '_fn'}
								name={'hdd_' + hn + '_fn'}
								type="text"
								class="input-field font-mono text-xs"
								bind:value={hdds[diskIdx].file}
							/>
						</div>
						{#if hd.bus === 'ide'}
							<div>
								<label class="label text-xs" for={'hdd_' + hn + '_ide_channel'}>IDE channel</label>
								<select id={'hdd_' + hn + '_ide_channel'} name={'hdd_' + hn + '_ide_channel'} class="input-field"
									bind:value={hdds[diskIdx].ideChannel}>
									{#each Object.entries(IDE_CHANNEL_LABELS) as [ch, lab]}
										{@const occupant = liveChannelMap[ch]}
										<option
											value={ch}
											disabled={!!occupant && occupant !== `HDD ${diskIdx + 1}`}
										>
											{lab} ({ch}){occupant && occupant !== `HDD ${diskIdx + 1}` ? ` ← ${occupant}` : ''}
										</option>
									{/each}
								</select>
							</div>
						{/if}
						<div class="sm:col-span-2">
							<label class="label text-xs" for={'hdd_' + hn + '_speed'}>Speed preset</label>
							<select id={'hdd_' + hn + '_speed'} name={'hdd_' + hn + '_speed'} class="input-field"
								bind:value={hdds[diskIdx].speedPreset}>
								{#if hddSpeedGroups.length}
									{#each hddSpeedGroups as [cat, presets]}
										<optgroup label={cat}>
											{#each presets as p}
												<option value={p.id}>{p.name}</option>
											{/each}
										</optgroup>
									{/each}
								{:else}
									<option value={hd.speedPreset ?? '1997_5400rpm'}>{hd.speedPreset ?? '1997_5400rpm'}</option>
								{/if}
							</select>
						</div>
						<div>
							<label class="label text-xs" for={'hdd_' + hn + '_cylinders'}>Cylinders</label>
							<input
								id={'hdd_' + hn + '_cylinders'}
								name={'hdd_' + hn + '_cylinders'}
								type="text"
								class="input-field font-mono text-xs"
								value={hd.cylinders ?? ''}
								placeholder="auto"
							/>
						</div>
						<div>
							<label class="label text-xs" for={'hdd_' + hn + '_heads'}>Heads</label>
							<input
								id={'hdd_' + hn + '_heads'}
								name={'hdd_' + hn + '_heads'}
								type="text"
								class="input-field font-mono text-xs"
								value={hd.heads ?? ''}
								placeholder="auto"
							/>
						</div>
						<div>
							<label class="label text-xs" for={'hdd_' + hn + '_spt'}>Sectors/Track</label>
							<input
								id={'hdd_' + hn + '_spt'}
								name={'hdd_' + hn + '_spt'}
								type="text"
								class="input-field font-mono text-xs"
								value={hd.spt ?? ''}
								placeholder="auto"
							/>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- ── Floppy Drives ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'floppy'}>
			<div class="flex items-center justify-between pb-2 border-b"
				 style="border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				<h4 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--theme-on-surface-variant);">
					Floppy drives ({fdds.length} / 4)
				</h4>
				{#if fdds.length < 4}
					<button
						type="button"
						class="btn-secondary text-xs py-1 px-3 flex items-center gap-1"
						onclick={() => {
							fdds = [...fdds, { type: '525_2dd', turbo: false, checkBpb: true, fn: '' }];
						}}
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
						Add floppy
					</button>
				{/if}
			</div>
			{#if fdds.length === 0}
				<p class="text-sm py-4 text-center" style="color: var(--theme-on-surface-variant);">No floppy drives configured.</p>
			{/if}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
				{#each fdds as fd, fi}
					{@const fn = String(fi + 1).padStart(2, '0')}
					<div class="space-y-2 rounded-lg border p-3" style="border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);">
						<div class="flex items-center justify-between">
							<p class="text-sm font-medium">Floppy {fn}</p>
							<button
								type="button"
								class="text-xs py-1 px-2 rounded transition-colors"
								style="color: var(--theme-error);"
								onclick={() => confirmDeleteStorage(`Floppy ${fi + 1}`, () => { fdds = fdds.filter((_, j) => j !== fi); })}
							>
								<svg class="w-3.5 h-3.5 inline-block mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
								Remove
							</button>
						</div>
						<div>
							<label class="label text-xs" for={'fdd_' + fn + '_type'}>Type</label>
							<select id={'fdd_' + fn + '_type'} name={'fdd_' + fn + '_type'} class="input-field"
								bind:value={fdds[fi].type}>
								{#if data.hw}
									{#each data.hw.floppy_types as ft}
										<option value={ft.id}>{ft.name} ({ft.id})</option>
									{/each}
								{:else}
									{#each data.presets.floppyTypes as f}
										<option value={f}>
											{presetLabel(PRESET_LABELS.floppyTypes, f)} ({f})
										</option>
									{/each}
								{/if}
							</select>
						</div>
						<div class="flex flex-wrap gap-4">
							<ToggleSwitch name={'fdd_' + fn + '_turbo'} checked={fd.turbo === true} label="Turbo" id={'fdd_' + fn + '_turbo'} />
							<ToggleSwitch
								name={'fdd_' + fn + '_check_bpb'}
								checked={fd.checkBpb !== false}
								label="Check BPB"
								id={'fdd_' + fn + '_check_bpb'}
							/>
						</div>
						<div>
							<label class="label text-xs" for={'fdd_' + fn + '_fn'}>Image (optional)</label>
							<input
								id={'fdd_' + fn + '_fn'}
								name={'fdd_' + fn + '_fn'}
								type="text"
								class="input-field font-mono text-xs"
								bind:value={fdds[fi].fn}
							/>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- ── CD-ROM Drives ─────────────────────────────────────── -->
		<div class="space-y-5" hidden={vmTab !== 'cdrom'}>
			<div class="flex items-center justify-between pb-2 border-b"
				 style="border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				<h4 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--theme-on-surface-variant);">
					CD-ROM drives ({cdroms.length} / 4)
				</h4>
				{#if cdroms.length < 4}
					<button
						type="button"
						class="btn-secondary text-xs py-1 px-3 flex items-center gap-1"
						onclick={() => {
							const ch = nextFreeIdeChannel();
							cdroms = [...cdroms, { enabled: true, bus: 'ide', ideChannel: ch ?? '1:0', speed: 24, driveType: '', fn: '' }];
						}}
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
						Add CD-ROM
					</button>
				{/if}
			</div>
			{#if cdroms.length === 0}
				<p class="text-sm py-4 text-center" style="color: var(--theme-on-surface-variant);">No CD-ROM drives configured.</p>
			{/if}
			<div class="space-y-4">
				{#each cdroms as cd, ci}
					{@const cn = String(ci + 1).padStart(2, '0')}
					<input type="hidden" name={'cdrom_' + cn + '_enabled'} value="on" />
					<div
						class="rounded-lg border p-4 space-y-3"
						style="border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);"
					>
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium">CD-ROM {ci + 1}</span>
							<button
								type="button"
								class="text-xs py-1 px-2 rounded transition-colors"
								style="color: var(--theme-error);"
								onclick={() => confirmDeleteStorage(`CD-ROM ${ci + 1}`, () => { cdroms = cdroms.filter((_, j) => j !== ci); })}
							>
								<svg class="w-3.5 h-3.5 inline-block mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
								Remove
							</button>
						</div>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div>
								<label class="label text-xs" for={'cdrom_' + cn + '_bus'}>Bus</label>
								<select id={'cdrom_' + cn + '_bus'} name={'cdrom_' + cn + '_bus'} class="input-field"
									bind:value={cdroms[ci].bus}>
									{#each ['ide', 'scsi'] as b}
										<option value={b}>{b}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="label text-xs" for={'cdrom_' + cn + '_ide_channel'}>IDE channel</label>
								<select id={'cdrom_' + cn + '_ide_channel'} name={'cdrom_' + cn + '_ide_channel'} class="input-field"
									bind:value={cdroms[ci].ideChannel}>
									{#each Object.entries(IDE_CHANNEL_LABELS) as [ch, lab]}
										{@const occupant = liveChannelMap[ch]}
										<option
											value={ch}
											disabled={!!occupant && occupant !== `CD-ROM ${ci + 1}`}
										>
											{lab} ({ch}){occupant && occupant !== `CD-ROM ${ci + 1}` ? ` ← ${occupant}` : ''}
										</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="label text-xs" for={'cdrom_' + cn + '_speed'}>Speed</label>
								<input
									id={'cdrom_' + cn + '_speed'}
									name={'cdrom_' + cn + '_speed'}
									type="number"
									class="input-field"
									bind:value={cdroms[ci].speed}
									min="1"
								/>
							</div>
							<div>
								<label class="label text-xs" for={'cdrom_' + cn + '_drive_type'}>Drive type</label>
								<select id={'cdrom_' + cn + '_drive_type'} name={'cdrom_' + cn + '_drive_type'} class="input-field"
									bind:value={cdroms[ci].driveType}>
									<option value="">Default</option>
									{#if data.hw}
										{#each data.hw.cdrom_drive_types as dt}
											<option value={dt.id}>{dt.name} ({dt.id})</option>
										{/each}
									{/if}
								</select>
							</div>
							<div class="sm:col-span-2">
								<label class="label text-xs" for={'cdrom_' + cn + '_fn'}>Image path (optional)</label>
								<input
									id={'cdrom_' + cn + '_fn'}
									name={'cdrom_' + cn + '_fn'}
									type="text"
									class="input-field font-mono text-xs"
									bind:value={cdroms[ci].fn}
								/>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- ── Ports & Input ─────────────────────────────────────── -->
		<div class="space-y-6" hidden={vmTab !== 'ports'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Ports (COM &amp; LPT)
			</h4>
			<div class="flex flex-wrap gap-x-6 gap-y-3">
				<ToggleSwitch
					name="com_1_enabled"
					checked={meta?.ports?.com1 !== false && meta?.ports?.serial1 !== false}
					label="COM1"
					id="com_1_enabled"
				/>
				<ToggleSwitch
					name="com_2_enabled"
					checked={meta?.ports?.com2 !== false && meta?.ports?.serial2 !== false}
					label="COM2"
					id="com_2_enabled"
				/>
				<ToggleSwitch name="com_3_enabled" checked={meta?.ports?.com3 === true} label="COM3" id="com_3_enabled" />
				<ToggleSwitch name="com_4_enabled" checked={meta?.ports?.com4 === true} label="COM4" id="com_4_enabled" />
			</div>
			<div class="flex flex-wrap gap-x-6 gap-y-3">
				<ToggleSwitch
					name="lpt_1_enabled"
					checked={meta?.ports?.lpt1 !== false && meta?.ports?.parallel !== false}
					label="LPT1"
					id="lpt_1_enabled"
				/>
				<ToggleSwitch name="lpt_2_enabled" checked={meta?.ports?.lpt2 === true} label="LPT2" id="lpt_2_enabled" />
				<ToggleSwitch name="lpt_3_enabled" checked={meta?.ports?.lpt3 === true} label="LPT3" id="lpt_3_enabled" />
			</div>

			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				Input
			</h4>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
				<div>
					<label for="keyboardType" class="label">Keyboard</label>
					<select id="keyboardType" name="keyboardType" class="input-field">
						<option value="keyboard_pc_xt" selected={(meta?.input?.keyboardType ?? 'keyboard_at') === 'keyboard_pc_xt'}>PC/XT Keyboard</option>
						<option value="keyboard_at" selected={(meta?.input?.keyboardType ?? 'keyboard_at') === 'keyboard_at'}>AT Keyboard</option>
						<option value="keyboard_mf2" selected={(meta?.input?.keyboardType ?? 'keyboard_at') === 'keyboard_mf2'}>MF2 (101/102 key)</option>
						<option value="keyboard_mf2_jp" selected={(meta?.input?.keyboardType ?? 'keyboard_at') === 'keyboard_mf2_jp'}>MF2 Japanese</option>
						<option value="keyboard_ps2" selected={(meta?.input?.keyboardType ?? 'keyboard_at') === 'keyboard_ps2'}>PS/2 Keyboard</option>
					</select>
				</div>
				<div>
					<label for="mouse" class="label">Mouse</label>
					<select id="mouse" name="mouse" class="input-field">
						{#if data.hw}
							{#each data.hw.mouse_types.filter(m => m.id !== 'none') as mt}
								<option value={mt.id} selected={mt.id === meta?.input?.mouse}>{mt.name} ({mt.id})</option>
							{/each}
							<option value="none" selected={meta?.input?.mouse === 'none'}>None (none)</option>
						{:else}
							{#each data.presets.mouseTypes as mt}
								<option value={mt} selected={mt === meta?.input?.mouse}>
									{presetLabel(PRESET_LABELS.mouseTypes, mt)} ({mt})
								</option>
							{/each}
						{/if}
					</select>
				</div>
				<div>
					<label for="joystick" class="label">Joystick</label>
					<select id="joystick" name="joystick" class="input-field">
						{#if data.hw?.joystick_types?.length}
							{#each data.hw.joystick_types as jt}
								<option value={jt.id} selected={jt.id === (meta?.input?.joystick ?? 'none')}>{jt.name} ({jt.id})</option>
							{/each}
						{:else}
							{#each data.presets.joystickTypes as jt}
								<option value={jt} selected={jt === (meta?.input?.joystick ?? 'none')}>{jt}</option>
							{/each}
						{/if}
					</select>
				</div>
			</div>
		</div>

		<!-- ── Other ─────────────────────────────────────── -->
		<div class="space-y-6" hidden={vmTab !== 'other'}>
			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				ISA RTC
			</h4>
			<div>
				<label for="isartcType" class="label">ISA RTC card</label>
				<select id="isartcType" name="isartcType" class="input-field">
					<option value="none" selected={(meta?.other?.isartcType ?? 'none') === 'none'}>None</option>
					{#if data.hw}
						{#each data.hw.isartc_types?.filter(x => x.id !== 'none' && busOk(x)) ?? [] as rt}
							<option value={rt.id} selected={rt.id === meta?.other?.isartcType}>{rt.name} ({rt.id})</option>
						{/each}
					{/if}
				</select>
			</div>

			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				ISA Memory Expansion
			</h4>
			{#each [1, 2] as slot}
				<div class="rounded-lg border p-4 space-y-3"
					 style="border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);">
					<p class="text-sm font-medium">Slot {slot}</p>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="label text-xs" for={'isamem_' + slot + '_base'}>Base address</label>
							<input
								id={'isamem_' + slot + '_base'}
								name={'isamem_' + slot + '_base'}
								type="number"
								min="0"
								step="16384"
								class="input-field font-mono text-xs"
								value={meta?.other?.[`isamem${slot}Base`] ?? 0}
							/>
						</div>
						<div>
							<label class="label text-xs" for={'isamem_' + slot + '_size'}>Size (KB)</label>
							<select id={'isamem_' + slot + '_size'} name={'isamem_' + slot + '_size'} class="input-field">
								{#each [{ v: 0, l: 'Disabled' }, { v: 64, l: '64 KB' }, { v: 128, l: '128 KB' }, { v: 256, l: '256 KB' }, { v: 512, l: '512 KB' }, { v: 1024, l: '1 MB' }] as opt}
									<option value={opt.v} selected={(meta?.other?.[`isamem${slot}Size`] ?? 0) === opt.v}>{opt.l}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
			{/each}

			<h4 class="text-xs font-semibold uppercase tracking-wider pb-2 border-b"
				style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
				VNC
			</h4>
			<div>
				<label for="vncPassword" class="label">VNC password</label>
				<p class="text-xs mt-0.5 mb-2" style="color: var(--theme-on-surface-variant);">Leave blank for no password</p>
				<input
					id="vncPassword"
					name="vncPassword"
					type="password"
					class="input-field max-w-sm"
					value={meta?.other?.vncPassword ?? ''}
					placeholder="Optional VNC password"
					autocomplete="new-password"
				/>
			</div>
		</div>

						</div>

						<!-- Footer -->
						<div
							class="flex justify-end gap-2 px-6 py-4 shrink-0 border-t"
							style="border-color: color-mix(in srgb, var(--color-outline-variant) 12%, transparent);"
						>
							<button type="button" class="btn-tertiary text-sm" onclick={closeModal}>Cancel</button>
							<button type="submit" class="btn-primary text-sm">
								{editingId ? 'Save profile' : 'Create profile'}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<ConfirmDialog
	bind:open={deleteStorageOpen}
	title="Remove drive"
	message={deleteStorageMessage}
	confirmLabel="Remove"
	onConfirm={() => { if (deleteStorageAction) deleteStorageAction(); }}
/>
