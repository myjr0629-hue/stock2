/**
 * Shared Sector Definitions for Intel Page
 * Used by both SectorCommandCenter (desktop) and MobileSectorCommand (mobile)
 * 
 * NOTE: This file contains ONLY serializable data (no React elements).
 * Desktop components map `icon` string → Lucide React icon.
 * Mobile components use `icon` string as emoji display.
 */

import type { IntelSharedData } from '@/hooks/useIntelSharedData';

export interface SectorDefBase {
    key: keyof IntelSharedData;
    tabKey: string;
    label: string;
    shortLabel: string;
    icon: string;       // emoji for mobile, mapped to Lucide icon in desktop
    accent: string;     // Tailwind text color class
    accentBg: string;
    accentBorder: string;
    accentHex: string;
}

export const SECTORS: SectorDefBase[] = [
    { key: 'm7', tabKey: 'M7', label: 'Magnificent 7', shortLabel: 'M7', icon: '⚡', accent: 'text-cyan-400', accentBg: 'bg-cyan-500/10', accentBorder: 'border-cyan-500/30', accentHex: '#06b6d4' },
    { key: 'physicalAI', tabKey: 'PHYSICAL_AI', label: 'Physical AI', shortLabel: 'PHYS AI', icon: '🤖', accent: 'text-amber-400', accentBg: 'bg-amber-500/10', accentBorder: 'border-amber-500/30', accentHex: '#f59e0b' },
    { key: 'siliconCore', tabKey: 'SILICON_CORE', label: 'Silicon Core', shortLabel: 'SILICON', icon: '💎', accent: 'text-amber-300', accentBg: 'bg-amber-400/10', accentBorder: 'border-amber-400/30', accentHex: '#fbbf24' },
    { key: 'powerMatrix', tabKey: 'POWER_MATRIX', label: 'Power Matrix', shortLabel: 'POWER', icon: '🔋', accent: 'text-emerald-400', accentBg: 'bg-emerald-500/10', accentBorder: 'border-emerald-500/30', accentHex: '#10b981' },
    { key: 'bioPulse', tabKey: 'BIO_PULSE', label: 'Bio Pulse', shortLabel: 'BIO', icon: '🧬', accent: 'text-rose-400', accentBg: 'bg-rose-500/10', accentBorder: 'border-rose-500/30', accentHex: '#f43f5e' },
    { key: 'cyberShield', tabKey: 'CYBER_SHIELD', label: 'Cyber Shield', shortLabel: 'CYBER', icon: '🛡️', accent: 'text-cyan-300', accentBg: 'bg-cyan-400/10', accentBorder: 'border-cyan-400/30', accentHex: '#22d3ee' },
    { key: 'orbitDefense', tabKey: 'ORBIT_DEFENSE', label: 'Orbit Defense', shortLabel: 'ORBIT', icon: '🚀', accent: 'text-sky-400', accentBg: 'bg-sky-500/10', accentBorder: 'border-sky-500/30', accentHex: '#0ea5e9' },
    { key: 'quantumEdge', tabKey: 'QUANTUM_EDGE', label: 'Quantum Edge', shortLabel: 'QUANTUM', icon: '⚛️', accent: 'text-fuchsia-400', accentBg: 'bg-fuchsia-500/10', accentBorder: 'border-fuchsia-500/30', accentHex: '#d946ef' },
    { key: 'fintechPulse', tabKey: 'FINTECH_PULSE', label: 'Fintech Pulse', shortLabel: 'FINTECH', icon: '💳', accent: 'text-lime-400', accentBg: 'bg-lime-500/10', accentBorder: 'border-lime-500/30', accentHex: '#84cc16' },
    { key: 'cloudFortress', tabKey: 'CLOUD_FORTRESS', label: 'Cloud Fortress', shortLabel: 'CLOUD', icon: '☁️', accent: 'text-sky-300', accentBg: 'bg-sky-400/10', accentBorder: 'border-sky-400/30', accentHex: '#38bdf8' },
];
