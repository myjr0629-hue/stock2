// [S-56.4.5] FlowRadar with optimized date display
"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Radar, Target, Crosshair, Zap, Layers, Info, TrendingUp, TrendingDown, Activity, Lightbulb, Percent, Lock, Shield, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "./ui/progress";
import { useTranslations } from 'next-intl';

interface FlowRadarProps {
    ticker: string;
    rawChain: any[];
    currentPrice: number;
    // [SQUEEZE FIX] API squeezeScore for unified display with Dashboard
    squeezeScore?: number | null;
    squeezeRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
}

export function FlowRadar({ ticker, rawChain, currentPrice, squeezeScore: apiSqueezeScore, squeezeRisk: apiSqueezeRisk }: FlowRadarProps) {
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

    // [Fix] Reset State on Ticker Change (Prevent Stale Data)
    useEffect(() => {
        setWhaleTrades([]);
        setIsSystemReady(false);
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

    // Poll for trades
    useEffect(() => {
        if (rawChain.length > 0) {
            fetchWhaleTrades();
            const interval = setInterval(fetchWhaleTrades, 15000); // Every 15s
            return () => clearInterval(interval);
        }
    }, [rawChain]);

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

        const rawOpi = callPressure - putPressure;
        // Normalize to -100 ~ +100 scale (based on typical values)
        const normalized = Math.max(-100, Math.min(100, rawOpi / 10000));

        let label = '중립';
        let color = 'text-white';
        if (normalized > 50) { label = '강한 상승 압력'; color = 'text-emerald-400'; }
        else if (normalized > 20) { label = '상승 압력'; color = 'text-emerald-300'; }
        else if (normalized < -50) { label = '강한 하락 압력'; color = 'text-rose-400'; }
        else if (normalized < -20) { label = '하락 압력'; color = 'text-rose-300'; }

        return { value: Math.round(normalized), label, color };
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

        // [Fix] Filter for Today's Session only if Market is Active
        let activeTrades = whaleTrades;
        if (!isMarketClosed) {
            const cutoff = Date.now() - (16 * 60 * 60 * 1000);
            activeTrades = whaleTrades.filter(t => new Date(t.tradeDate).getTime() > cutoff);
        }

        // 1. Whale Flow Decomposition
        let netWhalePremium = 0;
        let maxPremium = 0;
        let alphaTrade: any = null;

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

        // Clamp final score
        compositeScore = Math.max(-100, Math.min(100, compositeScore));

        // =====================================
        // GENERATE NARRATIVE FROM COMPOSITE SCORE
        // =====================================
        let status = "판단 보류 (SCANNING)";
        let message = "세력들의 움직임을 정밀 분석 중입니다...";
        let color = "text-slate-400";
        let probability = 50;
        let probLabel = "중립";
        let probColor = "text-slate-500";

        // Build signal summary string
        const signalSummary = signals.length > 0 ? `[${signals.join(' / ')}]` : '';

        // Alpha Trade Intel
        let alphaIntel = "";
        if (alphaTrade) {
            const unitCost = alphaTrade.premium / (alphaTrade.size * 100);
            const alphaBEP = alphaTrade.type === 'CALL' ? alphaTrade.strike + unitCost : alphaTrade.strike - unitCost;
            alphaIntel = `최대거래: ${alphaTrade.type} $${alphaTrade.strike} ($${(alphaTrade.premium / 1000).toFixed(0)}K)`;
        }

        // Position-based logic with composite score integration
        if (currentPrice > callWall) {
            // BREAKOUT ZONE
            if (compositeScore > 30) {
                status = "초강력 상승 (SUPER-CYCLE)";
                message = `저항벽($${callWall}) 돌파! ${signalSummary} 모든 지표가 상방을 지지합니다. ${alphaIntel}`;
                probability = Math.min(98, 75 + compositeScore * 0.23);
                probLabel = "확신";
                probColor = "text-emerald-400";
                color = "text-emerald-400";
            } else {
                status = "돌파 후 숨고르기";
                message = `저항($${callWall}) 돌파했으나 추가 수급 불확실. ${signalSummary} 지지 전환 확인 필요.`;
                probability = 55 + compositeScore * 0.1;
                probLabel = "관망";
                probColor = "text-amber-400";
                color = "text-amber-400";
            }
        } else if (currentPrice < putWall) {
            // BREAKDOWN ZONE
            if (compositeScore < -30) {
                status = "지지선 붕괴 (COLLAPSE)";
                message = `최후 방어선($${putWall}) 이탈! ${signalSummary} 하방 압력이 극심합니다. ${alphaIntel}`;
                probability = Math.max(5, 25 + compositeScore * 0.2);
                probLabel = "위험";
                probColor = "text-rose-500";
                color = "text-rose-500";
            } else {
                status = "베어 트랩 가능성";
                message = `지지선($${putWall}) 이탈은 페이크일 수 있습니다. ${signalSummary} 반등 시 숏커버링 예상.`;
                probability = 40 + compositeScore * 0.1;
                probLabel = "주의";
                probColor = "text-amber-500";
                color = "text-amber-500";
            }
        } else {
            // INSIDE RANGE
            const isNearRes = distToCall < 1.0;
            const isNearSup = Math.abs(distToPut) < 1.0;

            if (isNearRes) {
                if (compositeScore > 25) {
                    status = "돌파 임박 (BREAKOUT READY)";
                    message = `저항($${callWall}) 근접! ${signalSummary} 에너지 충전 완료. 탑승 권고.`;
                    probability = 75 + compositeScore * 0.2;
                    probLabel = "강력 매수";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else {
                    status = "저항 확인 (RESISTANCE)";
                    message = `저항벽($${callWall}) 도달. ${signalSummary} 돌파 실패 시 조정 가능.`;
                    probability = 45 + compositeScore * 0.1;
                    probLabel = "주의";
                    probColor = "text-amber-400";
                    color = "text-amber-400";
                }
            } else if (isNearSup) {
                if (compositeScore > 15) {
                    status = "바닥 매수 기회 (BUY THE DIP)";
                    message = `지지선($${putWall}) 터치! ${signalSummary} 스마트머니 저점 매집 중. 손익비 최상.`;
                    probability = 70 + compositeScore * 0.2;
                    probLabel = "매수";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else {
                    status = "추가 하락 주의 (WEAK)";
                    message = `지지선($${putWall})이 위태롭습니다. ${signalSummary} 지지 이탈 시 손절 권고.`;
                    probability = 30 + compositeScore * 0.15;
                    probLabel = "관망/매도";
                    probColor = "text-rose-500";
                    color = "text-rose-500";
                }
            } else {
                // MID-RANGE
                if (compositeScore > 35) {
                    status = "상승 모멘텀 (MOMENTUM)";
                    message = `박스권 중간이지만 ${signalSummary} 상방 우위 확실. 눌림목 매수 유효.`;
                    probability = 65 + compositeScore * 0.2;
                    probLabel = "매수 우위";
                    probColor = "text-emerald-400";
                    color = "text-emerald-400";
                } else if (compositeScore < -35) {
                    status = "하락 압력 (PRESSURE)";
                    message = `${signalSummary} 하방 압력 우세. 보수적 접근 권고.`;
                    probability = 35 + compositeScore * 0.15;
                    probLabel = "매도 우위";
                    probColor = "text-rose-400";
                    color = "text-rose-400";
                } else {
                    status = "방향성 탐색 (NEUTRAL)";
                    message = `박스권($${putWall}~$${callWall}) 중간. ${signalSummary} 확실한 방향 결정 전까지 관망.`;
                    probability = 50 + compositeScore * 0.1;
                    probLabel = "중립";
                    probColor = "text-slate-500";
                    color = "text-slate-500";
                }
            }
        }

        probability = Math.round(Math.max(5, Math.min(95, probability)));

        return { status, message, color, probability, probLabel, probColor, whaleBias, compositeScore, signals };
    }, [currentPrice, callWall, putWall, flowMap, whaleTrades, isMarketClosed, opi, squeezeProbability, ivSkew, smartMoney, ivPercentile, dex, uoa]);

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
                        <div className="lg:w-[50%] bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 shadow-inner">
                            <div className="flex items-center gap-2 mb-2">
                                <Activity size={14} className="text-cyan-400" />
                                <span className="text-[11px] text-white font-bold uppercase tracking-wider">분석</span>
                                {analysis.compositeScore !== undefined && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${analysis.compositeScore > 20 ? 'bg-emerald-500/20 text-emerald-400' : analysis.compositeScore < -20 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                        종합 {analysis.compositeScore > 0 ? '+' : ''}{Math.round(analysis.compositeScore)}
                                    </span>
                                )}
                            </div>
                            <p className="text-[12px] text-white leading-relaxed mb-2">{analysis.message}</p>

                            {/* Signal Tags */}
                            {analysis.signals && analysis.signals.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {analysis.signals.map((sig: string, idx: number) => (
                                        <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                            {sig}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Key Levels */}
                            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
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

                        {/* 2-5. 4 Metrics Row with Glow Effects (50% width) */}
                        <div className="flex gap-2 lg:w-[50%] shrink-0">
                            {/* OPI - Glowing Circular Gauge - ENLARGED */}
                            <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                {/* Glow background */}
                                <div className={`absolute inset-0 opacity-15 ${opi.value > 20 ? 'bg-emerald-500' : opi.value < -20 ? 'bg-rose-500' : 'bg-slate-500'} blur-xl`} />

                                <span className="text-[11px] text-white font-bold uppercase relative z-10">OPI(델타압력)</span>
                                <span className="text-[9px] text-white/80 relative z-10 mt-0.5">콜-풋 포지션</span>

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

                            {/* ATM IV - Larger Text with Position Suggestion */}
                            <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                {/* Glow background */}
                                <div className={`absolute inset-0 opacity-15 ${ivPercentile.value >= 60 ? 'bg-rose-500' : ivPercentile.value <= 25 ? 'bg-cyan-500' : 'bg-slate-500'} blur-xl`} />

                                <span className="text-[11px] text-white font-bold uppercase relative z-10">ATM IV</span>

                                <div className={`text-2xl font-black relative z-10 mt-1 ${ivPercentile.value >= 60 ? 'text-rose-400' : ivPercentile.value <= 25 ? 'text-cyan-400' : 'text-white'}`} style={{ textShadow: ivPercentile.value >= 25 && ivPercentile.value < 60 ? 'none' : '0 0 10px currentColor' }}>
                                    {ivPercentile.value}%
                                </div>
                                <div className={`text-[11px] font-bold relative z-10 ${ivPercentile.value >= 60 ? 'text-rose-400' : ivPercentile.value <= 25 ? 'text-cyan-400' : 'text-white'}`}>
                                    {ivPercentile.value >= 60 ? '매도유리' : ivPercentile.value <= 25 ? '매수유리' : '중립'}
                                </div>
                                <div className="text-[9px] text-white/50 relative z-10 mt-0.5">
                                    {ivPercentile.value >= 60 ? '프리미엄 비쌈' : ivPercentile.value <= 25 ? '프리미엄 저렴' : '프리미엄 보통'}
                                </div>
                            </div>

                            {/* Confluence - Signal Convergence */}
                            <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                {/* Glow background */}
                                <div className={`absolute inset-0 opacity-15 ${analysis.probability >= 65 ? 'bg-emerald-500' : analysis.probability <= 35 ? 'bg-rose-500' : 'bg-slate-500'} blur-xl`} />

                                <span className="text-[11px] text-white font-bold uppercase relative z-10">합류도(Confluence)</span>

                                <div className={`text-2xl font-black relative z-10 mt-1 ${analysis.probability >= 65 ? 'text-emerald-400' : analysis.probability <= 35 ? 'text-rose-400' : 'text-white'}`} style={{ textShadow: analysis.probability > 35 && analysis.probability < 65 ? 'none' : '0 0 10px currentColor' }}>
                                    {analysis.probability}%
                                </div>
                                <div className={`text-[11px] font-bold relative z-10 ${analysis.probability >= 65 ? 'text-emerald-400' : analysis.probability <= 35 ? 'text-rose-400' : 'text-white'}`}>
                                    {analysis.probability >= 65 ? '신호수렴' : analysis.probability <= 35 ? '신호혼재' : '관망'}
                                </div>
                            </div>

                            {/* Position - Glowing Card */}
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

                                <div className="flex items-center gap-1 mb-1 relative z-10">
                                    <span className="text-sm">🐋</span>
                                    <span className="text-[11px] text-white font-bold uppercase">WHALE POSITION</span>
                                </div>

                                <div className={`text-xl font-black relative z-10 ${analysis.whaleBias?.includes('BULL') ? 'text-emerald-400'
                                    : analysis.whaleBias?.includes('BEAR') ? 'text-rose-400'
                                        : 'text-white'
                                    }`} style={{ textShadow: analysis.whaleBias?.includes('BULL') ? '0 0 12px rgba(52,211,153,0.8)' : analysis.whaleBias?.includes('BEAR') ? '0 0 12px rgba(248,113,113,0.8)' : 'none' }}>
                                    {analysis.whaleBias?.includes('BULL') ? 'LONG'
                                        : analysis.whaleBias?.includes('BEAR') ? 'SHORT'
                                            : 'WAIT'}
                                </div>
                                <div className={`text-[10px] font-bold relative z-10 ${analysis.whaleBias?.includes('STRONG') ? 'text-amber-400' : 'text-white'}`}>
                                    {analysis.whaleBias?.includes('STRONG') ? '강력 추천' : '기본'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                            {/* Current Price Position - Semicircle Gauge (Moved to Top) */}
                            <div className="mb-4 bg-slate-800/30 rounded-lg p-4 border border-white/5">
                                <div className="text-[10px] text-white font-bold uppercase tracking-wider mb-3 text-center">현재가 위치</div>
                                {(() => {
                                    const totalRange = callWall - putWall;
                                    const currentPos = currentPrice - putWall;
                                    let pct = totalRange > 0 ? (currentPos / totalRange) * 100 : 50;
                                    pct = Math.max(0, Math.min(100, pct));

                                    // SVG semicircle gauge
                                    const radius = 60;
                                    const strokeWidth = 10;
                                    const circumference = Math.PI * radius;
                                    const progressOffset = circumference - (pct / 100) * circumference;

                                    // Determine color based on position
                                    let gaugeColor = '#6366f1'; // indigo (middle)
                                    if (pct < 30) gaugeColor = '#f43f5e'; // rose (near support)
                                    else if (pct > 70) gaugeColor = '#10b981'; // emerald (near resistance)

                                    return (
                                        <div className="flex flex-col items-center">
                                            <svg width="140" height="80" viewBox="0 0 140 80" className="overflow-visible">
                                                {/* Background arc */}
                                                <path
                                                    d="M 10 70 A 60 60 0 0 1 130 70"
                                                    fill="none"
                                                    stroke="rgba(255,255,255,0.1)"
                                                    strokeWidth={strokeWidth}
                                                    strokeLinecap="round"
                                                />
                                                {/* Progress arc */}
                                                <path
                                                    d="M 10 70 A 60 60 0 0 1 130 70"
                                                    fill="none"
                                                    stroke={gaugeColor}
                                                    strokeWidth={strokeWidth}
                                                    strokeLinecap="round"
                                                    strokeDasharray={circumference}
                                                    strokeDashoffset={progressOffset}
                                                    style={{
                                                        filter: `drop-shadow(0 0 6px ${gaugeColor})`,
                                                        transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s'
                                                    }}
                                                />
                                                {/* Center current price */}
                                                <text x="70" y="55" textAnchor="middle" className="fill-white text-lg font-black">
                                                    ${currentPrice.toFixed(2)}
                                                </text>
                                                {/* Percentage */}
                                                <text x="70" y="72" textAnchor="middle" className="fill-slate-400 text-[10px]">
                                                    {pct.toFixed(0)}%
                                                </text>
                                            </svg>
                                            {/* Labels */}
                                            <div className="flex justify-between w-full mt-1 px-1">
                                                <div className="text-[10px] text-rose-400 font-mono">${putWall}</div>
                                                <div className="text-[10px] text-emerald-400 font-mono">${callWall}</div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* PUT FLOOR + CALL WALL: 2-Column Grid (Swapped Order) */}
                            <div className="grid grid-cols-2 gap-2">
                                {/* PUT FLOOR (Left - Support) */}
                                <div className="bg-gradient-to-br from-rose-950/30 to-slate-900/50 border border-rose-500/20 rounded-lg p-3 relative overflow-hidden group hover:border-rose-500/40 transition-all">
                                    <div className="absolute inset-0 bg-rose-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                        <div className="text-[10px] text-slate-400 pl-4 border-l border-indigo-500/30">
                                            💰 대형거래: {smartMoney.rationale || '분석 중...'}
                                        </div>
                                    </div>
                                </div>

                                {/* Squeeze Probability - Semicircle Gauge */}
                                <div className="relative p-4 rounded-xl bg-gradient-to-r from-amber-950/50 via-amber-900/30 to-amber-950/50 border border-amber-500/40 overflow-hidden">
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.15),transparent_70%)]" />

                                    <div className="relative z-10">
                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/30 to-amber-600/20 flex items-center justify-center border border-amber-500/40">
                                                    <Zap size={14} className="text-amber-400" />
                                                </div>
                                                <div>
                                                    <div className="text-xs text-amber-400 font-black uppercase tracking-wider">SQUEEZE PROBABILITY</div>
                                                    <div className="text-[10px] text-white/60">감마 스퀴즈 확률</div>
                                                </div>
                                            </div>
                                            {squeezeProbability.isLoading ? (
                                                <div className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-600/80 text-white animate-pulse">
                                                    분석 중...
                                                </div>
                                            ) : (
                                                <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${squeezeProbability.label === 'EXTREME' ? 'bg-rose-500/80 text-white' : squeezeProbability.label === 'HIGH' ? 'bg-amber-500/80 text-white' : squeezeProbability.label === 'MODERATE' ? 'bg-yellow-500/80 text-black' : 'bg-emerald-500/80 text-white'}`}>
                                                    {squeezeProbability.label}
                                                </div>
                                            )}
                                        </div>

                                        {/* Semicircle Gauge */}
                                        <div className="flex justify-center mb-3">
                                            <div className="relative w-32 h-16 overflow-hidden">
                                                {/* Gauge Background */}
                                                <svg className="absolute inset-0 w-32 h-32" viewBox="0 0 128 64" style={{ top: 0 }}>
                                                    {/* Background Arc */}
                                                    <path
                                                        d="M 10 60 A 54 54 0 0 1 118 60"
                                                        fill="none"
                                                        stroke="rgba(71,85,105,0.5)"
                                                        strokeWidth="8"
                                                        strokeLinecap="round"
                                                    />
                                                    {/* Colored Gradient Arc (0-100%) */}
                                                    <defs>
                                                        <linearGradient id="squeezeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                            <stop offset="0%" stopColor="#10b981" />
                                                            <stop offset="33%" stopColor="#eab308" />
                                                            <stop offset="66%" stopColor="#f59e0b" />
                                                            <stop offset="100%" stopColor="#ef4444" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path
                                                        d="M 10 60 A 54 54 0 0 1 118 60"
                                                        fill="none"
                                                        stroke="url(#squeezeGradient)"
                                                        strokeWidth="8"
                                                        strokeLinecap="round"
                                                        strokeDasharray={`${(squeezeProbability.value / 100) * 169.6} 169.6`}
                                                    />
                                                </svg>

                                                {/* Needle/Indicator */}
                                                <div
                                                    className="absolute bottom-0 left-1/2 w-1 h-12 origin-bottom transition-transform duration-700"
                                                    style={{
                                                        transform: `translateX(-50%) rotate(${-90 + (squeezeProbability.value / 100) * 180}deg)`,
                                                    }}
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] -translate-x-0.5" />
                                                </div>

                                                {/* Center Value */}
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 text-center">
                                                    {squeezeProbability.isLoading ? (
                                                        <div className="text-lg font-black text-slate-400 animate-pulse">--</div>
                                                    ) : (
                                                        <div className={`text-2xl font-black ${squeezeProbability.color}`} style={{ textShadow: '0 0 15px currentColor' }}>
                                                            {squeezeProbability.value}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Scale Labels */}
                                        <div className="flex justify-between text-[9px] px-2 mb-2">
                                            <span className="text-emerald-400 font-bold">0%</span>
                                            <span className="text-amber-400 font-bold">50%</span>
                                            <span className="text-rose-400 font-bold">100%</span>
                                        </div>

                                        {/* Contributing Factors */}
                                        {squeezeProbability.factors.length > 0 && (
                                            <div className="border-t border-amber-500/30 pt-2 mt-2">
                                                <div className="text-[9px] text-white/50 mb-1">요인 분석:</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {squeezeProbability.factors.map((factor, i) => (
                                                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                                            {factor.name} +{factor.contribution}%
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* IV Skew */}
                                <div className="bg-gradient-to-br from-violet-950/20 to-slate-900/40 border border-violet-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-violet-500/30 transition-all">
                                    <div className="absolute inset-0 bg-violet-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                        <div className="text-[10px] text-slate-400 pl-4 border-l border-violet-500/30">
                                            📊 {ivSkew.rationale || '풋/콜 IV 분석 중...'}
                                        </div>
                                    </div>
                                </div>

                                {/* DEX (Delta Exposure) - Dealer Delta Hedging */}
                                <div className="bg-gradient-to-br from-cyan-950/20 to-slate-900/40 border border-cyan-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                                    <div className="absolute inset-0 bg-cyan-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                        <div className="text-[10px] text-slate-400 pl-4 border-l border-cyan-500/30">
                                            📈 {dex.rationale || '델타 분석 중...'}
                                        </div>
                                    </div>
                                </div>

                                {/* UOA Score (Unusual Options Activity) */}
                                <div className="bg-gradient-to-br from-amber-950/20 to-slate-900/40 border border-amber-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-amber-500/30 transition-all">
                                    <div className="absolute inset-0 bg-amber-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                        <div className="text-[10px] text-slate-400 pl-4 border-l border-amber-500/30">
                                            🔥 {uoa.rationale || '거래량 분석 중...'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
