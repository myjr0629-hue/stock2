// ============================================================================
// M7 Ranking Row — 3-Card Premium Glassmorphism Layout
// Money Flow (자금력) | Squeeze Proximity (폭발 임박) | Pain Divergence (과열/침체)
// i18n: ko / en / ja
// ============================================================================
'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { DollarSign, Zap, Flame, TrendingUp, TrendingDown, Activity, Radio } from 'lucide-react';
import type { IntelQuote } from '@/hooks/useIntelSharedData';

// ── i18n Strings ──
type Locale = 'ko' | 'en' | 'ja';

const i18n: Record<Locale, {
    moneyFlow: string; moneyFlowSub: string;
    squeeze: string; squeezeSub: string;
    pain: string; painSub: string;
    live: string;
    closed: string;
    // Insights
    flowIn: (t: string, amt: string) => string;
    flowOut: (t: string, amt: string) => string;
    flowBalanced: string;
    squeezeImm: (t: string, dir: string, dist: string) => string;
    squeezeNear: (t: string, dir: string, dist: string) => string;
    squeezeSafe: string;
    painHigh: (t: string, pct: string, dir: string) => string;
    painNormal: string;
    noData: string;
    // Direction labels
    callWall: string; putFloor: string;
    correction: string; rebound: string;
}> = {
    ko: {
        moneyFlow: 'MONEY FLOW', moneyFlowSub: '자금력 랭킹',
        squeeze: 'SQUEEZE PROXIMITY', squeezeSub: '폭발 임박 랭킹',
        pain: 'PAIN DIVERGENCE', painSub: '과열/침체 랭킹',
        live: 'LIVE',
        closed: 'CLOSED',
        flowIn: (t, amt) => `${t}에 ${amt} 규모 콜 프리미엄 집중 유입. 기관/대형 트레이더의 강세 베팅 신호.`,
        flowOut: (t, amt) => `${t}에서 ${amt} 규모 풋 프리미엄 유출. 하방 헷지 또는 약세 포지션 구축 감지.`,
        flowBalanced: '전 종목 자금 흐름 균형 상태. 뚜렷한 방향성 부재.',
        squeezeImm: (t, dir, dist) => `${t} ${dir} ${dist}% 근접! 돌파 시 감마 스퀴즈로 급등/급락 가능. 포지션 주의.`,
        squeezeNear: (t, dir, dist) => `${t} ${dir}까지 ${dist}% — 레벨 접근 중. 돌파 여부 주시 필요.`,
        squeezeSafe: '전 종목 핵심 레벨과 충분한 거리 유지. 급변동 리스크 낮음.',
        painHigh: (t, pct, dir) => `${t} Max Pain 대비 ${pct}% 괴리. 만기 수렴 압력으로 ${dir} 가능성 높음.`,
        painNormal: '전 종목 Max Pain 적정 범위 내. 만기 수렴 압력 제한적.',
        noData: '데이터 수집 중...',
        callWall: 'Call Wall', putFloor: 'Put Floor',
        correction: '하방 조정', rebound: '상방 반등',
    },
    en: {
        moneyFlow: 'MONEY FLOW', moneyFlowSub: 'Capital Ranking',
        squeeze: 'SQUEEZE PROXIMITY', squeezeSub: 'Breakout Proximity',
        pain: 'PAIN DIVERGENCE', painSub: 'Overheat/Underheat',
        live: 'LIVE',
        closed: 'CLOSED',
        flowIn: (t, amt) => `${t} receiving ${amt} concentrated call premium inflow. Signals bullish institutional positioning.`,
        flowOut: (t, amt) => `${t} showing ${amt} put premium outflow. Downside hedging or bearish positioning detected.`,
        flowBalanced: 'Balanced capital flow across all tickers. No clear directional bias.',
        squeezeImm: (t, dir, dist) => `${t} at ${dist}% from ${dir}! Gamma squeeze potential on breakout. Exercise caution.`,
        squeezeNear: (t, dir, dist) => `${t} approaching ${dir} at ${dist}%. Monitor for potential breakout.`,
        squeezeSafe: 'All tickers maintaining safe distance from key levels. Low volatility risk.',
        painHigh: (t, pct, dir) => `${t} at ${pct}% divergence from Max Pain. Expiry convergence likely to trigger ${dir}.`,
        painNormal: 'All tickers within normal Max Pain range. Limited expiry convergence pressure.',
        noData: 'Collecting data...',
        callWall: 'Call Wall', putFloor: 'Put Floor',
        correction: 'downside correction', rebound: 'upside rebound',
    },
    ja: {
        moneyFlow: 'MONEY FLOW', moneyFlowSub: '資金力ランキング',
        squeeze: 'SQUEEZE PROXIMITY', squeezeSub: '急変動警戒ランキング',
        pain: 'PAIN DIVERGENCE', painSub: '過熱/低迷ランキング',
        live: 'LIVE',
        closed: 'CLOSED',
        flowIn: (t, amt) => `${t}に${amt}規模のコールプレミアム集中流入。機関の強気ポジション構築シグナル。`,
        flowOut: (t, amt) => `${t}から${amt}規模のプットプレミアム流出。ヘッジまたは弱気ポジション検出。`,
        flowBalanced: '全銘柄で資金フロー均衡状態。明確な方向性なし。',
        squeezeImm: (t, dir, dist) => `${t}\u0020${dir}まで${dist}%!突破時ガンマスクイーズの可能性。`,
        squeezeNear: (t, dir, dist) => `${t}\u0020${dir}まで${dist}%。レベル接近中、突破に注目。`,
        squeezeSafe: '全銘柄が主要レベルから十分な距離を維持。急変動リスク低。',
        painHigh: (t, pct, dir) => `${t} Max Pain乖離${pct}%。満期収束圧力で${dir}の可能性。`,
        painNormal: '全銘柄Max Pain適正範囲内。満期収束圧力限定的。',
        noData: 'データ収集中...',
        callWall: 'Call Wall', putFloor: 'Put Floor',
        correction: '下方調整', rebound: '上方反発',
    },
};

