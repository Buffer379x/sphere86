/**
 * 86Box configuration generator — aligned with Sphere86_legacy Python writer
 * ([General], [Machine] cpu_family + Hz/multi, storage, floppy/CD-ROM, ports).
 */

import type { HardwareLists } from './hardware-db.js';
import { getCpuByIndex } from './hardware-db.js';

export interface HddSlotConfig {
	enabled: boolean;
	bus: string;
	sizeMb: number;
	cylinders: number | null;
	heads: number | null;
	spt: number | null;
	speedPreset: string;
	ideChannel: string;
	file: string;
}

export interface FloppySlotConfig {
	type: string;
	turbo?: boolean;
	checkBpb?: boolean;
	fn?: string;
}

export interface CdromSlotConfig {
	enabled: boolean;
	bus: string;
	ideChannel: string;
	speed: number;
	driveType: string;
	fn: string;
}

export interface MachineConfig {
	general: {
		machineName: string;
		machineType: string;
		/** 86Box cpu_family internal_name (preferred when HW DB loaded). */
		cpuFamily?: string;
		/** Index into hardware DB speed list for cpuFamily. */
		cpuSpeedIndex?: number;
		/** Fallback Hz when cpuFamily missing (older profiles). */
		cpuSpeed?: number;
		cpuMulti?: number;
		cpuUseDynarec?: boolean;
		cpuWaitstates?: number;
		fpuType?: string;
		fpuSoftfloat?: boolean;
		pitMode?: number;
		/** Maps to time_sync: off = omit, local / utc = set string */
		timeSync?: 'local' | 'utc' | 'off';
		memory: number;
	};
	video: {
		card: string;
		vidRenderer?: string;
		voodoo: boolean;
		voodooType?: string;
		showSecondMonitors?: boolean;
	};
	sound: {
		card: string;
		midiOut: string;
		midiIn: string;
		mpu401Standalone?: boolean;
		fmDriver?: string;
		soundIsFloat?: boolean;
	};
	network: {
		type: string;
		card: string;
		hostDev?: string;
	};
	storage: {
		hddController: string;
		ideTerEnabled: boolean;
		ideQuaEnabled: boolean;
		scsiCard: string;
		fdcCard: string;
		hdds: HddSlotConfig[];
		floppies: FloppySlotConfig[];
		cdroms: CdromSlotConfig[];
	};
	ports: {
		com1: boolean;
		com2: boolean;
		com3: boolean;
		com4: boolean;
		lpt1: boolean;
		lpt2: boolean;
		lpt3: boolean;
	};
	input: {
		keyboardType?: string;
		mouse: string;
		joystick: string;
	};
}

const DEFAULT_HDD_CHANNELS = ['0:0', '0:1', '1:0', '1:1', '2:0', '2:1', '3:0', '3:1'];
const DEFAULT_CDROM_CHANNELS: Record<number, string> = {
	1: '1:0',
	2: '1:1',
	3: '2:0',
	4: '2:1',
};

function fmt(v: unknown): string {
	if (typeof v === 'boolean') return v ? '1' : '0';
	if (typeof v === 'number' && Number.isFinite(v) && v === Math.floor(v)) return String(Math.floor(v));
	return String(v ?? '');
}

/** Match legacy hdd_image_calc_chs / vms.py */
export function calcChsFromSizeMb(sizeMb: number): { cyl: number; heads: number; spt: number } {
	let ts = sizeMb * 2048;
	const MAX_TS = 65535 * 16 * 255;
	if (ts > MAX_TS) ts = MAX_TS;
	let spt: number;
	let heads: number;
	let cth: number;
	if (ts >= 65535 * 16 * 63) {
		spt = 255;
		heads = 16;
		cth = Math.floor(ts / spt);
	} else {
		spt = 17;
		cth = Math.floor(ts / spt);
		heads = Math.floor((cth + 1023) / 1024);
		if (heads < 4) heads = 4;
		if (cth >= heads * 1024 || heads > 16) {
			spt = 31;
			heads = 16;
			cth = Math.floor(ts / spt);
		}
		if (cth >= heads * 1024) {
			spt = 63;
			heads = 16;
			cth = Math.floor(ts / spt);
		}
	}
	return { cyl: Math.max(1, Math.floor(cth / heads)), heads, spt };
}

function cdromTypeIndex(hw: HardwareLists | null, internalName: string): number | null {
	if (!hw || !internalName) return null;
	for (let i = 0; i < hw.cdrom_drive_types.length; i++) {
		if (hw.cdrom_drive_types[i].id === internalName) return i;
	}
	return null;
}

