"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Radar, Target, Crosshair, Zap, Layers, Info, TrendingUp, TrendingDown, Activity, Lightbulb, Percent, Lock, Shield } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "./ui/progress";

interface FlowRadarProps {
    ticker: string;
    rawChain: any[];
    currentPrice: number;
}

export function FlowRadar({ ticker, rawChain, currentPrice }: FlowRadarProps) {
    const [userViewMode, setUserViewMode] = useState<'VOLUME' | 'OI' | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // State for Live Whale Trades [V3.7.3]
    const [whaleTrades, setWhaleTrades] = useState<any[]>([]);
    const [tradesLoading, setTradesLoading] = useState(false);

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

    // Auto-scroll to ATM (current price) on mount
    useEffect(() => {
        if (scrollContainerRef.current && flowMap.length > 0) {
            // Use setTimeout to ensure DOM is rendered
            setTimeout(() => {
                const atmIndex = flowMap.findIndex(row =>
                    Math.abs(row.strike - currentPrice) / currentPrice < 0.02
                );
                if (atmIndex >= 0 && scrollContainerRef.current) {
                    const rows = scrollContainerRef.current.children;
                    if (rows[atmIndex]) {
                        rows[atmIndex].scrollIntoView({ block: 'center', behavior: 'auto' });
                    }
                }
            }, 100);
        }
    }, [flowMap, currentPrice]);

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

    // [LEVEL 3] INSTITUTIONAL ANALYSIS ENGINE (Structure + Flow)
    const analysis = useMemo(() => {
        if (!flowMap || flowMap.length === 0) return null;

        const distToCall = ((callWall - currentPrice) / currentPrice) * 100;
        const distToPut = ((currentPrice - putWall) / currentPrice) * 100; // Negative value usually

        // 2. Whale Sentiment Analysis (The "Flow" - Momentum)
        let netWhalePremium = 0;
        let whaleCallCount = 0;
        let whalePutCount = 0;
        let highImpactCount = 0;

        whaleTrades.forEach(t => {
            if (t.premium > 50000) highImpactCount++;
            if (t.type === 'CALL') {
                netWhalePremium += t.premium;
                whaleCallCount++;
            } else {
                netWhalePremium -= t.premium;
                whalePutCount++;
            }
        });

        const whaleBias = netWhalePremium > 1000000 ? 'STRONG_BULL' // > $1M Net
            : netWhalePremium > 200000 ? 'BULLISH'
                : netWhalePremium < -1000000 ? 'STRONG_BEAR' // < -$1M Net
                    : netWhalePremium < -200000 ? 'BEARISH'
                        : 'NEUTRAL';

        // 3. The "Superhuman" Synthesis (Fusion Logic)
        let status = "판단 보류 (SCANNING)";
        let message = "세력들의 움직임을 분석 중입니다...";
        let color = "text-slate-400";
        let probability = 50;
        let probLabel = "중립 (Neutral)";
        let probColor = "text-slate-400";

        // Logic Branching
        if (currentPrice > callWall) {
            // SCENARIO: Price is ABOVE Resistance (Breakout State)
            if (whaleBias.includes('BULL')) {
                status = "🚀 초강력 상승 (SUPER-CYCLE)";
                message = `구조적 저항벽($${callWall})이 붕괴되었습니다. 여기에 고래들의 '추격 매수(Net +$${(netWhalePremium / 1000).toFixed(0)}K)'가 기름을 붓고 있습니다. 이것은 단순 돌파가 아닌 '시세 폭발'입니다.`;
                probability = 95;
                probLabel = "확신 (Conviction)";
                probColor = "text-emerald-400";
                color = "text-emerald-400";
            } else {
                status = "⚠️ 돌파 후 숨고르기";
                message = `저항벽($${callWall})을 뚫었으나, 고래들의 수급은 잠시 멈췄습니다(Neutral). 개미들만 흥분한 상태일 수 있으니 '되돌림(Pullback)' 지지 테스트를 확인하십시오.`;
                probability = 60;
                probLabel = "관망 (Wait)";
                probColor = "text-amber-400";
                color = "text-amber-400";
            }
        }
        else if (currentPrice < putWall) {
            // SCENARIO: Price is BELOW Support (Breakdown State)
            if (whaleBias.includes('BEAR')) {
                status = "📉 지지선 붕괴 (COLLAPSE)";
                message = `최후의 지지벽($${putWall})이 무너졌습니다. 고래들은 이미 하방(Put)에 베팅 금액(Net -$${Math.abs(netWhalePremium / 1000).toFixed(0)}K)을 늘리고 있습니다. 투매가 나올 수 있습니다.`;
                probability = 15; // Success prob for bulls is low
                probLabel = "위험 (Danger)";
                probColor = "text-rose-500";
                color = "text-rose-500";
            } else {
                status = "🪤 과매도 함정 (BEAR TRAP?)";
                message = `지지벽($${putWall})이 깨졌지만, 고래들은 투매에 동참하지 않고 있습니다. '패닉 셀'을 받아먹는 저점 매집일 가능성이 큽니다. 반등에 대비하십시오.`;
                probability = 40;
                probLabel = "주의 (Caution)";
                probColor = "text-amber-500";
                color = "text-amber-500";
            }
        }
        else {
            // SCENARIO: Inside the Range (Between Walls)
            const isNearRes = distToCall < 1.0; // Within 1% of Resistance
            const isNearSup = Math.abs(distToPut) < 1.0; // Within 1% of Support

            if (isNearRes) {
                if (whaleBias.includes('BULL')) {
                    status = "⚡ 돌파 임박 (BREAKOUT READY)";
                    message = `주가가 저항벽($${callWall})을 두드리고 있습니다. 더 중요한 건, 고래들이 이 타이밍에 '콜옵션'을 쓸어담고 있다는 점입니다. 벽이 곧 뚫립니다. 탑승하십시오.`;
                    probability = 88;
                    probLabel = "강력 매수 (Strong Buy)";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else if (whaleBias.includes('BEAR')) {
                    status = "⛔ 가짜 돌파 경고 (FAKE-OUT)";
                    message = `주가는 오르는 척하지만, 고래들은 조용히 '풋옵션'을 매집하며 하락 통수를 준비 중입니다. 전형적인 '개미 꼬시기' 패턴입니다. 속지 마십시오.`;
                    probability = 20;
                    probLabel = "매도/탈출 (Sell)";
                    probColor = "text-rose-500";
                    color = "text-rose-500";
                } else {
                    status = "⚔️ 저항선 공방 (TESTING)";
                    message = `거대한 저항벽($${callWall}) 앞에서 매수/매도 세력이 충돌하고 있습니다. 고래들도 방향을 잡지 못하고 눈치게임 중입니다. 돌파 여부를 확인하고 진입하십시오.`;
                    probability = 50;
                    color = "text-amber-400";
                }
            } else if (isNearSup) {
                if (whaleBias.includes('BEAR')) {
                    status = "💀 추가 하락 경고 (DANGER)";
                    message = `지지벽($${putWall})에서 반등해야 할 자리지만, 고래들의 자금은 하방(Put)으로 쏠리고 있습니다. 지지선이 뚫릴 확률이 매우 높습니다. 절대 물타기 금지.`;
                    probability = 10;
                    probLabel = "매도 (Exit)";
                    probColor = "text-rose-500";
                    color = "text-rose-500";
                } else if (whaleBias.includes('BULL')) {
                    status = "💎 바닥 확인 (BOTTOM FISHING)";
                    message = `주가는 바닥($${putWall})에 도달했고, 스마트머니(Whale)는 여기서 '반등'에 배팅하고 있습니다. 손익비가 가장 좋은 '매수 타점'입니다.`;
                    probability = 80;
                    probLabel = "매수 기회 (Buy Dip)";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else {
                    status = "🛡️ 지지선 테스트 (DEFENSE)";
                    message = `주요 지지선($${putWall})을 테스트 중입니다. 기술적 반등이 나올 수 있는 자리이나, 고래들의 뚜렷한 유입은 아직 없습니다. 분할 매수로 접근하십시오.`;
                    probability = 60;
                    color = "text-indigo-400";
                }
            } else {
                // Middle of Range
                if (whaleBias === 'STRONG_BULL' || whaleBias === 'BULLISH') {
                    status = "📈 상승 모멘텀 (MOMENTUM)";
                    message = `박스권 중간이지만 고래들의 자금이 상방으로 계속 유입되고 있습니다(Net +$${(netWhalePremium / 1000).toFixed(0)}K). 저항벽($${callWall})을 향해 순항할 것입니다.`;
                    probability = 70;
                    probLabel = "매수 우위 (Bullish)";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else if (whaleBias === 'STRONG_BEAR' || whaleBias === 'BEARISH') {
                    status = "📉 하락 압력 (PRESSURE)";
                    message = `상승 동력이 약합니다. 고래들은 지속적으로 물량을 정리하거나 하락에 베팅(Net -$${Math.abs(netWhalePremium / 1000).toFixed(0)}K)하고 있습니다. 지지선($${putWall})까지 밀릴 수 있습니다.`;
                    probability = 30;
                    probLabel = "매도 우위 (Bearish)";
                    probColor = "text-rose-400";
                    color = "text-rose-400";
                } else {
                    status = "⚖️ 박스권 횡보 (RANGE BOUND)";
                    message = `현재 주가($${currentPrice})는 바닥($${putWall})과 천장($${callWall})의 중간 지대(No Man's Land)에 갇혀 있습니다. 고래들의 움직임도 없습니다. 뚜렷한 방향이 나올 때까지 관망하십시오.`;
                    probability = 50;
                    probLabel = "중립 (Neutral)";
                    probColor = "text-slate-500";
                    color = "text-slate-400";
                }
            }
        }

        return { status, message, color, probability, probLabel, probColor, whaleBias };
    }, [currentPrice, callWall, putWall, flowMap, whaleTrades]);

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
                                ? (isMarketClosed ? "⚡ Volume(거래량): 장전(Pre) 대기중 - 본장 시작 시 활성화" : "⚡ Volume(거래량): '단타/모멘텀' - 오늘 고래들이 싸우는 현장")
                                : "🏰 OI(누적매물): '스윙/추세' - MM이 설계한 진짜 지지/저항 성벽"}
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
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

                {/* 1. Main Radar Chart & Whale Feed */}
                <Card className="bg-slate-900/80 border-white/10 shadow-2xl relative overflow-hidden order-2 lg:order-1 rounded-lg flex flex-col h-[780px]">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                    <CardContent className="p-6 relative z-10 flex-1 flex flex-col min-h-0">
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
                                                            <span className="text-[11px] text-slate-400 font-mono mt-0.5">{t.timeET}</span>
                                                        </div>
                                                        <div className="text-right flex flex-col items-end">
                                                            <div className={`text-[11px] font-bold px-2 py-0.5 rounded mb-1 ${isCall ? 'text-emerald-300 bg-emerald-500/20' : 'text-rose-300 bg-rose-500/20'}`}>
                                                                {t.type}
                                                            </div>
                                                            <div className={`text-[9px] font-bold tracking-wider ${impactTextColor}`}>
                                                                IMPACT: {impactLabel}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Strategy & Strike */}
                                                    <div className="flex justify-between items-end border-b border-white/10 pb-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-bold text-cyan-200">{strategyMain}</span>
                                                            {strategySub && <span className="text-[10px] text-cyan-400/80 font-medium">{strategySub}</span>}
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-sm font-bold text-white">STRIKE ${t.strike}</span>
                                                            <div className="text-[10px] text-slate-500">EXP {t.expiry.slice(5)}</div>
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
                                    <span className="hidden md:inline">Put Flow (하락)</span> <div className="w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                                </div>
                                <div className="text-slate-300">Strike</div>
                                <div className="text-emerald-500/50 flex items-center gap-2">
                                    <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> <span className="hidden md:inline">Call Flow (상승)</span>
                                </div>
                            </div>
                        </div>

                        <div
                            ref={scrollContainerRef}
                            className="space-y-1.5 overflow-y-auto pr-2 relative flex-[2] min-h-0 border-b border-white/5 pb-6"
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
                                                        className={`h-4 rounded-l-sm transition-all duration-700 relative overflow-hidden ${isPutWallStrike ? "shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse" : ""}`}
                                                        style={{ width: `${putPct}%` }}
                                                    >
                                                        <div className={`absolute inset-0 ${isPutWallStrike ? "bg-gradient-to-l from-rose-500 to-rose-700" : "bg-gradient-to-l from-rose-500/80 to-rose-900/50"}`} />
                                                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
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
                                                        className={`h-4 rounded-r-sm transition-all duration-700 relative overflow-hidden ${isCallWallStrike ? "shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-pulse" : ""}`}
                                                        style={{ width: `${callPct}%` }}
                                                    >
                                                        <div className={`absolute inset-0 ${isCallWallStrike ? "bg-gradient-to-r from-emerald-500 to-emerald-700" : "bg-gradient-to-r from-emerald-500/80 to-emerald-900/50"}`} />
                                                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                                                    </div>
                                                    <span className={`text-[9px] font-mono ml-2 ${callVal > 0 ? "text-emerald-400" : "text-slate-700"}`}>
                                                        {callVal > 0 ? callVal.toLocaleString() : ""}
                                                    </span>
                                                </div>
                                            </div>

                                            {showCurrentLineHere && (
                                                <div className="col-span-3 py-1 relative">
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
                <div className="order-1 lg:order-2">
                    <Card className="bg-slate-900/60 border-white/10 flex flex-col rounded-lg h-[810px]">
                        <CardContent className="p-5 space-y-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-2 select-none shrink-0">
                                <Lock size={12} className="text-amber-500" />
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">
                                    LEVEL 3 INSTITUTIONAL DATA
                                </span>
                            </div>

                            {/* Institutional Data Description */}
                            <p className="text-[10px] text-slate-400 leading-relaxed mb-3 shrink-0">
                                이 차트는 일반 투자자들은 볼 수 없는 <span className="text-emerald-400 font-bold">"고래(Whale)와 마켓메이커(MM)"</span>의 숨겨진 포지션과 헷징 구조를 실시간 분석합니다. 단순 차트가 아닌 세력의 설계도입니다.
                            </p>

                            {/* 1. Current Position Status (Hero Block) - Compact */}
                            <div className="bg-[#0f172a] rounded-lg border border-slate-800 p-2 text-center shadow-inner relative overflow-hidden group shrink-0">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[10px] text-white font-bold uppercase tracking-wider block mb-1">현재 포지션 제안</span>
                                <div className={`text-sm font-black tracking-tight flex items-center justify-center gap-1.5 ${analysis?.color || "text-slate-300"}`}>
                                    {analysis?.status === 'RANGE BOUND' && <Activity size={14} />}
                                    {analysis?.status === 'BULLISH' && <TrendingUp size={14} />}
                                    {analysis?.status === 'BEARISH' && <TrendingDown size={14} />}
                                    {analysis?.status}
                                </div>
                            </div>

                            {/* 2. Probability Meter */}
                            {analysis?.probability && analysis.probability !== 50 && (
                                <div className="space-y-2 shrink-0">
                                    <div className="flex justify-between items-end px-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">% 확률 분석 (Beta)</span>
                                        <span className={`text-[10px] font-bold ${analysis.probColor}`}>{analysis.probLabel}</span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                                        <div
                                            className={`h-full rounded-full shadow-[0_0_10px_currentColor] transition-all duration-1000 ${analysis.probColor.replace('text', 'bg')}`}
                                            style={{ width: `${analysis.probability}%` }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                                    </div>
                                    <div className="text-[9px] text-right text-slate-500">{analysis.probability.toFixed(0)}%</div>
                                </div>
                            )}

                            {/* 3. Analysis Message Box */}
                            <div className="bg-[#0f172a] rounded-lg border border-slate-800 p-4 relative shrink-0">
                                <div className="absolute left-0 top-4 bottom-4 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                                <div className="flex gap-3 pl-2">
                                    <div className="mt-0.5">
                                        {analysis?.status === 'BULLISH' ? <TrendingUp size={14} className="text-emerald-400" /> :
                                            analysis?.status === 'BEARISH' ? <TrendingDown size={14} className="text-rose-400" /> :
                                                <Activity size={14} className="text-indigo-400" />}
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre-line">
                                        {analysis?.message}
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 min-h-[10px]" /> {/* Reduced Spacer */}

                            <hr className="border-slate-800/50 my-2" />

                            {/* Chart Interpretation Tips */}
                            <div className="space-y-2 shrink-0">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">차트 해석 비법</div>
                                <div className="space-y-1.5 text-[10px]">
                                    <div className="flex items-start gap-2">
                                        <Zap size={10} className="text-amber-400 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="text-amber-400 font-bold">깜빡이는 바 (Pulse)</span>
                                            <p className="text-slate-400">지금 세력 자금이 몰리는 <span className="text-amber-300">핫스팟</span>입니다.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <TrendingUp size={10} className="text-emerald-400 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="text-emerald-400 font-bold">전술 활용 (매수)</span>
                                            <p className="text-slate-400">주가가 <span className="text-emerald-300">녹색 벽(저항)</span>을 강하게 뚫으면 추격 매수 기회입니다.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <TrendingDown size={10} className="text-rose-400 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="text-rose-400 font-bold">전술 활용 (매도/방어)</span>
                                            <p className="text-slate-400">주가가 <span className="text-rose-300">붉은 벽(지지)</span> 아래로 깨지면 손절 혹은 하락 베팅 타이밍입니다.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Key Levels (Dynamic Ladder) - Restored & Refined */}
                            <div className="mt-auto pt-2 grid grid-cols-1 gap-1">
                                {/* Top: Call Wall */}
                                <div className="bg-gradient-to-b from-emerald-950/40 to-[#0f172a] border border-emerald-900/40 p-5 min-h-[90px] rounded-[2px] flex items-center justify-between group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-50" />
                                    <div>
                                        <div className="text-[10px] text-emerald-500 font-black uppercase tracking-wider flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-sm shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse" /> CALL WALL (저항)
                                        </div>
                                    </div>
                                    <div className="text-xl font-black text-emerald-400 font-mono tracking-tight">${callWall}</div>
                                </div>

                                {/* Middle: Ladder Visual (Restored) */}
                                <div className="relative h-14 bg-[#0f172a]/50 border-x border-slate-800/30 mx-3 flex flex-col justify-center items-center backdrop-blur-sm">
                                    <div className="absolute top-0 bottom-0 w-[1px] bg-slate-800" />
                                    {(() => {
                                        const totalRange = callWall - putWall;
                                        const currentPos = currentPrice - putWall;
                                        let pct = (currentPos / totalRange) * 100;
                                        pct = Math.max(15, Math.min(85, pct)); // Clamp to keep inside
                                        const topPct = 100 - pct;

                                        return (
                                            <div
                                                className="absolute w-full flex items-center justify-center transition-all duration-1000 ease-out"
                                                style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
                                            >
                                                <div className="bg-slate-900 border border-indigo-500 text-[10px] font-bold text-indigo-300 px-3 py-1 rounded-[2px] shadow-[0_0_10px_rgba(99,102,241,0.4)] z-10 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" /> ${currentPrice.toFixed(2)}
                                                </div>
                                                <div className="absolute w-[calc(100%+8px)] h-[1px] bg-indigo-500/30 border-t border-dotted border-indigo-500/50" />
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Bottom: Put Floor */}
                                <div className="bg-gradient-to-t from-rose-950/40 to-[#0f172a] border border-rose-900/40 p-5 min-h-[90px] rounded-[2px] flex items-center justify-between group relative overflow-hidden">
                                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent opacity-50" />
                                    <div>
                                        <div className="text-[10px] text-rose-500 font-black uppercase tracking-wider flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-sm shadow-[0_0_5px_rgba(244,63,94,0.8)] animate-pulse" /> PUT FLOOR (지지)
                                        </div>
                                    </div>
                                    <div className="text-xl font-black text-rose-400 font-mono tracking-tight">${putWall}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