// ── Helpers ──
function formatPremium(val: number): string {
    const abs = Math.abs(val);
    if (abs >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
    if (abs >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
}

function getLocale(pathname: string): Locale {
    const seg = pathname?.split('/')[1];
    if (seg === 'ja') return 'ja';
    if (seg === 'en') return 'en';
    return 'ko';
}

interface RankItem {
    ticker: string;
    value: number;
    label: string;
    color: string;
    pct: number;
}

// ── SVG Infographic Backgrounds ──
function MoneyFlowBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            {/* Rising bar chart pattern */}
            <rect x="20" y="120" width="16" height="45" rx="2" fill="currentColor" />
            <rect x="45" y="95" width="16" height="70" rx="2" fill="currentColor" />
            <rect x="70" y="70" width="16" height="95" rx="2" fill="currentColor" />
            <rect x="95" y="50" width="16" height="115" rx="2" fill="currentColor" />
            <rect x="120" y="30" width="16" height="135" rx="2" fill="currentColor" />
            <rect x="145" y="55" width="16" height="110" rx="2" fill="currentColor" />
            <rect x="170" y="40" width="16" height="125" rx="2" fill="currentColor" />
            {/* Trend line */}
            <path d="M28 118 L53 93 L78 68 L103 48 L128 28 L153 53 L178 38" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            {/* Dollar sign watermark */}
            <text x="160" y="30" fontSize="28" fill="currentColor" opacity="0.3" fontWeight="bold">$</text>
        </svg>
    );
}

function SqueezeBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            {/* Compression lines converging */}
            <line x1="10" y1="20" x2="190" y2="75" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10" y1="160" x2="190" y2="105" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10" y1="40" x2="190" y2="80" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            <line x1="10" y1="140" x2="190" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            {/* Explosion/burst at convergence point */}
            <circle cx="190" cy="90" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
            <circle cx="190" cy="90" r="10" fill="none" stroke="currentColor" strokeWidth="1" />
            {/* Lightning bolt */}
            <path d="M175 70 L182 86 L177 86 L184 106 L172 88 L178 88 Z" fill="currentColor" opacity="0.5" />
        </svg>
    );
}

function PainDivBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            {/* Sine wave / oscillation pattern */}
            <path d="M10 90 Q30 30 50 90 Q70 150 90 90 Q110 30 130 90 Q150 150 170 90 Q190 30 200 90" stroke="currentColor" strokeWidth="2" fill="none" />
            {/* Center equilibrium line */}
            <line x1="0" y1="90" x2="200" y2="90" stroke="currentColor" strokeWidth="0.8" strokeDasharray="6,4" opacity="0.6" />
            {/* Target/bullseye */}
            <circle cx="165" cy="45" r="20" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
            <circle cx="165" cy="45" r="12" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
            <circle cx="165" cy="45" r="4" fill="currentColor" opacity="0.3" />
            {/* Divergence arrows */}
            <path d="M35 90 L20 55" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrowUp)" opacity="0.4" />
            <path d="M35 90 L20 125" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
    );
}

// Infographic rank indicators (replacing emojis)
function RankBadge({ rank, color }: { rank: number; color: string }) {
    if (rank <= 3) {
        return (
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14">
                    {rank === 1 && (
                        <>
                            <polygon points="7,1 9,5 13,5.5 10,8.5 10.8,12.5 7,10.5 3.2,12.5 4,8.5 1,5.5 5,5" fill={color} opacity="0.9" />
                            <text x="7" y="8.5" textAnchor="middle" fontSize="5" fill="#fff" fontWeight="bold">1</text>
                        </>
                    )}
                    {rank === 2 && (
                        <>
                            <polygon points="7,1.5 8.8,5 12.5,5.5 9.8,8 10.5,12 7,10 3.5,12 4.2,8 1.5,5.5 5.2,5" fill={color} opacity="0.7" />
                            <text x="7" y="8.5" textAnchor="middle" fontSize="5" fill="#fff" fontWeight="bold">2</text>
                        </>
                    )}
                    {rank === 3 && (
                        <>
                            <polygon points="7,2 8.5,5 12,5.5 9.5,8 10.2,11.5 7,9.8 3.8,11.5 4.5,8 2,5.5 5.5,5" fill={color} opacity="0.5" />
                            <text x="7" y="8.2" textAnchor="middle" fontSize="5" fill="#fff" fontWeight="bold">3</text>
                        </>
                    )}
                </svg>
            </div>
        );
    }
    return (
        <span className="w-4 text-center text-[9px] font-bold text-white/30 flex-shrink-0">{rank}</span>
    );
}

// Proximity severity indicator (replacing emojis)
function SeverityDot({ level }: { level: 'critical' | 'warning' | 'safe' }) {
    const colors = {
        critical: { ring: '#ef4444', core: '#ef4444' },
        warning: { ring: '#f59e0b', core: '#f59e0b' },
        safe: { ring: '#64748b', core: '#64748b' },
    };
    const c = colors[level];
    return (
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="5" fill="none" stroke={c.ring} strokeWidth="1.5" opacity={level === 'critical' ? 1 : 0.6} />
                <circle cx="6" cy="6" r="2.5" fill={c.core} opacity={level === 'critical' ? 0.9 : 0.5} />
                {level === 'critical' && (
                    <circle cx="6" cy="6" r="5" fill="none" stroke={c.ring} strokeWidth="1" opacity="0.3">
                        <animate attributeName="r" values="5;7;5" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                )}
            </svg>
        </div>
    );
}

