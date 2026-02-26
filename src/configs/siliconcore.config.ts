import type { SectorConfig } from '@/types/sector';

export const siliconCoreConfig: SectorConfig = {
    id: 'silicon_core',
    name: 'AI Infra & Silicon',
    shortName: 'SILICON',
    description: 'AI Semiconductor & Infrastructure Ecosystem',
    icon: '⚡',
    theme: {
        accent: 'amber',
        accentHex: '#f59e0b',
        bg: 'bg-amber-500/5',
        border: 'border-amber-500/20',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
        gradient: 'from-amber-500/20 to-transparent',
    },
    tickers: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'],
    apiEndpoints: {
        live: '/api/intel/siliconcore',
        snapshot: '/api/intel/snapshot?sector=silicon_core',
        calendar: '/api/siliconcore/calendar',
    },
};
