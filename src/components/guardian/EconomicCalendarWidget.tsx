"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';

// === TYPES ===
interface EconomicEvent {
    date: string;    // 'YYYY-MM-DD'
    time: string;    // 'HH:MM' (ET from FMP)
    event: string;
    impact: 'HIGH' | 'MEDIUM';
    category: string;
    actual?: number | null;
    estimate?: number | null;
    previous?: number | null;
    unit?: string | null;
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
    other: 'ETC',
};

const CATEGORY_COLORS: Record<string, string> = {
    inflation: 'text-rose-400',
    employment: 'text-cyan-400',
    fed: 'text-amber-400',
    growth: 'text-emerald-400',
    manufacturing: 'text-indigo-400',
    consumer: 'text-purple-400',
    other: 'text-slate-400',
};

// === FALLBACK DATA ===
const FALLBACK_EVENTS: EconomicEvent[] = [
    { date: '2026-03-11', time: '08:30', event: 'CPI / Core CPI (Feb)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-12', time: '08:30', event: 'PPI / Core PPI (Feb)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-13', time: '08:30', event: 'GDP 2nd Estimate (Q4)', impact: 'HIGH', category: 'growth' },
    { date: '2026-03-13', time: '08:30', event: 'Core PCE Price Index (Jan)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-18', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH', category: 'fed' },
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
    // FMP times are in ET (UTC-4 EDT / UTC-5 EST). Use UTC-5 as baseline.
    return new Date(Date.UTC(y, m - 1, d, h + 5, min));
}

// Format value with unit
function fmtVal(val: number | null | undefined, unit: string | null | undefined): string {
    if (val == null) return '—';
    const u = unit || '';
    if (u === '%') return `${val}%`;
    if (u === 'K') return `${val}K`;
    if (u === 'M') return `${val}M`;
    if (u === 'B') return `${val}B`;
    if (u === 'T') return `${val}T`;
    return `${val}${u}`;
}

const COLLAPSED_MAX_ROWS = 7; // Show 7 event rows when collapsed

// === COMPONENT ===
export function EconomicCalendarWidget({ locale = 'ko', maxEvents = 10 }: Props) {
    const [now, setNow] = useState(() => new Date());
    const [events, setEvents] = useState<EconomicEvent[]>(FALLBACK_EVENTS);
    const [source, setSource] = useState<string>('FALLBACK');
    const [totalCount, setTotalCount] = useState(FALLBACK_EVENTS.length);
    const [expanded, setExpanded] = useState(false);

    // Fetch from API
    useEffect(() => {
        let cancelled = false;
        async function fetchCalendar() {
            try {
                const res = await fetch('/api/guardian/economic-calendar', {
                    cache: 'no-store',
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled && data.events?.length > 0) {
                    setEvents(data.events);
                    setSource(data.source || 'API');
                    setTotalCount(data.totalUS || data.events.length);
                }
            } catch {
                console.warn('[EconCal] API failed, using fallback');
            }
        }
        fetchCalendar();
        return () => { cancelled = true; };
    }, []);

    // Clock tick
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Timezone offset for display
    const tzOffset = locale === 'ko' ? 14 : locale === 'ja' ? 14 : 0; // KST/JST = ET + 14h
    const tzLabel = locale === 'ko' ? 'KST' : locale === 'ja' ? 'JST' : 'ET';

    const convertTime = (etTime: string): string => {
        if (tzOffset === 0) return etTime;
        const [h, m] = etTime.split(':').map(Number);
        const converted = (h + tzOffset) % 24;
        return `${String(converted).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // Does the time conversion cross midnight? (for date display adjustment)
    const doesCrossMidnight = (etTime: string): boolean => {
        if (tzOffset === 0) return false;
        const [h] = etTime.split(':').map(Number);
        return (h + tzOffset) >= 24;
    };

    const upcomingEvents = useMemo(() => {
        return events
            .map(e => ({ ...e, dateObj: parseEventDate(e) }))
            .filter(e => e.dateObj.getTime() > now.getTime() - 3600_000)
            .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    }, [now, events]);

    // Group events by display date (adjusted for timezone)
    const allGroupedEvents = useMemo(() => {
        const groups: { dateStr: string; displayDate: string; events: (EconomicEvent & { dateObj: Date })[] }[] = [];
        const shown = upcomingEvents.slice(0, maxEvents * 4);

        for (const event of shown) {
            // Adjust date if timezone crosses midnight
            let displayDateStr = event.date;
            if (doesCrossMidnight(event.time)) {
                if (locale === 'ko' || locale === 'ja') {
                    const [h] = event.time.split(':').map(Number);
                    if ((h + tzOffset) >= 24) {
                        const nextDay = new Date(event.dateObj);
                        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
                        const ny = nextDay.getUTCFullYear();
                        const nm = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
                        const nd = String(nextDay.getUTCDate()).padStart(2, '0');
                        displayDateStr = `${ny}-${nm}-${nd}`;
                    }
                }
            }

            const existing = groups.find(g => g.dateStr === displayDateStr);
            if (existing) {
                existing.events.push(event);
            } else {
                const [y, m, d] = displayDateStr.split('-').map(Number);
                const date = new Date(y, m - 1, d);
                const weekday = date.toLocaleDateString(
                    locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US',
                    { weekday: 'short' }
                );
                groups.push({
                    dateStr: displayDateStr,
                    displayDate: `${m}/${d} ${weekday}`,
                    events: [event],
                });
            }
        }
        return groups.slice(0, maxEvents);
    }, [upcomingEvents, maxEvents, locale, tzOffset]);

    // Collapse: limit to ~7 event rows total
    const groupedEvents = useMemo(() => {
        if (expanded) return allGroupedEvents;
        let rowCount = 0;
        const limited: typeof allGroupedEvents = [];
        for (const group of allGroupedEvents) {
            rowCount += 1; // date header row
            const remainingRows = COLLAPSED_MAX_ROWS - rowCount;
            if (remainingRows <= 0) break;
            const slicedEvents = group.events.slice(0, remainingRows);
            limited.push({ ...group, events: slicedEvents });
            rowCount += slicedEvents.length;
            if (rowCount >= COLLAPSED_MAX_ROWS) break;
        }
        return limited;
    }, [allGroupedEvents, expanded]);

    const totalVisibleRows = allGroupedEvents.reduce((acc, g) => acc + g.events.length, 0);
    const hasMore = totalVisibleRows > COLLAPSED_MAX_ROWS;

    const nextEvent = upcomingEvents[0];
    const countdown = nextEvent ? getCountdown(nextEvent.dateObj, now) : '--';

    return (
        <div className="relative">
            <div className={`border border-slate-800 rounded-lg p-4 flex flex-col shadow-2xl flex-none overflow-hidden ${expanded ? 'absolute top-0 left-0 right-0 z-50 ring-1 ring-amber-500/30' : ''}`}
                style={{
                    background: 'linear-gradient(90deg, rgba(249,115,22,0.12) 0%, rgba(249,115,22,0.03) 30%, transparent 60%), linear-gradient(135deg, rgba(15,23,42,0.98), rgba(10,14,20,1))',
                    backdropFilter: 'blur(20px)',
                    borderLeft: '3px solid rgba(249,115,22,0.25)',
                    ...(expanded ? { maxHeight: '500px' } : {}),
                }}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-amber-400 flex items-center gap-1.5 font-jakarta">
                        <Calendar className="w-3.5 h-3.5" />
                        ECONOMIC CALENDAR
                    </h3>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[12px] bg-blue-950/50 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20 font-bold font-jakarta">
                            US
                        </span>
                        <span className="text-[12px] bg-rose-950/50 text-rose-300 px-2 py-0.5 rounded border border-rose-500/20 font-bold font-jakarta">
                            HIGH
                        </span>
                    </div>
                </div>

                {/* Next Impact Countdown */}
                {nextEvent && (
                    <div className="flex items-center gap-2 mb-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-700/30">
                        <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-[12px] text-white font-bold font-jakarta">Next Impact:</span>
                        <span className="text-[13px] font-mono font-black text-amber-400">{countdown}</span>
                        <span className="text-[12px] text-slate-300 truncate ml-auto font-jakarta">{nextEvent.event}</span>
                    </div>
                )}

                {/* Event List — Date as header, events below */}
                <div className={`space-y-2.5 flex-1 ${expanded ? 'max-h-[320px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent' : ''}`}>
                    {groupedEvents.map((group, gi) => (
                        <div key={gi}>
                            {/* Date header */}
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[12px] font-mono font-bold text-amber-400/80 font-jakarta">{group.displayDate}</span>
                                <div className="flex-1 h-px bg-slate-700/40" />
                            </div>
                            {/* Events */}
                            <div className="space-y-0.5 pl-1">
                                {group.events.map((event, ei) => {
                                    const hasActual = event.actual != null;
                                    const hasEstimate = event.estimate != null;
                                    const isBeat = hasActual && hasEstimate && event.actual! > event.estimate!;
                                    const isMiss = hasActual && hasEstimate && event.actual! < event.estimate!;

                                    return (
                                        <div key={ei} className="flex items-center gap-1.5 min-h-[20px]">
                                            {/* Category badge */}
                                            <span className={`text-[11px] font-mono font-black px-1 py-0 rounded ${CATEGORY_COLORS[event.category] || 'text-slate-400'} bg-white/5 flex-shrink-0 font-jakarta`}>
                                                {CATEGORY_ICONS[event.category] || 'ETC'}
                                            </span>
                                            {/* Time (local) */}
                                            <span className="text-[11px] font-mono text-slate-400 flex-shrink-0 w-[34px]">
                                                {convertTime(event.time)}
                                            </span>
                                            {/* Event name */}
                                            <span className={`text-[12px] font-semibold truncate flex-1 ${CATEGORY_COLORS[event.category] || 'text-white'} font-jakarta`}>
                                                {event.event}
                                            </span>
                                            {/* Estimate / Actual values */}
                                            {hasActual ? (
                                                <span className={`text-[11px] font-mono font-bold flex-shrink-0 ${isBeat ? 'text-emerald-400' : isMiss ? 'text-rose-400' : 'text-slate-300'}`}>
                                                    {fmtVal(event.actual, event.unit)}
                                                    {hasEstimate && (
                                                        <span className="text-slate-500 ml-0.5">
                                                            ({isBeat ? '▲' : isMiss ? '▼' : '='}{fmtVal(event.estimate, event.unit)})
                                                        </span>
                                                    )}
                                                </span>
                                            ) : hasEstimate ? (
                                                <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">
                                                    Est {fmtVal(event.estimate, event.unit)}
                                                </span>
                                            ) : (
                                                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${event.impact === 'HIGH' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Expand/Collapse button */}
                {hasMore && (
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 rounded text-[11px] font-bold text-amber-400/70 hover:text-amber-400 hover:bg-slate-800/40 transition-all duration-200 font-jakarta"
                    >
                        {expanded ? (
                            <><ChevronUp className="w-3.5 h-3.5" /> Collapse</>
                        ) : (
                            <><ChevronDown className="w-3.5 h-3.5" /> +{totalVisibleRows - COLLAPSED_MAX_ROWS + allGroupedEvents.length} more events</>
                        )}
                    </button>
                )}

                {/* Footer */}
                <div className="mt-2 pt-2 border-t border-slate-800/40 flex items-center justify-between">
                    <span className="text-[12px] text-slate-300 font-mono font-jakarta">
                        {totalCount} events · {tzLabel}
                        {source === 'REDIS' && <span className="text-emerald-500 ml-1">● LIVE</span>}
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            <span className="text-[12px] text-slate-300 font-jakarta">HIGH</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-[12px] text-slate-300 font-jakarta">MED</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
