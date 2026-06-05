"use client";

import React, { useState, useEffect, useRef, useTransition, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { 
    Search, Sliders, Radar, Zap, Shield, ShieldAlert, Activity, 
    TrendingUp, TrendingDown, Target, BarChart3, AlertCircle, 
    ChevronLeft, ChevronRight, Lock, Clipboard, Check, HelpCircle,
    DollarSign, Plus, CheckCircle2, Clock
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';
import { useRadarHoldings } from '@/hooks/useRadarHoldings';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { requestNotificationPermission, sendRadarAlert } from '@/services/radarNotifications';
import { usePortfolioTracker } from '@/hooks/usePortfolioTracker';
import { evaluateCircuitBreaker, type CircuitBreakerResult } from '@/services/circuitBreaker';
import '@/styles/radar-tokens.css';

// Premium design-system grade tokens
const gradeColorMap: Record<string, { bg: string, text: string, border: string, glow: string }> = {
    S: { bg: 'bg-emerald-900/20', text: 'text-emerald-400', border: 'border-emerald-500/20', glow: 'shadow-[0_0_15px_rgba(16,185,129,0.25)]' },
    A: { bg: 'bg-sky-900/20', text: 'text-sky-400', border: 'border-sky-500/20', glow: 'shadow-none' },
    B: { bg: 'bg-slate-800/30', text: 'text-slate-300', border: 'border-slate-700/30', glow: 'shadow-none' },
    C: { bg: 'bg-slate-800/20', text: 'text-slate-400', border: 'border-slate-700/20', glow: 'shadow-none' },
    D: { bg: 'bg-amber-900/20', text: 'text-amber-400', border: 'border-amber-500/20', glow: 'shadow-none' },
    F: { bg: 'bg-rose-900/20', text: 'text-rose-400', border: 'border-rose-500/20', glow: 'shadow-[0_0_15px_rgba(244,63,94,0.2)]' },
};

const radarI18n: Record<string, {
    autopilotTitle: string;
    autopilotDesc: string;
    guideTitle: string;
    guide1Title: string;
    guide1Desc: string;
    guide2Title: string;
    guide2Desc: string;
    guide3Title: string;
    guide3Desc: string;
    copyBtn: string;
    copyBtnCopied: string;
    copyBracket: string;
    copyBracketCopied: string;
    analyzing: string;
    neutral: string;
    strongBuy: string;
    callBuy: string;
    putShort: string;
    avoidLong: string;
    expectedBands: string;
    liveGap: string;
    optimalRange: string;
    riskReward: string;
    optimalWeights: string;
    dynamicAlert: string;
    scoreDecayTitle: string;
    scoreDecayDesc: string;
    rotationTitle: string;
    rotationDesc: string;
    shares: string;
    weight: string;
    livePrice: string;
    allocatedCap: string;
    grade: string;
    ticker: string;
    held: string;
    adjustment: string;
    rebalanceAligned: string;
    actionBuy: string;
    actionTrim: string;
    realAssetStatus: string;
    totalEvaluated: string;
    totalGainLoss: string;
    quickAddTitle: string;
    quickAddPrice: string;
    quickAddQty: string;
    quickAddSubmit: string;
    noDecayStatus: string;
    noHoldingsTitle: string;
    batchInjectBtn: string;
    batchInjectSuccess: string;
    liquidateBtn: string;
    executeRotationBtn: string;
    tradingCapitalLabel: string;
    cashLabel: string;
    totalReturnLabel: string;
    navLabel: string;
}> = {
    ko: {
        autopilotTitle: "AUTONOMOUS ALLOCATION MATRIX (ZERO-BIAS)",
        autopilotDesc: "Kelly Expectancy & Inverse Volatility Risk Parity 모델 기반의 포트폴리오 비중 설계 가이드",
        guideTitle: "💡 초보자를 위한 오토파일럿 실전 매수 3단계 가이드",
        guide1Title: "1단계. 투자 자금 설정 및 비중 확인",
        guide1Desc: "좌측 패널에서 총 투자 자금을 달러($) 단위로 입력하면, 각 종목의 비중(Weight)에 맞춰 추천 매수 수량(Shares)이 자동으로 계산됩니다.",
        guide2Title: "2단계. 한글 가이드 텍스트 복사",
        guide2Desc: "우측 상단의 [COPY ALLOCATION MATRIX] 버튼을 클릭하여 증권사 앱을 보면서 그대로 따라 입력할 수 있는 주문 가이드를 복사합니다.",
        guide3Title: "3단계. 증권사 계좌 주문 세팅",
        guide3Desc: "주거래 증권사 앱을 켜고 안내문대로 지정가(Limit) 매수를 넣은 뒤, 손절가(SL) 및 익절가(TP) 예약 주문을 등록하면 끝납니다.",
        copyBtn: "COPY ALLOCATION MATRIX",
        copyBtnCopied: "PORTFOLIO COPIED!",
        copyBracket: "COPY ORDER BRACKET",
        copyBracketCopied: "BRACKET COPIED!",
        analyzing: "수급 지표 분석 중...",
        neutral: "NEUTRAL OBSERVATION",
        strongBuy: "🔥 HIGH-CONVICTION PROPRIETARY BUY",
        callBuy: "⚡ ACCUMULATION CALL ENTRY",
        putShort: "💀 PROPRIETARY SHORT / PUT ENTRY",
        avoidLong: "⚠️ DEGRADED DRIFT - AVOID LONG",
        expectedBands: "EXPECTED BANDS (ENTRY / SL / TP)",
        liveGap: "LIVE GAP",
        optimalRange: "Optimal Buy Limit Range",
        riskReward: "R:R",
        optimalWeights: "Optimal Portfolio Weights",
        dynamicAlert: "Dynamic Rotation Alert",
        scoreDecayTitle: "🚨 LIQUIDATION SIGNAL: SCORE DECAY",
        scoreDecayDesc: "active position인 TSLA (38)와 RKLB (33)에 대한 기대치 점수가 임계치 50 미만으로 떨어졌습니다. 지금 바로 롱 포지션을 청산하세요.",
        rotationTitle: "🔄 ROTATION: YIELD MAXIMIZATION",
        rotationDesc: "현재 보유 중인 AVGO는 MSFT와 비교했을 때 기회비용이 높습니다. 자본을 재배분하면 수학적으로 훨씬 유리한 기댓값을 확보할 수 있습니다.",
        shares: "SHARES",
        weight: "WEIGHT",
        livePrice: "LIVE PRICE",
        allocatedCap: "ALLOCATED CAP",
        grade: "GRADE",
        ticker: "TICKER",
        held: "보유량",
        adjustment: "조절 수량",
        rebalanceAligned: "최적화 완료",
        actionBuy: "매수 +{shares}주",
        actionTrim: "축소 -{shares}주",
        realAssetStatus: "실시간 자산 총평가액 / P&L 트래커 HUD",
        totalEvaluated: "자산 총평가액",
        totalGainLoss: "통산 손익 (P&L)",
        quickAddTitle: "실보유량 즉시 입력 모달",
        quickAddPrice: "평균 매수단가 ($)",
        quickAddQty: "보유 수량 (주)",
        quickAddSubmit: "포트폴리오에 즉시 반영",
        noDecayStatus: "✅ 모든 보유 종목의 알파 기대치 점수가 안전 임계치(50점 이상)를 상회하고 있습니다.",
        noHoldingsTitle: "🚨 보유 종목이 없습니다. 즉시 보유 종목을 추가하여 알파 엔진과 실시간 포트폴리오 관리를 연동하세요.",
        batchInjectBtn: "최적 포트폴리오 일괄 구성 (BATCH BUY)",
        batchInjectSuccess: "최적 배분 포트폴리오가 실제 계좌에 일괄 반영되었습니다!",
        liquidateBtn: "즉시 포지션 청산 (LIQUIDATE)",
        executeRotationBtn: "최적화 교체 자동 매매 실행 (ROTATE)",
        tradingCapitalLabel: "투자 원금",
        cashLabel: "보유 현금",
        totalReturnLabel: "종합 통산 수익 (P&L)",
        navLabel: "실시간 총 평가자산 (NAV)"
    },
    en: {
        autopilotTitle: "AUTONOMOUS ALLOCATION MATRIX (ZERO-BIAS)",
        autopilotDesc: "Mathematical portfolio construction based on Kelly Expectancy & Inverse Volatility Risk Parity",
        guideTitle: "💡 3-Step Beginner's Guide to Autopilot Execution",
        guide1Title: "Step 1. Set Capital & Verify Weights",
        guide1Desc: "Enter your total trading capital in USD in the left panel. The recommended execution shares will adjust automatically based on weights.",
        guide2Title: "Step 2. Copy Guide Text",
        guide2Desc: "Click the [COPY ALLOCATION MATRIX] button at the top-right to copy the complete order instructions designed for brokerage apps.",
        guide3Title: "Step 3. Brokerage Order Execution",
        guide3Desc: "Open your brokerage app, place a 'Limit Buy' order as advised, and immediately register 'Stop Loss (SL)' and 'Take Profit (TP)' bracket orders.",
        copyBtn: "COPY ALLOCATION MATRIX",
        copyBtnCopied: "PORTFOLIO COPIED!",
        copyBracket: "COPY ORDER BRACKET",
        copyBracketCopied: "BRACKET COPIED!",
        analyzing: "Analyzing order flow metrics...",
        neutral: "NEUTRAL OBSERVATION",
        strongBuy: "🔥 HIGH-CONVICTION PROPRIETARY BUY",
        callBuy: "⚡ ACCUMULATION CALL ENTRY",
        putShort: "💀 PROPRIETARY SHORT / PUT ENTRY",
        avoidLong: "⚠️ DEGRADED DRIFT - AVOID LONG",
        expectedBands: "EXPECTED BANDS (ENTRY / SL / TP)",
        liveGap: "LIVE GAP",
        optimalRange: "Optimal Buy Limit Range",
        riskReward: "R:R",
        optimalWeights: "Optimal Portfolio Weights",
        dynamicAlert: "Dynamic Rotation Alert",
        scoreDecayTitle: "🚨 LIQUIDATION SIGNAL: SCORE DECAY",
        scoreDecayDesc: "Alpha score expectancy for active positions TSLA (38) and RKLB (33) has drifted below the risk-adjusted limit of 50. Liquidate long exposure immediately.",
        rotationTitle: "🔄 ROTATION: YIELD MAXIMIZATION",
        rotationDesc: "Active holding AVGO presents higher opportunity cost compared to MSFT. Reallocating capital yields mathematically superior expectations.",
        shares: "SHARES",
        weight: "WEIGHT",
        livePrice: "LIVE PRICE",
        allocatedCap: "ALLOCATED CAP",
        grade: "GRADE",
        ticker: "TICKER",
        held: "HELD",
        adjustment: "ADJUSTMENT",
        rebalanceAligned: "ALIGNED",
        actionBuy: "BUY +{shares}",
        actionTrim: "TRIM -{shares}",
        realAssetStatus: "LIVE NET ASSET VALUE & P&L TRACKER HUD",
        totalEvaluated: "NAV Value",
        totalGainLoss: "Total Profit/Loss",
        quickAddTitle: "Quick Live Holdings Injector",
        quickAddPrice: "Avg Entry Price (USD)",
        quickAddQty: "Quantity (Shares)",
        quickAddSubmit: "Inject to Real Portfolio",
        noDecayStatus: "✅ All active holdings remain risk-adjusted with alpha expectation scores above 50.",
        noHoldingsTitle: "🚨 No active holdings found in your real portfolio. Inject tickers now to engage live tracking.",
        batchInjectBtn: "BATCH INJECT ALLOCATION",
        batchInjectSuccess: "Optimal allocations injected successfully!",
        liquidateBtn: "LIQUIDATE POSITION",
        executeRotationBtn: "EXECUTE ROTATION",
        tradingCapitalLabel: "TRADING CAPITAL",
        cashLabel: "CASH BALANCE",
        totalReturnLabel: "TOTAL RETURN (P&L)",
        navLabel: "NET ASSET VALUE (NAV)"
    },
    ja: {
        autopilotTitle: "自律型アロケーションマトリクス (ゼロバイアス・モデル)",
        autopilotDesc: "ケリー期待値および逆ボラティリティ・リスクパリティに基づく数学的ポートフォリオ構築",
        guideTitle: "💡 初心者のためのオートパイロット実戦注文3ステップガイド",
        guide1Title: "ステップ1. 投資資金の設定と比率確認",
        guide1Desc: "左側のパネルで総投資資金をドル($)単位で入力すると、各銘柄の比率(Weight)に合わせて推奨購入数量(Shares)が自動計算されます。",
        guide2Title: "ステップ2. ガイドテキストをコピー",
        guide2Desc: "右上の [COPY ALLOCATION MATRIX] ボタンをクリックして、証券会社のアプリを見ながらそのまま入力できる注文ガイドをコピーします。",
        guide3Title: "ステップ3. 証券口座での注文設定",
        guide3Desc: "証券アプリを開き、案内通りに「指値(Limit)買い」を入れた後、「逆指値・損切り(SL)」および「利食い(TP)」の予約注文を登録すれば完了です。",
        copyBtn: "アロケーションマトリクスをコピー",
        copyBtnCopied: "ポートフォリオがコピーされました！",
        copyBracket: "注文ブラケットをコピー",
        copyBracketCopied: "ブラケットがコピーされました！",
        analyzing: "需給指標を分析中...",
        neutral: "中立観測 (NEUTRAL OBSERVATION)",
        strongBuy: "🔥 強気買い推奨 (HIGH-CONVICTION BUY)",
        callBuy: "⚡ コール買いエントリー (ACCUMULATION CALL)",
        putShort: "💀 プット/ショート推奨 (PROPRIETARY SHORT)",
        avoidLong: "⚠️ ドリフト低下 - ロング回避 (AVOID LONG)",
        expectedBands: "想定レンジ (ENTRY / SL / TP)",
        liveGap: "LIVE GAP",
        optimalRange: "適正指値レンジ (Optimal Range)",
        riskReward: "R:R比率",
        optimalWeights: "最適ポートフォリオ比率",
        dynamicAlert: "動的ローテーションアラート",
        scoreDecayTitle: "🚨 ポジション清算シグナル: スコア減衰",
        scoreDecayDesc: "保有中ポジション TSLA (38) および RKLB (33) のアルファ期待スコアが許容基準値の 50 を下回りました。ロングエクスポージャーを直ちに解消してください。",
        rotationTitle: "🔄 ローテーション: 利回り最大化",
        rotationDesc: "保有中の AVGO は MSFT に対し機会費用が上昇しています。資本を再配分することで数学的に優れた期待収益率を確保できます。",
        shares: "株数 (SHARES)",
        weight: "比率 (WEIGHT)",
        livePrice: "現在値 (LIVE PRICE)",
        allocatedCap: "割当資金 (CAP)",
        grade: "評価 (GRADE)",
        ticker: "ティッカー (TICKER)",
        held: "保有数",
        adjustment: "リバランス",
        rebalanceAligned: "最適化完了",
        actionBuy: "買い +{shares}株",
        actionTrim: "売却 -{shares}株",
        realAssetStatus: "リアル資産総評価額 & 損益(P&L)トラッカー HUD",
        totalEvaluated: "資産総評価額",
        totalGainLoss: "通算損益 (P&L)",
        quickAddTitle: "実保有量のクイック登録",
        quickAddPrice: "平均取得単価 (USD)",
        quickAddQty: "保有株数 (株)",
        quickAddSubmit: "ポートフォリオに反映",
        noDecayStatus: "✅ すべての保有銘柄のアルファ期待スコアは安全基準値(50以上)を維持しています。",
        noHoldingsTitle: "🚨 保有銘柄がありません。オートパイロット推奨比率に基づいて構築してください。",
        batchInjectBtn: "推奨配分一括発注 (BATCH BUY)",
        batchInjectSuccess: "推奨ポートフォリオ配分が正常に適用されました！",
        liquidateBtn: "ポジション即時清算 (LIQUIDATE)",
        executeRotationBtn: "最適配分入替自動実行 (ROTATE)",
        tradingCapitalLabel: "投資元本",
        cashLabel: "保有キャッシュ",
        totalReturnLabel: "総合損益 (P&L)",
        navLabel: "純資産価値 (NAV)"
    }
};

interface TickerData {
    ticker: string;
    timestamp: number;
    rsi: number | null;
    return3d: number | null;
    sparkline: number[];
    maxPain: number | null;
    gex: number | null;
    gexM: number | null;
    pcr: number | null;
    callWall: number | null;
    putFloor: number | null;
    gammaFlipLevel: number | null;
    squeezeScore: number | null;
    iv: number | null;
    whaleIndex: number;
    whaleConfidence: string;
    darkPoolPct: number;
    alphaSnapshot?: {
        score: number;
        grade: string;
        action: string;
        actionKR?: string;
        whyKR?: string;
        why?: string;
        whyJA?: string;
        confidence: number;
        triggers: string[];
        pillars?: {
            momentum: number;
            structure: number;
            flow: number;
            regime: number;
            catalyst: number;
        };
        gatesApplied?: string[];
        engineVersion?: string;
    };
    realtime?: {
        price: number;
        changePct: number;
        prevClose: number;
        vwap: number | null;
        volume: number;
    };
}

const TickerLogo = ({ ticker, className = "w-5 h-5" }: { ticker: string, className?: string }) => {
    const [imgSrc, setImgSrc] = useState(`/api/logo/${ticker.toUpperCase()}`);
    const [hasError, setHasError] = useState(false);

    return (
        <div className={`relative ${className} rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 shadow-inner group-hover:border-cyan-500/30 transition-colors`}>
            {!hasError ? (
                <img 
                    src={imgSrc} 
                    alt={ticker}
                    className="w-full h-full object-contain"
                    onError={() => {
                        if (imgSrc.startsWith('/api/logo/')) {
                            setImgSrc(`https://images.financialmodelingprep.com/symbol/${ticker.toUpperCase()}.png`);
                        } else {
                            setHasError(true);
                        }
                    }}
                />
            ) : (
                <span className="text-[9px] font-black text-slate-500 uppercase">{ticker.slice(0, 2)}</span>
            )}
        </div>
    );
};

export function QuantRadarClient() {
    const t = useTranslations();
    const locale = useLocale();
    const dict = radarI18n[locale] || radarI18n.en;

    // 1. Enforce Admin Security Lock using Tier Context
    const { isAdmin, loading: tierLoading } = useTier();

    // 1.1 Radar-only holdings (localStorage, independent of main Portfolio)
    const { holdings, summary, addHolding, removeHolding, updateQuantity, journal, journalStats, cumulativeRealizedPnl, recordSnapshot, getSnapshots, reloadFromStorage } = useRadarHoldings();

    // Quick Add Modal States
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [scannerCollapsed, setScannerCollapsed] = useState(true);
    const [isInjecting, setIsInjecting] = useState(false);

    const handleBatchInject = () => {
        if (tickers.length === 0) return;
        for (const item of tickers) {
            const targetShares = (item as any).targetShares || 0;
            const exec = (item as any).execution || {};
            const avgPrice = exec.entry || item.realtime?.price || 0;
            if (targetShares > 0 && avgPrice > 0) {
                addHolding({
                    ticker: item.ticker.toUpperCase(),
                    name: `${item.ticker.toUpperCase()} Asset`,
                    quantity: targetShares,
                    avgPrice: avgPrice,
                });
            }
        }
    };

    const handleLiquidate = (ticker: string) => {
        removeHolding(ticker);
    };

    const handleRotate = (lowestTicker: string, highestTicker: TickerData) => {
        removeHolding(lowestTicker);
        const targetShares = (highestTicker as any).targetShares || 0;
        const exec = (highestTicker as any).execution || {};
        const avgPrice = exec.entry || highestTicker.realtime?.price || 0;
        if (targetShares > 0 && avgPrice > 0) {
            addHolding({
                ticker: highestTicker.ticker.toUpperCase(),
                name: `${highestTicker.ticker.toUpperCase()} Asset`,
                quantity: targetShares,
                avgPrice: avgPrice,
            });
        }
    };
    const [quickAddTicker, setQuickAddTicker] = useState('');
    const [quickAddQty, setQuickAddQty] = useState('');
    const [quickAddPrice, setQuickAddPrice] = useState('');

    // Canvas radar sweep ref
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // States for search and filter API parameters
    const [scoreMin, setScoreMin] = useState(60);
    const [selectedGrades, setSelectedGrades] = useState<string[]>(['S', 'A', 'B']);
    const [selectedOverlay, setSelectedOverlay] = useState<string>(''); 
    const [searchQuery, setSearchQuery] = useState('');
    const [gexMin, setGexMin] = useState<number>(-10); 
    const [pcrMax, setPcrMax] = useState<number>(1.8);
    const [darkPoolMin, setDarkPoolMin] = useState<number>(0);
    const [isAutoPilot, setIsAutoPilot] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('radar_autopilot') === 'true';
    });
    const [totalCapital, setTotalCapital] = useState(() => {
        if (typeof window === 'undefined') return 50000;
        const saved = localStorage.getItem('radar_capital');
        return saved ? Number(saved) : 50000;
    });
    const [committedCapital, setCommittedCapital] = useState(() => {
        if (typeof window === 'undefined') return 50000;
        const saved = localStorage.getItem('radar_capital');
        return saved ? Number(saved) : 50000;
    });
    const [inputCurrency, setInputCurrency] = useState<'USD' | 'KRW'>('USD');
    const [rawCapitalInput, setRawCapitalInput] = useState(() => {
        if (typeof window === 'undefined') return '50000';
        const saved = localStorage.getItem('radar_capital');
        return saved || '50000';
    });
    const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
        const [showHistory, setShowHistory] = useState(false);
    const [scenarioName, setScenarioName] = useState('');
    const [activeScenario, setActiveScenario] = useState(() => {
        if (typeof window === 'undefined') return '';
        return localStorage.getItem('radar_active_scenario') || '';
    });
    const [scenarioList, setScenarioList] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];
        try { return Object.keys(JSON.parse(localStorage.getItem('radar_scenarios') || '{}')); } catch { return []; }
    });

    // Exchange rate from Redis (cron→Redis→API)
    const { data: fxData } = useSWR('/api/exchange-rates', (url: string) => fetch(url).then(r => r.json()), {
        refreshInterval: 60_000,
        dedupingInterval: 30_000,
    });
    const usdkrw = fxData?.usdkrw || null;

    // Auto-convert KRW→USD when exchange rate or input changes
    const handleCapitalInput = useCallback((value: string) => {
        setRawCapitalInput(value);
        const num = Number(value) || 0;
        if (inputCurrency === 'KRW' && usdkrw && usdkrw > 0) {
            setTotalCapital(Math.max(100, Math.round(num / usdkrw)));
        } else {
            setTotalCapital(Math.max(100, num));
        }
    }, [inputCurrency, usdkrw]);

    // Debounce: only commit capital to API after 800ms of no typing
    useEffect(() => {
        const timer = setTimeout(() => {
            setCommittedCapital(totalCapital);
        }, 800);
        return () => clearTimeout(timer);
    }, [totalCapital]);

    // Auto-persist capital + autopilot to localStorage
    useEffect(() => {
        localStorage.setItem('radar_capital', totalCapital.toString());
    }, [totalCapital]);

    useEffect(() => {
        localStorage.setItem('radar_autopilot', isAutoPilot.toString());
    }, [isAutoPilot]);

    // Auto-save active scenario on any holdings/capital change
    useEffect(() => {
        if (!activeScenario) return;
        const scenarios = JSON.parse(localStorage.getItem('radar_scenarios') || '{}');
        if (scenarios[activeScenario]) {
            scenarios[activeScenario] = {
                ...scenarios[activeScenario],
                holdings: JSON.parse(localStorage.getItem('radar_holdings') || '[]'),
                journal: JSON.parse(localStorage.getItem('radar_trade_journal') || '[]'),
                capital: totalCapital,
                isAutoPilot,
                updatedAt: new Date().toISOString(),
            };
            localStorage.setItem('radar_scenarios', JSON.stringify(scenarios));
        }
    }, [activeScenario, holdings, totalCapital, isAutoPilot]);

    // Re-convert when currency toggles
    useEffect(() => {
        if (inputCurrency === 'KRW' && usdkrw) {
            setRawCapitalInput(Math.round(totalCapital * usdkrw).toString());
        } else {
            setRawCapitalInput(totalCapital.toString());
        }
    }, [inputCurrency]);

    const [sortBy, setSortBy] = useState('score');
    const [sortOrder, setSortOrder] = useState('desc');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(12);

    // Dynamic data loading states
    const [isPending, startTransition] = useTransition();
    const [tickers, setTickers] = useState<TickerData[]>([]);
    const activeTickers = useMemo(() => tickers.map(t => t.ticker), [tickers]);
    const sortedTickers = useMemo(() => {
        if (isAutoPilot) {
            return [...tickers].sort((a, b) => ((b as any).weight || 0) - ((a as any).weight || 0));
        }
        return tickers;
    }, [tickers, isAutoPilot]);
    const { getPrice } = useRealtimeData(activeTickers);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    // Clipboard copy indicators
    const [copiedTicker, setCopiedTicker] = useState<string | null>(null);

    // V2 Trading Engine state
    const [driftAlerts, setDriftAlerts] = useState<any[]>([]);
    const [engineMeta, setEngineMeta] = useState<any>(null);

    // Sonar sweep rotation angle
    const sweepAngleRef = useRef(0);

    // Portfolio Tracker hook (must be before early returns)
    const _earlyStockCost = holdings.reduce((sum: number, h: any) => sum + (h.quantity * h.avgPrice), 0);
    const _earlyNAV = summary.totalValue + Math.max(0, totalCapital - _earlyStockCost);
    const { hwm, drawdownPct, dailyPnlPct, dailyStartNAV } = usePortfolioTracker(_earlyNAV, totalCapital);

    // ── NAV HISTORY for Compound Growth Curve ──
    const [navHistory, setNavHistory] = useState<{date: string, nav: number}[]>([]);
    
    useEffect(() => {
        if (totalCapital <= 0) return;
        const storageKey = `radar_nav_history_${totalCapital}`;
        try {
            const stored = localStorage.getItem(storageKey);
            const history: {date: string, nav: number}[] = stored ? JSON.parse(stored) : [];
            const today = new Date().toISOString().slice(0, 10);
            const lastEntry = history[history.length - 1];
            
            // Only update once per day or if NAV changed significantly
            if (!lastEntry || lastEntry.date !== today) {
                history.push({ date: today, nav: _earlyNAV });
            } else {
                lastEntry.nav = _earlyNAV; // Update today's entry
            }
            
            // Keep max 365 days
            const trimmed = history.slice(-365);
            localStorage.setItem(storageKey, JSON.stringify(trimmed));
            setNavHistory(trimmed);
        } catch { /* localStorage unavailable */ }
    }, [_earlyNAV, totalCapital]);

    // Canvas radar animation removed for performance (V2 redesign)

    const handleQuickAddSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!quickAddTicker || !quickAddQty || !quickAddPrice) return;
        addHolding({
            ticker: quickAddTicker.toUpperCase(),
            name: `${quickAddTicker.toUpperCase()} Asset`,
            quantity: Number(quickAddQty),
            avgPrice: Number(quickAddPrice),
        });
        setShowQuickAdd(false);
        setQuickAddTicker('');
        setQuickAddQty('');
        setQuickAddPrice('');
    };

    // Handle batch filtering API requests
    const fetchRadarData = () => {
        if (!isAdmin) return;
        if (tickers.length === 0) setLoading(true);
        const gradesParam = selectedGrades.join(',');
        
        const queryParams = new URLSearchParams(isAutoPilot ? {
            mode: 'auto',
            totalCapital: compoundCapital.toString(),
            // Wire holdings to server for drift/liquidation detection
            ...(holdings.length > 0 ? {
                holdings: holdings.map((h: any) => h.ticker.toUpperCase()).join(','),
                holdingsQty: holdings.map((h: any) => `${h.ticker.toUpperCase()}:${h.quantity}`).join(','),
            } : {})
        } : {
            scoreMin: scoreMin.toString(),
            grades: gradesParam,
            overlay: selectedOverlay,
            search: searchQuery,
            gexMin: gexMin.toString(),
            pcrMax: pcrMax.toString(),
            darkPoolMin: darkPoolMin.toString(),
            sortBy,
            sortOrder,
            page: page.toString(),
            pageSize: pageSize.toString()
        });

        startTransition(async () => {
            try {
                const res = await fetch(`/api/quant-radar?${queryParams.toString()}`);
                const data = await res.json();
                if (data.ok) {
                    setTickers(data.results || []);
                    setTotalCount(data.meta?.totalCount || 0);
                    setTotalPages(data.meta?.totalPages || 1);
                    // V2 engine fields
                    if (data.driftAlerts) setDriftAlerts(data.driftAlerts);
                    if (data.meta) setEngineMeta(data.meta);
                    // Push notifications for critical alerts
                    if (data.alerts?.liquidations?.length > 0) {
                        sendRadarAlert('📉 Liquidation Signal', data.alerts.liquidations.map((l: any) => l.ticker).join(', ') + ' — Score decay detected', 'liquidation');
                    }
                    if (data.driftAlerts?.length > 0) {
                        sendRadarAlert('⚠️ Rebalance Signal', data.driftAlerts.length + ' positions drifted beyond ±15%', 'drift');
                    }
                }
            } catch (e) {
                console.error('[QuantRadarClient] Failed to fetch metrics:', e);
            } finally {
                setLoading(false);
            }
        });
    };

    // Re-fetch data on parameters change
    useEffect(() => {
        fetchRadarData();
    }, [scoreMin, selectedGrades, selectedOverlay, sortBy, sortOrder, page, gexMin, pcrMax, darkPoolMin, isAdmin, isAutoPilot, committedCapital]);

    // Auto-refresh polling every 60s in autopilot mode
    useEffect(() => {
        if (!isAutoPilot || !isAdmin) return;
        const interval = setInterval(() => {
            fetchRadarData();
        }, 60_000);
        return () => clearInterval(interval);
    }, [isAutoPilot, isAdmin, committedCapital]);


    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchRadarData();
    };

    const toggleGrade = (grade: string) => {
        if (selectedGrades.includes(grade)) {
            setSelectedGrades(selectedGrades.filter(g => g !== grade));
        } else {
            setSelectedGrades([...selectedGrades, grade]);
        }
        setPage(1);
    };

    // One-click clipboard copy of the entire optimal allocation matrix (Localized)
    const copyEntireAllocationMatrixToClipboard = () => {
        let headerText = "";
        let stepsText = "";
        
        if (locale === 'ko') {
            headerText = `[시그넘 시큐리티 오토파일럿 자산 배분 포트폴리오 가이드]\n` +
                         `총 투자 원금 설정: $${totalCapital.toLocaleString()}\n` +
                         `기준일시: ${new Date().toLocaleString('ko-KR')}\n\n`;
            stepsText = `--------------------------------------------------\n` +
                        `★ 초보자를 위한 3단계 실전 주문 대입 방법 ★\n` +
                        `1. 증권사 소수점 투자 또는 해외주식 주문 메뉴를 켭니다.\n` +
                        `2. 아래 종목 목록을 보며 '지정가(Limit) 매수' 주문을 실행합니다.\n` +
                        `3. 매수 후 반드시 손절가(SL)와 익절가(TP)를 예약 주문으로 설정하세요.\n` +
                        `--------------------------------------------------\n\n`;
        } else if (locale === 'ja') {
            headerText = `[SIGNUM SECURITY オートパイロット資産配分ポートフォリオガイド]\n` +
                         `総投資資金設定: $${totalCapital.toLocaleString()}\n` +
                         `基準日時: ${new Date().toLocaleString('ja-JP')}\n\n`;
            stepsText = `--------------------------------------------------\n` +
                        `★ 初心者のための3ステップ実戦注文方法 ★\n` +
                        `1. 証券アプリの小数株投資または海外株式注文メニューを開きます。\n` +
                        `2. 以下の銘柄リストを見ながら「指値(Limit)買い」注文を実行します。\n` +
                        `3. 購入後、必ず逆指値・損切り(SL)と利食い(TP)の予約注文を設定してください。\n` +
                        `--------------------------------------------------\n\n`;
        } else {
            headerText = `[SIGNUM SECURITY AUTOPILOT PORTFOLIO ALLOCATION GUIDE]\n` +
                         `Total Capital Base: $${totalCapital.toLocaleString()}\n` +
                         `Timestamp: ${new Date().toLocaleString('en-US')}\n\n`;
            stepsText = `--------------------------------------------------\n` +
                        `★ 3-Step Execution Guide for Beginners ★\n` +
                        `1. Open your brokerage app or fractional trading menu.\n` +
                        `2. Submit a 'Limit Buy' order based on the list below.\n` +
                        `3. Set 'Stop Loss (SL)' and 'Take Profit (TP)' bracket orders immediately.\n` +
                        `--------------------------------------------------\n\n`;
        }

        const tickersText = sortedTickers.map((item, i) => {
            const weightPct = (((item as any).weight || 0) * 100).toFixed(1);
            const cap = (item as any).allocatedCapital || 0;
            const shares = (item as any).targetShares || 0;
            const exec = (item as any).execution || {};
            const entryVal = exec.entry || item.realtime?.price || 0;
            
            if (locale === 'ko') {
                return `${i+1}. 종목: [${item.ticker}] (배분 비중: ${weightPct}%)\n` +
                       `   - 배분 투자금: $${cap.toLocaleString(undefined, {maximumFractionDigits:0})}\n` +
                       `   - 추천 매수수량: ${shares}주\n` +
                       `   - 지정가 매수가격: $${entryVal.toFixed(2)} 이하\n` +
                       `   - [주문 예약] 익절 예약가격 (TP): $${(exec.takeProfit || 0).toFixed(2)}\n` +
                       `   - [주문 예약] 손절 예약가격 (SL): $${(exec.stopLoss || 0).toFixed(2)}\n` +
                       `   - 리스크 대비 보상비 (R:R Ratio): ${exec.riskRewardRatio || '2.00'}`;
            } else if (locale === 'ja') {
                return `${i+1}. 銘柄: [${item.ticker}] (配分比率: ${weightPct}%)\n` +
                       `   - 割当資金: $${cap.toLocaleString(undefined, {maximumFractionDigits:0})}\n` +
                       `   - 推奨購入株数: ${shares}株\n` +
                       `   - 指値購入価格: $${entryVal.toFixed(2)} 以下\n` +
                       `   - [予約注文] 利食い注文価格 (TP): $${(exec.takeProfit || 0).toFixed(2)}\n` +
                       `   - [予約注文] 損切り注文価格 (SL): $${(exec.stopLoss || 0).toFixed(2)}\n` +
                       `   - リスク・リワード比率 (R:R Ratio): ${exec.riskRewardRatio || '2.00'}`;
            } else {
                return `${i+1}. Ticker: [${item.ticker}] (Allocation: ${weightPct}%)\n` +
                       `   - Allocated Capital: $${cap.toLocaleString(undefined, {maximumFractionDigits:0})}\n` +
                       `   - Target Shares: ${shares} shares\n` +
                       `   - Limit Entry Price: $${entryVal.toFixed(2)} or lower\n` +
                       `   - [Bracket Order] Take Profit (TP): $${(exec.takeProfit || 0).toFixed(2)}\n` +
                       `   - [Bracket Order] Stop Loss (SL): $${(exec.stopLoss || 0).toFixed(2)}\n` +
                       `   - Risk-Reward Ratio (R:R): ${exec.riskRewardRatio || '2.00'}`;
            }
        }).join('\n\n') + `\n\nGenerated strictly on zero-bias expectation models.`;
        
        navigator.clipboard.writeText(headerText + stepsText + tickersText).then(() => {
            setCopiedTicker("PORTFOLIO");
            setTimeout(() => setCopiedTicker(null), 1500);
        });
    };

    // One-click clipboard copy utility for bracket orders (Localized)
    const copyBracketToClipboard = (item: TickerData, entryPrice: number, tp: number, sl: number) => {
        const score = item.alphaSnapshot?.score || 50;
        const grade = item.alphaSnapshot?.grade || 'B';
        
        let text = "";
        if (locale === 'ko') {
            text = `[시그넘 ${item.ticker} 초보자 맞춤형 주문 가이드]\n` +
                `1. 매수 종목: ${item.ticker}\n` +
                `2. 주문 구분: 지정가 매수 (Limit Order)\n` +
                `3. 매수 지정가격: $${entryPrice.toFixed(2)} 이하\n` +
                `4. 익절 예약 가격 (Take Profit): $${tp.toFixed(2)} (+3.5%)\n` +
                `5. 손절 예약 가격 (Stop Loss): $${sl.toFixed(2)} (-1.5%)\n` +
                `6. 오토 스코어: ${score}점 (Alpha Grade: ${grade})`;
        } else if (locale === 'ja') {
            text = `[SIGNUM ${item.ticker} 初心者向け注文ガイド]\n` +
                `1. 購入銘柄: ${item.ticker}\n` +
                `2. 注文区分: 指値買い (Limit Order)\n` +
                `3. 指値購入価格: $${entryPrice.toFixed(2)} 以下\n` +
                `4. 利食い予約価格 (Take Profit): $${tp.toFixed(2)} (+3.5%)\n` +
                `5. 損切り予約価格 (Stop Loss): $${sl.toFixed(2)} (-1.5%)\n` +
                `6. オートスコア: ${score}点 (Alpha Grade: ${grade})`;
        } else {
            text = `[SIGNUM ${item.ticker} Beginner Order Guide]\n` +
                `1. Target Ticker: ${item.ticker}\n` +
                `2. Order Type: Limit Buy (Limit Order)\n` +
                `3. Limit Purchase Price: $${entryPrice.toFixed(2)} or lower\n` +
                `4. Take Profit (TP): $${tp.toFixed(2)} (+3.5%)\n` +
                `5. Stop Loss (SL): $${sl.toFixed(2)} (-1.5%)\n` +
                `6. Auto Score: ${score} pts (Alpha Grade: ${grade})`;
        }
        
        navigator.clipboard.writeText(text).then(() => {
            setCopiedTicker(item.ticker);
            setTimeout(() => setCopiedTicker(null), 1500);
        });
    };

    // ────────────────────────────────────────────────────────
    // A. SECURITY LOCK SCREEN FOR STANDARD/GUEST USERS
    // ────────────────────────────────────────────────────────
    if (tierLoading) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center gap-4">
                <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Checking credentials...</p>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center px-4 relative overflow-hidden">
                {/* Cyber lockout grids */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
                <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[350px] h-[350px] rounded-full bg-rose-500/5 blur-[100px] pointer-events-none" />

                <div className="max-w-md w-full p-8 rounded-3xl bg-[#0b0f19]/90 border border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.05)] backdrop-blur-xl relative z-10 flex flex-col items-center text-center gap-6">
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 animate-pulse">
                        <Lock className="w-8 h-8" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <h2 className="text-sm font-black text-rose-400 tracking-widest uppercase">PROPRIETARY TRADING LOCK</h2>
                        <h1 className="text-xl font-black text-white tracking-tight leading-tight">ADMIN SECURITY VERIFICATION</h1>
                        <p className="text-[13px] text-slate-400 leading-relaxed mt-2">
                            This cockpit is locked for general visitors. Access is exclusive to the fund administrator for actual real-time proprietary trading.
                        </p>
                    </div>

                    <div className="w-full p-4.5 rounded-2xl bg-slate-950/60 border border-slate-900 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-slate-500 shrink-0" />
                        <span className="text-[13px] font-mono text-slate-500 text-left leading-relaxed">
                            To unlock, please authenticate under your registered operator email in settings.
                        </span>
                    </div>

                    <Link href="/" className="px-6 h-11 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white transition-all text-[13px] font-bold text-slate-400 flex items-center justify-center uppercase tracking-wider w-full">
                        Return to Main Page
                    </Link>
                </div>
            </div>
        );
    }

    // Computed Portfolio NAV with Cash — uses live prices from WebSocket
    const totalStockCost = holdings.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
    const liveStockValue = holdings.reduce((sum, h) => {
        const wsPriceObj = getPrice(h.ticker);
        const livePrice = wsPriceObj ? wsPriceObj.price : h.avgPrice;
        return sum + (h.quantity * livePrice);
    }, 0);
    const cashBalance = Math.max(0, totalCapital - totalStockCost);
    const computedTotalNAV = liveStockValue + cashBalance;
    const computedPL = computedTotalNAV - totalCapital;
    const computedPLPct = totalCapital > 0 ? (computedPL / totalCapital) * 100 : 0;

    // ── COMPOUND GROWTH: NAV-based Capital for allocation engine ──
    // When holdings exist and NAV > 0, use NAV as the capital base for next allocation
    // This is the core compound growth loop: profits are automatically reinvested
    const compoundCapital = useMemo(() => {
        if (holdings.length > 0 && computedTotalNAV > 0) {
            return computedTotalNAV; // ✅ Compound: NAV includes unrealized gains
        }
        return totalCapital; // No holdings = use user input
    }, [holdings.length, computedTotalNAV, totalCapital]);

    // Record daily compound snapshot
    useEffect(() => {
        if (computedTotalNAV > 0 && totalCapital > 0) {
            recordSnapshot(computedTotalNAV, totalCapital);
        }
    }, [computedTotalNAV, totalCapital]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── LIVE POSITION MONITORING ENGINE ──────────────────────


    // Circuit Breaker evaluation (runs every render when holdings update)
    const circuitBreakerResult: CircuitBreakerResult = useMemo(() => {
        if (!isAutoPilot || holdings.length === 0) {
            return { triggered: false, level: 'NONE' as const, message: '', actions: [] };
        }
        const positions = holdings.map((h: any) => {
            const wsPriceObj = getPrice(h.ticker);
            const livePrice = wsPriceObj ? wsPriceObj.price : (h.currentPrice || h.avgPrice || 0);
            return {
                ticker: h.ticker,
                costBasis: h.quantity * h.avgPrice,
                currentValue: h.quantity * livePrice,
            };
        });
        return evaluateCircuitBreaker(computedTotalNAV, hwm, dailyStartNAV, positions, undefined, locale);
    }, [isAutoPilot, holdings, computedTotalNAV, hwm, dailyStartNAV, getPrice, locale]);

    // Per-position live status (SL/TP hit detection, P&L, signal)
    const livePositionStatus = useMemo(() => {
        if (!isAutoPilot || holdings.length === 0) return [];
        return holdings.map((h: any) => {
            const wsPriceObj = getPrice(h.ticker);
            const livePrice = wsPriceObj ? wsPriceObj.price : (h.currentPrice || h.avgPrice || 0);
            const pnl = (livePrice - h.avgPrice) * h.quantity;
            const pnlPct = h.avgPrice > 0 ? ((livePrice - h.avgPrice) / h.avgPrice) * 100 : 0;
            const radarMatch = tickers.find((t: any) => t.ticker.toUpperCase() === h.ticker.toUpperCase());
            const score = radarMatch?.alphaSnapshot?.score || 50;
            const grade = radarMatch?.alphaSnapshot?.grade || 'C';
            const targetWeight = radarMatch ? ((radarMatch as any).weight || 0) * 100 : 0;
            const exec = radarMatch ? ((radarMatch as any).execution || {}) : {};
            const entryPrice = exec.entry || h.avgPrice;
            const tpPrice = exec.takeProfit || entryPrice * 1.035;
            const slPrice = exec.stopLoss || entryPrice * 0.985;
            const tpHit = livePrice >= tpPrice;
            const slHit = livePrice <= slPrice;
            let signal: 'HOLD' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'DECAY' | 'ACCUMULATE' = 'HOLD';
            if (slHit) signal = 'STOP_LOSS';
            else if (tpHit) signal = 'TAKE_PROFIT';
            else if (score < 40) signal = 'DECAY';
            else if (score >= 70 && pnlPct > -5) signal = 'ACCUMULATE';
            return { ticker: h.ticker, quantity: h.quantity, avgPrice: h.avgPrice, livePrice, pnl, pnlPct, score, grade, targetWeight, tpPrice, slPrice, tpHit, slHit, signal };
        }).sort((a, b) => {
            const priority: Record<string, number> = { STOP_LOSS: 0, DECAY: 1, TAKE_PROFIT: 2, ACCUMULATE: 3, HOLD: 4 };
            return (priority[a.signal] || 4) - (priority[b.signal] || 4);
        });
    }, [isAutoPilot, holdings, tickers, getPrice]);

    // Browser notifications for critical position events
    useEffect(() => {
        if (!isAutoPilot) return;
        livePositionStatus.forEach(pos => {
            if (pos.slHit) sendRadarAlert(`🔴 SL HIT: ${pos.ticker}`, `$${pos.livePrice.toFixed(2)} hit SL $${pos.slPrice.toFixed(2)}`, `sl-${pos.ticker}`);
            if (pos.tpHit) sendRadarAlert(`🟢 TP HIT: ${pos.ticker}`, `$${pos.livePrice.toFixed(2)} hit TP $${pos.tpPrice.toFixed(2)}`, `tp-${pos.ticker}`);
        });
        if (circuitBreakerResult.triggered && circuitBreakerResult.level === 'HALT') {
            sendRadarAlert('🚨 CIRCUIT BREAKER', circuitBreakerResult.message, 'circuit-breaker');
        }
    }, [livePositionStatus, circuitBreakerResult, isAutoPilot]);

    // Real-time mathematically exact alignment progress between actual holdings and target weights
    const liveAlignmentProgress = useMemo(() => {
        if (tickers.length === 0) return 0;
        
        let totalDiff = 0;
        const targetMap: Record<string, number> = {};
        tickers.forEach(t => {
            targetMap[t.ticker.toUpperCase()] = (t as any).weight || 0;
        });
        
        const allTickers = new Set<string>([
            ...tickers.map(t => t.ticker.toUpperCase()),
            ...holdings.map(h => h.ticker.toUpperCase())
        ]);
        
        const totalNAV = computedTotalNAV || totalCapital;
        
        allTickers.forEach(ticker => {
            const targetW = targetMap[ticker] || 0;
            const heldObj = holdings.find(h => h.ticker.toUpperCase() === ticker);
            const wsPriceObj = getPrice(ticker);
            const livePrice = wsPriceObj ? wsPriceObj.price : (heldObj?.avgPrice || 0);
            const actualVal = heldObj ? (heldObj.quantity * livePrice) : 0;
            const actualW = totalNAV > 0 ? (actualVal / totalNAV) : 0;
            
            totalDiff += Math.abs(targetW - actualW);
        });
        
        // Alignment is maximum 100%, penalizing distance from optimal
        const alignment = Math.max(0, Math.min(100, (1 - (totalDiff / 2)) * 100));
        return parseFloat(alignment.toFixed(1));
    }, [tickers, holdings, computedTotalNAV, totalCapital, getPrice]);

    // Mechanical execution sequence (priority score descending)
    const executionSequence = useMemo(() => {
        return sortedTickers
            .map(item => {
                const targetShares = (item as any).targetShares || 0;
                const heldObj = holdings.find(h => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                const heldQty = heldObj ? heldObj.quantity : 0;
                const diffQty = targetShares - heldQty;
                const exec = (item as any).execution || {};
                const score = item.alphaSnapshot?.score || 50;
                const wsPriceObj = getPrice(item.ticker);
                const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                return {
                    ticker: item.ticker,
                    diffQty,
                    entry: exec.entry || livePrice || 0,
                    stopLoss: exec.stopLoss || 0,
                    takeProfit: exec.takeProfit || 0,
                    score
                };
            })
            .filter(item => item.diffQty > 0)
            .sort((a, b) => b.score - a.score);
    }, [sortedTickers, holdings, getPrice]);

    // ────────────────────────────────────────────────────────
    // B. AUTHORIZED ADMIN QUANT COCKPIT
    // ────────────────────────────────────────────────────────
    return (
        <div className="w-full min-h-screen bg-[#0A0F1E] bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,#111827_0%,#0A0F1E_100%)] text-slate-100 flex flex-col font-[family-name:var(--font-inter)] relative overflow-hidden">
            {/* Ambient lights (subtle) */}
            <div className="absolute top-[-300px] left-[-300px] w-[600px] h-[600px] rounded-full bg-sky-500/[0.03] blur-[150px] pointer-events-none" />
            <div className="absolute bottom-[-300px] right-[-300px] w-[600px] h-[600px] rounded-full bg-emerald-500/[0.02] blur-[150px] pointer-events-none" />

            {/* RADAR WORKSPACE ROW */}
            <div className="flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 py-6 flex flex-col xl:flex-row gap-6 relative z-10">
                
                {/* SIDEBAR: DIY Screener Console — HIDDEN in Auto-Pilot */}
                {!isAutoPilot && (
                <div className="w-full xl:w-80 shrink-0 flex flex-col gap-6">
                    {/* Header Panel */}
                    <div className="p-4 rounded-xl bg-[#111827]/80 backdrop-blur-sm border border-white/5">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                                <Radar className="w-5 h-5 text-sky-400" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-slate-100 tracking-wide">QUANT RADAR</div>
                                <div className="text-[13px] text-slate-300 font-medium">V2 Engine • Kelly-RP</div>
                            </div>
                        </div>
                    </div>

                    {/* DIY Filter controls */}
                    <div className="p-5 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex flex-col gap-5">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <span className="text-[13px] font-bold text-white tracking-widest uppercase flex items-center gap-2">
                                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                                PARAMETERS
                            </span>
                            <span className="text-[13px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/30 border border-emerald-500/20 font-black">
                                {totalCount} MONITORED
                            </span>
                        </div>

                        {/* Auto-Pilot Toggle Control */}
                        <div className="p-3.5 rounded-xl bg-cyan-950/15 border border-cyan-500/20 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-black tracking-wider text-cyan-400 uppercase flex items-center gap-1.5 animate-pulse">
                                    <Zap className="w-3 h-3" />
                                    AUTO-PILOT ENGINE
                                </span>
                                <button 
                                    onClick={() => { 
                                        const newState = !isAutoPilot;
                                        setIsAutoPilot(newState); 
                                        setPage(1);
                                        if (newState) requestNotificationPermission();
                                    }}
                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                                        isAutoPilot ? 'bg-cyan-500' : 'bg-slate-800'
                                    }`}
                                >
                                    <span 
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            isAutoPilot ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                            
                            {isAutoPilot && (
                                <div className="flex flex-col gap-2 pt-2 border-t border-sky-500/10">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[13px] font-bold text-slate-200 font-[family-name:var(--font-inter)]">Trading Capital</label>
                                        {usdkrw && (
                                            <button
                                                onClick={() => setInputCurrency(c => c === 'USD' ? 'KRW' : 'USD')}
                                                className={`text-[13px] font-bold px-2 py-0.5 rounded-md border transition-all font-[family-name:var(--font-jetbrains)] ${
                                                    inputCurrency === 'KRW'
                                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                        : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                                }`}
                                            >
                                                {inputCurrency}
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400 font-[family-name:var(--font-jetbrains)] font-bold text-[13px]">
                                            {inputCurrency === 'KRW' ? '₩' : '$'}
                                        </span>
                                        <input 
                                            type="number"
                                            value={rawCapitalInput}
                                            onChange={(e) => handleCapitalInput(e.target.value)}
                                            className="w-full pl-7 pr-3 h-9 bg-[#111827]/80 border border-sky-500/20 focus:border-sky-400/50 transition-all outline-none rounded-lg text-[13px] font-[family-name:var(--font-jetbrains)] font-bold text-slate-100"
                                        />
                                    </div>
                                    {inputCurrency === 'KRW' && usdkrw && (
                                        <div className="text-[13px] text-slate-300 font-[family-name:var(--font-jetbrains)] tabular-nums">
                                            ≈ ${totalCapital.toLocaleString()} USD
                                            <span className="text-slate-400 ml-1">(₩{usdkrw.toLocaleString(undefined, {maximumFractionDigits: 0})}/$1)</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Manual sliders and filters wrapper */}
                        <div className={`flex flex-col gap-5 relative transition-all duration-300 ${isAutoPilot ? 'opacity-25 pointer-events-none select-none filter blur-[0.5px]' : ''}`}>
                            {isAutoPilot && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#070b13]/10 backdrop-blur-[0.5px]">
                                    <div className="px-2.5 py-1 rounded border border-cyan-500/30 bg-slate-950/90 text-[13px] font-mono tracking-widest font-black text-cyan-400 uppercase">
                                        AUTO LOCK ACTIVE
                                    </div>
                                </div>
                            )}

                            {/* Search Ticker */}
                            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-1.5">
                                <label className="text-[13px] font-bold tracking-widest text-slate-400 uppercase">Ticker Query</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input 
                                        type="text" 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="e.g. NVDA, TSLA"
                                        className="w-full pl-9 pr-3 h-10 bg-slate-950/60 border border-slate-800 focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(34,211,238,0.1)] transition-all outline-none rounded-xl text-[13px] font-bold uppercase tracking-wider text-white"
                                    />
                                </div>
                            </form>

                            {/* Context Score Minimum */}
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[13px] font-bold text-slate-400 uppercase tracking-widest">
                                    <span>Score Min Threshold</span>
                                    <span className="text-cyan-400 font-black font-mono text-[13px]">{scoreMin}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="20" 
                                    max="95" 
                                    value={scoreMin}
                                    onChange={(e) => { setScoreMin(Number(e.target.value)); setPage(1); }}
                                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                />
                            </div>

                            {/* Grade selection pills */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[13px] font-bold tracking-widest text-slate-400 uppercase">Target Alpha Grades</label>
                                <div className="grid grid-cols-6 gap-1">
                                    {['S', 'A', 'B', 'C', 'D', 'F'].map(g => {
                                        const active = selectedGrades.includes(g);
                                        return (
                                            <button
                                                key={g}
                                                onClick={() => toggleGrade(g)}
                                                className={`h-7 rounded-lg text-[13px] font-black transition-all ${
                                                    active 
                                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                                                        : 'bg-slate-950/40 text-slate-500 border border-slate-900 hover:text-slate-400'
                                                }`}
                                            >
                                                {g}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Technical overlay toggles */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[13px] font-bold tracking-widest text-slate-400 uppercase">Statistical Overlays</label>
                                <div className="flex flex-col gap-1">
                                    {[
                                        { value: '', label: 'All Indicators' },
                                        { value: 'extreme_oversold', label: '🔥 RSI Extreme Oversold (RSI < 25)' },
                                        { value: 'fear_resolution', label: '⚡ Fear Resolution (QQQ Panic Drop)' },
                                        { value: 'r_mode', label: '🔄 Regime: R-Mode Recovery' },
                                        { value: 'whale', label: '🐳 Institutional Whale flow (>= 65)' },
                                        { value: 'overheat', label: '🚨 Overheat Alert (RSI > 70)' },
                                    ].map(item => (
                                        <button
                                            key={item.value}
                                            onClick={() => { setSelectedOverlay(item.value); setPage(1); }}
                                            className={`w-full text-left h-10 px-4 rounded-lg text-[14px] font-bold transition-all flex items-center ${
                                                selectedOverlay === item.value
                                                    ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-slate-950/30 text-slate-400 hover:text-slate-300'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Options structural filters */}
                            <div className="flex flex-col gap-4 pt-4 border-t border-slate-800/80">
                                <label className="text-[14px] font-bold tracking-widest text-slate-400 uppercase">Advanced Options Struct</label>
                                
                                {/* GEX minimum */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between text-[14px] font-bold text-slate-300 uppercase">
                                        <span>GEX Floor (Millions)</span>
                                        <span className="text-cyan-400 font-mono font-bold">{gexMin === -10 ? 'All' : `>${gexMin}M`}</span>
                                    </div>
                                    <input 
                                        type="range" min="-10" max="50" step="5" value={gexMin}
                                        onChange={(e) => { setGexMin(Number(e.target.value)); setPage(1); }}
                                        className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                </div>

                                {/* Put Call Ratio Max */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between text-[14px] font-bold text-slate-300 uppercase">
                                        <span>PCR Maximum Cap</span>
                                        <span className="text-cyan-400 font-mono font-bold">{pcrMax === 1.8 ? 'All' : `<${pcrMax}`}</span>
                                    </div>
                                    <input 
                                        type="range" min="0.4" max="1.8" step="0.2" value={pcrMax}
                                        onChange={(e) => { setPcrMax(Number(e.target.value)); setPage(1); }}
                                        className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                )}

                {/* CENTRAL AREA: Full-width in Auto-Pilot, flex-1 otherwise */}
                <div className="flex-1 flex flex-col gap-4">
                    {/* Toolbar header — hidden in autopilot (replaced by Mission Control) */}
                    {!isAutoPilot && (
                    <div className="p-4 rounded-xl bg-[#111827]/70 backdrop-blur-sm border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-sky-400" />
                            <span className="text-[13px] font-bold text-slate-100 tracking-wide font-[family-name:var(--font-inter)]">
                                QUANT RADAR
                            </span>
                            {isPending && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />}
                        </div>
                        <div className="flex items-center gap-2 text-[13px] font-[family-name:var(--font-inter)]">
                            <span className="text-slate-300 font-medium">SORT BY:</span>
                            {['score', 'rsi', 'volume', 'gex'].map(s => {
                                const active = sortBy === s;
                                return (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            if (sortBy === s) { setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }
                                            else { setSortBy(s); setSortOrder('desc'); }
                                            setPage(1);
                                        }}
                                        className={`px-2.5 py-1 rounded transition-all uppercase font-bold ${
                                            active ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-300 hover:text-slate-100'
                                        }`}
                                    >
                                        {s === 'score' ? 'Context Score' : s}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    )}

                    {/* Loader */}
                    {loading && tickers.length === 0 ? (
                        <div className="flex-1 flex flex-col justify-center items-center py-40 gap-4">
                            <div className="w-10 h-10 border-2 border-sky-500/20 border-t-sky-400 rounded-full animate-spin" />
                            <p className="text-[13px] font-[family-name:var(--font-inter)] text-slate-300 uppercase tracking-wider animate-pulse">Running filters...</p>
                        </div>
                    ) : isAutoPilot ? (
                        /* ═══════════════════════════════════════════════
                           V3 WAR ROOM — AUTONOMOUS TRADING COMMAND CENTER
                           ═══════════════════════════════════════════════ */
                        <div className="flex flex-col gap-4">
                            {/* ── MISSION CONTROL BAR (sticky, expanded) ── */}
                            <div className="sticky top-0 z-30 rounded-xl bg-[#0b101c]/95 backdrop-blur-xl border border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
                                {/* Row 1: Capital Input + Core Metrics */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 p-4">
                                    {/* Trading Capital (inline) */}
                                    <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
                                        <span className="text-[13px] font-medium text-slate-400 uppercase tracking-wider font-[family-name:var(--font-inter)]">Capital</span>
                                        <div className="flex items-center gap-1.5">
                                            <div className="relative flex-1">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-cyan-400 font-[family-name:var(--font-jetbrains)] font-bold text-[13px]">
                                                    {inputCurrency === 'KRW' ? '₩' : '$'}
                                                </span>
                                                <input 
                                                    type="number"
                                                    value={rawCapitalInput}
                                                    onChange={(e) => handleCapitalInput(e.target.value)}
                                                    className="w-full pl-6 pr-2 h-8 bg-[#111827]/80 border border-cyan-500/20 focus:border-cyan-400/50 transition-all outline-none rounded-lg text-[13px] font-[family-name:var(--font-jetbrains)] font-bold text-slate-100 tabular-nums"
                                                />
                                            </div>
                                            {usdkrw && (
                                                <button
                                                    onClick={() => setInputCurrency(c => c === 'USD' ? 'KRW' : 'USD')}
                                                    className="text-[13px] font-bold px-1.5 py-1 rounded border transition-all font-[family-name:var(--font-jetbrains)] bg-slate-800/50 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/10 shrink-0"
                                                >
                                                    {inputCurrency}
                                                </button>
                                            )}
                                        </div>
                                        {inputCurrency === 'KRW' && usdkrw && (
                                            <span className="text-[13px] text-slate-400 font-[family-name:var(--font-jetbrains)] tabular-nums">≈ ${totalCapital.toLocaleString()}</span>
                                        )}
                                    </div>
                                    {/* NAV */}
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[13px] font-medium text-slate-400 uppercase tracking-wider font-[family-name:var(--font-inter)]">NAV</span>
                                        <span className="text-lg font-bold text-slate-100 font-[family-name:var(--font-jetbrains)] tabular-nums">${computedTotalNAV.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                                    </div>
                                    {/* Total P&L */}
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[13px] font-medium text-slate-400 uppercase tracking-wider font-[family-name:var(--font-inter)]">P&L</span>
                                        <span className={`text-lg font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${computedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {computedPL >= 0 ? '+' : ''}{computedPLPct.toFixed(2)}%
                                        </span>
                                    </div>
                                    {/* Daily P&L */}
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[13px] font-medium text-slate-400 uppercase tracking-wider font-[family-name:var(--font-inter)]">Today</span>
                                        <span className={`text-sm font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${dailyPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {dailyPnlPct >= 0 ? '+' : ''}{dailyPnlPct.toFixed(2)}%
                                        </span>
                                    </div>
                                    {/* MDD */}
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[13px] font-medium text-slate-400 uppercase tracking-wider font-[family-name:var(--font-inter)]">MDD</span>
                                        <span className={`text-sm font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${drawdownPct > -2 ? 'text-slate-300' : drawdownPct > -5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                            {drawdownPct.toFixed(1)}%
                                        </span>
                                    </div>
                                    {/* Alignment */}
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[13px] font-medium text-slate-400 uppercase tracking-wider font-[family-name:var(--font-inter)]">Aligned</span>
                                        <span className={`text-sm font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${liveAlignmentProgress >= 90 ? 'text-emerald-400' : liveAlignmentProgress >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                                            {liveAlignmentProgress}%
                                        </span>
                                    </div>
                                    {/* Circuit Breaker Status */}
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[13px] font-medium text-slate-400 uppercase tracking-wider font-[family-name:var(--font-inter)]">Status</span>
                                        <span className={`text-sm font-bold font-[family-name:var(--font-inter)] ${
                                            circuitBreakerResult.level === 'HALT' ? 'text-rose-400' :
                                            circuitBreakerResult.level === 'WARNING' ? 'text-amber-400' : 'text-emerald-400'
                                        }`}>
                                            {circuitBreakerResult.level === 'HALT' ? '🚨 HALT' : circuitBreakerResult.level === 'WARNING' ? '⚠️ WARN' : '🟢 NORMAL'}
                                        </span>
                                    </div>
                                </div>
                                {/* Circuit Breaker Alert (if triggered) */}
                                {circuitBreakerResult.triggered && (
                                    <div className={`mx-4 mb-3 p-2.5 rounded-lg border flex items-center gap-2 text-[13px] font-[family-name:var(--font-inter)] ${
                                        circuitBreakerResult.level === 'HALT' ? 'bg-rose-950/30 border-rose-500/20 text-rose-400' : 'bg-amber-950/30 border-amber-500/20 text-amber-400'
                                    }`}>
                                        <ShieldAlert className="w-4 h-4 shrink-0" />
                                        {circuitBreakerResult.actions.map(a => a.reason).join(' | ')}
                                    </div>
                                )}
                                {/* Row 2: Trade Journal Stats + Compound Growth Indicator */}
                                {(journalStats.totalTrades > 0 || holdings.length > 0) && (
                                    <div className="mx-4 mb-3 p-2.5 rounded-lg bg-[#111827]/60 border border-white/5 flex items-center gap-4 text-[13px] font-[family-name:var(--font-jetbrains)] tabular-nums flex-wrap">
                                        {journalStats.totalTrades > 0 && (
                                            <>
                                                <span className="flex items-center gap-1.5 text-slate-400">
                                                    <span className="text-[11px] uppercase text-slate-500 font-[family-name:var(--font-inter)]">Trades</span>
                                                    <span className="font-bold text-slate-200">{journalStats.totalTrades}</span>
                                                </span>
                                                <span className="flex items-center gap-1.5 text-slate-400">
                                                    <span className="text-[11px] uppercase text-slate-500 font-[family-name:var(--font-inter)]">Win Rate</span>
                                                    <span className={`font-bold ${journalStats.winRate >= 60 ? 'text-emerald-400' : journalStats.winRate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                        {journalStats.winRate.toFixed(1)}%
                                                    </span>
                                                </span>
                                                <span className="flex items-center gap-1.5 text-slate-400">
                                                    <span className="text-[11px] uppercase text-slate-500 font-[family-name:var(--font-inter)]">Realized</span>
                                                    <span className={`font-bold ${cumulativeRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {cumulativeRealizedPnl >= 0 ? '+' : ''}${cumulativeRealizedPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                                    </span>
                                                </span>
                                                <span className="flex items-center gap-1.5 text-slate-400">
                                                    <span className="text-[11px] uppercase text-slate-500 font-[family-name:var(--font-inter)]">E[V]</span>
                                                    <span className={`font-bold ${journalStats.expectancy >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                                                        ${journalStats.expectancy.toFixed(0)}/trade
                                                    </span>
                                                </span>
                                            </>
                                        )}
                                        {holdings.length > 0 && compoundCapital !== totalCapital && (
                                            <span className="flex items-center gap-1.5 ml-auto text-slate-400">
                                                <span className="text-[11px] uppercase text-emerald-500 font-[family-name:var(--font-inter)]">⚡ COMPOUND</span>
                                                <span className="font-bold text-emerald-400">
                                                    ${compoundCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                )}

                            </div>

                            {/* ═══ COMPOUND GROWTH CURVE ═══ */}
                            {navHistory.length >= 2 && (
                                <div className="p-4 rounded-xl bg-[#0b101c]/80 backdrop-blur-sm border border-white/5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-bold text-slate-100 font-[family-name:var(--font-inter)] flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                                            COMPOUND GROWTH
                                        </h3>
                                        <div className="flex items-center gap-4 text-[13px] font-[family-name:var(--font-jetbrains)] tabular-nums">
                                            <span className="text-slate-400">
                                                {navHistory.length}일
                                            </span>
                                            <span className={`font-bold ${computedPLPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {computedPLPct >= 0 ? '+' : ''}{computedPLPct.toFixed(2)}%
                                            </span>
                                            {navHistory.length > 1 && (() => {
                                                const totalReturn = computedPLPct / 100;
                                                const days = navHistory.length;
                                                const annualized = days > 0 ? (Math.pow(1 + totalReturn, 365 / days) - 1) * 100 : 0;
                                                return (
                                                    <span className={`font-bold ${annualized >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                                                        {annualized >= 0 ? '+' : ''}{annualized.toFixed(1)}% 연율
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    {/* SVG Chart */}
                                    {(() => {
                                        const data = navHistory;
                                        const W = 800, H = 120, padY = 8;
                                        const navs = data.map(d => d.nav);
                                        const minNav = Math.min(...navs, totalCapital * 0.95);
                                        const maxNav = Math.max(...navs, totalCapital * 1.05);
                                        const range = maxNav - minNav || 1;
                                        const points = data.map((d, i) => ({
                                            x: (i / Math.max(data.length - 1, 1)) * W,
                                            y: H - padY - ((d.nav - minNav) / range) * (H - padY * 2)
                                        }));
                                        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                                        const areaD = pathD + ` L${W},${H} L0,${H} Z`;
                                        // HWM line
                                        const hwmY = H - padY - ((hwm - minNav) / range) * (H - padY * 2);
                                        // Capital baseline
                                        const capY = H - padY - ((totalCapital - minNav) / range) * (H - padY * 2);
                                        const lastPoint = points[points.length - 1];
                                        
                                        return (
                                            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]" preserveAspectRatio="none">
                                                <defs>
                                                    <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor={computedPL >= 0 ? '#10B981' : '#F43F5E'} stopOpacity="0.3" />
                                                        <stop offset="100%" stopColor={computedPL >= 0 ? '#10B981' : '#F43F5E'} stopOpacity="0.02" />
                                                    </linearGradient>
                                                </defs>
                                                {/* Capital baseline */}
                                                <line x1="0" y1={capY} x2={W} y2={capY} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                                                {/* HWM line */}
                                                <line x1="0" y1={hwmY} x2={W} y2={hwmY} stroke="#06B6D4" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
                                                {/* Area fill */}
                                                <path d={areaD} fill="url(#navGrad)" />
                                                {/* NAV line */}
                                                <path d={pathD} fill="none" stroke={computedPL >= 0 ? '#10B981' : '#F43F5E'} strokeWidth="2" strokeLinejoin="round" />
                                                {/* Current dot */}
                                                {lastPoint && (
                                                    <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill={computedPL >= 0 ? '#10B981' : '#F43F5E'} stroke="white" strokeWidth="1.5" />
                                                )}
                                            </svg>
                                        );
                                    })()}
                                    {/* Stats Row */}
                                    <div className="grid grid-cols-4 gap-3 mt-2 text-[13px]">
                                        <div className="flex flex-col items-center">
                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">운용일</span>
                                            <span className="text-slate-200 font-bold font-[family-name:var(--font-jetbrains)] tabular-nums">{navHistory.length}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">HWM</span>
                                            <span className="text-cyan-400 font-bold font-[family-name:var(--font-jetbrains)] tabular-nums">${hwm.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">MDD</span>
                                            <span className={`font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${drawdownPct > -2 ? 'text-slate-300' : 'text-rose-400'}`}>{drawdownPct.toFixed(1)}%</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">Cash</span>
                                            <span className="text-slate-200 font-bold font-[family-name:var(--font-jetbrains)] tabular-nums">${cashBalance.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Header with Master Copy */}
                            <div className="p-4 rounded-xl bg-[#111827]/60 backdrop-blur-sm border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <div className="flex items-center gap-2 text-sky-400 font-bold text-sm font-[family-name:var(--font-inter)]">
                                        <Zap className="w-3.5 h-3.5" />
                                        AUTONOMOUS ALLOCATION MATRIX
                                    </div>
                                    <p className="text-[13px] text-slate-300 mt-1 font-[family-name:var(--font-inter)]">
                                        Kelly Expectancy & Inverse Volatility Risk Parity
                                    </p>
                                </div>
                                <button
                                    onClick={copyEntireAllocationMatrixToClipboard}
                                    className={`px-4 h-10 rounded-xl font-black text-[13px] uppercase tracking-wider transition-all flex items-center gap-2 border ${
                                        copiedTicker === "PORTFOLIO"
                                            ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                            : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/40'
                                    }`}
                                >
                                    {copiedTicker === "PORTFOLIO" ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            PORTFOLIO COPIED!
                                        </>
                                    ) : (
                                        <>
                                            <Clipboard className="w-3.5 h-3.5 text-cyan-500" />
                                            COPY ALLOCATION MATRIX
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* V2 CIRCUIT BREAKER WARNING BANNER */}
                            {driftAlerts.length > 0 && (
                                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)] animate-[fadeIn_0.3s_ease-out]">
                                    <div className="flex items-center gap-2 text-amber-400 font-black text-[13px] uppercase tracking-wider mb-2">
                                        <AlertCircle className="w-4 h-4" />
                                        WEIGHT DRIFT DETECTED — {driftAlerts.length} POSITION{driftAlerts.length > 1 ? 'S' : ''}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {driftAlerts.map((d: any) => (
                                            <span key={d.ticker} className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                                                d.direction === 'OVERWEIGHT' 
                                                    ? 'bg-rose-950/30 text-rose-400 border-rose-500/20' 
                                                    : 'bg-cyan-950/30 text-cyan-400 border-cyan-500/20'
                                            }`}>
                                                {d.ticker} {d.direction === 'OVERWEIGHT' ? '▲' : '▼'} {d.driftPct}% drift
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ═══ V3 POSITION COMMAND CENTER ═══ */}
                            {holdings.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between px-1">
                                        <h3 className="text-sm font-bold text-slate-100 font-[family-name:var(--font-inter)] flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-cyan-400" />
                                            POSITION COMMAND ({holdings.length})
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[13px] font-bold px-2 py-0.5 rounded border font-[family-name:var(--font-jetbrains)] tabular-nums ${
                                                computedPL >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15' : 'bg-rose-500/10 text-rose-400 border-rose-500/15'
                                            }`}>
                                                {computedPL >= 0 ? '+' : ''}${computedPL.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Position Cards */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {livePositionStatus.map(pos => {
                                            const signalConfig: Record<string, {label: string, bgCard: string, borderCard: string, tagColor: string, icon: string, directive: string}> = {
                                                STOP_LOSS: { 
                                                    label: 'STOP LOSS', bgCard: 'bg-rose-950/20', borderCard: 'border-rose-500/30 animate-pulse', 
                                                    tagColor: 'bg-rose-500/15 text-rose-400 border-rose-500/20', icon: '🔴',
                                                    directive: `즉시 시장가 매도. SL $${pos.slPrice.toFixed(2)} 히트. 감정 배제, 기계적 청산.`
                                                },
                                                DECAY: { 
                                                    label: 'SCORE DECAY', bgCard: 'bg-amber-950/15', borderCard: 'border-amber-500/25',
                                                    tagColor: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: '⚠️',
                                                    directive: `Score ${pos.score}로 하락. 엔진이 더 이상 추천하지 않음. 축소 또는 청산 권고.`
                                                },
                                                TAKE_PROFIT: { 
                                                    label: 'TAKE PROFIT', bgCard: 'bg-emerald-950/15', borderCard: 'border-emerald-500/25',
                                                    tagColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: '🟢',
                                                    directive: `TP $${pos.tpPrice.toFixed(2)} 도달. 50% 익절 후 잔여분 trailing stop $${(pos.livePrice * 0.97).toFixed(2)} 설정.`
                                                },
                                                ACCUMULATE: { 
                                                    label: 'STRONG', bgCard: 'bg-[#111827]/50', borderCard: 'border-sky-500/20',
                                                    tagColor: 'bg-sky-500/15 text-sky-400 border-sky-500/20', icon: '⚡',
                                                    directive: `Score ${pos.score} 유지. 모멘텀 강세. 비중 유지 또는 추가 매수 검토.`
                                                },
                                                HOLD: { 
                                                    label: 'HOLD', bgCard: 'bg-[#111827]/40', borderCard: 'border-white/5',
                                                    tagColor: 'bg-slate-500/15 text-slate-300 border-slate-500/20', icon: '⏸️',
                                                    directive: `정상 구간. 유지. Score 40 이하 하락 시 축소, TP 도달 시 익절.`
                                                },
                                            };
                                            const sc = signalConfig[pos.signal] || signalConfig.HOLD;
                                            const actualWeight = computedTotalNAV > 0 ? ((pos.quantity * pos.livePrice) / computedTotalNAV) * 100 : 0;
                                            
                                            // SL-Entry-TP bar position calculation
                                            const slToTp = pos.tpPrice - pos.slPrice;
                                            const pricePos = slToTp > 0 ? ((pos.livePrice - pos.slPrice) / slToTp) * 100 : 50;
                                            const clampedPos = Math.max(0, Math.min(100, pricePos));
                                            const entryPos = slToTp > 0 ? ((pos.avgPrice - pos.slPrice) / slToTp) * 100 : 50;
                                            const clampedEntry = Math.max(0, Math.min(100, entryPos));

                                            return (
                                                <div key={pos.ticker} className={`p-4 rounded-xl ${sc.bgCard} border ${sc.borderCard} transition-all`}>
                                                    {/* Header: Ticker + Signal + P&L */}
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <TickerLogo ticker={pos.ticker} className="w-7 h-7" />
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-slate-100 font-[family-name:var(--font-jetbrains)]">{pos.ticker}</span>
                                                                    <span className="text-[13px] font-bold text-slate-200 font-[family-name:var(--font-jetbrains)] tabular-nums">${pos.livePrice.toFixed(2)}</span>
                                                                </div>
                                                                <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded border ${sc.tagColor} font-[family-name:var(--font-inter)]`}>
                                                                    {sc.icon} {sc.label}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className={`text-sm font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${
                                                                pos.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                                            }`}>
                                                                {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                                                            </span>
                                                            <span className={`text-[13px] font-[family-name:var(--font-jetbrains)] tabular-nums ${
                                                                pos.pnl >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'
                                                            }`}>
                                                                {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* SL — Entry — TP Visual Bar */}
                                                    <div className="relative mb-3">
                                                        <div className="flex justify-between text-[13px] font-[family-name:var(--font-jetbrains)] tabular-nums mb-1">
                                                            <span className={`${pos.slHit ? 'text-rose-400 font-bold' : 'text-rose-400/60'}`}>SL ${pos.slPrice.toFixed(2)}</span>
                                                            <span className={`${pos.tpHit ? 'text-emerald-400 font-bold' : 'text-emerald-400/60'}`}>TP ${pos.tpPrice.toFixed(2)}</span>
                                                        </div>
                                                        <div className="relative h-2 rounded-full bg-slate-800/80 overflow-visible">
                                                            {/* Gradient fill from SL to current price */}
                                                            <div 
                                                                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                                                                    pos.pnlPct >= 0 ? 'bg-gradient-to-r from-slate-600 to-emerald-500' : 'bg-gradient-to-r from-rose-500 to-slate-600'
                                                                }`}
                                                                style={{ width: `${clampedPos}%` }}
                                                            />
                                                            {/* Entry marker */}
                                                            <div 
                                                                className="absolute top-[-3px] w-0.5 h-[14px] bg-slate-400/60"
                                                                style={{ left: `${clampedEntry}%` }}
                                                                title={`Entry $${pos.avgPrice.toFixed(2)}`}
                                                            />
                                                            {/* Current price marker */}
                                                            <div 
                                                                className={`absolute top-[-4px] w-2.5 h-2.5 rounded-full border-2 transition-all duration-500 ${
                                                                    pos.pnlPct >= 0 ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-rose-400 border-rose-300 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
                                                                }`}
                                                                style={{ left: `calc(${clampedPos}% - 5px)` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Stats Row */}
                                                    <div className="grid grid-cols-4 gap-2 mb-3 text-[13px]">
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">보유</span>
                                                            <span className="text-slate-200 font-bold font-[family-name:var(--font-jetbrains)] tabular-nums">{pos.quantity}주</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">평단가</span>
                                                            <span className="text-slate-200 font-bold font-[family-name:var(--font-jetbrains)] tabular-nums">${pos.avgPrice.toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">비중</span>
                                                            <span className="text-slate-200 font-bold font-[family-name:var(--font-jetbrains)] tabular-nums">{actualWeight.toFixed(1)}%</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-400 font-[family-name:var(--font-inter)]">Score</span>
                                                            <span className={`font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${
                                                                pos.score >= 60 ? 'text-emerald-400' : pos.score >= 40 ? 'text-amber-400' : 'text-rose-400'
                                                            }`}>{pos.score} {pos.grade}</span>
                                                        </div>
                                                    </div>

                                                    {/* Engine Directive */}
                                                    <div className={`p-2.5 rounded-lg border text-[13px] font-medium leading-relaxed ${
                                                        pos.signal === 'STOP_LOSS' ? 'bg-rose-950/20 border-rose-500/15 text-rose-300' :
                                                        pos.signal === 'DECAY' ? 'bg-amber-950/20 border-amber-500/15 text-amber-300' :
                                                        pos.signal === 'TAKE_PROFIT' ? 'bg-emerald-950/20 border-emerald-500/15 text-emerald-300' :
                                                        'bg-slate-900/30 border-slate-700/30 text-slate-300'
                                                    } font-[family-name:var(--font-inter)]`}>
                                                        {sc.directive}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Portfolio Weight Distribution Bar */}
                                    <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-slate-800/50">
                                        {livePositionStatus.map(pos => {
                                            const actualWeight = computedTotalNAV > 0 ? ((pos.quantity * pos.livePrice) / computedTotalNAV) * 100 : 0;
                                            return (
                                                <div
                                                    key={pos.ticker}
                                                    className={`h-full transition-all duration-500 relative group cursor-pointer ${
                                                        pos.pnlPct >= 0 ? 'bg-emerald-500/60 hover:bg-emerald-500/80' : 'bg-rose-500/60 hover:bg-rose-500/80'
                                                    }`}
                                                    style={{ width: `${Math.max(actualWeight, 1)}%` }}
                                                    title={`${pos.ticker}: ${actualWeight.toFixed(1)}% (target ${pos.targetWeight.toFixed(1)}%)`}
                                                >
                                                    {actualWeight > 8 && (
                                                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/80 font-[family-name:var(--font-jetbrains)]">
                                                            {pos.ticker}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {/* Cash portion */}
                                        {cashBalance > 0 && computedTotalNAV > 0 && (
                                            <div
                                                className="h-full bg-slate-600/40"
                                                style={{ width: `${Math.max((cashBalance / computedTotalNAV) * 100, 1)}%` }}
                                                title={`Cash: ${((cashBalance / computedTotalNAV) * 100).toFixed(1)}%`}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}

<div className="flex flex-col gap-4 w-full animate-[fadeIn_0.4s_ease-out]">
                                {/* ═══ STEP-BY-STEP EXECUTION PLAYBOOK ═══ */}
                                {(() => {
                                     const hasHoldings = holdings.length > 0;
                                     
                                     // Build comprehensive action list
                                     const trimsList = sortedTickers
                                         .map((item: any) => {
                                             const targetShares = (item as any).targetShares || 0;
                                             const heldObj = holdings.find((h: any) => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                                             const heldQty = heldObj ? heldObj.quantity : 0;
                                             const diffQty = targetShares - heldQty;
                                             const wsPriceObj = getPrice(item.ticker);
                                             const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                             const weight = ((item as any).weight || 0) * 100;
                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot?.score || 50, weight, item };
                                         })
                                         .filter((x: any) => x.heldQty > 0 && x.diffQty < 0); // Only SELL if actually holding

                                     const buysList = sortedTickers
                                         .map((item: any) => {
                                             const targetShares = (item as any).targetShares || 0;
                                             const heldObj = holdings.find((h: any) => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                                             const heldQty = heldObj ? heldObj.quantity : 0;
                                             const diffQty = targetShares - heldQty;
                                             const wsPriceObj = getPrice(item.ticker);
                                             const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                             const weight = ((item as any).weight || 0) * 100;
                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot?.score || 50, weight, item };
                                         })
                                         .filter((x: any) => x.diffQty > 0)
                                         .sort((a: any, b: any) => b.score - a.score);

                                     // SWAP candidates — look up scores from engine data (tickers), not holdings
                                     const getHoldingScore = (ticker: string) => {
                                         const t = sortedTickers.find((t: any) => t.ticker.toUpperCase() === ticker.toUpperCase());
                                         return t?.alphaSnapshot?.score;
                                     };
                                     const holdingsWithScores = holdings
                                         .map(h => ({ ...h, alphaScore: getHoldingScore(h.ticker) }))
                                         .filter(h => h.alphaScore !== undefined);
                                     const sortedHoldingsByScore = [...holdingsWithScores]
                                         .sort((a, b) => (a.alphaScore || 0) - (b.alphaScore || 0));
                                     const lowestScoreHolding = sortedHoldingsByScore[0];
                                     const sortedScannedByScore = [...sortedTickers]
                                         .filter((t: any) => t.alphaSnapshot?.score !== undefined)
                                         .sort((a: any, b: any) => (b.alphaSnapshot?.score || 0) - (a.alphaSnapshot?.score || 0));
                                     const highestScoreScanned = sortedScannedByScore.find((t: any) => !holdings.some((h: any) => h.ticker.toUpperCase() === t.ticker.toUpperCase()));
                                     const hasSwap = hasHoldings && lowestScoreHolding && highestScoreScanned && ((highestScoreScanned.alphaSnapshot?.score || 0) > (lowestScoreHolding.alphaScore || 0) + 15);
                                     
                                     // Decay positions (held but engine score < 50)
                                     const decayPositions = holdingsWithScores.filter(h => h.alphaScore !== undefined && (h.alphaScore as number) < 50);

                                     // Step counters
                                     let stepNum = 0;
                                     const totalSteps = (trimsList.length > 0 ? 1 : 0) + (buysList.length > 0 ? 1 : 0) + (hasSwap ? 1 : 0) + (decayPositions.length > 0 ? 1 : 0);

                                     return (
                                         <div className="p-5 rounded-xl bg-[#0b101c]/80 border border-white/5 backdrop-blur-sm flex flex-col gap-4">
                                             <div className="flex items-center justify-between">
                                                 <h3 className="text-sm font-bold text-slate-100 font-[family-name:var(--font-inter)] flex items-center gap-2">
                                                     <Zap className="w-4 h-4 text-cyan-400" />
                                                     EXECUTION PLAYBOOK
                                                 </h3>
                                                 <div className="flex items-center gap-3">
                                                     <span className="text-[13px] text-slate-400 font-[family-name:var(--font-inter)]">
                                                         {totalSteps > 0 ? `${totalSteps} STEPS` : '✅ ALIGNED'}
                                                     </span>
                                                     <span className={`text-[13px] font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${liveAlignmentProgress >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                         {liveAlignmentProgress}%
                                                     </span>
                                                 </div>
                                             </div>

                                             {/* Alignment Progress Bar */}
                                             <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900">
                                                 <div 
                                                     className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                                                     style={{ width: `${liveAlignmentProgress}%` }}
                                                 />
                                             </div>

                                             {/* ─── NO HOLDINGS: Fresh start ─── */}
                                             {!hasHoldings && totalSteps === 0 && tickers.length === 0 && (
                                                 <div className="p-4 rounded-lg bg-slate-900/30 border border-slate-700/30 text-center">
                                                     <p className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)]">
                                                         투자금을 입력하면 엔진이 최적 포트폴리오를 계산합니다.
                                                     </p>
                                                 </div>
                                             )}

                                             {/* ─── STEP: LIQUIDATE DECAY (only if actually holding decayed stocks) ─── */}
                                             {decayPositions.length > 0 && (() => {
                                                 stepNum++;
                                                 return (
                                                     <div className="rounded-lg border border-rose-500/20 overflow-hidden">
                                                         <div className="p-3 bg-rose-950/20 flex items-center justify-between">
                                                             <div className="flex items-center gap-2">
                                                                 <span className="w-6 h-6 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-[13px] font-bold text-rose-400">
                                                                     {stepNum}
                                                                 </span>
                                                                 <span className="text-[13px] font-bold text-rose-400 uppercase font-[family-name:var(--font-inter)]">
                                                                     🔴 LIQUIDATE — Score Decay 종목 청산
                                                                 </span>
                                                             </div>
                                                             <button
                                                                 onClick={() => {
                                                                     for (const h of decayPositions) { removeHolding(h.ticker); }
                                                                 }}
                                                                 disabled={isInjecting}
                                                                 className="text-[13px] font-bold text-rose-400 hover:text-rose-300 border border-rose-500/20 px-2.5 py-1 rounded transition font-[family-name:var(--font-inter)]"
                                                             >{dict.liquidateBtn}</button>
                                                         </div>
                                                         <div className="p-3 flex flex-wrap gap-2">
                                                             {decayPositions.map((h: any) => (
                                                                 <span key={h.ticker} className="text-[13px] font-bold px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/15 font-[family-name:var(--font-jetbrains)]">
                                                                     {h.ticker} (Score {h.alphaScore})
                                                                 </span>
                                                             ))}
                                                         </div>
                                                     </div>
                                                 );
                                             })()}

                                             {/* ─── STEP: TRIM/SELL (only if actually holding excess) ─── */}
                                             {trimsList.length > 0 && (() => {
                                                 stepNum++;
                                                 const allDone = trimsList.every(x => completedSteps['sell-' + x.ticker]);
                                                 return (
                                                     <div className={`rounded-lg border overflow-hidden transition-all ${allDone ? 'border-emerald-500/20 opacity-60' : 'border-amber-500/20'}`}>
                                                         <div className="p-3 bg-amber-950/15 flex items-center gap-2">
                                                             <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold ${allDone ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-amber-500/20 border border-amber-500/30 text-amber-400'}`}>
                                                                 {allDone ? '✓' : stepNum}
                                                             </span>
                                                             <span className="text-[13px] font-bold text-amber-400 uppercase font-[family-name:var(--font-inter)]">
                                                                 비중 축소 — 초과 보유 종목 매도
                                                             </span>
                                                             <span className="text-[13px] text-slate-400 font-[family-name:var(--font-jetbrains)] ml-auto">{trimsList.length}건</span>
                                                         </div>
                                                         <div className="p-3 flex flex-col gap-1.5">
                                                             {trimsList.map(x => {
                                                                 const isDone = !!completedSteps['sell-' + x.ticker];
                                                                 return (
                                                                     <div key={x.ticker} className={`flex items-center gap-3 p-2 rounded-lg transition-all ${isDone ? 'opacity-40' : 'hover:bg-white/[0.02]'}`}>
                                                                         <button onClick={() => setCompletedSteps(prev => ({ ...prev, ['sell-' + x.ticker]: !prev['sell-' + x.ticker] }))}
                                                                             className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-500/20 border-emerald-500/30' : 'border-slate-600 hover:border-slate-400'}`}>
                                                                             {isDone && <Check className="w-3 h-3 text-emerald-400" />}
                                                                         </button>
                                                                         <span className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/15 font-[family-name:var(--font-jetbrains)]">SELL</span>
                                                                         <TickerLogo ticker={x.ticker} className="w-5 h-5" />
                                                                         <span className="text-sm font-bold text-slate-100 font-[family-name:var(--font-jetbrains)]">{x.ticker}</span>
                                                                         <span className="text-[13px] text-slate-300 font-[family-name:var(--font-jetbrains)] tabular-nums">-{Math.abs(x.diffQty)}주 @ ${x.livePrice.toFixed(2)}</span>
                                                                         <button onClick={() => { updateQuantity(x.ticker, x.targetShares, x.livePrice); setCompletedSteps(prev => ({ ...prev, ['sell-' + x.ticker]: true })); setTimeout(() => fetchRadarData(), 300); }} disabled={isDone} className={`text-[13px] font-bold px-2 py-0.5 rounded border transition ${isDone ? 'bg-slate-800/30 text-slate-500 border-slate-700/30 cursor-not-allowed' : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/20'}`}>EXEC</button>
                                                                          <button onClick={() => { const exec = (x.item as any).execution || {}; copyBracketToClipboard(x.item, x.livePrice, exec.takeProfit || 0, exec.stopLoss || 0); }}
                                                                             className="ml-auto text-[13px] font-bold text-sky-400 hover:text-sky-300 transition font-[family-name:var(--font-inter)]">📋 COPY</button>
                                                                     </div>
                                                                 );
                                                             })}
                                                         </div>
                                                     </div>
                                                 );
                                             })()}

                                             {/* ─── STEP: BUY (new positions or add to existing) ─── */}
                                             {buysList.length > 0 && (() => {
                                                 stepNum++;
                                                 const allDone = buysList.every(x => completedSteps['buy-' + x.ticker]);
                                                 return (
                                                     <div className={`rounded-lg border overflow-hidden transition-all ${allDone ? 'border-emerald-500/20 opacity-60' : 'border-emerald-500/20'}`}>
                                                         <div className="p-3 bg-emerald-950/15 flex items-center gap-2">
                                                             <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold ${allDone ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'}`}>
                                                                 {allDone ? '✓' : stepNum}
                                                             </span>
                                                             <span className="text-[13px] font-bold text-emerald-400 uppercase font-[family-name:var(--font-inter)]">
                                                                 {hasHoldings ? '비중 확대 — 추가 매수' : '🟢 포트폴리오 구축 — 신규 매수'}
                                                             </span>
                                                             <span className="text-[13px] text-slate-400 font-[family-name:var(--font-jetbrains)] ml-auto">{buysList.length}건</span>
                                                         </div>
                                                         <div className="p-3 flex flex-col gap-1.5">
                                                             {buysList.map((x, idx) => {
                                                                 const isDone = !!completedSteps['buy-' + x.ticker];
                                                                 const isNew = x.heldQty === 0;
                                                                 return (
                                                                     <div key={x.ticker} className={`flex items-center gap-3 p-2 rounded-lg transition-all ${isDone ? 'opacity-40' : 'hover:bg-white/[0.02]'}`}>
                                                                         <button onClick={() => setCompletedSteps(prev => ({ ...prev, ['buy-' + x.ticker]: !prev['buy-' + x.ticker] }))}
                                                                             className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-500/20 border-emerald-500/30' : 'border-slate-600 hover:border-slate-400'}`}>
                                                                             {isDone && <Check className="w-3 h-3 text-emerald-400" />}
                                                                         </button>
                                                                         <span className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-[family-name:var(--font-jetbrains)]">
                                                                             {isNew ? 'BUY' : 'ADD'}
                                                                         </span>
                                                                         <TickerLogo ticker={x.ticker} className="w-5 h-5" />
                                                                         <span className="text-sm font-bold text-slate-100 font-[family-name:var(--font-jetbrains)]">{x.ticker}</span>
                                                                         <span className="text-[13px] text-slate-300 font-[family-name:var(--font-jetbrains)] tabular-nums">
                                                                             +{x.diffQty}주 @ ${x.livePrice.toFixed(2)}
                                                                         </span>
                                                                         <span className="text-[13px] text-sky-400/70 font-[family-name:var(--font-jetbrains)] tabular-nums hidden sm:inline">
                                                                             비중 {x.weight.toFixed(1)}% · Score {x.score}
                                                                         </span>
                                                                         <button onClick={() => { addHolding({ ticker: x.ticker, name: x.ticker, quantity: x.diffQty, avgPrice: x.livePrice }); setCompletedSteps(prev => ({ ...prev, ['buy-' + x.ticker]: true })); setTimeout(() => fetchRadarData(), 300); }} disabled={isDone} className={`text-[13px] font-bold px-2 py-0.5 rounded border transition ${isDone ? 'bg-slate-800/30 text-slate-500 border-slate-700/30 cursor-not-allowed' : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/20'}`}>EXEC</button>
                                                                          <button onClick={() => { const exec = (x.item as any).execution || {}; copyBracketToClipboard(x.item, x.livePrice, exec.takeProfit || 0, exec.stopLoss || 0); }}
                                                                             className="ml-auto text-[13px] font-bold text-sky-400 hover:text-sky-300 transition font-[family-name:var(--font-inter)]">📋 COPY</button>
                                                                     </div>
                                                                 );
                                                             })}
                                                         </div>
                                                         {/* Batch inject button for fresh start */}
                                                         {!hasHoldings && (
                                                             <div className="px-3 pb-3">
                                                                 <button
                                                                     onClick={handleBatchInject}
                                                                     disabled={isInjecting || tickers.length === 0}
                                                                     className="w-full h-9 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 disabled:bg-slate-800/30 disabled:opacity-40 text-emerald-400 disabled:text-slate-500 border border-emerald-500/20 font-bold transition-all flex items-center justify-center gap-1.5 text-[13px] font-[family-name:var(--font-inter)]"
                                                                 >
                                                                     {isInjecting ? <div className="w-3 h-3 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                                                     전체 매수 완료 — 보유 등록
                                                                 </button>
                                                             </div>
                                                         )}
                                                     </div>
                                                 );
                                             })()}

                                             {/* ─── STEP: SWAP (rotation, only when held) ─── */}
                                             {hasSwap && (() => {
                                                 stepNum++;
                                                 const swapDone = !!completedSteps['swap-' + lowestScoreHolding.ticker];
                                                 return (
                                                     <div className={`rounded-lg border overflow-hidden transition-all ${swapDone ? 'border-emerald-500/20 opacity-60' : 'border-indigo-500/20'}`}>
                                                         <div className="p-3 bg-indigo-950/15 flex items-center gap-2">
                                                             <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold ${swapDone ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400'}`}>
                                                                 {swapDone ? '✓' : stepNum}
                                                             </span>
                                                             <span className="text-[13px] font-bold text-indigo-400 uppercase font-[family-name:var(--font-inter)]">
                                                                 🔄 ROTATION — 약한 종목을 강한 종목으로 교체
                                                             </span>
                                                         </div>
                                                         <div className="p-3 flex items-center gap-3">
                                                             <button onClick={() => setCompletedSteps(prev => ({ ...prev, ['swap-' + lowestScoreHolding.ticker]: !prev['swap-' + lowestScoreHolding.ticker] }))}
                                                                 className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${swapDone ? 'bg-emerald-500/20 border-emerald-500/30' : 'border-slate-600 hover:border-slate-400'}`}>
                                                                 {swapDone && <Check className="w-3 h-3 text-emerald-400" />}
                                                             </button>
                                                             <span className="text-sm font-bold text-rose-400 font-[family-name:var(--font-jetbrains)]">{lowestScoreHolding.ticker}</span>
                                                             <span className="text-[13px] text-slate-400">(Score {lowestScoreHolding.alphaScore})</span>
                                                             <span className="text-slate-400">→</span>
                                                             <span className="text-sm font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">{highestScoreScanned!.ticker}</span>
                                                             <span className="text-[13px] text-slate-400">(Score {highestScoreScanned!.alphaSnapshot?.score})</span>
                                                             <button onClick={() => handleRotate(lowestScoreHolding.ticker, highestScoreScanned!)}
                                                                 disabled={isInjecting}
                                                                 className="ml-auto text-[13px] font-bold text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 px-2.5 py-1 rounded transition font-[family-name:var(--font-inter)]">🔄 EXEC</button>
                                                         </div>
                                                     </div>
                                                 );
                                             })()}

                                             {/* ALL DONE state */}
                                             {totalSteps === 0 && tickers.length > 0 && (
                                                 <div className="p-3 rounded-lg bg-emerald-900/10 border border-emerald-500/10 text-[13px] text-emerald-400 font-bold flex items-center gap-2 font-[family-name:var(--font-inter)]">
                                                     <CheckCircle2 className="w-4 h-4 shrink-0" />
                                                     포트폴리오가 엔진 모델과 완벽히 정렬되어 있습니다. 추가 조치가 필요 없습니다.
                                                 </div>
                                             )}
                                         </div>
                                     );
                                 })()}

                                {/* ACTION HISTORY */}
                                {journal.length > 0 && (
                                    <div className="rounded-xl bg-[#0b101c]/80 backdrop-blur-sm border border-white/5 overflow-hidden">
                                        <button onClick={() => setShowHistory(prev => !prev)} className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                            <h3 className="text-sm font-bold text-slate-100 font-[family-name:var(--font-inter)] flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-amber-400" />
                                                ACTION HISTORY
                                                <span className="text-[13px] font-normal text-slate-400 ml-1">({journal.length})</span>
                                            </h3>
                                            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showHistory ? 'rotate-90' : ''}`} />
                                        </button>
                                        {showHistory && (
                                            <div className="px-4 pb-4 flex flex-col gap-1 max-h-[300px] overflow-y-auto">
                                                {journal.slice(0, 50).map((trade) => {
                                                    const isBuy = ['BUY', 'ADD', 'ROTATE_IN'].includes(trade.action);
                                                    const isSell = ['SELL', 'LIQUIDATE', 'ROTATE_OUT'].includes(trade.action);
                                                    const ac: Record<string, string> = { BUY: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15', ADD: 'bg-sky-500/10 text-sky-400 border-sky-500/15', SELL: 'bg-amber-500/10 text-amber-400 border-amber-500/15', LIQUIDATE: 'bg-rose-500/10 text-rose-400 border-rose-500/15', ROTATE_OUT: 'bg-rose-500/10 text-rose-400 border-rose-500/15', ROTATE_IN: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/15' };
                                                    const color = ac[trade.action] || 'bg-slate-500/10 text-slate-300 border-slate-500/15';
                                                    return (
                                                        <div key={trade.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.02] transition-all text-[13px]">
                                                            <span className={`font-bold px-1.5 py-0.5 rounded border text-[11px] ${color} font-[family-name:var(--font-inter)] shrink-0`}>{trade.action}</span>
                                                            <TickerLogo ticker={trade.ticker} className="w-4 h-4 shrink-0" />
                                                            <span className="font-bold text-slate-100 font-[family-name:var(--font-jetbrains)]">{trade.ticker}</span>
                                                            <span className="text-slate-400 font-[family-name:var(--font-jetbrains)] tabular-nums">{isBuy ? '+' : '-'}{trade.quantity} @ ${trade.price.toFixed(2)}</span>
                                                            {isSell && trade.realizedPnl !== undefined && (
                                                                <span className={`font-bold font-[family-name:var(--font-jetbrains)] tabular-nums ${trade.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    {trade.realizedPnl >= 0 ? '+' : ''}${trade.realizedPnl.toFixed(0)} ({trade.realizedPnlPct?.toFixed(1)}%)
                                                                </span>
                                                            )}
                                                            <span className="ml-auto text-slate-500 font-[family-name:var(--font-inter)] text-[11px] shrink-0">{new Date(trade.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SCENARIO MANAGEMENT */}
                                <div className="p-4 rounded-xl bg-[#0b101c]/80 border border-white/5 flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-slate-100 font-[family-name:var(--font-inter)] flex items-center gap-2">
                                            <Target className="w-4 h-4 text-sky-400" />
                                            SCENARIO
                                            {activeScenario && (
                                                <span className="text-[13px] font-normal text-cyan-400 ml-1">{activeScenario}</span>
                                            )}
                                        </h3>
                                        {activeScenario && (
                                            <span className="text-[11px] text-emerald-400/60 font-[family-name:var(--font-inter)]">AUTO-SAVING</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={scenarioName}
                                            onChange={(e) => setScenarioName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && scenarioName.trim()) {
                                                    const name = scenarioName.trim();
                                                    const s = JSON.parse(localStorage.getItem('radar_scenarios') || '{}');
                                                    s[name] = {
                                                        holdings: JSON.parse(localStorage.getItem('radar_holdings') || '[]'),
                                                        journal: JSON.parse(localStorage.getItem('radar_trade_journal') || '[]'),
                                                        capital: totalCapital,
                                                        isAutoPilot: true,
                                                        savedAt: new Date().toISOString(),
                                                        updatedAt: new Date().toISOString(),
                                                    };
                                                    localStorage.setItem('radar_scenarios', JSON.stringify(s));
                                                    localStorage.setItem('radar_active_scenario', name);
                                                    setActiveScenario(name);
                                                    setScenarioList(Object.keys(s));
                                                    setScenarioName('');
                                                }
                                            }}
                                            placeholder="New scenario name..."
                                            className="flex-1 text-[13px] bg-slate-950/50 border border-white/10 text-slate-200 rounded-lg px-3 py-1.5 font-[family-name:var(--font-inter)] placeholder:text-slate-600 focus:border-sky-500/30 focus:outline-none"
                                        />
                                        <button
                                            onClick={() => {
                                                if (!scenarioName.trim()) return;
                                                const name = scenarioName.trim();
                                                const s = JSON.parse(localStorage.getItem('radar_scenarios') || '{}');
                                                s[name] = {
                                                    holdings: JSON.parse(localStorage.getItem('radar_holdings') || '[]'),
                                                    journal: JSON.parse(localStorage.getItem('radar_trade_journal') || '[]'),
                                                    capital: totalCapital,
                                                    isAutoPilot: true,
                                                    savedAt: new Date().toISOString(),
                                                    updatedAt: new Date().toISOString(),
                                                };
                                                localStorage.setItem('radar_scenarios', JSON.stringify(s));
                                                localStorage.setItem('radar_active_scenario', name);
                                                setActiveScenario(name);
                                                setScenarioList(Object.keys(s));
                                                setScenarioName('');
                                            }}
                                            disabled={!scenarioName.trim()}
                                            className="text-[13px] font-bold text-sky-400 hover:text-sky-300 disabled:text-slate-600 border border-sky-500/20 disabled:border-slate-700/30 px-3 py-1.5 rounded-lg transition font-[family-name:var(--font-inter)]"
                                        >SAVE</button>
                                    </div>
                                    {scenarioList.length > 0 && (
                                        <div className="flex flex-col gap-1.5">
                                            {scenarioList.map(name => {
                                                const isActive = name === activeScenario;
                                                const scenarios = JSON.parse(localStorage.getItem('radar_scenarios') || '{}');
                                                const sc = scenarios[name] || {};
                                                return (
                                                    <div key={name} className={`flex items-center gap-2 p-2 rounded-lg transition-all ${isActive ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-slate-800/30 border border-transparent hover:border-white/5'}`}>
                                                        <button
                                                            onClick={() => {
                                                                if (isActive) return;
                                                                const s = JSON.parse(localStorage.getItem('radar_scenarios') || '{}');
                                                                const scenario = s[name];
                                                                if (!scenario) return;
                                                                localStorage.setItem('radar_holdings', JSON.stringify(scenario.holdings || []));
                                                                localStorage.setItem('radar_trade_journal', JSON.stringify(scenario.journal || []));
                                                                localStorage.setItem('radar_capital', (scenario.capital || 50000).toString());
                                                                localStorage.setItem('radar_autopilot', 'true');
                                                                localStorage.setItem('radar_active_scenario', name);
                                                                setActiveScenario(name);
                                                                setTotalCapital(scenario.capital || 50000);
                                                                setCommittedCapital(scenario.capital || 50000);
                                                                setRawCapitalInput((scenario.capital || 50000).toString());
                                                                setIsAutoPilot(true);
                                                                setCompletedSteps({});
                                                                reloadFromStorage();
                                                                setTimeout(() => fetchRadarData(), 300);
                                                            }}
                                                            className={`flex-1 text-left text-[13px] font-bold font-[family-name:var(--font-inter)] transition ${isActive ? 'text-cyan-400' : 'text-slate-300 hover:text-sky-400'}`}
                                                        >
                                                            {isActive ? '> ' : ''}{name}
                                                            <span className="text-[11px] font-normal text-slate-500 ml-2">
                                                                ${(sc.capital || 0).toLocaleString()} | {(sc.holdings || []).length} positions | {(sc.journal || []).length} trades
                                                            </span>
                                                        </button>
                                                        {!isActive && (
                                                            <button
                                                                onClick={() => {
                                                                    const s = JSON.parse(localStorage.getItem('radar_scenarios') || '{}');
                                                                    delete s[name];
                                                                    localStorage.setItem('radar_scenarios', JSON.stringify(s));
                                                                    setScenarioList(Object.keys(s));
                                                                    if (activeScenario === name) {
                                                                        setActiveScenario('');
                                                                        localStorage.removeItem('radar_active_scenario');
                                                                    }
                                                                }}
                                                                className="text-[11px] text-slate-500 hover:text-rose-400 px-1.5 py-0.5 rounded transition"
                                                            >DEL</button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                                                {/* 2. OPTIMAL PORTFOLIO WEIGHTS — Collapsible */}
                                <div className="rounded-xl bg-[#111827]/60 backdrop-blur-sm border border-white/5 overflow-hidden">
                                    <button
                                        onClick={() => setScannerCollapsed(c => !c)}
                                        className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                                    >
                                        <h3 className="text-sm font-bold text-slate-100 font-[family-name:var(--font-inter)] flex items-center gap-2">
                                            <BarChart3 className="w-4 h-4 text-sky-400" />
                                            {dict.optimalWeights}
                                            <span className="text-[13px] font-normal text-slate-400 ml-1">({sortedTickers.length})</span>
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13px] text-slate-400 font-[family-name:var(--font-inter)]">
                                                {sortedTickers.slice(0, 3).map((t: any) => t.ticker).join(' · ')}{sortedTickers.length > 3 ? ' ...' : ''}
                                            </span>
                                            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${scannerCollapsed ? '' : 'rotate-90'}`} />
                                        </div>
                                    </button>
                                    {!scannerCollapsed && (
                                    <div className="px-4 pb-4 flex flex-col gap-4">

                                    {/* Card Grid - replaces table */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {sortedTickers.map((item: any) => {
                                            const grade = item.alphaSnapshot?.grade || 'B';
                                            const theme = gradeColorMap[grade] || gradeColorMap.B;
                                            const weightPct = (((item as any).weight || 0) * 100).toFixed(1);
                                            const allocatedCapital = (item as any).allocatedCapital || 0;
                                            const targetShares = (item as any).targetShares || 0;
                                            const wsPriceObj = getPrice(item.ticker);
                                            const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                            const exec = (item as any).execution || {};
                                            const heldObj = holdings.find((h: any) => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                                            const heldQty = heldObj ? heldObj.quantity : 0;
                                            const diffQty = targetShares - heldQty;

                                            return (
                                                <div key={item.ticker} className={`p-3.5 rounded-lg bg-[#111827]/40 border border-white/5 hover:border-white/10 transition-all flex flex-col gap-2.5 ${theme.glow}`}>
                                                    {/* Row 1: Grade + Ticker + Weight */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-bold border ${theme.bg} ${theme.text} ${theme.border}`}>{grade}</span>
                                                            <TickerLogo ticker={item.ticker} className="w-5 h-5" />
                                                            <span className="text-sm font-bold text-slate-100 font-[family-name:var(--font-jetbrains)] tracking-wide">{item.ticker}</span>
                                                        </div>
                                                        <span className="text-sm font-bold text-sky-400 font-[family-name:var(--font-jetbrains)] tabular-nums">{weightPct}%</span>
                                                    </div>
                                                    {/* Row 2: Key numbers */}
                                                    <div className="grid grid-cols-3 gap-2 text-center">
                                                        <div>
                                                            <div className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)] uppercase">{dict.allocatedCap}</div>
                                                            <div className="text-xs font-bold text-slate-300 font-[family-name:var(--font-jetbrains)] tabular-nums">${allocatedCapital.toLocaleString(undefined, {maximumFractionDigits:0})}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)] uppercase">{dict.shares}</div>
                                                            <div className="text-xs font-bold text-slate-200 font-[family-name:var(--font-jetbrains)] tabular-nums">{targetShares}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)] uppercase">{dict.held}</div>
                                                            <div className="text-xs font-bold text-sky-400 font-[family-name:var(--font-jetbrains)] tabular-nums">{heldQty}</div>
                                                        </div>
                                                    </div>
                                                    {/* Row 3: Adjustment + Price + Action */}
                                                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                        {diffQty > 0 ? (
                                                            <span className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-[family-name:var(--font-jetbrains)]">
                                                                {dict.actionBuy.replace('{shares}', String(diffQty))}
                                                            </span>
                                                        ) : diffQty < 0 ? (
                                                            <span className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/15 font-[family-name:var(--font-jetbrains)]">
                                                                {dict.actionTrim.replace('{shares}', String(Math.abs(diffQty)))}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)]">{dict.rebalanceAligned}</span>
                                                        )}
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-slate-400 font-[family-name:var(--font-jetbrains)] tabular-nums">${livePrice.toFixed(2)}</span>
                                                            <button
                                                                onClick={() => {
                                                                    setQuickAddTicker(item.ticker);
                                                                    setQuickAddPrice(livePrice.toString());
                                                                    setQuickAddQty(heldQty > 0 ? heldQty.toString() : '');
                                                                    setShowQuickAdd(true);
                                                                }}
                                                                className="p-1 rounded bg-[#111827]/60 border border-white/5 hover:border-sky-500/30 text-sky-400 hover:text-sky-300 transition-all"
                                                                title="Quick Add/Update Holding"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                    )}
                                </div>
                            </div>
                            </div>
                    ) : tickers.length === 0 ? (
                        <div className="flex-1 flex flex-col justify-center items-center py-40 gap-4 border border-dashed border-slate-800 rounded-2xl bg-[#0b101c]/20">
                            <AlertCircle className="w-8 h-8 text-slate-600" />
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">No signals found</h2>
                            <p className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)]">Modify DIY parameter slider ranges.</p>
                        </div>
                    ) : (
                        /* Dynamic card grid */
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                            {tickers.map(item => {
                                const score = item.alphaSnapshot?.score || 50;
                                const grade = item.alphaSnapshot?.grade || 'C';
                                const theme = gradeColorMap[grade] || gradeColorMap.B;
                                const live = item.realtime;

                                const wsPriceObj = getPrice(item.ticker);
                                const curPrice = wsPriceObj ? wsPriceObj.price : (live?.price || 0);
                                const putFloor = item.putFloor || 0;
                                const flipLevel = item.gammaFlipLevel || 0;
                                const callWall = item.callWall || 0;

                                let entryTargetMin = 0;
                                let entryTargetMax = 0;
                                if (item.gex != null && item.gex > 0) {
                                    entryTargetMin = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                    entryTargetMax = curPrice * 1.002;
                                } else {
                                    entryTargetMin = putFloor > 0 ? putFloor : curPrice * 0.95;
                                    entryTargetMax = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                }

                                const takeProfit = curPrice * 1.035;
                                const stopLoss = curPrice * 0.985;

                                let convictionTag = dict.neutral;
                                let convictionColor = 'text-slate-400 bg-slate-800/30 border-slate-700/20';
                                if (score >= 80) {
                                    convictionTag = dict.strongBuy;
                                    convictionColor = 'text-emerald-400 bg-emerald-900/20 border-emerald-500/20';
                                } else if (score >= 70) {
                                    convictionTag = dict.callBuy;
                                    convictionColor = 'text-sky-400 bg-sky-900/20 border-sky-500/20';
                                } else if (score <= 35) {
                                    convictionTag = dict.putShort;
                                    convictionColor = 'text-rose-400 bg-rose-900/20 border-rose-500/20';
                                } else if (score < 50) {
                                    convictionTag = dict.avoidLong;
                                    convictionColor = 'text-amber-400 bg-amber-900/20 border-amber-500/20';
                                }

                                return (
                                    <div
                                        key={item.ticker}
                                        className={`p-4 rounded-xl bg-[#111827]/60 backdrop-blur-sm border border-white/5 hover:border-white/10 transition-all flex flex-col gap-3 ${theme.glow}`}
                                    >
                                        {/* Header: Grade + Ticker + Price */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${theme.bg} ${theme.text} ${theme.border}`}>
                                                    {grade}
                                                </span>
                                                <div>
                                                    <span className="text-sm font-bold text-slate-100 font-[family-name:var(--font-jetbrains)] tracking-wide block">{item.ticker}</span>
                                                    <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded border ${convictionColor} font-[family-name:var(--font-inter)]`}>{convictionTag}</span>
                                                </div>
                                            </div>
                                            {live && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-sm font-bold text-slate-100 font-[family-name:var(--font-jetbrains)] tabular-nums">${curPrice.toFixed(2)}</span>
                                                    <span className={`text-xs font-bold font-[family-name:var(--font-jetbrains)] tabular-nums flex items-center gap-0.5 ${
                                                        live.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}>
                                                        {live.changePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {live.changePct >= 0 ? '+' : ''}{live.changePct.toFixed(2)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Context Score */}
                                        <div className="flex items-center gap-3 p-2 rounded-lg bg-[#111827]/40 border border-white/5">
                                            <div className="flex flex-col items-center min-w-[48px]">
                                                <span className={`text-lg font-bold font-[family-name:var(--font-jetbrains)] tabular-nums leading-none ${
                                                    score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-sky-400' : score >= 40 ? 'text-amber-400' : 'text-rose-400'
                                                }`}>{score}</span>
                                                <span className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)] mt-0.5">Score</span>
                                            </div>
                                            <div className="flex-1 flex flex-col gap-1.5">
                                                <div className="h-2 bg-slate-800/50 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            score >= 80 ? 'bg-emerald-400' : score >= 60 ? 'bg-sky-400' : score >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                                                        }`}
                                                        style={{ width: `${score}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between text-[13px] font-[family-name:var(--font-inter)]">
                                                    <span className="text-slate-300">{grade} Grade</span>
                                                    <span className={`font-bold ${score >= 60 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                        {score >= 80 ? 'Strong' : score >= 60 ? 'Bullish' : score >= 40 ? 'Neutral' : 'Bearish'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Analysis */}
                                        <p className="text-[13px] text-slate-200 leading-relaxed font-[family-name:var(--font-inter)]">
                                            {locale === 'ko'
                                                ? item.alphaSnapshot?.whyKR
                                                : locale === 'ja'
                                                    ? (item.alphaSnapshot?.whyJA || item.alphaSnapshot?.why)
                                                    : item.alphaSnapshot?.why
                                             || dict.analyzing}
                                        </p>

                                        {/* Entry / SL / TP row */}
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/10">
                                                <div className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)]">{dict.optimalRange}</div>
                                                <div className="text-xs font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)] tabular-nums">${entryTargetMax.toFixed(2)}</div>
                                            </div>
                                            <div className="p-1.5 rounded bg-rose-500/5 border border-rose-500/10">
                                                <div className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)]">SL -1.5%</div>
                                                <div className="text-xs font-bold text-rose-400 font-[family-name:var(--font-jetbrains)] tabular-nums">${stopLoss.toFixed(2)}</div>
                                            </div>
                                            <div className="p-1.5 rounded bg-sky-500/5 border border-sky-500/10">
                                                <div className="text-[13px] text-slate-300 font-[family-name:var(--font-inter)]">TP +3.5%</div>
                                                <div className="text-xs font-bold text-sky-400 font-[family-name:var(--font-jetbrains)] tabular-nums">${takeProfit.toFixed(2)}</div>
                                            </div>
                                        </div>

                                        {/* Copy button */}
                                        <button
                                            onClick={() => copyBracketToClipboard(item, entryTargetMax, takeProfit, stopLoss)}
                                            className={`w-full h-8 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border font-[family-name:var(--font-inter)] ${
                                                copiedTicker === item.ticker
                                                    ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-[#111827]/40 text-sky-400 border-white/5 hover:border-sky-500/20 hover:bg-[#111827]/60'
                                            }`}
                                        >
                                            {copiedTicker === item.ticker ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    {dict.copyBracketCopied}
                                                </>
                                            ) : (
                                                <>
                                                    <Clipboard className="w-3.5 h-3.5" />
                                                    {dict.copyBracket}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="mt-4 p-3 rounded-xl bg-[#111827]/60 backdrop-blur-sm border border-white/5 flex justify-between items-center">
                            <span className="text-[13px] text-slate-300 font-[family-name:var(--font-jetbrains)] tabular-nums">
                                Page {page}/{totalPages} ({totalCount} matched)
                            </span>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-1.5 rounded-lg bg-[#111827]/40 border border-white/5 hover:border-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-400 hover:text-slate-200"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-1.5 rounded-lg bg-[#111827]/40 border border-white/5 hover:border-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-400 hover:text-slate-200"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* QUICK PORTFOLIO ADD MINI MODAL */}
            {showQuickAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b13]/80 backdrop-blur-md p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-[#0b0f19] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5 shadow-[0_0_50px_rgba(6,182,212,0.15)] relative">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Plus className="w-5 h-5 text-cyan-400" />
                                <h3 className="text-sm font-black text-white tracking-widest uppercase">{dict.quickAddTitle}</h3>
                            </div>
                            <button
                                onClick={() => setShowQuickAdd(false)}
                                className="text-slate-400 hover:text-white font-black text-[13px] uppercase tracking-wider transition-all"
                            >
                                CLOSE
                            </button>
                        </div>

                        <form onSubmit={handleQuickAddSubmit} className="flex flex-col gap-4 font-mono text-[13px]">
                            <div className="flex flex-col gap-1.5">
                                <label className="font-bold text-slate-400 uppercase tracking-widest">TICKER</label>
                                <input
                                    type="text"
                                    value={quickAddTicker}
                                    disabled
                                    className="w-full bg-slate-950/60 border border-slate-800 h-10 px-3.5 rounded-xl font-bold uppercase tracking-wider text-slate-300 select-none opacity-50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="font-bold text-slate-400 uppercase tracking-widest">{dict.quickAddQty}</label>
                                <input
                                    type="number"
                                    required
                                    step="any"
                                    value={quickAddQty}
                                    onChange={(e) => setQuickAddQty(e.target.value)}
                                    placeholder="e.g. 100"
                                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500/50 transition-all outline-none h-10 px-3.5 rounded-xl font-bold text-white"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="font-bold text-slate-400 uppercase tracking-widest">{dict.quickAddPrice}</label>
                                <input
                                    type="number"
                                    required
                                    step="any"
                                    value={quickAddPrice}
                                    onChange={(e) => setQuickAddPrice(e.target.value)}
                                    placeholder="Avg Price (e.g. 150.25)"
                                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500/50 transition-all outline-none h-10 px-3.5 rounded-xl font-bold text-white"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full h-11 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 font-black transition-all flex items-center justify-center gap-2 tracking-widest uppercase mt-2 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                            >
                                <Check className="w-4 h-4" />
                                {dict.quickAddSubmit}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
