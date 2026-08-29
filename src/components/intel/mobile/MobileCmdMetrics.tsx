'use client';

// ============================================================================
// MobileCmdMetrics — Signal Dashboard 9 Cards + Analyst Consensus
// Extracted from MobileCmdOverview to create dedicated Metrics tab
// All calculation logic (effectiveVol, conviction) = desktop-identical
// ZERO desktop impact — isolated in mobile/ directory
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { ProGate } from '@/components/gate/FeatureGate';
import { buildInsiderSignal } from '@/services/insiderSignal';

interface Props {
    ticker: string;
    quote: IntelQuote;
    unified: any;
    unifiedLoading: boolean;
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

export function MobileCmdMetrics({ ticker, quote, unified, unifiedLoading }: Props) {
    const q = quote;
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
    const regime = volatility.regime || (q.gammaRegime === 'LONG' ? 'CALM' : q.gammaRegime === 'SHORT' ? 'LOADED' : 'CALM');
    const squeezeScore = volatility.squeezeScore || q.squeezeScore || 0;
    const smaCross = sma.cross || 'NONE';
    const earningsLabel = earnings.daysLabel || '';
    const flipLevel = structure.gammaFlipLevel || 0;
    const flipDist = flipLevel > 0 && q.price > 0 ? ((q.price - flipLevel) / flipLevel * 100) : 0;
    const isAboveFlip = flipDist > 0;
    const atmIV = volatility.iv || structure.atmIV ? Math.round((volatility.iv || (structure.atmIV * 100)) || 0) : 0;
    const priceTarget = analyst.priceTarget?.targetConsensus || 0;
    const targetUpside = priceTarget > 0 && q.price > 0 ? ((priceTarget - q.price) / q.price * 100) : 0;

    // ═══ effectiveVol — 데스크탑 effectiveVol (L459-531) 동일: structure에서 regimeScore 재계산 ═══
    const effectiveVol = useMemo(() => {
        if (structure && structure.netGex != null) {
            const netGex = structure.netGex || 0;
            const isShortGamma = netGex < 0;
            const fLevel = structure.gammaFlipLevel || 0;
            const price = q.price || 0;
            const fDist = fLevel > 0 && price > 0 ? ((price - fLevel) / fLevel) * 100 : 0;
            let rs = 5;
            if (isShortGamma) rs += Math.min(30, Math.abs(netGex) / 1000000 * 3);
            else rs += Math.min(10, Math.abs(netGex) / 2000000 * 3);
            if (Math.abs(fDist) < 1) rs += 15;
            else if (Math.abs(fDist) < 3) rs += 10;
            else if (Math.abs(fDist) < 5) rs += 5;
            else if (Math.abs(fDist) < 10) rs += 2;
            const iv = structure.atmIV || 0;
            if (iv > 0.6) rs += 25;
            else if (iv > 0.4) rs += 15;
            else if (iv > 0.25) rs += 8;
            else if (iv > 0.15) rs += 4;
            rs = Math.min(100, Math.round(rs));
            const rg = rs >= 75 ? 'ERUPTING' : rs >= 50 ? 'LOADED' : rs >= 25 ? 'COILING' : 'CALM';
            const cachedIv = volatility.iv || 0;
            const derivedIv = iv ? Math.round(iv * 100) : 0;
            const finalIv = derivedIv > 0 ? derivedIv : cachedIv;
            if (derivedIv === 0 && cachedIv > 0) {
                let rs2 = 5;
                if (isShortGamma) rs2 += Math.min(30, Math.abs(netGex) / 1000000 * 3);
                else rs2 += Math.min(10, Math.abs(netGex) / 2000000 * 3);
                if (Math.abs(fDist) < 1) rs2 += 15;
                else if (Math.abs(fDist) < 3) rs2 += 10;
                else if (Math.abs(fDist) < 5) rs2 += 5;
                else if (Math.abs(fDist) < 10) rs2 += 2;
                if (cachedIv > 60) rs2 += 25;
                else if (cachedIv > 40) rs2 += 15;
                else if (cachedIv > 25) rs2 += 8;
                else if (cachedIv > 15) rs2 += 4;
                rs2 = Math.min(100, Math.round(rs2));
                if (rs2 > rs) {
                    const rg2 = rs2 >= 75 ? 'ERUPTING' : rs2 >= 50 ? 'LOADED' : rs2 >= 25 ? 'COILING' : 'CALM';
                    return { regimeScore: rs2, regime: rg2, gexLabel: isShortGamma ? 'SHORT' : 'LONG', iv: cachedIv, flipDistance: Math.round(fDist * 10) / 10, flipLevel: fLevel, isAboveFlip: fDist > 0 };
                }
            }
            return { regimeScore: rs, regime: rg, gexLabel: isShortGamma ? 'SHORT' : 'LONG', iv: finalIv, flipDistance: Math.round(fDist * 10) / 10, flipLevel: fLevel, isAboveFlip: fDist > 0 };
        }
        return volatility || null;
    }, [structure, q.price, volatility]);

    // ═══ CONVICTION — 데스크탑 calculateConviction() 완전 동일 (LiveTickerDashboard L272-312) ═══
    const conviction = useMemo(() => {
        let score = 50;
        if (smaCross === 'GOLDEN') score += 15;
        else if (smaCross === 'DEAD') score -= 15;
        const vwap = structure?.underlyingPrice || 0;
        const price = q.price || 0;
        if (vwap > 0 && price > 0) {
            const vwapDiff = ((price - vwap) / vwap) * 100;
            if (vwapDiff > 1) score += 8;
            else if (vwapDiff < -1) score -= 8;
        }
        const cPcr = structure?.pcRatio || 0;
        if (cPcr > 0 && cPcr < 0.7) score += 7;
        else if (cPcr > 1.2) score -= 7;
        const netGex = structure?.netGex || 0;
        if (netGex > 0) score += 5;
        else if (netGex < 0) score -= 5;
        const netPrem = q.netPremium || 0;
        if (netPrem > 500000) score += 5;
        else if (netPrem < -500000) score -= 5;
        score = Math.max(0, Math.min(100, score));
        let label = 'Neutral'; let grade = 'C';
        if (score >= 80) { label = 'Strong Bullish'; grade = 'A'; }
        else if (score >= 65) { label = 'Positive Bias'; grade = 'B+'; }
        else if (score >= 55) { label = 'Slight Bullish'; grade = 'B'; }
        else if (score >= 45) { label = 'Neutral'; grade = 'C'; }
        else if (score >= 35) { label = 'Slight Bearish'; grade = 'D'; }
        else if (score >= 20) { label = 'Bearish'; grade = 'D-'; }
        else { label = 'Strong Bearish'; grade = 'F'; }
        return { score, label, grade };
    }, [smaCross, structure?.underlyingPrice, q.price, structure?.pcRatio, structure?.netGex, q.netPremium]);

    return (
        <div className="space-y-4">

            {/* ═══ SIGNAL DASHBOARD — 9 Cards (2×4 + 1) ═══ */}
            <div>
                <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-0.5">Signal Dashboard</div>
                <div className="grid grid-cols-2 gap-2">
                    {/* [1-1] VOL REGIME */}
                    {(() => { const ev = effectiveVol || {} as any; const rg = ev.regime || regime; const rs = ev.regimeScore || volatility.regimeScore || 0; const evIv = ev.iv || atmIV; const evFlip = ev.flipLevel || flipLevel; const evFlipDist = ev.flipDistance ?? flipDist; const evAbove = ev.isAboveFlip ?? isAboveFlip; return (
                    <ProGate title="Vol Regime" mode="peek" compact>
                    <SignalCard label="VOL REGIME" value={`${rs} /100`}
                        badge={rg}
                        badgeColor={rg === 'ERUPTING' ? 'bg-rose-500/25 text-rose-400' : rg === 'LOADED' ? 'bg-amber-500/25 text-amber-400' : rg === 'COILING' ? 'bg-cyan-500/25 text-cyan-400' : 'bg-emerald-500/25 text-emerald-400'}
                        color={rg === 'ERUPTING' ? 'text-rose-400' : rg === 'LOADED' ? 'text-amber-400' : rg === 'COILING' ? 'text-cyan-400' : 'text-emerald-400'}
                        bg={rg === 'ERUPTING' ? 'bg-rose-950/40' : rg === 'LOADED' ? 'bg-amber-950/40' : 'bg-slate-800/40'}
                        border={rg === 'ERUPTING' ? 'border-rose-500/30' : rg === 'LOADED' ? 'border-amber-500/30' : 'border-slate-700/50'}
                        sub={`GEX:${ev.gexLabel || volatility.gexLabel || '—'}${evIv > 0 ? ` · IV ${evIv}%` : ''}${evFlip > 0 ? ` · Flip ${evAbove ? '↑' : '↓'}${Math.abs(evFlipDist).toFixed(1)}%` : ''}`} />
                    </ProGate>
                    ); })()}
                    {/* [1-2] CONVICTION */}
                    <ProGate title="Conviction" mode="peek" compact>
                    <SignalCard label="CONVICTION" value={`${conviction.score} /100`}
                        badge={conviction.grade}
                        badgeColor={conviction.score >= 60 ? 'bg-emerald-500/25 text-emerald-400' : conviction.score <= 40 ? 'bg-rose-500/25 text-rose-400' : 'bg-slate-500/25 text-slate-300'}
                        sub={`${conviction.label}${pcr > 0 ? ` · PCR:${pcr.toFixed(2)}` : ''}`}
                        color={conviction.score >= 60 ? 'text-emerald-400' : conviction.score <= 40 ? 'text-rose-400' : 'text-white'}
                        bg={conviction.score >= 60 ? 'bg-emerald-950/40' : conviction.score <= 40 ? 'bg-rose-950/40' : 'bg-slate-800/40'}
                        border={conviction.score >= 60 ? 'border-emerald-500/30' : conviction.score <= 40 ? 'border-rose-500/30' : 'border-slate-700/50'} />
                    </ProGate>
                    {/* [1-3] VWAP */}
                    {(() => { const vwap = structure.underlyingPrice || 0; const vwapDiff = vwap > 0 && q.price > 0 ? ((q.price - vwap) / vwap) * 100 : 0; return (
                    <SignalCard label="VWAP" value={vwap > 0 ? `$${vwap.toFixed(2)}` : '—'}
                        color={vwapDiff > 2 ? 'text-emerald-400' : vwapDiff < -2 ? 'text-rose-400' : 'text-white'}
                        bg={vwapDiff > 2 ? 'bg-emerald-950/40' : vwapDiff < -2 ? 'bg-rose-950/40' : 'bg-slate-800/40'}
                        border={vwapDiff > 2 ? 'border-emerald-500/30' : vwapDiff < -2 ? 'border-rose-500/30' : 'border-slate-700/50'}
                        sub={vwap > 0 ? `${vwapDiff > 0 ? '+' : ''}${vwapDiff.toFixed(1)}% deviation` : undefined} />
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
                        color={earnings.daysUntilEarnings <= 7 ? 'text-amber-400' : 'text-slate-300'}
                        bg={earnings.daysUntilEarnings <= 7 ? 'bg-amber-950/40' : 'bg-slate-800/40'}
                        border={earnings.daysUntilEarnings <= 7 ? 'border-amber-500/30' : 'border-slate-700/50'}
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
