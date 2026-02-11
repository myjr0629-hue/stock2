// ============================================================================
// SectorSessionGrid V2 — 통합 실시간 상황판
// TACTICAL DECK + Flow Dashboard + Daily Briefing 흡수
// ============================================================================
'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
    Activity, Radio, RefreshCw, TrendingUp,
    DollarSign, Shield, Target, ChevronRight,
    AlertTriangle
} from 'lucide-react';
import type { SectorConfig } from '@/types/sector';
import type { IntelQuote } from '@/hooks/useIntelSharedData';
import { PriceDisplayCard } from '@/components/ui/PriceDisplay';

interface SectorSessionGridProps {
    config: SectorConfig;
    quotes: IntelQuote[];
    loading?: boolean;
    refreshing?: boolean;
}

// ── Sparkline ──
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const h = 24;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = h - ((v - min) / range) * h;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="w-full h-6">
            <polyline points={points} fill="none" stroke={color}
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <defs>
                <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={`0,${h} ${points} 100,${h}`} fill={`url(#sg-${color.replace('#', '')})`} />
        </svg>
    );
}

// ── Price Position Bar (from TACTICAL DECK) ──
function PricePositionBar({ price, maxPain, putFloor, callWall }: {
    price: number; maxPain: number; putFloor: number; callWall: number;
}) {
    if (!maxPain || !price) return null;
    const low = putFloor || maxPain * 0.95;
    const high = callWall || maxPain * 1.05;
    const range = high - low || 1;
    const pricePos = Math.max(0, Math.min(100, ((price - low) / range) * 100));
    const painPos = Math.max(0, Math.min(100, ((maxPain - low) / range) * 100));

    return (
        <div className="relative w-full h-3 rounded-full" style={{ isolation: 'isolate' }}>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full bg-rose-500/15 rounded-l-full"
                    style={{ width: `${Math.max(0, painPos - 5)}%` }} />
                <div className="absolute right-0 top-0 h-full bg-emerald-500/15 rounded-r-full"
                    style={{ width: `${Math.max(0, 100 - painPos - 5)}%` }} />
                <div className="absolute top-0 w-0.5 h-full bg-amber-400/60"
                    style={{ left: `${painPos}%` }} />
            </div>
            <div className="absolute w-2.5 h-2.5 rounded-full border-2 border-white shadow-lg shadow-white/30 z-10"
                style={{
                    left: `${pricePos}%`, top: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: pricePos > painPos ? '#10b981' : '#f43f5e'
                }} />
        </div>
    );
}

// ── Flow indicator (thin bar from Flow Dashboard) ──
function FlowBar({ pcr, changePct }: { pcr: number; changePct: number }) {
    const flowScore = (1 - Math.min(pcr || 1, 2)) + (changePct / 5);
    const isCall = flowScore > 0.2;
    const isPut = flowScore < -0.2;
    const barColor = isCall ? '#10b981' : isPut ? '#f43f5e' : '#475569';
    const width = Math.max(10, Math.min(100, Math.abs(flowScore) * 60 + 10));
    const label = isCall ? '콜 유입' : isPut ? '풋 우세' : '중립';

    return (
        <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold w-12 ${isCall ? 'text-emerald-400' : isPut ? 'text-rose-400' : 'text-slate-400'}`}>
                {label}
            </span>
            <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${width}%`, backgroundColor: barColor, boxShadow: `0 0 6px ${barColor}40` }} />
            </div>
        </div>
    );
}

