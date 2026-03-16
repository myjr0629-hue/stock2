"use client";

// [PERF] SSR Card Preview — renders 10 indicator cards instantly in HTML
// before LiveTickerDashboard JS bundle loads. Zero dependencies on hooks.
// This component is SSR-rendered by Next.js (client components DO SSR).
// Once LiveTickerDashboard mounts, the parent hides this preview.

import React from 'react';

interface CommandSSRCardsProps {
    data: any;        // initialUnifiedData from page.tsx SSR prefetch
    stockData: any;   // initialStockData (for VWAP/price)
    ticker: string;
}

// Shared card shell — matches LiveTickerDashboard's card styling exactly
function CardShell({ children, bg }: { children: React.ReactNode; bg?: string }) {
    return (
        <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default ${bg || 'bg-slate-800/40 border-slate-700/50'}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
}

function CardHeader({ icon, title, badge, badgeColor }: { icon: string; title: string; badge?: string; badgeColor?: string }) {
    return (
        <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
                <span className="text-[13px]">{icon}</span>
                <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">{title}</span>
            </div>
            {badge && (
                <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta ${badgeColor || 'bg-slate-700/30 text-white'}`}>
                    {badge}
                </span>
            )}
        </div>
    );
}

function MetricRow({ value, suffix, desc, color }: { value: string; suffix?: string; desc?: string; color?: string }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <span className={`text-[20px] font-black tabular-nums leading-none ${color || 'text-white'}`}>{value}</span>
            {suffix && <span className="text-[14px] font-jakarta text-white font-bold">{suffix}</span>}
            {desc && <span className="text-[12px] font-jakarta text-white ml-0.5">{desc}</span>}
        </div>
    );
}

export function CommandSSRCards({ data, stockData, ticker }: CommandSSRCardsProps) {
    if (!data) return null;

    const vol = data.volatility;
    const sma = data.sma;
    const earnings = data.earnings;
    const analyst = data.analyst;
    const squeeze = data.squeeze;
    const inst = data.institutional;
    const fund = data.fundamentals;
    const related = data.related;
    const structure = data.structure;
    const price = data._dynamoPrice?.price || stockData?.price || 0;

    // Volatility Regime
    const volRegime: string = vol?.regime || (vol?.gammaRegime === 'NEGATIVE' ? 'LOADED' : 'STABLE');
    const volScore = vol?.regimeScore ?? '--';
    const volColor = volRegime === 'ERUPTING' ? 'text-rose-400' : volRegime === 'LOADED' ? 'text-amber-400' : 'text-emerald-400';
    const volBg = volRegime === 'ERUPTING' ? 'bg-rose-950/40 border-rose-500/30' : volRegime === 'LOADED' ? 'bg-amber-950/40 border-amber-500/30' : 'bg-slate-800/40 border-slate-700/50';

    // SMA / Trend Phase
    const smaLabel = sma?.cross === 'GOLDEN' ? 'GOLDEN' : sma?.cross === 'DEAD' ? 'DEAD' : sma?.label || '--';
    const smaColor = sma?.cross === 'GOLDEN' ? 'text-emerald-400' : sma?.cross === 'DEAD' ? 'text-rose-400' : 'text-white';
    const smaBg = sma?.cross === 'GOLDEN' ? 'bg-emerald-950/40 border-emerald-500/30' : sma?.cross === 'DEAD' ? 'bg-rose-950/40 border-rose-500/30' : 'bg-slate-800/40 border-slate-700/50';

    // Analyst
    const bd = analyst?.breakdown;
    const totalAnalysts = analyst?.totalAnalysts || 0;
    const buyCount = bd ? (bd.strongBuy || 0) + (bd.buy || 0) : 0;
    const buyPct = totalAnalysts > 0 ? Math.round((buyCount / totalAnalysts) * 100) : 0;
    const isBullAnalyst = analyst?.consensus === 'STRONG BUY' || analyst?.consensus === 'BUY';
    const analystBg = isBullAnalyst ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-slate-800/40 border-slate-700/50';

    // VWAP
    const vwap = stockData?.vwap || data._dynamoPrice?.vwap || 0;
    const vwapDiff = vwap > 0 && price > 0 ? ((price - vwap) / vwap) * 100 : 0;

    // Squeeze
    const sqScore = squeeze?.score ?? squeeze?.siPercent ?? null;
    const sqStatus = squeeze?.status || (sqScore && sqScore > 40 ? 'HIGH' : sqScore && sqScore > 20 ? 'MEDIUM' : 'LOW');
    const sqColor = sqStatus === 'CRITICAL' ? 'text-rose-400' : sqStatus === 'HIGH' ? 'text-amber-400' : 'text-emerald-400';

    // Institutional
    const dp = inst?.darkPool?.percent || (inst?.compositeScore ? inst.compositeScore : 0);
    const instLabel = dp > 40 ? 'ACCUMULATION' : dp < 20 ? 'DISTRIBUTION' : 'NEUTRAL';
    const instColor = instLabel === 'ACCUMULATION' ? 'text-emerald-400' : instLabel === 'DISTRIBUTION' ? 'text-rose-400' : 'text-slate-400';

    // Fundamentals
    const fundGrade = fund?.grade || '--';
    const fundScore = fund?.score ?? '--';
    const fundColor = fundGrade?.startsWith?.('A') ? 'text-emerald-400' : fundGrade?.startsWith?.('B') ? 'text-cyan-400' : 'text-amber-400';

    // Earnings
    const earningsDays = earnings?.daysLabel || '--';
    const earningsDate = earnings?.nextEarningsDate || earnings?.nextDate || null;

    // Related
    const relatedCount = related?.relatedTickers?.length || related?.count || 0;

    return (
        <div className="relative -mt-4 mb-3" id="ssr-card-preview">
            <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 30%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(16,185,129,0.06) 0%, transparent 50%)' }} />
            <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1.5">
                {/* ROW 1 */}

                {/* 1-1: VOL REGIME */}
                <CardShell bg={volBg}>
                    <CardHeader icon="⚡" title="VOL REGIME" badge={volRegime} badgeColor={`${volRegime === 'ERUPTING' ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${volColor}`} />
                    <MetricRow value={String(volScore)} suffix="/100" color={volColor} />
                    <div className="flex gap-3 mt-1 text-[12px] font-jakarta tabular-nums">
                        <span className="text-white/80">GEX <span className={`font-bold ${vol?.gexLabel === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>{vol?.gexLabel || (structure?.netGex && structure.netGex < 0 ? 'SHORT' : 'LONG')}</span></span>
                        <span className="text-white/80">IV <span className="font-bold text-white">{vol?.iv || '--'}%</span></span>
                    </div>
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">GEX·IV·Gamma Flip·Squeeze</span></div>
                </CardShell>

                {/* 1-2: CONVICTION — computed client-side, show loading */}
                <CardShell>
                    <CardHeader icon="🎯" title="CONVICTION" badge="..." />
                    <MetricRow value="--" suffix="/100" color="text-white/40" />
                    <div className="text-[12px] text-slate-300 font-jakarta mt-0.5">Calculating...</div>
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">SMA·GEX·PCR·News·VWAP</span></div>
                </CardShell>

                {/* 1-3: VWAP */}
                <CardShell bg={vwapDiff > 2 ? 'bg-emerald-950/40 border-emerald-500/30' : vwapDiff < -2 ? 'bg-rose-950/40 border-rose-500/30' : 'bg-slate-800/40 border-slate-700/50'}>
                    <CardHeader icon="📊" title="VWAP"
                        badge={vwap > 0 ? `${vwapDiff > 0 ? '+' : ''}${vwapDiff.toFixed(1)}%` : '--'}
                        badgeColor={`${vwapDiff > 0 ? 'bg-emerald-500/20 text-emerald-400' : vwapDiff < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/30 text-white'}`}
                    />
                    <MetricRow value={vwap > 0 ? `$${vwap.toFixed(2)}` : '--'} color={vwapDiff > 0 ? 'text-emerald-400' : vwapDiff < 0 ? 'text-rose-400' : 'text-white'} />
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">Volume Weighted Avg Price</span></div>
                </CardShell>

                {/* 1-4: SHORT SQUEEZE */}
                <CardShell bg={sqStatus === 'CRITICAL' ? 'bg-rose-950/40 border-rose-500/30' : sqStatus === 'HIGH' ? 'bg-amber-950/40 border-amber-500/30' : 'bg-slate-800/40 border-slate-700/50'}>
                    <CardHeader icon="🛡️" title="SHORT SQUEEZE" badge={sqStatus} badgeColor={`${sqStatus === 'CRITICAL' ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${sqColor}`} />
                    <MetricRow value={sqScore !== null ? `${typeof sqScore === 'number' ? sqScore.toFixed(1) : sqScore}%` : '--'} suffix="SI%" color={sqColor} />
                    <div className="flex gap-3 mt-0.5 text-[12px] font-jakarta tabular-nums">
                        <span className="text-white/80">DTC <span className="font-bold text-white">{squeeze?.daysToCover?.toFixed(1) ?? '--'}</span></span>
                    </div>
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">SI%·DTC·Short Vol</span></div>
                </CardShell>

                {/* 1-5: ANALYST TARGET */}
                <CardShell bg={analystBg}>
                    <CardHeader icon="🔍" title="ANALYST TARGET" badge={analyst?.consensus || '...'} badgeColor={isBullAnalyst ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/30 text-slate-300'} />
                    <MetricRow value={`${buyPct}%`} suffix="Buy" color={isBullAnalyst ? 'text-emerald-400' : 'text-white'} desc={totalAnalysts > 0 ? `${totalAnalysts} analysts` : ''} />
                    {bd && totalAnalysts > 0 && (
                        <div className="flex h-1 rounded-full overflow-hidden bg-slate-800/40 mt-1">
                            <div className="bg-emerald-500" style={{ width: `${((bd.strongBuy || 0) / totalAnalysts) * 100}%` }} />
                            <div className="bg-emerald-400/60" style={{ width: `${((bd.buy || 0) / totalAnalysts) * 100}%` }} />
                            <div className="bg-slate-500/80" style={{ width: `${((bd.hold || 0) / totalAnalysts) * 100}%` }} />
                            <div className="bg-rose-400/60" style={{ width: `${((bd.sell || 0) / totalAnalysts) * 100}%` }} />
                            <div className="bg-rose-500" style={{ width: `${((bd.strongSell || 0) / totalAnalysts) * 100}%` }} />
                        </div>
                    )}
                </CardShell>

                {/* ROW 2 */}

                {/* 2-1: INST RADAR */}
                <CardShell bg={instLabel === 'ACCUMULATION' ? 'bg-emerald-950/40 border-emerald-500/30' : instLabel === 'DISTRIBUTION' ? 'bg-rose-950/40 border-rose-500/30' : 'bg-slate-800/40 border-slate-700/50'}>
                    <CardHeader icon="📡" title="INST RADAR" badge={instLabel} badgeColor={`${instLabel === 'ACCUMULATION' ? 'bg-emerald-500/20' : instLabel === 'DISTRIBUTION' ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${instColor}`} />
                    <MetricRow value={`${(typeof dp === 'number' ? dp : 0).toFixed(1)}%`} suffix="D.Pool" color={dp > 35 ? 'text-indigo-400' : 'text-white/80'} />
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">DP·Block·Short Vol</span></div>
                </CardShell>

                {/* 2-2: TREND PHASE */}
                <CardShell bg={smaBg}>
                    <CardHeader icon="📈" title="TREND PHASE" badge={sma?.crossType === 'NEW' ? 'NEW!' : undefined} badgeColor="bg-amber-500/30 text-amber-300" />
                    <div className="flex items-baseline gap-2">
                        <span className={`text-lg font-black leading-none ${smaColor}`}>{smaLabel}</span>
                    </div>
                    {sma?.distance !== undefined && sma.distance !== null && (
                        <div className={`text-[12px] font-jakarta font-bold mt-0.5 ${sma.distance > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            SMA Gap {sma.distance > 0 ? '+' : ''}{sma.distance}%
                            {sma.isImminent && <span className="ml-1 text-amber-400">⚡</span>}
                        </div>
                    )}
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">SMA 50/200 Cross</span></div>
                </CardShell>

                {/* 2-3: FUNDAMENTAL */}
                <CardShell bg={fundGrade?.startsWith?.('A') ? 'bg-emerald-950/40 border-emerald-500/30' : fundGrade?.startsWith?.('B') ? 'bg-cyan-950/40 border-cyan-500/30' : 'bg-slate-800/40 border-slate-700/50'}>
                    <CardHeader icon="🛡️" title="FUNDAMENTAL" badge={fund ? fundGrade : '...'} badgeColor={`bg-slate-700/30 ${fund ? fundColor : 'text-slate-400'}`} />
                    {fund?.score ? (
                        <MetricRow value={String(fundScore)} suffix="/100" color={fundColor} />
                    ) : (
                        <span className="text-sm font-bold text-white/40 leading-none">Collecting...</span>
                    )}
                    <div className="flex flex-wrap gap-x-2 mt-1 text-[12px] font-jakarta tabular-nums">
                        {fund?.pe != null && <span className="text-white/80">PE <span className="font-bold text-white">{fund.pe}</span></span>}
                        {fund?.roe != null && <span className="text-white/80">ROE <span className="font-bold text-white">{fund.roe}%</span></span>}
                    </div>
                </CardShell>

                {/* 2-4: EARNINGS */}
                <CardShell bg={earnings && (earnings.daysUntilEarnings ?? earnings.daysUntil) !== undefined && (earnings.daysUntilEarnings ?? earnings.daysUntil) <= 3 ? 'bg-rose-950/40 border-rose-500/30' : 'bg-slate-800/40 border-slate-700/50'}>
                    <CardHeader icon="📅" title="EARNINGS" badge={earningsDays} badgeColor={`bg-slate-700/30 ${earnings && (earnings.daysUntilEarnings ?? earnings.daysUntil) !== undefined && (earnings.daysUntilEarnings ?? earnings.daysUntil) <= 7 ? 'text-amber-400' : 'text-slate-300'}`} />
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-black leading-none text-white">
                            {earningsDate ? new Date(earningsDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}
                        </span>
                    </div>
                    {earnings?.quarter && (
                        <div className="text-[12px] font-jakarta text-slate-300 mt-0.5">
                            Q{earnings.quarter} {earnings.year || ''} {earnings.hourLabel || ''}
                        </div>
                    )}
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">Next Earnings Report</span></div>
                </CardShell>

                {/* 2-5: RELATED */}
                <CardShell>
                    <CardHeader icon="🔗" title="RELATED" badge={relatedCount > 0 ? `${relatedCount}` : '--'} badgeColor="bg-slate-700/30 text-slate-300" />
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-black leading-none text-white">
                            {relatedCount > 0 ? `${relatedCount} tickers` : '--'}
                        </span>
                    </div>
                    {related?.relatedTickers && related.relatedTickers.length > 0 && (
                        <div className="text-[12px] font-jakarta text-slate-300 mt-0.5 truncate">
                            {(Array.isArray(related.relatedTickers)
                                ? related.relatedTickers.map((r: any) => typeof r === 'string' ? r : r.ticker).slice(0, 5).join(', ')
                                : '--'
                            )}
                        </div>
                    )}
                    <div className="mt-0.5"><span className="text-[12px] text-slate-300 font-jakarta">Correlated Stocks</span></div>
                </CardShell>
            </div>
        </div>
    );
}