function defaultHddSlot(i: number): HddSlotConfig {
	return {
		enabled: i === 0,
		bus: 'ide',
		sizeMb: 512,
		cylinders: null,
		heads: null,
		spt: null,
		speedPreset: '1997_5400rpm',
		ideChannel: DEFAULT_HDD_CHANNELS[i] ?? '0:0',
		file: `hdd/hdd${i + 1}.img`,
	};
}

function normalizeStorage(s: MachineConfig['storage'] | undefined): MachineConfig['storage'] {
	const base = s ?? {
		hddController: 'ide_isa',
		ideTerEnabled: false,
		ideQuaEnabled: false,
		scsiCard: 'none',
		fdcCard: 'none',
		hdds: [],
		floppies: [],
		cdroms: [],
	};
	const hdds = [...(base.hdds || [])];
	while (hdds.length < 8) hdds.push(defaultHddSlot(hdds.length));
	const floppies = [...(base.floppies || [])];
	while (floppies.length < 4) {
		const idx = floppies.length;
		floppies.push({
			type: idx < 2 ? '525_2dd' : 'none',
			turbo: false,
			checkBpb: true,
			fn: '',
		});
	}
	const cdroms = [...(base.cdroms || [])];
	while (cdroms.length < 4) {
		cdroms.push({
			enabled: false,
			bus: 'ide',
			ideChannel: DEFAULT_CDROM_CHANNELS[cdroms.length + 1] ?? '1:0',
			speed: 24,
			driveType: '',
			fn: '',
		});
	}
	return { ...base, hdds, floppies, cdroms };
}