// ── AI Analysis Generator (from TACTICAL DECK) ──
function generateAnalysis(q: IntelQuote): string {
    const { price, maxPain, callWall, putFloor, gex, pcr, gammaRegime, changePct } = q;
    if (!price || price === 0) return '데이터 대기 중...';

    const parts: string[] = [];

    // 1. Max Pain 기준 가격 위치 분석
    if (maxPain > 0) {
        const diff = ((price - maxPain) / maxPain * 100);
        if (Math.abs(diff) < 1) {
            parts.push(`Max Pain($${maxPain.toFixed(0)}) 근처, 변동성 축소 예상.`);
        } else if (diff > 2.5) {
            parts.push(`Max Pain($${maxPain.toFixed(0)}) 대비 +${diff.toFixed(1)}% 괴리, 하방 압력 존재.`);
        } else if (diff > 0) {
            parts.push(`Max Pain($${maxPain.toFixed(0)}) 소폭 상회, 안정적 흐름.`);
        } else if (diff < -2.5) {
            parts.push(`Max Pain($${maxPain.toFixed(0)}) 대비 ${diff.toFixed(1)}% 하회, 반등 가능성.`);
        } else {
            parts.push(`Max Pain($${maxPain.toFixed(0)}) 소폭 하회, 관망세.`);
        }
    }

    // 2. Call Wall / Put Floor 핵심 레벨 분석
    if (callWall > 0 && putFloor > 0 && price > 0) {
        const toCallWall = ((callWall - price) / price * 100);
        const toPutFloor = ((price - putFloor) / price * 100);

        if (toCallWall < 1.5) {
            parts.push(`Call Wall($${callWall.toFixed(0)}) 근접 → 강한 저항, 돌파 시 급등.`);
        } else if (toPutFloor < 1.5) {
            parts.push(`Put Floor($${putFloor.toFixed(0)}) 근접 → 강한 지지, 이탈 시 급락.`);
        } else if (toCallWall < toPutFloor) {
            parts.push(`저항($${callWall.toFixed(0)})이 지지($${putFloor.toFixed(0)})보다 가까움, 상단 제한적.`);
        } else {
            parts.push(`지지($${putFloor.toFixed(0)})~저항($${callWall.toFixed(0)}) 중간 구간, 방향 탐색.`);
        }
    } else if (callWall > 0 && price > 0) {
        const toCallWall = ((callWall - price) / price * 100);
        if (toCallWall < 2) parts.push(`Call Wall($${callWall.toFixed(0)}) 근접 저항.`);
    } else if (putFloor > 0 && price > 0) {
        const toPutFloor = ((price - putFloor) / price * 100);
        if (toPutFloor < 2) parts.push(`Put Floor($${putFloor.toFixed(0)}) 지지 테스트.`);
    }

    // 3. GEX + PCR 종합 포지셔닝 (2개를 결합하여 시장 심리 판단)
    const gexM = gex / 1e6;
    if (gammaRegime === 'SHORT' && pcr > 1.2) {
        parts.push('숏감마+풋 과다 → 급변동 리스크.');
    } else if (gammaRegime === 'SHORT' && pcr < 0.7) {
        parts.push('숏감마+콜 과다 → 상방 스퀴즈 가능.');
    } else if (gammaRegime === 'LONG' && pcr < 0.8) {
        parts.push('롱감마+콜 우세 → 안정적 상승 흐름.');
    } else if (gammaRegime === 'LONG' && pcr > 1.2) {
        parts.push('롱감마+풋 헤지 → 하락 제한, 횡보.');
    } else if (pcr < 0.5) {
        parts.push('극단적 콜 편향 → 과열 경계.');
    } else if (pcr > 1.5) {
        parts.push('극단적 풋 편향 → 공포 심리.');
    }

    return parts.join(' ') || '분석 데이터 수집 중...';
}

// ── Format helpers ──
function formatGex(gex: number): string {
    const abs = Math.abs(gex);
    if (abs >= 1e9) return `${(gex / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(gex / 1e6).toFixed(0)}M`;
    if (abs >= 1e3) return `${(gex / 1e3).toFixed(0)}K`;
    return gex.toFixed(0);
}

