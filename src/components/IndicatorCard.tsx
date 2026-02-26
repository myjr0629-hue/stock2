import React from 'react';
import Image from 'next/image';

interface IndicatorCardProps {
    title: string;
    badge?: string;
    badgeColor?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple';
    imageSrc?: string;
    meaning: string;
    interpretation: React.ReactNode;
    signals?: { label: string; description: string; color: string }[];
}

// Infographic SVG backgrounds per theme
const INFOGRAPHIC_BG: Record<string, React.ReactNode> = {
    cyan: (
        <svg className="absolute right-0 top-0 w-40 h-40 opacity-[0.10] pointer-events-none" viewBox="0 0 160 160">
            <circle cx="130" cy="30" r="25" fill="currentColor" className="text-cyan-400" />
            <circle cx="110" cy="70" r="15" fill="currentColor" className="text-cyan-300" />
            <circle cx="140" cy="90" r="8" fill="currentColor" className="text-cyan-500" />
            <rect x="80" y="120" width="8" height="30" rx="4" fill="currentColor" className="text-cyan-400" />
            <rect x="95" y="110" width="8" height="40" rx="4" fill="currentColor" className="text-cyan-300" />
            <rect x="110" y="100" width="8" height="50" rx="4" fill="currentColor" className="text-cyan-500" />
            <rect x="125" y="90" width="8" height="60" rx="4" fill="currentColor" className="text-cyan-400" />
        </svg>
    ),
    emerald: (
        <svg className="absolute right-0 top-0 w-40 h-40 opacity-[0.10] pointer-events-none" viewBox="0 0 160 160">
            <path d="M100,140 L110,100 L120,120 L130,80 L140,90 L150,50" stroke="currentColor" strokeWidth="3" fill="none" className="text-emerald-400" />
            <circle cx="150" cy="50" r="5" fill="currentColor" className="text-emerald-400" />
            <polygon points="120,20 130,35 110,35" fill="currentColor" className="text-emerald-300" />
            <polygon points="135,15 145,30 125,30" fill="currentColor" className="text-emerald-500" />
            <rect x="90" y="25" width="20" height="3" rx="1.5" fill="currentColor" className="text-emerald-300" />
            <rect x="90" y="32" width="14" height="3" rx="1.5" fill="currentColor" className="text-emerald-400" />
        </svg>
    ),
    amber: (
        <svg className="absolute right-0 top-0 w-40 h-40 opacity-[0.10] pointer-events-none" viewBox="0 0 160 160">
            <circle cx="130" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-400" />
            <path d="M130,10 L130,40 L150,40" stroke="currentColor" strokeWidth="3" fill="none" className="text-amber-300" />
            <circle cx="130" cy="40" r="12" fill="currentColor" className="text-amber-400" />
            <rect x="90" y="90" width="60" height="4" rx="2" fill="currentColor" className="text-amber-300" />
            <rect x="100" y="100" width="40" height="4" rx="2" fill="currentColor" className="text-amber-400" />
            <rect x="105" y="110" width="30" height="4" rx="2" fill="currentColor" className="text-amber-500" />
        </svg>
    ),
    rose: (
        <svg className="absolute right-0 top-0 w-40 h-40 opacity-[0.10] pointer-events-none" viewBox="0 0 160 160">
            <path d="M90,130 Q110,60 130,90 Q150,30 160,50" stroke="currentColor" strokeWidth="3" fill="none" className="text-rose-400" />
            <path d="M90,140 Q110,80 130,100 Q150,50 160,60" stroke="currentColor" strokeWidth="2" fill="none" className="text-rose-300" strokeDasharray="5,5" />
            <circle cx="140" cy="25" r="12" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400" />
            <line x1="135" y1="20" x2="145" y2="30" stroke="currentColor" strokeWidth="2" className="text-rose-300" />
            <line x1="145" y1="20" x2="135" y2="30" stroke="currentColor" strokeWidth="2" className="text-rose-300" />
        </svg>
    ),
    purple: (
        <svg className="absolute right-0 top-0 w-40 h-40 opacity-[0.10] pointer-events-none" viewBox="0 0 160 160">
            {[0, 1, 2, 3, 4].map(r => [0, 1, 2, 3].map(c => (
                <circle key={`${r}-${c}`} cx={100 + c * 18} cy={15 + r * 18} r="2.5" fill="currentColor" className="text-purple-400" />
            )))}
            <rect x="95" y="105" width="55" height="45" rx="6" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400" />
            <line x1="95" y1="120" x2="150" y2="120" stroke="currentColor" strokeWidth="1" className="text-purple-300" />
            <line x1="120" y1="105" x2="120" y2="150" stroke="currentColor" strokeWidth="1" className="text-purple-300" />
        </svg>
    ),
};