/** Upgrade partial / legacy MachineConfig JSON to current shape. */
export function normalizeMachineConfig(raw: Partial<MachineConfig>): MachineConfig {
	const g = raw.general;
	const mem = g?.memory ?? 1024;
	const legacyCpuSpeed = g?.cpuSpeed;
	const general: MachineConfig['general'] = {
		machineName: g?.machineName ?? '',
		machineType: g?.machineType ?? 'ibm_at',
		cpuFamily: g?.cpuFamily,
		cpuSpeedIndex: g?.cpuSpeedIndex ?? 0,
		cpuSpeed: legacyCpuSpeed,
		cpuMulti: g?.cpuMulti ?? 1,
		cpuUseDynarec: g?.cpuUseDynarec ?? false,
		cpuWaitstates: g?.cpuWaitstates ?? (g as any)?.waitStates ?? 0,
		fpuType: g?.fpuType ?? 'none',
		fpuSoftfloat: g?.fpuSoftfloat ?? false,
		pitMode: g?.pitMode ?? 0,
		timeSync: (() => {
			const t = g?.timeSync;
			if (t === 'utc') return 'utc' as const;
			if (t === 'off' || t === false) return 'off' as const;
			return 'local' as const;
		})(),
		memory: mem,
	};

	const v = raw.video;
	const video: MachineConfig['video'] = {
		card: v?.card ?? 'vga',
		vidRenderer: v?.vidRenderer ?? 'qt_software',
		voodoo: v?.voodoo ?? false,
		voodooType: v?.voodooType ?? 'voodoo1',
		showSecondMonitors: v?.showSecondMonitors ?? false,
	};

	const so = raw.sound;
	const sound: MachineConfig['sound'] = {
		card: so?.card ?? 'sb16',
		midiOut: so?.midiOut ?? 'none',
		midiIn: so?.midiIn ?? 'none',
		mpu401Standalone: so?.mpu401Standalone ?? false,
		fmDriver: so?.fmDriver ?? 'nuked',
		soundIsFloat: so?.soundIsFloat ?? false,
	};

	const n = raw.network;
	const network: MachineConfig['network'] = {
		type: n?.type ?? 'none',
		card: n?.card ?? 'none',
		hostDev: n?.hostDev ?? '',
	};

	const st = raw.storage;
	let hdds: HddSlotConfig[] = [];
	if (st?.hdds?.length) {
		hdds = st.hdds.map((h, i) => ({
			enabled: !!h.enabled,
			bus: h.bus || 'ide',
			sizeMb: h.sizeMb ?? 512,
			cylinders: h.cylinders ?? null,
			heads: h.heads ?? null,
			spt: h.spt ?? null,
			speedPreset: h.speedPreset || '1997_5400rpm',
			ideChannel: h.ideChannel || DEFAULT_HDD_CHANNELS[i] || '0:0',
			file: h.file || `hdd/hdd${i + 1}.img`,
		}));
		while (hdds.length < 8) hdds.push(defaultHddSlot(hdds.length));
	} else if ((st as any)?.floppyA !== undefined || (st as any)?.hddBus) {
		// Legacy single-disk meta
		const legacy = st as any;
		hdds = [
			{
				enabled: true,
				bus: legacy.hddBus || 'ide',
				sizeMb: calcSizeFromChs(
					legacy.hdds?.[0]?.cylinders ?? 1024,
					legacy.hdds?.[0]?.heads ?? 16,
					legacy.hdds?.[0]?.sectors ?? 63
				),
				cylinders: legacy.hdds?.[0]?.cylinders ?? 1024,
				heads: legacy.hdds?.[0]?.heads ?? 16,
				spt: legacy.hdds?.[0]?.sectors ?? 63,
				speedPreset: '1997_5400rpm',
				ideChannel: '0:0',
				file: legacy.hdds?.[0]?.file || 'hdd/hdd1.img',
			},
			...Array.from({ length: 7 }, (_, i) => defaultHddSlot(i + 1)),
		];
	} else {
		hdds = Array.from({ length: 8 }, (_, i) => defaultHddSlot(i));
	}

	let floppies: FloppySlotConfig[] = [];
	if (st?.floppies?.length) {
		floppies = st.floppies.map((f) => ({ ...f, type: f.type || 'none' }));
		while (floppies.length < 4) {
			floppies.push({ type: 'none', turbo: false, checkBpb: true, fn: '' });
		}
	} else if ((st as any)?.floppyA !== undefined) {
		const legacy = st as any;
		floppies = [
			{ type: legacy.floppyA || '35_144', turbo: false, checkBpb: true, fn: '' },
			{ type: legacy.floppyB || 'none', turbo: false, checkBpb: true, fn: '' },
			{ type: 'none', turbo: false, checkBpb: true, fn: '' },
			{ type: 'none', turbo: false, checkBpb: true, fn: '' },
		];
	} else {
		floppies = [
			{ type: '525_2dd', turbo: false, checkBpb: true, fn: '' },
			{ type: '525_2dd', turbo: false, checkBpb: true, fn: '' },
			{ type: 'none', turbo: false, checkBpb: true, fn: '' },
			{ type: 'none', turbo: false, checkBpb: true, fn: '' },
		];
	}

	let cdroms: CdromSlotConfig[] = [];
	if (st?.cdroms?.length) {
		cdroms = st.cdroms.map((c, i) => ({
			enabled: !!c.enabled,
			bus: c.bus || 'ide',
			ideChannel: c.ideChannel || DEFAULT_CDROM_CHANNELS[i + 1] || '1:0',
			speed: c.speed ?? 24,
			driveType: c.driveType || '',
			fn: c.fn || '',
		}));
		while (cdroms.length < 4) {
			const j = cdroms.length;
			cdroms.push({
				enabled: false,
				bus: 'ide',
				ideChannel: DEFAULT_CDROM_CHANNELS[j + 1] || '1:0',
				speed: 24,
				driveType: '',
				fn: '',
			});
		}
	} else if ((st as any)?.cdrom !== undefined) {
		const legacyBus = (st as any).cdrom === 'scsi' ? 'scsi' : 'ide';
		cdroms = [
			{
				enabled: false,
				bus: legacyBus,
				ideChannel: '1:0',
				speed: 24,
				driveType: '',
				fn: '',
			},
			...Array.from({ length: 3 }, (_, i) => ({
				enabled: false,
				bus: 'ide' as const,
				ideChannel: DEFAULT_CDROM_CHANNELS[i + 2] || '1:1',
				speed: 24,
				driveType: '',
				fn: '',
			})),
		];
	} else {
		cdroms = Array.from({ length: 4 }, (_, i) => ({
			enabled: false,
			bus: 'ide' as const,
			ideChannel: DEFAULT_CDROM_CHANNELS[i + 1] || '1:0',
			speed: 24,
			driveType: '',
			fn: '',
		}));
	}

	const storage = normalizeStorage({
		hddController: st?.hddController || 'ide_isa',
		ideTerEnabled: st?.ideTerEnabled ?? false,
		ideQuaEnabled: st?.ideQuaEnabled ?? false,
		scsiCard: st?.scsiCard ?? 'none',
		fdcCard: st?.fdcCard ?? 'none',
		hdds,
		floppies,
		cdroms,
	});

	const p = raw.ports;
	const ports: MachineConfig['ports'] = {
		com1: p?.com1 ?? (p as any)?.serial1 !== false,
		com2: p?.com2 ?? (p as any)?.serial2 !== false,
		com3: p?.com3 ?? false,
		com4: p?.com4 ?? false,
		lpt1: p?.lpt1 ?? (p as any)?.parallel !== false,
		lpt2: p?.lpt2 ?? false,
		lpt3: p?.lpt3 ?? false,
	};

	const inp = raw.input;
	const input: MachineConfig['input'] = {
		keyboardType: inp?.keyboardType ?? 'keyboard_at',
		mouse: inp?.mouse ?? 'ps2',
		joystick: inp?.joystick ?? 'none',
	};

	if ((g as any)?.fpu === true && !g?.fpuType) general.fpuType = '8087';

	return { general, video, sound, network, storage, ports, input };
}

