export const BUS_SLOTS: [number, string][] = [
	[0x00000004, 'ISA'],
	[0x00000020, 'ISA 16-bit'],
	[0x00000080, 'MCA'],
	[0x00001000, 'EISA'],
	[0x00008000, 'VL-Bus'],
	[0x00010000, 'PCI'],
	[0x00080000, 'AGP'],
	[0x00100000, "AC'97"],
];

export function busLabel(flags: number): string {
	for (const [mask, label] of BUS_SLOTS) {
		if (flags & mask) return label;
	}
	return 'Built-in / Other';
}

export function withBusGroups<T extends { bus_flags?: number }>(items: T[]): (T & { category: string })[] {
	const order = ['Built-in / Other', ...BUS_SLOTS.map(([, l]) => l)];
	return items
		.map((item) => ({ ...item, category: busLabel(item.bus_flags ?? 0) }))
		.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
}

export function groupByCategory<T extends { category: string }>(items: T[]): [string, T[]][] {
	const m = new Map<string, T[]>();
	for (const it of items) {
		const c = it.category || 'Other';
		if (!m.has(c)) m.set(c, []);
		m.get(c)!.push(it);
	}
	return [...m.entries()];
}
