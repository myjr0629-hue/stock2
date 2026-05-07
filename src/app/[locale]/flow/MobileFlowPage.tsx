"use client";

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2, Crosshair, Lock } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFlowData } from '@/hooks/useFlowData';
import { useLivePrice } from '@/hooks/useLivePrice';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { MobileFlowHeader } from '@/components/mobile/MobileFlowHeader';
import type { FlowRadarProps } from '@/components/FlowRadar';
import { MobileWatchlistSwipeBar } from '@/components/mobile/MobileWatchlistSwipeBar';
import useSWR from 'swr';

const FlowRadar = dynamic<FlowRadarProps>(() => import('@/components/FlowRadar').then(m => m.FlowRadar), { ssr: false });

interface MobileFlowPageProps {
    ticker: string;
    initialFlowData?: any;
}

const TABS = [
    { id: 'verdict' as const, label: 'AI Verdict', aiPrefix: true },
    { id: 'options' as const, label: 'Options', dotColor: 'bg-rose-500' },
    { id: 'whale' as const, label: 'Whale', dotColor: 'bg-cyan-500' },
    { id: 'darkpool' as const, label: 'Dark Pool', dotColor: 'bg-teal-500' },
    { id: 'signals' as const, label: 'Signals', dotColor: 'bg-amber-500' },
];

type TabId = 'verdict' | 'options' | 'whale' | 'darkpool' | 'signals';

/*
 * FlowRadar DOM 구조 (div.space-y-1 root):
 *
 * [0] Header/Control Bar  → 항상 숨김 (모바일 자체 상태바 사용)
 * [1] AI VERDICT block     → verdict/options 탭
 *     └─ div.flex.flex-col.lg:flex-row.gap-2
 *         ├─ [0] div.lg:w-[50%]    = Analysis (verdict 탭)
 *         └─ [1] div.lg:w-[50%]    = Metrics 4카드+GEX (options 탭)
 * [2] Tactical Intel Panel → whale/darkpool/strike/signals 탭
 *     └─ div.grid
 *         ├─ Card.order-2  = Main Card
 *         │     ├ EliteGate (Whale Stream) → whale/darkpool 탭
 *         │     └ ProGate (Strike Profile) → strike 탭
 *         └─ div.order-1   = Side (Key Levels+Indicators) → signals 탭
 */

/**
 * FlowRadar 내부의 Institutional/DarkPool/Live 토글 버튼을 프로그래매틱 클릭.
 * FlowRadar 코드 수정 없이 내부 상태를 전환합니다.
 */
function clickInternalToggle(container: HTMLElement, mode: 'WHALE' | 'DARKPOOL' | 'LIVE') {
    // FlowRadar 내부 토글 버튼 텍스트 매핑
    const targetTexts: Record<string, string[]> = {
        'WHALE': ['Institutional'],
        'DARKPOOL': ['Dark Pool'],
        'LIVE': ['Live Stream'],
    };
    const searchTexts = targetTexts[mode];
    const toggleContainer = container.querySelector('[class*="bg-slate-950"][class*="backdrop-blur"]');
    if (!toggleContainer) return;
    const buttons = toggleContainer.querySelectorAll('button');
    for (const btn of Array.from(buttons)) {
        const btnText = btn.textContent || '';
        if (searchTexts.some(t => btnText.includes(t))) {
            btn.click();
            break;
        }
    }
}

/**
 * FlowRadar 데스크톱 헤더의 Volume/OI 토글을 프로그래매틱 클릭.
 * 헤더는 display:none이지만 DOM에 존재하므로 click() 정상 작동.
 */
function clickViewModeToggle(container: HTMLElement, mode: 'VOLUME' | 'OI') {
    // 데스크톱 헤더(topChildren[0]) 안의 Volume/OI 버튼
    const root = container.querySelector('[class*="space-y-1"]');
    if (!root) return;
    const header = root.children[0] as HTMLElement | null;
    if (!header) return;
    const buttons = header.querySelectorAll('button');
    for (const btn of Array.from(buttons)) {
        const btnText = (btn.textContent || '').trim();
        if (btnText === mode || btnText.toLowerCase() === mode.toLowerCase()) {
            btn.click();
            break;
        }
    }
}

