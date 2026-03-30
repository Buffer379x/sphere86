<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Category = 'machines' | 'video' | 'sound' | 'network' | 'controllers' | 'harddrives' | 'optical' | 'input';

	const CATEGORIES: { id: Category; label: string }[] = [
		{ id: 'machines',    label: 'Machines' },
		{ id: 'video',       label: 'Video Cards' },
		{ id: 'sound',       label: 'Sound Cards' },
		{ id: 'network',     label: 'Network Cards' },
		{ id: 'controllers', label: 'Controllers' },
		{ id: 'harddrives',  label: 'Hard Drives' },
		{ id: 'optical',     label: 'Optical Drives' },
		{ id: 'input',       label: 'Input Devices' },
	];

	const BUS_SLOTS: [number, string][] = [
		[0x00000004, 'ISA'], [0x00000020, 'ISA 16-bit'], [0x00000080, 'MCA'],
		[0x00001000, 'EISA'], [0x00008000, 'VL-Bus'], [0x00010000, 'PCI'],
		[0x00080000, 'AGP'], [0x00100000, "AC'97"],
	];

	function busLabel(flags: number): string {
		for (const [mask, label] of BUS_SLOTS) { if (flags & mask) return label; }
		return 'Built-in / Other';
	}

	function busLabels(flags: number): string[] {
		return BUS_SLOTS.filter(([mask]) => flags & mask).map(([, label]) => label);
	}

	function formatRam(kb: number): string {
		if (kb >= 1024 * 1024) return `${kb / 1024 / 1024} GB`;
		if (kb >= 1024) return `${kb / 1024} MB`;
		return `${kb} KB`;
	}

	type HwItem = { id: string; name: string; category?: string; bus_flags?: number; [k: string]: any };

	let category = $state<Category>('machines');
	let selectedItem = $state<HwItem | null>(null);
	let search = $state('');

	function getItems(cat: Category): HwItem[] {
		const hw = data.hw;
		if (!hw) return [];
		switch (cat) {
			case 'machines': return hw.machines;
			case 'video': return hw.video_cards;
			case 'sound': return [...hw.sound_cards.filter((s: any) => s.id !== 'none'), ...(hw.midi_devices || []).filter((m: any) => m.id !== 'none').map((m: any) => ({ ...m, category: 'MIDI' }))];
			case 'network': return hw.network_cards.filter((n: any) => n.id !== 'none');
			case 'controllers': return [...(hw.hdd_controllers || []).map((h: any) => ({ ...h, category: 'HDD Controllers' })), ...(hw.scsi_cards || []).filter((s: any) => s.id !== 'none').map((s: any) => ({ ...s, category: 'SCSI Cards' })), ...(hw.fdc_cards || []).filter((f: any) => f.id !== 'none').map((f: any) => ({ ...f, category: 'FDC Cards' }))];
			case 'harddrives': return (hw.hdd_speed_presets || []).map((h: any) => ({ ...h, category: h.category ?? 'Generic' }));
			case 'optical': return (hw.cdrom_drive_types || []).map((d: any) => ({ ...d, category: d.is_dvd ? 'DVD' : 'CD-ROM' }));
			case 'input': return [...(hw.mouse_types || []).filter((m: any) => m.id !== 'none').map((m: any) => ({ ...m, category: 'Mouse' })), ...(hw.joystick_types || []).filter((j: any) => j.id !== 'none').map((j: any) => ({ ...j, category: 'Joystick' }))];
		}
	}

	let items = $derived(getItems(category));
	let filteredItems = $derived(() => {
		const q = search.toLowerCase();
		return q ? items.filter(i => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)) : items;
	});

	let groupedItems = $derived(() => {
		const fi = filteredItems();
		const map = new Map<string, HwItem[]>();
		for (const item of fi) {
			const cat = item.category ?? '';
			if (!map.has(cat)) map.set(cat, []);
			map.get(cat)!.push(item);
		}
		return map;
	});

	let compatVideo = $derived(() => {
		if (!selectedItem || category !== 'machines' || !data.hw) return [];
		const mFlags = selectedItem.bus_flags ?? 0;
		return data.hw.video_cards.filter((v: any) => !v.bus_flags || (mFlags & v.bus_flags));
	});

	let compatSound = $derived(() => {
		if (!selectedItem || category !== 'machines' || !data.hw) return [];
		const mFlags = selectedItem.bus_flags ?? 0;
		return data.hw.sound_cards.filter((s: any) => s.id !== 'none' && (!s.bus_flags || (mFlags & s.bus_flags)));
	});

	let compatNetwork = $derived(() => {
		if (!selectedItem || category !== 'machines' || !data.hw) return [];
		const mFlags = selectedItem.bus_flags ?? 0;
		return data.hw.network_cards.filter((n: any) => n.id !== 'none' && (!n.bus_flags || (mFlags & n.bus_flags)));
	});

	let compatMachines = $derived(() => {
		if (!selectedItem || category === 'machines' || !data.hw) return [];
		const flags = selectedItem.bus_flags ?? 0;
		if (!flags) return [];
		return data.hw.machines.filter((m: any) => (m.bus_flags ?? 0) & flags);
	});

	let cpuFamilies = $derived(() => {
		if (!selectedItem || category !== 'machines' || !data.hw) return [];
		const hw = data.hw;
		const families = hw.cpu_families[selectedItem.id] || [];
		return families.map((f: any) => ({
			...f,
			speeds: hw.cpu_speeds[f.id] || []
		}));
	});

	function selectCategory(cat: Category) {
		category = cat;
		selectedItem = null;
		search = '';
	}

