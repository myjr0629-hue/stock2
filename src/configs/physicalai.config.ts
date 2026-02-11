import type { SectorConfig } from '@/types/sector';

export const physicalAIConfig: SectorConfig = {
    id: 'physical_ai',
    name: 'Physical AI',
    shortName: 'ROBOTICS',
    description: 'Robotics & Autonomous Systems',
    icon: '🤖',
    theme: {
        accent: 'violet',
        accentHex: '#8b5cf6',
        bg: 'bg-violet-500/5',
        border: 'border-violet-500/20',
        glow: 'shadow-[0_0_20px_rgba(139,92,246,0.15)]',
        gradient: 'from-violet-500/20 to-transparent',
    },
    tickers: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
    apiEndpoints: {
        live: '/api/intel/physicalai',
        snapshot: '/api/intel/snapshot?sector=physical_ai',
        calendar: '/api/physicalai/calendar',
    },
};
