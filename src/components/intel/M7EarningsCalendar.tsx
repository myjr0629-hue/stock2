// M7 Earnings Calendar Component - Infographic bg, compact 3-item
'use client';
import { useMemo } from 'react';
import { Calendar, Zap } from 'lucide-react';
import { EarningsEvent } from '@/services/finnhubClient';

interface M7EarningsCalendarProps {
    earnings: EarningsEvent[];
}

// SVG Infographic Background — calendar/timeline pattern
function CalendarBg() {
    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            {/* Calendar grid */}
            <rect x="25" y="30" width="150" height="120" rx="4" stroke="#f59e0b" strokeWidth="1.5" fill="none" opacity="0.2" />
            <line x1="25" y1="55" x2="175" y2="55" stroke="#f59e0b" strokeWidth="1" opacity="0.2" />
            {/* Grid lines */}
            <line x1="62" y1="55" x2="62" y2="150" stroke="#f59e0b" strokeWidth="0.5" opacity="0.15" />
            <line x1="100" y1="55" x2="100" y2="150" stroke="#f59e0b" strokeWidth="0.5" opacity="0.15" />
            <line x1="137" y1="55" x2="137" y2="150" stroke="#f59e0b" strokeWidth="0.5" opacity="0.15" />
            <line x1="25" y1="87" x2="175" y2="87" stroke="#f59e0b" strokeWidth="0.5" opacity="0.15" />
            <line x1="25" y1="119" x2="175" y2="119" stroke="#f59e0b" strokeWidth="0.5" opacity="0.15" />
            {/* Highlighted cell — earnings day */}
            <rect x="63" y="56" width="36" height="30" rx="2" fill="#f59e0b" opacity="0.2" />
            {/* Calendar pins */}
            <line x1="55" y1="22" x2="55" y2="38" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
            <line x1="145" y1="22" x2="145" y2="38" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
            {/* Clock watermark */}
            <circle cx="165" cy="30" r="12" stroke="#f59e0b" strokeWidth="1.5" fill="none" opacity="0.18" />
            <line x1="165" y1="30" x2="165" y2="22" stroke="#f59e0b" strokeWidth="1" opacity="0.18" />
            <line x1="165" y1="30" x2="172" y2="33" stroke="#f59e0b" strokeWidth="1" opacity="0.18" />
        </svg>
    );
}

export function M7EarningsCalendar({ earnings }: M7EarningsCalendarProps) {
    const upcoming = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return earnings
            .filter(e => e.date >= today)
            .slice(0, 3);
    }, [earnings]);

    const getLogoUrl = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    const getDaysUntil = (dateStr: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(dateStr);
        return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const formatHour = (hour: string) => {
        if (hour === 'bmo') return '장전';
        if (hour === 'amc') return '장후';
        return '장중';
    };

    if (upcoming.length === 0) {
        return (
            <div className="relative overflow-hidden bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 h-full">
                <CalendarBg />
                <div className="relative z-10 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-bold text-white tracking-wider uppercase font-jakarta">EARNINGS CALENDAR</span>
                </div>
                <p className="relative z-10 text-xs text-white/70 mt-2">No upcoming earnings</p>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 shadow-md h-full">
            <CalendarBg />
            {/* Top accent */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-bold text-white tracking-wider uppercase font-jakarta">EARNINGS CALENDAR</span>
                </div>

                {/* Earnings List */}
                <div className="space-y-1.5">
                    {upcoming.map((event) => {
                        const daysUntil = getDaysUntil(event.date);
                        const isToday = daysUntil === 0;
                        const isImminent = daysUntil <= 3;

                        return (
                            <div
                                key={`${event.symbol}-${event.date}`}
                                className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${isToday
                                    ? 'bg-amber-500/10 border-amber-500/40'
                                    : isImminent
                                        ? 'bg-slate-800/30 border-slate-700/50'
                                        : 'bg-slate-900/30 border-slate-800/30'
                                    }`}
                            >
                                {/* Logo */}
                                <div className={`w-7 h-7 rounded-full border overflow-hidden bg-white/5 flex-shrink-0 ${isToday ? 'border-amber-500' : 'border-slate-700'}`}>
                                    <img src={getLogoUrl(event.symbol)} alt={event.symbol} className="w-full h-full object-cover" />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-white font-jakarta">{event.symbol}</span>
                                        {isToday && (
                                            <span className="flex items-center gap-0.5 px-1 py-0.5 bg-amber-500 text-black text-[11px] font-bold rounded animate-pulse font-jakarta">
                                                <Zap className="w-2 h-2" /> TODAY
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-white/70 font-num">{event.date} | {formatHour(event.hour)}</div>
                                </div>

                                {/* EPS */}
                                <div className="text-right flex-shrink-0">
                                    <div className="text-[11px] text-white/70 uppercase font-jakarta">EPS Est</div>
                                    <div className="text-xs font-bold text-white font-num">${event.epsEstimate?.toFixed(2) || '-'}</div>
                                </div>

                                {/* Days Badge */}
                                <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${isToday
                                    ? 'bg-amber-500 text-black'
                                    : daysUntil <= 1
                                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                        : 'bg-slate-800 text-white'
                                    }`}>
                                    <span className="text-sm font-extrabold leading-none font-num">
                                        {isToday ? '⚡' : `D-${daysUntil}`}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
