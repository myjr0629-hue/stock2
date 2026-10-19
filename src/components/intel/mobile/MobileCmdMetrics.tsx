'use client';

// ============================================================================
// MobileCmdMetrics — Signal Dashboard 9 Cards + Analyst Consensus
// Extracted from MobileCmdOverview to create dedicated Metrics tab
// All calculation logic (effectiveVol, conviction) = desktop-identical
// ZERO desktop impact — isolated in mobile/ directory
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { ProGate } from '@/components/gate/FeatureGate';
import { buildInsiderSignal } from '@/services/insiderSignal';
import { earningsWithin } from '@/lib/earningsDate';
import { computeUnifiedVolatilityRegime } from '@/lib/metrics/volatilityRegime';
import { commandConvictionRaw, retainConvictionInputs, scoreCommandConviction, type ConvictionSnapshot } from '@/lib/commandConviction';
import { normalizeVwap, vwapDistancePct } from '@/lib/vwap';

interface Props {
    ticker: string;
    quote: IntelQuote;
    unified: any;
    /** 공용 판본 선택으로 고른 변동성 입력. 생략(undefined)이면 unified 를 그대로 쓴다. */
    volatilityData?: { structure: any; volatility: any } | null;
    unifiedLoading: boolean;
    vwap?: number | null;
}

// ── Signal Card (same as Overview) ──
function SignalCard({ label, value, sub, color, bg, border, badge, badgeColor }: {
    label: string; value: string; sub?: string;
    color?: string; bg?: string; border?: string;
    badge?: string; badgeColor?: string;
}) {
    const cardBg = bg || 'bg-slate-800/40';
    const cardBorder = border || 'border-slate-700/50';
    return (
        <div className={`relative overflow-hidden rounded-xl px-3 py-3 transition-all duration-500 backdrop-blur-xl border ${cardBg} ${cardBorder}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-white/60 uppercase tracking-wider font-bold font-jakarta">{label}</span>
                    {badge && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${badgeColor || 'bg-slate-700/60 text-slate-300'}`}>{badge}</span>}
                </div>
                <div className={`text-[16px] font-black font-mono tabular-nums leading-none ${color || 'text-white'}`}>{value}</div>
                {sub && <div className="text-[11px] text-slate-400 mt-1 font-medium font-jakarta">{sub}</div>}
            </div>
        </div>
    );
}

