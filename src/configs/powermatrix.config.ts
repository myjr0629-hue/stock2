import type { SectorConfig } from '@/types/sector';

export const powerMatrixConfig: SectorConfig = {
    id: 'power_matrix',
    name: 'Next-Gen Energy & Grid',
    shortName: 'ENERGY',
    description: 'Nuclear, Renewables & Power Infrastructure',
    icon: '☢️',
    theme: {
        accent: 'emerald',
        accentHex: '#10b981',
        bg: 'bg-emerald-500/5',
        border: 'border-emerald-500/20',
        glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
        gradient: 'from-emerald-500/20 to-transparent',
    },
    tickers: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'],
    apiEndpoints: {
        live: '/api/intel/powermatrix',
        snapshot: '/api/intel/snapshot?sector=power_matrix',
        calendar: '/api/powermatrix/calendar',
    },
};
