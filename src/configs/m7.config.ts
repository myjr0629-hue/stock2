import type { SectorConfig } from '@/types/sector';

export const m7Config: SectorConfig = {
    id: 'm7',
    name: 'Magnificent 7',
    shortName: 'M7',
    description: 'Tech Giants Driving the AI Revolution',
    icon: '⚡',
    theme: {
        accent: 'cyan',
        accentHex: '#06b6d4',
        bg: 'bg-cyan-500/5',
        border: 'border-cyan-500/20',
        glow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)]',
        gradient: 'from-cyan-500/20 to-transparent',
    },
    tickers: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    apiEndpoints: {
        live: '/api/intel/m7',
        snapshot: '/api/intel/snapshot?sector=m7',
        calendar: '/api/intel/m7-calendar',
    },
};
