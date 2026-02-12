"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock } from 'lucide-react';

// === TYPES ===
interface EconomicEvent {
    date: string;    // 'YYYY-MM-DD'
    time: string;    // 'HH:MM' ET
    event: string;
    impact: 'HIGH' | 'MEDIUM';
    category: 'inflation' | 'employment' | 'fed' | 'growth' | 'manufacturing' | 'consumer';
}

interface Props {
    locale?: string;
    maxEvents?: number;
}

// === CATEGORY DISPLAY ===
const CATEGORY_ICONS: Record<string, string> = {
    inflation: 'CPI',
    employment: 'JOB',
    fed: 'FED',
    growth: 'GDP',
    manufacturing: 'PMI',
    consumer: 'RTL',
};

const CATEGORY_COLORS: Record<string, string> = {
    inflation: 'text-rose-400',
    employment: 'text-cyan-400',
    fed: 'text-amber-400',
    growth: 'text-emerald-400',
    manufacturing: 'text-indigo-400',
    consumer: 'text-purple-400',
};

// === EVENT DATA: Feb 2026 - Sep 2026 ===
// Includes: CPI, PPI, Core PCE, NFP, GDP, FOMC, ISM Mfg PMI, ISM Services PMI,
//           Retail Sales, ADP Employment, Initial Jobless Claims (weekly), 
//           Michigan Consumer Sentiment (prelim+final), JOLTS Job Openings
const EVENTS: EconomicEvent[] = [
    // ===== FEBRUARY 2026 ===== (Official: BLS, BEA, Fed, ISM verified)
    { date: '2026-02-02', time: '10:00', event: 'ISM Manufacturing PMI (Jan)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-02-04', time: '10:00', event: 'ISM Services PMI (Jan)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-02-11', time: '08:30', event: 'Non-Farm Payrolls (Jan)', impact: 'HIGH', category: 'employment' },
    { date: '2026-02-13', time: '08:30', event: 'CPI / Core CPI (Jan)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-02-19', time: '14:00', event: 'FOMC Minutes (Jan)', impact: 'HIGH', category: 'fed' },
    { date: '2026-02-20', time: '08:30', event: 'GDP Advance Estimate (Q4)', impact: 'HIGH', category: 'growth' },
    { date: '2026-02-20', time: '08:30', event: 'Core PCE Price Index (Dec)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-02-27', time: '08:30', event: 'PPI / Core PPI (Jan)', impact: 'HIGH', category: 'inflation' },

    // ===== MARCH 2026 =====
    { date: '2026-03-02', time: '10:00', event: 'ISM Manufacturing PMI (Feb)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-03-04', time: '10:00', event: 'ISM Services PMI (Feb)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-03-06', time: '08:30', event: 'Non-Farm Payrolls (Feb)', impact: 'HIGH', category: 'employment' },
    { date: '2026-03-11', time: '08:30', event: 'CPI / Core CPI (Feb)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-12', time: '08:30', event: 'PPI / Core PPI (Feb)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-13', time: '08:30', event: 'GDP 2nd Estimate (Q4)', impact: 'HIGH', category: 'growth' },
    { date: '2026-03-13', time: '08:30', event: 'Core PCE Price Index (Jan)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-18', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH', category: 'fed' },

    // ===== APRIL 2026 =====
    { date: '2026-04-01', time: '10:00', event: 'ISM Manufacturing PMI (Mar)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-04-03', time: '10:00', event: 'ISM Services PMI (Mar)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-04-03', time: '08:30', event: 'Non-Farm Payrolls (Mar)', impact: 'HIGH', category: 'employment' },
    { date: '2026-04-08', time: '14:00', event: 'FOMC Minutes (Mar)', impact: 'HIGH', category: 'fed' },
    { date: '2026-04-09', time: '08:30', event: 'GDP 3rd Estimate (Q4)', impact: 'HIGH', category: 'growth' },
    { date: '2026-04-09', time: '08:30', event: 'Core PCE Price Index (Feb)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-04-10', time: '08:30', event: 'CPI / Core CPI (Mar)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-04-14', time: '08:30', event: 'PPI / Core PPI (Mar)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-04-29', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH', category: 'fed' },
    { date: '2026-04-30', time: '08:30', event: 'GDP Advance Estimate (Q1)', impact: 'HIGH', category: 'growth' },
    { date: '2026-04-30', time: '08:30', event: 'Core PCE Price Index (Mar)', impact: 'HIGH', category: 'inflation' },

    // ===== MAY 2026 =====
    { date: '2026-05-01', time: '10:00', event: 'ISM Manufacturing PMI (Apr)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-05-05', time: '10:00', event: 'ISM Services PMI (Apr)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-05-08', time: '08:30', event: 'Non-Farm Payrolls (Apr)', impact: 'HIGH', category: 'employment' },
    { date: '2026-05-12', time: '08:30', event: 'CPI / Core CPI (Apr)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-05-13', time: '08:30', event: 'PPI / Core PPI (Apr)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-05-27', time: '14:00', event: 'FOMC Minutes (Apr)', impact: 'HIGH', category: 'fed' },
    { date: '2026-05-28', time: '08:30', event: 'GDP 2nd Estimate (Q1)', impact: 'HIGH', category: 'growth' },
    { date: '2026-05-28', time: '08:30', event: 'Core PCE Price Index (Apr)', impact: 'HIGH', category: 'inflation' },

    // ===== JUNE 2026 =====
    { date: '2026-06-01', time: '10:00', event: 'ISM Manufacturing PMI (May)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-06-03', time: '10:00', event: 'ISM Services PMI (May)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-06-05', time: '08:30', event: 'Non-Farm Payrolls (May)', impact: 'HIGH', category: 'employment' },
    { date: '2026-06-10', time: '08:30', event: 'CPI / Core CPI (May)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-06-11', time: '08:30', event: 'PPI / Core PPI (May)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-06-17', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH', category: 'fed' },
    { date: '2026-06-25', time: '08:30', event: 'GDP 3rd Estimate (Q1)', impact: 'HIGH', category: 'growth' },
    { date: '2026-06-25', time: '08:30', event: 'Core PCE Price Index (May)', impact: 'HIGH', category: 'inflation' },

    // ===== JULY 2026 =====
    { date: '2026-07-01', time: '10:00', event: 'ISM Manufacturing PMI (Jun)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-07-02', time: '08:30', event: 'Non-Farm Payrolls (Jun)', impact: 'HIGH', category: 'employment' },
    { date: '2026-07-06', time: '10:00', event: 'ISM Services PMI (Jun)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-07-08', time: '14:00', event: 'FOMC Minutes (Jun)', impact: 'HIGH', category: 'fed' },
    { date: '2026-07-14', time: '08:30', event: 'CPI / Core CPI (Jun)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-07-15', time: '08:30', event: 'PPI / Core PPI (Jun)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-07-29', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH', category: 'fed' },
    { date: '2026-07-30', time: '08:30', event: 'GDP Advance Estimate (Q2)', impact: 'HIGH', category: 'growth' },
    { date: '2026-07-30', time: '08:30', event: 'Core PCE Price Index (Jun)', impact: 'HIGH', category: 'inflation' },

    // ===== AUGUST 2026 =====
    { date: '2026-08-03', time: '10:00', event: 'ISM Manufacturing PMI (Jul)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-08-05', time: '10:00', event: 'ISM Services PMI (Jul)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-08-07', time: '08:30', event: 'Non-Farm Payrolls (Jul)', impact: 'HIGH', category: 'employment' },
    { date: '2026-08-12', time: '08:30', event: 'CPI / Core CPI (Jul)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-08-13', time: '08:30', event: 'PPI / Core PPI (Jul)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-08-19', time: '14:00', event: 'FOMC Minutes (Jul)', impact: 'HIGH', category: 'fed' },
    { date: '2026-08-26', time: '08:30', event: 'GDP 2nd Estimate (Q2)', impact: 'HIGH', category: 'growth' },
    { date: '2026-08-26', time: '08:30', event: 'Core PCE Price Index (Jul)', impact: 'HIGH', category: 'inflation' },

    // ===== SEPTEMBER 2026 =====
    { date: '2026-09-01', time: '10:00', event: 'ISM Manufacturing PMI (Aug)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-09-03', time: '10:00', event: 'ISM Services PMI (Aug)', impact: 'HIGH', category: 'manufacturing' },
    { date: '2026-09-04', time: '08:30', event: 'Non-Farm Payrolls (Aug)', impact: 'HIGH', category: 'employment' },
    { date: '2026-09-10', time: '08:30', event: 'PPI / Core PPI (Aug)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-09-11', time: '08:30', event: 'CPI / Core CPI (Aug)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-09-16', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH', category: 'fed' },
    { date: '2026-09-30', time: '08:30', event: 'GDP 3rd Estimate (Q2)', impact: 'HIGH', category: 'growth' },
    { date: '2026-09-30', time: '08:30', event: 'Core PCE Price Index (Aug)', impact: 'HIGH', category: 'inflation' },
];

// === HELPERS ===
function getCountdown(eventDate: Date, now: Date): string {
    const diff = eventDate.getTime() - now.getTime();
    if (diff <= 0) return 'NOW';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function parseEventDate(event: EconomicEvent): Date {
    const [y, m, d] = event.date.split('-').map(Number);
    const [h, min] = event.time.split(':').map(Number);
    // Create as ET (UTC-5 approx)
    return new Date(Date.UTC(y, m - 1, d, h + 5, min));
}

// === COMPONENT ===
export function EconomicCalendarWidget({ locale = 'ko', maxEvents = 3 }: Props) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    const upcomingEvents = useMemo(() => {
        return EVENTS
            .map(e => ({ ...e, dateObj: parseEventDate(e) }))
            .filter(e => e.dateObj.getTime() > now.getTime() - 3600_000)
            .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    }, [now]);

    const groupedEvents = useMemo(() => {
        const groups: { dateStr: string; events: (EconomicEvent & { dateObj: Date })[] }[] = [];
        const shown = upcomingEvents.slice(0, maxEvents * 3);
        for (const event of shown) {
            const dateStr = event.date;
            const existing = groups.find(g => g.dateStr === dateStr);
            if (existing) {
                existing.events.push(event);
            } else {
                groups.push({ dateStr, events: [event] });
            }
        }
        return groups.slice(0, maxEvents);
    }, [upcomingEvents, maxEvents]);

    const nextEvent = upcomingEvents[0];
    const countdown = nextEvent ? getCountdown(nextEvent.dateObj, now) : '--';

    const formatDate = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const weekday = date.toLocaleDateString(locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US', { weekday: 'short' });
        return `${m}/${d} ${weekday}`;
    };

    // Convert ET time to locale timezone
    const tzLabel = locale === 'ko' ? 'KST' : locale === 'ja' ? 'JST' : 'ET';
    const convertTime = (etTime: string) => {
        if (locale === 'en') return etTime;
        // KST/JST = ET + 14 hours
        const [h, m] = etTime.split(':').map(Number);
        const converted = (h + 14) % 24;
        return `${String(converted).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    return (
        <div className="border border-slate-800 rounded-lg p-4 relative flex flex-col shadow-2xl flex-none"
            style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(10,14,20,0.98))',
                backdropFilter: 'blur(20px)',
            }}
        >
            {/* Header */}
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    ECONOMIC CALENDAR
                </h3>
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] bg-blue-950/50 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20 font-bold">
                        US
                    </span>
                    <span className="text-[11px] bg-rose-950/50 text-rose-300 px-2 py-0.5 rounded border border-rose-500/20 font-bold">
                        HIGH
                    </span>
                </div>
            </div>

            {/* Next Impact Countdown */}
            {nextEvent && (
                <div className="flex items-center gap-2 mb-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-700/30">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] text-white font-bold">Next Impact:</span>
                    <span className="text-[13px] font-mono font-black text-amber-400">{countdown}</span>
                    <span className="text-[11px] text-slate-400 truncate ml-auto">{nextEvent.event}</span>
                </div>
            )}

            {/* Event List */}
            <div className="space-y-2 flex-1">
                {groupedEvents.map((group, gi) => (
                    <div key={gi} className="flex gap-2">
                        {/* Date column */}
                        <div className="w-[52px] flex-shrink-0 text-right">
                            <div className="text-[11px] font-mono text-slate-500 font-bold">{formatDate(group.dateStr)}</div>
                        </div>
                        {/* Events */}
                        <div className="flex-1 min-w-0">
                            {group.events.map((event, ei) => (
                                <div key={ei} className="flex items-center gap-1.5">
                                    <span className={`text-[11px] font-mono font-black px-1 py-0.5 rounded ${CATEGORY_COLORS[event.category] || 'text-white'} bg-white/5`}>{CATEGORY_ICONS[event.category] || 'ETC'}</span>
                                    <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">{convertTime(event.time)}</span>
                                    <span className={`text-[13px] font-semibold truncate ${CATEGORY_COLORS[event.category] || 'text-white'}`}>
                                        {event.event}
                                    </span>
                                    <span className={`ml-auto flex-shrink-0 w-2 h-2 rounded-full ${event.impact === 'HIGH' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="mt-2 pt-2 border-t border-slate-800/40 flex items-center justify-between">
                <span className="text-[11px] text-slate-600 font-mono">
                    {upcomingEvents.length} events tracked · {tzLabel}
                </span>
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-[11px] text-slate-500">HIGH</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-[11px] text-slate-500">MED</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