function getLogoUrl(ticker: string): string {
    return `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SectorSessionGrid({ config, quotes, loading, refreshing }: SectorSessionGridProps) {
    const router = useRouter();
    const accentColor = config.theme.accentHex;

    const sorted = useMemo(() =>
        [...quotes].sort((a, b) => b.changePct - a.changePct),
        [quotes]
    );

    const stats = useMemo(() => {
        if (sorted.length === 0) return null;
        const totalGex = sorted.reduce((s, q) => s + (q.gex || 0), 0);
        const avgPcr = sorted.reduce((s, q) => s + (q.pcr || 0), 0) / sorted.length;
        const gammaLong = sorted.filter(q => q.gammaRegime === 'LONG').length;
        const gammaShort = sorted.filter(q => q.gammaRegime === 'SHORT').length;
        const callDom = sorted.filter(q => {
            const fs = (1 - Math.min(q.pcr || 1, 2)) + (q.changePct / 5);
            return fs > 0.2;
        }).length;

        // Korean insight
        const gexInsight = totalGex > 0
            ? '딜러 롱감마 → 안정'
            : '딜러 숏감마 → 변동성↑';
        const pcrInsight = avgPcr < 0.8
            ? '콜 우세 (강세)'
            : avgPcr > 1.1
                ? '풋 우세 (약세)'
                : '방향 탐색 중';

        return { totalGex, avgPcr, gammaLong, gammaShort, callDom, gexInsight, pcrInsight };
    }, [sorted]);

    if (loading) {
        return (
            <div className="w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 flex items-center justify-center min-h-[300px]">
                <RefreshCw className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
            </div>
        );
    }

    return (
        <div className="w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.15] rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden transition-all duration-500 hover:border-white/[0.22]">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/4 w-1/2 h-1/2 blur-[100px] rounded-full pointer-events-none mix-blend-screen opacity-20"
                style={{ backgroundColor: accentColor }} />

            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-5 relative z-10">
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] flex items-center gap-2"
                    style={{ color: accentColor }}>
                    <Activity className="w-4 h-4 animate-pulse" style={{ color: accentColor }} />
                    {config.icon} {config.shortName} SESSION GRID
                </h3>
                <div className="flex items-center gap-3">
                    {refreshing && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: `${accentColor}99` }} />}
                    <span className="text-[10px] uppercase flex items-center gap-1.5 font-bold tracking-wider px-2 py-1 rounded-full backdrop-blur-sm"
                        style={{
                            color: `${accentColor}cc`,
                            backgroundColor: `${accentColor}0d`,
                            borderColor: `${accentColor}1a`,
                            borderWidth: '1px'
                        }}>
                        <Radio className="w-3 h-3 animate-pulse" style={{ color: accentColor }} />
                        LIVE
                    </span>
                </div>
            </div>

            {/* ── 4-Column Card Grid ── */}
            <div className="grid grid-cols-4 gap-3 mb-4 relative z-10">
                {sorted.map((q, idx) => {
                    const isUp = q.changePct >= 0;
                    const regimeColor = q.gammaRegime === 'LONG' ? '#06b6d4' :
                        q.gammaRegime === 'SHORT' ? '#f59e0b' : '#64748b';
                    const regimeLabel = q.gammaRegime === 'LONG' ? '안정적 흐름' :
                        q.gammaRegime === 'SHORT' ? '변동성 확대' : '중립';
                    const sparkColor = isUp ? '#10b981' : '#f43f5e';
                    const analysis = generateAnalysis(q);
                    const isHighGex = Math.abs(q.gex) > 50e6;
                    const isExtremePcr = q.pcr < 0.5 || q.pcr > 1.5;
                    const hasAlert = isHighGex || isExtremePcr;

                    return (
                        <div
                            key={q.ticker}
                            onClick={() => router.push(`/command?ticker=${q.ticker}`)}
                            className={`
                                relative flex flex-col rounded-xl border transition-all duration-300 overflow-hidden group cursor-pointer
                                bg-white/[0.02] backdrop-blur-md
                                hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]
                                ${idx === 0
                                    ? 'border-emerald-500/30 hover:border-emerald-400/50'
                                    : idx === sorted.length - 1
                                        ? 'border-rose-500/30 hover:border-rose-400/50'
                                        : 'border-white/[0.10] hover:border-white/[0.18]'
                                }
                            `}
                        >
                            {/* Glass shine */}
                            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                            {/* ── Card Body ── */}
                            <div className="p-3.5">

                                {/* Row 1: Rank + Logo + Ticker + Alpha + Alert */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded backdrop-blur-sm ${idx === 0
                                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                                            : idx === sorted.length - 1
                                                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/20'
                                                : 'bg-white/[0.05] text-white/50 border border-white/[0.08]'
                                            }`}>
                                            {idx + 1}
                                        </span>
                                        <div className="w-7 h-7 rounded-full bg-[#0a0f14] overflow-hidden border border-white/10 flex-shrink-0">
                                            <img src={getLogoUrl(q.ticker)} alt={q.ticker}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        </div>
                                        <span className="text-base font-black text-white tracking-tight">{q.ticker}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {hasAlert && (
                                            <AlertTriangle className="w-3 h-3 text-amber-400 animate-pulse" />
                                        )}
                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border backdrop-blur-md text-[11px] font-bold ${q.alphaScore >= 75 ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
                                            q.alphaScore >= 50 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                                                'bg-white/[0.03] border-white/[0.06] text-white/40'
                                            }`}>
                                            <span className="opacity-70">α</span>
                                            <span className="text-sm font-black">{q.alphaScore > 0 ? q.alphaScore.toFixed(1) : '-'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: Price */}
                                <div className="mb-2">
                                    <PriceDisplayCard
                                        intradayPrice={q.price}
                                        intradayChangePct={q.changePct}
                                        extendedPrice={q.extendedPrice}
                                        extendedChangePct={q.extendedChangePct}
                                        extendedLabel={q.extendedLabel as 'POST' | 'PRE' | ''}
                                        showArrows={true}
                                    />
                                </div>

                                {/* Row 3: 4-Quad Indicators */}
                                <div className="grid grid-cols-2 gap-1.5 mb-2">
                                    <div className={`px-2 py-1.5 rounded-md border ${q.gex > 0 ? 'bg-emerald-500/10 border-emerald-500/25' : q.gex < 0 ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white/[0.04] border-white/[0.10]'}`}>
                                        <div className="text-[11px] text-white uppercase font-bold tracking-wide">GEX</div>
                                        <div className={`text-sm font-black ${q.gex > 0 ? 'text-emerald-400' : q.gex < 0 ? 'text-rose-400' : 'text-white/50'}`}>
                                            {q.gex > 0 ? '+' : ''}{formatGex(q.gex)}
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1.5 rounded-md border ${q.pcr < 0.8 ? 'bg-emerald-500/10 border-emerald-500/25' : q.pcr > 1.1 ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white/[0.04] border-white/[0.10]'}`}>
                                        <div className="text-[11px] text-white uppercase font-bold tracking-wide">PCR</div>
                                        <div className={`text-sm font-black ${q.pcr < 0.8 ? 'text-emerald-400' : q.pcr > 1.1 ? 'text-rose-400' : 'text-white'}`}>
                                            {q.pcr > 0 ? q.pcr.toFixed(2) : '-'}
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-1 rounded border bg-white/[0.02] border-white/[0.06]">
                                        <div className="text-[10px] text-white uppercase font-semibold">PUT FLOOR</div>
                                        <div className="text-sm font-bold text-rose-300">
                                            ${q.putFloor > 0 ? q.putFloor.toFixed(0) : '-'}
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-1 rounded border bg-white/[0.02] border-white/[0.06]">
                                        <div className="text-[10px] text-white uppercase font-semibold">CALL WALL</div>
                                        <div className="text-sm font-bold text-emerald-300">
                                            ${q.callWall > 0 ? q.callWall.toFixed(0) : '-'}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 4: Position Bar */}
                                <div className="mb-2 px-0.5">
                                    <PricePositionBar price={q.price} maxPain={q.maxPain} putFloor={q.putFloor} callWall={q.callWall} />
                                    <div className="flex justify-between text-xs mt-1 font-bold">
                                        <span className="text-rose-400">Put</span>
                                        <span className="text-amber-300">⬥ Pain ${q.maxPain > 0 ? q.maxPain.toFixed(0) : '-'}</span>
                                        <span className="text-emerald-400">Call</span>
                                    </div>
                                </div>

                                {/* Row 5: Flow Indicator */}
                                <div className="mb-2">
                                    <FlowBar pcr={q.pcr} changePct={q.changePct} />
                                </div>

                                {/* Row 6: Sparkline */}
                                <div className="mb-2 px-0.5">
                                    <MiniSparkline data={q.sparkline} color={sparkColor} />
                                </div>
                            </div>

                            {/* ── Card Footer: AI Analysis + Regime ── */}
                            <div className="px-3.5 pb-3 pt-0">
                                {/* AI Analysis */}
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2 mb-2">
                                    <p className="text-xs text-white leading-relaxed">{analysis}</p>
                                </div>

                                {/* Regime + Alerts + Navigate */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: regimeColor }} />
                                        <span className="text-[11px] font-semibold" style={{ color: regimeColor }}>
                                            {regimeLabel}
                                        </span>
                                        {isHighGex && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded border border-purple-500/25">
                                                High GEX
                                            </span>
                                        )}
                                        {isExtremePcr && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/15 text-amber-300 rounded border border-amber-500/25">
                                                PCR ⚠
                                            </span>
                                        )}
                                    </div>
                                    <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/50 transition-colors" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Footer: Aggregate Stats with Korean Insights ── */}
            {stats && (
                <div className="relative z-10 border-t border-white/[0.05] pt-3">
                    <div className="grid grid-cols-4 gap-2">
                        <div className="bg-white/[0.02] backdrop-blur-md rounded-lg px-3 py-2 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-white font-bold uppercase">총 GEX</span>
                                <span className={`text-sm font-black ${stats.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {stats.totalGex > 0 ? '+' : ''}{formatGex(stats.totalGex)}
                                </span>
                            </div>
                            <p className="text-[11px] text-white/60">{stats.gexInsight}</p>
                        </div>
                        <div className="bg-white/[0.02] backdrop-blur-md rounded-lg px-3 py-2 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-white font-bold uppercase">평균 PCR</span>
                                <span className={`text-sm font-black ${stats.avgPcr < 0.8 ? 'text-emerald-400' : stats.avgPcr > 1.1 ? 'text-rose-400' : 'text-white'}`}>
                                    {stats.avgPcr.toFixed(2)}
                                </span>
                            </div>
                            <p className="text-[11px] text-white/60">{stats.pcrInsight}</p>
                        </div>
                        <div className="bg-white/[0.02] backdrop-blur-md rounded-lg px-3 py-2 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-white font-bold uppercase">감마</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-sm font-bold text-cyan-400">{stats.gammaLong}L</span>
                                    <span className="text-[10px] text-white/30">/</span>
                                    <span className="text-sm font-bold text-amber-400">{stats.gammaShort}S</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-white/60">
                                {stats.gammaShort > stats.gammaLong ? '숏감마 우세 → 급변동' : stats.gammaLong > 0 ? '롱감마 우세 → 안정' : '중립'}
                            </p>
                        </div>
                        <div className="bg-white/[0.02] backdrop-blur-md rounded-lg px-3 py-2 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-white font-bold uppercase">FLOW</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-sm font-bold text-emerald-400">{stats.callDom}C</span>
                                    <span className="text-[10px] text-white/30">/</span>
                                    <span className="text-sm font-bold text-rose-400">{sorted.length - stats.callDom}P</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-white/60">
                                {stats.callDom > sorted.length / 2 ? '콜 자금 유입 우세' : '풋 헷지 우세'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
