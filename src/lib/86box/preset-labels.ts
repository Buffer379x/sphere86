/** UI labels for 86Box internal ids (value in .cfg stays the id). */

export const PRESET_LABELS = {
	machineTypes: {
		ibm_pc: 'IBM PC',
		ibm_xt: 'IBM PC/XT',
		ibm_at: 'IBM PC/AT',
		ibm_ps2_m30_286: 'IBM PS/2 Model 30 (286)',
		ibm_ps2_m50: 'IBM PS/2 Model 50',
		ibm_ps2_m70_type3: 'IBM PS/2 Model 70 (type 3)',
		ibm_ps2_m80: 'IBM PS/2 Model 80',
		award386dx_opti495: '386DX ISA (OPTi 495)',
		award486_opti495: '486 ISA (OPTi 495)',
		mr586: 'MR Intel 586',
		p55t2p4: 'ASUS P/I-P55T2P4 (Socket 7)',
		p6i440fx: 'Intel 440FX (Slot 1 / Pentium II)'
	} as Record<string, string>,
	cpus: {
		'8088': 'Intel 8088',
		'8086': 'Intel 8086',
		'286': 'Intel 80286',
		'386dx': 'Intel 386DX',
		'386sx': 'Intel 386SX',
		'486dlc': 'Cyrix 486DLC',
		'486dx': 'Intel 486DX',
		'486dx2': 'Intel 486DX2',
		pentium_p54c: 'Intel Pentium (P54C)',
		pentium_mmx: 'Intel Pentium MMX',
		pentium_pro: 'Intel Pentium Pro',
		pentium_ii_klamath: 'Intel Pentium II (Klamath)',
		pentium_ii_deschutes: 'Intel Pentium II (Deschutes)',
		pentium_iii_katmai: 'Intel Pentium III (Katmai)',
		pentium_iii_coppermine: 'Intel Pentium III (Coppermine)'
	} as Record<string, string>,
	videoCards: {
		none: 'None',
		cga: 'CGA',
		mda: 'MDA',
		ega: 'EGA',
		vga: 'VGA',
		et4000ax: 'Tseng ET4000AX',
		et4000w32p: 'Tseng ET4000/W32p',
		s3_virge: 'S3 ViRGE',
		s3_trio64: 'S3 Trio64',
		cl_gd5428: 'Cirrus Logic GD5428',
		cl_gd5430: 'Cirrus Logic GD5430',
		cl_gd5434: 'Cirrus Logic GD5434',
		ati_mach64gx: 'ATI Mach64 GX',
		ati_rage: 'ATI 3D Rage',
		riva_tnt: 'NVIDIA RIVA TNT',
		riva_tnt2: 'NVIDIA RIVA TNT2',
		geforce2_mx: 'NVIDIA GeForce2 MX'
	} as Record<string, string>,
	soundCards: {
		none: 'None',
		sb16: 'Sound Blaster 16',
		sbpro2: 'Sound Blaster Pro 2',
		sb2: 'Sound Blaster 2.0',
		adlib: 'AdLib',
		gus: 'Gravis UltraSound',
		pas16: 'Pro AudioSpectrum 16',
		wss: 'Windows Sound System',
		cms: 'Creative Music System',
		sb_awe32: 'Sound Blaster AWE32',
		es1371: 'Ensoniq AudioPCI (ES1371)'
	} as Record<string, string>,
	mouseTypes: {
		ps2: 'PS/2',
		serial: 'Serial',
		bus: 'Bus mouse',
		none: 'None'
	} as Record<string, string>,
	networkTypes: {
		none: 'None',
		slirp: 'SLiRP (NAT)',
		pcap: 'PCAP (bridged)'
	} as Record<string, string>,
	networkCards: {
		none: 'None',
		ne2000: 'Novell NE2000',
		rtl8029as: 'Realtek RTL8029AS',
		rtl8139c: 'Realtek RTL8139C+',
		dec21041: 'DECchip 21041',
		wd8003e: 'Western Digital WD8003E'
	} as Record<string, string>,
	hddBuses: {
		ide: 'IDE',
		scsi: 'SCSI',
		esdi: 'ESDI',
		mfm: 'MFM/RLL'
	} as Record<string, string>,
	floppyTypes: {
		none: 'None',
		'525_360': '5.25" 360 KB',
		'525_12': '5.25" 1.2 MB',
		'35_720': '3.5" 720 KB',
		'35_144': '3.5" 1.44 MB',
		'35_288': '3.5" 2.88 MB'
	} as Record<string, string>
} as const;

export function presetLabel(map: Record<string, string>, id: string): string {
	return map[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
