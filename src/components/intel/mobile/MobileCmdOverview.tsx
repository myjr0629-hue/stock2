'use client';

// ============================================================================
// MobileCmdOverview — AI Overview Tab
// Contains: AI Deep Analysis + Related Peers + Company Overview
// Signal Dashboard + Analyst Consensus → moved to MobileCmdMetrics.tsx
// ZERO desktop impact — isolated in mobile/ directory
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { useLocale } from 'next-intl';
import { ChevronDown, Loader2, TrendingUp, BarChart3, Globe, Zap } from 'lucide-react';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { useRouter } from 'next/navigation';
import { ProGate } from '@/components/gate/FeatureGate';
import { useTranslations } from 'next-intl';
import { normalizeVwap } from '@/lib/vwap';
import { buildDeepSnapshot } from '@/lib/ai/deepSnapshot';
import { deepMaterialIssues } from '@/lib/ai/deepTrust';
import { mergeRelatedRow, relatedLivePrevClose, relatedSessionContext } from '@/lib/relatedRowMerge';

interface Props {
    ticker: string;
    quote: IntelQuote;
    unified: any;
    /** 공용 판본 선택으로 고른 변동성 입력. 생략(undefined)이면 unified 를 그대로 쓴다. */
    volatilityData?: { structure: any; volatility: any } | null;
    /** 그 판본의 원천 시각·이월 여부 — AI 재료에 원천 날짜로 남긴다. */
    volatilitySource?: { sourceAsOf: string | null; carried?: boolean } | null;
    unifiedLoading: boolean;
    vwap?: number | null;
    /** 카드와 같은 선택 결과(useMobileConvictionSnapshot) — AI 확신도 = 카드 확신도. */
    convictionInputs?: import('@/lib/commandConviction').ConvictionInputs;
    convictionSourceDates?: Partial<Record<string, string | null>>;
    convictionCarried?: readonly string[];
}

const LOGO = (t: string) => `https://assets.parqet.com/logos/symbol/${t}?format=png`;

// Trilingual text extraction
type Tri = string | { ko?: string; en?: string; ja?: string };
function tl(val: Tri | undefined, locale: string): string {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return (val as any)[locale] || val.en || val.ko || '';
}

// ── Section icon ──
function sectionIcon(title: string) {
    const t = title.toLowerCase();
    if (t.includes('기술') || t.includes('technical') || t.includes('技術')) return <TrendingUp size={11} className="text-cyan-400" />;
    if (t.includes('옵션') || t.includes('option') || t.includes('オプション')) return <BarChart3 size={11} className="text-indigo-400" />;
    if (t.includes('뉴스') || t.includes('news') || t.includes('ニュース')) return <Globe size={11} className="text-amber-400" />;
    return <Zap size={11} className="text-slate-400" />;
}

