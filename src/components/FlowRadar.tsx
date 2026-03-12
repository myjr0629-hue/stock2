// [S-56.4.5] FlowRadar with optimized date display
"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useWhaleTrades, useRealtimeMetrics, useDarkPoolTrades, useIvPercentile, useEnhancedMetrics } from '@/hooks/useFlowData';
import { Radar, Target, Crosshair, Zap, Layers, Info, TrendingUp, TrendingDown, Activity, Lightbulb, Percent, Lock, Shield, Loader2, AlertTriangle, BarChart3, Banknote } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { ProGate, EliteGate } from '@/components/gate/FeatureGate';
import { Progress } from "./ui/progress";
import { useTranslations } from 'next-intl';

export interface FlowRadarProps {
    ticker: string;
    rawChain: any[];
    allExpiryChain?: any[];  // [GEX REGIME] Multi-expiry probe data
    gammaFlipLevel?: number | null;  // [GEX REGIME] Gamma flip price level from structureService
    oiPcr?: number | null;  // [PCR] OI-based Put/Call Ratio from structureService
    currentPrice: number;
    squeezeScore?: number | null;
    squeezeRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
    initialFlowData?: any;
}

export function FlowRadar({ ticker, rawChain, allExpiryChain, gammaFlipLevel, oiPcr, currentPrice, squeezeScore: apiSqueezeScore, squeezeRisk: apiSqueezeRisk, initialFlowData }: FlowRadarProps) {
    const t = useTranslations('flowRadar');
    const fm = useTranslations('flowRadarMetrics');
    const ui = useTranslations('flowRadarUI');
    const gt = useTranslations('gate');
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

    // [PERF] SWR-powered data fetching (replaces manual fetch + setInterval)
    // SWR handles: caching, deduplication, background refresh, error retry
    const hasData = rawChain.length > 0;
    const { trades: whaleTrades, isLoading: tradesLoading } = useWhaleTrades(ticker, hasData, initialFlowData?.whaleTrades);
    const { metrics: realtimeMetrics } = useRealtimeMetrics(ticker, hasData, initialFlowData?.realtimeMetrics);
    const { trades: darkPoolTrades } = useDarkPoolTrades(ticker, hasData, initialFlowData?.darkPoolTrades);
    const [flowViewMode, setFlowViewMode] = useState<'WHALE' | 'DARKPOOL'>('WHALE');
    const isSystemReady = hasData && !tradesLoading;

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

    // Intelligent Default Mode (placed before metrics for DTE-filtered chain)
    const effectiveViewMode = userViewMode || (totalVolume > 0 ? 'VOLUME' : 'OI');
    const isMarketClosed = totalVolume === 0 && rawChain.length > 0;

    // [DTE SYNC] Shared DTE-filtered chain for mode-aware metrics
    // VOLUME = rawChain (already nearest-weekly from API, ~140 contracts)
    // OI = allExpiryChain filtered to 0-35 DTE (multi-expiry, ~800+ contracts)
    // NOTE: rawChain from /api/live/ticker is pre-filtered to nearest weekly via slimOptionChain()
    //       allExpiryChain contains ALL expiries (3000+ contracts) for multi-expiry analysis
    const filteredChain = useMemo(() => {
        if (effectiveViewMode === 'VOLUME') {
            // VOLUME mode: rawChain is already the nearest weekly expiry (0-7 DTE)
            return rawChain || [];
        }

        // OI mode: use allExpiryChain filtered to 0-35 DTE
        const source = allExpiryChain && allExpiryChain.length > 0 ? allExpiryChain : rawChain;
        if (!source || source.length === 0) return [];

        const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const today = new Date(etNow.getFullYear(), etNow.getMonth(), etNow.getDate());
        const maxDate = new Date(today);
        maxDate.setDate(today.getDate() + 35);

        return source.filter(opt => {
            const expiryStr = opt.details?.expiration_date;
            if (!expiryStr) return false;
            const parts = expiryStr.split('-');
            if (parts.length !== 3) return false;
            const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return expiry >= today && expiry <= maxDate;
        });
    }, [rawChain, allExpiryChain, effectiveViewMode]);

    // [PREMIUM] Options Pressure Index (OPI) - Unique to SIGNUM
    // OPI = Σ(Call Delta × Call OI) - Σ(Put Delta × Put OI)
    const opi = useMemo(() => {
        if (!filteredChain || filteredChain.length === 0) return { value: 0, label: fm('analyzing'), color: 'text-slate-400' };

        let callPressure = 0;
        let putPressure = 0;

        filteredChain.forEach(opt => {
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

        let label = fm('neutral');
        let color = 'text-white';
        if (normalized > 50) { label = fm('strongCallDominant'); color = 'text-emerald-400'; }
        else if (normalized > 20) { label = fm('callDominant'); color = 'text-emerald-300'; }
        else if (normalized < -50) { label = fm('strongPutDominant'); color = 'text-rose-400'; }
        else if (normalized < -20) { label = fm('putDominant'); color = 'text-rose-300'; }

        return { value: Math.round(normalized), label, color, callPressure, putPressure };
    }, [filteredChain]);

    // [PREMIUM] IV Percentile - ATM Implied Volatility Ranking
    // First try DynamoDB true percentile, fallback to simplified calculation
    const trueIvData = useIvPercentile(ticker);
    const enhancedData = useEnhancedMetrics(ticker);

    const ivPercentile = useMemo(() => {
        // Use DynamoDB true percentile if available (real historical rank)
        if (trueIvData.percentile !== null && trueIvData.sampleSize >= 10) {
            const p = trueIvData.percentile;
            let label = fm('moderate');
            let color = 'text-white';
            if (p >= 80) { label = fm('veryHigh'); color = 'text-rose-400'; }
            else if (p >= 60) { label = fm('high'); color = 'text-amber-400'; }
            else if (p >= 40) { label = fm('moderate'); color = 'text-white'; }
            else if (p >= 20) { label = fm('low'); color = 'text-cyan-400'; }
            else { label = fm('veryLow'); color = 'text-emerald-400'; }
            return { value: p, label, color, source: 'dynamodb' };
        }

        // Fallback: simplified calculation from raw chain
        if (!rawChain || rawChain.length === 0) return { value: 0, label: fm('analyzing'), color: 'text-slate-400', source: 'fallback' };

        // Find ATM options (closest to current price)
        const atmOptions = rawChain
            .filter(opt => {
                const iv = opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv;
                const strike = opt.details?.strike_price || opt.strike_price;
                return iv && iv > 0 && strike;
            })
            .sort((a, b) => {
                const strikeA = a.details?.strike_price || a.strike_price;
                const strikeB = b.details?.strike_price || b.strike_price;
                return Math.abs(strikeA - currentPrice) - Math.abs(strikeB - currentPrice);
            })
            .slice(0, 4);

        if (atmOptions.length === 0) return { value: 0, label: fm('noData'), color: 'text-white', source: 'fallback' };

        const avgIV = atmOptions.reduce((sum, opt) => {
            const iv = opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv || 0;
            return sum + iv;
        }, 0) / atmOptions.length;
        const ivPercent = Math.round(avgIV * 100);

        let label = fm('moderate');
        let color = 'text-white';
        if (ivPercent >= 60) { label = fm('veryHigh'); color = 'text-rose-400'; }
        else if (ivPercent >= 45) { label = fm('high'); color = 'text-amber-400'; }
        else if (ivPercent >= 30) { label = fm('moderate'); color = 'text-white'; }
        else if (ivPercent >= 20) { label = fm('low'); color = 'text-cyan-400'; }
        else { label = fm('veryLow'); color = 'text-emerald-400'; }

        return { value: ivPercent, label, color, source: 'fallback' };
    }, [rawChain, currentPrice, trueIvData.percentile, trueIvData.sampleSize]);

    // [PREMIUM] Smart Money Score - Institutional-level trade ratio
    // Enhanced: DynamoDB 5-day directional consistency when available
    const smartMoney = useMemo(() => {
        if (!whaleTrades || whaleTrades.length === 0) return { score: 0, label: fm('noTrades'), color: 'text-slate-500' };

        // Intraday base score
        const largeTrades = whaleTrades.filter((t: any) => (t.premium || t.size * 100) >= 50000);
        const veryLargeTrades = whaleTrades.filter((t: any) => (t.premium || t.size * 100) >= 100000);

        let score = 0;
        if (whaleTrades.length > 0) {
            const largeRatio = (largeTrades.length / whaleTrades.length) * 50;
            const veryLargeRatio = (veryLargeTrades.length / whaleTrades.length) * 50;
            score = Math.min(100, Math.round(largeRatio + veryLargeRatio));
        }

        // DynamoDB enhancement: boost/reduce score based on 5-day consistency
        const sm = enhancedData.smartMoney;
        if (sm?.consistency !== null && sm?.sampleSize >= 3) {
            // If 80%+ consistent direction over 5 days → boost by +15
            // If <40% consistency → reduce by -10 (noisy, less reliable)
            if (sm.consistency >= 80) score = Math.min(100, score + 15);
            else if (sm.consistency >= 60) score = Math.min(100, score + 8);
            else if (sm.consistency < 40) score = Math.max(0, score - 10);
        }

        let label = fm('moderate');
        let color = 'text-white';
        if (score >= 80) { label = fm('veryActive'); color = 'text-emerald-400'; }
        else if (score >= 60) { label = fm('active'); color = 'text-emerald-300'; }
        else if (score >= 40) { label = fm('moderate'); color = 'text-white'; }
        else if (score >= 20) { label = fm('weak'); color = 'text-amber-400'; }
        else { label = fm('veryWeak'); color = 'text-rose-400'; }

        const rationale = fm('smartMoneyRationale', { large: String(largeTrades.length), veryLarge: String(veryLargeTrades.length) });

        return { score, label, color, rationale, source: sm?.sampleSize >= 3 ? 'dynamodb' : 'intraday' };
    }, [whaleTrades, enhancedData.smartMoney]);

    // [PREMIUM] IV Skew - Put vs Call IV difference (fear gauge)
    const ivSkew = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { value: 0, label: fm('analyzing'), color: 'text-white' };

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

        if (otmPuts.length === 0 || otmCalls.length === 0) return { value: 0, label: fm('noData'), color: 'text-white' };

        const avgPutIV = otmPuts.reduce((sum, opt) => sum + (opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv || 0), 0) / otmPuts.length;
        const avgCallIV = otmCalls.reduce((sum, opt) => sum + (opt.greeks?.implied_volatility || opt.implied_volatility || opt.iv || 0), 0) / otmCalls.length;

        // Skew = Put IV - Call IV (positive = fear, negative = greed)
        const skewValue = Math.round((avgPutIV - avgCallIV) * 100 * 10) / 10; // in percentage points

        let label = fm('neutral');
        let color = 'text-white';
        if (skewValue >= 5) { label = fm('fear'); color = 'text-rose-400'; }
        else if (skewValue >= 2) { label = fm('caution'); color = 'text-amber-400'; }
        else if (skewValue >= -2) { label = fm('neutral'); color = 'text-white'; }
        else if (skewValue >= -5) { label = fm('optimism'); color = 'text-cyan-400'; }
        else { label = fm('greed'); color = 'text-emerald-400'; }

        // Rationale: Put IV vs Call IV
        const rationale = fm('putIvCallIv', { putIv: String(Math.round(avgPutIV * 100)), callIv: String(Math.round(avgCallIV * 100)) });

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
            return { value: 0, label: fm('analyzing'), color: 'text-slate-400', factors: [], debug: {}, isLoading: true };
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
            return { value: 0, label: fm('weeklyNoData'), color: 'text-slate-400', factors: [], debug: { weeklyCount: 0 }, isLoading: false };
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
            factors.push({ name: fm('shortGammaFactor', { val: (totalGex / 1e6).toFixed(1) }), contribution: gexScore, active: true });
        } else {
            // Long Gamma = Stability (dealers sell into rallies, buy dips)
            const stabilityPenalty = Math.min(10, Math.round(gexIntensity * 2));
            score += stabilityPenalty;
            factors.push({ name: fm('longGammaSuppress'), contribution: stabilityPenalty, active: true });
        }

        // ============================================
        // 2. ATM GAMMA CONCENTRATION (0-20 points)
        // ============================================
        // High ATM gamma = Pin risk OR explosive move potential
        const atmRatio = totalGex !== 0 ? atmGex / Math.abs(totalGex) : 0;
        if (atmRatio > 0.3) {
            const atmScore = Math.min(20, Math.round(atmRatio * 30));
            score += atmScore;
            factors.push({ name: `ATM ${Math.round(atmRatio * 100)}%`, contribution: atmScore, active: true });
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
        const bigBets = whaleTrades.filter((t: any) => t.premium >= 100000);
        const nearAtmBets = bigBets.filter((t: any) =>
            t.strike && Math.abs(t.strike - currentPrice) / currentPrice < 0.05
        );

        if (nearAtmBets.length >= 1) {
            const flowScore = Math.min(10, nearAtmBets.length * 3);
            score += flowScore;
            factors.push({ name: fm('whaleAtmBets', { count: String(nearAtmBets.length) }), contribution: flowScore, active: true });
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
        if (!filteredChain || filteredChain.length === 0) return { value: 0, label: fm('analyzing'), color: 'text-slate-400', rationale: '' };

        let totalDex = 0;
        let callDex = 0;
        let putDex = 0;

        filteredChain.forEach(opt => {
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
        let label = fm('neutral');
        let color = 'text-white';
        if (dexMillions > 5) { label = fm('strongResistance'); color = 'text-rose-400'; }
        else if (dexMillions > 2) { label = fm('resistancePressure'); color = 'text-amber-400'; }
        else if (dexMillions < -5) { label = fm('strongSupport'); color = 'text-emerald-400'; }
        else if (dexMillions < -2) { label = fm('supportForming'); color = 'text-cyan-400'; }

        const rationale = `CallΔ ${callDexM.toFixed(1)}M / PutΔ ${putDexM.toFixed(1)}M`;

        return { value: dexMillions, label, color, rationale };
    }, [filteredChain]);

    // [NEW] UOA Score (Unusual Options Activity) - Abnormal Volume Detection
    // Enhanced: DynamoDB 5-10 day OI z-score when available
    const uoa = useMemo(() => {
        if (!filteredChain || filteredChain.length === 0) return { score: 0, label: fm('analyzing'), color: 'text-slate-400', rationale: '' };

        // Calculate today's total volume + OI
        let todayVolume = 0;
        let avgOI = 0;
        let optionCount = 0;

        filteredChain.forEach(opt => {
            const vol = opt.day?.volume || 0;
            const oi = opt.open_interest || 0;
            todayVolume += vol;
            avgOI += oi;
            optionCount++;
        });

        // DynamoDB enhancement: use z-score if available
        const uoaEnhanced = enhancedData.uoa;
        let normalizedScore: number;
        let useZScore = false;

        if (uoaEnhanced?.zScore !== null && uoaEnhanced?.sampleSize >= 3) {
            // Z-score based: 2.0+ = extreme, 1.5+ = abnormal, 1.0+ = active
            normalizedScore = Math.min(10, Math.max(0, Math.abs(uoaEnhanced.zScore) * 2.5));
            useZScore = true;
        } else {
            // Fallback: intraday Vol/OI ratio
            const uoaScore = avgOI > 0 ? (todayVolume / avgOI) * 10 : 0;
            normalizedScore = Math.min(10, uoaScore);
        }

        let label = fm('uoaNormal');
        let color = 'text-white';
        if (normalizedScore >= 5) { label = fm('uoaExtreme'); color = 'text-rose-400'; }
        else if (normalizedScore >= 3) { label = fm('uoaAbnormal'); color = 'text-amber-400'; }
        else if (normalizedScore >= 1.5) { label = fm('uoaActive'); color = 'text-cyan-400'; }

        const rationale = useZScore
            ? fm('uoaVolOi', { vol: (todayVolume / 1000).toFixed(0), oi: (avgOI / 1000).toFixed(0) }) + ` (z:${uoaEnhanced!.zScore})`
            : fm('uoaVolOi', { vol: (todayVolume / 1000).toFixed(0), oi: (avgOI / 1000).toFixed(0) });

        return { score: Math.round(normalizedScore * 10) / 10, label, color, rationale, source: useZScore ? 'dynamodb' : 'intraday' };
    }, [filteredChain, enhancedData.uoa]);

    // [NEW] P/C Ratio - Call/Put Volume Ratio (Market Sentiment Gauge)
    const pcRatio = useMemo(() => {
        if (!filteredChain || filteredChain.length === 0) return { value: 0, label: fm('analyzing'), color: 'text-slate-400', callVol: 0, putVol: 0 };

        let callVol = 0;
        let putVol = 0;

        filteredChain.forEach(opt => {
            const vol = opt.day?.volume || 0;
            const type = opt.details?.contract_type;
            if (type === 'call') callVol += vol;
            else if (type === 'put') putVol += vol;
        });

        const ratio = putVol > 0 ? callVol / putVol : callVol > 0 ? 10 : 0;
        const roundedRatio = Math.round(ratio * 100) / 100;

        let label = ui('pcBalanceLabel');
        let color = 'text-white';
        if (ratio >= 2.0) { label = ui('pcStrongCallLabel'); color = 'text-emerald-400'; }
        else if (ratio >= 1.3) { label = ui('pcCallLabel'); color = 'text-emerald-300'; }
        else if (ratio <= 0.5) { label = ui('pcStrongPutLabel'); color = 'text-rose-400'; }
        else if (ratio <= 0.75) { label = ui('pcPutLabel'); color = 'text-rose-300'; }

        return { value: roundedRatio, label, color, callVol, putVol };
    }, [filteredChain]);

    // [NEW] P/C Ratio (OI-based) - switches with VOLUME/OI toggle
    const pcRatioOI = useMemo(() => {
        if (!filteredChain || filteredChain.length === 0) return { value: 0, label: fm('analyzing'), color: 'text-slate-400', callOI: 0, putOI: 0 };

        let callOI = 0;
        let putOI = 0;

        filteredChain.forEach(opt => {
            const oi = opt.open_interest || 0;
            const type = opt.details?.contract_type;
            if (type === 'call') callOI += oi;
            else if (type === 'put') putOI += oi;
        });

        const ratio = putOI > 0 ? callOI / putOI : callOI > 0 ? 10 : 0;
        const roundedRatio = Math.round(ratio * 100) / 100;

        let label = fm('pcBalance');
        let color = 'text-white';
        if (ratio >= 2.0) { label = fm('strongCallDominant'); color = 'text-emerald-400'; }
        else if (ratio >= 1.3) { label = fm('callDominant'); color = 'text-emerald-300'; }
        else if (ratio <= 0.5) { label = fm('strongPutDominant'); color = 'text-rose-400'; }
        else if (ratio <= 0.75) { label = fm('putDominant'); color = 'text-rose-300'; }

        return { value: roundedRatio, label, color, callOI, putOI };
    }, [filteredChain]);

    // [GEX REGIME] Institutional-grade gamma regime indicator
    // Combines: ATM concentration (rawChain) + Gamma Flip distance + DTE weighting
    const gexRegime = useMemo(() => {
        if (!filteredChain || filteredChain.length === 0 || !currentPrice) return {
            pinStrength: 0, label: fm('analyzing'), color: 'text-slate-400',
            regime: 'LOADING' as const, regimeColor: 'text-slate-400',
            nearestExpiry: '', dte: -1, weeklyExpiry: '', weeklyLabel: '', expiryLabel: '',
            atmConcentration: 0, gammaShare: 0,
            flipLevel: null as number | null, flipDistance: 0, flipDir: '' as string,
            nearestCount: 0, weeklyContracts: 0, expiryCount: 0, isLongGamma: true
        };

        const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const todayStr = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, '0')}-${String(etNow.getDate()).padStart(2, '0')}`;

        // === PART 1: ATM Concentration from filteredChain (mode-aware: weekly or 35DTE) ===
        let weeklyTotalGamma = 0, weeklyATMGamma = 0, weeklyNetGEX = 0;
        let weeklyCallOI = 0, weeklyPutOI = 0;
        let weeklyExpiry = '';

        filteredChain.forEach((c: any) => {
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
        const regimeLabels = { STABLE: fm('gexStablePinning'), TRANSITION: fm('gexTransitionImminent'), FLIP_ZONE: fm('gexFlipZone'), EXPLOSIVE: fm('gexExplosiveStandby'), LOADING: fm('analyzing') };
        const regimeColors = { STABLE: 'text-emerald-400', TRANSITION: 'text-amber-400', FLIP_ZONE: 'text-orange-400', EXPLOSIVE: 'text-rose-400', LOADING: 'text-slate-400' };
        label = regimeLabels[regime];
        color = regimeColors[regime];

        const expiryLabel = nearestExpiry === todayStr ? fm('gexExpiryToday') : fm('gexExpiryDate', { date: nearestExpiry.substring(5).replace('-', '/') });
        // Build expiry label from filteredChain's actual expiry range
        const filteredExpiries = Array.from(new Set(filteredChain.map((c: any) => c.details?.expiration_date).filter(Boolean))).sort() as string[];
        let weeklyLabel = '';
        if (filteredExpiries.length > 1) {
            // OI mode: show range like "02/18~03/20"
            const first = filteredExpiries[0].substring(5).replace('-', '/');
            const last = filteredExpiries[filteredExpiries.length - 1].substring(5).replace('-', '/');
            weeklyLabel = `${first}~${last}`;
        } else if (weeklyExpiry) {
            weeklyLabel = weeklyExpiry === todayStr ? fm('gexWeeklyToday') : fm('gexWeeklyDate', { date: weeklyExpiry.substring(5).replace('-', '/') });
        }

        return {
            pinStrength, label, color,
            regime, regimeColor: regimeColors[regime],
            nearestExpiry, dte, weeklyExpiry, weeklyLabel, expiryLabel,
            atmConcentration: Math.round(atmConcentration),
            gammaShare: Math.round(gammaShare),
            flipLevel: flip, flipDistance: Math.round(Math.abs(flipDistance) * 10) / 10, flipDir,
            nearestCount: filteredChain.length, weeklyContracts: filteredChain.length,
            expiryCount, isLongGamma, nearestCallOI: weeklyCallOI, nearestPutOI: weeklyPutOI
        };
    }, [filteredChain, allExpiryChain, currentPrice, gammaFlipLevel]);

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
        const expiryLabel = fm('gexExpiryDate', { date: nearestExpiry.substring(5).replace('-', '/') });

        let color = 'text-white';
        let label = fm('impliedModerate');
        if (movePercent >= 5) { color = 'text-rose-400'; label = fm('impliedHighVol'); }
        else if (movePercent >= 3) { color = 'text-amber-400'; label = fm('impliedCaution'); }
        else if (movePercent >= 1) { color = 'text-cyan-400'; label = fm('impliedModerate'); }
        else { color = 'text-emerald-400'; label = fm('impliedStable'); }

        return { value: Math.round(movePercent * 10) / 10, direction, color, label, straddle: straddle.toFixed(2), expiryLabel };
    }, [rawChain, currentPrice]);

    // [PREMIUM] Max Pain Distance - how far current price from max pain
    const maxPainDistance = useMemo(() => {
        if (!filteredChain || filteredChain.length === 0 || !currentPrice) return { maxPain: 0, distance: 0, distPercent: 0, direction: 'at' as const, color: 'text-slate-400' };

        // Calculate max pain: strike where total pain (loss) for option holders is maximized
        const strikeMap = new Map<number, { callOI: number; putOI: number }>();
        filteredChain.forEach((opt: any) => {
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
    }, [filteredChain, currentPrice]);

    // [MOVED] effectiveViewMode + isMarketClosed now defined after flowMap (before metrics)

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
            const mostRecent = Math.max(...whaleTrades.map((t: any) => new Date(t.tradeDate).getTime()));
            // Use all trades from the same trading day as the most recent trade
            const sessionStart = new Date(mostRecent);
            sessionStart.setHours(0, 0, 0, 0); // Start of that trading day
            activeTrades = whaleTrades.filter((t: any) => new Date(t.tradeDate).getTime() >= sessionStart.getTime());
        }

        // 1. Whale Flow Decomposition
        let netWhalePremium = 0;
        let callPremium = 0;
        let putPremium = 0;
        let maxPremium = 0;
        let alphaTrade: any = null;

        activeTrades.forEach((t: any) => {
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
        if (opi.value > 30) signals.push(ui('signalOpiUp', { val: opi.value }));
        else if (opi.value < -30) signals.push(ui('signalOpiDown', { val: opi.value }));

        // (2) Whale Premium Score (Weight: 25%)
        let whaleScore = 0;
        if (netWhalePremium > 500000) whaleScore = 25;
        else if (netWhalePremium > 100000) whaleScore = 15;
        else if (netWhalePremium < -500000) whaleScore = -25;
        else if (netWhalePremium < -100000) whaleScore = -15;
        compositeScore += whaleScore;
        if (Math.abs(netWhalePremium) > 100000) {
            signals.push(ui('signalWhale', { premium: `${netWhalePremium > 0 ? '+' : ''}$${(netWhalePremium / 1000).toFixed(0)}K` }));
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
            if (squeezeProbability.value >= 45) signals.push(ui('signalSqueeze', { val: squeezeProbability.value }));
        }

        // (4) IV Skew Score (Weight: 15%) - Fear/Greed gauge
        let skewScore = 0;
        if (ivSkew.value !== 0) {
            // Positive skew (fear) = bearish bias, Negative skew (greed) = bullish bias
            skewScore = -ivSkew.value * 1.5; // Invert: high put skew = bearish
            skewScore = Math.max(-15, Math.min(15, skewScore));
            compositeScore += skewScore;
            if (Math.abs(ivSkew.value) >= 3) signals.push(ui('signalIvSkew', { label: ivSkew.label }));
        }

        // (5) Smart Money Score (Weight: 10%) - Institutional activity level
        let smartScore = 0;
        if (smartMoney.score >= 60) smartScore = 10;
        else if (smartMoney.score >= 40) smartScore = 5;
        else if (smartMoney.score < 20) smartScore = -5;
        // Apply direction based on whale bias
        if (whaleBias.includes('BEAR')) smartScore = -Math.abs(smartScore);
        compositeScore += smartScore;
        if (smartMoney.score >= 60) signals.push(ui('signalSmartMoney', { label: smartMoney.label }));

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
        let status = ui('verdictScanning');
        let message = ui('verdictScanningMsg');
        let color = "text-slate-400";
        let probability = 50;
        let probLabel = ui('verdictNeutralLabel');
        let probColor = "text-slate-400";
        let action = "";    // Action guide
        let warning = "";   // Warning
        let trigger = "";   // Trigger (next action condition)

        // Alpha Trade Intel
        let alphaIntel = "";
        if (alphaTrade) {
            const unitCost = alphaTrade.premium / (alphaTrade.size * 100);
            alphaIntel = ui('verdictAlphaTrade', { type: alphaTrade.type, strike: alphaTrade.strike, premium: (alphaTrade.premium / 1000).toFixed(0) });
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
                status = ui('verdictSuperCycle');
                message = ui('verdictSuperCycleMsg', { callWall });
                probability = Math.min(98, 75 + compositeScore * 0.23);
                probLabel = ui('verdictConviction'); probColor = "text-emerald-400"; color = "text-emerald-400";
                action = ui('verdictSuperCycleAction');
                warning = ui('verdictSuperCycleWarn');
                trigger = ui('verdictSuperCycleTrigger');
            } else {
                status = ui('verdictBreathingAfterBreak');
                message = ui('verdictBreathingMsg', { callWall });
                probability = 55 + compositeScore * 0.1;
                probLabel = ui('verdictWaitLabel'); probColor = "text-amber-400"; color = "text-amber-400";
                action = ui('verdictBreathingAction');
                warning = ui('verdictBreathingWarn');
                trigger = ui('verdictBreathingTrigger', { callWall });
            }
        } else if (currentPrice < putWall) {
            // ===== BREAKDOWN ZONE =====
            if (compositeScore < -30) {
                status = ui('verdictCollapse');
                message = ui('verdictCollapseMsg', { putWall });
                probability = Math.max(5, 25 + compositeScore * 0.2);
                probLabel = ui('verdictDanger'); probColor = "text-rose-500"; color = "text-rose-500";
                action = ui('verdictCollapseAction');
                warning = ui('verdictCollapseWarn');
                trigger = ui('verdictCollapseTrigger', { putWall });
            } else {
                status = ui('verdictBearTrap');
                message = ui('verdictBearTrapMsg', { putWall });
                probability = 40 + compositeScore * 0.1;
                probLabel = ui('verdictCautionLabel'); probColor = "text-amber-500"; color = "text-amber-500";
                action = ui('verdictBearTrapAction');
                warning = ui('verdictBearTrapWarn');
                trigger = ui('verdictBearTrapTrigger', { putWall });
            }
        } else {
            // ===== INSIDE RANGE =====
            const isNearRes = distToCall < 1.0;
            const isNearSup = Math.abs(distToPut) < 1.0;

            if (isNearRes) {
                if (compositeScore > 25) {
                    status = ui('verdictBreakoutReady');
                    message = ui('verdictBreakoutReadyMsg', { callWall });
                    probability = 75 + compositeScore * 0.2;
                    probLabel = ui('verdictStrongBuy'); probColor = "text-emerald-400"; color = "text-emerald-400";
                    action = ui('verdictBreakoutReadyAction', { callWall });
                    warning = ui('verdictBreakoutReadyWarn');
                    trigger = ui('verdictBreakoutReadyTrigger', { callWall });
                } else {
                    status = ui('verdictResistance');
                    message = ui('verdictResistanceMsg', { callWall });
                    probability = 45 + compositeScore * 0.1;
                    probLabel = ui('verdictCautionLabel'); probColor = "text-amber-400"; color = "text-amber-400";
                    action = ui('verdictResistanceAction');
                    warning = ui('verdictResistanceWarn');
                    trigger = ui('verdictResistanceTrigger', { callWall });
                }
            } else if (isNearSup) {
                if (compositeScore > 15) {
                    status = ui('verdictBuyTheDip');
                    message = ui('verdictBuyTheDipMsg', { putWall });
                    probability = 70 + compositeScore * 0.2;
                    probLabel = ui('verdictBuy'); probColor = "text-emerald-400"; color = "text-emerald-400";
                    action = ui('verdictBuyTheDipAction', { putWall });
                    warning = ui('verdictBuyTheDipWarn', { putWall });
                    trigger = ui('verdictBuyTheDipTrigger');
                } else {
                    status = ui('verdictWeak');
                    message = ui('verdictWeakMsg', { putWall });
                    probability = 30 + compositeScore * 0.15;
                    probLabel = ui('verdictSellWait'); probColor = "text-rose-500"; color = "text-rose-500";
                    action = ui('verdictWeakAction');
                    warning = ui('verdictWeakWarn');
                    trigger = ui('verdictWeakTrigger', { putWall });
                }
            } else {
                // MID-RANGE
                if (compositeScore > 35) {
                    status = ui('verdictMomentum');
                    message = ui('verdictMomentumMsg');
                    probability = 65 + compositeScore * 0.2;
                    probLabel = ui('verdictBuyDominant'); probColor = "text-emerald-400"; color = "text-emerald-400";
                    action = ui('verdictMomentumAction', { putWall });
                    warning = ui('verdictMomentumWarn');
                    trigger = ui('verdictMomentumTrigger', { callWall });
                } else if (compositeScore < -35) {
                    status = ui('verdictPressure');
                    message = ui('verdictPressureMsg');
                    probability = 35 + compositeScore * 0.15;
                    probLabel = ui('verdictSellDominant'); probColor = "text-rose-400"; color = "text-rose-400";
                    action = ui('verdictPressureAction');
                    warning = ui('verdictPressureWarn');
                    trigger = ui('verdictPressureTrigger', { putWall });
                } else {
                    status = ui('verdictNeutral');
                    message = ui('verdictNeutralMsg', { putWall, callWall });
                    probability = 50 + compositeScore * 0.1;
                    probLabel = ui('verdictNeutralLabel'); probColor = "text-slate-400"; color = "text-slate-400";
                    action = ui('verdictNeutralAction');
                    warning = ui('verdictNeutralWarn');
                    trigger = ui('verdictNeutralTrigger');
                }
            }
        }

        // ===== GAMMA PINCH: Put Floor > Call Wall (inverted walls) =====
        // This is a rare, dangerous condition where buying pressure (Call Wall) is BELOW
        // selling pressure (Put Floor) — price is trapped between colliding forces.
        const isGammaPinch = putWall > callWall && callWall > 0 && putWall > 0;
        const gexFlipDist = currentPrice > 0 && (gexRegime.flipLevel ?? 0) > 0
            ? ((currentPrice - (gexRegime.flipLevel ?? 0)) / currentPrice) * 100
            : null;
        const isNearGexFlip = gexFlipDist !== null && Math.abs(gexFlipDist) < 1.5;

        if (isGammaPinch) {
            if (compositeScore > 20) {
                status = ui('verdictGammaPinchUp');
                message = ui('verdictGammaPinchUpMsg', { putWall, callWall });
                probability = Math.min(85, 65 + compositeScore * 0.2);
                probLabel = ui('verdictUpLikely'); probColor = "text-emerald-400"; color = "text-emerald-400";
                action = ui('verdictGammaPinchUpAction', { callWall });
                warning = ui('verdictGammaPinchUpWarn');
                trigger = ui('verdictGammaPinchUpTrigger', { callWall });
            } else if (compositeScore < -20) {
                status = ui('verdictGammaPinchDown');
                message = ui('verdictGammaPinchDownMsg', { putWall, callWall });
                probability = Math.max(15, 35 + compositeScore * 0.2);
                probLabel = ui('verdictDownCaution'); probColor = "text-rose-400"; color = "text-rose-400";
                action = ui('verdictGammaPinchDownAction', { putWall });
                warning = ui('verdictGammaPinchDownWarn', { callWall });
                trigger = ui('verdictGammaPinchDownTrigger', { putWall, callWall });
            } else {
                status = ui('verdictGammaPinchExplosive');
                message = ui('verdictGammaPinchExplosiveMsg', { putWall, callWall });
                probability = 50;
                probLabel = ui('verdictDirectionUndecided'); probColor = "text-amber-400"; color = "text-amber-400";
                action = ui('verdictGammaPinchExplosiveAction');
                warning = ui('verdictGammaPinchExplosiveWarn');
                trigger = ui('verdictGammaPinchExplosiveTrigger', { callWall, putWall });
            }
        }

        // ===== GEX FLIP PROXIMITY: Price near gamma flip level =====
        const flipLevel = gexRegime.flipLevel ?? 0;
        if (isNearGexFlip && flipLevel > 0) {
            const aboveFlip = currentPrice > flipLevel;
            const flipWarning = aboveFlip
                ? ui('gexFlipWarningAbove', { dist: gexFlipDist!.toFixed(1), flipLevel: flipLevel.toFixed(1) })
                : ui('gexFlipWarningBelow', { dist: Math.abs(gexFlipDist!).toFixed(1), flipLevel: flipLevel.toFixed(1) });
            if (warning) warning += ' / ' + flipWarning;
            else warning = flipWarning;
        }

        // ===== SQUEEZE OVERRIDE: adds urgency to any scenario =====
        if (isSqueezeExtreme) {
            warning = ui('squeezeExtremeWarn');
            trigger = ui('squeezeExtremeTrigger');
        } else if (isSqueezeHigh) {
            if (!trigger.includes('Squeeze')) {
                trigger += trigger ? ' / ' : '';
                trigger += ui('squeezeCautionTrigger', { val: squeezeProbability.value });
            }
        }

        probability = Math.round(Math.max(5, Math.min(95, probability)));

        // =====================================
        // V4.0: FACTOR BREAKDOWN FOR VISUALIZATION
        // =====================================
        const factorBreakdown = [
            { key: 'opi', name: 'OPI', score: Math.round(opiScore), max: 25, label: opi.value > 0 ? ui('factorCallDominant') : opi.value < 0 ? ui('factorPutDominant') : ui('verdictNeutralLabel') },
            { key: 'whale', name: ui('factorWhale'), score: Math.round(whaleScore), max: 25, label: whaleScore > 0 ? ui('factorCallAccum') : whaleScore < 0 ? ui('factorPutDominantWhale') : ui('factorWhaleWait') },
            { key: 'squeeze', name: ui('factorSqueeze'), score: Math.round(squeezeScore), max: 15, label: squeezeProbability.value >= 45 ? `${squeezeProbability.value}%` : ui('factorStable') },
            { key: 'skew', name: ui('factorIvSkew'), score: Math.round(skewScore), max: 15, label: ivSkew.value > 3 ? ui('factorFear') : ivSkew.value < -3 ? ui('factorGreed') : ui('verdictNeutralLabel') },
            { key: 'smart', name: ui('factorSmart'), score: Math.round(smartScore), max: 10, label: smartMoney.label },
            { key: 'dex', name: 'DEX', score: Math.round(dexScore), max: 10, label: dex.label },
            { key: 'uoa', name: 'UOA', score: Math.round(uoaScore), max: 5, label: uoa.label },
            { key: 'pc', name: 'P/C', score: Math.round(pcScore), max: 5, label: pcRatio.value > 1.3 ? ui('factorCallOverheat') : pcRatio.value < 0.75 ? ui('factorPutOverheat') : ui('factorBalance') },
            { key: 'zdte', name: 'GEX', score: Math.round(zdteScore), max: 5, label: gexRegime.pinStrength >= 35 ? `${gexRegime.pinStrength}%` : ui('factorMinimal') },
        ];

        return { status, message, color, probability, probLabel, probColor, whaleBias, compositeScore, signals, netWhalePremium, callPremium, putPremium, action, warning, trigger, factorBreakdown };
    }, [currentPrice, callWall, putWall, flowMap, whaleTrades, isMarketClosed, opi, squeezeProbability, ivSkew, smartMoney, ivPercentile, dex, uoa, pcRatio, gexRegime]);

    if (!rawChain || rawChain.length === 0) {
        return (
            <div className="h-[400px] flex flex-col items-center justify-center text-slate-400 bg-slate-900/50 rounded-lg border border-white/5">
                <Radar size={48} className="mb-4 opacity-20" />
                <p>No Flow Data Available</p>
                <p className="text-xs opacity-50">Waiting for live options stream...</p>
            </div>
        );
    }

    return (
        <div className="space-y-1 animate-in fade-in zoom-in duration-500" style={{ fontFamily: "'Plus Jakarta Sans', Pretendard, sans-serif" }}>
            {/* Header / Control Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-slate-900/50 p-2 px-4 rounded-md border border-white/5 backdrop-blur-md">
                {/* 1. Left: Branding with Prestige */}
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="h-9 w-9 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <Crosshair size={18} className="text-emerald-400 animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-white tracking-wide flex items-center gap-2">
                            FLOW RADAR <span className="text-amber-400 text-[11px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 flex items-center gap-1"><Lock size={8} /> LEVEL 3 CLEARANCE</span>
                        </h3>
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            {isMarketClosed ?
                                <span className="text-amber-500 flex items-center gap-1"><Zap size={9} /> PRE-MARKET • PREVIOUS CLOSE DATA (OI)</span>
                                : <span className="text-emerald-400 flex items-center gap-1"><Zap size={9} /> Live Action • MM Tracking</span>
                            }
                        </p>
                    </div>
                </div>

                {/* 2. Center: Strategy Tip — Glass Pill */}
                <div className="hidden md:flex flex-1 justify-center">
                    <div
                        className="relative flex items-center gap-2.5 px-5 py-2 rounded-full border border-cyan-500/25 bg-[#0d1117]/90 backdrop-blur-sm overflow-hidden"
                        style={{ boxShadow: '0 0 12px rgba(34,211,238,0.08), inset 0 1px 0 rgba(255,255,255,0.04)' }}
                    >
                        {/* Shimmer sweep */}
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-cyan-400/[0.06] to-transparent animate-[shimmer_4s_linear_infinite] pointer-events-none" style={{ backgroundSize: '200% 100%' }} />
                        <Lightbulb size={13} className="text-cyan-400/70 relative z-10 shrink-0" />
                        <span className="text-xs text-slate-300 font-medium tracking-wide relative z-10 leading-relaxed">
                            {effectiveViewMode === 'VOLUME'
                                ? (isMarketClosed ? t('volumePreMarket') : t('volumeActive'))
                                : t('oiSwing')}
                        </span>
                    </div>
                </div>

                {/* 3. Right: DTE + Toggles */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 tracking-wider font-mono">
                        {effectiveViewMode === 'VOLUME' ? '0-7 DTE' : '0-35 DTE'}
                    </span>
                    <div className="flex bg-slate-950 rounded-md p-1 border border-white/10">
                        <button
                            onClick={() => setUserViewMode('VOLUME')}
                            className={`px-4 py-1.5 text-xs font-black rounded transition-all uppercase tracking-wider ${effectiveViewMode === 'VOLUME' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}
                        >
                            Volume
                        </button>
                        <button
                            onClick={() => setUserViewMode('OI')}
                            className={`px-4 py-1.5 text-xs font-black rounded transition-all uppercase tracking-wider ${effectiveViewMode === 'OI' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}
                        >
                            OI
                        </button>
                    </div>
                </div>
            </div>

            {/* [PREMIUM] AI VERDICT - Flow Topography Map v3.0 Style */}
            <ProGate title="AI Verdict" fomoMessage={gt('fomoAiVerdict')} mode="peek">
                {!isSystemReady ? (
                    /* Compact analyzing indicator — inline next to AI VERDICT title */
                    <div className="bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-xl border border-white/10 p-3 backdrop-blur-xl shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="h-8 w-8 bg-amber-500/20 rounded-lg flex items-center justify-center border border-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                                    <Target size={16} className="text-amber-400 animate-pulse" />
                                </div>
                                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-ping" />
                            </div>
                            <span className="text-xs font-black text-amber-400 tracking-widest">AI VERDICT</span>
                            <span className="text-[13px] font-medium text-slate-400 animate-pulse">{ui('collectingData')}</span>
                        </div>
                    </div>
                ) : analysis && (
                    <div className="bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-xl border border-white/10 p-3 backdrop-blur-xl shadow-lg">
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
                                {analysis.status?.includes('SUPER') || analysis.status?.includes('BULL') || analysis.status?.includes('Buy') || analysis.status?.includes('BREAKOUT') || analysis.status?.includes('MOMENTUM') ? (
                                    <TrendingUp size={16} className="text-emerald-400" />
                                ) : analysis.status?.includes('COLLAPSE') || analysis.status?.includes('BEAR') || analysis.status?.includes('PRESSURE') || analysis.status?.includes('WEAK') ? (
                                    <TrendingDown size={16} className="text-rose-400" />
                                ) : analysis.status?.includes('RESISTANCE') ? (
                                    <AlertTriangle size={14} className="text-rose-400" />
                                ) : analysis.status?.includes('BREAKOUT') || analysis.status?.includes('GAMMA') ? (
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
                                    <span className="text-[13px] text-white font-bold uppercase tracking-wider">{ui('analysisLabel')}</span>
                                    {analysis.compositeScore !== undefined && (
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${analysis.compositeScore > 20 ? 'bg-emerald-500/20 text-emerald-400' : analysis.compositeScore < -20 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                            {ui('compositeLabel', { score: `${analysis.compositeScore > 0 ? '+' : ''}${Math.round(analysis.compositeScore)}` })}
                                        </span>
                                    )}
                                </div>
                                {/* Row 2: Analysis Message */}
                                <p className="text-[13px] text-white/90 leading-relaxed mb-2">{analysis.message}</p>

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
                                        <span className="text-[10px] text-rose-400">{ui('extremeBearish')}</span>
                                        <span className="text-[10px] text-slate-400">0</span>
                                        <span className="text-[10px] text-emerald-400">{ui('extremeBullish')}</span>
                                    </div>
                                </div>

                                {/* Row 4: Factor Breakdown - Compact Glassmorphism */}
                                {analysis.factorBreakdown && (
                                    <div className="bg-white/[0.03] backdrop-blur-sm rounded-lg p-2 border border-white/10 mb-2">
                                        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                                            {analysis.factorBreakdown.map((f: any) => (
                                                <div key={f.key} className="flex items-center gap-1">
                                                    <span className={`text-[11px] w-[36px] shrink-0 text-right font-bold ${f.score > 0 ? 'text-emerald-400' : f.score < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{f.name}</span>
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
                                                    <span className={`text-[11px] font-black w-[20px] shrink-0 text-right ${f.score > 0 ? 'text-emerald-400' : f.score < 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                                                        {f.score > 0 ? '+' : ''}{f.score}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Row 5: Market Observation */}
                                {(analysis.action || analysis.warning || analysis.trigger) && (
                                    <div className="space-y-0.5 mb-1.5 bg-black/20 rounded-lg p-1.5 border border-white/5">
                                        {analysis.action && (
                                            <div className="flex items-start gap-2">
                                                <div className="mt-0.5 w-1 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                                                <span className="text-[11px] text-emerald-400 font-bold uppercase shrink-0 w-8">NOTE</span>
                                                <span className="text-xs text-emerald-300">{analysis.action}</span>
                                            </div>
                                        )}
                                        {analysis.warning && (
                                            <div className="flex items-start gap-2">
                                                <div className="mt-0.5 w-1 h-2.5 rounded-full bg-amber-400 shrink-0" />
                                                <span className="text-[11px] text-amber-400 font-bold uppercase shrink-0 w-8">RISK</span>
                                                <span className="text-xs text-amber-300">{analysis.warning}</span>
                                            </div>
                                        )}
                                        {analysis.trigger && (
                                            <div className="flex items-start gap-2">
                                                <div className="mt-0.5 w-1 h-2.5 rounded-full bg-cyan-400 shrink-0" />
                                                <span className="text-[11px] text-cyan-400 font-bold uppercase shrink-0 w-8">KEY</span>
                                                <span className="text-xs text-cyan-300">{analysis.trigger}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Row 6: Key Levels */}
                                <div className="flex items-center gap-3 pt-1.5 border-t border-white/10 mt-auto">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] text-slate-400">{ui('supportLabel')}</span>
                                        <span className="text-xs text-emerald-400 font-bold">${putWall}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] text-slate-400">{ui('resistanceLabel')}</span>
                                        <span className="text-xs text-rose-400 font-bold">${callWall}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] text-slate-400">{ui('currentLabel')}</span>
                                        <span className="text-xs text-white font-bold">${currentPrice.toFixed(2)}</span>
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
                                        <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M10 28 L25 14 M10 28 L25 42 M70 28 L55 14 M70 28 L55 42" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-emerald-400" /><line x1="25" y1="28" x2="55" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-slate-400" /></svg>

                                        <span className="text-[13px] text-white font-bold uppercase relative z-10 text-center">{ui('opiTitle')}</span>
                                        <span className="text-xs text-white font-medium relative z-10 mt-0.5">{ui('opiSubtitle')}</span>

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

                                        <div className={`text-[13px] font-bold mt-1 relative z-10 ${opi.value > 20 ? 'text-emerald-400' : opi.value < -20 ? 'text-rose-400' : 'text-white'}`}>{opi.label}</div>
                                    </div>

                                    {/* ATM IV - Enhanced with Strategy Guidance */}
                                    <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                        {/* Glow background */}
                                        <div className={`absolute inset-0 opacity-15 ${ivPercentile.value >= 60 ? 'bg-rose-500' : ivPercentile.value <= 25 ? 'bg-cyan-500' : 'bg-slate-500'} blur-xl`} />
                                        {/* Infographic: volatility wave */}
                                        <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M4 28 Q14 8 24 28 Q34 48 44 28 Q54 8 64 28 Q74 48 80 28" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400" strokeLinecap="round" /><line x1="4" y1="28" x2="80" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-purple-300" strokeDasharray="3 3" /></svg>

                                        <span className="text-[13px] text-white font-bold uppercase relative z-10">ATM IV</span>
                                        <span className="text-xs text-white font-medium relative z-10 mt-0.5">{ui('atmIvSubtitle')}</span>

                                        <div className={`text-lg font-black relative z-10 mt-1 ${ivPercentile.value >= 60 ? 'text-rose-400' : ivPercentile.value <= 25 ? 'text-cyan-400' : 'text-white'}`} style={{ textShadow: ivPercentile.value >= 25 && ivPercentile.value < 60 ? 'none' : '0 0 10px currentColor' }}>
                                            {ivPercentile.value}%
                                        </div>
                                        <div className={`text-[13px] font-bold relative z-10 ${ivPercentile.value >= 80 ? 'text-rose-400' : ivPercentile.value >= 60 ? 'text-orange-400' : ivPercentile.value <= 15 ? 'text-cyan-400' : ivPercentile.value <= 25 ? 'text-teal-400' : 'text-white'}`}>
                                            {ivPercentile.value >= 80 ? ui('ivExtremeHot')
                                                : ivPercentile.value >= 60 ? ui('ivSellFavorable')
                                                    : ivPercentile.value <= 15 ? ui('ivExtremeLow')
                                                        : ivPercentile.value <= 25 ? ui('ivBuyFavorable')
                                                            : ui('ivNeutral')}
                                        </div>
                                        <div className="text-[13px] text-white/90 font-medium relative z-10 mt-0.5 text-center leading-tight">
                                            {ivPercentile.value >= 80 ? ui('ivStrategySpreadSell')
                                                : ivPercentile.value >= 60 ? ui('ivStrategyVolShrink')
                                                    : ivPercentile.value <= 15 ? ui('ivStrategyNakedBuy')
                                                        : ivPercentile.value <= 25 ? ui('ivStrategySpreadBuy')
                                                            : ui('ivStrategyCoveredCall')}
                                        </div>
                                    </div>

                                    {/* COMPOSITE INDEX - replaces Confluence */}
                                    <div className="flex-1 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                                        {/* Glow background */}
                                        <div className={`absolute inset-0 opacity-15 ${analysis.probability >= 65 ? 'bg-emerald-500' : analysis.probability <= 35 ? 'bg-rose-500' : 'bg-slate-500'} blur-xl`} />
                                        {/* Infographic: convergence radar */}
                                        <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><circle cx="40" cy="28" r="20" fill="none" stroke="currentColor" strokeWidth="1" className="text-emerald-400" /><circle cx="40" cy="28" r="12" fill="none" stroke="currentColor" strokeWidth="1" className="text-emerald-300" /><circle cx="40" cy="28" r="4" fill="currentColor" className="text-emerald-400" /><line x1="40" y1="4" x2="40" y2="52" stroke="currentColor" strokeWidth="0.5" className="text-emerald-300" /><line x1="16" y1="28" x2="64" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-emerald-300" /></svg>

                                        <span className="text-[13px] text-white font-bold uppercase relative z-10">COMPOSITE INDEX</span>
                                        <span className="text-xs text-white font-medium relative z-10 mt-0.5">{ui('compositeSubtitle')}</span>

                                        <div className={`text-lg font-black relative z-10 mt-1 ${analysis.probability >= 65 ? 'text-emerald-400' : analysis.probability <= 35 ? 'text-rose-400' : 'text-white'}`} style={{ textShadow: analysis.probability > 35 && analysis.probability < 65 ? 'none' : '0 0 10px currentColor' }}>
                                            {analysis.probability}%
                                        </div>
                                        <div className={`text-[13px] font-bold relative z-10 ${analysis.probability >= 65 ? 'text-emerald-400' : analysis.probability <= 35 ? 'text-rose-400' : 'text-white'}`}>
                                            {analysis.probability >= 80 ? ui('strongConvergence')
                                                : analysis.probability >= 65 ? ui('signalConvergence')
                                                    : analysis.probability <= 20 ? ui('strongConflict')
                                                        : analysis.probability <= 35 ? ui('signalConflict')
                                                            : ui('waitLabel')}
                                        </div>
                                        <div className="text-[13px] text-white/90 font-medium relative z-10 mt-0.5 text-center leading-tight">
                                            {analysis.probability >= 65
                                                ? ui('compositeAligned', { count: analysis.signals.length })
                                                : analysis.probability <= 35
                                                    ? ui('compositeConflict')
                                                    : ui('compositeNeedConfirm', { count: analysis.signals.length })
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
                                        <svg className="absolute right-0 bottom-0 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M8 36 Q20 12 40 24 Q60 36 72 18" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400" strokeLinecap="round" /><circle cx="16" cy="32" r="2.5" fill="currentColor" className="text-cyan-300" /><circle cx="64" cy="22" r="4" fill="currentColor" className="text-cyan-300" /></svg>

                                        <div className="flex items-center gap-1 mb-0.5 relative z-10">
                                            <Shield size={12} className="text-cyan-400" />
                                            <span className="text-xs text-white font-bold uppercase tracking-wider">{ui('whalePosition')}</span>
                                        </div>

                                        <div className={`text-lg font-black relative z-10 ${analysis.whaleBias?.includes('BULL') ? 'text-emerald-400'
                                            : analysis.whaleBias?.includes('BEAR') ? 'text-rose-400'
                                                : 'text-white'
                                            }`} style={{ textShadow: analysis.whaleBias?.includes('BULL') ? '0 0 12px rgba(52,211,153,0.8)' : analysis.whaleBias?.includes('BEAR') ? '0 0 12px rgba(248,113,113,0.8)' : 'none' }}>
                                            {analysis.whaleBias?.includes('BULL') ? ui('whalePositionLong')
                                                : analysis.whaleBias?.includes('BEAR') ? ui('whalePositionShort')
                                                    : ui('whalePositionWait')}
                                        </div>

                                        {/* Net Premium Flow */}
                                        {analysis.netWhalePremium !== undefined && (
                                            <div className="relative z-10 text-center">
                                                <div className={`text-[13px] font-black ${(analysis.netWhalePremium || 0) > 0 ? 'text-emerald-400' : (analysis.netWhalePremium || 0) < 0 ? 'text-rose-400' : 'text-white'}`}>
                                                    {(analysis.netWhalePremium || 0) > 0 ? '+' : ''}
                                                    ${Math.abs((analysis.netWhalePremium || 0) / 1000000) >= 1
                                                        ? `${((analysis.netWhalePremium || 0) / 1000000).toFixed(1)}M`
                                                        : `${((analysis.netWhalePremium || 0) / 1000).toFixed(0)}K`
                                                    }
                                                </div>
                                                <div className="text-xs text-white/90 font-medium">
                                                    C ${((analysis.callPremium || 0) / 1000).toFixed(0)}K / P ${((analysis.putPremium || 0) / 1000).toFixed(0)}K
                                                </div>
                                                <div className="text-xs text-white/90 font-medium mt-0.5">
                                                    {(analysis.netWhalePremium || 0) > 500000 ? ui('whaleLargeBuyCall')
                                                        : (analysis.netWhalePremium || 0) > 100000 ? ui('whaleCallBuy')
                                                            : (analysis.netWhalePremium || 0) < -500000 ? ui('whaleLargeBuyPut')
                                                                : (analysis.netWhalePremium || 0) < -100000 ? ui('whalePutBuy')
                                                                    : ui('whaleWaiting')}
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
                                        <svg className="absolute right-1 bottom-1 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M10 46 A 35 35 0 0 1 70 46" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400" strokeLinecap="round" /><line x1="40" y1="46" x2="40" y2="16" stroke="currentColor" strokeWidth="1.5" className="text-indigo-300" strokeLinecap="round" /><circle cx="40" cy="14" r="2.5" fill="currentColor" className="text-indigo-400" /></svg>
                                        <div className="relative z-10 flex flex-col items-center">
                                            <span className="text-xs text-white font-bold uppercase tracking-wider mb-1">{ui('pricePosition')}</span>
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
                                                            <text x="55" y="56" textAnchor="middle" className="fill-slate-400 text-[11px]">{pct.toFixed(0)}%</text>
                                                        </svg>
                                                        <div className="flex justify-between w-full px-1 -mt-1">
                                                            <span className="text-[11px] text-rose-400 font-mono font-bold">${putWall}</span>
                                                            <span className="text-[11px] text-emerald-400 font-mono font-bold">${callWall}</span>
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
                                        <svg className="absolute right-1 bottom-1 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M12 44 Q20 8 28 44 Q36 8 44 44 Q52 8 60 44 Q68 8 72 44" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" strokeLinecap="round" /><path d="M8 44 L72 44" stroke="currentColor" strokeWidth="0.5" className="text-amber-300" strokeDasharray="3 3" /></svg>
                                        <div className="relative z-10 flex flex-col items-center">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <Zap size={11} className="text-amber-400" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wide">SQUEEZE</span>
                                                {!squeezeProbability.isLoading && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${squeezeProbability.label === 'EXTREME' ? 'bg-rose-500/80 text-white' : squeezeProbability.label === 'HIGH' ? 'bg-amber-500/80 text-white' : squeezeProbability.label === 'MODERATE' ? 'bg-yellow-500/80 text-black' : 'bg-emerald-500/80 text-white'}`}>
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
                                                            <text x="55" y="56" textAnchor="middle" className="fill-slate-400 text-[11px]">{pct > 70 ? ui('squeezeImminent') : pct > 40 ? ui('squeezeCaution') : ui('squeezeStable')}</text>
                                                        </svg>
                                                        <div className="flex justify-between w-full px-2 -mt-1">
                                                            <span className="text-[11px] text-emerald-400 font-bold">0%</span>
                                                            <span className="text-[11px] text-amber-400 font-bold">50%</span>
                                                            <span className="text-[11px] text-rose-400 font-bold">100%</span>
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
            </ProGate>


            {/* 🆕 NEW METRICS ROW - Dark Pool / Short Volume / P/C Ratio (FREE) / GEX */}
            <div className="grid grid-cols-4 gap-3 mb-1">
                {/* === PRO GATED: Dark Pool + Short Vol (2 cards) === */}
                <div className="col-span-2">
                    <ProGate title="Market Structure" fomoMessage={gt('fomoMarketStructure')} mode="blur" compact>
                        <div className="grid grid-cols-2 gap-3">
                            {/* Dark Pool % */}
                            <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden group hover:border-purple-500/50 transition-all duration-300">
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent pointer-events-none" />
                                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/50 to-transparent" />
                                {/* Infographic: scattered dots (institutional distribution) */}
                                <svg className="absolute right-1 bottom-1 w-24 h-16 opacity-[0.12] pointer-events-none" viewBox="0 0 96 64">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <circle key={i} cx={8 + i * 12} cy={8 + ((i * 19) % 48)} r={2 + (i % 3)} fill="currentColor" className="text-purple-400" />)}
                                    <path d="M8 56 L20 38 L32 45 L44 22 L56 30 L68 12 L80 28 L92 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-300" strokeLinecap="round" />
                                </svg>
                                <div className="relative z-10 flex flex-col items-center justify-center">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className={`w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)] ${realtimeMetrics.darkPool ? 'animate-pulse' : ''}`} />
                                        <span className="text-xs text-white uppercase font-bold tracking-wide">Dark Pool %</span>
                                        <span className="text-[10px] text-slate-400 font-medium">{ui('institutionalWeight')}</span>
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
                                            return <span className={`text-[10px] px-1 py-0.5 rounded font-bold border ${color}`}>{label}</span>;
                                        })()}
                                    </div>
                                    <span className="text-xl font-black text-purple-400" style={{ textShadow: '0 0 20px rgba(168,85,247,0.7)' }}>
                                        {realtimeMetrics.darkPool ? `${realtimeMetrics.darkPool.percent}%` : '--'}
                                    </span>
                                    {realtimeMetrics.darkPool && (
                                        <span className="text-xs text-white mt-0.5 font-mono font-medium">
                                            DP {(realtimeMetrics.darkPool.volume / 1000).toFixed(1)}K / {ui('totalLabel')} {(realtimeMetrics.darkPool.totalVolume / 1000).toFixed(1)}K
                                        </span>
                                    )}
                                    {/* Buy/Sell Ratio Bar */}
                                    {realtimeMetrics.darkPool && (realtimeMetrics.darkPool.buyPct ?? 0) > 0 && (
                                        <div className="w-full mt-1.5 px-1">
                                            <div className="flex items-center justify-between text-xs font-bold mb-0.5">
                                                <span className="text-emerald-400">{ui('buyLabel')} {realtimeMetrics.darkPool.buyPct}%</span>
                                                <span className={`text-[11px] font-mono font-bold ${(realtimeMetrics.darkPool.netBuyValue || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {ui('netBuyLabel')} {(realtimeMetrics.darkPool.netBuyValue || 0) >= 0 ? '+' : ''}{((realtimeMetrics.darkPool.netBuyValue || 0) / 1e6).toFixed(1)}M
                                                </span>
                                                <span className="text-rose-400">{realtimeMetrics.darkPool.sellPct}% {ui('sellLabel')}</span>
                                            </div>
                                            <div className="flex h-[5px] rounded-full overflow-hidden bg-slate-700/50">
                                                {(() => {
                                                    const buyRaw = realtimeMetrics.darkPool.buyPct || 0;
                                                    const sellRaw = realtimeMetrics.darkPool.sellPct || 0;
                                                    const total = buyRaw + sellRaw;
                                                    const buyNorm = total > 0 ? (buyRaw / total) * 100 : 50;
                                                    const sellNorm = total > 0 ? (sellRaw / total) * 100 : 50;
                                                    return (
                                                        <>
                                                            <div className="bg-emerald-500 rounded-l-full transition-all duration-500" style={{ width: `${buyNorm}%` }} />
                                                            <div className="bg-rose-500 rounded-r-full transition-all duration-500" style={{ width: `${sellNorm}%` }} />
                                                        </>
                                                    );
                                                })()}
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
                                <svg className="absolute right-1 bottom-0 w-24 h-16 opacity-[0.12] pointer-events-none" viewBox="0 0 96 64">
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
                                        <span className="text-xs text-white uppercase font-bold tracking-wide">Short Vol %</span>
                                    </div>
                                    <span className="text-xl font-black text-rose-400" style={{ textShadow: '0 0 20px rgba(244,63,94,0.7)' }}>
                                        {realtimeMetrics.shortVolume ? `${realtimeMetrics.shortVolume.percent}%` : '--'}
                                    </span>
                                    <span className="text-[11px] text-white font-medium">
                                        {realtimeMetrics.shortVolume && realtimeMetrics.shortVolume.percent >= 40 ? ui('dailyShortSelling')
                                            : realtimeMetrics.shortVolume && realtimeMetrics.shortVolume.percent >= 25 ? ui('dailyShortSelling')
                                                : ui('dailyShortSelling')}
                                    </span>
                                    {realtimeMetrics.shortVolume && (
                                        <span className="text-xs text-white mt-0.5 font-mono font-medium">
                                            {ui('shortVolLabel')} {(realtimeMetrics.shortVolume.volume / 1000000).toFixed(1)}M / {ui('totalLabel')} {(realtimeMetrics.shortVolume.totalVolume / 1000000).toFixed(1)}M
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </ProGate>
                </div>

                {/* === FREE: P/C Ratio (경쟁사 무료 제공 지표) === */}
                {(() => {
                    const isOI = effectiveViewMode === 'OI';
                    const activePC = isOI ? pcRatioOI : pcRatio;
                    const dotColor = activePC.value >= 1.3 ? 'bg-emerald-500' : activePC.value <= 0.75 ? 'bg-rose-500' : 'bg-cyan-500';
                    return (
                        <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden group hover:border-cyan-500/50 transition-all duration-300">
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none" />
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
                            {/* Infographic: balanced scale lines (call/put equilibrium) */}
                            <svg className="absolute right-1 bottom-1 w-24 h-16 opacity-[0.12] pointer-events-none" viewBox="0 0 96 64">
                                <line x1="48" y1="4" x2="48" y2="56" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400" />
                                <path d="M12 28 Q30 12 48 28 Q66 44 84 28" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-300" strokeLinecap="round" />
                                <circle cx="20" cy="24" r="3" fill="currentColor" className="text-emerald-400" />
                                <circle cx="76" cy="24" r="3" fill="currentColor" className="text-rose-400" />
                                <path d="M8 48 L88 48" stroke="currentColor" strokeWidth="0.5" className="text-cyan-500" strokeDasharray="4 3" />
                            </svg>
                            <div className="relative z-10 flex flex-col items-center justify-center">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)] ${dotColor}`} />
                                    <span className="text-xs text-white uppercase font-bold tracking-wide">P/C Ratio</span>
                                    <span className={`text-[10px] font-medium ${isOI ? 'text-indigo-400' : 'text-white/60'}`}>{isOI ? 'OI' : 'VOLUME'}</span>
                                </div>
                                <span className={`text-xl font-black ${activePC.color}`} style={{ textShadow: `0 0 20px currentColor` }}>
                                    {activePC.value > 0 ? activePC.value.toFixed(2) : '--'} <span className="text-sm">{activePC.label}</span>
                                </span>
                                <span className="text-xs text-white font-medium mt-0.5 font-mono">
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
                                            <div className="flex items-center justify-between text-[11px] font-bold mb-0.5">
                                                <span className="text-emerald-400">{ui('callLabel')} {cPct}%</span>
                                                <span className={`text-[10px] font-medium ${activePC.value >= 2.0 ? 'text-emerald-400' : activePC.value >= 1.3 ? 'text-emerald-300/80' : activePC.value <= 0.5 ? 'text-rose-400' : activePC.value <= 0.75 ? 'text-rose-300/80' : 'text-slate-400'}`}>
                                                    {activePC.value >= 2.0 ? ui('pcBullish')
                                                        : activePC.value >= 1.3 ? ui('pcUpExpect')
                                                            : activePC.value <= 0.5 ? ui('pcDownHedge')
                                                                : activePC.value <= 0.75 ? ui('pcDefensive')
                                                                    : ui('pcExploring')}
                                                </span>
                                                <span className="text-rose-400">{pPct}% {ui('putLabel')}</span>
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

                {/* === PRO GATED: GEX Regime === */}
                <ProGate title="GEX Regime" fomoMessage={gt('fomoGexRegime')} mode="blur" compact>
                    <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden group hover:border-amber-500/50 transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
                        {/* Infographic: sine wave (gamma oscillation) */}
                        <svg className="absolute right-1 bottom-1 w-24 h-16 opacity-[0.12] pointer-events-none" viewBox="0 0 96 64">
                            <path d="M4 32 Q16 8 28 32 Q40 56 52 32 Q64 8 76 32 Q88 56 96 32" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" strokeLinecap="round" />
                            <path d="M4 32 Q16 16 28 32 Q40 48 52 32 Q64 16 76 32 Q88 48 96 32" fill="none" stroke="currentColor" strokeWidth="1" className="text-amber-300" strokeLinecap="round" strokeDasharray="3 4" />
                            <line x1="4" y1="32" x2="96" y2="32" stroke="currentColor" strokeWidth="0.5" className="text-amber-500" strokeDasharray="2 3" />
                        </svg>
                        <div className="relative z-10 flex flex-col items-center justify-center">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)] ${gexRegime.pinStrength >= 50 ? 'bg-amber-500 animate-pulse' : 'bg-amber-500'}`} />
                                <span className="text-xs text-white uppercase font-bold tracking-wider">GEX REGIME</span>
                                {gexRegime.dte === 0 && (
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold animate-pulse">TODAY</span>
                                )}
                                <span className={`text-[10px] px-1 py-0.5 rounded font-bold border ${gexRegime.regime === 'STABLE' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                    gexRegime.regime === 'TRANSITION' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                        gexRegime.regime === 'FLIP_ZONE' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                                            'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    }`}>{gexRegime.regime === 'STABLE' ? 'STABLE' : gexRegime.regime === 'TRANSITION' ? 'SHIFT' : gexRegime.regime === 'FLIP_ZONE' ? 'FLIP' : 'VOLATILE'}</span>
                            </div>
                            <span className={`text-xl font-black ${gexRegime.color}`} style={{ textShadow: `0 0 20px currentColor` }}>
                                {gexRegime.pinStrength}% <span className="text-sm">{gexRegime.label}</span>
                            </span>
                            <span className="text-xs text-white/90 font-medium mt-0.5 font-mono">
                                {gexRegime.weeklyLabel} | {gexRegime.nearestCount} {ui('contractsLabel')}
                            </span>
                            <span className="text-xs text-amber-300 mt-0.5 italic font-semibold">
                                {gexRegime.flipLevel
                                    ? (() => {
                                        const f = `FLIP $${gexRegime.flipLevel} (${gexRegime.flipDir}${gexRegime.flipDistance}%)`;
                                        const pinZone = Math.round(currentPrice / 5) * 5;
                                        if (gexRegime.regime === 'STABLE') return `${f} | $${pinZone} ${ui('gexPinStable')}`;
                                        if (gexRegime.regime === 'TRANSITION') return `${f} | $${pinZone} ${ui('gexTransition')}`;
                                        if (gexRegime.regime === 'FLIP_ZONE') return `${f} | ${ui('gexFlipNear')}`;
                                        return `${f} | ${ui('gexShortGamma')}`;
                                    })()
                                    : (() => {
                                        const mp = maxPainDistance.maxPain;
                                        const atm = gexRegime.atmConcentration;
                                        if (gexRegime.isLongGamma) {
                                            return mp > 0
                                                ? ui('gexLongGammaWithMp', { atm, mp })
                                                : ui('gexLongGammaSuppressed', { atm });
                                        } else {
                                            return mp > 0
                                                ? ui('gexShortGammaWithMp', { atm, mp })
                                                : ui('gexShortGammaAmplified', { atm });
                                        }
                                    })()
                                }
                            </span>
                        </div>
                    </div>
                </ProGate>
            </div>

            {/* Tactical Intel Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 h-[780px]">

                {/* 1. Main Radar Chart & Whale Feed */}
                <Card className="bg-slate-900/80 border-white/10 shadow-lg relative overflow-hidden order-2 lg:order-1 rounded-lg flex flex-col h-full">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                    <CardContent className="p-6 relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
                        {/* [TOP] HOLOGRAPHIC WHALE STREAM (Relocated) */}
                        <EliteGate title="Institutional Order Flow" fomoMessage={gt('fomoClassifiedFlow')} mode="blur" minHeight="280px">
                            <div className="relative -mx-4 -mt-1">
                                {/* Decorative Line (The "Stream") */}
                                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent blur-[1px]" />

                                <div className="relative pl-6 pb-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h3 className="text-lg font-black text-white flex items-center gap-2 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] tracking-widest uppercase whitespace-nowrap">
                                            <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                                            LEVEL 3: INSTITUTIONAL ORDER FLOW
                                        </h3>
                                        <span className="text-[13px] font-black px-2.5 py-1 rounded bg-rose-950/40 border border-rose-500/40 text-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)] animate-pulse tracking-widest whitespace-nowrap shrink-0">
                                            ELITE ACCESS // INSTITUTIONAL
                                        </span>
                                        {/* Whale / Dark Pool Toggle */}
                                        <div className="flex bg-slate-950/80 backdrop-blur-xl rounded-lg p-1 border border-white/10 shrink-0 ml-auto gap-1">
                                            <button
                                                onClick={() => setFlowViewMode('WHALE')}
                                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-300 ${flowViewMode === 'WHALE'
                                                    ? 'bg-cyan-500/20 backdrop-blur-md text-white border border-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                                                    : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                                            >
                                                <Shield size={13} className={flowViewMode === 'WHALE' ? 'text-cyan-400' : 'text-slate-400'} />
                                                <div className="flex flex-col items-start">
                                                    <span className="text-xs font-black uppercase tracking-wider leading-none">Institutional</span>
                                                    <span className={`text-[12px] leading-none mt-0.5 ${flowViewMode === 'WHALE' ? 'text-cyan-300/70' : 'text-slate-400'}`}>{ui('whaleTracking')}</span>
                                                </div>
                                                {whaleTrades.length > 0 && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${flowViewMode === 'WHALE' ? 'bg-cyan-500/30 text-cyan-300' : 'bg-slate-700 text-slate-400'}`}>
                                                        {whaleTrades.length}
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => setFlowViewMode('DARKPOOL')}
                                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-300 ${flowViewMode === 'DARKPOOL'
                                                    ? 'bg-teal-500/20 backdrop-blur-md text-white border border-teal-400/40 shadow-[0_0_15px_rgba(20,184,166,0.3)]'
                                                    : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                                            >
                                                <Layers size={13} className={flowViewMode === 'DARKPOOL' ? 'text-teal-400' : 'text-slate-400'} />
                                                <div className="flex flex-col items-start">
                                                    <span className="text-xs font-black uppercase tracking-wider leading-none">Dark Pool</span>
                                                    <span className={`text-[12px] leading-none mt-0.5 ${flowViewMode === 'DARKPOOL' ? 'text-teal-300/70' : 'text-slate-400'}`}>{ui('darkPoolLabel')}</span>
                                                </div>
                                                {darkPoolTrades.length > 0 && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${flowViewMode === 'DARKPOOL' ? 'bg-teal-500/30 text-teal-300' : 'bg-slate-700 text-slate-400'}`}>
                                                        {darkPoolTrades.length}
                                                    </span>
                                                )}
                                            </button>
                                        </div>

                                    </div>
                                    {flowViewMode === 'WHALE' && (
                                        <div className="text-[13px] text-slate-400 font-medium tracking-wide pl-6 hidden sm:block">
                                            <Info size={11} className="text-slate-500 inline mr-0.5" />
                                            <span className="text-cyan-400">Cost</span>={ui('costLabel')} | <span className="text-amber-400">BEP</span>={ui('bepLabel')}
                                        </div>
                                    )}

                                    {/* Horizontal Scroll Container */}
                                    <div
                                        className="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 scrollbar-hide mask-linear-gradient"
                                        style={{ maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)' }}
                                    >
                                        {flowViewMode === 'WHALE' ? (
                                            /* ===== WHALE TRADES VIEW ===== */
                                            tradesLoading ? (
                                                <div className="min-w-[300px] h-[100px] flex items-center justify-center text-cyan-400 font-mono text-sm border border-cyan-500/30 rounded-xl bg-cyan-950/30 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.15)] gap-3 animate-pulse">
                                                    <Loader2 size={16} className="animate-spin text-cyan-400" />
                                                    DEEP SCANNING INSTITUTIONAL FLOW...
                                                </div>
                                            ) : whaleTrades.length === 0 ? (
                                                <div className="min-w-[300px] h-[100px] flex items-center justify-center text-cyan-500/30 font-mono text-sm border border-cyan-500/10 rounded-xl bg-cyan-950/10 backdrop-blur-sm">
                                                    No Institutional Data Found
                                                </div>
                                            ) : (
                                                whaleTrades.map((t: any, i: number) => {
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
                                                        strategyMain = "STOCK REPL"; strategySub = ui('stockReplace');
                                                    } else if (isCall && moneyness < 0.85) {
                                                        strategyMain = "LEVERAGE"; strategySub = ui('leverageLabel');
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
                                                                    <span className="text-[13px] text-slate-400 font-mono mt-0.5 opacity-0 h-0 overflow-hidden">
                                                                        {/* Hidden for layout balance, moved to Row 2 */}
                                                                    </span>
                                                                </div>
                                                                <div className="text-right flex flex-col items-end">
                                                                    <div className={`text-[13px] font-bold px-2 py-0.5 rounded mb-1 flex items-center gap-1.5 ${isCall ? 'text-emerald-300 bg-emerald-500/20' : 'text-rose-300 bg-rose-500/20'}`}>
                                                                        <span>{t.type}</span>
                                                                        <span className="opacity-50">|</span>
                                                                        {/* [Fix] Direct string parsing to avoid UTC->EST shift (e.g. 2025-01-16 -> Jan 15) */}
                                                                        <span>{t.expiry.substring(5).replace('-', '/')}</span>
                                                                    </div>
                                                                    <div className={`text-[11px] font-bold tracking-wider ${impactTextColor}`}>
                                                                        IMPACT: {impactLabel}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Row 2: Strategy & Strike (Expanded) */}
                                                            <div className="flex justify-between items-end border-b border-white/10 pb-2">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[13px] font-bold text-cyan-200">{strategyMain}</span>
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
                                                                <div className="text-[13px] font-mono text-slate-300">
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
                                                                    <span className="text-xs text-slate-400 font-mono mt-0.5">{dp.exchangeName}</span>
                                                                </div>
                                                                <div className="text-right flex flex-col items-end">
                                                                    <div className="text-[13px] font-bold px-2 py-0.5 rounded mb-1 text-teal-300 bg-teal-500/15">
                                                                        DARK POOL
                                                                    </div>
                                                                    <div className={`text-[11px] font-bold tracking-wider ${isBlock ? 'text-amber-400' : 'text-slate-400'}`}>
                                                                        {isBlock ? 'BLOCK' : 'STANDARD'}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Row 2: Size & Price */}
                                                            <div className="flex justify-between items-end border-b border-white/10 pb-2">
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs text-slate-400">Size</span>
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
                                                                <div className="text-[13px] font-mono text-slate-400">
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
                        </EliteGate>

                        {/* Visual Separator between LEVEL 3 and Bar Chart — PRO */}
                        <ProGate title="Options Landscape" fomoMessage={gt('fomoOptionsBattlefield')} mode="blur">
                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-white/10"></div>
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-slate-900 px-4 text-[11px] font-black text-slate-400 tracking-widest">
                                        OPTIONS FLOW LANDSCAPE
                                    </span>
                                </div>
                            </div>

                            {/* THE RADAR LIST (Top 2/3) */}
                            <div className="flex-none pb-4 mt-2">
                                <div className="grid grid-cols-[1fr_80px_1fr] gap-4 mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-center shrink-0">
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
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
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
                                                        <span className={`text-[11px] font-mono mr-2 ${putVal > 0 ? "text-rose-400" : "text-slate-700"}`}>
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
                                                        <span className={`text-xs font-mono font-bold z-10 ${isAtMoney ? "text-white scale-110 drop-shadow-[0_0_5px_rgba(99,102,241,0.8)]" : isCallWallStrike || isPutWallStrike ? "text-amber-200" : "text-slate-400 group-hover:text-slate-300"}`}>
                                                            {row.strike}
                                                        </span>
                                                        {isCallWallStrike && <div className="absolute -right-3 top-1 text-[10px] text-emerald-400 font-black animate-bounce drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]">R</div>}
                                                        {isPutWallStrike && <div className="absolute -left-3 top-1 text-[10px] text-rose-400 font-black animate-bounce drop-shadow-[0_0_5px_rgba(244,63,94,0.8)]">S</div>}
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
                                                        <span className={`text-[11px] font-mono ml-2 ${callVal > 0 ? "text-emerald-400" : "text-slate-700"}`}>
                                                            {callVal > 0 ? callVal.toLocaleString() : ""}
                                                        </span>
                                                    </div>
                                                </div>

                                                {showCurrentLineHere && (
                                                    <div className="col-span-3 py-1 relative" ref={currentPriceLineRef}>
                                                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-sky-500/30 border-t border-dashed border-sky-400/50 shadow-[0_0_5px_rgba(14,165,233,0.3)]" />
                                                        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-slate-900 border border-sky-500/50 px-3 py-0.5 rounded-full z-20 shadow-[0_0_15px_rgba(14,165,233,0.4)] flex items-center gap-2 animate-pulse backdrop-blur-sm">
                                                            <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-ping" />
                                                            <span className="text-xs font-black text-sky-400 tracking-wide">
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
                        </ProGate>


                    </CardContent>
                </Card>

                {/* 2. Tactical Briefing Console (Korean Mode) */}
                <div className="order-1 lg:order-2 h-full">
                    {/* Consistent Glass Panel for Right Side */}
                    <Card className="bg-slate-900/30 backdrop-blur-md border-white/10 flex flex-col rounded-xl h-full min-h-0 shadow-lg relative overflow-y-auto">
                        {/* Subtle Grid Background */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-50" />

                        <CardContent className="p-4 pb-8 flex flex-col relative z-10">
                            {/* Implied Move (기대변동폭) — PRO */}
                            <ProGate title="Implied Move" fomoMessage={gt('fomoImpliedMove')} mode="blur" compact>
                                <div className="mb-4 bg-gradient-to-br from-teal-950/20 to-slate-900/40 border border-teal-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-teal-500/30 transition-all">
                                    <div className="absolute inset-0 bg-teal-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {/* Infographic: expanding arrows (implied move range) */}
                                    <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M25 28 L8 16 M25 28 L8 40 M55 28 L72 16 M55 28 L72 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-teal-400" /><line x1="25" y1="28" x2="55" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="text-teal-300" /></svg>
                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wider">Implied Move</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className={`text-xl font-black ${impliedMove.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                    ±{impliedMove.value}%
                                                </div>
                                                <div className={`text-sm font-bold ${impliedMove.color} px-2 py-0.5 bg-black/20 rounded`}>{impliedMove.label}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="text-slate-400">ATM Straddle <span className="text-teal-400/70">({impliedMove.expiryLabel})</span></span>
                                            <span className="text-white font-bold font-mono">${impliedMove.straddle}</span>
                                        </div>
                                        <div className="text-[13px] text-white/90 font-medium pl-4 border-l border-teal-500/30">
                                            <BarChart3 size={11} className="text-teal-400 inline mr-1" />{impliedMove.direction === 'bullish' ? ui('impliedMoveBullish') : impliedMove.direction === 'bearish' ? ui('impliedMoveBearish') : ui('impliedMoveBalanced')}
                                        </div>
                                    </div>
                                </div>
                            </ProGate>

                            {/* PUT FLOOR + CALL WALL: 2-Column Grid — PRO peek */}
                            <ProGate title="Put Floor / Call Wall" fomoMessage={gt('fomoPutFloorCallWall')} mode="peek" compact>
                                <div className="grid grid-cols-2 gap-2">
                                    {/* PUT FLOOR (Left - Support) */}
                                    <div className="bg-gradient-to-br from-rose-950/30 to-slate-900/50 border border-rose-500/20 rounded-lg p-3 relative overflow-hidden group hover:border-rose-500/40 transition-all">
                                        <div className="absolute inset-0 bg-rose-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {/* Infographic: floor support line */}
                                        <svg className="absolute right-1 bottom-1 w-16 h-12 opacity-[0.12] pointer-events-none" viewBox="0 0 64 48"><line x1="4" y1="38" x2="60" y2="38" stroke="currentColor" strokeWidth="2" className="text-rose-400" /><path d="M12 30 L24 22 L36 26 L48 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-rose-300" strokeLinecap="round" /><path d="M48 14 L48 20 M48 14 L42 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-rose-300" strokeLinecap="round" /></svg>
                                        <div className="flex items-center justify-between mb-2 relative z-10">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-rose-500 rounded-sm shadow-[0_0_5px_rgba(244,63,94,0.8)] animate-pulse" />
                                                <span className="text-[11px] text-rose-400 font-bold uppercase tracking-wider">PUT FLOOR</span>
                                            </div>
                                            <span className="text-xs font-bold text-rose-400">
                                                {currentPrice > 0 && putWall > 0 ? `${(((currentPrice - putWall) / currentPrice) * 100).toFixed(1)}%↑` : '-'}
                                            </span>
                                        </div>
                                        <div className="text-lg font-black text-rose-400 font-mono relative z-10" style={{ textShadow: '0 0 10px rgba(251,113,133,0.5)' }}>
                                            ${putWall}
                                        </div>
                                        <div className="text-[11px] text-rose-500/70 mt-1 relative z-10">{t('support')}</div>
                                    </div>

                                    {/* CALL WALL (Right - Resistance) */}
                                    <div className="bg-gradient-to-br from-emerald-950/30 to-slate-900/50 border border-emerald-500/20 rounded-lg p-3 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                                        <div className="absolute inset-0 bg-emerald-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {/* Infographic: ceiling resistance line */}
                                        <svg className="absolute right-1 bottom-1 w-16 h-12 opacity-[0.12] pointer-events-none" viewBox="0 0 64 48"><line x1="4" y1="10" x2="60" y2="10" stroke="currentColor" strokeWidth="2" className="text-emerald-400" /><path d="M12 38 L24 30 L36 34 L48 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-300" strokeLinecap="round" /><path d="M48 22 L48 28 M48 22 L42 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-300" strokeLinecap="round" /></svg>
                                        <div className="flex items-center justify-between mb-2 relative z-10">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-sm shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse" />
                                                <span className="text-[11px] text-emerald-400 font-bold uppercase tracking-wider">CALL WALL</span>
                                            </div>
                                            <span className="text-xs font-bold text-emerald-400">
                                                {currentPrice > 0 && callWall > 0 ? `${(((callWall - currentPrice) / currentPrice) * 100).toFixed(1)}%↓` : '-'}
                                            </span>
                                        </div>
                                        <div className="text-lg font-black text-emerald-400 font-mono relative z-10" style={{ textShadow: '0 0 10px rgba(52,211,153,0.5)' }}>
                                            ${callWall}
                                        </div>
                                        <div className="text-[11px] text-emerald-500/70 mt-1 relative z-10">{t('resistance')}</div>
                                    </div>
                                </div>
                            </ProGate>

                            {/* Other Indicators: 1-Column Full-Width with Spacious Layout */}
                            <div className="flex flex-col gap-3 mt-3">
                                {/* Smart Money Score — ELITE */}
                                <EliteGate title="Institutional Activity" mode="blur" compact>
                                    <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900/40 border border-indigo-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-indigo-500/30 transition-all">
                                        <div className="absolute inset-0 bg-indigo-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {/* Infographic: money flow stack */}
                                        <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><rect x="10" y="8" width="24" height="6" rx="2" fill="currentColor" className="text-indigo-400" /><rect x="10" y="18" width="36" height="6" rx="2" fill="currentColor" className="text-indigo-400" /><rect x="10" y="28" width="48" height="6" rx="2" fill="currentColor" className="text-indigo-300" /><rect x="10" y="38" width="60" height="6" rx="2" fill="currentColor" className="text-indigo-300" /></svg>
                                        <div className="relative z-10">
                                            {/* Row 1: Label + Value */}
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                                                    <span className="text-xs text-white font-bold uppercase tracking-wider">{ui('smartMoneyTitle')}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className={`text-xl font-black ${smartMoney.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                        {smartMoney.score}
                                                    </div>
                                                    <div className={`text-sm font-bold ${smartMoney.color} px-2 py-0.5 bg-black/20 rounded`}>{smartMoney.label}</div>
                                                </div>
                                            </div>
                                            {/* Row 2: Rationale */}
                                            <div className="text-[13px] text-white/90 font-medium pl-4 border-l border-indigo-500/30">
                                                <Banknote size={11} className="text-indigo-400 inline mr-1" />{ui('largeTrade')}: {smartMoney.rationale || ui('analyzing')}
                                            </div>
                                        </div>
                                    </div>
                                </EliteGate>

                                {/* Max Pain 거리 — PRO */}
                                <ProGate title="Max Pain" fomoMessage={gt('fomoMaxPain')} mode="blur" compact>
                                    <div className="bg-gradient-to-br from-orange-950/20 to-slate-900/40 border border-orange-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-orange-500/30 transition-all">
                                        <div className="absolute inset-0 bg-orange-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {/* Infographic: target crosshair */}
                                        <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><circle cx="40" cy="28" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-400" /><circle cx="40" cy="28" r="10" fill="none" stroke="currentColor" strokeWidth="1" className="text-orange-300" /><circle cx="40" cy="28" r="3" fill="currentColor" className="text-orange-400" /><line x1="40" y1="6" x2="40" y2="50" stroke="currentColor" strokeWidth="0.5" className="text-orange-300" /><line x1="18" y1="28" x2="62" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-orange-300" /></svg>
                                        <div className="relative z-10">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
                                                    <span className="text-xs text-white font-bold uppercase tracking-wider">{ui('maxPainDistance')}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className={`text-xl font-black ${maxPainDistance.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                        {maxPainDistance.direction === 'above' ? '+' : maxPainDistance.direction === 'below' ? '' : ''}{maxPainDistance.distPercent}%
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-slate-400">Max Pain</span>
                                                <span className="text-white font-bold font-mono">${maxPainDistance.maxPain}</span>
                                            </div>
                                            <div className="text-[13px] text-white/90 font-medium pl-4 border-l border-orange-500/30">
                                                <Crosshair size={11} className="text-orange-400 inline mr-1" />{maxPainDistance.direction === 'above' ? ui('maxPainAbove', { dist: Math.abs(maxPainDistance.distance).toFixed(1) }) : maxPainDistance.direction === 'below' ? ui('maxPainBelow', { dist: Math.abs(maxPainDistance.distance).toFixed(1) }) : ui('maxPainConverge')}
                                            </div>
                                        </div>
                                    </div>
                                </ProGate>

                                {/* IV Skew — PRO */}
                                <ProGate title="IV Skew" fomoMessage={gt('fomoIvSkew')} mode="blur" compact>
                                    <div className="bg-gradient-to-br from-violet-950/20 to-slate-900/40 border border-violet-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-violet-500/30 transition-all">
                                        <div className="absolute inset-0 bg-violet-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {/* Infographic: tilted skew line */}
                                        <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M8 44 Q24 40 40 28 Q56 16 72 12" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400" strokeLinecap="round" /><line x1="8" y1="28" x2="72" y2="28" stroke="currentColor" strokeWidth="0.5" className="text-violet-300" strokeDasharray="4 3" /><circle cx="40" cy="28" r="2.5" fill="currentColor" className="text-violet-400" /></svg>
                                        <div className="relative z-10">
                                            {/* Row 1: Label + Value */}
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
                                                    <span className="text-xs text-white font-bold uppercase tracking-wider">{ui('ivSkewTitle')}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className={`text-xl font-black ${ivSkew.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                        {ivSkew.value > 0 ? '+' : ''}{ivSkew.value}%
                                                    </div>
                                                    <div className={`text-sm font-bold ${ivSkew.color} px-2 py-0.5 bg-black/20 rounded`}>{ivSkew.label}</div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Row 2: Rationale */}
                                        <div className="text-[13px] text-white/90 font-medium pl-4 border-l border-violet-500/30">
                                            <BarChart3 size={11} className="text-violet-400 inline mr-1" />{ivSkew.rationale || ui('ivSkewAnalyzing')}
                                        </div>
                                    </div>
                                </ProGate>

                                {/* DEX (Delta Exposure) — ELITE */}
                                <EliteGate title="DEX" fomoMessage={gt('fomoDex')} mode="blur" compact>
                                    <div className="bg-gradient-to-br from-cyan-950/20 to-slate-900/40 border border-cyan-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                                        <div className="absolute inset-0 bg-cyan-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {/* Infographic: delta hedging arrows */}
                                        <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M12 40 L40 12 L68 40" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400" strokeLinecap="round" strokeLinejoin="round" /><path d="M26 40 L40 24 L54 40" fill="none" stroke="currentColor" strokeWidth="1" className="text-cyan-300" strokeDasharray="3 3" /></svg>
                                        <div className="relative z-10">
                                            {/* Row 1: Label */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shrink-0" />
                                                <span className="text-xs text-white font-bold uppercase tracking-wider">{ui('dexTitle')}</span>
                                            </div>
                                            {/* Row 2: Value + Verdict */}
                                            <div className="flex items-center justify-center gap-3 mb-2">
                                                <div className={`text-xl font-black ${dex.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                    {dex.value > 0 ? '+' : ''}{dex.value.toFixed(1)}M
                                                </div>
                                                <div className={`text-sm font-bold ${dex.color} px-2 py-0.5 bg-black/20 rounded`}>{dex.label}</div>
                                            </div>
                                            {/* Row 2: Rationale */}
                                            <div className="text-[13px] text-white/90 font-medium pl-4 border-l border-cyan-500/30">
                                                <TrendingUp size={11} className="text-cyan-400 inline mr-1" />{dex.rationale || ui('dexAnalyzing')}
                                            </div>
                                        </div>
                                    </div>
                                </EliteGate>

                                {/* UOA Score — PRO */}
                                <ProGate title={gt('titleUoa')} mode="blur" compact>
                                    <div className="bg-gradient-to-br from-amber-950/20 to-slate-900/40 border border-amber-500/15 rounded-lg p-4 relative overflow-hidden group hover:border-amber-500/30 transition-all">
                                        <div className="absolute inset-0 bg-amber-500/3 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {/* Infographic: alert burst */}
                                        <svg className="absolute right-2 bottom-2 w-20 h-14 opacity-[0.12] pointer-events-none" viewBox="0 0 80 56"><path d="M40 8 L44 20 L56 20 L46 28 L50 40 L40 32 L30 40 L34 28 L24 20 L36 20 Z" fill="currentColor" className="text-amber-400" /><circle cx="40" cy="24" r="4" fill="none" stroke="currentColor" strokeWidth="1" className="text-amber-300" /></svg>
                                        <div className="relative z-10">
                                            {/* Row 1: Label + Value */}
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                                                    <span className="text-xs text-white font-bold uppercase tracking-wider">{ui('uoaTitle')}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className={`text-xl font-black ${uoa.color}`} style={{ textShadow: '0 0 10px currentColor' }}>
                                                        {uoa.score}x
                                                    </div>
                                                    <div className={`text-sm font-bold ${uoa.color} px-2 py-0.5 bg-black/20 rounded`}>{uoa.label}</div>
                                                </div>
                                            </div>
                                            {/* Row 2: Rationale */}
                                            <div className="text-[13px] text-white/90 font-medium pl-4 border-l border-amber-500/30">
                                                <Activity size={11} className="text-amber-400 inline mr-1" />{uoa.rationale || ui('uoaAnalyzing')}
                                            </div>
                                        </div>
                                    </div>
                                </ProGate>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
