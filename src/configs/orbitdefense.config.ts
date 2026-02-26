import type { SectorConfig } from '@/types/sector';

export const orbitDefenseConfig: SectorConfig = {
    id: 'orbit_defense',
    name: 'Orbit Defense',
    shortName: 'ORBIT',
    description: 'Space & Defense — Aerospace, Satellites, Military Tech',
    icon: '🚀',
    theme: {
        accent: 'sky',
        accentHex: '#0ea5e9',
        bg: 'bg-sky-500/5',
        border: 'border-sky-500/20',
        glow: 'shadow-[0_0_20px_rgba(14,165,233,0.15)]',
        gradient: 'from-sky-500/20 to-transparent',
    },
    tickers: ['LMT', 'RTX', 'AXON', 'KTOS', 'LDOS', 'ASTS', 'LUNR'],
    apiEndpoints: {
        live: '/api/intel/orbitdefense',
        snapshot: '/api/intel/snapshot?sector=orbit_defense',
        calendar: '/api/orbitdefense/calendar',
    },
};
