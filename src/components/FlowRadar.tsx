// [S-56.4.5] FlowRadar with optimized date display
"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Radar, Target, Crosshair, Zap, Layers, Info, TrendingUp, TrendingDown, Activity, Lightbulb, Percent, Lock, Shield, Loader2 } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "./ui/progress";
import { useTranslations } from 'next-intl';

interface FlowRadarProps {
    ticker: string;
    rawChain: any[];
    currentPrice: number;
}

export function FlowRadar({ ticker, rawChain, currentPrice }: FlowRadarProps) {
    const t = useTranslations('flowRadar');
    const [userViewMode, setUserViewMode] = useState<'VOLUME' | 'OI' | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const currentPriceLineRef = useRef<HTMLDivElement>(null);
    const hasCenteredRef = useRef(false);

    // Auto-Scroll to Current Price (ONCE on Load)
    useEffect(() => {
        if (!hasCenteredRef.current && scrollContainerRef.current && currentPriceLineRef.current && rawChain.length > 0) {
            const container = scrollContainerRef.current;
            const target = currentPriceLineRef.current;

            // Calculate center position
            const topPos = target.offsetTop - (container.clientHeight / 2) + (target.clientHeight / 2);

            container.scrollTo({
                top: topPos,
                behavior: 'smooth'
            });

            hasCenteredRef.current = true;
        }
    }, [currentPrice, rawChain]);

    // State for Live Whale Trades [V3.7.3]
    const [whaleTrades, setWhaleTrades] = useState<any[]>([]);
    const [tradesLoading, setTradesLoading] = useState(false);
    const [isSystemReady, setIsSystemReady] = useState(false); // [Fix] Initial Load State

    // Fetch Whale Trades
    const fetchWhaleTrades = async () => {
        try {
            const res = await fetch(`/api/live/options/trades?t=${ticker}`); // Use explicit ticker
            if (res.ok) {
                const data = await res.json();
                setWhaleTrades(prev => {
                    const newTrades = data.items || [];
                    const combined = [...newTrades, ...prev];
                    const unique = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
                    return unique.slice(0, 50); // Keep last 50
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSystemReady(true);
        }
    };

    // Poll for trades
    useEffect(() => {
        if (rawChain.length > 0) {
            fetchWhaleTrades();
            const interval = setInterval(fetchWhaleTrades, 15000); // Every 15s
            return () => clearInterval(interval);
        }
    }, [rawChain]);

    // Process Data: Group by Strike
    const { flowMap, totalVolume } = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { flowMap: [], totalVolume: 0 };
        // ... (lines 75-680 unchanged, resume at line 681)
        {/* 1. Current Position Status (Hero Block) - Glass */ }
        <div className="bg-gradient-to-b from-white/5 to-transparent rounded-lg border border-white/10 p-3 text-center relative overflow-hidden group shrink-0 transition-all hover:bg-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">{t('currentPositionSuggestion')}</span>
            <div className={`text-sm font-black tracking-tight flex items-center justify-center gap-2 ${isSystemReady ? (analysis?.color || "text-slate-300") : "text-indigo-300"}`}>
                {isSystemReady ? (
                    <>
                        {analysis?.status === 'RANGE BOUND' && <Activity size={16} />}
                        {analysis?.status === 'BULLISH' && <TrendingUp size={16} />}
                        {analysis?.status === 'BEARISH' && <TrendingDown size={16} />}
                        <span className="drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{analysis?.status}</span>
                    </>
                ) : (
                    <div className="flex items-center gap-2 animate-pulse">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="font-mono text-xs tracking-widest">CALCULATING...</span>
                    </div>
                )}
            </div>
        </div>

        {/* 2. Probability Meter */ }
        {
            analysis?.probability && analysis.probability !== 50 && isSystemReady && (
                <div className="space-y-1.5 shrink-0 mt-1 px-1">
                    <div className="flex justify-between items-end px-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t('probabilityAnalysis')}</span>
                        <span className={`text-[10px] font-bold ${analysis.probColor}`}>{analysis.probLabel}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800/50 rounded-full overflow-hidden relative border border-white/5">
                        <div
                            className={`h-full rounded-full shadow-[0_0_10px_currentColor] transition-all duration-1000 ${analysis.probColor.replace('text', 'bg')}`}
                            style={{ width: `${analysis.probability}%` }}
                        />
                    </div>
                    <div className="text-[9px] text-right text-slate-500 font-mono opacity-70">{analysis.probability.toFixed(0)}%</div>
                </div>
            )
        }

        {/* 3. Analysis Message Box - High Visibility Glass */ }
        <div className="bg-indigo-950/40 rounded-lg border border-indigo-500/30 p-3.5 relative shrink-0 mt-1 backdrop-blur-md shadow-lg shadow-indigo-500/10 group hover:bg-indigo-900/40 transition-colors">
            <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-400 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.6)] group-hover:bg-indigo-300 transition-colors" />
            <div className="flex gap-3 pl-3">
                <div className="mt-0.5 shrink-0">
                    {isSystemReady ? (
                        analysis?.status === 'BULLISH' ? <TrendingUp size={16} className="text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" /> :
                            analysis?.status === 'BEARISH' ? <TrendingDown size={16} className="text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.5)]" /> :
                                <Activity size={16} className="text-indigo-400 drop-shadow-[0_0_5px_rgba(129,140,248,0.5)]" />
                    ) : (
                        <Loader2 size={16} className="text-indigo-400 animate-spin" />
                    )}
                </div>
                <p className="text-xs leading-relaxed text-indigo-50 font-medium font-sans whitespace-pre-line shadow-black/50 drop-shadow-sm">
                    {isSystemReady ? (
                        analysis?.message
                    ) : (
                        <span className="text-indigo-200/80 font-mono text-[11px] animate-pulse">
                            INITIALIZING QUANT ENGINE...<br />
                            SYNCHRONIZING INSTITUTIONAL ORDER FLOW...
                        </span>
                    )}
                </p>
            </div>
        </div>

        const strikeMap = new Map<number, { callVol: number; putVol: number; callOI: number; putOI: number }>();
        let totalVol = 0;

        rawChain.forEach(opt => {
            const strike = opt.details?.strike_price;
            const type = opt.details?.contract_type;
            const vol = opt.day?.volume || 0;
            const oi = opt.open_interest || 0;

            totalVol += vol;

            if (!strike) return;

            if (!strikeMap.has(strike)) {
                strikeMap.set(strike, { callVol: 0, putVol: 0, callOI: 0, putOI: 0 });
            }

            const entry = strikeMap.get(strike)!;
            if (type === 'call') {
                entry.callVol += vol;
                entry.callOI += oi;
            } else if (type === 'put') {
                entry.putVol += vol;
                entry.putOI += oi;
            }
        });

        // Filter for Near-the-Money (±15%)
        const range = currentPrice * 0.15;
        const relevantStrikes = Array.from(strikeMap.keys())
            .filter(s => s >= currentPrice - range && s <= currentPrice + range)
            .sort((a, b) => b - a); // Descending order

        return {
            flowMap: relevantStrikes.map(s => ({
                strike: s,
                ...strikeMap.get(s)!
            })),
            totalVolume: totalVol
        };
    }, [rawChain, currentPrice]);



    // Intelligent Default Mode
    const effectiveViewMode = userViewMode || (totalVolume > 0 ? 'VOLUME' : 'OI');
    const isMarketClosed = totalVolume === 0 && rawChain.length > 0;

    // Calculate Max for Scaling
    const maxVal = useMemo(() => {
        if (flowMap.length === 0) return 1;
        return Math.max(...flowMap.map(d => effectiveViewMode === 'VOLUME'
            ? Math.max(d.callVol, d.putVol)
            : Math.max(d.callOI, d.putOI)
        ));
    }, [flowMap, effectiveViewMode]);

    // Calculate Walls (Dominant Strikes)
    const { callWall, putWall } = useMemo(() => {
        let maxCall = -1, maxPut = -1;
        let cStrike = 0, pStrike = 0;

        flowMap.forEach(d => {
            const cVal = effectiveViewMode === 'VOLUME' ? d.callVol : d.callOI;
            const pVal = effectiveViewMode === 'VOLUME' ? d.putVol : d.putOI;

            if (cVal > maxCall) { maxCall = cVal; cStrike = d.strike; }
            if (pVal > maxPut) { maxPut = pVal; pStrike = d.strike; }
        });

        return { callWall: cStrike, putWall: pStrike };
    }, [flowMap, effectiveViewMode]);

    // [LEVEL 3] INSTITUTIONAL ANALYSIS ENGINE (Narrative Generation)
    const analysis = useMemo(() => {
        if (!flowMap || flowMap.length === 0) return null;

        const distToCall = ((callWall - currentPrice) / currentPrice) * 100;
        const distToPut = ((currentPrice - putWall) / currentPrice) * 100; // Negative value usually

        // [Fix] Filter for Today's Session only if Market is Active
        let activeTrades = whaleTrades;
        if (!isMarketClosed) {
            // Market is open. Filter for trades from active session (Last 16h to cover pre-market)
            const cutoff = Date.now() - (16 * 60 * 60 * 1000);
            activeTrades = whaleTrades.filter(t => new Date(t.tradeDate).getTime() > cutoff);
        }

        // 1. Whale Flow Decomposition
        let netWhalePremium = 0;
        let maxPremium = 0;
        let alphaTrade: any = null; // The "Lead Steer" trade

        activeTrades.forEach(t => {
            if (t.type === 'CALL') netWhalePremium += t.premium;
            else netWhalePremium -= t.premium;

            if (t.premium > maxPremium) {
                maxPremium = t.premium;
                alphaTrade = t;
            }
        });

        const whaleBias = netWhalePremium > 500000 ? 'STRONG_BULL'
            : netWhalePremium > 100000 ? 'BULLISH'
                : netWhalePremium < -500000 ? 'STRONG_BEAR'
                    : netWhalePremium < -100000 ? 'BEARISH'
                        : 'NEUTRAL';

        // 2. Alpha Trade Forensics (The Storyteller)
        let alphaIntel = "";
        let alphaBEP = 0;
        if (alphaTrade) {
            const unitCost = alphaTrade.premium / (alphaTrade.size * 100);
            alphaBEP = alphaTrade.type === 'CALL' ? alphaTrade.strike + unitCost : alphaTrade.strike - unitCost;

            // [Fix] Narrative Logic: Distinguish Targeting vs Protecting
            if (alphaTrade.type === 'CALL') {
                if (alphaBEP < currentPrice) {
                    alphaIntel = `메이저 고래가 $${(alphaTrade.premium / 1000).toFixed(0)}K (Deep ITM)를 매수하여 상승 추세를 굳히고 있습니다.`;
                } else {
                    alphaIntel = `메이저 고래가 $${(alphaTrade.premium / 1000).toFixed(0)}K를 베팅해 목표가 $${alphaBEP.toFixed(2)}를 조준하고 있습니다.`;
                }
            } else {
                if (alphaBEP > currentPrice) {
                    alphaIntel = `메이저 고래가 $${(alphaTrade.premium / 1000).toFixed(0)}K 규모의 풋옵션(ITM)으로 하락 헷징을 강화했습니다.`;
                } else {
                    alphaIntel = `메이저 고래가 $${(alphaTrade.premium / 1000).toFixed(0)}K 규모의 풋옵션으로 $${alphaBEP.toFixed(2)} 깨짐을 대비하고 있습니다.`;
                }
            }
        }

        // 3. Situational Synthesis (Context + Flow)
        let status = "판단 보류 (SCANNING)";
        let message = "세력들의 움직임을 정밀 분석 중입니다...";
        let color = "text-slate-400";
        let probability = 50;
        let probLabel = "중립 (Neutral)";
        let probColor = "text-slate-400";

        // Logic Branching
        if (currentPrice > callWall) {
            // SCENARIO: Breakout (Above Resistance)
            if (whaleBias.includes('BULL')) {
                status = "🚀 초강력 상승 (SUPER-CYCLE)";
                message = `저항벽($${callWall})이 돌파되었습니다. ${alphaIntel} 고래들이 추격 매수에 나섰으므로(Net +$${(netWhalePremium / 1000).toFixed(0)}K), 단순 오버슈팅이 아닌 '시세 분출' 단계입니다.`;
                probability = 95;
                probLabel = "확신 (Conviction)";
                probColor = "text-emerald-400";
                color = "text-emerald-400";
            } else {
                status = "⚠️ 돌파 후 숨고르기";
                message = `저항($${callWall})을 뚫었으나 추가 수급이 부족합니다. ${alphaIntel} 고래들은 차익실현 중일 수 있습니다. $${callWall} 지지 여부를 확인하십시오.`;
                probability = 60;
                probLabel = "관망 (Wait)";
                probColor = "text-amber-400";
                color = "text-amber-400";
            }
        }
        else if (currentPrice < putWall) {
            // SCENARIO: Breakdown (Below Support)
            if (whaleBias.includes('BEAR')) {
                status = "📉 지지선 붕괴 (COLLAPSE)";
                message = `최후 방어선($${putWall})이 뚫렸습니다. ${alphaIntel} 하방 베팅이 가속화되고 있어(Net -$${Math.abs(netWhalePremium / 1000).toFixed(0)}K), 투매가 이어질 수 있습니다.`;
                probability = 15;
                probLabel = "위험 (Danger)";
                probColor = "text-rose-500";
                color = "text-rose-500";
            } else {
                status = "🪤 베어 트랩 (BEAR TRAP)";
                message = `지지선($${putWall}) 이탈은 페이크일 가능성이 있습니다. ${alphaIntel} 고래들이 저점에서 물량을 받아먹고 있습니다. 반등 시 강한 숏커버링이 예상됩니다.`;
                probability = 40;
                probLabel = "주의 (Caution)";
                probColor = "text-amber-500";
                color = "text-amber-500";
            }
        }
        else {
            // SCENARIO: Inside Range
            const isNearRes = distToCall < 1.0;
            const isNearSup = Math.abs(distToPut) < 1.0;

            if (isNearRes) {
                if (whaleBias.includes('BULL')) {
                    status = "⚡ 돌파 임박 (BREAKOUT READY)";
                    message = `주가가 저항($${callWall})을 두드리고 있습니다. 단순 터치가 아닙니다. ${alphaIntel} 벽을 뚫기 위한 에너지가 충전되었습니다. 탑승하십시오.`;
                    probability = 88;
                    probLabel = "강력 매수 (Strong Buy)";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else {
                    status = "⛔ 저항 확인 (RESISTANCE)";
                    message = `저항벽($${callWall}) 도달 후 매수세가 약해졌습니다. ${alphaTrade && alphaTrade.type === 'PUT' ? `오히려 스마트머니는 풋옵션($${alphaTrade.strike})으로 하락 헷징 중입니다.` : "고래들은 관망하며 방향을 탐색 중입니다."} 돌파 실패 시 조정이 올 수 있습니다.`;
                    probability = 40;
                    probLabel = "매도 (Sell)";
                    probColor = "text-rose-400";
                    color = "text-rose-400";
                }
            } else if (isNearSup) {
                if (whaleBias.includes('BULL')) {
                    status = "💎 바닥 매수 기회 (BUY THE DIP)";
                    message = `지지선($${putWall})에서 완벽한 저점 매수 기회입니다. ${alphaIntel} 스마트머니는 이곳을 '절대 바닥'으로 인식하고 쓸어담고 있습니다. 손익비 최상 구간.`;
                    probability = 80;
                    probLabel = "매수 (Buy)";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else {
                    status = "💀 추가 하락 주의 (WEAK)";
                    message = `지지선($${putWall})이 위태롭습니다. ${alphaIntel ? alphaIntel : "고래들의 저점 매수세가 전혀 없습니다."} 지지가 깨질 확률이 높으니 칼날을 잡지 마십시오.`;
                    probability = 20;
                    probLabel = "관망/매도";
                    probColor = "text-rose-500";
                    color = "text-rose-500";
                }
            } else {
                // Mid-Range
                if (whaleBias.includes('BULL')) {
                    status = "📈 상승 모멘텀 (MOMENTUM)";
                    // Conflict Logic: Alpha Trade vs Aggregated Bias
                    if (alphaTrade && alphaTrade.type === 'PUT') {
                        message = `전반적인 고래 자금은 상방(Net +$${(netWhalePremium / 1000).toFixed(0)}K)이지만, 최대 큰손은 ${alphaIntel} 신중한 접근이 필요합니다.`;
                    } else {
                        message = `박스권($${putWall} ~ $${callWall}) 흐름이지만, ${alphaIntel} 고래 자금은 상방을 가리키고 있습니다. 눌림목 매수가 유효합니다.`;
                    }
                    probability = 65;
                    probLabel = "매수 우위";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else if (whaleBias.includes('BEAR')) {
                    status = "📉 하락 압력 (PRESSURE)";
                    message = `상승 탄력이 둔화되었습니다. ${alphaIntel} 고래들은 차트가 무너지기 전에 물량을 정리하거나 하방에 베팅 중입니다. 보수적으로 접근하십시오.`;
                    probability = 35;
                    probLabel = "매도 우위";
                    probColor = "text-rose-400";
                    color = "text-rose-400";
                } else {
                    status = "⚖️ 방향성 탐색 (NEUTRAL)";
                    message = `현재 주가($${currentPrice})는 고래들의 '전장' 한복판입니다. ${alphaTrade ? `${alphaTrade.type}옵션에 일부 자금이 들어왔으나` : "뚜렷한 주도 세력이 없습니다."} 확실한 방향 결정 전까지는 휴식도 투자입니다.`;
                    probability = 50;
                    probLabel = "중립";
                    probColor = "text-slate-500";
                    color = "text-slate-500";
                }
            }
        }

        return { status, message, color, probability, probLabel, probColor, whaleBias };
    }, [currentPrice, callWall, putWall, flowMap, whaleTrades, isMarketClosed]);

    if (!rawChain || rawChain.length === 0) {
        return (
            <div className="h-[400px] flex flex-col items-center justify-center text-slate-500 bg-slate-900/50 rounded-lg border border-white/5">
                <Radar size={48} className="mb-4 opacity-20" />
                <p>No Flow Data Available</p>
                <p className="text-xs opacity-50">Waiting for live options stream...</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in zoom-in duration-500">
            {/* Header / Control Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50 p-2 px-4 rounded-md border border-white/5 backdrop-blur-md">
                {/* 1. Left: Branding with Prestige */}
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="h-9 w-9 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <Crosshair size={18} className="text-emerald-400 animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-white tracking-wide flex items-center gap-2">
                            FLOW RADAR <span className="text-amber-400 text-[9px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 flex items-center gap-1"><Shield size={8} /> GEMS INSTITUTIONAL v2.1</span>
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            {isMarketClosed ?
                                <span className="text-amber-500 flex items-center gap-1"><Zap size={9} /> PRE-MARKET • PREVIOUS CLOSE DATA (OI)</span>
                                : <span className="text-emerald-400 flex items-center gap-1"><Zap size={9} /> Live Action • MM Tracking</span>
                            }
                        </p>
                    </div>
                </div>

                {/* 2. Center: Strategy Tip */}
                <div className="hidden md:flex flex-1 justify-center">
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                        <Lightbulb size={12} className="text-indigo-300" />
                        <span className="text-[10px] text-indigo-200 font-bold tracking-wide">
                            {effectiveViewMode === 'VOLUME'
                                ? (isMarketClosed ? t('volumePreMarket') : t('volumeActive'))
                                : t('oiSwing')}
                        </span>
                    </div>
                </div>

                {/* 3. Right: Toggles */}
                <div className="flex bg-slate-950 rounded-md p-1 border border-white/10 shrink-0">
                    <button
                        onClick={() => setUserViewMode('VOLUME')}
                        className={`px-4 py-1.5 text-[10px] font-black rounded transition-all uppercase tracking-wider ${effectiveViewMode === 'VOLUME' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Volume
                    </button>
                    <button
                        onClick={() => setUserViewMode('OI')}
                        className={`px-4 py-1.5 text-[10px] font-black rounded transition-all uppercase tracking-wider ${effectiveViewMode === 'OI' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        OI
                    </button>
                </div>
            </div>

            {/* Tactical Intel Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 h-[780px]">

                {/* 1. Main Radar Chart & Whale Feed */}
                <Card className="bg-slate-900/80 border-white/10 shadow-2xl relative overflow-hidden order-2 lg:order-1 rounded-lg flex flex-col h-full">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                    <CardContent className="p-6 relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
                        {/* [TOP] HOLOGRAPHIC WHALE STREAM (Relocated) */}
                        <div className="relative mb-4 -mx-4 -mt-3">
                            {/* Decorative Line (The "Stream") */}
                            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent blur-[1px]" />

                            <div className="relative pl-6 pb-2">
                                <div className="flex items-center gap-3 mb-3">
                                    <h3 className="text-base font-black text-white flex items-center gap-2 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] tracking-widest uppercase">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                                        LEVEL 3: CLASSIFIED ORDER FLOW
                                    </h3>
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-rose-950/40 border border-rose-500/40 text-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)] animate-pulse tracking-widest">
                                        TOP SECRET // EYES ONLY
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-bold ml-2 tracking-wide hidden sm:inline-block">
                                        ℹ️ Cost (평단가) • BEP (손익분기점)
                                    </span>
                                </div>

                                {/* Horizontal Scroll Container */}
                                <div
                                    className="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 scrollbar-hide mask-linear-gradient"
                                    style={{ maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)' }}
                                >
                                    {whaleTrades.length === 0 ? (
                                        <div className="min-w-[300px] h-[100px] flex items-center justify-center text-cyan-500/30 font-mono text-sm border border-cyan-500/10 rounded-xl bg-cyan-950/10 backdrop-blur-sm">
                                            Scanning for Classified Intel...
                                        </div>
                                    ) : (
                                        whaleTrades.map((t, i) => {
                                            const isHighImpact = t.premium >= 500000;
                                            const isMedImpact = t.premium >= 100000 && t.premium < 500000;
                                            const isCall = t.type === 'CALL';

                                            // Impact Label
                                            const impactLabel = isHighImpact ? "HIGH" : isMedImpact ? "MED" : "LOW";
                                            const impactTextColor = isHighImpact ? "text-amber-400" : isMedImpact ? "text-indigo-400" : "text-slate-400";

                                            // Strategy Logic
                                            const moneyness = t.strike / currentPrice;
                                            let strategyMain = "";
                                            let strategySub = "";
                                            if (isCall && moneyness < 0.60) {
                                                strategyMain = "STOCK REPL"; strategySub = "주식대체";
                                            } else if (isCall && moneyness < 0.85) {
                                                strategyMain = "LEVERAGE"; strategySub = "레버리지";
                                            } else {
                                                const isBlock = t.size >= 500;
                                                strategyMain = isBlock ? "BLOCK" : "SWEEP";
                                            }

                                            // [V3.7.3] Sniper Logic: Local BEP Calculation
                                            // Unit Cost = Premium / (Size * 100)
                                            const unitCost = t.premium / (t.size * 100);
                                            const bep = isCall ? t.strike + unitCost : t.strike - unitCost;
                                            const bepDist = ((bep - currentPrice) / currentPrice) * 100;
                                            const isInMoney = (isCall && currentPrice > t.strike) || (!isCall && currentPrice < t.strike);

                                            // Node Color Theme
                                            const nodeBorder = isHighImpact ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)]' :
                                                isCall ? 'border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
                                                    'border-rose-500/60 shadow-[0_0_10px_rgba(244,63,94,0.2)]';

                                            const nodeBg = isHighImpact ? 'bg-amber-950/40' : 'bg-slate-900/60';

                                            // Blinking Border Logic (Overlay)
                                            const ShowBlink = isHighImpact || i === 0;
                                            const BlinkColor = isHighImpact ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.6)]' : 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)]';

                                            return (
                                                <div
                                                    key={t.id || i}
                                                    className={`
                                                        relative min-w-[220px] p-3.5 rounded-xl border-2 backdrop-blur-md flex flex-col justify-between gap-2
                                                        transition-all duration-500 hover:scale-105 hover:z-10 bg-gradient-to-b from-white/10 to-transparent
                                                        animate-in fade-in slide-in-from-right-4
                                                        ${nodeBorder} ${nodeBg}
                                                    `}
                                                >
                                                    {/* Blinking Border Overlay */}
                                                    {ShowBlink && (
                                                        <div className={`absolute inset-[-2px] rounded-xl border-2 ${BlinkColor} animate-pulse pointer-events-none`} />
                                                    )}

                                                    {/* Row 1: Ticker & Time */}
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-white tracking-wider flex items-center gap-1.5 shadow-black/50 drop-shadow-md">
                                                                {isHighImpact && <span className="text-amber-400 animate-spin-slow">☢️</span>} {t.underlying || ticker}
                                                            </span>
                                                            <span className="text-[11px] text-slate-400 font-mono mt-0.5 opacity-0 h-0 overflow-hidden">
                                                                {/* Hidden for layout balance, moved to Row 2 */}
                                                            </span>
                                                        </div>
                                                        <div className="text-right flex flex-col items-end">
                                                            <div className={`text-[11px] font-bold px-2 py-0.5 rounded mb-1 flex items-center gap-1.5 ${isCall ? 'text-emerald-300 bg-emerald-500/20' : 'text-rose-300 bg-rose-500/20'}`}>
                                                                <span>{t.type}</span>
                                                                <span className="opacity-50">|</span>
                                                                {/* [Fix] Direct string parsing to avoid UTC->EST shift (e.g. 2025-01-16 -> Jan 15) */}
                                                                <span>{t.expiry.substring(5).replace('-', '/')}</span>
                                                            </div>
                                                            <div className={`text-[9px] font-bold tracking-wider ${impactTextColor}`}>
                                                                IMPACT: {impactLabel}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Strategy & Strike (Expanded) */}
                                                    <div className="flex justify-between items-end border-b border-white/10 pb-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-bold text-cyan-200">{strategyMain}</span>
                                                            <span className="text-xs font-bold text-cyan-300 mt-0.5 font-mono">
                                                                {new Date(t.tradeDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' })} {t.timeET}
                                                            </span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-sm font-bold text-white">Strike ${t.strike}</span>
                                                            <div className="text-xs font-bold text-slate-300 font-mono flex items-center justify-end gap-1 mt-0.5">
                                                                <span className={bepDist > 0 ? "text-emerald-400 drop-shadow-sm" : "text-rose-400 drop-shadow-sm"}>
                                                                    BEP ${bep.toFixed(2)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Row 3: Premium & Size */}
                                                    <div className="flex justify-between items-center">
                                                        <div className={`text-sm font-black tracking-tight ${isHighImpact ? 'text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]' : 'text-white'}`}>
                                                            ${(t.premium / 1000).toFixed(0)}K
                                                        </div>
                                                        <div className="text-[11px] font-mono text-slate-300">
                                                            {t.size} cts
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* THE RADAR LIST (Top 2/3) */}
                        <div className="flex-none pb-4 mt-2">
                            <div className="grid grid-cols-[1fr_80px_1fr] gap-4 mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 text-center shrink-0">
                                <div className="text-rose-500/50 flex items-center justify-end gap-2">
                                    <span className="hidden md:inline">{t('putFlowDown')}</span> <div className="w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                                </div>
                                <div className="text-slate-300">Strike</div>
                                <div className="text-emerald-500/50 flex items-center gap-2">
                                    <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> <span className="hidden md:inline">{t('callFlowUp')}</span>
                                </div>
                            </div>
                        </div>

                        <div
                            ref={scrollContainerRef}
                            className="relative flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto overflow-x-hidden p-2 bg-[#0f172a]/30 rounded-lg border border-slate-800/50 shadow-inner"
                            style={{
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#334155 #0f172a'
                            }}
                        >
                            <style jsx>{`
                                div::-webkit-scrollbar {
                                    width: 8px;
                                }
                                div::-webkit-scrollbar-track {
                                    background: #1e293b;
                                    border-radius: 4px;
                                }
                                div::-webkit-scrollbar-thumb {
                                    background: #64748b;
                                    border-radius: 4px;
                                }
                                div::-webkit-scrollbar-thumb:hover {
                                    background: #94a3b8;
                                }
                            `}</style>
                            {flowMap.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                                    <p>No Options Data</p>
                                </div>
                            ) : (
                                flowMap.map((row, index) => {
                                    const isAtMoney = Math.abs(row.strike - currentPrice) / currentPrice < 0.005;
                                    const callVal = effectiveViewMode === 'VOLUME' ? row.callVol : row.callOI;
                                    const putVal = effectiveViewMode === 'VOLUME' ? row.putVol : row.putOI;
                                    const callPct = Math.min((callVal / maxVal) * 100, 100);
                                    const putPct = Math.min((putVal / maxVal) * 100, 100);

                                    const isCallWallStrike = row.strike === callWall;
                                    const isPutWallStrike = row.strike === putWall;

                                    // Logic for 'showCurrentLineHere'
                                    // Assuming descending sort (High Strike -> Low Strike)
                                    // We show the line AFTER this row if: Current Price is between this row(High) and next row(Low)
                                    const nextRow = flowMap[index + 1];
                                    const showCurrentLineHere = nextRow && (row.strike >= currentPrice && nextRow.strike < currentPrice);

                                    return (
                                        <React.Fragment key={row.strike}>
                                            <div className={`grid grid-cols-[1fr_80px_1fr] gap-4 items-center group hover:bg-white/5 rounded-lg py-1 transition-colors ${isAtMoney ? "bg-indigo-500/10 border border-indigo-500/20" : ""}`}>
                                                {/* PUT Side */}
                                                <div className="flex justify-end items-center h-6 relative">
                                                    <span className={`text-[9px] font-mono mr-2 ${putVal > 0 ? "text-rose-400" : "text-slate-700"}`}>
                                                        {putVal > 0 ? putVal.toLocaleString() : ""}
                                                    </span>
                                                    <div
                                                        className={`h-4 rounded-l-sm transition-all duration-700 relative overflow-hidden flex items-center justify-end ${isPutWallStrike ? "shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse" : "shadow-[0_0_10px_rgba(244,63,94,0.1)]"}`}
                                                        style={{ width: `${putPct}%` }}
                                                    >
                                                        <div className={`absolute inset-0 ${isPutWallStrike ? "bg-gradient-to-l from-rose-500 to-rose-700" : "bg-gradient-to-l from-rose-500/10 via-rose-500/40 to-rose-500 border-l border-rose-500/50"}`} />
                                                        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[size:10px_10px]" />
                                                    </div>
                                                </div>

                                                {/* Strike */}
                                                <div className="flex justify-center relative">
                                                    {isAtMoney && <div className="absolute inset-0 bg-indigo-500/20 blur-md rounded-full animate-pulse" />}
                                                    <span className={`text-xs font-mono font-bold z-10 ${isAtMoney ? "text-white scale-110 drop-shadow-[0_0_5px_rgba(99,102,241,0.8)]" : isCallWallStrike || isPutWallStrike ? "text-amber-200" : "text-slate-500 group-hover:text-slate-300"}`}>
                                                        {row.strike}
                                                    </span>
                                                    {isCallWallStrike && <div className="absolute -right-3 top-1 text-[8px] text-emerald-400 font-black animate-bounce drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]">R</div>}
                                                    {isPutWallStrike && <div className="absolute -left-3 top-1 text-[8px] text-rose-400 font-black animate-bounce drop-shadow-[0_0_5px_rgba(244,63,94,0.8)]">S</div>}
                                                </div>

                                                {/* CALL Side */}
                                                <div className="flex justify-start items-center h-6 relative">
                                                    <div
                                                        className={`h-4 rounded-r-sm transition-all duration-700 relative overflow-hidden flex items-center justify-start ${isCallWallStrike ? "shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-pulse" : "shadow-[0_0_10px_rgba(16,185,129,0.1)]"}`}
                                                        style={{ width: `${callPct}%` }}
                                                    >
                                                        <div className={`absolute inset-0 ${isCallWallStrike ? "bg-gradient-to-r from-emerald-500 to-emerald-700" : "bg-gradient-to-r from-emerald-500/10 via-emerald-500/40 to-emerald-500 border-r border-emerald-500/50"}`} />
                                                        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[size:10px_10px]" />
                                                    </div>
                                                    <span className={`text-[9px] font-mono ml-2 ${callVal > 0 ? "text-emerald-400" : "text-slate-700"}`}>
                                                        {callVal > 0 ? callVal.toLocaleString() : ""}
                                                    </span>
                                                </div>
                                            </div>

                                            {showCurrentLineHere && (
                                                <div className="col-span-3 py-1 relative" ref={currentPriceLineRef}>
                                                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-sky-500/30 border-t border-dashed border-sky-400/50 shadow-[0_0_5px_rgba(14,165,233,0.3)]" />
                                                    <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-slate-900 border border-sky-500/50 px-3 py-0.5 rounded-full z-20 shadow-[0_0_15px_rgba(14,165,233,0.4)] flex items-center gap-2 animate-pulse backdrop-blur-sm">
                                                        <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-ping" />
                                                        <span className="text-[10px] font-black text-sky-400 tracking-wide">
                                                            ${currentPrice.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </div>


                    </CardContent>
                </Card>

                {/* 2. Tactical Briefing Console (Korean Mode) */}
                <div className="order-1 lg:order-2 h-full">
                    {/* Consistent Glass Panel for Right Side */}
                    <Card className="bg-slate-900/30 backdrop-blur-md border-white/10 flex flex-col rounded-xl h-full min-h-0 shadow-2xl relative overflow-hidden">
                        {/* Subtle Grid Background */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-50" />

                        <CardContent className="p-5 space-y-3 flex flex-col h-full relative z-10">
                            <div className="flex items-center gap-2 mb-1 select-none shrink-0 border-b border-white/5 pb-3">
                                <Lock size={12} className="text-amber-500" />
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] flex-1">
                                    LEVEL 3 INSTITUTIONAL DATA
                                </span>
                                <div className="flex gap-1">
                                    <div className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                    <div className="w-1 h-1 rounded-full bg-amber-500/50" />
                                    <div className="w-1 h-1 rounded-full bg-amber-500/30" />
                                </div>
                            </div>

                            {/* Institutional Data Description */}
                            <p className="text-[10px] text-slate-400 leading-relaxed mb-1 shrink-0 px-1">
                                {t('hiddenPositionDesc')}
                            </p>

                            {/* 1. Current Position Status (Hero Block) - Glass */}
                            <div className="bg-gradient-to-b from-white/5 to-transparent rounded-lg border border-white/10 p-3 text-center relative overflow-hidden group shrink-0 transition-all hover:bg-white/10">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">{t('currentPositionSuggestion')}</span>
                                <div className={`text-sm font-black tracking-tight flex items-center justify-center gap-2 ${analysis?.color || "text-slate-300"}`}>
                                    {analysis?.status === 'RANGE BOUND' && <Activity size={16} />}
                                    {analysis?.status === 'BULLISH' && <TrendingUp size={16} />}
                                    {analysis?.status === 'BEARISH' && <TrendingDown size={16} />}
                                    <span className="drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{analysis?.status}</span>
                                </div>
                            </div>

                            {/* 2. Probability Meter */}
                            {analysis?.probability && analysis.probability !== 50 && (
                                <div className="space-y-1.5 shrink-0 mt-1 px-1">
                                    <div className="flex justify-between items-end px-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t('probabilityAnalysis')}</span>
                                        <span className={`text-[10px] font-bold ${analysis.probColor}`}>{analysis.probLabel}</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-800/50 rounded-full overflow-hidden relative border border-white/5">
                                        <div
                                            className={`h-full rounded-full shadow-[0_0_10px_currentColor] transition-all duration-1000 ${analysis.probColor.replace('text', 'bg')}`}
                                            style={{ width: `${analysis.probability}%` }}
                                        />
                                    </div>
                                    <div className="text-[9px] text-right text-slate-500 font-mono opacity-70">{analysis.probability.toFixed(0)}%</div>
                                </div>
                            )}

                            {/* 3. Analysis Message Box - High Visibility Glass */}
                            <div className="bg-indigo-950/40 rounded-lg border border-indigo-500/30 p-3.5 relative shrink-0 mt-1 backdrop-blur-md shadow-lg shadow-indigo-500/10 group hover:bg-indigo-900/40 transition-colors">
                                <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-400 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.6)] group-hover:bg-indigo-300 transition-colors" />
                                <div className="flex gap-3 pl-3">
                                    <div className="mt-0.5 shrink-0">
                                        {analysis?.status === 'BULLISH' ? <TrendingUp size={16} className="text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" /> :
                                            analysis?.status === 'BEARISH' ? <TrendingDown size={16} className="text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.5)]" /> :
                                                <Activity size={16} className="text-indigo-400 drop-shadow-[0_0_5px_rgba(129,140,248,0.5)]" />}
                                    </div>
                                    <p className="text-xs leading-relaxed text-indigo-50 font-medium font-sans whitespace-pre-line shadow-black/50 drop-shadow-sm">
                                        {analysis?.message}
                                    </p>
                                </div>
                            </div>

                            <hr className="border-white/5 my-2" />

                            {/* Chart Interpretation Tips */}
                            <div className="space-y-2 shrink-0 px-1">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <Lightbulb size={10} /> {t('chartInterpretation')}
                                </div>
                                <div className="space-y-3 text-[11px]">
                                    <div className="flex items-start gap-3 group">
                                        <div className="mt-0.5 p-1 rounded bg-amber-500/10 border border-amber-500/20 group-hover:border-amber-500/40 transition-colors">
                                            <Zap size={10} className="text-amber-400 shrink-0" />
                                        </div>
                                        <div>
                                            <span className="text-amber-100/90 font-bold block leading-none mb-1 text-[10px] tracking-wide">깜빡이는 바 (Pulse)</span>
                                            <p className="text-[11px] text-slate-400 leading-snug">지금 세력 자금이 몰리는 <span className="text-amber-300 font-bold">핫스팟</span>입니다.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 group">
                                        <div className="mt-0.5 p-1 rounded bg-emerald-500/10 border border-emerald-500/20 group-hover:border-emerald-500/40 transition-colors">
                                            <TrendingUp size={10} className="text-emerald-400 shrink-0" />
                                        </div>
                                        <div>
                                            <span className="text-emerald-100/90 font-bold block leading-none mb-1 text-[10px] tracking-wide">{t('buyTactic')}</span>
                                            <p className="text-[11px] text-slate-400 leading-snug">{t('buyTacticDetail')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 group">
                                        <div className="mt-0.5 p-1 rounded bg-rose-500/10 border border-rose-500/20 group-hover:border-rose-500/40 transition-colors">
                                            <TrendingDown size={10} className="text-rose-400 shrink-0" />
                                        </div>
                                        <div>
                                            <span className="text-rose-100/90 font-bold block leading-none mb-1 text-[10px] tracking-wide">{t('sellTactic')}</span>
                                            <p className="text-[11px] text-slate-400 leading-snug">{t('sellTacticDetail')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Key Levels (Final Optimized Fit - Glass Style) */}
                            <div className="mt-2 grid grid-cols-1 gap-1">
                                {/* Top: Call Wall */}
                                <div className="bg-gradient-to-r from-emerald-950/20 to-emerald-900/10 border border-emerald-500/20 p-3 h-[64px] rounded-sm flex items-center justify-between group relative overflow-hidden backdrop-blur-sm hover:border-emerald-500/40 transition-all">
                                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent opacity-50" />
                                    <div>
                                        <div className="text-[10px] text-emerald-500 font-black uppercase tracking-wider flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-sm shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse" /> CALL WALL ({t('resistance')})
                                        </div>
                                    </div>
                                    <div className="text-xl font-black text-emerald-400 font-mono tracking-tight shadow-emerald-500/20 drop-shadow-lg">${callWall}</div>
                                </div>

                                {/* Middle: Ladder Visual (Clean Tech) */}
                                <div className="relative h-6 flex flex-col justify-center items-center">
                                    <div className="absolute top-0 bottom-0 w-[1px] bg-slate-700/50" />
                                    {(() => {
                                        const totalRange = callWall - putWall;
                                        const currentPos = currentPrice - putWall;
                                        let pct = (currentPos / totalRange) * 100;
                                        pct = Math.max(15, Math.min(85, pct));
                                        const topPct = 100 - pct;

                                        return (
                                            <div
                                                className="absolute w-full flex items-center justify-center transition-all duration-1000 ease-out"
                                                style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
                                            >
                                                <div className="bg-slate-900/90 border border-indigo-400/50 text-[11px] font-bold text-indigo-300 px-3 py-0.5 rounded-sm shadow-[0_0_15px_rgba(99,102,241,0.3)] z-10 flex items-center gap-1.5 backdrop-blur-md">
                                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" /> ${currentPrice.toFixed(2)}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Bottom: Put Floor */}
                                <div className="bg-gradient-to-r from-rose-950/20 to-rose-900/10 border border-rose-500/20 p-3 h-[64px] rounded-sm flex items-center justify-between group relative overflow-hidden backdrop-blur-sm hover:border-rose-500/40 transition-all">
                                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/30 to-transparent opacity-50" />
                                    <div>
                                        <div className="text-[10px] text-rose-500 font-black uppercase tracking-wider flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-sm shadow-[0_0_5px_rgba(244,63,94,0.8)] animate-pulse" /> PUT FLOOR ({t('support')})
                                        </div>
                                    </div>
                                    <div className="text-xl font-black text-rose-400 font-mono tracking-tight shadow-rose-500/20 drop-shadow-lg">${putWall}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