function calcSizeFromChs(cyl: number, heads: number, spt: number): number {
	return Math.floor((cyl * heads * spt * 512) / 1048576);
}

export function generateConfig(config: MachineConfig, hw: HardwareLists | null): string {
	const c = normalizeMachineConfig(config);
	const lines: string[] = [];

	const section = (name: string) => {
		lines.push('');
		lines.push(`[${name}]`);
	};
	const opt = (key: string, val: unknown) => {
		lines.push(`${key} = ${fmt(val)}`);
	};

	// ── [General] ───────────────────────────────────────────────────────────
	section('General');
	let renderer = c.video.vidRenderer || 'qt_software';
	if (!['qt_software', 'qt_opengl', 'qt_vulkan'].includes(renderer)) renderer = 'qt_software';
	opt('vid_renderer', renderer);

	// ── [Machine] ───────────────────────────────────────────────────────────
	section('Machine');
	opt('machine', c.general.machineType);

	const cpuFam = c.general.cpuFamily || '8088';
	opt('cpu_family', cpuFam);

	let hz: number;
	let multi: number;
	if (hw && c.general.cpuFamily && hw.cpu_family_cpus[c.general.cpuFamily]?.length) {
		const list = hw.cpu_family_cpus[c.general.cpuFamily];
		let idx = c.general.cpuSpeedIndex ?? 0;
		const savedHz = c.general.cpuSpeed;
		if (savedHz != null && savedHz > 0) {
			const match = list.findIndex((e) => e.hz === savedHz);
			if (match >= 0) idx = match;
		}
		const r = getCpuByIndex(hw, c.general.cpuFamily, idx);
		hz = r.hz;
		multi = r.multi;
	} else if (c.general.cpuSpeed != null && c.general.cpuSpeed > 0) {
		hz = Math.floor(c.general.cpuSpeed);
		multi = c.general.cpuMulti ?? 1;
	} else {
		hz = 4_772_728;
		multi = 1;
	}
	opt('cpu_speed', hz);
	opt('cpu_multi', multi);
	opt('cpu_use_dynarec', !!c.general.cpuUseDynarec);
	opt('cpu_waitstates', c.general.cpuWaitstates ?? 0);
	opt('fpu_type', c.general.fpuType || 'none');
	if (c.general.fpuSoftfloat) opt('fpu_softfloat', 1);
	opt('mem_size', c.general.memory);
	opt('pit_mode', c.general.pitMode ?? 0);
	if (c.general.timeSync === 'utc') opt('time_sync', 'utc');
	else if (c.general.timeSync === 'local') opt('time_sync', 'local');

	// ── [Video] ─────────────────────────────────────────────────────────────
	section('Video');
	opt('gfxcard', c.video.card || 'vga');
	if (c.video.voodoo) {
		opt('voodoo', 1);
		opt('voodoo_type', c.video.voodooType || 'voodoo1');
	}
	if (c.video.showSecondMonitors) opt('show_second_monitors', 1);

	// ── [Input devices] ─────────────────────────────────────────────────────
	section('Input devices');
	opt('keyboard_type', c.input.keyboardType || 'keyboard_at');
	opt('mouse_type', c.input.mouse || 'ps2');
	if (c.input.joystick && c.input.joystick !== 'none') opt('joystick_type', c.input.joystick);

	// ── [Sound] ─────────────────────────────────────────────────────────────
	section('Sound');
	if (c.sound.card && c.sound.card !== 'none') opt('sndcard', c.sound.card);
	const midi = c.sound.midiOut || 'none';
	if (midi && midi !== 'none') opt('midi_output_device', midi);
	if (c.sound.midiIn && c.sound.midiIn !== 'none') opt('midi_in_device', c.sound.midiIn);
	if (c.sound.mpu401Standalone) opt('mpu401_standalone_enable', 1);
	if ((c.sound.fmDriver || 'nuked') !== 'nuked') opt('fm_driver', c.sound.fmDriver);
	if (c.sound.soundIsFloat) opt('sound_is_float', 1);

	// ── [Network] ───────────────────────────────────────────────────────────
	section('Network');
	const nc = c.network.card || 'none';
	if (nc && nc !== 'none') opt('net_01_card', nc);
	opt('net_01_net_type', c.network.type || 'slirp');
	if (c.network.hostDev) opt('net_01_host_device', c.network.hostDev);
	opt('net_01_link', 0);

	// ── [Storage controllers] ───────────────────────────────────────────────
	section('Storage controllers');
	const hdc = c.storage.hddController || 'ide_isa';
	if (hdc && hdc !== 'none' && hdc !== 'internal') opt('hdc_1', hdc);
	let hdcSlot = 2;
	if (c.storage.ideTerEnabled) {
		opt(`hdc_${hdcSlot}`, 'ide_ter');
		hdcSlot++;
	}
	if (c.storage.ideQuaEnabled) {
		opt(`hdc_${hdcSlot}`, 'ide_qua');
		hdcSlot++;
	}
	if ((c.storage.scsiCard || 'none') !== 'none') opt('scsicard_1', c.storage.scsiCard);
	const fdc = c.storage.fdcCard || 'none';
	if (fdc && fdc !== 'none') opt('fdc_card', fdc);

	// ── [Hard disks] ───────────────────────────────────────────────────────
	section('Hard disks');
	for (let i = 0; i < 8; i++) {
		const h = c.storage.hdds[i];
		if (!h?.enabled) continue;
		const n = String(i + 1).padStart(2, '0');
		const bus = h.bus || 'ide';
		let cyls: number;
		let heads: number;
		let spt: number;
		if (h.cylinders != null && h.heads != null && h.spt != null) {
			cyls = h.cylinders;
			heads = h.heads;
			spt = h.spt;
		} else {
			const chs = calcChsFromSizeMb(h.sizeMb || 512);
			cyls = chs.cyl;
			heads = chs.heads;
			spt = chs.spt;
		}
		opt(`hdd_${n}_parameters`, `${spt}, ${heads}, ${cyls}, 0, ${bus}`);
		opt(`hdd_${n}_fn`, h.file || `hdd/hdd${i + 1}.img`);
		opt(`hdd_${n}_speed`, h.speedPreset || '1997_5400rpm');
		if (bus === 'ide') {
			const ch = h.ideChannel || DEFAULT_HDD_CHANNELS[i] || '0:0';
			opt(`hdd_${n}_ide_channel`, ch);
		}
	}

	// ── [Floppy and CD-ROM drives] ─────────────────────────────────────────
	section('Floppy and CD-ROM drives');
	const fddDefaults: Record<number, string> = { 1: '525_2dd', 2: '525_2dd', 3: 'none', 4: 'none' };
	for (let i = 0; i < 4; i++) {
		const n = String(i + 1).padStart(2, '0');
		const f = c.storage.floppies[i];
		const def = fddDefaults[i + 1];
		const ftype = f?.type ?? def;
		if (ftype !== def) opt(`fdd_${n}_type`, ftype);
		if (f?.turbo) opt(`fdd_${n}_turbo`, 1);
		if (f && f.checkBpb === false) opt(`fdd_${n}_check_bpb`, 0);
		const fn = f?.fn || '';
		if (fn && ftype !== 'none') opt(`fdd_${n}_fn`, fn);
	}

	for (let i = 0; i < 4; i++) {
		const n = String(i + 1).padStart(2, '0');
		const cd = c.storage.cdroms[i];
		if (!cd?.enabled) continue;
		const bus = cd.bus || 'ide';
		const busStr = bus === 'ide' || bus === 'atapi' ? 'atapi' : bus;
		opt(`cdrom_${n}_parameters`, `1, ${busStr}`);
		if ((cd.speed ?? 24) !== 24) opt(`cdrom_${n}_speed`, cd.speed);
		const tidx = cdromTypeIndex(hw, cd.driveType || '');
		if (tidx != null) opt(`cdrom_${n}_type`, tidx);
		if (busStr === 'atapi') {
			const ch = cd.ideChannel || DEFAULT_CDROM_CHANNELS[i + 1] || '1:0';
			opt(`cdrom_${n}_ide_channel`, ch);
		}
		if (cd.fn) opt(`cdrom_${n}_image_path`, cd.fn);
	}

	// ── [Ports (COM & LPT)] ─────────────────────────────────────────────────
	section('Ports (COM & LPT)');
	const comDef = [true, true, false, false];
	for (let port = 1; port <= 4; port++) {
		const on = [c.ports.com1, c.ports.com2, c.ports.com3, c.ports.com4][port - 1];
		if (on !== comDef[port - 1]) opt(`com_${port}_enabled`, on ? 1 : 0);
	}
	const lptDef = [true, false, false];
	for (let port = 1; port <= 3; port++) {
		const on = [c.ports.lpt1, c.ports.lpt2, c.ports.lpt3][port - 1];
		if (on !== lptDef[port - 1]) opt(`lpt_${port}_enabled`, on ? 1 : 0);
	}

	return lines.join('\n').replace(/^\n/, '') + '\n';
}

