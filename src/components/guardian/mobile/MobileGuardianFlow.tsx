'use client';

// ============================================================================
// MobileGuardianFlow — Tab 4: SmartMoneyMap + Sector Intel + Calendar
// Data: Identical to desktop page.tsx L520-1123
// ============================================================================

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';
import { ProGate } from '@/components/gate/FeatureGate';
import { GuardianTooltip } from '@/components/guardian/GuardianTooltip';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { Link } from '@/i18n/routing';
import { Activity, AlertTriangle, Layers, Lock, ArrowRight } from 'lucide-react';

const SmartMoneyMap = dynamic(() => import('@/components/guardian/SmartMoneyMap'), { ssr: false });

// Sector name i18n — identical to desktop page.tsx L194-214
type SectorLocale = 'ko' | 'en' | 'ja';
const SECTOR_NAME_I18N: Record<string, Record<SectorLocale, string>> = {
    '기술주': { ko: '기술주', en: 'Technology', ja: 'テクノロジー' },
    '커뮤니케이션': { ko: '커뮤니케이션', en: 'Communication', ja: 'コミュニケーション' },
    '임의소비재': { ko: '임의소비재', en: 'Cons. Disc.', ja: '一般消費財' },
    '에너지': { ko: '에너지', en: 'Energy', ja: 'エネルギー' },
    '금융': { ko: '금융', en: 'Financials', ja: '金融' },
    '헬스케어': { ko: '헬스케어', en: 'Healthcare', ja: 'ヘルスケア' },
    '산업재': { ko: '산업재', en: 'Industrials', ja: '資本財' },
    '소재': { ko: '소재', en: 'Materials', ja: '素材' },
    '필수소비재': { ko: '필수소비재', en: 'Cons. Staples', ja: '生活必需品' },
    '부동산': { ko: '부동산', en: 'Real Estate', ja: '不動産' },
    '유틸리티': { ko: '유틸리티', en: 'Utilities', ja: 'ユーティリティ' },
    'AI 전력망': { ko: 'AI 전력망', en: 'AI Power Grid', ja: 'AI電力網' },
    '반도체': { ko: '반도체', en: 'Semiconductors', ja: '半導体' },
    '사이버보안': { ko: '사이버보안', en: 'Cyber Security', ja: 'サイバーセキュリティ' },
    '클린에너지': { ko: '클린에너지', en: 'Clean Energy', ja: 'クリーンエネルギー' },
    '안전자산': { ko: '안전자산', en: 'Safe Haven', ja: '安全資産' },
};
function getSectorName(name: string, locale: string): string {
    return SECTOR_NAME_I18N[name]?.[(locale as SectorLocale) || 'ko'] || name;
}

// Sector intel texts — identical to desktop page.tsx L157-191
const SECTOR_INTEL_TEXTS: Record<SectorLocale, {
    trendAnalysis: string; volumeIntensity: string; trendConsistency: string;
    rvolSurging: string; rvolActive: string; rvolNormal: string; rvolLow: string;
    consistencyStrong: string; consistencyMixed: string; consistencyUnstable: string;
    noiseBounce: (todayChange: number, cumReturn: number) => string;
}> = {
    ko: {
        trendAnalysis: '5일 추세 분석', volumeIntensity: '거래량 강도', trendConsistency: '추세 일관성',
        rvolSurging: '급증', rvolActive: '활발', rvolNormal: '보통', rvolLow: '저조',
        consistencyStrong: '강한 추세', consistencyMixed: '혼조', consistencyUnstable: '불안정',
        noiseBounce: (today, cum) => `노이즈 반등 — 오늘 ${today > 0 ? '+' : ''}${today.toFixed(1)}% 이나 5일간 ${cum > 0 ? '+' : ''}${cum.toFixed(1)}% 추세`
    },
    en: {
        trendAnalysis: '5-Day Trend Analysis', volumeIntensity: 'Volume Intensity', trendConsistency: 'Trend Consistency',
        rvolSurging: 'Surging', rvolActive: 'Active', rvolNormal: 'Normal', rvolLow: 'Low',
        consistencyStrong: 'Strong', consistencyMixed: 'Mixed', consistencyUnstable: 'Unstable',
        noiseBounce: (today, cum) => `Noise bounce — Today ${today > 0 ? '+' : ''}${today.toFixed(1)}% but 5-day trend ${cum > 0 ? '+' : ''}${cum.toFixed(1)}%`
    },
    ja: {
        trendAnalysis: '5日トレンド分析', volumeIntensity: '出来高強度', trendConsistency: 'トレンド一貫性',
        rvolSurging: '急増', rvolActive: '活発', rvolNormal: '普通', rvolLow: '低調',
        consistencyStrong: '強いトレンド', consistencyMixed: '混在', consistencyUnstable: '不安定',
        noiseBounce: (today, cum) => `ノイズ反発 — 本日 ${today > 0 ? '+' : ''}${today.toFixed(1)}% しかし5日間 ${cum > 0 ? '+' : ''}${cum.toFixed(1)}% トレンド`
    }
};

