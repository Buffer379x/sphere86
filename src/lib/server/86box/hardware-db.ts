import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { env } from '$env/dynamic/private';
import { log } from '$lib/server/logger.js';
import { busLabel, withBusGroups, BUS_SLOTS } from '$lib/86box/bus-groups.js';

const dataRoot = env.SHARE_ROOT || './data';
const DB_PATH = join(dataRoot, 'config', '86box_hardware_db.json');

export { BUS_SLOTS, busLabel, withBusGroups };

export interface HardwareOption {
	id: string;
	name: string;
	category?: string;
	bus_flags?: number;
	config?: DeviceConfig[];
	ram_min?: number;
	ram_max?: number;
	ram_step?: number;
	rpm?: number | null;
	full_stroke_ms?: number | null;
	track_seek_ms?: number | null;
	heads?: number | null;
	avg_spt?: number | null;
	speed_x?: number | null;
	is_dvd?: boolean | null;
}

export interface DeviceConfig {
	name: string;
	description: string;
	type: string;
	default?: number;
	default_string?: string;
	options?: { description: string; value: number }[];
	spinner_min?: number;
	spinner_max?: number;
	spinner_step?: number;
}

/** Per CPU family: speeds in DB order (index = stored cpuSpeedIndex in meta). */
export interface CpuSpeedEntry {
	label: string;
	hz: number;
	multi: number;
}

export interface HardwareLists {
	machines: HardwareOption[];
	cpu_families: Record<string, HardwareOption[]>;
	cpu_speeds: Record<string, string[]>;
	/** Resolved clock/multi for config generation (matches cpu_speeds order). */
	cpu_family_cpus: Record<string, CpuSpeedEntry[]>;
	video_cards: HardwareOption[];
	sound_cards: HardwareOption[];
	midi_devices: HardwareOption[];
	network_cards: HardwareOption[];
	hdd_controllers: HardwareOption[];
	scsi_cards: HardwareOption[];
	fdc_cards: HardwareOption[];
	mouse_types: HardwareOption[];
	joystick_types: HardwareOption[];
	floppy_types: HardwareOption[];
	cdrom_drive_types: HardwareOption[];
	hdd_speed_presets: HardwareOption[];
}

let cachedDb: HardwareLists | null = null;

function normConfig(entries: any[]): DeviceConfig[] {
	return (entries || []).map(c => {
		const out: any = { ...c };
		out.type = (c.type || '').replace(/^CONFIG_/i, '').toLowerCase();
		if ('default_int' in c) { out.default = c.default_int; delete out.default_int; }
		if ('selection' in c) { out.options = c.selection; delete out.selection; }
		const sp = c.spinner;
		if (sp && (sp.min !== undefined || sp.max !== undefined)) {
			out.spinner_min = sp.min;
			out.spinner_max = sp.max;
			out.spinner_step = sp.step ?? 1;
		}
		delete out.spinner;
		delete out.bios;
		return out;
	});
}

function norm(devices: any[]): HardwareOption[] {
	return (devices || []).map(d => ({
		...d,
		id: d.internal_name || d.id || '',
		config: d.config ? normConfig(d.config) : undefined
	}));
}