export function parseConfig(raw: string): Partial<MachineConfig> {
	const result: Partial<MachineConfig> = {};
	const lines = raw.split('\n');
	let currentSection = '';

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			currentSection = trimmed.slice(1, -1);
			continue;
		}
		if (!trimmed || trimmed.startsWith('#')) continue;

		const eqIdx = trimmed.indexOf('=');
		if (eqIdx === -1) continue;

		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();

		if (currentSection === 'Machine') {
			if (!result.general) {
				result.general = {
					machineName: '',
					machineType: '',
					memory: 640,
					cpuSpeedIndex: 0,
				};
			}
			switch (key) {
				case 'machine':
					result.general.machineType = value;
					break;
				case 'cpu_family':
					result.general.cpuFamily = value;
					break;
				case 'cpu_speed':
					result.general.cpuSpeed = parseInt(value, 10);
					break;
				case 'cpu_multi':
					result.general.cpuMulti = parseInt(value, 10);
					break;
				case 'cpu_use_dynarec':
					result.general.cpuUseDynarec = value === '1';
					break;
				case 'cpu_waitstates':
					result.general.cpuWaitstates = parseInt(value, 10);
					break;
				case 'fpu_type':
					result.general.fpuType = value;
					break;
				case 'mem_size':
					result.general.memory = parseInt(value, 10);
					break;
				case 'time_sync':
					if (value === 'utc') result.general.timeSync = 'utc';
					else if (value === 'local') result.general.timeSync = 'local';
					break;
			}
		}
		if (currentSection === 'Video') {
			if (!result.video) result.video = { card: '', voodoo: false };
			if (key === 'gfxcard') result.video.card = value;
			if (key === 'voodoo') result.video.voodoo = value === '1';
		}
		if (currentSection === 'Sound') {
			if (!result.sound) result.sound = { card: '', midiOut: '', midiIn: '' };
			if (key === 'sndcard') result.sound.card = value;
			if (key === 'midi_output_device' || key === 'midi_device') result.sound.midiOut = value;
			if (key === 'midi_in_device') result.sound.midiIn = value;
		}
	}

	return result;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** Build structured config from POST fields (names aligned with legacy VMConfig / 86Box). */