// Pain magnitude indicator (replacing emojis)
function PainIndicator({ magnitude }: { magnitude: 'high' | 'medium' | 'low' }) {
    const color = magnitude === 'high' ? '#ef4444' : magnitude === 'medium' ? '#f59e0b' : '#10b981';
    return (
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12">
                {magnitude === 'high' ? (
                    // Flame-like bars
                    <>
                        <rect x="1" y="4" width="2.5" height="8" rx="1" fill={color} opacity="0.8" />
                        <rect x="4.75" y="1" width="2.5" height="11" rx="1" fill={color} opacity="0.9" />
                        <rect x="8.5" y="3" width="2.5" height="9" rx="1" fill={color} opacity="0.7" />
                    </>
                ) : magnitude === 'medium' ? (
                    <>
                        <rect x="1" y="6" width="2.5" height="6" rx="1" fill={color} opacity="0.6" />
                        <rect x="4.75" y="3" width="2.5" height="9" rx="1" fill={color} opacity="0.7" />
                        <rect x="8.5" y="5" width="2.5" height="7" rx="1" fill={color} opacity="0.6" />
                    </>
                ) : (
                    <>
                        <rect x="1" y="8" width="2.5" height="4" rx="1" fill={color} opacity="0.4" />
                        <rect x="4.75" y="7" width="2.5" height="5" rx="1" fill={color} opacity="0.5" />
                        <rect x="8.5" y="8" width="2.5" height="4" rx="1" fill={color} opacity="0.4" />
                    </>
                )}
            </svg>
        </div>
    );
}