export function MobileCmdOverview({ ticker, quote, unified, volatilityData, volatilitySource, unifiedLoading, vwap: sourceVwap, convictionInputs, convictionSourceDates, convictionCarried }: Props) {
    const locale = useLocale();
    const tg = useTranslations('gate');
    const q = quote;
    const vwap = normalizeVwap(sourceVwap);

    // ═══ AI DEEP ANALYSIS ═══
    const [aiData, setAiData] = useState<any>(null);
    const [aiLoading, setAiLoading] = useState(true);
    const [openSections, setOpenSections] = useState<Set<number>>(new Set());
    const abortRef = useRef<AbortController | null>(null);

    // Build snapshot for deep-analysis API
    const buildSnapshot = useCallback(() => {
        return { ...buildDeepSnapshot({
            ticker, price: q.price, priceChange: q.changePct, session: q.session || 'CLOSED',
            unified, volatilityData, volatilitySource, convictionInputs, convictionSourceDates, convictionCarried,
            rawTickerData: { vwap, flow: { netPremium: q.netPremium } },
            insider: null, technicals: null, creditSpread: null,
        }), trustLayer: 0 };
    }, [ticker, unified, volatilityData, volatilitySource, convictionInputs, convictionSourceDates, convictionCarried, q, vwap]);
    const snapshot = useMemo(() => buildSnapshot(), [buildSnapshot]);
    const materialReady = deepMaterialIssues(snapshot).ok;
    const aiAttempt = useRef<{ key: string; withMaterial: boolean } | null>(null);

    // [GEX→AI] Fetch GEX history stats for AI Deep Analysis
    const [gexStatsForMobile, setGexStatsForMobile] = useState<any>(null);
    useEffect(() => {
        if (!ticker) return;
        fetch(`/api/history?type=gex&ticker=${ticker}&days=30`)
            .then(r => r.json())
            .then(res => {
                const raw = res.data || [];
                if (raw.length < 2) return;
                const dayMap = new Map<string, any[]>();
                raw.forEach((d: any) => {
                    const dt = new Date(d.timestamp);
                    const et = new Date(dt.toLocaleString('en-US', { timeZone: 'America/New_York' }));
                    if (et.getDay() === 0 || et.getDay() === 6) return;
                    const tm = et.getHours() * 60 + et.getMinutes();
                    if (tm < 570 || tm > 960) return;
                    const k = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`;
                    if (!dayMap.has(k)) dayMap.set(k, []);
                    dayMap.get(k)!.push(d);
                });
                const cd = [...dayMap.keys()].sort().map(k => dayMap.get(k)!.at(-1)!);
                if (cd.length < 2) return;
                const latest = cd[cd.length - 1];
                const vals = cd.map((d: any) => d.gex);
                const sorted = [...vals].sort((a: number, b: number) => a - b);
                const pctIdx = sorted.findIndex((v: number) => v >= latest.gex);
                const pct = Math.round((pctIdx / sorted.length) * 100);
                let streak = 0;
                for (let i = cd.length - 1; i >= 0; i--) { if (cd[i].gammaRegime === latest.gammaRegime) streak++; else break; }
                const sDays = new Set(cd.slice(cd.length - streak).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size;
                const durs: number[] = []; let rs2 = 0;
                for (let i = 1; i < cd.length; i++) {
                    if (cd[i].gammaRegime !== cd[rs2].gammaRegime) {
                        if (cd[rs2].gammaRegime === latest.gammaRegime) durs.push(new Set(cd.slice(rs2, i).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size);
                        rs2 = i;
                    }
                }
                if (cd[rs2].gammaRegime === latest.gammaRegime) durs.push(new Set(cd.slice(rs2).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size);
                const avg = durs.length > 0 ? parseFloat((durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1)) : 0;
                let cwR = 0, cwT = 0, cwSR = 0, cwST = 0;
                cd.forEach((d: any) => { if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) { cwT++; if (d.price < d.callWall) cwR++; } });
                for (let i = cd.length - 1; i >= Math.max(0, cd.length - streak); i--) { const d = cd[i]; if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) { cwST++; if (d.price < d.callWall) cwSR++; } }
                const flips: any[] = [];
                for (let i = 1; i < cd.length; i++) { if (cd[i].gammaRegime !== cd[i-1].gammaRegime && cd[i-1].gammaRegime) flips.push({ from: cd[i-1].gammaRegime, to: cd[i].gammaRegime, timestamp: cd[i].timestamp, price: cd[i].price }); }
                setGexStatsForMobile({
                    percentile: pct, streakDays: sDays, streakMultiple: avg > 0 ? parseFloat((sDays / avg).toFixed(1)) : 0,
                    avgRegimeDuration: avg, callWallAccuracy: cwT > 0 ? Math.round((cwR / cwT) * 100) : null,
                    cwStreakAccuracy: cwST > 0 ? Math.round((cwSR / cwST) * 100) : null,
                    flipEvents: flips, latestRegime: latest.gammaRegime,
                    totalDays: new Set(cd.map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size,
                });
            })
            .catch(() => {});
    }, [ticker]);

    // Cancel only on ticker/locale changes or unmount, not on quote updates.
    useEffect(() => () => {
        abortRef.current?.abort();
        aiAttempt.current = null;
    }, [ticker, locale]);

    useEffect(() => {
        const key = `${ticker}:${locale}`;
        const previous = aiAttempt.current;
        // One cache probe, then at most one request when actual material arrives.
        // A changing quote/snapshot must not repeatedly invoke generation.
        if (previous?.key === key && (previous.withMaterial || !materialReady)) return;
        aiAttempt.current = { key, withMaterial: materialReady };
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        if (previous?.key !== key) setAiData(null);
        setAiLoading(true);

        fetch('/api/command/deep-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, locale, snapshot, triggerReason: 'FIRST_VIEW', gexStats: gexStatsForMobile }),
            signal: controller.signal,
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data && !controller.signal.aborted) setAiData(data); })
            .catch(() => {})
            .finally(() => { if (!controller.signal.aborted) setAiLoading(false); });
    }, [ticker, locale, materialReady]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleSection = (i: number) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });
    };

    // Verdict from AI
    const currentState = tl(aiData?.currentState, locale);
    const verdictParts = currentState?.split('—') || [];
    const verdictLabel = verdictParts[0]?.trim() || 'NEUTRAL';
    const verdictDesc = verdictParts.slice(1).join('—').trim() || '';
    const verdictColor = verdictLabel.includes('BULL') ? '#10b981' : verdictLabel.includes('BEAR') ? '#f43f5e' : '#f59e0b';

    // Related peers — 웹 동일: /api/live/related에서 price/change/prevClose 포함 데이터 fetch (L200-215)
    const [relatedData, setRelatedData] = useState<any[]>([]);
    useEffect(() => {
        if (!ticker) return;
        let isMounted = true;
        fetch(`/api/live/related?t=${ticker}`)
            .then(res => res.json())
            .then(data => {
                if (isMounted && data?.topRelated) {
                    setRelatedData(prev => data.topRelated.map((newItem: any) =>
                        mergeRelatedRow(prev.find((r: any) => r.ticker === newItem.ticker), newItem, Date.now())));
                }
            })
            .catch(() => {});
        return () => { isMounted = false; };
    }, [ticker]);
    // 이미 30초마다 받는 unified 의 연관 행(서버가 장외엔 공식 종가로 맞춤)을 같은 병합으로 합친다 — 세션 전환 뒤 갱신, 요청 추가 0.
    //   목록은 직접 API 그대로, 같은 종목의 값만 갱신한다.
    const unifiedRelatedRows = unified?.related?.topRelated;
    useEffect(() => {
        if (!Array.isArray(unifiedRelatedRows) || unifiedRelatedRows.length === 0) return;
        setRelatedData(prev => {
            if (prev.length === 0) return prev;
            let changed = false;
            const next = prev.map((oldItem: any) => {
                const newItem = unifiedRelatedRows.find((r: any) => r?.ticker === oldItem.ticker);
                if (!newItem) return oldItem;
                const merged = mergeRelatedRow(oldItem, newItem, Date.now());
                if (merged.price !== oldItem.price || merged.change !== oldItem.change || merged.prevClose !== oldItem.prevClose
                    || merged.closeSession !== oldItem.closeSession || merged.session !== oldItem.session || merged.asOf !== oldItem.asOf) changed = true;
                return merged;
            });
            return changed ? next : prev;
        });
    }, [unifiedRelatedRows]);

    return (
        <div className="space-y-4">

            {/* ═══ AI DEEP ANALYSIS ═══ */}
            <ProGate title="AI Deep Analysis" mode="blur" fomoMessage="AI Deep Technical · Options Positioning · News & Market Context" fomoTagline={tg('taglineAIDeep')} description={tg('descAiDeep')}>
            <div className="rounded-2xl border border-amber-500/30 overflow-hidden relative"
                style={{ background: 'linear-gradient(180deg, rgba(8,12,21,0.95), rgba(13,17,25,0.98))', boxShadow: '0 0 20px rgba(245,158,11,0.12)' }}>

                {/* Header */}
                <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center gap-2"
                    style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.06), transparent)' }}>
                    <img src="/signum-sg-vectorized.svg" alt="AI" width={14} height={14}
                        style={{ filter: 'drop-shadow(0 0 3px rgba(245,158,11,0.35))' }} />
                    <span className="text-[11px] font-black text-white uppercase tracking-[0.12em]">AI Deep Analysis</span>
                    <span className="text-[9px] bg-cyan-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold">CLAUDE</span>
                    <div className="flex-1" />
                    {aiLoading && <Loader2 size={12} className="text-cyan-400 animate-spin" />}
                </div>

                {/* Loading */}
                {aiLoading && !aiData && (
                    <div className="p-6 flex flex-col items-center gap-2">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 flex items-center justify-center">
                                <img src="/signum-sg-vectorized.svg" alt="" width={18} height={18} style={{ filter: 'drop-shadow(0 0 3px rgba(6,182,212,0.4))' }} />
                            </div>
                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" style={{ animationDuration: '2s' }} />
                        </div>
                        <p className="text-[12px] text-cyan-300 font-bold tracking-wider">
                            {locale === 'ko' ? 'AI 심층 분석 중...' : locale === 'ja' ? 'AI深層分析中...' : 'AI Deep Analysis...'}
                        </p>
                    </div>
                )}

                {/* Verdict + Sections */}
                {aiData && (
                    <div>
                        {/* Verdict Banner */}
                        <div className="relative">
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r" style={{ background: verdictColor }} />
                            <div className="pl-4 pr-4 py-3" style={{ background: `linear-gradient(90deg, ${verdictColor}10, transparent)` }}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: verdictColor }}>{verdictLabel}</span>
                                    {verdictDesc && <>
                                        <span className="text-[11px] text-slate-400">—</span>
                                        <span className="text-[11px] text-slate-300 font-semibold">{verdictDesc}</span>
                                    </>}
                                </div>
                                {tl(aiData.keyInsight, locale) && (
                                    <div className="mt-1.5 px-2.5 py-2 rounded-lg border border-cyan-500/15" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(99,102,241,0.06))' }}>
                                        <p className="text-[12px] text-slate-300 leading-relaxed">{tl(aiData.keyInsight, locale)}</p>
                                    </div>
                                )}
                                {/* Risk + Confidence */}
                                <div className="flex items-center gap-2 mt-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold
                                        ${aiData.riskFlag === 'HIGH' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                                            aiData.riskFlag === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                                'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'}`}>
                                        RISK: {aiData.riskFlag}
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                        {[1, 2, 3].map(d => (
                                            <div key={d} className={`w-1.5 h-1.5 rounded-full ${d <= (aiData.confidence === 'HIGH' ? 3 : aiData.confidence === 'MEDIUM' ? 2 : 1) ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Accordion Sections */}
                        {aiData.sections?.map((sec: any, i: number) => {
                            const isOpen = openSections.has(i);
                            return (
                                <div key={i} className="border-t border-white/[0.04]">
                                    <button onClick={() => toggleSection(i)} className="w-full flex items-center justify-between px-4 py-2.5 active:bg-white/[0.03]">
                                        <div className="flex items-center gap-2">
                                            {sectionIcon(tl(sec.title, locale))}
                                            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{tl(sec.title, locale)}</span>
                                        </div>
                                        <ChevronDown size={13} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: isOpen ? '500px' : '0px', opacity: isOpen ? 1 : 0 }}>
                                        <div className="px-4 pb-3">
                                            <p className="text-[12px] text-slate-300 leading-[1.8]">{tl(sec.content, locale)}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            </ProGate>

            {/* ═══ RELATED PEERS ═══ */}
            {relatedData.length > 0 && (
                <RelatedPeersLive tickers={relatedData.slice(0, 4)} currentPrice={q.price} />
            )}

            {/* ═══ COMPANY OVERVIEW ═══ */}
            {(() => {
                const overview = unified?.overview?.overview || {};
                const desc = locale === 'ko' ? overview.description : locale === 'ja' ? (overview.descriptionJA || overview.descriptionEN) : overview.descriptionEN;
                return desc ? (
                    <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-4">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Company Overview</div>
                        <p className="text-[12px] text-slate-300 leading-relaxed">{desc}</p>
                    </div>
                ) : null;
            })()}
        </div>
    );
}

// ── Related Peers with LIVE prices — same WebSocket as desktop ──
function RelatedPeersLive({ tickers, currentPrice }: { tickers: any[]; currentPrice: number }) {
    const peerTickers = useMemo(() => tickers.map((r: any) => r.ticker), [tickers]);
    const { getPrice: wsGetPrice } = useRealtimeData(peerTickers);
    // 정규장 판정은 달력(렌더 시각) — 부모 세션 문자열('REG'/'reg'·SSR 고정값)에 기대지 않는다(관문 10261523). 틱마다 재렌더되어 PRE→REG 전환도 따라간다.
    const isRegularSession = relatedSessionContext(Date.now()).regular;
    const router = useRouter();

    return (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-4">
            <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-3">Related Peers</div>
            <div className="space-y-2.5">
                {tickers.map((r: any) => {
                    const wsPrice = isRegularSession ? wsGetPrice(r.ticker) : undefined;
                    const serverPrice = r.price || 0;
                    const displayPrice = wsPrice?.price && wsPrice.price > 0 ? wsPrice.price : serverPrice;
                    let displayChange = r.change ?? 0;
                    const validWsPrice = wsPrice?.price || 0;
                    const validPrevClose = relatedLivePrevClose(r, Date.now());
                    if (validWsPrice > 0 && validPrevClose > 0) {
                        displayChange = Number((((validWsPrice - validPrevClose) / validPrevClose) * 100).toFixed(2));
                    } else {
                        const wsChangePct = wsPrice?.changePct;
                        if (wsChangePct !== undefined && Math.abs(wsChangePct) > 0 && Math.abs(wsChangePct) < 20) {
                            displayChange = Number(wsChangePct.toFixed(2));
                        }
                    }
                    return (
                        <button
                            key={r.ticker}
                            onClick={() => router.push(`/ticker?ticker=${r.ticker}`)}
                            className="flex items-center gap-3 py-1 w-full text-left active:bg-white/[0.04] rounded-lg transition-colors touch-manipulation"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <div className="w-8 h-8 rounded-lg bg-black border border-white/10 overflow-hidden relative flex items-center justify-center shrink-0">
                                <span className="text-[9px] font-bold text-white/30 absolute">{r.ticker?.slice(0, 2)}</span>
                                <img src={LOGO(r.ticker)} alt="" className="w-full h-full object-cover absolute inset-0 rounded-lg"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                            <span className="text-[14px] font-bold text-white flex-1">{r.ticker}</span>
                            <span className="text-[14px] font-mono text-slate-300 font-medium tabular-nums">
                                {displayPrice > 0 ? `$${displayPrice < 10 ? displayPrice.toFixed(2) : displayPrice < 1000 ? displayPrice.toFixed(1) : Math.round(displayPrice)}` : '—'}
                            </span>
                            <span className={`text-[13px] font-bold font-mono tabular-nums min-w-[56px] text-right px-1 py-px rounded bg-slate-900/40 ${displayChange > 0 ? 'text-emerald-400' : displayChange < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                {displayPrice > 0 ? `${displayChange > 0 ? '+' : ''}${displayChange.toFixed(2)}%` : '—'}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