interface Props {
    data: any;
    loading: boolean;
    verdict: { title: string; desc: string; color: string; sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; realityInsight?: string };
    session?: string;
}

export default function MobileGuardianFlow({ data, loading, verdict, session }: Props) {
    const t = useTranslations('guardian');
    const gt = useTranslations('gate');
    const locale = useLocale();
    const { hasAccess, tier } = useTier();
    const { status: marketStatusInfo } = useMarketStatus();
    const isMarketActive = (session === 'REG' || session === 'PRE' || session === 'POST') && !marketStatusInfo.isHoliday;
    const isFullyActive = session === 'REG' && !marketStatusInfo.isHoliday;

    const isMapGuestPreview = tier === 'guest' && (() => {
        if (typeof document === 'undefined') return true;
        const match = document.cookie.match(/shq_gv=(\d+)/);
        return match ? parseInt(match[1], 10) <= 5 : true;
    })();
    const isMapUnlocked = hasAccess('elite') || isMapGuestPreview;

    const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
    const intelSectorId = selectedSectorId || data?.verdictTargetId || null;
    const selectedSector = data?.sectors?.find((s: any) => s.id === intelSectorId);
    const constituentSymbols = selectedSector?.topConstituents?.map((c: any) => c.symbol) || [];

    // Live prices polling — identical to desktop page.tsx L246-281
    const [livePrices, setLivePrices] = useState<Record<string, { price: number; change: number; volume: number }>>({});
    const priceIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const wsTickerArray = useMemo(() => constituentSymbols, [constituentSymbols.join(',')]);
    const { connected: wsConnected, getPrice: wsGetPrice } = useRealtimeData(wsTickerArray.length > 0 ? wsTickerArray : undefined);

    const fetchLivePrices = useCallback(async (symbols: string[]) => {
        if (symbols.length === 0) return;
        try {
            const res = await fetch(`/api/live/prices?t=${symbols.join(',')}`);
            if (!res.ok) return;
            const json = await res.json();
            const map: Record<string, { price: number; change: number; volume: number }> = {};
            (json.prices || []).forEach((p: any) => { map[p.symbol] = { price: p.price, change: p.change, volume: p.volume }; });
            setLivePrices(map);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        if (priceIntervalRef.current) { clearInterval(priceIntervalRef.current); priceIntervalRef.current = null; }
        if (constituentSymbols.length === 0) return;
        fetchLivePrices(constituentSymbols);
        priceIntervalRef.current = setInterval(() => fetchLivePrices(constituentSymbols), 30_000);
        return () => { if (priceIntervalRef.current) clearInterval(priceIntervalRef.current); };
    }, [selectedSectorId, constituentSymbols.join(','), fetchLivePrices]);

    const topMovers = (selectedSector?.topConstituents || []).map((stock: any) => {
        const wsPrice = wsConnected ? wsGetPrice(stock.symbol) : undefined;
        if (wsPrice && wsPrice.price > 0) return { ...stock, price: wsPrice.price, change: wsPrice.changePct || stock.change, volume: wsPrice.volume || stock.volume };
        const live = livePrices[stock.symbol];
        return live ? { ...stock, price: live.price, change: live.change, volume: live.volume } : stock;
    });

    const isTargetLocked = data?.tripleA?.isTargetLock || false;
    const isBullMode = (data?.tripleA?.regime || 'NEUTRAL') === 'BULL';
    const mapBorderClass = isTargetLocked && isFullyActive
        ? "border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-pulse"
        : isTargetLocked ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
            : isBullMode ? "border-emerald-500/30" : "border-slate-800";

    return (
        <div className="space-y-3">
            {/* ── FLOW TOPOGRAPHY MAP ── */}
            <div className={`relative w-full bg-[#0a0e14] border rounded-xl overflow-hidden ${mapBorderClass}`}
                style={{ height: 'clamp(320px, 50vh, 420px)' }}>
                {/* Map Header */}
                <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-1.5 right-2">
                    <GuardianTooltip sectionId="flowMap">
                        <h3 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-1 inline-block font-jakarta">
                            Flow Topography Map
                        </h3>
                    </GuardianTooltip>
                    <span className={`text-[11px] font-black tracking-wide px-2.5 py-1 rounded-md border font-jakarta shrink-0 ${isFullyActive
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                        : 'bg-amber-950/60 text-amber-400 border-amber-500/30'}`}>
                        {isFullyActive ? '● LIVE' : isMarketActive ? '◉ ACTIVE' : 'STANDBY'}
                    </span>
                    {!isMarketActive && <span className="text-[11px] text-amber-500/80 font-medium tracking-wide">{t('mapStandbyNotice')}</span>}
                </div>

                {isTargetLocked && (
                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center select-none">
                        <div className={`text-xl font-black text-amber-400 tracking-[0.15em] drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] whitespace-nowrap ${isFullyActive ? 'animate-[pulse_3s_ease-in-out_infinite]' : 'opacity-60'}`}>
                            TARGET LOCKED
                        </div>
                    </div>
                )}

                {isMapUnlocked ? (
                    <SmartMoneyMap
                        sectors={(data?.sectors || []).map((s: any) => ({
                            id: s.id, name: s.name, density: s.change,
                            height: Math.min(2.5, Math.abs(s.change)), topTickers: [],
                            color: s.change >= 0 ? '#10b981' : '#f43f5e'
                        }))}
                        vectors={data?.vectors || []}
                        sourceId={data?.verdictSourceId}
                        targetId={data?.verdictTargetId}
                        onSectorSelect={setSelectedSectorId}
                        isBullMode={isBullMode}
                        isMarketActive={isMarketActive}
                    />
                ) : (
                    <div className="h-[400px] flex items-center justify-center bg-slate-950/30">
                        <div className="flex flex-col items-center gap-3">
                            <div className="rounded-full p-2.5 bg-cyan-500/10 border-cyan-500/30 border shadow-[0_0_20px_rgba(34,211,238,0.15)]">
                                <Lock className="w-5 h-5 text-cyan-400" />
                            </div>
                            <span className="text-white font-jakarta font-bold tracking-wide text-center text-sm">Flow Topography Map</span>
                            <p className="text-center font-medium tracking-wide font-jakarta text-[12px] text-slate-200 max-w-sm leading-relaxed">{gt('fomoFlowTopo')}</p>
                            <Link href="/pricing" className="inline-flex items-center gap-1.5 rounded-lg font-bold uppercase tracking-wider transition-all hover:brightness-110 text-xs px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 text-black shadow-[0_0_20px_rgba(34,211,238,0.15)]">
                                {gt('unlockWith', { tier: 'ELITE' })} <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* ── SECTOR INTEL ── */}
            <div className="border border-slate-800 rounded-xl p-4 relative shadow-2xl flex flex-col min-h-[280px] overflow-hidden"
                style={{ background: 'radial-gradient(circle at 85% 15%, rgba(6,182,212,0.12) 0%, transparent 45%), rgba(10,14,20,1)' }}>
                <h3 className="text-[13px] font-black uppercase tracking-[0.15em] text-cyan-400 mb-3 border-b border-cyan-900/30 pb-2 font-jakarta">
                    <GuardianTooltip sectionId="sectorIntel" position="right"><span>SECTOR INTEL</span></GuardianTooltip>
                </h3>
                <div className="flex-1 overflow-y-auto">
                    {selectedSector ? (
                        <SectorIntelDetail
                            selectedSector={selectedSector}
                            data={data}
                            intelSectorId={intelSectorId}
                            topMovers={topMovers}
                            locale={locale}
                        />
                    ) : (
                        <SectorIntelDefault data={data} locale={locale} onSelect={setSelectedSectorId} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Sector Intel Detail (desktop page.tsx L963-1083) ──
function SectorIntelDetail({ selectedSector, data, intelSectorId, topMovers, locale }: any) {
    const st = SECTOR_INTEL_TEXTS[(locale as SectorLocale) || 'ko'];
    const td = data?.rotationIntensity?.fiveDayData?.[intelSectorId];

    return (
        <div className="flex flex-col">
            <div className="flex justify-between items-baseline mb-3">
                <span className="text-lg font-bold text-white">{getSectorName(selectedSector.name, locale)}</span>
                <span className={`text-xl font-mono ${selectedSector.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {selectedSector.change > 0 ? "+" : ""}{selectedSector.change.toFixed(2)}%
                </span>
            </div>

            {td && (() => {
                const dayLabels = ['D-4', 'D-3', 'D-2', 'D-1'];
                const maxAbs = Math.max(...td.changes.map(Math.abs), 0.5);
                const rvolLabel = td.rvol >= 1.5 ? st.rvolSurging : td.rvol >= 1.0 ? st.rvolActive : td.rvol >= 0.7 ? st.rvolNormal : st.rvolLow;
                const rvolColor = td.rvol >= 1.5 ? 'text-emerald-400' : td.rvol >= 1.0 ? 'text-cyan-400' : td.rvol >= 0.7 ? 'text-slate-400' : 'text-rose-400';
                const consistencyLabel = td.consistency >= 0.75 ? st.consistencyStrong : td.consistency >= 0.5 ? st.consistencyMixed : st.consistencyUnstable;
                const consistencyColor = td.consistency >= 0.75 ? 'text-emerald-400' : td.consistency >= 0.5 ? 'text-amber-400' : 'text-rose-400';
                return (
                    <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[13px] font-bold text-slate-400 uppercase tracking-widest font-jakarta">{st.trendAnalysis}</span>
                            <span className={`text-[13px] font-mono font-bold ${td.cumReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {td.cumReturn > 0 ? '▲' : '▼'} {td.cumReturn > 0 ? '+' : ''}{td.cumReturn.toFixed(2)}%
                            </span>
                        </div>
                        <div className="space-y-1.5 mb-3">
                            {td.changes.map((c: number, i: number) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-[12px] text-slate-600 font-mono w-6 text-right shrink-0">{dayLabels[i] || `D${i}`}</span>
                                    <div className="flex-1 h-4 bg-slate-900 rounded overflow-hidden relative">
                                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-700/50" />
                                        <div className={`absolute top-0.5 bottom-0.5 rounded-sm transition-all duration-500 ${c >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                                            style={{ left: c >= 0 ? '50%' : `${50 - (Math.abs(c) / maxAbs) * 45}%`, width: `${(Math.abs(c) / maxAbs) * 45}%` }} />
                                    </div>
                                    <span className={`text-[12px] font-mono font-bold w-12 text-right shrink-0 ${c >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {c > 0 ? '+' : ''}{c.toFixed(1)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-900/80 rounded-lg px-3 py-2 border border-slate-800/50">
                                <div className="text-[12px] text-slate-500 font-bold tracking-wider mb-1">{st.volumeIntensity}</div>
                                <div className="flex items-baseline gap-1.5">
                                    <span className={`text-sm font-mono font-bold ${rvolColor}`}>{td.rvol.toFixed(2)}x</span>
                                    <span className={`text-[12px] font-medium ${rvolColor}`}>{rvolLabel}</span>
                                </div>
                            </div>
                            <div className="bg-slate-900/80 rounded-lg px-3 py-2 border border-slate-800/50">
                                <div className="text-[12px] text-slate-500 font-bold tracking-wider mb-1">{st.trendConsistency}</div>
                                <div className="flex items-baseline gap-1.5">
                                    <span className={`text-sm font-mono font-bold ${consistencyColor}`}>{(td.consistency * 100).toFixed(0)}%</span>
                                    <span className={`text-[12px] font-medium ${consistencyColor}`}>{consistencyLabel}</span>
                                </div>
                            </div>
                        </div>
                        {td.isBounce && (
                            <div className="mt-2 flex items-center gap-2 bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="text-[12px] text-amber-300 font-medium">{st.noiseBounce(td.todayChange, td.cumReturn)}</span>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Live ticker table */}
            <div className="space-y-1">
                {topMovers.length > 0 ? topMovers.map((stock: any) => (
                    <Link key={stock.symbol} href={`/ticker?ticker=${stock.symbol}`}
                        className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 transition-all group">
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 relative">
                                <span className="text-[10px] font-bold text-slate-500 absolute">{stock.symbol.substring(0, 2)}</span>
                                <img src={`/api/logo/${stock.symbol}`} alt={stock.symbol} className="w-full h-full object-contain relative z-10"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                            <span className="text-[14px] font-bold text-slate-200 group-hover:text-cyan-300 w-12">{stock.symbol}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[14px] text-slate-200 font-mono font-semibold">${stock.price.toFixed(2)}</span>
                            <span className={`text-[14px] font-mono font-bold ${stock.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {stock.change > 0 ? "+" : ""}{stock.change.toFixed(2)}%
                            </span>
                        </div>
                    </Link>
                )) : <div className="text-xs text-slate-500 py-2 text-center">Loading live data...</div>}
            </div>
        </div>
    );
}

// ── Sector Intel Default (Top Movers, desktop page.tsx L1084-1121) ──
function SectorIntelDefault({ data, locale, onSelect }: { data: any; locale: string; onSelect: (id: string) => void }) {
    if (!data?.sectors || data.sectors.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-[12px] text-slate-300">
                <Layers className="w-8 h-8 opacity-20 mb-2" />
                SELECT A SECTOR ON MAP
            </div>
        );
    }
    const sorted = [...data.sectors].sort((a: any, b: any) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
    return (
        <>
            <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-[13px] font-bold text-slate-300 uppercase tracking-widest font-jakarta">Today&apos;s Top Movers</span>
            </div>
            <div className="space-y-1">
                {sorted.map((s: any) => (
                    <button key={s.id} onClick={() => onSelect(s.id)}
                        className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 transition-all text-left group">
                        <span className="text-[14px] font-medium text-slate-200 group-hover:text-cyan-300 transition-colors">{getSectorName(s.name, locale)}</span>
                        <span className={`text-[14px] font-mono font-bold ${s.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {s.change > 0 ? '+' : ''}{s.change.toFixed(2)}%
                        </span>
                    </button>
                ))}
            </div>
            <div className="mt-4 text-[13px] text-slate-400 text-center">
                ↑ {locale === 'ko' ? '섹터를 선택하면 상세 분석을 볼 수 있습니다' : locale === 'ja' ? 'セクターを選択して詳細分析を表示' : 'Select a sector for detailed analysis'}
            </div>
        </>
    );
}
