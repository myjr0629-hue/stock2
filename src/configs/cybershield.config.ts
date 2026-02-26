import type { SectorConfig } from '@/types/sector';

export const cyberShieldConfig: SectorConfig = {
    id: 'cyber_shield',
    name: 'Cyber Shield',
    shortName: 'CYBER',
    description: 'AI Cybersecurity & Zero Trust Infrastructure',
    icon: '🛡️',
    theme: {
        accent: 'cyan',
        accentHex: '#06b6d4',
        bg: 'bg-cyan-500/5',
        border: 'border-cyan-500/20',
        glow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)]',
        gradient: 'from-cyan-500/20 to-transparent',
    },
    tickers: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'CYBR', 'NET'],
    apiEndpoints: {
        live: '/api/intel/cybershield',
        snapshot: '/api/intel/snapshot?sector=cyber_shield',
        calendar: '/api/cybershield/calendar',
    },
};