export function machineConfigFromFormData(data: FormData): Partial<MachineConfig> {
	const machineType = data.get('machineType')?.toString() || 'ibm_at';
	const cpuFamily = data.get('cpuFamily')?.toString() || '';
	const cpuSpeedIndex = Math.max(0, parseInt(data.get('cpuSpeedIndex')?.toString() || '0', 10) || 0);
	const cpuSpeedRaw = data.get('cpuSpeed')?.toString();
	const cpuSpeed = cpuSpeedRaw != null && cpuSpeedRaw !== '' ? parseInt(cpuSpeedRaw, 10) : undefined;

	const timeSyncRaw = data.get('timeSync')?.toString() || 'local';
	const timeSync: 'local' | 'utc' | 'off' =
		timeSyncRaw === 'utc' ? 'utc' : timeSyncRaw === 'off' ? 'off' : 'local';

	const hdds: HddSlotConfig[] = [];
	for (let i = 1; i <= 8; i++) {
		const n = pad2(i);
		hdds.push({
			enabled: data.get(`hdd_${n}_enabled`) === 'on',
			bus: data.get(`hdd_${n}_bus`)?.toString() || 'ide',
			sizeMb: Math.max(1, parseInt(data.get(`hdd_${n}_size_mb`)?.toString() || '512', 10) || 512),
			cylinders: (() => {
				const v = (data.get(`hdd_${n}_cylinders`)?.toString() ?? '').trim();
				if (v === '') return null;
				const x = parseInt(v, 10);
				return Number.isFinite(x) ? x : null;
			})(),
			heads: (() => {
				const v = (data.get(`hdd_${n}_heads`)?.toString() ?? '').trim();
				if (v === '') return null;
				const x = parseInt(v, 10);
				return Number.isFinite(x) ? x : null;
			})(),
			spt: (() => {
				const v = (data.get(`hdd_${n}_spt`)?.toString() ?? '').trim();
				if (v === '') return null;
				const x = parseInt(v, 10);
				return Number.isFinite(x) ? x : null;
			})(),
			speedPreset: data.get(`hdd_${n}_speed`)?.toString() || '1997_5400rpm',
			ideChannel: data.get(`hdd_${n}_ide_channel`)?.toString() || DEFAULT_HDD_CHANNELS[i - 1] || '0:0',
			file: data.get(`hdd_${n}_fn`)?.toString() || `hdd/hdd${i}.img`,
		});
	}

	const floppies: FloppySlotConfig[] = [];
	for (let i = 1; i <= 4; i++) {
		const n = pad2(i);
		floppies.push({
			type: data.get(`fdd_${n}_type`)?.toString() || (i <= 2 ? '525_2dd' : 'none'),
			turbo: data.get(`fdd_${n}_turbo`) === 'on',
			checkBpb: data.get(`fdd_${n}_check_bpb`) === 'on',
			fn: data.get(`fdd_${n}_fn`)?.toString() || '',
		});
	}

	const cdroms: CdromSlotConfig[] = [];
	for (let i = 1; i <= 4; i++) {
		const n = pad2(i);
		cdroms.push({
			enabled: data.get(`cdrom_${n}_enabled`) === 'on',
			bus: data.get(`cdrom_${n}_bus`)?.toString() || 'ide',
			ideChannel: data.get(`cdrom_${n}_ide_channel`)?.toString() || DEFAULT_CDROM_CHANNELS[i] || '1:0',
			speed: Math.max(1, parseInt(data.get(`cdrom_${n}_speed`)?.toString() || '24', 10) || 24),
			driveType: data.get(`cdrom_${n}_drive_type`)?.toString() || '',
			fn: data.get(`cdrom_${n}_fn`)?.toString() || '',
		});
	}

	return {
		general: {
			machineName: data.get('name')?.toString() || '',
			machineType,
			cpuFamily: cpuFamily || undefined,
			cpuSpeedIndex,
			cpuSpeed: Number.isFinite(cpuSpeed!) ? cpuSpeed : undefined,
			cpuUseDynarec: data.get('cpuUseDynarec') === 'on',
			cpuWaitstates: parseInt(data.get('cpuWaitstates')?.toString() || '0', 10) || 0,
			fpuType: data.get('fpuType')?.toString() || 'none',
			fpuSoftfloat: data.get('fpuSoftfloat') === 'on',
			pitMode: parseInt(data.get('pitMode')?.toString() || '0', 10) || 0,
			timeSync,
			memory: Math.max(64, parseInt(data.get('memory')?.toString() || '4096', 10) || 4096),
		},
		video: {
			card: data.get('videoCard')?.toString() || 'vga',
			vidRenderer: data.get('vidRenderer')?.toString() || 'qt_software',
			voodoo: data.get('voodoo') === 'on',
			voodooType: data.get('voodooType')?.toString() || 'voodoo1',
			showSecondMonitors: data.get('showSecondMonitors') === 'on',
		},
		sound: {
			card: data.get('soundCard')?.toString() || 'sb16',
			midiOut: data.get('midiOut')?.toString() || 'none',
			midiIn: data.get('midiIn')?.toString() || 'none',
			mpu401Standalone: data.get('mpu401Standalone') === 'on',
			fmDriver: data.get('fmDriver')?.toString() || 'nuked',
			soundIsFloat: data.get('soundIsFloat') === 'on',
		},
		network: {
			type: data.get('networkType')?.toString() || 'none',
			card: data.get('networkCard')?.toString() || 'none',
			hostDev: data.get('netHostDev')?.toString() || '',
		},
		storage: {
			hddController: data.get('hddController')?.toString() || 'ide_isa',
			ideTerEnabled: data.get('ide_ter_enabled') === 'on',
			ideQuaEnabled: data.get('ide_qua_enabled') === 'on',
			scsiCard: data.get('scsiCard')?.toString() || 'none',
			fdcCard: data.get('fdcCard')?.toString() || 'none',
			hdds,
			floppies,
			cdroms,
		},
		ports: {
			com1: data.get('com_1_enabled') === 'on',
			com2: data.get('com_2_enabled') === 'on',
			com3: data.get('com_3_enabled') === 'on',
			com4: data.get('com_4_enabled') === 'on',
			lpt1: data.get('lpt_1_enabled') === 'on',
			lpt2: data.get('lpt_2_enabled') === 'on',
			lpt3: data.get('lpt_3_enabled') === 'on',
		},
		input: {
			keyboardType: data.get('keyboardType')?.toString() || 'keyboard_at',
			mouse: data.get('mouse')?.toString() || 'ps2',
			joystick: data.get('joystick')?.toString() || 'none',
		},
	};
}

