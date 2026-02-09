'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp,
    TrendingDown,
    Target,
    Trophy,
    BarChart3,
    Calendar,
    ChevronDown,
    ChevronUp,
    Zap,
    Shield,
    Clock,
    Loader2,
    Minus,
    type LucideIcon
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface BacktestRecord {
    ticker: string;
    recordedAt: string;
    alphaScore: number;
    grade: string;
    action: string;
    priceAtRecommendation: number;
    targetCheckDate: string;
    priceAtCheck?: number;
    returnPct?: number;
    outcome?: 'WIN' | 'LOSS' | 'FLAT' | 'PENDING';
    checkedAt?: string;
}

interface BacktestSummary {
    totalRecords: number;
    checkedRecords: number;
    pendingRecords: number;
    wins: number;
    losses: number;
    flat: number;
    winRate: number;
    avgWinReturn: number;
    avgLossReturn: number;
    expectancy: number;
    profitFactor: number;
    bestTicker: string | null;
    worstTicker: string | null;
    lastUpdated: string;
    engineVersion: string;
}

// =============================================================================
// STAT CARD (Glassmorphism)
// =============================================================================

function StatCard({
    label,
    value,
    subValue,
    icon: Icon,
    color = 'emerald',
    size = 'normal'
}: {
    label: string;
    value: string;
    subValue?: string;
    icon: LucideIcon;
    color?: 'emerald' | 'cyan' | 'amber' | 'rose' | 'indigo';
    size?: 'normal' | 'hero';
}) {
    const colorMap: Record<string, { text: string; bg: string; border: string; glow: string }> = {
        emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'shadow-emerald-500/10' },
        cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', glow: 'shadow-cyan-500/10' },
        amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', glow: 'shadow-amber-500/10' },
        rose: { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', glow: 'shadow-rose-500/10' },
        indigo: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', glow: 'shadow-indigo-500/10' },
    };
    const c = colorMap[color];

    return (
        <div className={`
            relative overflow-hidden rounded-xl border ${c.border}
            bg-white/[0.03] backdrop-blur-xl
            ${size === 'hero' ? 'p-6' : 'p-4'}
            hover:bg-white/[0.06] transition-all duration-300 group
            shadow-lg ${c.glow}
        `}>
            {/* Ambient glow */}
            <div className={`absolute -top-8 -right-8 w-24 h-24 ${c.bg} rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity`} />

            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${c.text}`} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
                </div>
                <div className={`${size === 'hero' ? 'text-3xl' : 'text-2xl'} font-black ${c.text} font-mono tracking-tight`}>
                    {value}
                </div>
                {subValue && (
                    <div className="text-[11px] text-slate-500 mt-1 font-medium">{subValue}</div>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// RECORD ROW
// =============================================================================

function RecordRow({ record, index }: { record: BacktestRecord; index: number }) {
    const isPending = record.outcome === 'PENDING';
    const isWin = record.outcome === 'WIN';
    const isLoss = record.outcome === 'LOSS';
    const isFlat = record.outcome === 'FLAT';

    const date = new Date(record.recordedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });

    const getGradeColor = (grade: string) => {
        switch (grade) {
            case 'S': return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
            case 'A': return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
            case 'B': return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30';
            case 'C': return 'text-slate-400 bg-slate-500/20 border-slate-500/30';
            default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
        }
    };

    const getOutcomeDisplay = () => {
        if (isPending) {
            return (
                <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    <span className="text-amber-400 text-xs font-bold">PENDING</span>
                </div>
            );
        }
        if (isWin) {
            return (
                <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 text-sm font-black font-mono">
                        +{record.returnPct?.toFixed(2)}%
                    </span>
                </div>
            );
        }
        if (isLoss) {
            return (
                <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400 text-sm font-black font-mono">
                        {record.returnPct?.toFixed(2)}%
                    </span>
                </div>
            );
        }
        // FLAT
        return (
            <div className="flex items-center gap-1.5">
                <Minus className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 text-sm font-bold font-mono">
                    {record.returnPct?.toFixed(2)}%
                </span>
            </div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            className={`
                flex items-center gap-4 px-4 py-3
                border-b border-white/[0.03] last:border-b-0
                hover:bg-white/[0.04] transition-all duration-200 group
                ${isWin ? 'hover:bg-emerald-500/[0.03]' : ''}
                ${isLoss ? 'hover:bg-rose-500/[0.03]' : ''}
            `}
        >
            {/* Date */}
            <div className="w-16 flex-shrink-0">
                <span className="text-xs font-bold text-slate-500 font-mono">{date}</span>
            </div>

            {/* Ticker + Grade */}
            <div className="w-28 flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-black text-white tracking-tight group-hover:text-cyan-300 transition-colors">
                    {record.ticker}
                </span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${getGradeColor(record.grade)}`}>
                    {record.grade}
                </span>
            </div>

            {/* Score */}
            <div className="w-16 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                    <div className="w-8 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(record.alphaScore, 100)}%` }}
                        />
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-300">{record.alphaScore}</span>
                </div>
            </div>

            {/* Entry Price */}
            <div className="w-24 flex-shrink-0 hidden md:block">
                <span className="text-xs font-mono text-slate-400">
                    ${record.priceAtRecommendation.toFixed(2)}
                </span>
            </div>

            {/* Check Price */}
            <div className="w-24 flex-shrink-0 hidden md:block">
                {record.priceAtCheck ? (
                    <span className="text-xs font-mono text-slate-300">
                        ${record.priceAtCheck.toFixed(2)}
                    </span>
                ) : (
                    <span className="text-xs font-mono text-slate-600">—</span>
                )}
            </div>

            {/* Outcome */}
            <div className="flex-1 flex justify-end">
                {getOutcomeDisplay()}
            </div>
        </motion.div>
    );
}

// =============================================================================
// DATE GROUP
// =============================================================================

function DateGroup({ date, records, defaultOpen }: { date: string; records: BacktestRecord[]; defaultOpen: boolean }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const wins = records.filter(r => r.outcome === 'WIN').length;
    const total = records.filter(r => r.outcome !== 'PENDING').length;
    const dayWinRate = total > 0 ? Math.round((wins / total) * 100) : null;

    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    return (
        <div className="mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 
                    bg-white/[0.02] backdrop-blur-sm rounded-t-xl border border-white/[0.06]
                    hover:bg-white/[0.05] transition-all group"
            >
                <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-bold text-slate-200">{dateLabel}</span>
                    <span className="text-[10px] text-slate-600 font-mono">
                        {records.length} recommendation{records.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {dayWinRate !== null && (
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${dayWinRate >= 60
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : dayWinRate >= 40
                                ? 'text-amber-400 bg-amber-500/10'
                                : 'text-rose-400 bg-rose-500/10'
                            }`}>
                            {dayWinRate}% WIN
                        </span>
                    )}
                    {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                </div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white/[0.01] backdrop-blur-sm border border-t-0 border-white/[0.06] rounded-b-xl">
                            {/* Header Row */}
                            <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.05]">
                                <div className="w-16 text-[9px] font-bold text-slate-600 uppercase tracking-widest">Date</div>
                                <div className="w-28 text-[9px] font-bold text-slate-600 uppercase tracking-widest">Ticker</div>
                                <div className="w-16 text-[9px] font-bold text-slate-600 uppercase tracking-widest">Score</div>
                                <div className="w-24 text-[9px] font-bold text-slate-600 uppercase tracking-widest hidden md:block">Entry</div>
                                <div className="w-24 text-[9px] font-bold text-slate-600 uppercase tracking-widest hidden md:block">T+3</div>
                                <div className="flex-1 text-[9px] font-bold text-slate-600 uppercase tracking-widest text-right">Result</div>
                            </div>

                            {/* Records */}
                            {records.map((record, idx) => (
                                <RecordRow key={`${record.ticker}-${record.recordedAt}`} record={record} index={idx} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// =============================================================================
// WIN RATE RING
// =============================================================================

function WinRateRing({ winRate, size = 140 }: { winRate: number; size?: number }) {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (winRate / 100) * circumference;

    const getColor = () => {
        if (winRate >= 70) return { stroke: '#10b981', text: 'text-emerald-400', glow: '#10b981' };
        if (winRate >= 50) return { stroke: '#f59e0b', text: 'text-amber-400', glow: '#f59e0b' };
        return { stroke: '#ef4444', text: 'text-rose-400', glow: '#ef4444' };
    };
    const color = getColor();

    return (
        <div className="relative" style={{ width: size, height: size }}>
            {/* Glow */}
            <div
                className="absolute inset-0 rounded-full blur-xl opacity-20"
                style={{ backgroundColor: color.glow }}
            />

            <svg width={size} height={size} className="transform -rotate-90 relative z-10">
                {/* Background Ring */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="8"
                />
                {/* Progress Ring */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color.stroke}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                />
            </svg>

            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                <span className={`text-3xl font-black font-mono ${color.text}`}>
                    {winRate.toFixed(1)}%
                </span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">WIN RATE</span>
            </div>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TrackRecord() {
    const [summary, setSummary] = useState<BacktestSummary | null>(null);
    const [records, setRecords] = useState<BacktestRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const res = await fetch('/api/backtest', { cache: 'no-store' });
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                setSummary(data.summary);
                setRecords(data.records || []);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    // Group records by date
    const groupedByDate = records.reduce<Record<string, BacktestRecord[]>>((acc, record) => {
        const date = record.recordedAt.split('T')[0];
        if (!acc[date]) acc[date] = [];
        acc[date].push(record);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedByDate).sort().reverse();

    // Loading State
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
                <p className="text-slate-500 text-sm font-medium">Loading Track Record...</p>
            </div>
        );
    }

    // Empty State (No Records Yet)
    if (!summary || summary.totalRecords === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                <div className="w-20 h-20 bg-slate-900/50 rounded-full flex items-center justify-center mb-6 border border-slate-800 shadow-2xl">
                    <Target className="w-10 h-10 text-slate-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-200 mb-2 tracking-tight">
                    TRACK RECORD INITIALIZING
                </h2>
                <div className="w-12 h-1 bg-emerald-500/20 rounded-full mb-6" />
                <p className="text-slate-400 max-w-md text-sm leading-relaxed">
                    Alpha Engine V3.1이 추천을 시작하면 여기에서 자동으로 성과를 추적합니다.
                    <br />
                    <span className="text-slate-500">
                        매 보고서의 ACTIONABLE 종목 → T+3 수익률 자동 검증
                    </span>
                </p>
                <div className="mt-8 px-5 py-3 rounded-xl border border-slate-800 bg-white/[0.02] backdrop-blur-sm">
                    <span className="text-[10px] text-slate-500 font-mono">
                        ENGINE v{summary?.engineVersion || '3.1.0'} • SELF-CORRECTION ACTIVE • AWAITING FIRST SIGNAL
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* === HEADER === */}
            <section className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 pt-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-2">
                            <Shield className="w-3 h-3 text-emerald-500" />
                            VERIFIED PERFORMANCE
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                        <span className="text-emerald-500">TRACK</span> RECORD
                    </h1>
                    <p className="text-slate-500 text-xs mt-1 max-w-lg font-medium leading-relaxed">
                        Every recommendation tracked. Every outcome verified. No hiding — the numbers speak.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-slate-600 font-mono text-[10px] bg-slate-800/50 px-2 py-1 rounded inline-block">
                        ENGINE v{summary.engineVersion} • {summary.totalRecords} TOTAL RECOMMENDATIONS
                    </p>
                </div>
            </section>

            {/* === HERO STATS (Win Rate Ring + Key Stats) === */}
            <section className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-8">
                {/* Background Ambient */}
                <div className="absolute -top-20 -left-20 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-cyan-500/5 rounded-full blur-3xl" />

                <div className="relative z-10 flex flex-col lg:flex-row items-center gap-10">
                    {/* Win Rate Ring */}
                    <WinRateRing winRate={summary.winRate} size={160} />

                    {/* Stats Grid */}
                    <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        <StatCard
                            label="Expectancy"
                            value={`${summary.expectancy >= 0 ? '+' : ''}${summary.expectancy.toFixed(2)}%`}
                            subValue="Expected return per trade"
                            icon={Zap}
                            color={summary.expectancy >= 0 ? 'emerald' : 'rose'}
                        />
                        <StatCard
                            label="Profit Factor"
                            value={summary.profitFactor === Infinity ? '∞' : summary.profitFactor.toFixed(2)}
                            subValue="Win $ / Loss $"
                            icon={BarChart3}
                            color={summary.profitFactor >= 1.5 ? 'cyan' : 'amber'}
                        />
                        <StatCard
                            label="Avg Win"
                            value={`+${summary.avgWinReturn.toFixed(2)}%`}
                            subValue={`${summary.wins} wins`}
                            icon={TrendingUp}
                            color="emerald"
                        />
                        <StatCard
                            label="Avg Loss"
                            value={`-${summary.avgLossReturn.toFixed(2)}%`}
                            subValue={`${summary.losses} losses`}
                            icon={TrendingDown}
                            color="rose"
                        />
                    </div>
                </div>

                {/* Bottom Stats Bar */}
                <div className="relative z-10 mt-6 pt-6 border-t border-white/[0.05] flex flex-wrap items-center gap-6 text-[11px]">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-slate-400">Checked: <span className="text-white font-bold">{summary.checkedRecords}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-slate-400">Pending: <span className="text-white font-bold">{summary.pendingRecords}</span></span>
                    </div>
                    {summary.bestTicker && (
                        <div className="flex items-center gap-2">
                            <Trophy className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-slate-400">Best: <span className="text-emerald-400 font-bold">{summary.bestTicker}</span></span>
                        </div>
                    )}
                    {summary.worstTicker && (
                        <div className="flex items-center gap-2">
                            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                            <span className="text-slate-400">Worst: <span className="text-rose-400 font-bold">{summary.worstTicker}</span></span>
                        </div>
                    )}
                </div>
            </section>

            {/* === DAILY RECORDS === */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20">
                            <Calendar className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white tracking-tight">
                                DAILY LOG
                            </h2>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                                Recommendation history by date
                            </p>
                        </div>
                    </div>
                </div>

                {sortedDates.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-sm">
                        No records yet. First recommendations will appear after the next report.
                    </div>
                ) : (
                    <div>
                        {sortedDates.map((date, idx) => (
                            <DateGroup
                                key={date}
                                date={date}
                                records={groupedByDate[date]}
                                defaultOpen={idx < 3}
                            />
                        ))}
                    </div>
                )}
            </section>

        </div>
    );
}
