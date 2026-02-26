import type { SectorConfig } from '@/types/sector';

export const bioPulseConfig: SectorConfig = {
    id: 'bio_pulse',
    name: 'GLP-1 & Biotech',
    shortName: 'BIO',
    description: 'GLP-1 Therapeutics & Biotech Innovation',
    icon: '🧬',
    theme: {
        accent: 'rose',
        accentHex: '#f43f5e',
        bg: 'bg-rose-500/5',
        border: 'border-rose-500/20',
        glow: 'shadow-[0_0_20px_rgba(244,63,94,0.15)]',
        gradient: 'from-rose-500/20 to-transparent',
    },
    tickers: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'],
    apiEndpoints: {
        live: '/api/intel/biopulse',
        snapshot: '/api/intel/snapshot?sector=bio_pulse',
        calendar: '/api/biopulse/calendar',
    },
};