export function validateMachineConfig(c: MachineConfig, hw: HardwareLists | null): string[] {
	const err: string[] = [];
	const mach = hw?.machines.find((m) => m.id === c.general.machineType);
	if (mach) {
		const min = mach.ram_min ?? 64;
		const max = mach.ram_max ?? 524288;
		if (c.general.memory < min || c.general.memory > max) {
			err.push(`RAM must be between ${min} and ${max} KB for this machine.`);
		}
	}
	if (hw && c.general.cpuFamily) {
		const list = hw.cpu_family_cpus[c.general.cpuFamily];
		if (list?.length) {
			const i = c.general.cpuSpeedIndex ?? 0;
			if (i < 0 || i >= list.length) err.push('CPU speed selection is invalid for this CPU family.');
		}
		const families = hw.cpu_families[c.general.machineType] ?? [];
		if (families.length && !families.some((f) => f.id === c.general.cpuFamily)) {
			err.push('Selected CPU family is not valid for this machine.');
		}
	}
	const bus = mach?.bus_flags ?? 0;
	const busOk = (card: { bus_flags?: number; id: string }) =>
		card.id === 'none' || !card.bus_flags || (card.bus_flags & bus) !== 0;
	if (hw && c.video.card && c.video.card !== 'internal') {
		const v = hw.video_cards.find((x) => x.id === c.video.card);
		if (v && !busOk(v)) err.push('Video card is not compatible with this machine bus.');
	}
	if (hw && c.sound.card && c.sound.card !== 'none') {
		const s = hw.sound_cards.find((x) => x.id === c.sound.card);
		if (s && !busOk(s)) err.push('Sound card is not compatible with this machine bus.');
	}
	return err;
}

