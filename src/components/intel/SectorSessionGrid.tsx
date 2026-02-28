// ============================================================================
// SectorSessionGrid V2 — 통합 실시간 상황판
// TACTICAL DECK + Flow Dashboard + Daily Briefing 흡수
// ============================================================================
'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
    Activity, Radio, RefreshCw, TrendingUp,
    DollarSign, Shield, Target, ChevronRight,
    AlertTriangle, Moon, Sun, Clock
} from 'lucide-react';
import type { SectorConfig } from '@/types/sector';
import type { IntelQuote } from '@/hooks/useIntelSharedData';
import { PriceDisplayCard, tickerDelay } from '@/components/ui/PriceDisplay';

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
function FlowBar({ pcr, changePct, ss }: { pcr: number; changePct: number; ss: any }) {
    const flowScore = (1 - Math.min(pcr || 1, 2)) + (changePct / 5);
    const isCall = flowScore > 0.2;
    const isPut = flowScore < -0.2;
    const barColor = isCall ? '#10b981' : isPut ? '#f43f5e' : '#475569';
    const width = Math.max(10, Math.min(100, Math.abs(flowScore) * 60 + 10));
    const label = isCall ? ss('callInflow') : isPut ? ss('putDominant') : ss('searchingDirection');

    return (
        <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold w-12 font-jakarta ${isCall ? 'text-emerald-400' : isPut ? 'text-rose-400' : 'text-slate-300'}`}>
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
function generateAnalysis(q: IntelQuote, ss: any): string {
    const { price, maxPain, callWall, putFloor, gex, pcr, gammaRegime, changePct } = q;
    if (!price || price === 0) return ss('dataWaiting');

    const parts: string[] = [];

    // 1. Max Pain 기준 가격 위치 분석
    if (maxPain > 0) {
        const diff = ((price - maxPain) / maxPain * 100);
        if (Math.abs(diff) < 1) {
            parts.push(ss('nearMaxPain', { mp: maxPain.toFixed(0) }));
        } else if (diff > 2.5) {
            parts.push(ss('aboveMaxPain', { mp: maxPain.toFixed(0), diff: diff.toFixed(1) }));
        } else if (diff > 0) {
            parts.push(ss('slightAboveMaxPain', { mp: maxPain.toFixed(0) }));
        } else if (diff < -2.5) {
            parts.push(ss('belowMaxPain', { mp: maxPain.toFixed(0), diff: diff.toFixed(1) }));
        } else {
            parts.push(ss('slightBelowMaxPain', { mp: maxPain.toFixed(0) }));
        }
    }

    // 2. Call Wall / Put Floor 핵심 레벨 분석
    if (callWall > 0 && putFloor > 0 && price > 0) {
        const toCallWall = ((callWall - price) / price * 100);
        const toPutFloor = ((price - putFloor) / price * 100);

        if (toCallWall < 1.5) {
            parts.push(ss('callWallNearBreak', { cw: callWall.toFixed(0) }));
        } else if (toPutFloor < 1.5) {
            parts.push(ss('putFloorNearBreak', { pf: putFloor.toFixed(0) }));
        } else if (toCallWall < toPutFloor) {
            parts.push(ss('resistanceNearerThanSupport', { cw: callWall.toFixed(0), pf: putFloor.toFixed(0) }));
        } else {
            parts.push(ss('midRange', { pf: putFloor.toFixed(0), cw: callWall.toFixed(0) }));
        }
    } else if (callWall > 0 && price > 0) {
        const toCallWall = ((callWall - price) / price * 100);
        if (toCallWall < 2) parts.push(ss('callWallNearResist', { callWall: callWall.toFixed(0) }));
    } else if (putFloor > 0 && price > 0) {
        const toPutFloor = ((price - putFloor) / price * 100);
        if (toPutFloor < 2) parts.push(ss('putFloorSupport', { putFloor: putFloor.toFixed(0) }));
    }

    // 3. GEX + PCR 종합 포지셔닝 (2개를 결합하여 시장 심리 판단)
    const gexM = gex / 1e6;
    if (gammaRegime === 'SHORT' && pcr > 1.2) {
        parts.push(ss('shortGammaPutRisk'));
    } else if (gammaRegime === 'SHORT' && pcr < 0.7) {
        parts.push(ss('shortGammaCallSqueeze'));
    } else if (gammaRegime === 'LONG' && pcr < 0.8) {
        parts.push(ss('longGammaCallStable'));
    } else if (gammaRegime === 'LONG' && pcr > 1.2) {
        parts.push(ss('longGammaPutHedge'));
    } else if (pcr < 0.5) {
        parts.push(ss('extremeCallBias'));
    } else if (pcr > 1.5) {
        parts.push(ss('extremePutBias'));
    }

    // 4. RSI 모멘텀 상태
    const rsi = (q as any).rsi || 0;
    if (rsi > 0) {
        if (rsi < 30) {
            parts.push(`RSI ${Math.round(rsi)}(${ss('oversold')}).`);
        } else if (rsi > 70) {
            parts.push(`RSI ${Math.round(rsi)}(${ss('overbought')}).`);
        }
    }

    // 5. RVOL 거래량 확신도
    const rvol = (q as any).rvol || 0;
    if (rvol > 1.5) {
        parts.push(`RVOL ${rvol.toFixed(1)}x(${ss('volumeSurge')}).`);
    } else if (rvol > 0 && rvol < 0.5) {
        parts.push(`RVOL ${rvol.toFixed(1)}x(${ss('volumeWeak')}).`);
    }

    // 6. Whale Index & Dark Pool
    const whaleIdx = (q as any).whaleIndex || 0;
    const darkPool = (q as any).darkPoolPct || 0;
    if (whaleIdx >= 70) {
        parts.push(ss('whaleHeavyAnalysis') || `🐋 Whale Index ${whaleIdx}. ${ss('institutionalActivity') || 'Heavy institutional positioning detected.'}`);
    } else if (whaleIdx >= 40 && darkPool >= 40) {
        parts.push(ss('whaleDarkPoolCombo', { idx: whaleIdx, pct: darkPool.toFixed(0) }) || `🐋${whaleIdx} + 🕶️D.Pool ${darkPool.toFixed(0)}%. ${ss('stealthAccumulation') || 'Stealth accumulation signal.'}`);
    } else if (darkPool >= 45) {
        parts.push(ss('darkPoolHighAnalysis', { pct: darkPool.toFixed(0) }) || `🕶️ Dark Pool ${darkPool.toFixed(0)}%. ${ss('offExchangeHeavy') || 'Heavy off-exchange activity.'}`);
    }

    return parts.join(' ') || ss('collectingData');
}

function getWhaleLabel(idx: number, ss: any): string {
    if (idx >= 70) return ss('whaleHeavy') || 'WHALE HEAVY';
    if (idx >= 40) return ss('whaleMedium') || 'WHALE ACTIVE';
    return '';
}

function getDarkPoolLabel(pct: number, ss: any): string {
    if (pct >= 50) return ss('darkPoolDominant') || 'DARK POOL DOMINANT';
    if (pct >= 40) return ss('darkPoolHigh') || 'DARK POOL HIGH';
    return '';
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

// Disclaimer text per locale
const DISCLAIMER: Record<string, string> = {
    ko: 'AI 분석 참고자료 • 투자 권유가 아닙니다',
    en: 'INTELLIGENCE ONLY • NOT FINANCIAL ADVICE',
    ja: '情報提供のみ • 投資助言ではありません',
};

// ── Market Session Detection (ET timezone) ──
type MarketSession = 'PRE_MARKET' | 'LIVE' | 'POST_MARKET' | 'CLOSED';

interface SessionInfo {
    key: MarketSession;
    label: string;
    color: string;
    icon: typeof Radio;
    pulse: boolean;
}

const SESSION_LABELS: Record<MarketSession, string> = {
    PRE_MARKET: 'PRE-MKT',
    LIVE: 'LIVE',
    POST_MARKET: 'POST-MKT',
    CLOSED: 'CLOSED',
};

function getMarketSession(): MarketSession {
    const now = new Date();
    // Convert to ET
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const day = et.getDay(); // 0=Sun, 6=Sat
    const hours = et.getHours();
    const minutes = et.getMinutes();
    const time = hours * 60 + minutes; // minutes since midnight

    // Weekend
    if (day === 0 || day === 6) return 'CLOSED';

    // Pre-market: 4:00 - 9:30
    if (time >= 240 && time < 570) return 'PRE_MARKET';
    // Regular: 9:30 - 16:00
    if (time >= 570 && time < 960) return 'LIVE';
    // Post-market: 16:00 - 20:00
    if (time >= 960 && time < 1200) return 'POST_MARKET';
    // Closed: 20:00 - 4:00
    return 'CLOSED';
}

function getSessionInfo(session: MarketSession): Omit<SessionInfo, 'label'> {
    switch (session) {
        case 'PRE_MARKET': return { key: session, color: '#f59e0b', icon: Sun, pulse: true };
        case 'LIVE': return { key: session, color: '#34d399', icon: Radio, pulse: true };
        case 'POST_MARKET': return { key: session, color: '#a78bfa', icon: Moon, pulse: false };
        case 'CLOSED': return { key: session, color: '#64748b', icon: Clock, pulse: false };
    }
}

export function SectorSessionGrid({ config, quotes, loading, refreshing }: SectorSessionGridProps) {
    const ss = useTranslations('sectorSession');
    const router = useRouter();
    const locale = useLocale();
    const accentColor = config.theme.accentHex;

    const sorted = useMemo(() =>
        [...quotes].sort((a, b) => b.changePct - a.changePct),
        [quotes]
    );

    // Market session state — updates every 30s
    const [session, setSession] = useState<MarketSession>(getMarketSession);
    useEffect(() => {
        const id = setInterval(() => setSession(getMarketSession()), 30_000);
        return () => clearInterval(id);
    }, []);
    const sInfo = getSessionInfo(session);
    const SessionIcon = sInfo.icon;
    const sessionLabel = SESSION_LABELS[session];

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
            ? ss('dealerLongGamma')
            : ss('dealerShortGamma');
        const pcrInsight = avgPcr < 0.8
            ? ss('callDomBullish')
            : avgPcr > 1.1
                ? ss('putDomBearish')
                : ss('searchingDirection');

        return { totalGex, avgPcr, gammaLong, gammaShort, callDom, gexInsight, pcrInsight };
    }, [sorted]);

    // ── Sector Summary One-Liner ──
    const sectorSummary = useMemo(() => {
        if (sorted.length === 0) return { text: ss('summNoData'), color: 'rgb(148,163,184)' };
        const up = sorted.filter(q => q.changePct > 0).length;
        const down = sorted.filter(q => q.changePct < 0).length;
        const total = sorted.length;
        const leader = sorted[0]; // highest changePct (sorted desc)
        const laggard = sorted[sorted.length - 1]; // lowest
        const avgChange = (sorted.reduce((s, q) => s + q.changePct, 0) / total);

        if (session === 'CLOSED') {
            const closedColor = avgChange > 0 ? '#34d399' : avgChange < 0 ? '#fb7185' : 'rgb(148,163,184)';
            return {
                text: ss('summClosed', {
                    avg: (avgChange >= 0 ? '+' : '') + avgChange.toFixed(1),
                    leader: leader.ticker,
                    pct: (leader.changePct >= 0 ? '+' : '') + leader.changePct.toFixed(1)
                }),
                color: closedColor
            };
        }

        // Bullish: majority up and leader is positive
        if (up > down && leader.changePct > 0) {
            return {
                text: ss('summBullish', {
                    leader: leader.ticker,
                    pct: leader.changePct.toFixed(1),
                    up: String(up),
                    total: String(total)
                }),
                color: '#34d399'
            };
        }
        // Bearish: majority down
        if (down > up && laggard.changePct < 0) {
            return {
                text: ss('summBearish', {
                    leader: laggard.ticker,
                    pct: laggard.changePct.toFixed(1),
                    down: String(down),
                    total: String(total)
                }),
                color: '#fb7185'
            };
        }
        // Mixed
        return {
            text: ss('summMixed', {
                leader: leader.ticker,
                lpct: '+' + leader.changePct.toFixed(1),
                laggard: laggard.ticker,
                dpct: laggard.changePct.toFixed(1)
            }),
            color: 'rgba(255,255,255,0.6)'
        };
    }, [sorted, session, ss]);

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
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] flex items-center gap-2 font-jakarta flex-shrink-0"
                    style={{ color: accentColor }}>
                    <Activity className="w-4 h-4 animate-pulse" style={{ color: accentColor }} />
                    {config.icon} {config.shortName} SESSION GRID
                </h3>
                {/* Sector Status One-Liner (fills gap) */}
                <span className="flex-1 text-center text-[13px] font-medium font-jakarta px-4 truncate hidden md:inline"
                    style={{ color: sectorSummary.color }}>
                    {sectorSummary.text}
                </span>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-white/60 font-medium tracking-wider hidden lg:inline px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06]">
                        {DISCLAIMER[locale] || DISCLAIMER.en}
                    </span>
                    {refreshing && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: `${accentColor}99` }} />}
                    <span className="text-[11px] uppercase flex items-center gap-1.5 font-bold tracking-wider px-2.5 py-1 rounded-full backdrop-blur-sm font-jakarta"
                        style={{
                            color: sInfo.color,
                            backgroundColor: `${sInfo.color}15`,
                            borderColor: `${sInfo.color}30`,
                            borderWidth: '1px'
                        }}>
                        <SessionIcon className={`w-3 h-3 ${sInfo.pulse ? 'animate-pulse' : ''}`} style={{ color: sInfo.color }} />
                        {sessionLabel}
                    </span>
                </div>
            </div>

            {/* ── 4-Column Card Grid ── */}
            <div className="grid grid-cols-4 gap-3 mb-4 relative z-10">
                {sorted.map((q, idx) => {
                    const isUp = q.changePct >= 0;
                    const regimeColor = q.gammaRegime === 'LONG' ? '#06b6d4' :
                        q.gammaRegime === 'SHORT' ? '#f59e0b' : '#64748b';
                    const regimeLabel = q.gammaRegime === 'LONG' ? ss('stableFlow') :
                        q.gammaRegime === 'SHORT' ? ss('volExpansion') : ss('searchingDirection');
                    const sparkColor = isUp ? '#10b981' : '#f43f5e';
                    const analysis = generateAnalysis(q, ss);
                    const isHighGex = Math.abs(q.gex) > 50e6;
                    const isExtremePcr = q.pcr < 0.5 || q.pcr > 1.5;
                    const hasAlert = isHighGex || isExtremePcr;

                    return (
                        <div
                            key={q.ticker}
                            onClick={() => router.push(`/ticker?ticker=${q.ticker}`)}
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
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded backdrop-blur-sm font-num ${idx === 0
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
                                        <span className="text-[15px] font-extrabold text-white tracking-tight font-jakarta">{q.ticker}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {hasAlert && (
                                            <AlertTriangle className="w-3 h-3 text-amber-400 animate-pulse" />
                                        )}
                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border backdrop-blur-md text-[11px] font-bold font-jakarta ${q.alphaScore >= 75 ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
                                            q.alphaScore >= 50 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                                                'bg-white/[0.03] border-white/[0.06] text-white/40'
                                            }`}>
                                            <span className="opacity-60">α</span>
                                            <span className="text-sm font-bold font-num">{q.alphaScore > 0 ? q.alphaScore.toFixed(1) : '-'}</span>
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
                                        priceFlash={q.priceFlash}
                                        staggerMs={tickerDelay(q.ticker)}
                                    />
                                </div>

                                {/* Row 3: 4-Quad Indicators */}
                                <div className="grid grid-cols-2 gap-1.5 mb-2">
                                    <div className={`px-2 py-1.5 rounded-md border ${q.gex > 0 ? 'bg-emerald-500/10 border-emerald-500/25' : q.gex < 0 ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white/[0.04] border-white/[0.10]'}`}>
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">GEX</div>
                                        <div className={`text-sm font-bold font-num ${q.gex > 0 ? 'text-emerald-400' : q.gex < 0 ? 'text-rose-400' : 'text-white/50'}`}>
                                            {q.gex > 0 ? '+' : ''}{formatGex(q.gex)}
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1.5 rounded-md border ${q.pcr < 0.8 ? 'bg-emerald-500/10 border-emerald-500/25' : q.pcr > 1.1 ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white/[0.04] border-white/[0.10]'}`}>
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">PCR</div>
                                        <div className={`text-sm font-bold font-num ${q.pcr < 0.8 ? 'text-emerald-400' : q.pcr > 1.1 ? 'text-rose-400' : 'text-white'}`}>
                                            {q.pcr > 0 ? q.pcr.toFixed(2) : '-'}
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1.5 rounded-md border ${q.rsi > 0 && q.rsi < 30 ? 'bg-emerald-500/10 border-emerald-500/25' : q.rsi > 70 ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white/[0.04] border-white/[0.10]'}`}>
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">RSI</div>
                                        <div className={`text-sm font-bold font-num ${q.rsi > 0 && q.rsi < 30 ? 'text-emerald-400' : q.rsi > 70 ? 'text-rose-400' : 'text-white/70'}`}>
                                            {q.rsi > 0 ? Math.round(q.rsi) : '-'}
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1.5 rounded-md border ${q.rvol > 1.5 ? 'bg-amber-500/10 border-amber-500/25' : 'bg-white/[0.04] border-white/[0.10]'}`}>
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">RVOL</div>
                                        <div className={`text-sm font-bold font-num ${q.rvol > 1.5 ? 'text-amber-400' : 'text-white/70'}`}>
                                            {q.rvol > 0 ? `${q.rvol.toFixed(1)}x` : '-'}
                                        </div>
                                    </div>
                                    <div className="px-2 py-1.5 rounded-md border bg-white/[0.02] border-white/[0.06]">
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">PUT FLOOR</div>
                                        <div className="text-sm font-bold font-num text-rose-300">
                                            ${q.putFloor > 0 ? q.putFloor.toFixed(0) : '-'}
                                        </div>
                                    </div>
                                    <div className="px-2 py-1.5 rounded-md border bg-white/[0.02] border-white/[0.06]">
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">CALL WALL</div>
                                        <div className="text-sm font-bold font-num text-emerald-300">
                                            ${q.callWall > 0 ? q.callWall.toFixed(0) : '-'}
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1.5 rounded-md border ${q.whaleIndex >= 60 ? 'bg-violet-500/10 border-violet-500/25' : q.whaleIndex >= 30 ? 'bg-white/[0.04] border-white/[0.10]' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">🐋 WHALE</div>
                                        <div className={`text-sm font-bold font-num ${q.whaleIndex >= 60 ? 'text-violet-300' : q.whaleIndex >= 30 ? 'text-white/70' : 'text-white/40'}`}>
                                            {q.whaleIndex > 0 ? q.whaleIndex : '-'}
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1.5 rounded-md border ${q.darkPoolPct >= 40 ? 'bg-slate-500/15 border-slate-400/30' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                                        <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider font-jakarta">🕶️ D.POOL</div>
                                        <div className={`text-sm font-bold font-num ${q.darkPoolPct >= 40 ? 'text-slate-200' : 'text-white/40'}`}>
                                            {q.darkPoolPct > 0 ? `${q.darkPoolPct.toFixed(0)}%` : '-'}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 4: Position Bar */}
                                <div className="mb-2 px-0.5">
                                    <PricePositionBar price={q.price} maxPain={q.maxPain} putFloor={q.putFloor} callWall={q.callWall} />
                                    <div className="flex justify-between text-[11px] mt-1 font-semibold font-jakarta">
                                        <span className="text-rose-400/80">Put</span>
                                        <span className="text-amber-300 font-num">⬥ Pain ${q.maxPain > 0 ? q.maxPain.toFixed(0) : '-'}</span>
                                        <span className="text-emerald-400/80">Call</span>
                                    </div>
                                </div>

                                {/* Row 5: Flow Indicator */}
                                <div className="mb-2">
                                    <FlowBar pcr={q.pcr} changePct={q.changePct} ss={ss} />
                                </div>

                                {/* Row 6: Sparkline */}
                                <div className="mb-2 px-0.5">
                                    <MiniSparkline data={q.sparkline} color={sparkColor} />
                                </div>
                            </div>

                            {/* ── Card Footer: AI Analysis + Regime ── */}
                            <div className="px-3.5 pb-3 pt-0">
                                {/* AI Analysis */}
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 mb-2">
                                    <p className="text-[13px] font-medium text-white/80 leading-relaxed">{analysis}</p>
                                </div>

                                {/* Regime + Alerts + Navigate */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: regimeColor }} />
                                        <span className="text-[11px] font-semibold font-jakarta" style={{ color: regimeColor }}>
                                            {regimeLabel}
                                        </span>
                                        {isHighGex && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded border border-purple-500/25 font-jakarta">
                                                High GEX
                                            </span>
                                        )}
                                        {isExtremePcr && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-500/15 text-amber-300 rounded border border-amber-500/25 font-jakarta">
                                                PCR ⚠
                                            </span>
                                        )}
                                        {q.whaleIndex >= 60 && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-500/15 text-violet-300 rounded border border-violet-500/25 font-jakarta">
                                                🐋 Whale
                                            </span>
                                        )}
                                        {q.darkPoolPct >= 40 && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-500/15 text-slate-300 rounded border border-slate-400/25 font-jakarta">
                                                🕶️ D.Pool
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
                                <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider font-jakarta">{ss('totalGex')}</span>
                                <span className={`text-sm font-bold font-num ${stats.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {stats.totalGex > 0 ? '+' : ''}{formatGex(stats.totalGex)}
                                </span>
                            </div>
                            <p className="text-[11px] text-white/60 font-medium">{stats.gexInsight}</p>
                        </div>
                        <div className="bg-white/[0.02] backdrop-blur-md rounded-lg px-3 py-2 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider font-jakarta">{ss('avgPcr')}</span>
                                <span className={`text-sm font-bold font-num ${stats.avgPcr < 0.8 ? 'text-emerald-400' : stats.avgPcr > 1.1 ? 'text-rose-400' : 'text-white'}`}>
                                    {stats.avgPcr.toFixed(2)}
                                </span>
                            </div>
                            <p className="text-[11px] text-white/60 font-medium">{stats.pcrInsight}</p>
                        </div>
                        <div className="bg-white/[0.02] backdrop-blur-md rounded-lg px-3 py-2 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider font-jakarta">{ss('gamma')}</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-sm font-bold font-num text-cyan-400">{stats.gammaLong}L</span>
                                    <span className="text-[10px] text-white/20">/</span>
                                    <span className="text-sm font-bold font-num text-amber-400">{stats.gammaShort}S</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-white/60 font-medium">
                                {stats.gammaShort > stats.gammaLong ? ss('shortGammaDomMoveRisk') : stats.gammaLong > 0 ? ss('longGammaDomStable') : ss('searchingDirection')}
                            </p>
                        </div>
                        <div className="bg-white/[0.02] backdrop-blur-md rounded-lg px-3 py-2 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider font-jakarta">FLOW</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-sm font-bold font-num text-emerald-400">{stats.callDom}C</span>
                                    <span className="text-[10px] text-white/20">/</span>
                                    <span className="text-sm font-bold font-num text-rose-400">{sorted.length - stats.callDom}P</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-white/60 font-medium">
                                {stats.callDom > sorted.length / 2 ? ss('callInflowDom') : ss('putHedgeDom')}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
