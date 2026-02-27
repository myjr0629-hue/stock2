import type { SectorConfig } from '@/types/sector';

export const cloudFortressConfig: SectorConfig = {
    id: 'cloudfortress',
    name: 'Cloud Fortress',
    shortName: 'CLOUD',
    description: 'Enterprise Cloud & SaaS Powerhouses',
    icon: '☁️',
    theme: {
        accent: 'sky',
        accentHex: '#0ea5e9',
        bg: 'bg-sky-500/5',
        border: 'border-sky-500/20',
        glow: 'shadow-[0_0_20px_rgba(14,165,233,0.15)]',
        gradient: 'from-sky-500/20 to-transparent',
    },
    tickers: ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'],
    apiEndpoints: {
        live: '/api/intel/cloudfortress',
        snapshot: '/api/intel/snapshot?sector=cloudfortress',
        calendar: '/api/intel/cloudfortress-calendar',
    },
};