// Gradient themes per badge color
const GRADIENT_THEMES: Record<string, string> = {
    cyan: 'from-cyan-500/[0.07] via-transparent to-blue-500/[0.04]',
    emerald: 'from-emerald-500/[0.07] via-transparent to-teal-500/[0.04]',
    amber: 'from-amber-500/[0.07] via-transparent to-orange-500/[0.04]',
    rose: 'from-rose-500/[0.07] via-transparent to-pink-500/[0.04]',
    purple: 'from-purple-500/[0.07] via-transparent to-indigo-500/[0.04]',
};

// Left accent border color per theme
const ACCENT_BORDER: Record<string, string> = {
    cyan: 'border-l-cyan-500/40',
    emerald: 'border-l-emerald-500/40',
    amber: 'border-l-amber-500/40',
    rose: 'border-l-rose-500/40',
    purple: 'border-l-purple-500/40',
};

export function IndicatorCard({
    title,
    badge,
    badgeColor = 'cyan',
    imageSrc,
    meaning,
    interpretation,
    signals
}: IndicatorCardProps) {
    const badgeColors = {
        cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        rose: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    };

    return (
        <div className={`relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 border-l-[3px] ${ACCENT_BORDER[badgeColor] || ACCENT_BORDER.cyan} shadow-2xl`}>
            {/* Theme-matched gradient overlay */}
            <div className={`absolute inset-0 bg-gradient-to-br ${GRADIENT_THEMES[badgeColor] || GRADIENT_THEMES.cyan} pointer-events-none`} />

            {/* Infographic SVG decoration */}
            {INFOGRAPHIC_BG[badgeColor]}

            <div className="relative p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    {badge && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeColors[badgeColor]}`}>
                            {badge}
                        </span>
                    )}
                </div>

                {/* Screenshot Image */}
                {imageSrc && (
                    <div className="relative w-full h-44 mb-4 rounded-xl overflow-hidden border border-white/10">
                        <Image
                            src={imageSrc}
                            alt={title}
                            fill
                            className="object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                    </div>
                )}

                {/* Meaning */}
                <div className="mb-3">
                    <h4 className="text-[12px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                        💡 의미
                    </h4>
                    <p className="text-[13px] text-slate-300 leading-relaxed">{meaning}</p>
                </div>

                {/* Interpretation */}
                <div className={signals && signals.length > 0 ? 'mb-3' : ''}>
                    <h4 className="text-[12px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                        📊 해석 가이드
                    </h4>
                    <div className="text-slate-300 leading-relaxed">
                        {interpretation}
                    </div>
                </div>

                {/* Signals */}
                {signals && signals.length > 0 && (
                    <div>
                        <h4 className="text-[12px] font-bold text-amber-400 uppercase tracking-wider mb-2">
                            🎯 시그널 의미
                        </h4>
                        <div className="grid gap-1.5">
                            {signals.map((signal, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/50 border border-white/5"
                                >
                                    <span className={`w-2.5 h-2.5 rounded-full ${signal.color}`} />
                                    <span className="font-bold text-white text-[13px]">{signal.label}</span>
                                    <span className="text-slate-300 text-[13px]">{signal.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
