// [S-56.4.5] FlowRadar with optimized date display
"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Radar, Target, Crosshair, Zap, Layers, Info, TrendingUp, TrendingDown, Activity, Lightbulb, Percent, Lock, Shield, Loader2, AlertTriangle, BarChart3, Banknote } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "./ui/progress";
import { useTranslations } from 'next-intl';

interface FlowRadarProps {
    ticker: string;
    rawChain: any[];
    allExpiryChain?: any[];  // [GEX REGIME] Multi-expiry probe data
    gammaFlipLevel?: number | null;  // [GEX REGIME] Gamma flip price level from structureService
    oiPcr?: number | null;  // [PCR] OI-based Put/Call Ratio from structureService
    currentPrice: number;
    squeezeScore?: number | null;
    squeezeRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
}

export function FlowRadar({ ticker, rawChain, allExpiryChain, gammaFlipLevel, oiPcr, currentPrice, squeezeScore: apiSqueezeScore, squeezeRisk: apiSqueezeRisk }: FlowRadarProps) {
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
    const [flowViewMode, setFlowViewMode] = useState<'WHALE' | 'DARKPOOL'>('WHALE');
    const [darkPoolTrades, setDarkPoolTrades] = useState<any[]>([]);

    // [NEW] Realtime Metrics State (Dark Pool, Short Vol, Bid-Ask, Block Trade)
    const [realtimeMetrics, setRealtimeMetrics] = useState<{
        darkPool: { percent: number; volume: number; totalVolume: number; buyPct?: number; sellPct?: number; buyVolume?: number; sellVolume?: number; buyVwap?: number; sellVwap?: number; netBuyValue?: number } | null;
        shortVolume: { percent: number; volume: number; totalVolume: number } | null;
        bidAsk: { spread: number; label: string } | null;
        blockTrade: { count: number; volume: number } | null;
    }>({ darkPool: null, shortVolume: null, bidAsk: null, blockTrade: null });

    // [Fix] Reset State on Ticker Change (Prevent Stale Data)
    useEffect(() => {
        setWhaleTrades([]);
        setDarkPoolTrades([]);
        setIsSystemReady(false);
        setRealtimeMetrics({ darkPool: null, shortVolume: null, bidAsk: null, blockTrade: null });
    }, [ticker]);

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

    // [NEW] Fetch Realtime Metrics (Dark Pool, Short Vol, Bid-Ask, Block Trade)
    const fetchRealtimeMetrics = async () => {
        try {
            const res = await fetch(`/api/flow/realtime-metrics?ticker=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setRealtimeMetrics({
                    darkPool: data.darkPool,
                    shortVolume: data.shortVolume,
                    bidAsk: data.bidAsk,
                    blockTrade: data.blockTrade,
                });
            }
        } catch (e) {
            console.error('[FlowRadar] Realtime metrics fetch error:', e);
        }
    };

    // [NEW] Fetch Dark Pool Trades
    const fetchDarkPoolTrades = async () => {
        try {
            const res = await fetch(`/api/flow/dark-pool-trades?ticker=${ticker}&limit=30`);
            if (res.ok) {
                const data = await res.json();
                setDarkPoolTrades(data.items || []);
            }
        } catch (e) {
            console.error('[FlowRadar] Dark pool trades fetch error:', e);
        }
    };

    // Poll for trades and realtime metrics
    useEffect(() => {
        if (rawChain.length > 0) {
            fetchWhaleTrades();
            fetchRealtimeMetrics();
            fetchDarkPoolTrades();
            const interval = setInterval(() => {
                fetchWhaleTrades();
                fetchRealtimeMetrics();
                fetchDarkPoolTrades();
            }, 15000); // Every 15s
            return () => clearInterval(interval);
        }
    }, [rawChain, ticker]);

    // [REMOVED] News Sentiment, Treasury, Risk Factors - Now displayed in Command page gauges

    // Process Data: Group by Strike with DTE filtering
    // [S-77] Industry Standard: VOLUME = 0-7 DTE (short-term gamma), OI = 0-35 DTE (mid-term positioning)
    const { flowMap, totalVolume } = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { flowMap: [], totalVolume: 0 };

        // DTE filtering based on view mode
        // [FIX] Use ET (US Eastern Time) for market-accurate date calculation
        const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const today = new Date(etNow.getFullYear(), etNow.getMonth(), etNow.getDate());

        const maxDTE = (userViewMode || 'VOLUME') === 'VOLUME' ? 7 : 35;
        const maxDate = new Date(today);
        maxDate.setDate(today.getDate() + maxDTE);

        const strikeMap = new Map<number, { callVol: number; putVol: number; callOI: number; putOI: number }>();
        let totalVol = 0;

        rawChain.forEach(opt => {
            const strike = opt.details?.strike_price;
            const type = opt.details?.contract_type;
            const vol = opt.day?.volume || 0;
            const oi = opt.open_interest || 0;

            // [S-77] Filter by expiry date
            const expiryStr = opt.details?.expiration_date;
            if (expiryStr) {
                const parts = expiryStr.split('-');
                if (parts.length === 3) {
                    const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    // Skip if expired or beyond DTE window
                    if (expiry < today || expiry > maxDate) return;
                }
            }

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
    }, [rawChain, currentPrice, userViewMode]);

    // [PREMIUM] Options Pressure Index (OPI) - Unique to SIGNUM
    // OPI = Σ(Call Delta × Call OI) - Σ(Put Delta × Put OI)
    const opi = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { value: 0, label: '분석 중', color: 'text-slate-400' };

        let callPressure = 0;
        let putPressure = 0;

        rawChain.forEach(opt => {
            const delta = opt.greeks?.delta || 0;
            const oi = opt.open_interest || opt.day?.open_interest || 0;
            const type = opt.details?.contract_type;

            if (type === 'call' && delta > 0) {
                callPressure += delta * oi;
            } else if (type === 'put' && delta < 0) {
                putPressure += Math.abs(delta) * oi;
            }
        });

        // [FIX] Ratio-based normalization: (CallPressure - PutPressure) / Total * 100
        // Previous /10000 approach caused overflow (NVDA rawOpi=2.9M → always capped at 100)
        const totalPressure = callPressure + putPressure;
        const normalized = totalPressure > 0
            ? (callPressure - putPressure) / totalPressure * 100
            : 0;
        // Result: -100 (full put dominance) ~ +100 (full call dominance)

        let label = '중립';
        let color = 'text-white';
        if (normalized > 50) { label = '강한 콜 우위'; color = 'text-emerald-400'; }
        else if (normalized > 20) { label = '콜 우위'; color = 'text-emerald-300'; }
        else if (normalized < -50) { label = '강한 풋 우위'; color = 'text-rose-400'; }
        else if (normalized < -20) { label = '풋 우위'; color = 'text-rose-300'; }

        return { value: Math.round(normalized), label, color, callPressure, putPressure };
    }, [rawChain]);

    // [PREMIUM] IV Percentile - ATM Implied Volatility Ranking
    const ivPercentile = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { value: 0, label: '분석 중', color: 'text-slate-400' };

        // Find ATM options (closest to current price)
        const atmOptions = rawChain
            .filter(opt => {
                // Check multiple paths for IV (Polygon API variations)
                const iv = opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv;
                const strike = opt.details?.strike_price || opt.strike_price;
                return iv && iv > 0 && strike;
            })
            .sort((a, b) => {
                const strikeA = a.details?.strike_price || a.strike_price;
                const strikeB = b.details?.strike_price || b.strike_price;
                return Math.abs(strikeA - currentPrice) - Math.abs(strikeB - currentPrice);
            })
            .slice(0, 4); // Get 4 closest strikes

        if (atmOptions.length === 0) return { value: 0, label: '데이터 없음', color: 'text-white' };

        // Average ATM IV (check multiple paths)
        const avgIV = atmOptions.reduce((sum, opt) => {
            const iv = opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv || 0;
            return sum + iv;
        }, 0) / atmOptions.length;
        const ivPercent = Math.round(avgIV * 100);

        // Determine percentile rank (simplified: IV 20-80% typical range)
        let label = '보통';
        let color = 'text-white';
        if (ivPercent >= 60) { label = '매우 높음'; color = 'text-rose-400'; }
        else if (ivPercent >= 45) { label = '높음'; color = 'text-amber-400'; }
        else if (ivPercent >= 30) { label = '보통'; color = 'text-white'; }
        else if (ivPercent >= 20) { label = '낮음'; color = 'text-cyan-400'; }
        else { label = '매우 낮음'; color = 'text-emerald-400'; }

        return { value: ivPercent, label, color };
    }, [rawChain, currentPrice]);

    // [PREMIUM] Smart Money Score - Institutional-level trade ratio
    const smartMoney = useMemo(() => {
        if (!whaleTrades || whaleTrades.length === 0) return { score: 0, label: '분석 중', color: 'text-white' };

        // Calculate based on whale trade characteristics
        const largeTrades = whaleTrades.filter((t: any) => (t.premium || t.size * 100) >= 50000);
        const veryLargeTrades = whaleTrades.filter((t: any) => (t.premium || t.size * 100) >= 100000);

        // Score calculation: weight by premium size
        let score = 0;
        if (whaleTrades.length > 0) {
            const largeRatio = (largeTrades.length / whaleTrades.length) * 50;
            const veryLargeRatio = (veryLargeTrades.length / whaleTrades.length) * 50;
            score = Math.min(100, Math.round(largeRatio + veryLargeRatio));
        }

        let label = '보통';
        let color = 'text-white';
        if (score >= 80) { label = '매우 활발'; color = 'text-emerald-400'; }
        else if (score >= 60) { label = '활발'; color = 'text-emerald-300'; }
        else if (score >= 40) { label = '보통'; color = 'text-white'; }
        else if (score >= 20) { label = '약함'; color = 'text-amber-400'; }
        else { label = '매우 약함'; color = 'text-rose-400'; }

        // Rationale: detailed breakdown
        const rationale = `$50K+ ${largeTrades.length}건 / $100K+ ${veryLargeTrades.length}건`;

        return { score, label, color, rationale };
    }, [whaleTrades]);

    // [PREMIUM] IV Skew - Put vs Call IV difference (fear gauge)
    const ivSkew = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { value: 0, label: '분석 중', color: 'text-white' };

        // Find OTM puts and calls near current price for skew calculation
        const otmPuts = rawChain
            .filter(opt => {
                const strike = opt.details?.strike_price || opt.strike_price;
                const type = opt.details?.contract_type;
                const iv = opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv;
                return type === 'put' && strike < currentPrice && iv && iv > 0;
            })
            .sort((a, b) => (b.details?.strike_price || b.strike_price) - (a.details?.strike_price || a.strike_price))
            .slice(0, 3);

        const otmCalls = rawChain
            .filter(opt => {
                const strike = opt.details?.strike_price || opt.strike_price;
                const type = opt.details?.contract_type;
                const iv = opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv;
                return type === 'call' && strike > currentPrice && iv && iv > 0;
            })
            .sort((a, b) => (a.details?.strike_price || a.strike_price) - (b.details?.strike_price || b.strike_price))
            .slice(0, 3);

        if (otmPuts.length === 0 || otmCalls.length === 0) return { value: 0, label: '데이터 없음', color: 'text-white' };

        const avgPutIV = otmPuts.reduce((sum, opt) => sum + (opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv || 0), 0) / otmPuts.length;
        const avgCallIV = otmCalls.reduce((sum, opt) => sum + (opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv || 0), 0) / otmCalls.length;

        // Skew = Put IV - Call IV (positive = fear, negative = greed)
        const skewValue = Math.round((avgPutIV - avgCallIV) * 100 * 10) / 10; // in percentage points

        let label = '중립';
        let color = 'text-white';
        if (skewValue >= 5) { label = '공포'; color = 'text-rose-400'; }
        else if (skewValue >= 2) { label = '경계'; color = 'text-amber-400'; }
        else if (skewValue >= -2) { label = '중립'; color = 'text-white'; }
        else if (skewValue >= -5) { label = '낙관'; color = 'text-cyan-400'; }
        else { label = '탐욕'; color = 'text-emerald-400'; }

        // Rationale: Put IV vs Call IV
        const rationale = `풋IV ${Math.round(avgPutIV * 100)}% / 콜IV ${Math.round(avgCallIV * 100)}%`;

        return { value: skewValue, label, color, rationale };
    }, [rawChain, currentPrice]);

    // [PREMIUM] Gamma Squeeze Probability - SpotGamma-Style Model
    // Reference: GEX normalization, ATM Gamma concentration, Dealer hedging pressure
    // [S-124.5] Updated to use 0-7 DTE only for consistency with Options Battlefield
    // [SQUEEZE FIX] Use API squeezeScore when available for unified display with Dashboard
    const squeezeProbability = useMemo(() => {
        // [SQUEEZE FIX] Use API value if available (same as Dashboard)
        if (apiSqueezeScore !== undefined && apiSqueezeScore !== null) {
            const color = apiSqueezeRisk === 'EXTREME' ? 'text-rose-400' : apiSqueezeRisk === 'HIGH' ? 'text-amber-400' : apiSqueezeRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400';
            return {
                value: apiSqueezeScore,
                label: apiSqueezeRisk || 'LOW',
                color,
                factors: [],
                debug: { source: 'API' },
                isLoading: false
            };
        }

        // Loading state - 데이터가 완전히 준비될 때까지 로딩 표시
        const isLoading = !rawChain || rawChain.length === 0 || currentPrice === 0;

        if (isLoading) {
            return { value: 0, label: '분석 중', color: 'text-slate-400', factors: [], debug: {}, isLoading: true };
        }

        // [S-124.5] Filter for 0-7 DTE options only (Weekly expiry)
        // [FIX] Use ET (US Eastern Time) for market-accurate date calculation
        const etSqueezeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const squeezeDateBase = new Date(etSqueezeNow.getFullYear(), etSqueezeNow.getMonth(), etSqueezeNow.getDate());
        const weeklyExpiry = new Date(squeezeDateBase);
        weeklyExpiry.setDate(squeezeDateBase.getDate() + 7);


        const weeklyOptions = rawChain.filter(opt => {
            const expiryStr = opt.details?.expiration_date;
            if (!expiryStr) return false;
            const parts = expiryStr.split('-');
            if (parts.length !== 3) return false;
            const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return expiry >= squeezeDateBase && expiry <= weeklyExpiry;
        });

        // If no weekly options, fall back to showing loading state
        if (weeklyOptions.length === 0) {
            return { value: 0, label: '주간 데이터 없음', color: 'text-slate-400', factors: [], debug: { weeklyCount: 0 }, isLoading: false };
        }

        const factors: { name: string; contribution: number; active: boolean }[] = [];
        let score = 0;

        // ============================================
        // 1. GEX INTENSITY (0-35 points) - Core Metric
        // ============================================
        // Calculate Net Gamma Exposure across weekly strikes only
        let totalGex = 0;
        let totalOI = 0;
        let atmGex = 0; // ATM = within 2% of current price

        weeklyOptions.forEach(opt => {
            const gamma = opt.greeks?.gamma || 0;
            const oi = opt.open_interest || opt.day?.open_interest || 0;
            const strike = opt.details?.strike_price || 0;
            const type = opt.details?.contract_type;

            // Dealer perspective: Short calls = negative gamma, Short puts = positive gamma
            const dealerGex = type === 'call'
                ? -gamma * oi * 100 * currentPrice  // Call gamma (dealer short)
                : gamma * oi * 100 * currentPrice;   // Put gamma (dealer short)

            totalGex += dealerGex;
            totalOI += oi;

            // ATM concentration
            if (Math.abs(strike - currentPrice) / currentPrice < 0.02) {
                atmGex += Math.abs(dealerGex);
            }
        });


        // Normalize GEX by market cap proxy (price * OI as rough proxy)
        const marketProxy = currentPrice * (totalOI || 1);
        const gexIntensity = Math.abs(totalGex) / marketProxy * 10000;
        const isShortGamma = totalGex < 0;

        // Short Gamma = Higher squeeze risk (dealers must chase price)
        if (isShortGamma) {
            const gexScore = Math.min(35, Math.round(gexIntensity * 5));
            score += gexScore;
            factors.push({ name: `숏감마 ${(totalGex / 1e6).toFixed(1)}M`, contribution: gexScore, active: true });
        } else {
            // Long Gamma = Stability (dealers sell into rallies, buy dips)
            const stabilityPenalty = Math.min(10, Math.round(gexIntensity * 2));
            score += stabilityPenalty;
            factors.push({ name: `롱감마 (억제)`, contribution: stabilityPenalty, active: true });
        }

        // ============================================
        // 2. ATM GAMMA CONCENTRATION (0-20 points)
        // ============================================
        // High ATM gamma = Pin risk OR explosive move potential
        const atmRatio = totalGex !== 0 ? atmGex / Math.abs(totalGex) : 0;
        if (atmRatio > 0.3) {
            const atmScore = Math.min(20, Math.round(atmRatio * 30));
            score += atmScore;
            factors.push({ name: `ATM 집중 ${Math.round(atmRatio * 100)}%`, contribution: atmScore, active: true });
        }

        // ============================================
        // 3. 0DTE VOLATILITY AMPLIFIER (0-20 points)
        // ============================================
        const today = new Date().toISOString().split('T')[0];
        const zeroDte = rawChain.filter(opt => opt.details?.expiration_date === today);
        const zeroDteGamma = zeroDte.reduce((sum, opt) => {
            const gamma = opt.greeks?.gamma || 0;
            const oi = opt.open_interest || 0;
            return sum + gamma * oi * 100;
        }, 0);
        const zeroDteImpact = totalOI > 0 ? zeroDte.length / rawChain.length : 0;

        if (zeroDteImpact > 0.1) {
            const zeroScore = Math.min(20, Math.round(zeroDteImpact * 50));
            score += zeroScore;
            factors.push({ name: `0DTE ${Math.round(zeroDteImpact * 100)}%`, contribution: zeroScore, active: true });
        }

        // ============================================
        // 4. VOLATILITY SKEW SIGNAL (0-15 points)
        // ============================================
        // High put skew = Fear, potential for violent moves
        // Note: IV Skew는 이미 별도 표시되므로 요인 태그에서 제외
        const skewAbs = Math.abs(ivSkew.value);
        if (skewAbs > 3) {
            const skewScore = Math.min(15, Math.round(skewAbs * 2));
            score += skewScore;
            // factors.push 제거 - 중복 표시 방지
        }

        // ============================================
        // 5. INSTITUTIONAL FLOW SIGNAL (0-10 points)
        // ============================================
        // Large directional bets near ATM = Smart money positioning
        const bigBets = whaleTrades.filter(t => t.premium >= 100000);
        const nearAtmBets = bigBets.filter(t =>
            t.strike && Math.abs(t.strike - currentPrice) / currentPrice < 0.05
        );

        if (nearAtmBets.length >= 1) {
            const flowScore = Math.min(10, nearAtmBets.length * 3);
            score += flowScore;
            factors.push({ name: `$100K+ ATM ${nearAtmBets.length}건`, contribution: flowScore, active: true });
        }

        // ============================================
        // FINAL SCORE & CLASSIFICATION
        // ============================================
        const probability = Math.min(100, Math.max(0, score));

        let label = 'LOW';
        let color = 'text-emerald-400';
        if (probability >= 70) { label = 'EXTREME'; color = 'text-rose-400'; }
        else if (probability >= 45) { label = 'HIGH'; color = 'text-amber-400'; }
        else if (probability >= 20) { label = 'MODERATE'; color = 'text-yellow-400'; }

        return {
            value: probability,
            label,
            color,
            factors: factors.filter(f => f.active),
            debug: { totalGex, gexIntensity, atmRatio, zeroDteImpact, isShortGamma },
            isLoading: false
        };
    }, [rawChain, currentPrice, ivSkew, whaleTrades, apiSqueezeScore, apiSqueezeRisk]);

    // [NEW] DEX (Delta Exposure) - Dealer Delta Hedging Direction
    const dex = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { value: 0, label: '분석 중', color: 'text-slate-400', rationale: '' };

        let totalDex = 0;
        let callDex = 0;
        let putDex = 0;

        rawChain.forEach(opt => {
            const delta = opt.greeks?.delta || 0;
            const oi = opt.open_interest || opt.day?.open_interest || 0;
            const type = opt.details?.contract_type;

            // DEX = Σ(Delta × OI × 100) - from dealer perspective (short options)
            const exposure = delta * oi * 100;

            if (type === 'call') {
                callDex += exposure;
            } else if (type === 'put') {
                putDex += exposure;
            }
            totalDex += exposure;
        });

        // Normalize to Millions
        const dexMillions = totalDex / 1000000;
        const callDexM = callDex / 1000000;
        const putDexM = putDex / 1000000;

        // Interpretation: Positive = Dealers need to sell on price rise (resistance)
        //                 Negative = Dealers need to buy on price drop (support)
        let label = '중립';
        let color = 'text-white';
        if (dexMillions > 5) { label = '강한 저항'; color = 'text-rose-400'; }
        else if (dexMillions > 2) { label = '저항 압력'; color = 'text-amber-400'; }
        else if (dexMillions < -5) { label = '강한 지지'; color = 'text-emerald-400'; }
        else if (dexMillions < -2) { label = '지지 형성'; color = 'text-cyan-400'; }

        const rationale = `콜Δ ${callDexM.toFixed(1)}M / 풋Δ ${putDexM.toFixed(1)}M`;

        return { value: dexMillions, label, color, rationale };
    }, [rawChain]);

    // [NEW] UOA Score (Unusual Options Activity) - Abnormal Volume Detection
    const uoa = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { score: 0, label: '분석 중', color: 'text-slate-400', rationale: '' };

        // Calculate today's total volume
        let todayVolume = 0;
        let avgOI = 0;
        let optionCount = 0;

        rawChain.forEach(opt => {
            const vol = opt.day?.volume || 0;
            const oi = opt.open_interest || 0;
            todayVolume += vol;
            avgOI += oi;
            optionCount++;
        });

        // UOA Score = Today's Volume / Average OI (proxy for average daily volume)
        // Higher = More unusual activity
        const uoaScore = avgOI > 0 ? (todayVolume / avgOI) * 10 : 0; // Multiply by 10 for readability
        const normalizedScore = Math.min(10, uoaScore); // Cap at 10x

        let label = '정상';
        let color = 'text-white';
        if (normalizedScore >= 5) { label = '극심'; color = 'text-rose-400'; }
        else if (normalizedScore >= 3) { label = '이상'; color = 'text-amber-400'; }
        else if (normalizedScore >= 1.5) { label = '활발'; color = 'text-cyan-400'; }

        const rationale = `거래량 ${(todayVolume / 1000).toFixed(0)}K / OI ${(avgOI / 1000).toFixed(0)}K`;

        return { score: Math.round(normalizedScore * 10) / 10, label, color, rationale };
    }, [rawChain]);

    // [NEW] P/C Ratio - Call/Put Volume Ratio (Market Sentiment Gauge)
    const pcRatio = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { value: 0, label: '분석 중', color: 'text-slate-400', callVol: 0, putVol: 0 };

        let callVol = 0;
        let putVol = 0;

        rawChain.forEach(opt => {
            const vol = opt.day?.volume || 0;
            const type = opt.details?.contract_type;
            if (type === 'call') callVol += vol;
            else if (type === 'put') putVol += vol;
        });

        const ratio = putVol > 0 ? callVol / putVol : callVol > 0 ? 10 : 0;
        const roundedRatio = Math.round(ratio * 100) / 100;

        let label = '균형';
        let color = 'text-white';
        if (ratio >= 2.0) { label = '강한 콜 우위'; color = 'text-emerald-400'; }
        else if (ratio >= 1.3) { label = '콜 우위'; color = 'text-emerald-300'; }
        else if (ratio <= 0.5) { label = '강한 풋 우위'; color = 'text-rose-400'; }
        else if (ratio <= 0.75) { label = '풋 우위'; color = 'text-rose-300'; }

        return { value: roundedRatio, label, color, callVol, putVol };
    }, [rawChain]);

    // [NEW] P/C Ratio (OI-based) - switches with VOLUME/OI toggle
    const pcRatioOI = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { value: 0, label: '분석 중', color: 'text-slate-400', callOI: 0, putOI: 0 };

        let callOI = 0;
        let putOI = 0;

        rawChain.forEach(opt => {
            const oi = opt.open_interest || 0;
            const type = opt.details?.contract_type;
            if (type === 'call') callOI += oi;
            else if (type === 'put') putOI += oi;
        });

        const ratio = putOI > 0 ? callOI / putOI : callOI > 0 ? 10 : 0;
        const roundedRatio = Math.round(ratio * 100) / 100;

        let label = '균형';
        let color = 'text-white';
        if (ratio >= 2.0) { label = '강한 콜 우위'; color = 'text-emerald-400'; }
        else if (ratio >= 1.3) { label = '콜 우위'; color = 'text-emerald-300'; }
        else if (ratio <= 0.5) { label = '강한 풋 우위'; color = 'text-rose-400'; }
        else if (ratio <= 0.75) { label = '풋 우위'; color = 'text-rose-300'; }

        return { value: roundedRatio, label, color, callOI, putOI };
    }, [rawChain]);

    // [GEX REGIME] Institutional-grade gamma regime indicator
    // Combines: ATM concentration (rawChain) + Gamma Flip distance + DTE weighting
    const gexRegime = useMemo(() => {
        if (!rawChain || rawChain.length === 0 || !currentPrice) return {
            pinStrength: 0, label: '분석 중', color: 'text-slate-400',
            regime: 'LOADING' as const, regimeColor: 'text-slate-400',
            nearestExpiry: '', dte: -1, weeklyExpiry: '', weeklyLabel: '', expiryLabel: '',
            atmConcentration: 0, gammaShare: 0,
            flipLevel: null as number | null, flipDistance: 0, flipDir: '' as string,
            nearestCount: 0, weeklyContracts: 0, expiryCount: 0, isLongGamma: true
        };

        const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const todayStr = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, '0')}-${String(etNow.getDate()).padStart(2, '0')}`;

        // === PART 1: ATM Concentration from rawChain (accurate, weekly expiry) ===
        let weeklyTotalGamma = 0, weeklyATMGamma = 0, weeklyNetGEX = 0;
        let weeklyCallOI = 0, weeklyPutOI = 0;
        let weeklyExpiry = '';

        rawChain.forEach((c: any) => {
            const gamma = c.greeks?.gamma || 0;
            const oi = c.open_interest || 0;
            const strike = c.details?.strike_price || 0;
            const type = c.details?.contract_type;
            const gExp = Math.abs(gamma * oi * 100);
            weeklyTotalGamma += gExp;
            if (!weeklyExpiry && c.details?.expiration_date) weeklyExpiry = c.details.expiration_date;
            if (type === 'call') { weeklyNetGEX += gamma * oi * 100; weeklyCallOI += oi; }
            else if (type === 'put') { weeklyNetGEX -= gamma * oi * 100; weeklyPutOI += oi; }
            if (Math.abs(strike - currentPrice) / currentPrice < 0.02) weeklyATMGamma += gExp;
        });

        const atmConcentration = weeklyTotalGamma > 0 ? (weeklyATMGamma / weeklyTotalGamma) * 100 : 0;
        const isLongGamma = weeklyNetGEX >= 0;

        // === PART 2: Gamma Share from allExpiryChain ===
        let gammaShare = 100, expiryCount = 1;
        const probeChain = allExpiryChain && allExpiryChain.length > 0 ? allExpiryChain : null;
        if (probeChain) {
            const probeByExpiry: Record<string, number> = {};
            let probeTotalGamma = 0;
            probeChain.forEach((c: any) => {
                const exp = c.details?.expiration_date;
                if (exp) {
                    const gExp = Math.abs((c.greeks?.gamma || 0) * (c.open_interest || 0) * 100);
                    probeByExpiry[exp] = (probeByExpiry[exp] || 0) + gExp;
                    probeTotalGamma += gExp;
                }
            });
            expiryCount = Object.keys(probeByExpiry).length;
            if (weeklyExpiry && probeTotalGamma > 0) gammaShare = ((probeByExpiry[weeklyExpiry] || 0) / probeTotalGamma) * 100;
        }

        // DTE calculation
        let nearestExpiry = weeklyExpiry;
        if (probeChain) {
            const allExpiries = Array.from(new Set(probeChain.map((c: any) => c.details?.expiration_date).filter(Boolean))).sort() as string[];
            if (allExpiries.length > 0) nearestExpiry = allExpiries[0];
        }
        const dte = Math.max(0, Math.round((new Date((nearestExpiry || todayStr) + 'T16:00:00').getTime() - new Date(todayStr + 'T09:30:00').getTime()) / 86400000));

        // Weekly expiry label fallback
        if (!weeklyExpiry && probeChain) {
            const allExpiries = Array.from(new Set(probeChain.map((c: any) => c.details?.expiration_date).filter(Boolean))).sort() as string[];
            for (const exp of allExpiries) { const d = new Date(exp + 'T12:00:00'); if (d.getDay() === 5) { weeklyExpiry = exp; break; } if (d.getDay() === 4) weeklyExpiry = exp; }
            if (!weeklyExpiry && allExpiries.length > 0) weeklyExpiry = allExpiries[0];
        }

        // === PART 3: Gamma Flip Integration ===
        const flip = gammaFlipLevel && gammaFlipLevel > 0 ? gammaFlipLevel : null;
        let flipDistWeight = isLongGamma ? 1.0 : 0.3; // fallback: binary
        let flipDistance = 0;
        let flipDir = '';
        let regime: 'STABLE' | 'TRANSITION' | 'FLIP_ZONE' | 'EXPLOSIVE' | 'LOADING' = isLongGamma ? 'STABLE' : 'EXPLOSIVE';

        if (flip && currentPrice > 0) {
            flipDistance = ((currentPrice - flip) / flip) * 100; // positive = above flip
            flipDir = flipDistance > 0 ? '↑' : '↓';

            if (flipDistance > 5) {
                flipDistWeight = 1.2;  // Deep long gamma - very stable pinning
                regime = 'STABLE';
            } else if (flipDistance > 2) {
                flipDistWeight = 1.0;  // Long gamma - normal pinning
                regime = 'STABLE';
            } else if (flipDistance > 0) {
                flipDistWeight = 0.5;  // Near flip - unstable
                regime = 'TRANSITION';
            } else if (flipDistance > -2) {
                flipDistWeight = 0.3;  // Just below flip
                regime = 'FLIP_ZONE';
            } else {
                flipDistWeight = 0.2;  // Deep short gamma - explosive
                regime = 'EXPLOSIVE';
            }
        }

        // === Pin Strength = ATM concentration × flip distance weight × DTE weight ===
        const dteWeight = dte === 0 ? 1.0 : dte === 1 ? 0.7 : dte <= 3 ? 0.4 : 0.2;
        const pinStrength = Math.min(100, Math.round(atmConcentration * flipDistWeight * dteWeight));

        // Label and color (driven by regime)
        let label: string, color: string;
        const regimeLabels = { STABLE: '안정 핀닝', TRANSITION: '전환 임박', FLIP_ZONE: '플립 구간', EXPLOSIVE: '폭발 대기', LOADING: '분석 중' };
        const regimeColors = { STABLE: 'text-emerald-400', TRANSITION: 'text-amber-400', FLIP_ZONE: 'text-orange-400', EXPLOSIVE: 'text-rose-400', LOADING: 'text-slate-400' };
        label = regimeLabels[regime];
        color = regimeColors[regime];

        const expiryLabel = nearestExpiry === todayStr ? '오늘 만기' : `${nearestExpiry.substring(5).replace('-', '/')} 만기`;
        const weeklyLabel = weeklyExpiry === todayStr ? '오늘' : weeklyExpiry ? `${weeklyExpiry.substring(5).replace('-', '/')}(주간)` : '';

        return {
            pinStrength, label, color,
            regime, regimeColor: regimeColors[regime],
            nearestExpiry, dte, weeklyExpiry, weeklyLabel, expiryLabel,
            atmConcentration: Math.round(atmConcentration),
            gammaShare: Math.round(gammaShare),
            flipLevel: flip, flipDistance: Math.round(Math.abs(flipDistance) * 10) / 10, flipDir,
            nearestCount: rawChain.length, weeklyContracts: rawChain.length,
            expiryCount, isLongGamma, nearestCallOI: weeklyCallOI, nearestPutOI: weeklyPutOI
        };
    }, [rawChain, allExpiryChain, currentPrice, gammaFlipLevel]);

    // [PREMIUM] Implied Move (기대변동폭) - Nearest Weekly Expiry ATM Straddle
    const impliedMove = useMemo(() => {
        if (!rawChain || rawChain.length === 0 || !currentPrice) return { value: 0, direction: 'neutral' as const, color: 'text-slate-400', label: '--', straddle: '0', expiryLabel: '' };

        // 1. Find the nearest expiry date (weekly basis)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let nearestExpiry = '';
        let minDays = Infinity;
        rawChain.forEach((opt: any) => {
            const expStr = opt.details?.expiration_date;
            if (!expStr) return;
            const parts = expStr.split('-');
            if (parts.length !== 3) return;
            const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            const diffDays = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays >= 0 && diffDays < minDays) {
                minDays = diffDays;
                nearestExpiry = expStr;
            }
        });
        if (!nearestExpiry) return { value: 0, direction: 'neutral' as const, color: 'text-slate-400', label: '--', straddle: '0', expiryLabel: '' };

        // 2. Filter to only nearest expiry options
        const weeklyChain = rawChain.filter((opt: any) => opt.details?.expiration_date === nearestExpiry);

        // 3. Find nearest ATM call and put from weekly chain
        let nearestCall: any = null;
        let nearestPut: any = null;
        let minCallDist = Infinity;
        let minPutDist = Infinity;
        weeklyChain.forEach((opt: any) => {
            const strike = opt.details?.strike_price;
            if (!strike) return;
            const dist = Math.abs(strike - currentPrice);
            if (opt.details?.contract_type === 'call' && dist < minCallDist) {
                minCallDist = dist;
                nearestCall = opt;
            }
            if (opt.details?.contract_type === 'put' && dist < minPutDist) {
                minPutDist = dist;
                nearestPut = opt;
            }
        });
        if (!nearestCall || !nearestPut) return { value: 0, direction: 'neutral' as const, color: 'text-slate-400', label: '--', straddle: '0', expiryLabel: '' };

        const callPrice = nearestCall.day?.close || nearestCall.last_quote?.midpoint || 0;
        const putPrice = nearestPut.day?.close || nearestPut.last_quote?.midpoint || 0;
        const straddle = callPrice + putPrice;
        const movePercent = currentPrice > 0 ? (straddle / currentPrice) * 100 : 0;
        const direction = callPrice > putPrice ? 'bullish' as const : callPrice < putPrice ? 'bearish' as const : 'neutral' as const;
        const expiryLabel = `${nearestExpiry.substring(5).replace('-', '/')} 만기`;

        let color = 'text-white';
        let label = '보통';
        if (movePercent >= 5) { color = 'text-rose-400'; label = '고변동'; }
        else if (movePercent >= 3) { color = 'text-amber-400'; label = '주의'; }
        else if (movePercent >= 1) { color = 'text-cyan-400'; label = '보통'; }
        else { color = 'text-emerald-400'; label = '안정'; }

        return { value: Math.round(movePercent * 10) / 10, direction, color, label, straddle: straddle.toFixed(2), expiryLabel };
    }, [rawChain, currentPrice]);

    // [PREMIUM] Max Pain Distance - how far current price from max pain
    const maxPainDistance = useMemo(() => {
        if (!rawChain || rawChain.length === 0 || !currentPrice) return { maxPain: 0, distance: 0, distPercent: 0, direction: 'at' as const, color: 'text-slate-400' };

        // Calculate max pain: strike where total pain (loss) for option holders is maximized
        const strikeMap = new Map<number, { callOI: number; putOI: number }>();
        rawChain.forEach((opt: any) => {
            const strike = opt.details?.strike_price;
            if (!strike) return;
            if (!strikeMap.has(strike)) strikeMap.set(strike, { callOI: 0, putOI: 0 });
            const entry = strikeMap.get(strike)!;
            if (opt.details?.contract_type === 'call') entry.callOI += (opt.open_interest || 0);
            else if (opt.details?.contract_type === 'put') entry.putOI += (opt.open_interest || 0);
        });

        const strikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);
        let maxPainStrike = currentPrice;
        let minPain = Infinity;
        strikes.forEach(testStrike => {
            let totalPain = 0;
            strikes.forEach(s => {
                const data = strikeMap.get(s)!;
                // Call holders lose when strike < testStrike (ITM calls lose nothing above strike)
                if (testStrike > s) totalPain += data.callOI * (testStrike - s) * 100;
                // Put holders lose when strike > testStrike (ITM puts lose nothing below strike)
                if (testStrike < s) totalPain += data.putOI * (s - testStrike) * 100;
            });
            if (totalPain < minPain) { minPain = totalPain; maxPainStrike = testStrike; }
        });

        const distance = currentPrice - maxPainStrike;
        const distPercent = currentPrice > 0 ? Math.round((distance / currentPrice) * 1000) / 10 : 0;
        const direction = distance > 0.5 ? 'above' as const : distance < -0.5 ? 'below' as const : 'at' as const;
        let color = 'text-emerald-400';
        if (Math.abs(distPercent) > 3) color = 'text-rose-400';
        else if (Math.abs(distPercent) > 1.5) color = 'text-amber-400';
        else if (Math.abs(distPercent) > 0.5) color = 'text-cyan-400';

        return { maxPain: maxPainStrike, distance, distPercent, direction, color };
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
    // V2.0: Integrates OPI, IV Skew, Squeeze, Smart Money, IV Percentile
    const analysis = useMemo(() => {
        if (!flowMap || flowMap.length === 0) return null;

        const distToCall = ((callWall - currentPrice) / currentPrice) * 100;
        const distToPut = ((currentPrice - putWall) / currentPrice) * 100;

        // [Fix V2] Session-aware filter: use trades from the MOST RECENT trading session
        // instead of a rigid 16-hour cutoff (which breaks on weekends/holidays)
        let activeTrades = whaleTrades;
        if (whaleTrades.length > 0) {
            // Find the most recent trade timestamp
            const mostRecent = Math.max(...whaleTrades.map(t => new Date(t.tradeDate).getTime()));
            // Use all trades from the same trading day as the most recent trade
            const sessionStart = new Date(mostRecent);
            sessionStart.setHours(0, 0, 0, 0); // Start of that trading day
            activeTrades = whaleTrades.filter(t => new Date(t.tradeDate).getTime() >= sessionStart.getTime());
        }

        // 1. Whale Flow Decomposition
        let netWhalePremium = 0;
        let callPremium = 0;
        let putPremium = 0;
        let maxPremium = 0;
        let alphaTrade: any = null;

        activeTrades.forEach(t => {
            if (t.type === 'CALL') {
                netWhalePremium += t.premium;
                callPremium += t.premium;
            } else {
                netWhalePremium -= t.premium;
                putPremium += t.premium;
            }

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

        // =====================================
        // V2.0: COMPREHENSIVE INDICATOR SCORING
        // =====================================
        // Score Range: -100 (极Bearish) ~ +100 (极Bullish)
        let compositeScore = 0;
        const signals: string[] = [];

        // (1) OPI Score (Weight: 25%) - Delta-weighted positioning
        const opiScore = opi.value * 0.25; // Already -100~+100
        compositeScore += opiScore;
        if (opi.value > 30) signals.push(`OPI +${opi.value}(상승압력)`);
        else if (opi.value < -30) signals.push(`OPI ${opi.value}(하락압력)`);

        // (2) Whale Premium Score (Weight: 25%)
        let whaleScore = 0;
        if (netWhalePremium > 500000) whaleScore = 25;
        else if (netWhalePremium > 100000) whaleScore = 15;
        else if (netWhalePremium < -500000) whaleScore = -25;
        else if (netWhalePremium < -100000) whaleScore = -15;
        compositeScore += whaleScore;
        if (Math.abs(netWhalePremium) > 100000) {
            signals.push(`고래 ${netWhalePremium > 0 ? '+' : ''}$${(netWhalePremium / 1000).toFixed(0)}K`);
        }

        // (3) Squeeze Probability Score (Weight: 15%) - Volatility explosion risk
        let squeezeScore = 0;
        if (!squeezeProbability.isLoading) {
            // High squeeze = potential explosive move, affects direction confidence
            if (squeezeProbability.value >= 70) squeezeScore = 15; // Extreme - could go either way but big move
            else if (squeezeProbability.value >= 45) squeezeScore = 8;
            else squeezeScore = 0;
            // Direction bias: If OPI is positive, squeeze amplifies upside; if negative, downside
            squeezeScore = opi.value > 0 ? squeezeScore : -squeezeScore;
            compositeScore += squeezeScore;
            if (squeezeProbability.value >= 45) signals.push(`스퀴즈 ${squeezeProbability.value}%`);
        }

        // (4) IV Skew Score (Weight: 15%) - Fear/Greed gauge
        let skewScore = 0;
        if (ivSkew.value !== 0) {
            // Positive skew (fear) = bearish bias, Negative skew (greed) = bullish bias
            skewScore = -ivSkew.value * 1.5; // Invert: high put skew = bearish
            skewScore = Math.max(-15, Math.min(15, skewScore));
            compositeScore += skewScore;
            if (Math.abs(ivSkew.value) >= 3) signals.push(`IV스큐 ${ivSkew.label}`);
        }

        // (5) Smart Money Score (Weight: 10%) - Institutional activity level
        let smartScore = 0;
        if (smartMoney.score >= 60) smartScore = 10;
        else if (smartMoney.score >= 40) smartScore = 5;
        else if (smartMoney.score < 20) smartScore = -5;
        // Apply direction based on whale bias
        if (whaleBias.includes('BEAR')) smartScore = -Math.abs(smartScore);
        compositeScore += smartScore;
        if (smartMoney.score >= 60) signals.push(`스마트머니 ${smartMoney.label}`);

        // (6) IV Percentile Score (Weight: 5%) - Volatility environment
        let ivScore = 0;
        if (ivPercentile.value >= 60) ivScore = -3; // High IV = uncertainty, slight bearish
        else if (ivPercentile.value <= 25) ivScore = 3; // Low IV = calm, slight bullish
        compositeScore += ivScore;

        // (7) DEX Score (Weight: 10%) - Dealer Delta Hedging Direction
        let dexScore = 0;
        if (dex.value > 5) dexScore = -10; // Strong resistance from dealer hedging
        else if (dex.value > 2) dexScore = -5;
        else if (dex.value < -5) dexScore = 10; // Strong support from dealer hedging
        else if (dex.value < -2) dexScore = 5;
        compositeScore += dexScore;
        if (Math.abs(dex.value) > 2) signals.push(`DEX ${dex.value > 0 ? '+' : ''}${dex.value.toFixed(1)}M(${dex.label})`);

        // (8) UOA Score (Weight: 5%) - Unusual Options Activity (confirmation signal)
        let uoaScore = 0;
        if (uoa.score >= 5) uoaScore = 5; // Extreme activity - confirms direction
        else if (uoa.score >= 3) uoaScore = 3;
        // Apply direction based on overall bias
        if (compositeScore < 0) uoaScore = -Math.abs(uoaScore);
        compositeScore += uoaScore;
        if (uoa.score >= 3) signals.push(`UOA ${uoa.score}x(${uoa.label})`);

        // (9) P/C Ratio Score (Weight: 5%) - Market sentiment confirmation
        let pcScore = 0;
        if (pcRatio.value >= 2.0) pcScore = 5;       // Strong call dominance
        else if (pcRatio.value >= 1.3) pcScore = 3;   // Call leaning
        else if (pcRatio.value <= 0.5) pcScore = -5;   // Strong put dominance
        else if (pcRatio.value <= 0.75) pcScore = -3;  // Put leaning
        compositeScore += pcScore;
        if (pcRatio.value >= 1.5 || pcRatio.value <= 0.65) signals.push(`P/C ${pcRatio.value.toFixed(2)}`);

        // (10) GEX Regime Score (Weight: 5%) - Pinning strength amplifier
        let zdteScore = 0;
        if (gexRegime.pinStrength >= 60) zdteScore = 5;  // Strong pinning
        else if (gexRegime.pinStrength >= 35) zdteScore = 3;
        // Pinning amplifies existing direction
        if (compositeScore < 0) zdteScore = -Math.abs(zdteScore);
        compositeScore += zdteScore;
        if (gexRegime.pinStrength >= 35) signals.push(`GEX ${gexRegime.pinStrength}%`);

        // (11) Net Premium Flow (integrated with Whale - additional weight when extreme)
        if (Math.abs(netWhalePremium) > 1000000) {
            const flowBonus = netWhalePremium > 0 ? 5 : -5;
            compositeScore += flowBonus;
        }

        // Clamp final score
        compositeScore = Math.max(-100, Math.min(100, compositeScore));

        // =====================================
        // V3.0: ACTIONABLE NARRATIVE ENGINE
        // =====================================
        // Output: status, message, action, warning, trigger
        let status = "판단 보류 (SCANNING)";
        let message = "세력들의 움직임을 정밀 분석 중입니다...";
        let color = "text-slate-400";
        let probability = 50;
        let probLabel = "중립";
        let probColor = "text-slate-500";
        let action = "";    // 대응 가이드
        let warning = "";   // 경고
        let trigger = "";   // 트리거 (다음 액션 조건)

        // Alpha Trade Intel
        let alphaIntel = "";
        if (alphaTrade) {
            const unitCost = alphaTrade.premium / (alphaTrade.size * 100);
            alphaIntel = `최대거래: ${alphaTrade.type} $${alphaTrade.strike} ($${(alphaTrade.premium / 1000).toFixed(0)}K)`;
        }

        // ================================================
        // SQUEEZE EMERGENCY CHECK (overrides position logic)
        // ================================================
        const isSqueezeExtreme = !squeezeProbability.isLoading && squeezeProbability.value >= 70;
        const isSqueezeHigh = !squeezeProbability.isLoading && squeezeProbability.value >= 45;

        // Position-based logic with composite score integration
        if (currentPrice > callWall) {
            // ===== BREAKOUT ZONE =====
            if (compositeScore > 30) {
                status = "초강력 상승 (SUPER-CYCLE)";
                message = `저항벽($${callWall}) 돌파. 기관 수급과 옵션 구조 모두 상방을 지지하는 희귀한 조건.`;
                probability = Math.min(98, 75 + compositeScore * 0.23);
                probLabel = "확신"; probColor = "text-emerald-400"; color = "text-emerald-400";
                action = "기존 롱 유지, 풀백 시 추가 매수";
                warning = "숏 절대 금지, 역추세 베팅 금지";
                trigger = `새 저항선 형성 시 목표가 상향`;
            } else {
                status = "돌파 후 숨고르기";
                message = `저항($${callWall}) 돌파했으나 후속 수급이 약함. 지지 전환 확인까지 관망.`;
                probability = 55 + compositeScore * 0.1;
                probLabel = "관망"; probColor = "text-amber-400"; color = "text-amber-400";
                action = "기존 롱 유지, 신규 진입 대기";
                warning = "추격 매수 자제, 거래량 동반 필요";
                trigger = `$${callWall} 위 안착 확인 시 추가 매수`;
            }
        } else if (currentPrice < putWall) {
            // ===== BREAKDOWN ZONE =====
            if (compositeScore < -30) {
                status = "지지선 붕괴 (COLLAPSE)";
                message = `최후 방어선($${putWall}) 이탈. 하방 압력 극심, 패닉 매도 구간.`;
                probability = Math.max(5, 25 + compositeScore * 0.2);
                probLabel = "위험"; probColor = "text-rose-500"; color = "text-rose-500";
                action = "롱 즉시 손절, 숏 진입 가능";
                warning = "반등 매수 시도 위험, 낙하 가속 가능";
                trigger = `$${putWall} 회복 시 숏커버링 신호`;
            } else {
                status = "베어 트랩 가능성";
                message = `지지선($${putWall}) 이탈이 페이크일 수 있음. 수급 신호가 혼재.`;
                probability = 40 + compositeScore * 0.1;
                probLabel = "주의"; probColor = "text-amber-500"; color = "text-amber-500";
                action = "관망, 반등 확인 후 진입 검토";
                warning = "성급한 바닥 매수 자제";
                trigger = `$${putWall} 재진입 시 롱 신호`;
            }
        } else {
            // ===== INSIDE RANGE =====
            const isNearRes = distToCall < 1.0;
            const isNearSup = Math.abs(distToPut) < 1.0;

            if (isNearRes) {
                if (compositeScore > 25) {
                    status = "돌파 임박 (BREAKOUT READY)";
                    message = `저항($${callWall}) 근접. 옵션 수급 에너지 충전 완료, 돌파 시 가속 예상.`;
                    probability = 75 + compositeScore * 0.2;
                    probLabel = "강력 매수"; probColor = "text-emerald-400"; color = "text-emerald-400";
                    action = `$${callWall} 돌파 시 추종 매수`;
                    warning = "돌파 전 선행 매수는 리스크 있음";
                    trigger = `거래량 동반 $${callWall} 돌파`;
                } else {
                    status = "저항 확인 (RESISTANCE)";
                    message = `저항벽($${callWall}) 도달. 수급이 약해 돌파 실패 시 조정 가능.`;
                    probability = 45 + compositeScore * 0.1;
                    probLabel = "주의"; probColor = "text-amber-400"; color = "text-amber-400";
                    action = "보유 시 일부 익절 고려";
                    warning = "신규 롱 자제, 저항 확인 필요";
                    trigger = `$${callWall} 돌파 확인 시 재진입`;
                }
            } else if (isNearSup) {
                if (compositeScore > 15) {
                    status = "바닥 매수 기회 (BUY THE DIP)";
                    message = `지지선($${putWall}) 터치. 기관 저점 매집 포착, 손익비 유리한 구간.`;
                    probability = 70 + compositeScore * 0.2;
                    probLabel = "매수"; probColor = "text-emerald-400"; color = "text-emerald-400";
                    action = `$${putWall} 부근 분할 매수`;
                    warning = `손절 기준: $${putWall} 이탈 시 즉시 탈출`;
                    trigger = `반등 확인 후 추가 매수`;
                } else {
                    status = "추가 하락 주의 (WEAK)";
                    message = `지지선($${putWall})이 위태로움. 수급 약화 시 이탈 위험.`;
                    probability = 30 + compositeScore * 0.15;
                    probLabel = "관망/매도"; probColor = "text-rose-500"; color = "text-rose-500";
                    action = "기존 롱 축소 또는 풋 헤지 추가";
                    warning = "신규 롱 자제, 반등 불확실";
                    trigger = `$${putWall} 이탈 시 손절 실행`;
                }
            } else {
                // MID-RANGE
                if (compositeScore > 35) {
                    status = "상승 모멘텀 (MOMENTUM)";
                    message = `박스권 중간이나 수급 상방 우위 확실. 기관 포지셔닝이 롱 방향.`;
                    probability = 65 + compositeScore * 0.2;
                    probLabel = "매수 우위"; probColor = "text-emerald-400"; color = "text-emerald-400";
                    action = `눌림목 매수 유효, $${putWall} 부근 진입`;
                    warning = "추격 매수보다 풀백 대기가 유리";
                    trigger = `$${callWall} 접근 시 익절 검토`;
                } else if (compositeScore < -35) {
                    status = "하락 압력 (PRESSURE)";
                    message = `하방 압력 우세. 풋 수급 확대, 기관 방어적 포지셔닝 포착.`;
                    probability = 35 + compositeScore * 0.15;
                    probLabel = "매도 우위"; probColor = "text-rose-400"; color = "text-rose-400";
                    action = "롱 축소, 풋 헤지 확대";
                    warning = "역추세 매수 위험, 하락 가속 가능";
                    trigger = `$${putWall} 이탈 시 전량 손절`;
                } else {
                    status = "방향성 탐색 (NEUTRAL)";
                    message = `박스권($${putWall}~$${callWall}) 중간. 수급 혼재, 방향 미확정.`;
                    probability = 50 + compositeScore * 0.1;
                    probLabel = "중립"; probColor = "text-slate-500"; color = "text-slate-500";
                    action = "관망, 방향 확정 시까지 대기";
                    warning = "양방향 베팅 자제, 확인 후 진입";
                    trigger = `Squeeze 50%+ 전환 또는 OPI ±30 이탈 시 방향 추종`;
                }
            }
        }

        // ===== SQUEEZE OVERRIDE: adds urgency to any scenario =====
        if (isSqueezeExtreme) {
            warning = "SQUEEZE EXTREME: 급등/급락 임박, 역방향 포지션 즉시 탈출";
            trigger = "방향 터지면 즉시 따라가기, 장 마감 30분 특별 주의";
        } else if (isSqueezeHigh) {
            if (!trigger.includes('Squeeze')) {
                trigger += trigger ? ' / ' : '';
                trigger += `Squeeze ${squeezeProbability.value}% 주의`;
            }
        }

        probability = Math.round(Math.max(5, Math.min(95, probability)));

        // =====================================
        // V4.0: FACTOR BREAKDOWN FOR VISUALIZATION
        // =====================================
        const factorBreakdown = [
            { key: 'opi', name: 'OPI', score: Math.round(opiScore), max: 25, label: opi.value > 0 ? '콜 우위' : opi.value < 0 ? '풋 우위' : '중립' },
            { key: 'whale', name: '고래', score: Math.round(whaleScore), max: 25, label: whaleScore > 0 ? '콜 매집' : whaleScore < 0 ? '풋 주도' : '관망' },
            { key: 'squeeze', name: '스퀴즈', score: Math.round(squeezeScore), max: 15, label: squeezeProbability.value >= 45 ? `${squeezeProbability.value}%` : '안정' },
            { key: 'skew', name: 'IV스큐', score: Math.round(skewScore), max: 15, label: ivSkew.value > 3 ? '공포' : ivSkew.value < -3 ? '탐욕' : '중립' },
            { key: 'smart', name: '스마트', score: Math.round(smartScore), max: 10, label: smartMoney.label },
            { key: 'dex', name: 'DEX', score: Math.round(dexScore), max: 10, label: dex.label },
            { key: 'uoa', name: 'UOA', score: Math.round(uoaScore), max: 5, label: uoa.label },
            { key: 'pc', name: 'P/C', score: Math.round(pcScore), max: 5, label: pcRatio.value > 1.3 ? '콜 과열' : pcRatio.value < 0.75 ? '풋 과열' : '균형' },
            { key: 'zdte', name: 'GEX', score: Math.round(zdteScore), max: 5, label: gexRegime.pinStrength >= 35 ? `${gexRegime.pinStrength}%` : '미미' },
        ];

        return { status, message, color, probability, probLabel, probColor, whaleBias, compositeScore, signals, netWhalePremium, callPremium, putPremium, action, warning, trigger, factorBreakdown };
    }, [currentPrice, callWall, putWall, flowMap, whaleTrades, isMarketClosed, opi, squeezeProbability, ivSkew, smartMoney, ivPercentile, dex, uoa, pcRatio, gexRegime]);

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
        <div className="space-y-1 animate-in fade-in zoom-in duration-500">
            {/* Header / Control Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50 p-2 px-4 rounded-md border border-white/5 backdrop-blur-md">
                {/* 1. Left: Branding with Prestige */}
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="h-9 w-9 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <Crosshair size={18} className="text-emerald-400 animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-white tracking-wide flex items-center gap-2">
                            FLOW RADAR <span className="text-amber-400 text-[9px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 flex items-center gap-1"><Lock size={8} /> LEVEL 3 CLEARANCE</span>
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

            {/* [PREMIUM] AI VERDICT - Flow Topography Map v3.0 Style */}
            {analysis && (
                <div className="bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-xl border border-white/10 p-3 backdrop-blur-xl shadow-2xl">
                    {/* Top Row: Title + Status with Dynamic Icon */}
                    <div className="flex items-center gap-3 mb-3">
                        <div className="relative">
                            <div className="h-8 w-8 bg-amber-500/20 rounded-lg flex items-center justify-center border border-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                                <Target size={16} className="text-amber-400" />
                            </div>
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-amber-400 tracking-widest">AI VERDICT</span>
                            {/* Dynamic Status Icon */}
                            {analysis.status?.includes('상승') || analysis.status?.includes('BULL') || analysis.status?.includes('매수') || analysis.status?.includes('BREAKOUT') || analysis.status?.includes('MOMENTUM') ? (
                                <TrendingUp size={16} className="text-emerald-400" />
                            ) : analysis.status?.includes('하락') || analysis.status?.includes('BEAR') || analysis.status?.includes('COLLAPSE') || analysis.status?.includes('PRESSURE') || analysis.status?.includes('WEAK') ? (
                                <TrendingDown size={16} className="text-rose-400" />
                            ) : analysis.status?.includes('저항') || analysis.status?.includes('RESISTANCE') ? (
                                <AlertTriangle size={14} className="text-rose-400" />
                            ) : analysis.status?.includes('돌파') ? (
                                <Zap size={16} className="text-amber-400" />
                            ) : (
                                <Activity size={14} className="text-slate-400" />
                            )}
                            <span className={`text-base font-black ${analysis.color}`}>{analysis.status}</span>
                        </div>
                    </div>

                    {/* Metrics Grid - Glassmorphism Cards - Balanced 50/50 */}
                    <div className="flex flex-col lg:flex-row gap-2">
                        {/* 1. Analysis Summary (50% width) - EXPANDED */}
                        <div className="lg:w-[50%] bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 shadow-inner flex flex-col">
                            {/* Row 1: Analysis Header + Composite Badge */}
                            <div className="flex items-center gap-2 mb-1.5">
                                <Activity size={14} className="text-cyan-400" />
                                <span className="text-[11px] text-white font-bold uppercase tracking-wider">분석</span>
                                {analysis.compositeScore !== undefined && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${analysis.compositeScore > 20 ? 'bg-emerald-500/20 text-emerald-400' : analysis.compositeScore < -20 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                        종합 {analysis.compositeScore > 0 ? '+' : ''}{Math.round(analysis.compositeScore)}
                                    </span>
                                )}
                            </div>
                            {/* Row 2: Analysis Message */}
                            <p className="text-[11px] text-white/90 leading-relaxed mb-2">{analysis.message}</p>

                            {/* Row 3: Composite Score Gauge */}
                            <div className="mb-2">
                                <div className="relative h-3 bg-gradient-to-r from-rose-500/30 via-slate-700/50 to-emerald-500/30 rounded-full overflow-hidden border border-white/10">
                                    {/* Center line */}
                                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30 z-10" />
                                    {/* Score indicator */}
                                    <div
                                        className={`absolute top-0.5 w-2 h-2 rounded-full z-20 shadow-lg transition-all duration-700 ${(analysis.compositeScore ?? 0) > 20 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : (analysis.compositeScore ?? 0) < -20 ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]'}`}
                                        style={{ left: `calc(${Math.max(2, Math.min(98, ((analysis.compositeScore ?? 0) + 100) / 2))}% - 4px)` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-0.5">
                                    <span className="text-[8px] text-rose-400/60">-100 극약세</span>
                                    <span className="text-[8px] text-slate-500">0</span>
                                    <span className="text-[8px] text-emerald-400/60">극강세 +100</span>
                                </div>
                            </div>

                            {/* Row 4: Factor Breakdown - Compact Glassmorphism */}
                            {analysis.factorBreakdown && (
                                <div className="bg-white/[0.03] backdrop-blur-sm rounded-lg p-2 border border-white/10 mb-2">
                                    <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                                        {analysis.factorBreakdown.map((f: any) => (
                                            <div key={f.key} className="flex items-center gap-1">
                                                <span className={`text-[9px] w-[28px] shrink-0 text-right font-bold ${f.score > 0 ? 'text-emerald-400/80' : f.score < 0 ? 'text-rose-400/80' : 'text-slate-500'}`}>{f.name}</span>
                                                <div className="flex-1 h-2.5 bg-slate-900/60 rounded-full overflow-hidden relative min-w-0 border border-white/5">
                                                    {/* Center line */}
                                                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
                                                    {f.score > 0 ? (
                                                        <div
                                                            className="absolute left-1/2 top-0 h-full bg-gradient-to-r from-emerald-500/80 to-emerald-400 rounded-r-full shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                                                            style={{ width: `${Math.min(50, (f.score / f.max) * 50)}%` }}
                                                        />
                                                    ) : f.score < 0 ? (
                                                        <div
                                                            className="absolute right-1/2 top-0 h-full bg-gradient-to-l from-rose-500/80 to-rose-400 rounded-l-full shadow-[0_0_6px_rgba(244,63,94,0.4)]"
                                                            style={{ width: `${Math.min(50, (Math.abs(f.score) / f.max) * 50)}%` }}
                                                        />
                                                    ) : null}
                                                </div>
                                                <span className={`text-[9px] font-black w-[20px] shrink-0 text-right ${f.score > 0 ? 'text-emerald-400' : f.score < 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                                                    {f.score > 0 ? '+' : ''}{f.score}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Row 5: Actionable Guidance */}
                            {(analysis.action || analysis.warning || analysis.trigger) && (
                                <div className="space-y-0.5 mb-1.5 bg-black/20 rounded-lg p-1.5 border border-white/5">
                                    {analysis.action && (
                                        <div className="flex items-start gap-1">
                                            <div className="mt-0.5 w-1 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                                            <span className="text-[9px] text-emerald-400 font-bold uppercase shrink-0 w-7">ACT</span>
                                            <span className="text-[10px] text-emerald-300">{analysis.action}</span>
                                        </div>
                                    )}
                                    {analysis.warning && (
                                        <div className="flex items-start gap-1">
                                            <div className="mt-0.5 w-1 h-2.5 rounded-full bg-amber-400 shrink-0" />
                                            <span className="text-[9px] text-amber-400 font-bold uppercase shrink-0 w-7">WARN</span>
                                            <span className="text-[10px] text-amber-300">{analysis.warning}</span>
                                        </div>
                                    )}
                                    {analysis.trigger && (
                                        <div className="flex items-start gap-1">
                                            <div className="mt-0.5 w-1 h-2.5 rounded-full bg-cyan-400 shrink-0" />
                                            <span className="text-[9px] text-cyan-400 font-bold uppercase shrink-0 w-7">TRIG</span>
                                            <span className="text-[10px] text-cyan-300">{analysis.trigger}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Row 6: Key Levels */}
                            <div className="flex items-center gap-3 pt-1.5 border-t border-white/10 mt-auto">
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-slate-400">지지</span>
                                    <span className="text-[10px] text-emerald-400 font-bold">${putWall}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-slate-400">저항</span>
                                    <span className="text-[10px] text-rose-400 font-bold">${callWall}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-slate-400">현재</span>
                                    <span className="text-[10px] text-white font-bold">${currentPrice.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2-5. 4 Metrics + 현재가위치/SQUEEZE (50% width) */}
                        <div className="flex flex-col gap-2 lg:w-[50%] shrink-0 self-start">
                            {/* Top Row: 4 Metric Cards (uniform height) */}
                            <div className="flex gap-2">
                                {/* OPI - Glowing Circular Gauge - ENLARGED */}
                                <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                    {/* Glow background */}
                                    <div className={`absolute inset-0 opacity-15 ${opi.value > 20 ? 'bg-emerald-500' : opi.value < -20 ? 'bg-rose-500' : 'bg-slate-500'} blur-xl`} />
                                    {/* Infographic: pressure arrows */}
                                    <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M10 28 L25 14 M10 28 L25 42 M70 28 L55 14 M70 28 L55 42" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-emerald-400" /><line x1="25" y1="28" x2="55" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-slate-400" /></svg>

                                    <span className="text-[11px] text-white font-bold uppercase relative z-10">OPI(델타압력)</span>
                                    <span className="text-[10px] text-white font-medium relative z-10 mt-0.5">콜-풋 포지션</span>

                                    {/* Circular Gauge with Glow - LARGER */}
                                    <div className="relative w-14 h-14 mt-1">
                                        {/* Outer glow ring */}
                                        <div className={`absolute inset-0 rounded-full ${opi.value > 20 ? 'shadow-[0_0_20px_rgba(52,211,153,0.6)]' : opi.value < -20 ? 'shadow-[0_0_20px_rgba(248,113,113,0.6)]' : 'shadow-[0_0_10px_rgba(148,163,184,0.3)]'}`} />

                                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                            {/* Background circle */}
                                            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
                                            {/* Glow circle */}
                                            <circle cx="18" cy="18" r="15" fill="none"
                                                stroke={opi.value > 20 ? '#34d399' : opi.value < -20 ? '#f87171' : '#94a3b8'}
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeDasharray={`${Math.abs(opi.value) * 0.94} 94`}
                                                style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
                                            />
                                        </svg>

                                        {/* Center text - LARGER */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className={`text-lg font-black ${opi.value > 20 ? 'text-emerald-400' : opi.value < -20 ? 'text-rose-400' : 'text-white'}`} style={{ textShadow: opi.value > 20 || opi.value < -20 ? '0 0 10px currentColor' : 'none' }}>
                                                {opi.value > 0 ? '+' : ''}{opi.value}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={`text-[11px] font-bold mt-1 relative z-10 ${opi.value > 20 ? 'text-emerald-400' : opi.value < -20 ? 'text-rose-400' : 'text-white'}`}>{opi.label}</div>
                                </div>

                                {/* ATM IV - Enhanced with Strategy Guidance */}
                                <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                    {/* Glow background */}
                                    <div className={`absolute inset-0 opacity-15 ${ivPercentile.value >= 60 ? 'bg-rose-500' : ivPercentile.value <= 25 ? 'bg-cyan-500' : 'bg-slate-500'} blur-xl`} />
                                    {/* Infographic: volatility wave */}
                                    <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M4 28 Q14 8 24 28 Q34 48 44 28 Q54 8 64 28 Q74 48 80 28" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400" strokeLinecap="round" /><line x1="4" y1="28" x2="80" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-purple-300" strokeDasharray="3 3" /></svg>

                                    <span className="text-[11px] text-white font-bold uppercase relative z-10">ATM IV</span>
                                    <span className="text-[10px] text-white font-medium relative z-10 mt-0.5">옵션가격 온도계</span>

                                    <div className={`text-2xl font-black relative z-10 mt-1 ${ivPercentile.value >= 60 ? 'text-rose-400' : ivPercentile.value <= 25 ? 'text-cyan-400' : 'text-white'}`} style={{ textShadow: ivPercentile.value >= 25 && ivPercentile.value < 60 ? 'none' : '0 0 10px currentColor' }}>
                                        {ivPercentile.value}%
                                    </div>
                                    <div className={`text-[11px] font-bold relative z-10 ${ivPercentile.value >= 80 ? 'text-rose-400' : ivPercentile.value >= 60 ? 'text-orange-400' : ivPercentile.value <= 15 ? 'text-cyan-400' : ivPercentile.value <= 25 ? 'text-teal-400' : 'text-white'}`}>
                                        {ivPercentile.value >= 80 ? '극도 과열'
                                            : ivPercentile.value >= 60 ? '매도 유리'
                                                : ivPercentile.value <= 15 ? '극저 IV'
                                                    : ivPercentile.value <= 25 ? '매수 유리'
                                                        : '중립'}
                                    </div>
                                    <div className="text-[11px] text-white/90 font-medium relative z-10 mt-0.5 text-center leading-tight">
                                        {ivPercentile.value >= 80 ? '스프레드 매도 적극 추천'
                                            : ivPercentile.value >= 60 ? '변동성 축소 베팅'
                                                : ivPercentile.value <= 15 ? '네이키드 매수 유리'
                                                    : ivPercentile.value <= 25 ? '스프레드 매수 유리'
                                                        : '커버드콜 중립 운용'}
                                    </div>
                                </div>

                                {/* COMPOSITE INDEX - replaces Confluence */}
                                <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                    {/* Glow background */}
                                    <div className={`absolute inset-0 opacity-15 ${analysis.probability >= 65 ? 'bg-emerald-500' : analysis.probability <= 35 ? 'bg-rose-500' : 'bg-slate-500'} blur-xl`} />
                                    {/* Infographic: convergence radar */}
                                    <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><circle cx="40" cy="28" r="20" fill="none" stroke="currentColor" strokeWidth="1" className="text-emerald-400" /><circle cx="40" cy="28" r="12" fill="none" stroke="currentColor" strokeWidth="1" className="text-emerald-300" /><circle cx="40" cy="28" r="4" fill="currentColor" className="text-emerald-400" /><line x1="40" y1="4" x2="40" y2="52" stroke="currentColor" strokeWidth="0.5" className="text-emerald-300" /><line x1="16" y1="28" x2="64" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-emerald-300" /></svg>

                                    <span className="text-[11px] text-white font-bold uppercase relative z-10">COMPOSITE INDEX</span>
                                    <span className="text-[10px] text-white font-medium relative z-10 mt-0.5">(종합지수)</span>

                                    <div className={`text-2xl font-black relative z-10 mt-1 ${analysis.probability >= 65 ? 'text-emerald-400' : analysis.probability <= 35 ? 'text-rose-400' : 'text-white'}`} style={{ textShadow: analysis.probability > 35 && analysis.probability < 65 ? 'none' : '0 0 10px currentColor' }}>
                                        {analysis.probability}%
                                    </div>
                                    <div className={`text-[11px] font-bold relative z-10 ${analysis.probability >= 65 ? 'text-emerald-400' : analysis.probability <= 35 ? 'text-rose-400' : 'text-white'}`}>
                                        {analysis.probability >= 80 ? '강한 수렴'
                                            : analysis.probability >= 65 ? '신호수렴'
                                                : analysis.probability <= 20 ? '강한 혼재'
                                                    : analysis.probability <= 35 ? '신호혼재'
                                                        : '관망'}
                                    </div>
                                    <div className="text-[11px] text-white/90 font-medium relative z-10 mt-0.5 text-center leading-tight">
                                        {analysis.probability >= 65
                                            ? `${analysis.signals.length}개 지표 일치 → 방향성 확인`
                                            : analysis.probability <= 35
                                                ? `지표 충돌 → 진입 위험`
                                                : `${analysis.signals.length}개 시그널 | 추가 확인 필요`
                                        }
                                    </div>
                                </div>

                                {/* WHALE POSITION + Net Premium Flow */}
                                <div className={`flex-1 backdrop-blur-md rounded-xl p-2 border flex flex-col items-center justify-center relative overflow-hidden ${analysis.whaleBias?.includes('BULL')
                                    ? 'bg-emerald-500/10 border-emerald-400/30'
                                    : analysis.whaleBias?.includes('BEAR')
                                        ? 'bg-rose-500/10 border-rose-400/30'
                                        : 'bg-white/5 border-white/10'
                                    }`}>
                                    {/* Glow background */}
                                    <div className={`absolute inset-0 opacity-20 ${analysis.whaleBias?.includes('BULL') ? 'bg-emerald-500'
                                        : analysis.whaleBias?.includes('BEAR') ? 'bg-rose-500'
                                            : 'bg-slate-500'
                                        } blur-xl`} />
                                    {/* Infographic: whale silhouette */}
                                    <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M8 36 Q20 12 40 24 Q60 36 72 18" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400" strokeLinecap="round" /><circle cx="16" cy="32" r="2.5" fill="currentColor" className="text-cyan-300" /><circle cx="64" cy="22" r="4" fill="currentColor" className="text-cyan-300" /></svg>

                                    <div className="flex items-center gap-1 mb-0.5 relative z-10">
                                        <Shield size={12} className="text-cyan-400" />
                                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">WHALE POSITION</span>
                                    </div>

                                    <div className={`text-lg font-black relative z-10 ${analysis.whaleBias?.includes('BULL') ? 'text-emerald-400'
                                        : analysis.whaleBias?.includes('BEAR') ? 'text-rose-400'
                                            : 'text-white'
                                        }`} style={{ textShadow: analysis.whaleBias?.includes('BULL') ? '0 0 12px rgba(52,211,153,0.8)' : analysis.whaleBias?.includes('BEAR') ? '0 0 12px rgba(248,113,113,0.8)' : 'none' }}>
                                        {analysis.whaleBias?.includes('BULL') ? 'LONG'
                                            : analysis.whaleBias?.includes('BEAR') ? 'SHORT'
                                                : 'WAIT'}
                                    </div>

                                    {/* Net Premium Flow */}
                                    {analysis.netWhalePremium !== undefined && (
                                        <div className="relative z-10 text-center">
                                            <div className={`text-[11px] font-black ${(analysis.netWhalePremium || 0) > 0 ? 'text-emerald-400' : (analysis.netWhalePremium || 0) < 0 ? 'text-rose-400' : 'text-white'}`}>
                                                {(analysis.netWhalePremium || 0) > 0 ? '+' : ''}
                                                ${Math.abs((analysis.netWhalePremium || 0) / 1000000) >= 1
                                                    ? `${((analysis.netWhalePremium || 0) / 1000000).toFixed(1)}M`
                                                    : `${((analysis.netWhalePremium || 0) / 1000).toFixed(0)}K`
                                                }
                                            </div>
                                            <div className="text-[10px] text-white/90 font-medium">
                                                C ${((analysis.callPremium || 0) / 1000).toFixed(0)}K / P ${((analysis.putPremium || 0) / 1000).toFixed(0)}K
                                            </div>
                                            <div className="text-[10px] text-white/90 font-medium mt-0.5">
                                                {(analysis.netWhalePremium || 0) > 500000 ? '대형 콜 매수 주도'
                                                    : (analysis.netWhalePremium || 0) > 100000 ? '콜 매수 우위'
                                                        : (analysis.netWhalePremium || 0) < -500000 ? '대형 풋 매수 주도'
                                                            : (analysis.netWhalePremium || 0) < -100000 ? '풋 매수 우위'
                                                                : '고래 관망 중'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Bottom Row: 현재가 위치 + SQUEEZE PROBABILITY */}
                            <div className="grid grid-cols-2 gap-2">
                                {/* 현재가 위치 (Compact) */}
                                <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 relative overflow-hidden">
                                    <div className={`absolute inset-0 opacity-10 ${(() => { const range = callWall - putWall; const pos = range > 0 ? ((currentPrice - putWall) / range) * 100 : 50; return pos < 30 ? 'bg-rose-500' : pos > 70 ? 'bg-emerald-500' : 'bg-indigo-500'; })()} blur-xl`} />
                                    {/* Infographic: price range gauge */}
                                    <svg className="absolute right-1 bottom-1 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M10 46 A 35 35 0 0 1 70 46" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400" strokeLinecap="round" /><line x1="40" y1="46" x2="40" y2="16" stroke="currentColor" strokeWidth="1.5" className="text-indigo-300" strokeLinecap="round" /><circle cx="40" cy="14" r="2.5" fill="currentColor" className="text-indigo-400" /></svg>
                                    <div className="relative z-10 flex flex-col items-center">
                                        <span className="text-[10px] text-white font-bold uppercase tracking-wider mb-1">현재가 위치</span>
                                        {(() => {
                                            const totalRange = callWall - putWall;
                                            const currentPos = currentPrice - putWall;
                                            let pct = totalRange > 0 ? (currentPos / totalRange) * 100 : 50;
                                            pct = Math.max(0, Math.min(100, pct));
                                            let gaugeColor = '#6366f1';
                                            if (pct < 30) gaugeColor = '#f43f5e';
                                            else if (pct > 70) gaugeColor = '#10b981';
                                            const radius = 45;
                                            const strokeWidth = 7;
                                            const circumference = Math.PI * radius;
                                            const progressOffset = circumference - (pct / 100) * circumference;
                                            return (
                                                <>
                                                    <svg width="110" height="65" viewBox="0 0 110 65" className="overflow-visible">
                                                        <path d="M 10 55 A 45 45 0 0 1 100 55" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} strokeLinecap="round" />
                                                        <path d="M 10 55 A 45 45 0 0 1 100 55" fill="none" stroke={gaugeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={progressOffset} style={{ filter: `drop-shadow(0 0 4px ${gaugeColor})`, transition: 'stroke-dashoffset 1s ease-out' }} />
                                                        <text x="55" y="42" textAnchor="middle" className="fill-white text-sm font-black">${currentPrice.toFixed(2)}</text>
                                                        <text x="55" y="56" textAnchor="middle" className="fill-slate-400 text-[9px]">{pct.toFixed(0)}%</text>
                                                    </svg>
                                                    <div className="flex justify-between w-full px-1 -mt-1">
                                                        <span className="text-[8px] text-rose-400 font-mono">${putWall}</span>
                                                        <span className="text-[8px] text-emerald-400 font-mono">${callWall}</span>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* SQUEEZE PROBABILITY (Compact) */}
                                <div className="relative rounded-xl p-3 bg-gradient-to-br from-amber-950/40 to-slate-900/60 border border-amber-500/30 overflow-hidden">
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.1),transparent_70%)]" />
                                    {/* Infographic: spring coil */}
                                    <svg className="absolute right-1 bottom-1 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M12 44 Q20 8 28 44 Q36 8 44 44 Q52 8 60 44 Q68 8 72 44" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" strokeLinecap="round" /><path d="M8 44 L72 44" stroke="currentColor" strokeWidth="0.5" className="text-amber-300" strokeDasharray="3 3" /></svg>
                                    <div className="relative z-10 flex flex-col items-center">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <Zap size={11} className="text-amber-400" />
                                            <span className="text-[10px] text-white font-bold uppercase tracking-wide">SQUEEZE</span>
                                            {!squeezeProbability.isLoading && (
                                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${squeezeProbability.label === 'EXTREME' ? 'bg-rose-500/80 text-white' : squeezeProbability.label === 'HIGH' ? 'bg-amber-500/80 text-white' : squeezeProbability.label === 'MODERATE' ? 'bg-yellow-500/80 text-black' : 'bg-emerald-500/80 text-white'}`}>
                                                    {squeezeProbability.label}
                                                </span>
                                            )}
                                        </div>
                                        {(() => {
                                            const pct = squeezeProbability.value;
                                            const strokeWidth = 7;
                                            const circumference = Math.PI * 45;
                                            const progressOffset = circumference * (1 - pct / 100);
                                            let gaugeColor = '#10b981';
                                            if (pct > 70) gaugeColor = '#ef4444';
                                            else if (pct > 40) gaugeColor = '#f59e0b';
                                            return (
                                                <>
                                                    <svg width="110" height="65" viewBox="0 0 110 65" className="overflow-visible">
                                                        <path d="M 10 55 A 45 45 0 0 1 100 55" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} strokeLinecap="round" />
                                                        <path d="M 10 55 A 45 45 0 0 1 100 55" fill="none" stroke={gaugeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={progressOffset} style={{ filter: `drop-shadow(0 0 4px ${gaugeColor})`, transition: 'stroke-dashoffset 1s ease-out' }} />
                                                        {(() => {
                                                            const angle = Math.PI - (pct / 100) * Math.PI;
                                                            const cx = 55 + 45 * Math.cos(angle);
                                                            const cy = 55 - 45 * Math.sin(angle);
                                                            return <circle cx={cx} cy={cy} r="4" fill="white" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.8))', transition: 'cx 1s, cy 1s' }} />;
                                                        })()}
                                                        <text x="55" y="42" textAnchor="middle" className="fill-white text-sm font-black">{squeezeProbability.isLoading ? '--' : `${pct}%`}</text>
                                                        <text x="55" y="56" textAnchor="middle" className="fill-slate-400 text-[9px]">{pct > 70 ? '스퀴즈 임박' : pct > 40 ? '주의 필요' : '안정'}</text>
                                                    </svg>
                                                    <div className="flex justify-between w-full px-2 -mt-1">
                                                        <span className="text-[8px] text-emerald-400 font-bold">0%</span>
                                                        <span className="text-[8px] text-amber-400 font-bold">50%</span>
                                                        <span className="text-[8px] text-rose-400 font-bold">100%</span>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 🆕 NEW METRICS ROW - Dark Pool / Short Volume / Bid-Ask / Block Trade */}
            <div className="grid grid-cols-4 gap-3 mb-1">
                {/* Dark Pool % */}
                <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden group hover:border-purple-500/50 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/50 to-transparent" />
                    {/* Infographic: scattered dots (institutional distribution) */}
                    <svg className="absolute right-1 bottom-1 w-24 h-16 opacity-[0.06] pointer-events-none" viewBox="0 0 96 64">
                        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <circle key={i} cx={8 + i * 12} cy={8 + ((i * 19) % 48)} r={2 + (i % 3)} fill="currentColor" className="text-purple-400" />)}
                        <path d="M8 56 L20 38 L32 45 L44 22 L56 30 L68 12 L80 28 L92 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-300" strokeLinecap="round" />
                    </svg>
                    <div className="relative z-10 flex flex-col items-center justify-center">
                        <div className="flex items-center gap-1.5 mb-1">
                            <div className={`w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)] ${realtimeMetrics.darkPool ? 'animate-pulse' : ''}`} />
                            <span className="text-[10px] text-white uppercase font-bold tracking-wide">Dark Pool %</span>
                            <span className="text-[8px] text-slate-400 font-medium">기관비중</span>
                            {/* Session Label: PRE / REG / POST */}
                            {(() => {
                                const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
                                const h = etNow.getHours(), m = etNow.getMinutes();
                                const mins = h * 60 + m;
                                const isPre = mins >= 240 && mins < 570;   // 4:00 AM - 9:29 AM ET
                                const isReg = mins >= 570 && mins < 960;   // 9:30 AM - 3:59 PM ET
                                const isPost = mins >= 960 && mins < 1200; // 4:00 PM - 7:59 PM ET
                                const label = isPre ? 'PRE' : isReg ? 'REG' : isPost ? 'POST' : 'CLOSED';
                                const color = isPre ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                    isReg ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                        isPost ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                                            'bg-slate-500/20 text-slate-400 border-slate-500/30';
                                return <span className={`text-[7px] px-1 py-0.5 rounded font-bold border ${color}`}>{label}</span>;
                            })()}
                        </div>
                        <span className="text-2xl font-black text-purple-400" style={{ textShadow: '0 0 20px rgba(168,85,247,0.7)' }}>
                            {realtimeMetrics.darkPool ? `${realtimeMetrics.darkPool.percent}%` : '--'}
                        </span>
                        {realtimeMetrics.darkPool && (
                            <span className="text-[10px] text-white mt-0.5 font-mono font-medium">
                                DP {(realtimeMetrics.darkPool.volume / 1000).toFixed(1)}K / 전체 {(realtimeMetrics.darkPool.totalVolume / 1000).toFixed(1)}K
                            </span>
                        )}
                        {/* Buy/Sell Ratio Bar */}
                        {realtimeMetrics.darkPool && (realtimeMetrics.darkPool.buyPct ?? 0) > 0 && (
                            <div className="w-full mt-1.5 px-1">
                                <div className="flex items-center justify-between text-[10px] font-bold mb-0.5">
                                    <span className="text-emerald-400">매수 {realtimeMetrics.darkPool.buyPct}%</span>
                                    <span className={`text-[9px] font-mono font-bold ${(realtimeMetrics.darkPool.netBuyValue || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        순매수 {(realtimeMetrics.darkPool.netBuyValue || 0) >= 0 ? '+' : ''}{((realtimeMetrics.darkPool.netBuyValue || 0) / 1e6).toFixed(1)}M
                                    </span>
                                    <span className="text-rose-400">{realtimeMetrics.darkPool.sellPct}% 매도</span>
                                </div>
                                <div className="flex h-[5px] rounded-full overflow-hidden bg-slate-700/50">
                                    <div className="bg-emerald-500 rounded-l-full transition-all duration-500" style={{ width: `${realtimeMetrics.darkPool.buyPct}%` }} />
                                    <div className="bg-rose-500 rounded-r-full transition-all duration-500" style={{ width: `${realtimeMetrics.darkPool.sellPct}%` }} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Short Volume % */}
                <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden group hover:border-rose-500/50 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-rose-400/50 to-transparent" />
                    {/* Infographic: descending bars (short selling pressure) */}
                    <svg className="absolute right-1 bottom-0 w-24 h-16 opacity-[0.06] pointer-events-none" viewBox="0 0 96 64">
                        <rect x="6" y="8" width="8" height="52" rx="2" fill="currentColor" className="text-rose-400" />
                        <rect x="20" y="16" width="8" height="44" rx="2" fill="currentColor" className="text-rose-400" />
                        <rect x="34" y="24" width="8" height="36" rx="2" fill="currentColor" className="text-rose-400" />
                        <rect x="48" y="30" width="8" height="30" rx="2" fill="currentColor" className="text-rose-300" />
                        <rect x="62" y="36" width="8" height="24" rx="2" fill="currentColor" className="text-rose-300" />
                        <rect x="76" y="42" width="8" height="18" rx="2" fill="currentColor" className="text-rose-300" />
                    </svg>
                    <div className="relative z-10 flex flex-col items-center justify-center">
                        <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                            <span className="text-[10px] text-white uppercase font-bold tracking-wide">Short Vol %</span>
                        </div>
                        <span className="text-2xl font-black text-rose-400" style={{ textShadow: '0 0 20px rgba(244,63,94,0.7)' }}>
                            {realtimeMetrics.shortVolume ? `${realtimeMetrics.shortVolume.percent}%` : '--'}
                        </span>
                        <span className="text-[9px] text-white font-medium">
                            {realtimeMetrics.shortVolume && realtimeMetrics.shortVolume.percent >= 40 ? '일일 공매도'
                                : realtimeMetrics.shortVolume && realtimeMetrics.shortVolume.percent >= 25 ? '일일 공매도'
                                    : '일일 공매도'}
                        </span>
                        {realtimeMetrics.shortVolume && (
                            <span className="text-[10px] text-white mt-0.5 font-mono font-medium">
                                공매도 {(realtimeMetrics.shortVolume.volume / 1000000).toFixed(1)}M / 총 {(realtimeMetrics.shortVolume.totalVolume / 1000000).toFixed(1)}M
                            </span>
                        )}
                    </div>
                </div>

                {/* P/C Ratio - Dual View (Volume + OI) */}
                {(() => {
                    const isOI = effectiveViewMode === 'OI';
                    const activePC = isOI ? pcRatioOI : pcRatio;
                    const dotColor = activePC.value >= 1.3 ? 'bg-emerald-500' : activePC.value <= 0.75 ? 'bg-rose-500' : 'bg-cyan-500';
                    return (
                        <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden group hover:border-cyan-500/50 transition-all duration-300">
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none" />
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
                            {/* Infographic: balanced scale lines (call/put equilibrium) */}
                            <svg className="absolute right-1 bottom-1 w-24 h-16 opacity-[0.06] pointer-events-none" viewBox="0 0 96 64">
                                <line x1="48" y1="4" x2="48" y2="56" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400" />
                                <path d="M12 28 Q30 12 48 28 Q66 44 84 28" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-300" strokeLinecap="round" />
                                <circle cx="20" cy="24" r="3" fill="currentColor" className="text-emerald-400" />
                                <circle cx="76" cy="24" r="3" fill="currentColor" className="text-rose-400" />
                                <path d="M8 48 L88 48" stroke="currentColor" strokeWidth="0.5" className="text-cyan-500" strokeDasharray="4 3" />
                            </svg>
                            <div className="relative z-10 flex flex-col items-center justify-center">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)] ${dotColor}`} />
                                    <span className="text-[10px] text-white uppercase font-bold tracking-wide">P/C Ratio</span>
                                    <span className={`text-[8px] font-medium ${isOI ? 'text-indigo-400' : 'text-white/40'}`}>{isOI ? 'OI' : 'VOLUME'}</span>
                                </div>
                                <span className={`text-2xl font-black ${activePC.color}`} style={{ textShadow: `0 0 20px currentColor` }}>
                                    {activePC.value > 0 ? activePC.value.toFixed(2) : '--'} <span className="text-sm">{activePC.label}</span>
                                </span>
                                <span className="text-[10px] text-white font-medium mt-0.5 font-mono">
                                    {isOI
                                        ? `C ${((pcRatioOI as any).callOI / 1000).toFixed(0)}K / P ${((pcRatioOI as any).putOI / 1000).toFixed(0)}K`
                                        : `C ${(pcRatio.callVol / 1000).toFixed(0)}K / P ${(pcRatio.putVol / 1000).toFixed(0)}K`
                                    }
                                </span>
                                {/* Call/Put Volume Visual Bar */}
                                {(() => {
                                    const cVol = isOI ? (pcRatioOI as any).callOI : pcRatio.callVol;
                                    const pVol = isOI ? (pcRatioOI as any).putOI : pcRatio.putVol;
                                    const total = cVol + pVol;
                                    if (total <= 0) return null;
                                    const cPct = Math.round((cVol / total) * 100);
                                    const pPct = 100 - cPct;
                                    return (
                                        <div className="w-full mt-1.5 px-1">
                                            <div className="flex items-center justify-between text-[9px] font-bold mb-0.5">
                                                <span className="text-emerald-400">콜 {cPct}%</span>
                                                <span className={`text-[8px] font-medium ${activePC.value >= 2.0 ? 'text-emerald-400' : activePC.value >= 1.3 ? 'text-emerald-300/80' : activePC.value <= 0.5 ? 'text-rose-400' : activePC.value <= 0.75 ? 'text-rose-300/80' : 'text-slate-400'}`}>
                                                    {activePC.value >= 2.0 ? '강세 심리'
                                                        : activePC.value >= 1.3 ? '상승 기대감'
                                                            : activePC.value <= 0.5 ? '하락 헷지'
                                                                : activePC.value <= 0.75 ? '방어적 심리'
                                                                    : '방향 탐색'}
                                                </span>
                                                <span className="text-rose-400">{pPct}% 풋</span>
                                            </div>
                                            <div className="flex h-[4px] rounded-full overflow-hidden bg-slate-700/50">
                                                <div className="bg-emerald-500 rounded-l-full transition-all duration-500" style={{ width: `${cPct}%` }} />
                                                <div className="bg-rose-500 rounded-r-full transition-all duration-500" style={{ width: `${pPct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })()}

                {/* GEX REGIME - Institutional Gamma Regime Indicator */}
                <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden group hover:border-amber-500/50 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
                    {/* Infographic: sine wave (gamma oscillation) */}
                    <svg className="absolute right-1 bottom-1 w-24 h-16 opacity-[0.06] pointer-events-none" viewBox="0 0 96 64">
                        <path d="M4 32 Q16 8 28 32 Q40 56 52 32 Q64 8 76 32 Q88 56 96 32" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" strokeLinecap="round" />
                        <path d="M4 32 Q16 16 28 32 Q40 48 52 32 Q64 16 76 32 Q88 48 96 32" fill="none" stroke="currentColor" strokeWidth="1" className="text-amber-300" strokeLinecap="round" strokeDasharray="3 4" />
                        <line x1="4" y1="32" x2="96" y2="32" stroke="currentColor" strokeWidth="0.5" className="text-amber-500" strokeDasharray="2 3" />
                    </svg>
                    <div className="relative z-10 flex flex-col items-center justify-center">
                        <div className="flex items-center gap-1.5 mb-1">
                            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)] ${gexRegime.pinStrength >= 50 ? 'bg-amber-500 animate-pulse' : 'bg-amber-500'}`} />
                            <span className="text-[10px] text-white uppercase font-bold tracking-wider">GEX REGIME</span>
                            {gexRegime.dte === 0 && (
                                <span className="text-[7px] px-1 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold animate-pulse">TODAY</span>
                            )}
                            <span className={`text-[7px] px-1 py-0.5 rounded font-bold border ${gexRegime.regime === 'STABLE' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                gexRegime.regime === 'TRANSITION' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                    gexRegime.regime === 'FLIP_ZONE' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                                        'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                }`}>{gexRegime.regime === 'STABLE' ? 'STABLE' : gexRegime.regime === 'TRANSITION' ? 'SHIFT' : gexRegime.regime === 'FLIP_ZONE' ? 'FLIP' : 'EXPLODE'}</span>
                        </div>
                        <span className={`text-2xl font-black ${gexRegime.color}`} style={{ textShadow: `0 0 20px currentColor` }}>
                            {gexRegime.pinStrength}% <span className="text-sm">{gexRegime.label}</span>
                        </span>
                        <span className="text-[10px] text-white/70 font-medium mt-0.5 font-mono">
                            {gexRegime.weeklyLabel} | {gexRegime.nearestCount}계약
                        </span>
                        <span className="text-[10px] text-amber-300 mt-0.5 italic font-semibold">
                            {gexRegime.flipLevel
                                ? (() => {
                                    const f = `FLIP $${gexRegime.flipLevel} (${gexRegime.flipDir}${gexRegime.flipDistance}%)`;
                                    const pinZone = Math.round(currentPrice / 5) * 5;
                                    if (gexRegime.regime === 'STABLE') return `${f} | $${pinZone} 핀닝 안정`;
                                    if (gexRegime.regime === 'TRANSITION') return `${f} | $${pinZone} 부근 ⚠ 전환 임박`;
                                    if (gexRegime.regime === 'FLIP_ZONE') return `${f} | 플립 근접, 급변동 주의`;
                                    return `${f} | 숏감마, 방향성 증폭 구간`;
                                })()
                                : (() => {
                                    const mp = maxPainDistance.maxPain;
                                    const atm = gexRegime.atmConcentration;
                                    if (gexRegime.isLongGamma) {
                                        return mp > 0
                                            ? `롱감마 | ATM ${atm}% 집중 | MP $${mp}`
                                            : `롱감마 | ATM ${atm}% 집중 → 가격 억제`;
                                    } else {
                                        return mp > 0
                                            ? `숏감마 | ATM ${atm}% | MP $${mp} → 변동 확대`
                                            : `숏감마 | ATM ${atm}% → 방향성 증폭 가능`;
                                    }
                                })()
                            }
                        </span>
                    </div>
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
                                    {flowViewMode === 'WHALE' && (
                                        <span className="text-[11px] text-slate-300 font-medium tracking-wide hidden sm:inline-block">
                                            <Info size={12} className="text-slate-400 inline mr-0.5" />
                                            <span className="text-cyan-400">Cost</span>=매수단가 | <span className="text-amber-400">BEP</span>=손익분기점
                                        </span>
                                    )}
                                    {/* Whale / Dark Pool Toggle */}
                                    <div className="flex bg-slate-950/80 backdrop-blur-xl rounded-lg p-1 border border-white/10 shrink-0 ml-auto gap-1">
                                        <button
                                            onClick={() => setFlowViewMode('WHALE')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-300 ${flowViewMode === 'WHALE'
                                                ? 'bg-cyan-500/20 backdrop-blur-md text-white border border-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                                        >
                                            <Shield size={13} className={flowViewMode === 'WHALE' ? 'text-cyan-400' : 'text-slate-500'} />
                                            <div className="flex flex-col items-start">
                                                <span className="text-[10px] font-black uppercase tracking-wider leading-none">Whale</span>
                                                <span className={`text-[8px] leading-none mt-0.5 ${flowViewMode === 'WHALE' ? 'text-cyan-300/70' : 'text-slate-600'}`}>고래추적</span>
                                            </div>
                                            {whaleTrades.length > 0 && (
                                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${flowViewMode === 'WHALE' ? 'bg-cyan-500/30 text-cyan-300' : 'bg-slate-700 text-slate-400'}`}>
                                                    {whaleTrades.length}
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setFlowViewMode('DARKPOOL')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-300 ${flowViewMode === 'DARKPOOL'
                                                ? 'bg-teal-500/20 backdrop-blur-md text-white border border-teal-400/40 shadow-[0_0_15px_rgba(20,184,166,0.3)]'
                                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                                        >
                                            <Layers size={13} className={flowViewMode === 'DARKPOOL' ? 'text-teal-400' : 'text-slate-500'} />
                                            <div className="flex flex-col items-start">
                                                <span className="text-[10px] font-black uppercase tracking-wider leading-none">Dark Pool</span>
                                                <span className={`text-[8px] leading-none mt-0.5 ${flowViewMode === 'DARKPOOL' ? 'text-teal-300/70' : 'text-slate-600'}`}>다크풀</span>
                                            </div>
                                        </button>
                                    </div>

                                </div>

                                {/* Horizontal Scroll Container */}
                                <div
                                    className="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 scrollbar-hide mask-linear-gradient"
                                    style={{ maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)' }}
                                >
                                    {flowViewMode === 'WHALE' ? (
                                        /* ===== WHALE TRADES VIEW ===== */
                                        whaleTrades.length === 0 ? (
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
                                                        relative min-w-[220px] p-3.5 rounded-xl border-2 backdrop-blur-xl flex flex-col justify-between gap-2
                                                        transition-all duration-500 hover:scale-105 hover:z-10
                                                        animate-in fade-in slide-in-from-right-4
                                                        ${nodeBorder} ${nodeBg}
                                                    `}
                                                    >
                                                        {/* Glassmorphism inner glow */}
                                                        <div className={`absolute inset-0 rounded-xl opacity-20 pointer-events-none ${isHighImpact ? 'bg-gradient-to-br from-amber-400/30 via-transparent to-amber-500/10' : isCall ? 'bg-gradient-to-br from-emerald-400/20 via-transparent to-cyan-500/10' : 'bg-gradient-to-br from-rose-400/20 via-transparent to-pink-500/10'}`} />
                                                        {/* Top shine */}
                                                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-xl" />
                                                        {/* Blinking Border Overlay */}
                                                        {ShowBlink && (
                                                            <div className={`absolute inset-[-2px] rounded-xl border-2 ${BlinkColor} animate-pulse pointer-events-none`} />
                                                        )}

                                                        {/* Row 1: Ticker & Time */}
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-black text-white tracking-wider flex items-center gap-1.5 shadow-black/50 drop-shadow-md">
                                                                    {isHighImpact && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />} {t.underlying || ticker}
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
                                        )) : (
                                        /* ===== DARK POOL VIEW ===== */
                                        darkPoolTrades.length === 0 ? (
                                            <div className="min-w-[300px] h-[100px] flex items-center justify-center text-teal-500/30 font-mono text-sm border border-teal-500/10 rounded-xl bg-teal-950/10 backdrop-blur-sm">
                                                Scanning Dark Pool Activity...
                                            </div>
                                        ) : (
                                            darkPoolTrades.map((dp: any, i: number) => {
                                                const isBlock = dp.size >= 10000;
                                                const isMajor = dp.premium >= 1000000;
                                                const nodeBorder = isMajor
                                                    ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                                                    : isBlock
                                                        ? 'border-teal-400/60 shadow-[0_0_10px_rgba(45,212,191,0.2)]'
                                                        : 'border-slate-500/30 shadow-[0_0_5px_rgba(100,116,139,0.1)]';
                                                const nodeBg = isMajor ? 'bg-amber-950/40' : 'bg-slate-800/40';

                                                return (
                                                    <div
                                                        key={dp.id || i}
                                                        className={`
                                                        relative min-w-[200px] p-3 rounded-xl border-2 backdrop-blur-md flex flex-col justify-between gap-2
                                                        transition-all duration-500 hover:scale-105 hover:z-10 bg-gradient-to-b from-white/10 to-transparent
                                                        animate-in fade-in slide-in-from-right-4
                                                        ${nodeBorder} ${nodeBg}
                                                    `}
                                                    >
                                                        {/* Blinking border for major trades */}
                                                        {isMajor && (
                                                            <div className="absolute inset-[-2px] rounded-xl border-2 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.6)] animate-pulse pointer-events-none" />
                                                        )}

                                                        {/* Row 1: Ticker & Exchange */}
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-black text-white tracking-wider flex items-center gap-1.5">
                                                                    {isBlock && <span className="inline-block w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)] animate-pulse" />}
                                                                    {ticker}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-mono mt-0.5">{dp.exchangeName}</span>
                                                            </div>
                                                            <div className="text-right flex flex-col items-end">
                                                                <div className="text-[11px] font-bold px-2 py-0.5 rounded mb-1 text-teal-300 bg-teal-500/15">
                                                                    DARK POOL
                                                                </div>
                                                                <div className={`text-[9px] font-bold tracking-wider ${isBlock ? 'text-amber-400' : 'text-slate-400'}`}>
                                                                    {isBlock ? 'BLOCK' : 'STANDARD'}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Row 2: Size & Price */}
                                                        <div className="flex justify-between items-end border-b border-white/10 pb-2">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] text-slate-400">Size</span>
                                                                <span className="text-sm font-bold text-white">
                                                                    {dp.size >= 1000 ? `${(dp.size / 1000).toFixed(1)}K` : dp.size} shares
                                                                </span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-sm font-bold text-white">${dp.price.toFixed(2)}</span>
                                                            </div>
                                                        </div>

                                                        {/* Row 3: Premium & Time */}
                                                        <div className="flex justify-between items-center">
                                                            <div className={`text-sm font-black tracking-tight ${isMajor ? 'text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]' : 'text-teal-300'}`}>
                                                                ${dp.premium >= 1000000 ? `${(dp.premium / 1000000).toFixed(1)}M` : `${(dp.premium / 1000).toFixed(0)}K`}
                                                            </div>
                                                            <div className="text-[11px] font-mono text-slate-400">
                                                                {dp.timeET}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ))}
                                </div>
                            </div>
                        </div>

                        {/* Visual Separator between LEVEL 3 and Bar Chart */}
                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-slate-900 px-4 text-[9px] font-black text-slate-500 tracking-widest">
                                    OPTIONS FLOW BATTLEFIELD
                                </span>
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
                    <Card className="bg-slate-900/30 backdrop-blur-md border-white/10 flex flex-col rounded-xl h-full min-h-0 shadow-2xl relative overflow-y-auto">
                        {/* Subtle Grid Background */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-50" />

                        <CardContent className="p-4 pb-8 flex flex-col relative z-10">
                            {/* Implied Move (기대변동폭) */}
                            <div className="mb-4 bg-gradient-to-br from-teal-950/20 to-slate-900/40 border border-teal-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-teal-500/30 transition-all">
                                <div className="absolute inset-0 bg-teal-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                {/* Infographic: expanding arrows (implied move range) */}
                                <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M25 28 L8 16 M25 28 L8 40 M55 28 L72 16 M55 28 L72 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-teal-400" /><line x1="25" y1="28" x2="55" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="text-teal-300" /></svg>
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
                                            <span className="text-xs text-white font-bold uppercase tracking-wider">Implied Move</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={`text-2xl font-black ${impliedMove.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                ±{impliedMove.value}%
                                            </div>
                                            <div className={`text-sm font-bold ${impliedMove.color} px-2 py-0.5 bg-black/20 rounded`}>{impliedMove.label}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] mb-1">
                                        <span className="text-slate-400">ATM Straddle <span className="text-teal-400/70">({impliedMove.expiryLabel})</span></span>
                                        <span className="text-white font-bold font-mono">${impliedMove.straddle}</span>
                                    </div>
                                    <div className="text-[11px] text-white/90 font-medium pl-4 border-l border-teal-500/30">
                                        <BarChart3 size={11} className="text-teal-400 inline mr-1" />{impliedMove.direction === 'bullish' ? '콜 프리미엄 우위 → 상승 기대' : impliedMove.direction === 'bearish' ? '풋 프리미엄 우위 → 하락 기대' : '균형'}
                                    </div>
                                </div>
                            </div>

                            {/* PUT FLOOR + CALL WALL: 2-Column Grid (Swapped Order) */}
                            <div className="grid grid-cols-2 gap-2">
                                {/* PUT FLOOR (Left - Support) */}
                                <div className="bg-gradient-to-br from-rose-950/30 to-slate-900/50 border border-rose-500/20 rounded-lg p-3 relative overflow-hidden group hover:border-rose-500/40 transition-all">
                                    <div className="absolute inset-0 bg-rose-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: floor support line */}
                                    <svg className="absolute right-1 bottom-1 w-16 h-12 opacity-[0.06] pointer-events-none" viewBox="0 0 64 48"><line x1="4" y1="38" x2="60" y2="38" stroke="currentColor" strokeWidth="2" className="text-rose-400" /><path d="M12 30 L24 22 L36 26 L48 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-rose-300" strokeLinecap="round" /><path d="M48 14 L48 20 M48 14 L42 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-rose-300" strokeLinecap="round" /></svg>
                                    <div className="flex items-center justify-between mb-2 relative z-10">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-sm shadow-[0_0_5px_rgba(244,63,94,0.8)] animate-pulse" />
                                            <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">PUT FLOOR</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-rose-400">
                                            {currentPrice > 0 && putWall > 0 ? `${(((currentPrice - putWall) / currentPrice) * 100).toFixed(1)}%↑` : '-'}
                                        </span>
                                    </div>
                                    <div className="text-2xl font-black text-rose-400 font-mono relative z-10" style={{ textShadow: '0 0 10px rgba(251,113,133,0.5)' }}>
                                        ${putWall}
                                    </div>
                                    <div className="text-[9px] text-rose-500/70 mt-1 relative z-10">{t('support')}</div>
                                </div>

                                {/* CALL WALL (Right - Resistance) */}
                                <div className="bg-gradient-to-br from-emerald-950/30 to-slate-900/50 border border-emerald-500/20 rounded-lg p-3 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                                    <div className="absolute inset-0 bg-emerald-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: ceiling resistance line */}
                                    <svg className="absolute right-1 bottom-1 w-16 h-12 opacity-[0.06] pointer-events-none" viewBox="0 0 64 48"><line x1="4" y1="10" x2="60" y2="10" stroke="currentColor" strokeWidth="2" className="text-emerald-400" /><path d="M12 38 L24 30 L36 34 L48 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-300" strokeLinecap="round" /><path d="M48 22 L48 28 M48 22 L42 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-300" strokeLinecap="round" /></svg>
                                    <div className="flex items-center justify-between mb-2 relative z-10">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-sm shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse" />
                                            <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">CALL WALL</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-400">
                                            {currentPrice > 0 && callWall > 0 ? `${(((callWall - currentPrice) / currentPrice) * 100).toFixed(1)}%↓` : '-'}
                                        </span>
                                    </div>
                                    <div className="text-2xl font-black text-emerald-400 font-mono relative z-10" style={{ textShadow: '0 0 10px rgba(52,211,153,0.5)' }}>
                                        ${callWall}
                                    </div>
                                    <div className="text-[9px] text-emerald-500/70 mt-1 relative z-10">{t('resistance')}</div>
                                </div>
                            </div>

                            {/* Other Indicators: 1-Column Full-Width with Spacious Layout */}
                            <div className="flex flex-col gap-3 mt-3">
                                {/* Smart Money Score */}
                                <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900/40 border border-indigo-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-indigo-500/30 transition-all">
                                    <div className="absolute inset-0 bg-indigo-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: money flow stack */}
                                    <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><rect x="10" y="8" width="24" height="6" rx="2" fill="currentColor" className="text-indigo-400" /><rect x="10" y="18" width="36" height="6" rx="2" fill="currentColor" className="text-indigo-400" /><rect x="10" y="28" width="48" height="6" rx="2" fill="currentColor" className="text-indigo-300" /><rect x="10" y="38" width="60" height="6" rx="2" fill="currentColor" className="text-indigo-300" /></svg>
                                    <div className="relative z-10">
                                        {/* Row 1: Label + Value */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wider">스마트머니</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`text-2xl font-black ${smartMoney.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                    {smartMoney.score}
                                                </div>
                                                <div className={`text-sm font-bold ${smartMoney.color} px-2 py-0.5 bg-black/20 rounded`}>{smartMoney.label}</div>
                                            </div>
                                        </div>
                                        {/* Row 2: Rationale */}
                                        <div className="text-[11px] text-white/90 font-medium pl-4 border-l border-indigo-500/30">
                                            <Banknote size={11} className="text-indigo-400 inline mr-1" />대형거래: {smartMoney.rationale || '분석 중...'}
                                        </div>
                                    </div>
                                </div>

                                {/* Max Pain 거리 */}
                                <div className="bg-gradient-to-br from-orange-950/20 to-slate-900/40 border border-orange-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-orange-500/30 transition-all">
                                    <div className="absolute inset-0 bg-orange-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: target crosshair */}
                                    <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><circle cx="40" cy="28" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-400" /><circle cx="40" cy="28" r="10" fill="none" stroke="currentColor" strokeWidth="1" className="text-orange-300" /><circle cx="40" cy="28" r="3" fill="currentColor" className="text-orange-400" /><line x1="40" y1="6" x2="40" y2="50" stroke="currentColor" strokeWidth="0.5" className="text-orange-300" /><line x1="18" y1="28" x2="62" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-orange-300" /></svg>
                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wider">Max Pain 거리</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className={`text-2xl font-black ${maxPainDistance.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                    {maxPainDistance.direction === 'above' ? '+' : maxPainDistance.direction === 'below' ? '' : ''}{maxPainDistance.distPercent}%
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] mb-1">
                                            <span className="text-slate-400">Max Pain</span>
                                            <span className="text-white font-bold font-mono">${maxPainDistance.maxPain}</span>
                                        </div>
                                        <div className="text-[11px] text-white/90 font-medium pl-4 border-l border-orange-500/30">
                                            <Crosshair size={11} className="text-orange-400 inline mr-1" />{maxPainDistance.direction === 'above' ? `현재가가 Max Pain 위에 $${Math.abs(maxPainDistance.distance).toFixed(1)} 초과` : maxPainDistance.direction === 'below' ? `현재가가 Max Pain 아래 $${Math.abs(maxPainDistance.distance).toFixed(1)} 미달` : 'Max Pain 근접 (수렴 가능성)'}
                                        </div>
                                    </div>
                                </div>

                                {/* IV Skew */}
                                <div className="bg-gradient-to-br from-violet-950/20 to-slate-900/40 border border-violet-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-violet-500/30 transition-all">
                                    <div className="absolute inset-0 bg-violet-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: tilted skew line */}
                                    <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M8 44 Q24 40 40 28 Q56 16 72 12" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400" strokeLinecap="round" /><line x1="8" y1="28" x2="72" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-violet-300" strokeDasharray="4 3" /><circle cx="40" cy="28" r="2.5" fill="currentColor" className="text-violet-400" /></svg>
                                    <div className="relative z-10">
                                        {/* Row 1: Label + Value */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wider">IV 스큐</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`text-2xl font-black ${ivSkew.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                    {ivSkew.value > 0 ? '+' : ''}{ivSkew.value}%
                                                </div>
                                                <div className={`text-sm font-bold ${ivSkew.color} px-2 py-0.5 bg-black/20 rounded`}>{ivSkew.label}</div>
                                            </div>
                                        </div>
                                        {/* Row 2: Rationale */}
                                        <div className="text-[11px] text-white/90 font-medium pl-4 border-l border-violet-500/30">
                                            <BarChart3 size={11} className="text-violet-400 inline mr-1" />{ivSkew.rationale || '풋/콜 IV 분석 중...'}
                                        </div>
                                    </div>
                                </div>

                                {/* DEX (Delta Exposure) - Dealer Delta Hedging */}
                                <div className="bg-gradient-to-br from-cyan-950/20 to-slate-900/40 border border-cyan-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                                    <div className="absolute inset-0 bg-cyan-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: delta hedging arrows */}
                                    <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M12 40 L40 12 L68 40" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400" strokeLinecap="round" strokeLinejoin="round" /><path d="M26 40 L40 24 L54 40" fill="none" stroke="currentColor" strokeWidth="1" className="text-cyan-300" strokeDasharray="3 3" /></svg>
                                    <div className="relative z-10">
                                        {/* Row 1: Label + Value */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wider">DEX (델타노출)</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`text-2xl font-black ${dex.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                    {dex.value > 0 ? '+' : ''}{dex.value.toFixed(1)}M
                                                </div>
                                                <div className={`text-sm font-bold ${dex.color} px-2 py-0.5 bg-black/20 rounded`}>{dex.label}</div>
                                            </div>
                                        </div>
                                        {/* Row 2: Rationale */}
                                        <div className="text-[11px] text-white/90 font-medium pl-4 border-l border-cyan-500/30">
                                            <TrendingUp size={11} className="text-cyan-400 inline mr-1" />{dex.rationale || '델타 분석 중...'}
                                        </div>
                                    </div>
                                </div>

                                {/* UOA Score (Unusual Options Activity) */}
                                <div className="bg-gradient-to-br from-amber-950/20 to-slate-900/40 border border-amber-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-amber-500/30 transition-all">
                                    <div className="absolute inset-0 bg-amber-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: alert burst */}
                                    <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.06] pointer-events-none" viewBox="0 0 80 56"><path d="M40 8 L44 20 L56 20 L46 28 L50 40 L40 32 L30 40 L34 28 L24 20 L36 20 Z" fill="currentColor" className="text-amber-400" /><circle cx="40" cy="24" r="4" fill="none" stroke="currentColor" strokeWidth="1" className="text-amber-300" /></svg>
                                    <div className="relative z-10">
                                        {/* Row 1: Label + Value */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wider">UOA (이상거래)</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`text-2xl font-black ${uoa.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                    {uoa.score}x
                                                </div>
                                                <div className={`text-sm font-bold ${uoa.color} px-2 py-0.5 bg-black/20 rounded`}>{uoa.label}</div>
                                            </div>
                                        </div>
                                        {/* Row 2: Rationale */}
                                        <div className="text-[11px] text-white/90 font-medium pl-4 border-l border-amber-500/30">
                                            <Activity size={11} className="text-amber-400 inline mr-1" />{uoa.rationale || '거래량 분석 중...'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div >
    );
}