// ── Main Component ──
export function M7RankingRow({ quotes }: { quotes: IntelQuote[] }) {
    const pathname = usePathname();
    const locale = getLocale(pathname);
    const t = i18n[locale];

    const rankings = useMemo(() => {
        if (!quotes || quotes.length === 0) return null;

        // === Card 1: Money Flow Leaders (Net Premium) ===
        const moneyFlow: RankItem[] = quotes
            .map(q => ({
                ticker: q.ticker,
                value: q.netPremium || 0,
                label: formatPremium(q.netPremium || 0),
                color: (q.netPremium || 0) >= 0 ? '#10b981' : '#f43f5e',
                pct: 0,
            }))
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

        const maxFlow = Math.max(...moneyFlow.map(m => Math.abs(m.value)), 1);
        moneyFlow.forEach(m => { m.pct = (Math.abs(m.value) / maxFlow) * 100; });

        // === Card 2: Squeeze Proximity (Call Wall / Put Floor Distance) ===
        const squeeze: (RankItem & { direction: 'CALL' | 'PUT' | 'NEUTRAL' })[] = quotes
            .filter(q => q.callWall > 0 || q.putFloor > 0)
            .map(q => {
                const toCallWall = q.callWall > 0 ? ((q.callWall - q.price) / q.price * 100) : 999;
                const toPutFloor = q.putFloor > 0 ? ((q.price - q.putFloor) / q.price * 100) : 999;
                const nearestDist = Math.min(toCallWall, toPutFloor);
                const direction = toCallWall < toPutFloor ? 'CALL' as const : 'PUT' as const;

                return {
                    ticker: q.ticker,
                    value: nearestDist,
                    label: `${nearestDist.toFixed(1)}%`,
                    color: nearestDist < 1.5 ? '#ef4444' : nearestDist < 3 ? '#f59e0b' : '#64748b',
                    pct: Math.max(5, 100 - nearestDist * 10),
                    direction,
                };
            })
            .sort((a, b) => a.value - b.value);

        // === Card 3: Pain Divergence (Max Pain vs Price) ===
        const painDiv: RankItem[] = quotes
            .filter(q => q.maxPain > 0)
            .map(q => {
                const diff = ((q.price - q.maxPain) / q.maxPain * 100);
                return {
                    ticker: q.ticker,
                    value: diff,
                    label: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`,
                    color: Math.abs(diff) > 3 ? '#ef4444' : Math.abs(diff) > 1.5 ? '#f59e0b' : '#10b981',
                    pct: Math.min(100, Math.abs(diff) * 15),
                };
            })
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

        // Money Flow insight (detailed)
        const topFlow = moneyFlow[0];
        const flowInsight = topFlow
            ? topFlow.value > 0
                ? t.flowIn(topFlow.ticker, formatPremium(topFlow.value))
                : topFlow.value < 0
                    ? t.flowOut(topFlow.ticker, formatPremium(Math.abs(topFlow.value)))
                    : t.flowBalanced
            : t.noData;

        // Squeeze insight (detailed)
        const topSqueeze = squeeze[0];
        const squeezeInsight = topSqueeze
            ? topSqueeze.value < 1.5
                ? t.squeezeImm(topSqueeze.ticker, topSqueeze.direction === 'CALL' ? t.callWall : t.putFloor, topSqueeze.value.toFixed(1))
                : topSqueeze.value < 3
                    ? t.squeezeNear(topSqueeze.ticker, topSqueeze.direction === 'CALL' ? t.callWall : t.putFloor, topSqueeze.value.toFixed(1))
                    : t.squeezeSafe
            : t.noData;

        // Pain insight (detailed)
        const topPain = painDiv[0];
        const painInsight = topPain
            ? Math.abs(topPain.value) > 3
                ? t.painHigh(topPain.ticker, Math.abs(topPain.value).toFixed(1), topPain.value > 0 ? t.correction : t.rebound)
                : t.painNormal
            : t.noData;

        return {
            moneyFlow: moneyFlow.slice(0, 5),
            squeeze: squeeze.slice(0, 5),
            painDiv: painDiv.slice(0, 5),
            flowInsight,
            squeezeInsight,
            painInsight,
        };
    }, [quotes, t]);

    if (!rankings) return null;

    // Check if market is in regular session (REG = live options data flowing)
    const isLive = quotes.some(q => q.session === 'REG');

    // Glass card base styles
    const cardBase = "relative overflow-hidden rounded-xl border backdrop-blur-2xl shadow-2xl bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.01] border-white/[0.12]";
    const cardInnerGlow = "absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none";

    return (
        <div className="grid grid-cols-3 gap-3">
            {/* ── Card 1: Money Flow Leaders ── */}
            <div className={cardBase}>
                <div className={cardInnerGlow} />
                <MoneyFlowBg />
                {/* Top accent line */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
                {/* Subtle side glow */}
                <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-emerald-500/[0.03] to-transparent pointer-events-none" />

                <div className="relative z-10 p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center backdrop-blur-sm">
                                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                            <div>
                                <span className="text-[11px] font-bold text-white uppercase tracking-wider">{t.moneyFlow}</span>
                                <span className="text-[9px] text-white ml-1.5">({t.moneyFlowSub})</span>
                            </div>
                        </div>
                        {isLive ? (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[8px] font-bold text-emerald-400">{t.live}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                <span className="text-[8px] font-bold text-slate-400">{t.closed}</span>
                            </div>
                        )}
                    </div>

                    {/* Rankings */}
                    <div className="space-y-1.5">
                        {rankings.moneyFlow.map((item, idx) => (
                            <div key={item.ticker} className="flex items-center gap-2">
                                <RankBadge rank={idx + 1} color={item.color} />
                                <span className="text-[11px] font-bold text-white w-10 font-jakarta">{item.ticker}</span>
                                <div className="flex-1 h-3 bg-white/[0.04] rounded-full overflow-hidden relative border border-white/[0.04]">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                            width: `${item.pct}%`,
                                            background: item.value >= 0
                                                ? 'linear-gradient(90deg, rgba(16,185,129,0.2), rgba(16,185,129,0.45))'
                                                : 'linear-gradient(90deg, rgba(244,63,94,0.2), rgba(244,63,94,0.45))',
                                        }}
                                    />
                                </div>
                                <span className={`text-[11px] font-black min-w-[55px] text-right ${item.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {item.value >= 0 ? '+' : ''}{item.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Insight — pure white */}
                    <p className="text-[11px] text-white font-medium mt-3 leading-relaxed">{rankings.flowInsight}</p>
                </div>
            </div>

            {/* ── Card 2: Squeeze Proximity ── */}
            <div className={cardBase}>
                <div className={cardInnerGlow} />
                <SqueezeBg />
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
                <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-amber-500/[0.03] to-transparent pointer-events-none" />

                <div className="relative z-10 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center backdrop-blur-sm">
                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                            </div>
                            <div>
                                <span className="text-[11px] font-bold text-white uppercase tracking-wider">{t.squeeze}</span>
                                <span className="text-[9px] text-white ml-1.5">({t.squeezeSub})</span>
                            </div>
                        </div>
                        {isLive ? (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                <span className="text-[8px] font-bold text-amber-400">{t.live}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                <span className="text-[8px] font-bold text-slate-400">{t.closed}</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        {rankings.squeeze.map((item) => {
                            const severity: 'critical' | 'warning' | 'safe' = item.value < 1.5 ? 'critical' : item.value < 3 ? 'warning' : 'safe';
                            const dirLabel = item.direction === 'CALL' ? '↑CW' : '↓PF';
                            return (
                                <div key={item.ticker} className="flex items-center gap-2">
                                    <SeverityDot level={severity} />
                                    <span className="text-[11px] font-bold text-white w-10 font-jakarta">{item.ticker}</span>
                                    <div className="flex-1 h-3 bg-white/[0.04] rounded-full overflow-hidden relative border border-white/[0.04]">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                width: `${item.pct}%`,
                                                background: item.value < 1.5
                                                    ? 'linear-gradient(90deg, rgba(239,68,68,0.2), rgba(239,68,68,0.5))'
                                                    : item.value < 3
                                                        ? 'linear-gradient(90deg, rgba(245,158,11,0.15), rgba(245,158,11,0.35))'
                                                        : 'linear-gradient(90deg, rgba(100,116,139,0.1), rgba(100,116,139,0.25))',
                                            }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-semibold text-white/40 w-5">{dirLabel}</span>
                                    <span className="text-[11px] font-black min-w-[35px] text-right"
                                        style={{ color: item.color }}>
                                        {item.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-[11px] text-white font-medium mt-3 leading-relaxed">{rankings.squeezeInsight}</p>
                </div>
            </div>

            {/* ── Card 3: Pain Divergence ── */}
            <div className={cardBase}>
                <div className={cardInnerGlow} />
                <PainDivBg />
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-400/50 to-transparent" />
                <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-rose-500/[0.03] to-transparent pointer-events-none" />

                <div className="relative z-10 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-rose-500/15 border border-rose-500/25 flex items-center justify-center backdrop-blur-sm">
                                <Flame className="w-3.5 h-3.5 text-rose-400" />
                            </div>
                            <div>
                                <span className="text-[11px] font-bold text-white uppercase tracking-wider">{t.pain}</span>
                                <span className="text-[9px] text-white ml-1.5">({t.painSub})</span>
                            </div>
                        </div>
                        {isLive ? (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                                <span className="text-[8px] font-bold text-rose-400">{t.live}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                <span className="text-[8px] font-bold text-slate-400">{t.closed}</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        {rankings.painDiv.map((item) => {
                            const mag: 'high' | 'medium' | 'low' = Math.abs(item.value) > 3 ? 'high' : Math.abs(item.value) > 1.5 ? 'medium' : 'low';
                            return (
                                <div key={item.ticker} className="flex items-center gap-2">
                                    <PainIndicator magnitude={mag} />
                                    <span className="text-[11px] font-bold text-white w-10 font-jakarta">{item.ticker}</span>
                                    <div className="flex-1 h-3 bg-white/[0.04] rounded-full overflow-hidden relative border border-white/[0.04]">
                                        {/* Center line */}
                                        <div className="absolute left-1/2 top-0 w-px h-full bg-white/10" />
                                        {item.value >= 0 ? (
                                            <div
                                                className="absolute left-1/2 top-0 h-full rounded-r-full transition-all duration-700"
                                                style={{
                                                    width: `${Math.min(50, item.pct / 2)}%`,
                                                    background: 'linear-gradient(90deg, rgba(239,68,68,0.2), rgba(239,68,68,0.45))',
                                                }}
                                            />
                                        ) : (
                                            <div
                                                className="absolute top-0 h-full rounded-l-full transition-all duration-700"
                                                style={{
                                                    right: '50%',
                                                    width: `${Math.min(50, item.pct / 2)}%`,
                                                    background: 'linear-gradient(270deg, rgba(59,130,246,0.2), rgba(59,130,246,0.45))',
                                                }}
                                            />
                                        )}
                                    </div>
                                    <span className="text-[11px] font-black min-w-[42px] text-right"
                                        style={{ color: item.color }}>
                                        {item.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-[11px] text-white font-medium mt-3 leading-relaxed">{rankings.painInsight}</p>
                </div>
            </div>
        </div>
    );
}