</script>

<div class="flex flex-col gap-6 flex-1 min-h-0">
	<div class="shrink-0">
		<h1 class="text-2xl font-semibold tracking-tight">Hardware Database</h1>
		<p class="mt-1 text-sm" style="color: var(--theme-on-surface-variant);">
			Browse 86Box hardware: machines, CPUs, and compatible devices.
			To download or regenerate the JSON database, use <strong>Settings</strong> → <strong>General</strong> → <strong>Hardware database</strong>.
		</p>
	</div>

	{#if !data.available || !data.hw}
		<div class="card text-center py-16 shrink-0">
			<p class="text-base" style="color: var(--theme-on-surface-variant);">Hardware database not available</p>
			<p class="text-sm mt-2" style="color: var(--theme-on-surface-variant);">
				Open <a href="/settings" class="underline font-medium" style="color: var(--theme-primary);">Settings</a>
				and run <strong>Refresh / Generate hardware DB</strong> to download the 86Box source and
				generate <code class="font-mono text-xs">86box_hardware_db.json</code> automatically.
			</p>
		</div>
	{:else}
		<div class="card p-0 overflow-hidden flex flex-col flex-1 min-h-0" style="min-height: 22rem;">
		<div class="flex flex-1 min-h-0 overflow-hidden rounded-lg" style="border: 1px solid color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
			<!-- Col 1: Category nav -->
			<div class="flex-shrink-0 flex flex-col min-h-0 w-44" style="background: var(--theme-surface-low);">
				<div class="px-3 py-2.5 text-xs uppercase tracking-wide font-semibold shrink-0" style="color: var(--theme-on-surface-variant); border-bottom: 1px solid color-mix(in srgb, var(--color-outline-variant) 15%, transparent);">
					{data.hw.machines.length} machines
				</div>
				<nav class="py-1 px-1 space-y-0.5 overflow-y-auto flex-1 min-h-0">
					{#each CATEGORIES as cat}
						{@const count = getItems(cat.id).length}
						<button onclick={() => selectCategory(cat.id)}
								class="w-full flex items-center justify-between gap-1 px-2 py-2 rounded-md text-left text-sm font-medium transition-colors"
								style="background: {category === cat.id ? 'var(--theme-surface-high)' : 'transparent'}; color: {category === cat.id ? 'var(--theme-primary)' : 'var(--theme-on-surface-variant)'};">
							<span class="truncate">{cat.label}</span>
							<span class="text-xs tabular-nums opacity-70">{count}</span>
						</button>
					{/each}
				</nav>
			</div>

			<!-- Col 2: Items list -->
			<div class="flex-shrink-0 flex flex-col min-h-0 w-64 border-l" style="background: var(--theme-surface); border-color: color-mix(in srgb, var(--color-outline-variant) 10%, transparent);">
				<div class="p-2 shrink-0" style="border-bottom: 1px solid color-mix(in srgb, var(--color-outline-variant) 10%, transparent);">
					<input type="text" bind:value={search} placeholder="Search..."
						   class="input-field text-sm py-2"
						   autocomplete="off"
						   data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true" />
					<p class="text-xs mt-1 pl-0.5" style="color: var(--theme-on-surface-variant);">
						{filteredItems().length} of {items.length}
					</p>
				</div>
				<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
					{#each [...groupedItems().entries()] as [group, groupItems]}
						{#if group}
							<div class="sticky top-0 z-10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
								 style="background: var(--theme-surface-low); color: var(--theme-on-surface-variant); border-bottom: 1px solid color-mix(in srgb, var(--color-outline-variant) 10%, transparent);">
								{group} <span class="font-normal opacity-80">({groupItems.length})</span>
							</div>
						{/if}
						{#each groupItems as item}
							<button onclick={() => selectedItem = item}
									class="w-full text-left px-3 py-2 transition-colors"
									style="background: {selectedItem?.id === item.id ? 'var(--theme-surface-high)' : 'transparent'}; border-bottom: 1px solid color-mix(in srgb, var(--color-outline-variant) 5%, transparent);">
								<p class="text-sm font-medium truncate"
								   style="color: {selectedItem?.id === item.id ? 'var(--theme-primary)' : 'var(--theme-on-surface)'};">
									{item.name}
								</p>
								<p class="text-xs font-mono truncate opacity-80" style="color: var(--theme-on-surface-variant);">{item.id}</p>
							</button>
						{/each}
					{/each}
					{#if filteredItems().length === 0}
						<p class="px-3 py-8 text-xs text-center" style="color: var(--theme-on-surface-variant);">No results</p>
					{/if}
				</div>
			</div>

			<!-- Col 3: Detail -->
			<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-6 border-l" style="border-color: color-mix(in srgb, var(--color-outline-variant) 10%, transparent);">
				{#if selectedItem}
					<div>
						<h2 class="text-lg font-semibold tracking-tight">{selectedItem.name}</h2>
						<p class="text-xs font-mono mt-0.5" style="color: var(--theme-on-surface-variant);">{selectedItem.id}</p>
						{#if selectedItem.category}
							<p class="text-xs mt-1" style="color: var(--theme-on-surface-variant);">{selectedItem.category}</p>
						{/if}
					</div>

					<!-- Machine: RAM -->
					{#if selectedItem.ram_min !== undefined || selectedItem.ram_max !== undefined}
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest mb-2" style="color: var(--theme-on-surface-variant);">Memory</p>
							<div class="flex gap-6 text-sm">
								{#if selectedItem.ram_min !== undefined}
									<span>Min: <span class="font-mono">{formatRam(selectedItem.ram_min)}</span></span>
								{/if}
								{#if selectedItem.ram_max !== undefined}
									<span>Max: <span class="font-mono">{formatRam(selectedItem.ram_max)}</span></span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Bus flags -->
					{#if (selectedItem.bus_flags ?? 0) > 0}
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest mb-2" style="color: var(--theme-on-surface-variant);">
								{category === 'machines' ? 'Expansion Buses' : 'Interface'}
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#each (category === 'machines' ? busLabels(selectedItem.bus_flags ?? 0) : [busLabel(selectedItem.bus_flags ?? 0)]) as bus}
									<span class="text-[10px] font-medium px-1.5 py-0.5 rounded"
										  style="background: color-mix(in srgb, var(--theme-primary) 15%, transparent); color: var(--theme-primary);">
										{bus}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Machine: CPU families -->
					{#if category === 'machines' && cpuFamilies().length > 0}
						<div
							class="rounded-lg border overflow-hidden flex flex-col"
							style="border-color: color-mix(in srgb, var(--color-outline-variant) 28%, transparent); background: var(--theme-surface-low); max-height: 14rem;"
						>
							<p class="text-[10px] font-semibold uppercase tracking-widest shrink-0 px-3 py-2 border-b"
							   style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);">
								CPU Families
							</p>
							<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-2">
								{#each cpuFamilies() as cpu}
									<div>
										<p class="text-xs font-medium">{cpu.name}</p>
										{#if cpu.speeds.length > 0}
											<p class="text-[10px] font-mono mt-0.5" style="color: var(--theme-on-surface-variant);">
												{cpu.speeds.join(' · ')} MHz
											</p>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Machine: Compatible devices -->
					{#if category === 'machines'}
						{#if compatVideo().length > 0}
							<div
								class="rounded-lg border overflow-hidden flex flex-col"
								style="border-color: color-mix(in srgb, var(--color-outline-variant) 28%, transparent); background: var(--theme-surface-low); max-height: 12rem;"
							>
								<p class="text-[10px] font-semibold uppercase tracking-widest shrink-0 px-3 py-2 border-b"
								   style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);">
									Video Cards ({compatVideo().length})
								</p>
								<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-1">
									{#each compatVideo() as v}
										<p class="text-xs">{v.name}</p>
									{/each}
								</div>
							</div>
						{/if}
						{#if compatSound().length > 0}
							<div
								class="rounded-lg border overflow-hidden flex flex-col"
								style="border-color: color-mix(in srgb, var(--color-outline-variant) 28%, transparent); background: var(--theme-surface-low); max-height: 12rem;"
							>
								<p class="text-[10px] font-semibold uppercase tracking-widest shrink-0 px-3 py-2 border-b"
								   style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);">
									Sound Cards ({compatSound().length})
								</p>
								<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-1">
									{#each compatSound() as s}
										<p class="text-xs">{s.name}</p>
									{/each}
								</div>
							</div>
						{/if}
						{#if compatNetwork().length > 0}
							<div
								class="rounded-lg border overflow-hidden flex flex-col"
								style="border-color: color-mix(in srgb, var(--color-outline-variant) 28%, transparent); background: var(--theme-surface-low); max-height: 12rem;"
							>
								<p class="text-[10px] font-semibold uppercase tracking-widest shrink-0 px-3 py-2 border-b"
								   style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);">
									Network Cards ({compatNetwork().length})
								</p>
								<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-1">
									{#each compatNetwork() as n}
										<p class="text-xs">{n.name}</p>
									{/each}
								</div>
							</div>
						{/if}
					{/if}

					<!-- Component: Compatible machines -->
					{#if category !== 'machines' && compatMachines().length > 0}
						<div
							class="rounded-lg border overflow-hidden flex flex-col"
							style="border-color: color-mix(in srgb, var(--color-outline-variant) 28%, transparent); background: var(--theme-surface-low); max-height: 15rem;"
						>
							<p class="text-[10px] font-semibold uppercase tracking-widest shrink-0 px-3 py-2 border-b"
							   style="color: var(--theme-on-surface-variant); border-color: color-mix(in srgb, var(--color-outline-variant) 18%, transparent);">
								Compatible Machines ({compatMachines().length})
							</p>
							<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-0.5">
								{#each compatMachines() as m}
									<div class="flex items-baseline gap-2 py-0.5">
										<span class="text-xs">{m.name}</span>
										<span class="text-[10px] font-mono" style="color: var(--theme-on-surface-variant);">{m.id}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- HDD specs -->
					{#if selectedItem.rpm || selectedItem.full_stroke_ms || selectedItem.track_seek_ms}
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest mb-2" style="color: var(--theme-on-surface-variant);">Drive Specifications</p>
							<div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
								{#if selectedItem.rpm}
									<span style="color: var(--theme-on-surface-variant);">Rotation</span>
									<span class="font-mono">{selectedItem.rpm.toLocaleString()} RPM</span>
								{/if}
								{#if selectedItem.full_stroke_ms}
									<span style="color: var(--theme-on-surface-variant);">Full stroke seek</span>
									<span class="font-mono">{selectedItem.full_stroke_ms} ms</span>
								{/if}
								{#if selectedItem.track_seek_ms}
									<span style="color: var(--theme-on-surface-variant);">Track-to-track</span>
									<span class="font-mono">{selectedItem.track_seek_ms} ms</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Optical specs -->
					{#if selectedItem.speed_x}
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest mb-2" style="color: var(--theme-on-surface-variant);">Drive Specifications</p>
							<div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
								<span style="color: var(--theme-on-surface-variant);">Speed</span>
								<span class="font-mono">{selectedItem.speed_x}x</span>
								<span style="color: var(--theme-on-surface-variant);">Type</span>
								<span class="font-mono">{selectedItem.is_dvd ? 'DVD-ROM' : 'CD-ROM'}</span>
							</div>
						</div>
					{/if}

					<!-- Device config options -->
					{#if selectedItem.config?.length}
						{@const selectionConfigs = selectedItem.config.filter((c: any) => (c.type === 'selection' || c.type === 'hex16') && c.options?.length)}
						{@const binaryConfigs = selectedItem.config.filter((c: any) => c.type === 'binary')}

						{#if selectionConfigs.length > 0}
							<div>
								<p class="text-[10px] font-semibold uppercase tracking-widest mb-2" style="color: var(--theme-on-surface-variant);">Configuration</p>
								{#each selectionConfigs as c}
									<div class="mb-3">
										<p class="text-[11px] font-semibold uppercase tracking-wide mb-1" style="color: var(--theme-on-surface-variant);">
											{c.description || c.name}
										</p>
										<div class="flex flex-wrap gap-1">
											{#each c.options as opt}
												<span class="text-[11px] px-2 py-0.5 rounded"
													  style="background: {opt.value === c.default ? 'color-mix(in srgb, var(--theme-primary) 15%, transparent)' : 'var(--theme-surface-low)'}; color: {opt.value === c.default ? 'var(--theme-primary)' : 'var(--theme-on-surface-variant)'};">
													{opt.description}{#if opt.value === c.default} <span class="opacity-60 text-[9px]">default</span>{/if}
												</span>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}

						{#if binaryConfigs.length > 0}
							<div>
								<p class="text-[10px] font-semibold uppercase tracking-widest mb-2" style="color: var(--theme-on-surface-variant);">Optional Features</p>
								<div class="flex flex-wrap gap-1.5">
									{#each binaryConfigs as c}
										<span class="text-[11px] px-2 py-0.5 rounded"
											  style="background: {c.default === 1 ? 'color-mix(in srgb, var(--theme-success) 15%, transparent)' : 'var(--theme-surface-low)'}; color: {c.default === 1 ? 'var(--theme-success)' : 'var(--theme-on-surface-variant)'};">
											{c.description || c.name}
										</span>
									{/each}
								</div>
								<p class="text-[10px] mt-1.5" style="color: var(--theme-on-surface-variant);">Green = enabled by default</p>
							</div>
						{/if}
					{/if}

					{#if !(selectedItem.bus_flags ?? 0) && !selectedItem.rpm && !selectedItem.speed_x && !(selectedItem.config?.length) && !selectedItem.ram_min}
						<p class="text-xs italic" style="color: var(--theme-on-surface-variant);">No additional details available.</p>
					{/if}
				{:else}
					<div class="h-full flex flex-col items-center justify-center gap-2" style="color: var(--theme-on-surface-variant);">
						<svg class="w-8 h-8 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
						<p class="text-sm">Select an item to explore</p>
					</div>
				{/if}
			</div>
		</div>
		</div>
	{/if}
</div>