export function loadHardwareDb(): HardwareLists | null {
	if (cachedDb) return cachedDb;

	if (!existsSync(DB_PATH)) {
		log('WARN', 'Hardware DB not found at ' + DB_PATH);
		return null;
	}

	try {
		const raw = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
		const machines: HardwareOption[] = (raw.machines || []).map((m: any) => ({
			id: m.internal_name || m.id,
			name: m.name,
			category: m.category,
			bus_flags: m.bus_flags ?? m.flags_value,
			ram_min: m.ram_min,
			ram_max: m.ram_max,
			ram_step: m.ram_step,
		}));

		const cpuFamilies: Record<string, HardwareOption[]> = {};
		const cpuSpeeds: Record<string, string[]> = {};
		const cpuFamilyCpus: Record<string, CpuSpeedEntry[]> = {};
		for (const fam of (raw.cpu_families || [])) {
			const famId = fam.internal_name || fam.id;
			cpuFamilies[famId] = [{ id: famId, name: fam.name }];
			if (fam.cpus) {
				cpuSpeeds[famId] = fam.cpus.map((c: any) => {
					const hz = Number(c.rspeed) || 0;
					const mhz = hz ? Math.round(hz / 1_000_000) : 0;
					const name = (c.name || '').trim();
					return name || `${mhz} MHz`;
				});
				cpuFamilyCpus[famId] = fam.cpus.map((c: any) => {
					const hz = Number(c.rspeed) || 4_772_728;
					const mhz = Math.round(hz / 1_000_000);
					const name = (c.name || '').trim();
					return {
						label: name || `${mhz} MHz`,
						hz,
						multi: Number(c.multi) || 1,
					};
				});
			}
		}

		// Machine -> CPU family mapping
		for (const m of (raw.machines || [])) {
			const mId = m.internal_name || m.id;
			const pkgSet = new Set(m.cpu_packages || []);
			if (pkgSet.size > 0) {
				const matching = (raw.cpu_families || []).filter((f: any) => {
					const famPkgs = (f.package || '').split('|').map((s: string) => s.trim());
					return famPkgs.some((p: string) => pkgSet.has(p));
				});
				if (matching.length > 0) {
					cpuFamilies[mId] = matching.map((f: any) => ({
						id: f.internal_name || f.id,
						name: f.name
					}));
				}
			}
		}

		cachedDb = {
			machines,
			cpu_families: cpuFamilies,
			cpu_speeds: cpuSpeeds,
			cpu_family_cpus: cpuFamilyCpus,
			video_cards: norm(raw.video_cards || []),
			sound_cards: norm(raw.sound_cards || []),
			midi_devices: norm(raw.midi_devices || raw.midi || []),
			network_cards: norm(raw.network_cards || []),
			hdd_controllers: norm(raw.hdc || []),
			scsi_cards: norm(raw.scsi || []),
			fdc_cards: norm(raw.fdc || []),
			mouse_types: (raw.mouse_types || []).map((m: any) => ({ id: m.id || m.internal_name, name: m.name })),
			joystick_types: (raw.joystick_types || []).map((j: any) => ({ id: j.id || j.internal_name, name: j.name })),
			floppy_types: (raw.floppy_types || []).map((f: any) => ({ id: f.id || f.internal_name, name: f.name })),
			cdrom_drive_types: (raw.cdrom_drive_types || []).map((d: any) => ({
				id: d.id || d.internal_name, name: d.name || d.display_name, speed_x: d.speed_x ?? d.speed, is_dvd: d.is_dvd
			})),
			hdd_speed_presets: (raw.hdd_speed_presets || []).map((h: any) => ({
				id: h.id || h.internal_name, name: h.name, category: h.category,
				rpm: h.rpm, full_stroke_ms: h.full_stroke_ms, track_seek_ms: h.track_seek_ms,
				heads: h.heads, avg_spt: h.avg_spt
			})),
		};

		log('INFO', `Hardware DB loaded: ${machines.length} machines, ${Object.keys(cpuSpeeds).length} CPU families`);
		return cachedDb;
	} catch (err) {
		log('ERROR', 'Failed to parse hardware DB', { error: String(err) });
		return null;
	}
}

/** Match legacy Python get_cpu_by_index: clamp index, return Hz + multiplier for 86box.cfg. */
export function getCpuByIndex(hw: HardwareLists, cpuFamilyId: string, speedIndex: number): { hz: number; multi: number } {
	const list = hw.cpu_family_cpus[cpuFamilyId];
	if (!list?.length) return { hz: 4_772_728, multi: 1 };
	const idx = Math.max(0, Math.min(speedIndex, list.length - 1));
	const e = list[idx];
	return { hz: e.hz, multi: e.multi };
}

export function reloadHardwareDb(): void {
	cachedDb = null;
}

export function isHardwareDbAvailable(): boolean {
	return existsSync(DB_PATH);
}

export function getHardwareDbPath(): string {
	return DB_PATH;
}