export const PRESETS = {
	machineTypes: [
		'ibm_pc',
		'ibm_xt',
		'ibm_at',
		'ibm_ps2_m30_286',
		'ibm_ps2_m50',
		'ibm_ps2_m70_type3',
		'ibm_ps2_m80',
		'award386dx_opti495',
		'award486_opti495',
		'mr586',
		'p55t2p4',
		'p6i440fx',
	],
	cpus: [
		'8088',
		'8086',
		'286',
		'386dx',
		'386sx',
		'486dlc',
		'486dx',
		'486dx2',
		'pentium_p54c',
		'pentium_mmx',
		'pentium_pro',
		'pentium_ii_klamath',
		'pentium_ii_deschutes',
		'pentium_iii_katmai',
		'pentium_iii_coppermine',
	],
	videoCards: [
		'none',
		'cga',
		'mda',
		'ega',
		'vga',
		'et4000ax',
		'et4000w32p',
		's3_virge',
		's3_trio64',
		'cl_gd5428',
		'cl_gd5430',
		'cl_gd5434',
		'ati_mach64gx',
		'ati_rage',
		'riva_tnt',
		'riva_tnt2',
		'geforce2_mx',
	],
	soundCards: [
		'none',
		'sb16',
		'sbpro2',
		'sb2',
		'adlib',
		'gus',
		'pas16',
		'wss',
		'cms',
		'sb_awe32',
		'es1371',
	],
	mouseTypes: ['ps2', 'serial', 'bus', 'none'],
	networkTypes: ['none', 'slirp', 'pcap'],
	networkCards: ['none', 'ne2000', 'rtl8029as', 'rtl8139c', 'dec21041', 'wd8003e'],
	hddBuses: ['ide', 'scsi', 'esdi', 'mfm'],
	floppyTypes: ['none', '525_360', '525_12', '35_720', '35_144', '35_288'],
	joystickTypes: [
		'none',
		'standard',
		'2axis_4button',
		'3axis_2button',
		'4axis_4button',
		'ch_flightstick_pro',
	],
};
