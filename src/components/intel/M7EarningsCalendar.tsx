// M7 Earnings Calendar Component - Pure White Text
'use client';
import { useMemo } from 'react';
import { Calendar, Zap } from 'lucide-react';
import { EarningsEvent } from '@/services/finnhubClient';

interface M7EarningsCalendarProps {
    earnings: EarningsEvent[];
}

export function M7EarningsCalendar({ earnings }: M7EarningsCalendarProps) {
    const upcoming = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return earnings
            .filter(e => e.date >= today)
            .slice(0, 5);
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
            <div className="bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-white tracking-wider uppercase">EARNINGS CALENDAR</span>
                </div>
                <p className="text-xs text-white/70 mt-2">No upcoming earnings</p>
            </div>
        );
    }

    return (
        <div className="bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 shadow-md">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-white tracking-wider uppercase">EARNINGS CALENDAR</span>
            </div>

            {/* Compact Earnings List */}
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
                                    <span className="text-xs font-bold text-white">{event.symbol}</span>
                                    {isToday && (
                                        <span className="flex items-center gap-0.5 px-1 py-0.5 bg-amber-500 text-black text-[8px] font-bold rounded animate-pulse">
                                            <Zap className="w-2 h-2" /> TODAY
                                        </span>
                                    )}
                                </div>
                                <div className="text-[9px] text-white">{event.date} | {formatHour(event.hour)}</div>
                            </div>

                            {/* EPS */}
                            <div className="text-right flex-shrink-0">
                                <div className="text-[9px] text-white/70 uppercase">EPS Est</div>
                                <div className="text-xs font-bold text-white">${event.epsEstimate?.toFixed(2) || '-'}</div>
                            </div>

                            {/* Days Badge */}
                            <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${isToday
                                ? 'bg-amber-500 text-black'
                                : daysUntil <= 1
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : 'bg-slate-800 text-white'
                                }`}>
                                <span className="text-sm font-black leading-none">
                                    {isToday ? '⚡' : `D-${daysUntil}`}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