export function MobileCmdMetrics({ ticker, quote, unified, volatilityData, unifiedLoading, vwap: sourceVwap }: Props) {
    const q = quote;
    const vwap = normalizeVwap(sourceVwap);
    const locale = useLocale() as 'ko' | 'en' | 'ja';

    // [다크풀 대체] 「기관 레이더」가 쓰던 다크풀은 현재 피드에 값이 오지 않는다.
    // 앱(app-view/cmd)과 **같은 엔드포인트·같은 판정식**으로 내부자 거래를 쓴다.
    const [insider, setInsider] = useState<any>(null);
    useEffect(() => {
        if (!ticker) return;
        let alive = true;
        setInsider(null);   // 티커 전환 시 이전 종목 값이 남지 않게
        fetch(`/api/command/insider?ticker=${ticker}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (alive) setInsider(d?.insider || null); })
            .catch(() => { });
        return () => { alive = false; };
    }, [ticker]);
    const insiderSignal = useMemo(() => buildInsiderSignal(insider, locale), [insider, locale]);

    // ═══ EFFECTIVE DATA ═══
    const structure = unified?.structure || {};
    const volatility = unified?.volatility || {};
    const sma = unified?.sma || {};
    const squeeze = unified?.squeeze || {};
    const institutional = unified?.institutional || {};
    const earnings = unified?.earnings || {};
    const analyst = unified?.analyst || {};
    const fund = unified?.fundamentals || {};

    // 8 Signal cards data
    const gex = structure.netGex || q.gex || 0;
    const pcr = structure.pcRatio || q.pcr || 0;
    const squeezeScore = volatility.squeezeScore || q.squeezeScore || 0;
    const smaCross = sma.cross || 'NONE';
    const earningsLabel = earnings.daysLabel || '';
    const priceTarget = analyst.priceTarget?.targetConsensus || 0;
    const targetUpside = priceTarget > 0 && q.price > 0 ? ((priceTarget - q.price) / q.price * 100) : 0;

    const effectiveVol = useMemo(() => computeUnifiedVolatilityRegime(volatilityData !== undefined ? volatilityData : unified), [volatilityData, unified]);

    // ═══ CONVICTION — 웹·앱과 같은 정의(lib/commandConviction)·같은 입력 규칙(lib/metrics/observation) ═══
    //   결측 입력은 투표하지 않는다(기본 50 금지) · 실패 구간은 관측 아님 · 결측이면 직전 실제 값+날짜.
    const convictionHistory = useRef<ConvictionSnapshot | undefined>(undefined);
    const convictionSnapshot = useMemo(() => {
        const { raw, dates } = commandConvictionRaw(unified, q.price, vwap, { netPremium: q.netPremium });
        return retainConvictionInputs(ticker, raw, dates, convictionHistory.current);
    }, [ticker, unified, q.price, vwap, q.netPremium]);
    useEffect(() => { convictionHistory.current = convictionSnapshot; }, [convictionSnapshot]);
    const conviction = useMemo(() => {
        const result = scoreCommandConviction(convictionSnapshot.inputs);
        if (!result) return { score: null as number | null, label: '—', grade: '—' };
        const score = result.score;
        // 모바일 카드의 기존 영어 상태어·등급 경계 그대로(문구 변경 없음).
        const label = score >= 80 ? 'Strong Bullish' : score >= 65 ? 'Positive Bias' : score >= 55 ? 'Slight Bullish'
            : score >= 45 ? 'Neutral' : score >= 35 ? 'Slight Bearish' : score >= 20 ? 'Bearish' : 'Strong Bearish';
        return { score: score as number | null, label, grade: result.grade };
    }, [convictionSnapshot]);

    return (
        <div className="space-y-4">

            {/* ═══ SIGNAL DASHBOARD — 9 Cards (2×4 + 1) ═══ */}
            <div>
                <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-0.5">Signal Dashboard</div>
                <div className="grid grid-cols-2 gap-2">
                    {/* [1-1] VOL REGIME */}
                    {(() => { const ev = effectiveVol; const rg = ev.regime ?? '—'; const rs = ev.regimeScore ?? '—'; const evIv = ev.iv; const evFlip = ev.flipLevel; const evFlipDist = ev.flipDistance; const evAbove = ev.isAboveFlip; return (
                    <ProGate title="Vol Regime" mode="peek" compact>
                    <SignalCard label="VOL REGIME" value={`${rs} /100`}
                        badge={rg}
                        badgeColor={rg === 'ERUPTING' ? 'bg-rose-500/25 text-rose-400' : rg === 'LOADED' ? 'bg-amber-500/25 text-amber-400' : rg === 'COILING' ? 'bg-cyan-500/25 text-cyan-400' : 'bg-emerald-500/25 text-emerald-400'}
                        color={rg === 'ERUPTING' ? 'text-rose-400' : rg === 'LOADED' ? 'text-amber-400' : rg === 'COILING' ? 'text-cyan-400' : 'text-emerald-400'}
                        bg={rg === 'ERUPTING' ? 'bg-rose-950/40' : rg === 'LOADED' ? 'bg-amber-950/40' : 'bg-slate-800/40'}
                        border={rg === 'ERUPTING' ? 'border-rose-500/30' : rg === 'LOADED' ? 'border-amber-500/30' : 'border-slate-700/50'}
                        sub={`GEX:${ev.gexLabel || volatility.gexLabel || '—'}${evIv != null ? ` · IV ${evIv}%` : ''}${evFlip != null && evFlipDist != null ? ` · Flip ${evAbove ? '↑' : '↓'}${Math.abs(evFlipDist).toFixed(1)}%` : ''}`} />
                    </ProGate>
                    ); })()}
                    {/* [1-2] CONVICTION */}
                    <ProGate title="Conviction" mode="peek" compact>
                    <SignalCard label="CONVICTION" value={`${conviction.score ?? '—'} /100`}
                        badge={conviction.grade}
                        badgeColor={conviction.score != null && conviction.score >= 60 ? 'bg-emerald-500/25 text-emerald-400' : conviction.score != null && conviction.score <= 40 ? 'bg-rose-500/25 text-rose-400' : 'bg-slate-500/25 text-slate-300'}
                        sub={`${conviction.label}${pcr > 0 ? ` · PCR:${pcr.toFixed(2)}` : ''}`}
                        color={conviction.score != null && conviction.score >= 60 ? 'text-emerald-400' : conviction.score != null && conviction.score <= 40 ? 'text-rose-400' : 'text-white'}
                        bg={conviction.score != null && conviction.score >= 60 ? 'bg-emerald-950/40' : conviction.score != null && conviction.score <= 40 ? 'bg-rose-950/40' : 'bg-slate-800/40'}
                        border={conviction.score != null && conviction.score >= 60 ? 'border-emerald-500/30' : conviction.score != null && conviction.score <= 40 ? 'border-rose-500/30' : 'border-slate-700/50'} />
                    </ProGate>
                    {/* [1-3] VWAP */}
                    {(() => { const vwapDiff = vwapDistancePct(q.price, vwap); return (
                    <SignalCard label="VWAP" value={vwap !== null ? `$${vwap.toFixed(2)}` : '—'}
                        color={(vwapDiff ?? 0) > 2 ? 'text-emerald-400' : (vwapDiff ?? 0) < -2 ? 'text-rose-400' : 'text-white'}
                        bg={(vwapDiff ?? 0) > 2 ? 'bg-emerald-950/40' : (vwapDiff ?? 0) < -2 ? 'bg-rose-950/40' : 'bg-slate-800/40'}
                        border={(vwapDiff ?? 0) > 2 ? 'border-emerald-500/30' : (vwapDiff ?? 0) < -2 ? 'border-rose-500/30' : 'border-slate-700/50'}
                        sub={vwapDiff !== null ? `${vwapDiff > 0 ? '+' : ''}${vwapDiff.toFixed(1)}% deviation` : undefined} />
                    ); })()}
                    {/* [1-4] SHORT SQUEEZE */}
                    <ProGate title="Short Squeeze" mode="peek" compact>
                    <SignalCard label="SHORT SQUEEZE" value={squeeze.siPercent != null ? `${Number(squeeze.siPercent).toFixed(1)}%` : (squeezeScore > 0 ? `${Math.round(squeezeScore)}%` : '-')}
                        color={squeeze.status === 'CRITICAL' ? 'text-rose-400' : squeeze.status === 'HIGH' ? 'text-amber-400' : squeeze.status === 'MEDIUM' ? 'text-cyan-400' : 'text-emerald-400'}
                        bg={squeeze.status === 'CRITICAL' ? 'bg-rose-950/40' : squeeze.status === 'HIGH' ? 'bg-amber-950/40' : 'bg-slate-800/40'}
                        border={squeeze.status === 'CRITICAL' ? 'border-rose-500/30' : squeeze.status === 'HIGH' ? 'border-amber-500/30' : 'border-slate-700/50'}
                        sub={`${squeeze.status || 'LOW'} · DTC:${squeeze.daysToCover?.toFixed(1) || '—'}${squeeze.siChange ? ` · Δ${squeeze.siChange > 0 ? '+' : ''}${Number(squeeze.siChange).toFixed(1)}%` : ''}${institutional.shortVolume?.percent ? ` · SV:${institutional.shortVolume.percent.toFixed(0)}%` : ''}`} />
                    </ProGate>
                    {/* [1-5] ANALYST TARGET */}
                    {(() => { const isBullish = analyst.consensus === 'Strong Buy' || analyst.consensus === 'Buy'; const isBearish = analyst.consensus === 'Sell' || analyst.consensus === 'Strong Sell'; const buyPct = analyst.totalAnalysts > 0 ? Math.round(((analyst.breakdown?.strongBuy || 0) + (analyst.breakdown?.buy || 0)) / analyst.totalAnalysts * 100) : 0; return (
                    <SignalCard label="ANALYST TARGET" value={buyPct > 0 ? `${buyPct}%` : (analyst.consensus || '—')}
                        color={isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-white'}
                        bg={isBullish ? 'bg-emerald-950/40' : isBearish ? 'bg-rose-950/40' : 'bg-slate-800/40'}
                        border={isBullish ? 'border-emerald-500/30' : isBearish ? 'border-rose-500/30' : 'border-slate-700/50'}
                        sub={`${analyst.consensus || '—'} · ${analyst.totalAnalysts || 0} analysts${priceTarget > 0 ? ` · $${priceTarget.toFixed(0)}(${targetUpside > 0 ? '+' : ''}${targetUpside.toFixed(1)}%)` : ''}`} />
                    ); })()}
                    {/* [2-1] INSIDER — 다크풀 자리 대체 (services/insiderSignal 이 정본) */}
                    <ProGate title="Insider" mode="blur" compact>
                    <SignalCard label={locale === 'ko' ? '내부자 거래' : locale === 'ja' ? '内部者取引' : 'INSIDER'}
                        value={insiderSignal.value}
                        color={insiderSignal.direction === 'up' ? 'text-emerald-400' : insiderSignal.direction === 'down' ? 'text-rose-400' : 'text-slate-300'}
                        bg={insiderSignal.direction === 'up' ? 'bg-emerald-950/40' : insiderSignal.direction === 'down' ? 'bg-rose-950/40' : 'bg-slate-800/40'}
                        border={insiderSignal.direction === 'up' ? 'border-emerald-500/30' : insiderSignal.direction === 'down' ? 'border-rose-500/30' : 'border-slate-700/50'}
                        sub={insiderSignal.subText} />
                    </ProGate>
                    {/* [2-2] TREND PHASE */}
                    <SignalCard label="TREND PHASE" value={smaCross === 'GOLDEN' ? 'GOLDEN' : smaCross === 'DEAD' ? 'DEAD' : sma.label || '—'}
                        color={smaCross === 'GOLDEN' ? 'text-emerald-400' : smaCross === 'DEAD' ? 'text-rose-400' : 'text-slate-300'}
                        bg={smaCross === 'GOLDEN' ? 'bg-emerald-950/40' : smaCross === 'DEAD' ? 'bg-rose-950/40' : 'bg-slate-800/40'}
                        border={smaCross === 'GOLDEN' ? 'border-emerald-500/30' : smaCross === 'DEAD' ? 'border-rose-500/30' : 'border-slate-700/50'}
                        sub={`SMA 50/200 · ${sma.distance != null ? (sma.distance > 0 ? '+' : '') + sma.distance + '%' : '—'}`} />
                    {/* [2-3] FUNDAMENTAL */}
                    <SignalCard label="FUNDAMENTAL" value={fund.grade || '—'}
                        sub={fund.score ? `${fund.score}/100 · PE:${fund.pe ?? '—'} · ROE:${fund.roe ?? '—'}%${fund.revenueGrowth ? ` · Rev:${fund.revenueGrowth > 0 ? '+' : ''}${fund.revenueGrowth}%` : ''}` : undefined}
                        color={fund.grade?.startsWith('A') ? 'text-emerald-400' : fund.grade?.startsWith('B') ? 'text-cyan-400' : fund.grade?.startsWith('C') ? 'text-amber-400' : 'text-slate-300'}
                        bg={fund.grade?.startsWith('A') ? 'bg-emerald-950/40' : fund.grade?.startsWith('B') ? 'bg-cyan-950/40' : 'bg-slate-800/40'}
                        border={fund.grade?.startsWith('A') ? 'border-emerald-500/30' : fund.grade?.startsWith('B') ? 'border-cyan-500/30' : 'border-slate-700/50'} />
                    {/* [2-4] EARNINGS */}
                    <SignalCard label="EARNINGS" value={earningsLabel || '—'}
                        color={earningsWithin(earnings.daysUntilEarnings, 7) ? 'text-amber-400' : 'text-slate-300'}
                        bg={earningsWithin(earnings.daysUntilEarnings, 7) ? 'bg-amber-950/40' : 'bg-slate-800/40'}
                        border={earningsWithin(earnings.daysUntilEarnings, 7) ? 'border-amber-500/30' : 'border-slate-700/50'}
                        sub={`${earnings.nextEarningsDate || 'TBD'}${earnings.epsEstimate ? ' · Est $' + Number(earnings.epsEstimate).toFixed(2) : ''}`} />
                </div>
            </div>

            {/* ═══ ANALYST CONSENSUS ═══ */}
            {analyst.totalAnalysts > 0 && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Analyst Consensus</div>
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-[16px] font-bold ${
                            analyst.consensus === 'Strong Buy' || analyst.consensus === 'Buy' ? 'text-emerald-400' :
                            analyst.consensus === 'Hold' ? 'text-amber-400' : 'text-rose-400'}`}>
                            {analyst.consensus}
                        </span>
                        <span className="text-[12px] text-slate-400">{analyst.totalAnalysts} analysts</span>
                    </div>
                    {/* Consensus Bar */}
                    <div className="flex h-2 rounded-full overflow-hidden gap-px mb-2">
                        {analyst.breakdown && <>
                            <div className="bg-emerald-500 rounded-l-full" style={{ flex: (analyst.breakdown.strongBuy || 0) + (analyst.breakdown.buy || 0) }} />
                            <div className="bg-amber-500" style={{ flex: analyst.breakdown.hold || 0 }} />
                            <div className="bg-rose-500 rounded-r-full" style={{ flex: (analyst.breakdown.sell || 0) + (analyst.breakdown.strongSell || 0) }} />
                        </>}
                    </div>
                    {/* Price Target */}
                    {analyst.priceTarget?.targetConsensus > 0 && (
                        <div className="flex items-center justify-between text-[12px] mt-2 pt-2 border-t border-white/[0.06]">
                            <span className="text-slate-400">Target</span>
                            <span className="text-white font-bold font-mono">${analyst.priceTarget.targetConsensus.toFixed(0)}</span>
                            <span className={`font-bold font-mono ${
                                analyst.priceTarget.targetConsensus > q.price ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {((analyst.priceTarget.targetConsensus - q.price) / q.price * 100).toFixed(1)}%
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
