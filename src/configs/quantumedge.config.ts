import type { SectorConfig } from '@/types/sector';

export const quantumEdgeConfig: SectorConfig = {
    id: 'quantumedge',
    name: 'Quantum Edge',
    shortName: 'QUANTUM',
    description: 'Quantum Computing & AI Infrastructure Frontier',
    icon: '🔮',
    theme: {
        accent: 'fuchsia',
        accentHex: '#d946ef',
        bg: 'bg-fuchsia-500/5',
        border: 'border-fuchsia-500/20',
        glow: 'shadow-[0_0_20px_rgba(217,70,239,0.15)]',
        gradient: 'from-fuchsia-500/20 to-transparent',
    },
    tickers: ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'],
    apiEndpoints: {
        live: '/api/intel/quantumedge',
        snapshot: '/api/intel/snapshot?sector=quantumedge',
        calendar: '/api/intel/quantumedge-calendar',
    },
};
