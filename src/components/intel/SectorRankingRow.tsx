// ============================================================================
// Sector Ranking Row — Generic 3-Card Premium Glassmorphism Layout
// Money Flow (자금력) | Squeeze Proximity (폭발 임박) | Pain Divergence (과열/침체)
// Config-driven: works with any SectorConfig (M7, Physical AI, Bio, Crypto...)
// i18n: ko / en / ja
// ============================================================================
'use client';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { DollarSign, Zap, Flame } from 'lucide-react';
import type { IntelQuote } from '@/hooks/useIntelSharedData';
import type { SectorConfig } from '@/types/sector';

// ── i18n Strings ──
type Locale = 'ko' | 'en' | 'ja';

const i18n: Record<Locale, {
    moneyFlow: string; moneyFlowSub: string;
    squeeze: string; squeezeSub: string;
    pain: string; painSub: string;
    live: string;
    closed: string;
    flowIn: (t: string, amt: string) => string;
    flowOut: (t: string, amt: string) => string;
    flowBalanced: string;
    squeezeImm: (t: string, dir: string, dist: string) => string;
    squeezeNear: (t: string, dir: string, dist: string) => string;
    squeezeSafe: string;
    painHigh: (t: string, pct: string, dir: string) => string;
    painNormal: string;
    noData: string;
    callWall: string; putFloor: string;
    correction: string; rebound: string;
}> = {
    ko: {
        moneyFlow: 'MONEY FLOW', moneyFlowSub: '자금력 랭킹',
        squeeze: 'SQUEEZE PROXIMITY', squeezeSub: '폭발 임박 랭킹',
        pain: 'PAIN DIVERGENCE', painSub: '과열/침체 랭킹',
        live: 'LIVE',
        closed: 'CLOSED',
        flowIn: (t, amt) => `${t} 종목에 ${amt} 순유입 중. 기관/스마트머니의 집중 매수가 감지됩니다.`,
        flowOut: (t, amt) => `${t} 종목에서 ${amt} 순유출 중. 대규모 매도 또는 헤지 포지션 구축 가능성.`,
        flowBalanced: '전 종목 자금 흐름 균형 상태. 뚜렷한 방향성 부재.',
        squeezeImm: (t, dir, dist) => `${t} 종목이 ${dir}까지 ${dist}% 거리에 임박. 급격한 가격 변동 가능성 높음.`,
        squeezeNear: (t, dir, dist) => `${t} 종목이 ${dir}까지 ${dist}%로 접근 중. 경계 감시 필요.`,
        squeezeSafe: '전 종목 핵심 레벨과 충분한 거리 유지. 급변동 리스크 낮음.',
        painHigh: (t, pct, dir) => `${t} 종목이 Max Pain 대비 ${pct}% 괴리. 만기일 ${dir} 수렴 압력 주의.`,
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
        flowIn: (t, amt) => `${t} seeing ${amt} net inflow. Institutional/smart money accumulation detected.`,
        flowOut: (t, amt) => `${t} seeing ${amt} net outflow. Large-scale selling or hedge positioning possible.`,
        flowBalanced: 'Balanced capital flow across all tickers. No clear directional bias.',
        squeezeImm: (t, dir, dist) => `${t} within ${dist}% of ${dir}. High probability of sharp price movement.`,
        squeezeNear: (t, dir, dist) => `${t} approaching ${dir} at ${dist}%. Monitor closely.`,
        squeezeSafe: 'All tickers maintaining safe distance from key levels. Low volatility risk.',
        painHigh: (t, pct, dir) => `${t} diverged ${pct}% from Max Pain. Watch for ${dir} convergence pressure at expiry.`,
        painNormal: 'All tickers within normal Max Pain range. Limited expiry convergence pressure.',
        noData: 'Collecting data...',
        callWall: 'Call Wall', putFloor: 'Put Floor',
        correction: 'downward correction', rebound: 'upward rebound',
    },
    ja: {
        moneyFlow: 'MONEY FLOW', moneyFlowSub: '資金力ランキング',
        squeeze: 'SQUEEZE PROXIMITY', squeezeSub: '急変動警戒ランキング',
        pain: 'PAIN DIVERGENCE', painSub: '過熱/低迷ランキング',
        live: 'LIVE',
        closed: 'CLOSED',
        flowIn: (t, amt) => `${t}に${amt}の純流入中。機関投資家の集中買いが検出されています。`,
        flowOut: (t, amt) => `${t}から${amt}の純流出中。大規模売却またはヘッジポジション構築の可能性。`,
        flowBalanced: '全銘柄で資金フロー均衡状態。明確な方向性なし。',
        squeezeImm: (t, dir, dist) => `${t}が${dir}まで${dist}%の距離に迫っています。急激な価格変動の可能性が高い。`,
        squeezeNear: (t, dir, dist) => `${t}が${dir}まで${dist}%に接近中。警戒監視が必要。`,
        squeezeSafe: '全銘柄が主要レベルから十分な距離を維持。急変動リスク低。',
        painHigh: (t, pct, dir) => `${t}がMax Pain比${pct}%乖離。満期日の${dir}収束圧力に注意。`,
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
        <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none" viewBox="0 0 200 200" preserveAspectRatio="none">
            <path d="M20 160 Q50 80 100 100 T180 60" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M20 170 Q60 100 110 120 T180 80" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5" />
            <circle cx="100" cy="100" r="30" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
            <text x="145" y="50" fontSize="36" fill="currentColor" opacity="0.2" fontWeight="bold">$</text>
            <rect x="15" y="155" width="8" height="35" rx="2" fill="currentColor" opacity="0.15" />
            <rect x="30" y="135" width="8" height="55" rx="2" fill="currentColor" opacity="0.1" />
            <rect x="45" y="145" width="8" height="45" rx="2" fill="currentColor" opacity="0.12" />
        </svg>
    );
}

function SqueezeBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none" viewBox="0 0 200 200" preserveAspectRatio="none">
            <line x1="100" y1="20" x2="100" y2="180" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
            <path d="M30 100 Q65 60 100 100 Q135 140 170 100" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M30 100 Q65 140 100 100 Q135 60 170 100" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="100" cy="100" r="5" fill="currentColor" opacity="0.3" />
            <text x="140" y="45" fontSize="28" fill="currentColor" opacity="0.2" fontWeight="bold">⚡</text>
        </svg>
    );
}

function PainDivBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none" viewBox="0 0 200 200" preserveAspectRatio="none">
            <line x1="20" y1="100" x2="180" y2="100" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
            <path d="M20 100 Q60 40 100 100 Q140 160 180 100" stroke="currentColor" strokeWidth="2" fill="none" />
            <circle cx="100" cy="100" r="20" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
            <circle cx="100" cy="100" r="3" fill="currentColor" opacity="0.4" />
            <text x="150" y="45" fontSize="24" fill="currentColor" opacity="0.2" fontWeight="bold">MP</text>
        </svg>
    );
}

// Infographic rank indicators
function RankBadge({ rank, color }: { rank: number; color: string }) {
    return (
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 18 18">
                {rank <= 3 ? (
                    <>
                        <polygon
                            points="9,1 11.5,6.5 17,7 13,11 14,16.5 9,14 4,16.5 5,11 1,7 6.5,6.5"
                            fill={color}
                            opacity={rank === 1 ? 0.9 : rank === 2 ? 0.6 : 0.35}
                            stroke={color}
                            strokeWidth="0.5"
                        />
                        <text x="9" y="11" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">{rank}</text>
                    </>
                ) : (
                    <>
                        <circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
                        <text x="9" y="12" textAnchor="middle" fontSize="8" fill={color} fontWeight="bold" opacity="0.6">{rank}</text>
                    </>
                )}
            </svg>
        </div>
    );
}

// Proximity severity indicator
function SeverityDot({ level }: { level: 'critical' | 'warning' | 'safe' }) {
    const config = {
        critical: { color: '#ef4444', pulseColor: 'rgba(239,68,68,0.4)' },
        warning: { color: '#f59e0b', pulseColor: 'rgba(245,158,11,0.3)' },
        safe: { color: '#64748b', pulseColor: 'transparent' },
    }[level];

    return (
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14">
                {level === 'critical' && (
                    <circle cx="7" cy="7" r="6" fill={config.pulseColor} opacity="0.5">
                        <animate attributeName="r" values="4;7;4" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                )}
                {level === 'warning' && (
                    <circle cx="7" cy="7" r="5" fill={config.pulseColor} opacity="0.3" />
                )}
                <circle cx="7" cy="7" r="3" fill={config.color} />
                {level === 'critical' && (
                    <text x="7" y="9.5" textAnchor="middle" fontSize="5" fill="white" fontWeight="bold">!</text>
                )}
            </svg>
        </div>
    );
}

// Pain magnitude indicator
function PainIndicator({ magnitude }: { magnitude: 'high' | 'medium' | 'low' }) {
    const color = magnitude === 'high' ? '#ef4444' : magnitude === 'medium' ? '#f59e0b' : '#10b981';
    return (
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12">
                {magnitude === 'high' ? (
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
interface SectorRankingRowProps {
    config: SectorConfig;
    quotes: IntelQuote[];
}

export function SectorRankingRow({ config, quotes }: SectorRankingRowProps) {
    const pathname = usePathname();
    const locale = getLocale(pathname);
    const t = i18n[locale];

    const rankings = useMemo(() => {
        if (!quotes || quotes.length === 0) return null;

        // === Card 1: Money Flow Leaders (Net Premium) ===
        // ★ Sort DESCENDING by value (양수가 상위, 음수가 하위)
        const moneyFlow: RankItem[] = quotes
            .map(q => ({
                ticker: q.ticker,
                value: q.netPremium || 0,
                label: formatPremium(q.netPremium || 0),
                color: (q.netPremium || 0) >= 0 ? '#10b981' : '#f43f5e',
                pct: 0,
            }))
            .sort((a, b) => b.value - a.value);

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

        // Money Flow insight
        const topFlow = moneyFlow[0];
        const flowInsight = topFlow
            ? topFlow.value > 0
                ? t.flowIn(topFlow.ticker, formatPremium(topFlow.value))
                : topFlow.value < 0
                    ? t.flowOut(topFlow.ticker, formatPremium(Math.abs(topFlow.value)))
                    : t.flowBalanced
            : t.noData;

        // Squeeze insight
        const topSqueeze = squeeze[0];
        const squeezeInsight = topSqueeze
            ? topSqueeze.value < 1.5
                ? t.squeezeImm(topSqueeze.ticker, topSqueeze.direction === 'CALL' ? t.callWall : t.putFloor, topSqueeze.value.toFixed(1))
                : topSqueeze.value < 3
                    ? t.squeezeNear(topSqueeze.ticker, topSqueeze.direction === 'CALL' ? t.callWall : t.putFloor, topSqueeze.value.toFixed(1))
                    : t.squeezeSafe
            : t.noData;

        // Pain insight
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
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
                <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-emerald-500/[0.03] to-transparent pointer-events-none" />

                <div className="relative z-10 p-4">
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