export function MobileFlowPage({ ticker, initialFlowData }: MobileFlowPageProps) {
    const [activeTab, setActiveTab] = useState<TabId>('verdict');
    const [viewMode, setViewMode] = useState<'VOLUME' | 'OI'>('VOLUME');
    const flowRadarRef = useRef<HTMLDivElement>(null);

    // ===== DATA PIPELINE — 100% FlowPageClient 동일 =====
    const { data: liveQuote, isLoading: loading } = useFlowData(ticker, {
        refreshInterval: 10000, // [COST OPT] 10s polling
        fallbackData: initialFlowData?.liveQuote
    });

    const chartFetcher = (url: string) => fetch(url).then(r => r.json());
    const { data: chartRes } = useSWR(
        ticker ? `/api/chart?symbol=${ticker}&range=1d` : null,
        chartFetcher,
        { refreshInterval: 60000, revalidateOnFocus: false }
    );

    const sparklineData = useMemo(() => {
        const points: number[] = (chartRes?.data || []).map((d: any) => d.close).filter((v: number) => v > 0);
        if (points.length < 2) return null;
        const min = Math.min(...points);
        const max = Math.max(...points);
        const range = max - min || 1;
        const w = 60, h = 24;
        const step = w / (points.length - 1);
        const coords = points.map((p: number, i: number) => {
            const x = i * step;
            const y = h - ((p - min) / range) * (h - 4) - 2;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return { path: coords.join(' '), isUp: points[points.length - 1] >= points[0] };
    }, [chartRes]);

    const { status: marketStatus } = useMarketStatus();
    const livePrice = useLivePrice(ticker, marketStatus.market);
    const flowSsrFallback = initialFlowData?.liveQuote;
    const flowSession = (liveQuote?.session || flowSsrFallback?.session || 'CLOSED').toUpperCase();
    const { displayPrice, displayChangePct, activeExtPrice, activeExtType, activeExtLabel, activeExtPct } = calcPriceDisplay({
        livePrice: livePrice?.price,
        liveChangePct: livePrice?.changePercent,
        apiDisplayPrice: flowSsrFallback?.display?.price || liveQuote?.display?.price,
        apiDisplayChangePct: flowSsrFallback?.display?.changePctPct || liveQuote?.display?.changePctPct,
        session: flowSession === 'REG' ? 'REG' : (flowSsrFallback?.session || liveQuote?.session || 'CLOSED'),
        prevRegularClose: flowSsrFallback?.prices?.prevRegularClose || liveQuote?.prices?.prevRegularClose,
        prevClose: flowSsrFallback?.prevClose || liveQuote?.prevClose,
        regularCloseToday: flowSsrFallback?.prices?.regularCloseToday || liveQuote?.prices?.regularCloseToday,
        prevChangePct: liveQuote?.prices?.prevChangePct,
        fallbackChangePct: flowSsrFallback?.changePercent || liveQuote?.changePercent || 0,
        lastTrade: flowSsrFallback?.prices?.lastTrade || liveQuote?.prices?.lastTrade || liveQuote?.price,
        extended: flowSsrFallback?.extended || liveQuote?.extended,
        prices: flowSsrFallback?.prices || liveQuote?.prices,
    });

    const rawChain = liveQuote?.flow?.rawChain || [];
    const allExpiryChain = liveQuote?.flow?.allExpiryChain || [];
    const gammaFlipLevel = liveQuote?.flow?.gammaFlipLevel ?? null;
    const oiPcr = liveQuote?.flow?.oiPcr ?? null;
    const isDataMissing = !liveQuote && loading;

    // ===== JS DOM 조작으로 탭별 섹션 표시/숨김 =====
    // FlowRadar DOM 구조 (웹과 100% 동일 데이터, 모바일에서 탭별 분리만):
    //
    // div.space-y-1 (root)
    //   [0] Header/Control Bar       → 숨김 (모바일 자체 상태바)
    //   [1] AI VERDICT block         → verdict/options 탭
    //       └ div.flex.flex-col.gap-2 (L1819)
    //           ├ [0] Analysis (lg:w-[50%])  → verdict
    //           └ [1] Metrics (lg:w-[50%])   → options
    //   [2] Tactical Intel Panel     → level3/strike/signals 탭
    //       ├ [0] Main Card (L2436)
    //       │   └ CardContent
    //       │       ├ EliteGate "Institutional Order Flow" → level3
    //       │       └ ProGate "Options Landscape"          → strike
    //       └ [1] Side Wrapper (L3226)
    //           └ Card (OMR, Key Levels, Indicators)       → signals
    //
    useEffect(() => {
        const container = flowRadarRef.current;
        if (!container || isDataMissing) return;

        const apply = () => {
            const root = container.querySelector('[class*="space-y-1"]') as HTMLElement | null;
            if (!root) return;

            const topChildren = Array.from(root.children) as HTMLElement[];
            if (topChildren.length < 2) return;

            // [0] Desktop Header → 항상 숨김
            topChildren[0].style.display = 'none';

            // [1] AI VERDICT block
            const verdictBlock = topChildren[1];
            // [2] Tactical Intel Panel (grid)
            const tacticalPanel = topChildren[2] || null;

            // === VERDICT BLOCK 내부 분할 ===
            let flexRow: HTMLElement | null = null;
            try {
                flexRow = verdictBlock?.querySelector('.flex.flex-col.lg\\:flex-row') as HTMLElement | null;
            } catch { /* fallback below */ }
            if (!flexRow) {
                const candidates = verdictBlock?.querySelectorAll('.flex.flex-col');
                if (candidates) {
                    for (const c of Array.from(candidates)) {
                        if (c.children.length === 2 && (c as HTMLElement).className.includes('gap-2')) {
                            flexRow = c as HTMLElement;
                            break;
                        }
                    }
                }
            }
            const analysisHalf = flexRow?.children[0] as HTMLElement | null;
            const metricsHalf = flexRow?.children[1] as HTMLElement | null;

            // === TACTICAL PANEL 분할 ===
            let mainCard: HTMLElement | null = null;
            let sideWrapper: HTMLElement | null = null;
            if (tacticalPanel) {
                const gridChildren = Array.from(tacticalPanel.children) as HTMLElement[];
                mainCard = gridChildren[0] || null;     // Main Card
                sideWrapper = gridChildren[1] || null;  // Side wrapper
            }

            // === MAIN CARD 내부 분할: Level3 vs Strike ===
            // CardContent 자식:
            //   [0] div.absolute (background pattern) → 항상 보임
            //   [1] EliteGate "Institutional Order Flow" → Level 3 탭
            //   [2] ProGate "Options Landscape"          → Strike 탭
            let whaleSection: HTMLElement | null = null;   // EliteGate → Level 3
            let strikeSection: HTMLElement | null = null;  // ProGate → Strike
            if (mainCard) {
                // CardContent는 Card > div (CardContent wrapper)
                const cardContent = mainCard.querySelector('[class*="p-6"]') as HTMLElement | null;
                if (cardContent) {
                    const ccChildren = Array.from(cardContent.children) as HTMLElement[];
                    // 직접 자식 중 EliteGate와 ProGate 찾기
                    // EliteGate/ProGate는 각각 특정 구조를 가진 wrapper div로 렌더됨
                    // ccChildren: [0]=bg pattern(absolute), [1]=EliteGate, [2]=ProGate
                    for (const child of ccChildren) {
                        // absolute positioned bg → 건드리지 않음
                        if (child.className.includes('absolute')) continue;
                        
                        // EliteGate contains "LEVEL 3" or "Institutional" text
                        const text = child.textContent || '';
                        if (text.includes('LEVEL 3') || text.includes('INSTITUTIONAL') || text.includes('Institutional')) {
                            whaleSection = child;
                        }
                        // ProGate contains "STRIKE PROFILE" or "LANDSCAPE" or "OPTIONS FLOW"
                        else if (text.includes('STRIKE PROFILE') || text.includes('LANDSCAPE') || text.includes('OPTIONS FLOW')) {
                            strikeSection = child;
                        }
                    }
                    // Fallback: index-based (skip absolute bg pattern children)
                    if (!whaleSection || !strikeSection) {
                        const nonAbsolute = ccChildren.filter(c => !c.className.includes('absolute'));
                        if (nonAbsolute.length >= 2) {
                            whaleSection = whaleSection || nonAbsolute[0];
                            strikeSection = strikeSection || nonAbsolute[1];
                        }
                    }
                }
            }

            // === 전부 리셋 ===
            if (verdictBlock) verdictBlock.style.display = '';
            if (tacticalPanel) tacticalPanel.style.display = '';
            if (analysisHalf) analysisHalf.style.display = '';
            if (metricsHalf) metricsHalf.style.display = '';
            if (mainCard) mainCard.style.display = '';
            if (sideWrapper) sideWrapper.style.display = '';
            if (whaleSection) whaleSection.style.display = '';
            if (strikeSection) strikeSection.style.display = '';

            // === 탭별 표시/숨김 ===
            switch (activeTab) {
                case 'verdict':
                    // AI Verdict Analysis만 (좌측 50%)
                    if (tacticalPanel) tacticalPanel.style.display = 'none';
                    if (metricsHalf) metricsHalf.style.display = 'none';
                    break;

                case 'options':
                    // Metrics만 (우측 50%: OPI, Whale, Squeeze, IV Skew, GEX)
                    if (tacticalPanel) tacticalPanel.style.display = 'none';
                    if (analysisHalf) analysisHalf.style.display = 'none';
                    break;

                case 'whale':
                    // Institutional Whale Stream (EliteGate)
                    if (verdictBlock) verdictBlock.style.display = 'none';
                    if (sideWrapper) sideWrapper.style.display = 'none';
                    if (strikeSection) strikeSection.style.display = 'none';
                    // Programmatically click "Institutional" toggle inside FlowRadar
                    clickInternalToggle(container, 'WHALE');
                    break;

                case 'darkpool':
                    // Dark Pool Trades (EliteGate)
                    if (verdictBlock) verdictBlock.style.display = 'none';
                    if (sideWrapper) sideWrapper.style.display = 'none';
                    if (strikeSection) strikeSection.style.display = 'none';
                    // Programmatically click "Dark Pool" toggle inside FlowRadar
                    clickInternalToggle(container, 'DARKPOOL');
                    break;

                case 'signals':
                    // OMR, Key Levels (Put Floor/Call Wall), Smart Money, DEX, UOA, P/C
                    if (verdictBlock) verdictBlock.style.display = 'none';
                    if (mainCard) mainCard.style.display = 'none';
                    break;
            }
        };

        // FlowRadar는 dynamic import라 지연 렌더. MutationObserver로 감시
        const observer = new MutationObserver(() => {
            if (container.querySelector('[class*="space-y-1"]')) {
                apply();
            }
        });
        observer.observe(container, { childList: true, subtree: true });

        // 즉시 + 딜레이 적용
        apply();
        const t1 = setTimeout(apply, 300);
        const t2 = setTimeout(apply, 800);
        const t3 = setTimeout(apply, 1500);

        return () => {
            observer.disconnect();
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [activeTab, isDataMissing]);

    const handleTabClick = useCallback((tabId: TabId) => {
        setActiveTab(tabId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    return (
        <div className="min-h-screen bg-[#0a0f1a] flex flex-col" data-mobile-flow>
            <div className="fixed inset-0 bg-[#0a0f1a] -z-50" />

            {/* HEADER — 시안: 티커+♥ / 가격+스파크라인 / 세션 */}
            <MobileFlowHeader
                ticker={ticker}
                name={liveQuote?.name}
                displayPrice={displayPrice}
                displayChangePct={displayChangePct}
                activeExtPrice={activeExtPrice}
                activeExtPct={activeExtPct}
                activeExtLabel={activeExtLabel}
                activeExtType={activeExtType}
                sparklinePath={sparklineData?.path || null}
                sparklineIsUp={sparklineData?.isUp ?? true}
            />

            {/* STATUS BAR + VOLUME/OI TOGGLE + TAB NAV */}
            <div className="sticky top-[140px] z-30 bg-[#0a0f1a]/95 backdrop-blur-xl border-b border-white/[0.06]">
                <div className="flex items-center gap-2 px-4 py-1.5">
                    <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 to-transparent border-l-2 border-amber-500 px-2 py-1 rounded-r flex-1 min-h-0">
                        <Crosshair size={11} className="text-amber-400 shrink-0" />
                        <span className="text-amber-400 text-[11px] font-black tracking-wider shrink-0">FLOW RADAR</span>
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5 shrink-0">
                            <Lock size={6} />LV3
                        </span>

                        {/* Volume / OI + LIVE — flush inline */}
                        <div className="ml-auto flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-0.5">
                                <button
                                    onClick={() => { setViewMode('VOLUME'); if (flowRadarRef.current) clickViewModeToggle(flowRadarRef.current, 'VOLUME'); }}
                                    className={`px-1.5 py-[1px] text-[9px] font-black rounded transition-all uppercase tracking-wider ${viewMode === 'VOLUME' ? 'bg-indigo-600/90 text-white' : 'text-slate-500'}`}
                                >VOL</button>
                                <button
                                    onClick={() => { setViewMode('OI'); if (flowRadarRef.current) clickViewModeToggle(flowRadarRef.current, 'OI'); }}
                                    className={`px-1.5 py-[1px] text-[9px] font-black rounded transition-all uppercase tracking-wider ${viewMode === 'OI' ? 'bg-indigo-600/90 text-white' : 'text-slate-500'}`}
                                >OI</button>
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                LIVE
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex gap-1 px-3 py-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex items-center gap-1 px-2.5 py-[6px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-200 shrink-0 ${
                                activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] active:bg-white/10'
                            }`}
                        >
                            {tab.dotColor && activeTab !== tab.id && (
                                <span className={`w-[5px] h-[5px] rounded-full ${tab.dotColor}`} />
                            )}
                            {'aiPrefix' in tab && tab.aiPrefix ? (
                                <span className="flex items-center gap-1">
                                    <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent font-black text-[11px]">AI</span>
                                    <span>Verdict</span>
                                </span>
                            ) : (
                                <span>{tab.label}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 relative z-10 px-3 pb-32 pt-2" ref={flowRadarRef}>
                {isDataMissing ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-500/50 mb-4" />
                        <span className="text-[14px] text-slate-400 font-medium">Loading flow data...</span>
                    </div>
                ) : (
                    <ErrorBoundary key={ticker} fallbackTitle="Flow Radar Error" fallbackMessage="An error occurred while loading the options flow analysis. Please retry.">
                        <style>{`
                            /* Mobile typography & readability */
                            [data-mobile-flow] .space-y-1 .text-xs { font-size: 12px !important; line-height: 1.5 !important; }
                            [data-mobile-flow] .space-y-1 .text-sm { font-size: 14px !important; line-height: 1.5 !important; }
                            [data-mobile-flow] .space-y-1 .text-base { font-size: 15px !important; }
                            [data-mobile-flow] .space-y-1 .text-slate-400 { color: rgb(148 163 184) !important; }
                            [data-mobile-flow] .space-y-1 .text-slate-300 { color: rgb(203 213 225) !important; }
                            [data-mobile-flow] .space-y-1 .rounded-xl { border-radius: 14px !important; }
                            [data-mobile-flow] .space-y-1 button { min-height: 36px !important; }
                            [data-mobile-flow] .space-y-1 table { font-size: 12px !important; }
                            [data-mobile-flow] .space-y-1 td, [data-mobile-flow] .space-y-1 th { padding: 6px 8px !important; font-size: 12px !important; }
                            [data-mobile-flow] .space-y-1 ::-webkit-scrollbar { display: none; }
                            [data-mobile-flow] .space-y-1 * { scrollbar-width: none; }

                            /* ============================================
                               LEVEL 3 내부 토글 숨김 — 모바일 탭이 대체
                               Institutional/DarkPool/Live 토글 컨테이너
                               ============================================ */
                            [data-mobile-flow] .flex.flex-wrap > .flex[class*="bg-slate-950"] {
                                display: none !important;
                            }

                            /* Level 3 title: compact on mobile */
                            [data-mobile-flow] .flex.flex-wrap {
                                flex-direction: column !important;
                                align-items: flex-start !important;
                                gap: 4px !important;
                            }
                            [data-mobile-flow] .flex.flex-wrap > h3 {
                                font-size: 13px !important;
                                letter-spacing: 0.05em !important;
                            }
                            [data-mobile-flow] .flex.flex-wrap > span[class*="animate-pulse"] {
                                font-size: 9px !important;
                                padding: 2px 6px !important;
                            }

                            /* CardContent padding — tighter on mobile */
                            [data-mobile-flow] .space-y-1 [class*="p-6"] {
                                padding: 12px !important;
                            }
                        `}</style>
                        <FlowRadar
                            ticker={ticker}
                            rawChain={rawChain}
                            allExpiryChain={allExpiryChain}
                            gammaFlipLevel={gammaFlipLevel}
                            oiPcr={oiPcr}
                            currentPrice={displayPrice}
                            squeezeScore={liveQuote?.flow?.squeezeScore}
                            squeezeRisk={liveQuote?.flow?.squeezeRisk}
                            initialFlowData={initialFlowData}
                        />
                    </ErrorBoundary>
                )}
            </div>

            {/* WATCHLIST SWIPE BAR — fixed above bottom nav */}
            <MobileWatchlistSwipeBar currentTicker={ticker} targetPage="flow" />
        </div>
    );
}

