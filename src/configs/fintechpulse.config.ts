import type { SectorConfig } from '@/types/sector';

export const fintechPulseConfig: SectorConfig = {
    id: 'fintechpulse',
    name: 'Fintech Pulse',
    shortName: 'FINTECH',
    description: 'Digital Finance & Payment Innovation',
    icon: '💳',
    theme: {
        accent: 'lime',
        accentHex: '#84cc16',
        bg: 'bg-lime-500/5',
        border: 'border-lime-500/20',
        glow: 'shadow-[0_0_20px_rgba(132,204,22,0.15)]',
        gradient: 'from-lime-500/20 to-transparent',
    },
    tickers: ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'],
    apiEndpoints: {
        live: '/api/intel/fintechpulse',
        snapshot: '/api/intel/snapshot?sector=fintech_pulse',
        calendar: '/api/intel/fintechpulse-calendar',
    },
};
