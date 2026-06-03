"use client";

import React, { useState, useEffect, useRef, useTransition, useMemo } from 'react';
import { 
    Search, Sliders, Radar, Zap, Shield, ShieldAlert, Activity, 
    TrendingUp, TrendingDown, Target, BarChart3, AlertCircle, 
    ChevronLeft, ChevronRight, Lock, Clipboard, Check, HelpCircle,
    DollarSign, Plus, CheckCircle2
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useRealtimeData } from '@/providers/WebSocketProvider';

// Premium HSL glowing tokens
const gradeColorMap: Record<string, { bg: string, text: string, border: string, glow: string }> = {
    S: { bg: 'bg-emerald-950/40', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-[0_0_15px_rgba(16,185,129,0.25)]' },
    A: { bg: 'bg-cyan-950/40', text: 'text-cyan-400', border: 'border-cyan-500/30', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.25)]' },
    B: { bg: 'bg-slate-950/40', text: 'text-slate-300', border: 'border-slate-800', glow: 'shadow-none' },
    C: { bg: 'bg-slate-950/40', text: 'text-slate-400', border: 'border-slate-800', glow: 'shadow-none' },
    D: { bg: 'bg-amber-950/40', text: 'text-amber-500', border: 'border-amber-500/20', glow: 'shadow-none' },
    F: { bg: 'bg-rose-950/40', text: 'text-rose-400', border: 'border-rose-500/30', glow: 'shadow-[0_0_15px_rgba(244,63,94,0.2)]' },
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

    // 1.1 Real portfolio integration
    const { holdings, summary, addHolding, removeHolding } = usePortfolio();

    // Quick Add Modal States
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [isInjecting, setIsInjecting] = useState(false);

    const handleBatchInject = async () => {
        if (tickers.length === 0 || isInjecting) return;
        setIsInjecting(true);
        try {
            for (const item of tickers) {
                const targetShares = (item as any).targetShares || 0;
                const exec = (item as any).execution || {};
                const avgPrice = exec.entry || item.realtime?.price || 0;
                if (targetShares > 0 && avgPrice > 0) {
                    await addHolding({
                        ticker: item.ticker.toUpperCase(),
                        name: `${item.ticker.toUpperCase()} Asset`,
                        quantity: targetShares,
                        avgPrice: avgPrice,
                    });
                }
            }
        } catch (e) {
            console.error("Failed to batch inject:", e);
        } finally {
            setIsInjecting(false);
        }
    };

    const handleLiquidate = async (ticker: string) => {
        if (isInjecting) return;
        setIsInjecting(true);
        try {
            await removeHolding(ticker);
        } catch (e) {
            console.error("Failed to liquidate:", e);
        } finally {
            setIsInjecting(false);
        }
    };

    const handleRotate = async (lowestTicker: string, highestTicker: TickerData) => {
        if (isInjecting) return;
        setIsInjecting(true);
        try {
            await removeHolding(lowestTicker);
            const targetShares = (highestTicker as any).targetShares || 0;
            const exec = (highestTicker as any).execution || {};
            const avgPrice = exec.entry || highestTicker.realtime?.price || 0;
            if (targetShares > 0 && avgPrice > 0) {
                await addHolding({
                    ticker: highestTicker.ticker.toUpperCase(),
                    name: `${highestTicker.ticker.toUpperCase()} Asset`,
                    quantity: targetShares,
                    avgPrice: avgPrice,
                });
            }
        } catch (e) {
            console.error("Failed to rotate:", e);
        } finally {
            setIsInjecting(false);
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
    const [isAutoPilot, setIsAutoPilot] = useState(false);
    const [totalCapital, setTotalCapital] = useState(50000);
    const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

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

    // Sonar sweep rotation angle
    const sweepAngleRef = useRef(0);

    // Trigger radar sweep animation in a beautiful canvas (Only if admin is authorized)
    useEffect(() => {
        if (!isAdmin) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const drawRadar = () => {
            const width = canvas.width;
            const height = canvas.height;
            const cx = width / 2;
            const cy = height / 2;
            const radius = Math.min(cx, cy) - 4;

            ctx.clearRect(0, 0, width, height);

            // Radar background grid
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
            ctx.lineWidth = 1;

            // Concentric circles
            for (let r = radius / 4; r <= radius; r += radius / 4) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Cross lines
            ctx.beginPath();
            ctx.moveTo(cx - radius, cy);
            ctx.lineTo(cx + radius, cy);
            ctx.moveTo(cx, cy - radius);
            ctx.lineTo(cx, cy + radius);
            ctx.stroke();

            // Sonar Sweep Line
            sweepAngleRef.current = (sweepAngleRef.current + 0.015) % (Math.PI * 2);
            const angle = sweepAngleRef.current;

            const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            gradient.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
            gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, angle - 0.45, angle, false);
            ctx.lineTo(cx, cy);
            ctx.fill();

            // Core sweep indicator line
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            ctx.stroke();

            // Draw floating signals
            tickers.slice(0, 8).forEach((t, idx) => {
                const aOffset = (idx * 0.75) % (Math.PI * 2);
                const tRad = 20 + ((t.alphaSnapshot?.score || 50) / 100) * (radius - 30);
                const tx = cx + Math.cos(aOffset) * tRad;
                const ty = cy + Math.sin(aOffset) * tRad;

                ctx.fillStyle = t.alphaSnapshot?.grade === 'S' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(6, 182, 212, 0.7)';
                ctx.beginPath();
                ctx.arc(tx, ty, 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
                ctx.font = 'bold 8px monospace';
                ctx.fillText(t.ticker, tx + 6, ty + 3);
            });

            animationFrameId = requestAnimationFrame(drawRadar);
        };

        drawRadar();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [tickers, isAdmin]);

    const handleQuickAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quickAddTicker || !quickAddQty || !quickAddPrice) return;
        try {
            await addHolding({
                ticker: quickAddTicker.toUpperCase(),
                name: `${quickAddTicker.toUpperCase()} Asset`,
                quantity: Number(quickAddQty),
                avgPrice: Number(quickAddPrice),
            });
            setShowQuickAdd(false);
            setQuickAddTicker('');
            setQuickAddQty('');
            setQuickAddPrice('');
        } catch (err) {
            console.error('Failed to add holding quick:', err);
        }
    };

    // Handle batch filtering API requests
    const fetchRadarData = () => {
        if (!isAdmin) return;
        setLoading(true);
        const gradesParam = selectedGrades.join(',');
        
        const queryParams = new URLSearchParams(isAutoPilot ? {
            mode: 'auto',
            totalCapital: totalCapital.toString()
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
                    setTotalCount(data.meta.totalCount || 0);
                    setTotalPages(data.meta.totalPages || 1);
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
    }, [scoreMin, selectedGrades, selectedOverlay, sortBy, sortOrder, page, gexMin, pcrMax, darkPoolMin, isAdmin, isAutoPilot, totalCapital]);

    // Auto-refresh polling every 60s in autopilot mode
    useEffect(() => {
        if (!isAutoPilot || !isAdmin) return;
        const interval = setInterval(() => {
            fetchRadarData();
        }, 60_000);
        return () => clearInterval(interval);
    }, [isAutoPilot, isAdmin, totalCapital]);

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

    // Computed Portfolio NAV with Cash
    const totalStockCost = holdings.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
    const cashBalance = Math.max(0, totalCapital - totalStockCost);
    const computedTotalNAV = summary.totalValue + cashBalance;
    const computedPL = computedTotalNAV - totalCapital;
    const computedPLPct = totalCapital > 0 ? (computedPL / totalCapital) * 100 : 0;

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
        <div className="w-full min-h-screen bg-[#05070f] bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,#0f1c3f_0%,#05070f_100%)] text-slate-100 flex flex-col font-jakarta relative overflow-hidden">
            {/* Ambient cyber lights */}
            <div className="absolute top-[-300px] left-[-300px] w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-300px] right-[-300px] w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />

            {/* RADAR WORKSPACE ROW */}
            <div className="flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 py-6 flex flex-col xl:flex-row gap-6 relative z-10">
                
                {/* SIDEBAR: DIY Screener Console */}
                <div className="w-full xl:w-80 shrink-0 flex flex-col gap-6">
                    {/* Header Panel */}
                    <div className="p-5 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                <Radar className="w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                                <h1 className="text-sm font-black tracking-widest text-white uppercase">QUANT COCKPIT</h1>
                                <p className="text-[13px] font-bold text-emerald-400 tracking-wider">⚡ LIVE PROPRIETARY RADAR</p>
                            </div>
                        </div>

                        {/* Radial Radar sweep canvas */}
                        <div className="flex justify-center items-center py-2 bg-slate-950/40 border border-slate-900 rounded-xl relative">
                            <canvas ref={canvasRef} width={180} height={180} className="w-[180px] h-[180px]" />
                            <div className="absolute bottom-2 text-[13px] font-mono text-cyan-400 tracking-widest uppercase animate-pulse">
                                COCKPIT ENGAGED
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
                                    onClick={() => { setIsAutoPilot(!isAutoPilot); setPage(1); }}
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
                                <div className="flex flex-col gap-1.5 pt-2 border-t border-cyan-500/10">
                                    <label className="text-[13px] font-bold tracking-widest text-slate-400 uppercase">Trading Capital (USD)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 font-mono font-bold text-[13px]">$</span>
                                        <input 
                                            type="number"
                                            value={totalCapital}
                                            onChange={(e) => setTotalCapital(Math.max(100, Number(e.target.value)))}
                                            className="w-full pl-7 pr-3 h-8 bg-slate-950/80 border border-cyan-500/20 focus:border-cyan-500/50 transition-all outline-none rounded-lg text-[13px] font-mono font-bold text-white"
                                        />
                                    </div>
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
                                    <div className="flex justify-between text-[14px] font-bold text-slate-500 uppercase">
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
                                    <div className="flex justify-between text-[14px] font-bold text-slate-500 uppercase">
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

                {/* CENTRAL AREA: High-density radar scanner grid */}
                <div className="flex-1 flex flex-col gap-4">
                    {/* Toolbar header */}
                    <div className="p-4 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-cyan-400" />
                            <span className="text-[13px] font-bold text-white tracking-widest uppercase">
                                PROPRIETARY QUANT COCKPIT
                            </span>
                            {isPending && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
                        </div>

                        {/* Sort mechanisms */}
                        <div className="flex items-center gap-2 font-mono text-[13px]">
                            <span className="text-slate-500">SORT BY:</span>
                            {['score', 'rsi', 'volume', 'gex'].map(s => {
                                const active = sortBy === s;
                                return (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            if (sortBy === s) {
                                                setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                                            } else {
                                                setSortBy(s);
                                                setSortOrder('desc');
                                            }
                                            setPage(1);
                                        }}
                                        className={`px-2.5 py-1 rounded transition-all uppercase font-bold ${
                                            active 
                                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        {s === 'score' ? 'Context Score' : s}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Loader */}
                    {loading ? (
                        <div className="flex-1 flex flex-col justify-center items-center py-40 gap-4">
                            <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                            <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Running proprietary filters...</p>
                        </div>
                    ) : isAutoPilot ? (
                        /* AUTONOMOUS ALLOCATION MATRIX (ENGAGED) */
                        <div className="flex flex-col gap-6">
                            {/* PREMIUM REAL PORTFOLIO EVAL HUD BAR */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#0d1527] to-[#090f1a] border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.08)] backdrop-blur-md animate-[fadeIn_0.4s_ease-out]">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                                        <DollarSign className="w-5 h-5 animate-pulse" />
                                    </div>
                                    <div className="truncate">
                                        <span className="text-[13px] font-bold text-slate-400 uppercase tracking-widest block whitespace-nowrap">{dict.realAssetStatus}</span>
                                        <span className="text-xs font-black text-cyan-400 tracking-wider whitespace-nowrap">PORTFOLIO TRACKING ACTIVE</span>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-slate-800/80 sm:pl-6 py-2 sm:py-0 min-w-0">
                                    <span className="text-[13px] font-bold text-slate-500 uppercase tracking-widest block whitespace-nowrap">
                                        {dict.tradingCapitalLabel} / {dict.cashLabel}
                                    </span>
                                    <span className="text-sm font-black text-white font-mono mt-0.5 whitespace-nowrap">
                                        ${totalCapital.toLocaleString()} / <span className="text-cyan-400">${cashBalance.toLocaleString(undefined, {maximumFractionDigits:2})}</span>
                                    </span>
                                </div>

                                <div className="flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-slate-800/80 lg:pl-6 py-2 lg:py-0 min-w-0">
                                    <span className="text-[13px] font-bold text-slate-500 uppercase tracking-widest block whitespace-nowrap">{dict.navLabel}</span>
                                    <span className="text-base font-black text-white font-mono mt-0.5 whitespace-nowrap">${computedTotalNAV.toLocaleString(undefined, {maximumFractionDigits:2})}</span>
                                </div>

                                <div className="flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-slate-800/80 lg:pl-6 py-2 lg:py-0 min-w-0">
                                    <span className="text-[13px] font-bold text-slate-500 uppercase tracking-widest block whitespace-nowrap">{dict.totalReturnLabel}</span>
                                    <span className={`text-base font-black font-mono mt-0.5 flex items-center gap-1.5 whitespace-nowrap ${
                                        computedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }`}>
                                        {computedPL >= 0 ? '+' : ''}
                                        ${computedPL.toLocaleString(undefined, {maximumFractionDigits:2})}
                                        <span className="text-xs font-bold">
                                            ({computedPL >= 0 ? '+' : ''}{computedPLPct.toFixed(2)}%)
                                        </span>
                                    </span>
                                </div>
                            </div>

                            {/* Header with Master Copy */}
                            <div className="p-5 rounded-2xl bg-[#0b101c]/80 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)] backdrop-blur-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-[fadeIn_0.4s_ease-out]">
                                <div>
                                    <div className="flex items-center gap-2 text-cyan-400 font-black tracking-wider text-[13px]">
                                        <Zap className="w-3.5 h-3.5 animate-pulse" />
                                        AUTONOMOUS ALLOCATION MATRIX (ZERO-BIAS)
                                    </div>
                                    <p className="text-[13px] text-slate-400 font-mono mt-1 uppercase tracking-widest leading-relaxed">
                                        Mathematical portfolio construction based on Kelly Expectancy & Inverse Volatility Risk Parity
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

<div className="flex flex-col gap-6 w-full animate-[fadeIn_0.4s_ease-out]">
                                {/* 1. PLAYBOOK & ALIGNMENT SECTION (MOVED TO TOP) */}
                                {(() => {
                                     const decayPositions = holdings.filter((h: any) => h.alphaScore !== undefined && h.alphaScore < 50);

                                     const sortedHoldingsByScore = [...holdings]
                                         .filter((h: any) => h.alphaScore !== undefined)
                                         .sort((a: any, b: any) => (a.alphaScore || 0) - (b.alphaScore || 0));
                                     const lowestScoreHolding = sortedHoldingsByScore[0];

                                     const sortedScannedByScore = [...sortedTickers]
                                         .filter((t: any) => t.alphaSnapshot?.score !== undefined)
                                         .sort((a: any, b: any) => (b.alphaSnapshot?.score || 0) - (a.alphaSnapshot?.score || 0));
                                     const highestScoreScanned = sortedScannedByScore.find((t: any) => !holdings.some((h: any) => h.ticker.toUpperCase() === t.ticker.toUpperCase()));

                                     const hasHoldings = holdings.length > 0;

                                     // Filter trimming and buying tickers for the checklist
                                     const trimsList = sortedTickers
                                         .map((item: any) => {
                                             const targetShares = (item as any).targetShares || 0;
                                             const heldObj = holdings.find((h: any) => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                                             const heldQty = heldObj ? heldObj.quantity : 0;
                                             const diffQty = targetShares - heldQty;
                                             const wsPriceObj = getPrice(item.ticker);
                                             const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot?.score || 50, item };
                                         })
                                         .filter((x: any) => x.diffQty < 0);

                                     const buysList = sortedTickers
                                         .map((item: any) => {
                                             const targetShares = (item as any).targetShares || 0;
                                             const heldObj = holdings.find((h: any) => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                                             const heldQty = heldObj ? heldObj.quantity : 0;
                                             const diffQty = targetShares - heldQty;
                                             const wsPriceObj = getPrice(item.ticker);
                                             const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot?.score || 50, item };
                                         })
                                         .filter((x: any) => x.diffQty > 0)
                                         .sort((a: any, b: any) => b.score - a.score);
                                     
                                     const isStep1Done = trimsList.length === 0 || trimsList.every((x: any) => completedSteps['sell-' + x.ticker]);
                                     const isStep2Done = buysList.length === 0 || buysList.every((x: any) => completedSteps['buy-' + x.ticker]);

                                     return (
                                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                                              {/* 1. LIVE ALIGNMENT PROGRESS HUD */}
                                              <div className="lg:col-span-1 p-5 rounded-2xl bg-[#0b101c]/80 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)] backdrop-blur-md flex flex-col justify-between gap-3.5">
                                                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                                                      <span className="text-[13px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                                                          <Target className="w-4 h-4 text-cyan-400 animate-pulse" />
                                                          PORTFOLIO ALIGNMENT PROGRESS
                                                      </span>
                                                      <span className="text-cyan-400 font-mono font-black text-sm">{liveAlignmentProgress}%</span>
                                                  </div>
                                                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-900 relative my-auto">
                                                      <div 
                                                          className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                                                          style={{ width: `${liveAlignmentProgress}%` }}
                                                      />
                                                  </div>
                                                  {liveAlignmentProgress === 100 ? (
                                                      <div className="text-[13px] text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-500/10">
                                                          <Check className="w-4 h-4 shrink-0" />
                                                          PORTFOLIO PERFECTLY ALIGNED (실제 보유량이 모델 비중과 100% 완벽히 일치합니다!)
                                                      </div>
                                                  ) : (
                                                      <p className="text-[12px] text-slate-400 leading-normal">
                                                          실시간 시세 변동을 반영한 정합률입니다. 아래 3단계 플레이북을 순서대로 복사하여 주문을 집행하면 정합도가 올라갑니다.
                                                      </p>
                                                  )}
                                              </div>

                                              {/* 2. STEP-BY-STEP PLAYBOOK SECTION */}
                                              <div className="lg:col-span-2 p-5 rounded-2xl bg-gradient-to-br from-[#0b101c] to-[#0f172a] border border-slate-800 backdrop-blur-md flex flex-col gap-4 relative overflow-hidden">
                                                  <h3 className="text-[13px] font-black tracking-widest text-white uppercase border-b border-slate-800/80 pb-3 flex items-center justify-between">
                                                      <span className="flex items-center gap-2">
                                                          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                                                          🎯 REBALANCE SCENARIO ROADMAP
                                                      </span>
                                                      <span className="text-[11px] font-mono text-cyan-400 tracking-wider">SEQUENTIAL</span>
                                                  </h3>

                                                  <div className="relative border-l border-slate-800/80 ml-3 pl-6 space-y-7 py-1">
                                                      {/* STEP 1: SELL / TRIM */}
                                                      <div className="flex flex-col gap-2.5 relative">
                                                          <div className="absolute -left-[37px] top-0 w-6 h-6 rounded-full flex items-center justify-center font-mono font-black text-[11px] transition-all duration-300 z-10 select-none shadow-sm">
                                                              {isStep1Done ? (
                                                                  <div className="w-full h-full rounded-full bg-emerald-950/90 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                                                                      <Check className="w-3.5 h-3.5" />
                                                                  </div>
                                                              ) : (
                                                                  <div className="w-full h-full rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.3)] animate-pulse">
                                                                      1
                                                                  </div>
                                                              )}
                                                          </div>
                                                          <div className="flex items-center justify-between">
                                                              <span className="text-[13px] font-black text-rose-400 tracking-widest uppercase flex items-center gap-1.5">
                                                                  STEP 1: 자금 확보 및 매도 (SELL / TRIM)
                                                              </span>
                                                          </div>
                                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                                                              {trimsList.length === 0 ? (
                                                                  <div className="col-span-full p-3 rounded-xl bg-emerald-950/15 border border-emerald-500/20 flex items-center gap-2 text-[13px] text-emerald-400 font-bold">
                                                                      <Check className="w-3.5 h-3.5 shrink-0" />
                                                                      확보할 현금 자산 없음 (추가 매도/축소 종목 없음)
                                                                  </div>
                                                              ) : (
                                                                  trimsList.map((x: any) => {
                                                                      const key = 'sell-' + x.ticker;
                                                                      const isDone = !!completedSteps[key];
                                                                      const refundCash = Math.abs(x.diffQty) * x.livePrice;
                                                                      return (
                                                                          <div key={x.ticker} className={'p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative ' + (
                                                                              isDone ? 'bg-slate-950/20 border-slate-905 opacity-50' : 'bg-slate-950/60 border-slate-900 hover:border-slate-800'
                                                                          )}>
                                                                              <div className="flex justify-between items-start">
                                                                                  <div className="flex items-center gap-2">
                                                                                      <TickerLogo ticker={x.ticker} className="w-5 h-5" />
                                                                                      <span className="font-mono font-black text-white text-[13px] uppercase tracking-wider">{x.ticker}</span>
                                                                                      <span className="text-[11px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded font-black border border-rose-500/20">
                                                                                          축소 -{Math.abs(x.diffQty)}주
                                                                                      </span>
                                                                                  </div>
                                                                                  <button 
                                                                                      onClick={() => setCompletedSteps(prev => ({ ...prev, [key]: !prev[key] }))}
                                                                                      className={'px-2 py-0.5 rounded text-[11px] font-black transition-all flex items-center gap-1 ' + (
                                                                                          isDone 
                                                                                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/20' 
                                                                                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                                                                      )}
                                                                                  >
                                                                                      {isDone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
                                                                                      {isDone ? '매도완료' : '미실행'}
                                                                                  </button>
                                                                              </div>
                                                                              <p className="text-[12px] text-slate-400 font-jakarta leading-normal">
                                                                                  보유 수량을 <span className="font-bold text-slate-300 font-mono">{x.heldQty}주</span>에서 최적 목표치인 <span className="font-bold text-slate-300 font-mono">{x.targetShares}주</span>로 축소하여 현금을 확보하십시오.
                                                                              </p>
                                                                              <div className="flex justify-between items-center pt-2 border-t border-slate-900/60 mt-1">
                                                                                  <div className="font-mono text-[12px]">
                                                                                      <span className="text-slate-500">회수 현금:</span> <span className="text-rose-400 font-bold">${refundCash.toLocaleString(undefined, {maximumFractionDigits:1})}</span>
                                                                                  </div>
                                                                                  <button 
                                                                                      onClick={() => {
                                                                                          const exec = (x.item as any).execution || {};
                                                                                          copyBracketToClipboard(x.item, x.livePrice, exec.takeProfit || 0, exec.stopLoss || 0);
                                                                                      }}
                                                                                      className="h-7 px-2 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500/35 text-[11px] font-black text-cyan-400 hover:text-white transition-all uppercase tracking-wider flex items-center gap-1 font-mono"
                                                                                  >
                                                                                      <Clipboard className="w-3 h-3" />
                                                                                      COPY
                                                                                  </button>
                                                                              </div>
                                                                          </div>
                                                                      );
                                                                  })
                                                              )}
                                                          </div>
                                                      </div>

                                                      {/* STEP 2: BUY / ACCUMULATE */}
                                                      <div className="flex flex-col gap-2.5 relative pt-3 border-t border-slate-900">
                                                          <div className="absolute -left-[37px] top-3 w-6 h-6 rounded-full flex items-center justify-center font-mono font-black text-[11px] transition-all duration-300 z-10 select-none shadow-sm">
                                                              {isStep2Done ? (
                                                                  <div className="w-full h-full rounded-full bg-emerald-950/90 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                                                                      <Check className="w-3.5 h-3.5" />
                                                                  </div>
                                                              ) : (
                                                                  <div className={'w-full h-full rounded-full flex items-center justify-center ' + (
                                                                      isStep1Done 
                                                                          ? 'bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-[0_0_8px_rgba(34,211,238,0.35)] animate-pulse' 
                                                                          : 'bg-slate-900 border border-slate-800 text-slate-500'
                                                                  )}>
                                                                      2
                                                                  </div>
                                                              )}
                                                          </div>
                                                          <div className="flex items-center justify-between">
                                                              <span className="text-[13px] font-black text-emerald-400 tracking-widest uppercase flex items-center gap-1.5">
                                                                  STEP 2: 자금 집행 및 매수 (BUY / ACCUMULATE)
                                                              </span>
                                                          </div>
                                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                                                              {buysList.length === 0 ? (
                                                                  <div className="col-span-full p-3 rounded-xl bg-emerald-950/15 border border-emerald-500/20 flex items-center gap-2 text-[13px] text-emerald-400 font-bold">
                                                                      <Check className="w-3.5 h-3.5 shrink-0" />
                                                                      매수 대기 자산 없음 (추가 매수 필요 종목 없음)
                                                                  </div>
                                                              ) : (
                                                                  buysList.map((x: any) => {
                                                                      const key = 'buy-' + x.ticker;
                                                                      const isDone = !!completedSteps[key];
                                                                      const orderCost = x.diffQty * x.livePrice;
                                                                      return (
                                                                          <div key={x.ticker} className={'p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative ' + (
                                                                              isDone ? 'bg-slate-950/20 border-slate-905 opacity-50' : 'bg-slate-950/60 border-slate-900 hover:border-slate-800'
                                                                          )}>
                                                                              <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 text-[10px] font-black rounded-bl border-l border-b border-cyan-500/20">
                                                                                  SCORE {x.score}
                                                                              </div>
                                                                              <div className="flex justify-between items-start pr-12">
                                                                                  <div className="flex items-center gap-2">
                                                                                      <TickerLogo ticker={x.ticker} className="w-5 h-5" />
                                                                                      <span className="font-mono font-black text-white text-[13px] uppercase tracking-wider">{x.ticker}</span>
                                                                                      <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-black border border-emerald-500/20">
                                                                                          매수 +{x.diffQty}주
                                                                                      </span>
                                                                                  </div>
                                                                                  <button 
                                                                                      onClick={() => setCompletedSteps(prev => ({ ...prev, [key]: !prev[key] }))}
                                                                                      className={'px-2 py-0.5 rounded text-[11px] font-black transition-all flex items-center gap-1 ' + (
                                                                                          isDone 
                                                                                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/20' 
                                                                                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                                                                      )}
                                                                                  >
                                                                                      {isDone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
                                                                                      {isDone ? '매수완료' : '미실행'}
                                                                                  </button>
                                                                              </div>
                                                                              <p className="text-[12px] text-slate-400 font-jakarta leading-normal">
                                                                                  확보한 현금에서 지정가 이하로 <span className="font-bold text-slate-300 font-mono">{x.diffQty}주</span>를 매수하여 최적 비중인 <span className="font-bold text-slate-300 font-mono">{x.targetShares}주</span>를 채우십시오.
                                                                              </p>
                                                                              <div className="flex justify-between items-center pt-2 border-t border-slate-900/60 mt-1">
                                                                                  <div className="font-mono text-[12px]">
                                                                                      <span className="text-slate-500">필요 자금:</span> <span className="text-emerald-400 font-bold">${orderCost.toLocaleString(undefined, {maximumFractionDigits:1})}</span>
                                                                                  </div>
                                                                                  <button 
                                                                                      onClick={() => {
                                                                                          const exec = (x.item as any).execution || {};
                                                                                          copyBracketToClipboard(x.item, x.livePrice, exec.takeProfit || 0, exec.stopLoss || 0);
                                                                                      }}
                                                                                      className="h-7 px-2 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500/35 text-[11px] font-black text-cyan-400 hover:text-white transition-all uppercase tracking-wider flex items-center gap-1 font-mono"
                                                                                  >
                                                                                      <Clipboard className="w-3.5 h-3.5" />
                                                                                      COPY
                                                                                  </button>
                                                                              </div>
                                                                          </div>
                                                                      );
                                                                  })
                                                              )}
                                                          </div>
                                                      </div>

                                                      {/* STEP 3: YIELD ROTATION */}
                                                      <div className="flex flex-col gap-2.5 relative pt-3 border-t border-slate-900">
                                                          <div className="absolute -left-[37px] top-3 w-6 h-6 rounded-full flex items-center justify-center font-mono font-black text-[11px] transition-all duration-300 z-10 select-none shadow-sm">
                                                              <div className={'w-full h-full rounded-full flex items-center justify-center ' + (
                                                                  isStep1Done && isStep2Done 
                                                                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.35)] animate-pulse' 
                                                                      : 'bg-slate-950 border border-slate-900 text-slate-500'
                                                              )}>
                                                                  3
                                                              </div>
                                                          </div>
                                                          <div className="flex items-center justify-between">
                                                              <span className="text-[13px] font-black text-cyan-400 tracking-widest uppercase flex items-center gap-1.5">
                                                                  STEP 3: 기대값 교체 및 로테이션 (YIELD ROTATION)
                                                              </span>
                                                          </div>
                                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                                                              {!hasHoldings ? (
                                                                  <div className="col-span-full p-3.5 rounded-xl bg-slate-950/40 border border-slate-900 flex flex-col gap-3 font-jakarta">
                                                                      <p className="text-[12px] text-slate-400 leading-normal">
                                                                          포트폴리오에 실보유 내역이 등록되지 않았습니다. 우선 6종목의 최적 포지션 배분을 일괄 계좌에 주입하여 시작해 보세요.
                                                                      </p>
                                                                      <button
                                                                          onClick={handleBatchInject}
                                                                          disabled={isInjecting || tickers.length === 0}
                                                                          className="w-full h-10 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:bg-slate-900 disabled:opacity-40 text-emerald-400 disabled:text-slate-500 border border-emerald-500/30 disabled:border-slate-800 font-black transition-all flex items-center justify-center gap-1.5 tracking-widest uppercase text-[12px]"
                                                                      >
                                                                          {isInjecting ? (
                                                                              <div className="w-3.5 h-3.5 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
                                                                          ) : (
                                                                              <Plus className="w-3.5 h-3.5" />
                                                                          )}
                                                                          {dict.batchInjectBtn}
                                                                      </button>
                                                                  </div>
                                                              ) : (
                                                                  <>
                                                                      {/* Decay positions warning */}
                                                                      {decayPositions.length > 0 ? (
                                                                          <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col gap-2">
                                                                              <div className="flex items-center gap-1 text-rose-400 font-bold text-[12px] uppercase tracking-wider font-mono">
                                                                                  <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                                                                                  스코어 붕괴 청산 신호 (LIQUIDATION)
                                                                              </div>
                                                                              <p className="text-[12px] text-slate-300 leading-relaxed font-mono">
                                                                                  보유 중인 {decayPositions.map((h: any) => h.ticker + ' (' + h.alphaScore + ')').join(', ')}의 스코어가 안전 한계값 50 미만으로 붕괴했습니다. 즉시 청산하십시오.
                                                                              </p>
                                                                              <button
                                                                                  onClick={async () => {
                                                                                      if (isInjecting) return;
                                                                                      setIsInjecting(true);
                                                                                      try {
                                                                                          for (const h of decayPositions) {
                                                                                              await removeHolding(h.ticker);
                                                                                          }
                                                                                      } finally {
                                                                                          setIsInjecting(false);
                                                                                      }
                                                                                  }}
                                                                                  disabled={isInjecting}
                                                                                  className="w-full h-9 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-black transition-all flex items-center justify-center gap-1 tracking-wider uppercase text-[12px]"
                                                                              >
                                                                                  {isInjecting ? (
                                                                                      <div className="w-3 h-3 border-2 border-rose-500/20 border-t-rose-400 rounded-full animate-spin" />
                                                                                  ) : (
                                                                                      <AlertCircle className="w-3 h-3" />
                                                                                  )}
                                                                                  {dict.liquidateBtn}
                                                                              </button>
                                                                          </div>
                                                                      ) : null}

                                                                      {/* Rotation Opportunity */}
                                                                      {lowestScoreHolding && highestScoreScanned && ((highestScoreScanned.alphaSnapshot?.score || 0) > (lowestScoreHolding.alphaScore || 0)) ? (
                                                                          <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex flex-col gap-2.5 font-mono">
                                                                              <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[12px] uppercase tracking-wider">
                                                                                  <Zap className="w-3.5 h-3.5 animate-pulse" />
                                                                                  최적 기회비용 교체 (ROTATION SWAP)
                                                                              </div>
                                                                              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                                                                                  <div className="flex flex-col">
                                                                                      <span className="text-rose-400 font-bold">{lowestScoreHolding.ticker}</span>
                                                                                      <span className="text-[11px] text-slate-500">Score {lowestScoreHolding.alphaScore}</span>
                                                                                  </div>
                                                                                  <span className="text-slate-500 font-bold">➔</span>
                                                                                  <div className="flex flex-col">
                                                                                      <span className="text-emerald-400 font-bold">{highestScoreScanned.ticker}</span>
                                                                                      <span className="text-[11px] text-slate-500">Score {highestScoreScanned.alphaSnapshot?.score || 0}</span>
                                                                                  </div>
                                                                              </div>
                                                                              <p className="text-[12px] text-slate-400 leading-normal font-jakarta">
                                                                                  기대치가 가장 저조한 보유 주식 {lowestScoreHolding.ticker}를 정리하고, 스캐너 1위인 고기대값 주식 {highestScoreScanned.ticker}로 자동 교체하여 복리 이익을 보존하십시오.
                                                                              </p>
                                                                              <button
                                                                                  onClick={() => handleRotate(lowestScoreHolding.ticker, highestScoreScanned)}
                                                                                  disabled={isInjecting}
                                                                                  className="w-full h-9 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 font-black transition-all flex items-center justify-center gap-1.5 tracking-wider uppercase text-[12px]"
                                                                              >
                                                                                  {isInjecting ? (
                                                                                      <div className="w-3 h-3 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                                                                                  ) : (
                                                                                      <Zap className="w-3 h-3" />
                                                                                  )}
                                                                                  {dict.executeRotationBtn}
                                                                              </button>
                                                                          </div>
                                                                      ) : (
                                                                          <div className={`p-3.5 rounded-xl bg-slate-950/30 border border-slate-900 flex flex-col gap-1.5 font-jakarta ${decayPositions.length === 0 ? 'col-span-full' : ''}`}>
                                                                              <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[12px] uppercase tracking-wider">
                                                                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                                                  기대값 정렬 최적화 완료
                                                                              </div>
                                                                              <p className="text-[12px] text-slate-500 leading-normal">
                                                                                  현재 보유 유망주 대비 기회비용 교체가 유효한 신규 스코어 스프레드가 없습니다. 보유 종목 구성을 편안하게 유지하십시오.
                                                                                  {!decayPositions.length && <span className="text-emerald-400 block mt-1.5 font-bold">✅ 모든 보유 지표 최상급 유지 중</span>}
                                                                              </p>
                                                                          </div>
                                                                      )}
                                                                  </>
                                                              )}
                                                          </div>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                     );
                                 })()}

                                {/* 2. OPTIMAL PORTFOLIO WEIGHTS TABLE (FULL WIDTH) */}
                                <div className="p-5 rounded-2xl bg-gradient-to-b from-[#0f172a] to-[#0b101c] border border-slate-800 backdrop-blur-md flex flex-col gap-4 overflow-x-auto shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                                    <h3 className="text-[13px] font-black tracking-widest text-white uppercase border-b border-slate-800/80 pb-3 flex items-center gap-2">
                                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                        {dict.optimalWeights}
                                    </h3>

                                    {/* 초보자를 위한 오토파일럿 실전 주문 3단계 가이드 */}
                                    <div className="p-4 rounded-2xl bg-[#090e18]/80 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)] backdrop-blur-md flex flex-col gap-3">
                                        <div className="flex items-center gap-2 text-cyan-400 font-black text-[13px] uppercase tracking-widest">
                                            <HelpCircle className="w-4 h-4 text-cyan-400 animate-pulse" />
                                            {dict.guideTitle}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px] text-slate-300 leading-normal font-jakarta">
                                            <div className="bg-slate-950/65 p-4 rounded-xl border border-slate-900/60 flex flex-col gap-1.5 hover:border-cyan-500/30 hover:bg-slate-900/40 transition-all duration-300 group shadow-inner">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-black text-[11px] group-hover:scale-105 transition-transform">1</span>
                                                    <strong className="text-white font-bold group-hover:text-cyan-400 transition-colors">{dict.guide1Title}</strong>
                                                </div>
                                                <p className="text-slate-400 text-[12px] mt-0.5 leading-relaxed group-hover:text-slate-300 transition-colors">{dict.guide1Desc}</p>
                                            </div>
                                            <div className="bg-slate-950/65 p-4 rounded-xl border border-slate-900/60 flex flex-col gap-1.5 hover:border-cyan-500/30 hover:bg-slate-900/40 transition-all duration-300 group shadow-inner">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-[11px] group-hover:scale-105 transition-transform">2</span>
                                                    <strong className="text-white font-bold group-hover:text-cyan-400 transition-colors">{dict.guide2Title}</strong>
                                                </div>
                                                <p className="text-slate-400 text-[12px] mt-0.5 leading-relaxed group-hover:text-slate-300 transition-colors">{dict.guide2Desc}</p>
                                            </div>
                                            <div className="bg-slate-950/65 p-4 rounded-xl border border-slate-900/60 flex flex-col gap-1.5 hover:border-cyan-500/30 hover:bg-slate-900/40 transition-all duration-300 group shadow-inner">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-black text-[11px] group-hover:scale-105 transition-transform">3</span>
                                                    <strong className="text-white font-bold group-hover:text-cyan-400 transition-colors">{dict.guide3Title}</strong>
                                                </div>
                                                <p className="text-slate-400 text-[12px] mt-0.5 leading-relaxed group-hover:text-slate-300 transition-colors">{dict.guide3Desc}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <table className="w-full text-left border-collapse text-[13px] font-mono">
                                        <thead>
                                            <tr className="border-b border-slate-800/80 text-slate-500 font-bold uppercase tracking-wider text-[13px]">
                                                <th className="py-2.5">{dict.grade}</th>
                                                <th className="py-2.5">{dict.ticker}</th>
                                                <th className="py-2.5 text-right">{dict.weight}</th>
                                                <th className="py-2.5 text-right">{dict.allocatedCap}</th>
                                                <th className="py-2.5 text-right">{dict.shares}</th>
                                                <th className="py-2.5 text-right text-cyan-400">{dict.held}</th>
                                                <th className="py-2.5 text-center text-cyan-400">{dict.adjustment}</th>
                                                <th className="py-2.5 text-right">{dict.livePrice}</th>
                                                <th className="py-2.5 text-center">{dict.expectedBands}</th>
                                                <th className="py-2.5 text-center">{dict.riskReward}</th>
                                                <th className="py-2.5 text-center">ACTION</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedTickers.map((item: any) => {
                                                const grade = item.alphaSnapshot?.grade || 'B';
                                                const theme = gradeColorMap[grade] || gradeColorMap.B;
                                                const weightPct = (((item as any).weight || 0) * 100).toFixed(1);
                                                const allocatedCapital = (item as any).allocatedCapital || 0;
                                                const targetShares = (item as any).targetShares || 0;
                                                const wsPriceObj = getPrice(item.ticker);
                                                const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                                const exec = (item as any).execution || {};

                                                // Calculate real-time held & adjustment
                                                const heldObj = holdings.find((h: any) => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                                                const heldQty = heldObj ? heldObj.quantity : 0;
                                                const diffQty = targetShares - heldQty;

                                                return (
                                                    <tr key={item.ticker} className="border-b border-slate-800/40 hover:bg-slate-900/10 transition-colors">
                                                        <td className="py-3">
                                                            <span className={`px-1.5 py-0.5 rounded font-black text-[13px] ${theme.bg} ${theme.text} ${theme.border}`}>
                                                                {grade}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 font-bold text-white tracking-wider uppercase">
                                                            <div className="flex items-center gap-2">
                                                                <TickerLogo ticker={item.ticker} className="w-5 h-5" />
                                                                <span>{item.ticker}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 text-right font-bold text-cyan-400">{weightPct}%</td>
                                                        <td className="py-3 text-right text-slate-300">${allocatedCapital.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                                                        <td className="py-3 text-right font-black text-slate-200">{targetShares}</td>
                                                        <td className="py-3 text-right font-bold text-cyan-500">{heldQty}</td>
                                                        <td className="py-3 text-center">
                                                            {diffQty > 0 ? (
                                                                <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 text-[13px] font-black tracking-wider uppercase">
                                                                    {dict.actionBuy.replace('{shares}', String(diffQty))}
                                                                </span>
                                                            ) : diffQty < 0 ? (
                                                                <span className="px-2 py-0.5 rounded bg-rose-950/40 text-rose-400 border border-rose-500/20 text-[13px] font-black tracking-wider uppercase">
                                                                    {dict.actionTrim.replace('{shares}', String(Math.abs(diffQty)))}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-500 text-[13px]">
                                                                    {dict.rebalanceAligned}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 text-right text-slate-400">${livePrice.toFixed(2)}</td>
                                                        <td className="py-3 text-center">
                                                            <div className="flex justify-center items-center gap-1.5">
                                                                <span className="text-emerald-400">${exec.entry?.toFixed(2)}</span>
                                                                <span className="text-slate-600">/</span>
                                                                <span className="text-rose-400">${exec.stopLoss?.toFixed(2)}</span>
                                                                <span className="text-slate-600">/</span>
                                                                <span className="text-cyan-400">${exec.takeProfit?.toFixed(2)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 text-center font-bold text-emerald-400">{exec.riskRewardRatio}</td>
                                                        <td className="py-3 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    setQuickAddTicker(item.ticker);
                                                                    setQuickAddPrice(livePrice.toString());
                                                                    setQuickAddQty(heldQty > 0 ? heldQty.toString() : '');
                                                                    setShowQuickAdd(true);
                                                                }}
                                                                className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-cyan-400 hover:text-white transition-all shadow-sm"
                                                                title="Quick Add/Update Holding"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            </div>
                    ) : tickers.length === 0 ? (
                        <div className="flex-1 flex flex-col justify-center items-center py-40 gap-4 border border-dashed border-slate-800 rounded-2xl bg-[#0b101c]/20">
                            <AlertCircle className="w-8 h-8 text-slate-600" />
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">No signals found</h2>
                            <p className="text-[13px] text-slate-500 font-mono">Modify DIY parameter slider ranges.</p>
                        </div>
                    ) : (
                        /* Dynamic card grid */
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
                            {tickers.map(item => {
                                const score = item.alphaSnapshot?.score || 50;
                                const grade = item.alphaSnapshot?.grade || 'C';
                                const theme = gradeColorMap[grade] || gradeColorMap.B;
                                const live = item.realtime;

                                // SUGGESTED TARGET CALCULATION (Support Option Level support)
                                const wsPriceObj = getPrice(item.ticker);
                                const curPrice = wsPriceObj ? wsPriceObj.price : (live?.price || 0);
                                const putFloor = item.putFloor || 0;
                                const flipLevel = item.gammaFlipLevel || 0;
                                const callWall = item.callWall || 0;

                                // Optimal buy support zone
                                let entryTargetMin = 0;
                                let entryTargetMax = 0;
                                if (item.gex != null && item.gex > 0) {
                                    entryTargetMin = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                    entryTargetMax = curPrice * 1.002;
                                } else {
                                    entryTargetMin = putFloor > 0 ? putFloor : curPrice * 0.95;
                                    entryTargetMax = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                }

                                // 3-Barrier Path simulations stats (+3.5% Take-Profit, -1.5% Stop-Loss)
                                const takeProfit = curPrice * 1.035;
                                const stopLoss = curPrice * 0.985;

                                // ───────────── DIRECT CONVICTION TRADE SIGNALS (BYPASSING DIYS) ─────────────
                                let convictionTag = dict.neutral;
                                let convictionColor = 'bg-slate-900 border-slate-800 text-slate-400';
                                if (score >= 80) {
                                    convictionTag = dict.strongBuy;
                                    convictionColor = 'bg-emerald-950/50 border-emerald-500/35 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]';
                                } else if (score >= 70) {
                                    convictionTag = dict.callBuy;
                                    convictionColor = 'bg-cyan-950/50 border-cyan-500/35 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.15)]';
                                } else if (score <= 35) {
                                    convictionTag = dict.putShort;
                                    convictionColor = 'bg-rose-950/50 border-rose-500/35 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]';
                                } else if (score < 50) {
                                    convictionTag = dict.avoidLong;
                                    convictionColor = 'bg-amber-950/40 border-amber-500/25 text-amber-500';
                                }

                                // WALL SEGMENT PROGRESS DATA
                                const wallMin = putFloor > 0 ? Math.min(putFloor, curPrice * 0.96) : curPrice * 0.95;
                                const wallMax = callWall > 0 ? Math.max(callWall, curPrice * 1.04) : curPrice * 1.05;
                                const curPct = Math.min(100, Math.max(0, ((curPrice - wallMin) / (wallMax - wallMin)) * 100));

                                return (
                                    <div 
                                        key={item.ticker}
                                        className="p-5 rounded-2xl bg-[#0b101c]/60 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4 hover:border-slate-700/60 hover:bg-[#0c1222]/80 transition-all group"
                                    >
                                        {/* Card Header: Ticker & Live price */}
                                        <div className="flex justify-between items-start border-b border-slate-800/60 pb-3">
                                            <div className="flex gap-3 items-center">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black tracking-tighter ${theme.bg} ${theme.text} ${theme.border} ${theme.glow}`}>
                                                    {grade}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-white tracking-wider group-hover:text-cyan-400 transition-colors uppercase">
                                                        {item.ticker}
                                                    </span>
                                                    <span className="text-[13px] font-mono text-cyan-400 uppercase tracking-widest animate-pulse font-bold">
                                                        PROPRIETARY COCKPIT
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Live Quote Details */}
                                            {live && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-sm font-black text-slate-100 font-mono">
                                                        ${curPrice.toFixed(2)}
                                                    </span>
                                                    <span className={`text-[13px] font-black font-mono flex items-center gap-0.5 ${
                                                        live.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}>
                                                        {live.changePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {live.changePct >= 0 ? '+' : ''}{live.changePct.toFixed(2)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* DIRECT CONVICTION SIGNAL HUD */}
                                        <div className={`w-full py-2 px-3 border rounded-xl text-[13px] font-black tracking-wider uppercase text-center ${convictionColor}`}>
                                            {convictionTag}
                                        </div>

                                        {/* MAIN SPECS ROW: Gauge score & Anomaly Narrative */}
                                        <div className="grid grid-cols-[auto_1fr] gap-4 items-center">
                                            {/* Glowing score radial gauge */}
                                            <div className="relative w-16 h-16 flex items-center justify-center">
                                                <svg className="absolute w-full h-full -rotate-90">
                                                    <circle cx="32" cy="32" r="28" fill="transparent" stroke="rgba(148,163,184,0.06)" strokeWidth="4.5" />
                                                    <circle 
                                                        cx="32" cy="32" r="28" fill="transparent" 
                                                        stroke={grade === 'S' ? '#10b981' : grade === 'A' ? '#06b6d4' : grade === 'F' ? '#f43f5e' : '#475569'} 
                                                        strokeWidth="4.5" 
                                                        strokeDasharray={`${2 * Math.PI * 28}`}
                                                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - score / 100)}`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-base font-black text-white font-mono leading-none">{score}</span>
                                                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">SCORE</span>
                                                </div>
                                            </div>

                                            {/* Descriptive Anomaly HUD */}
                                            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-900 flex flex-col justify-center min-h-[64px]">
                                                <p className="text-[13px] font-bold text-slate-300 tracking-wide leading-relaxed">
                                                    {locale === 'ko' 
                                                        ? item.alphaSnapshot?.whyKR 
                                                        : locale === 'ja' 
                                                            ? (item.alphaSnapshot?.whyJA || item.alphaSnapshot?.why)
                                                            : item.alphaSnapshot?.why
                                                     || dict.analyzing}
                                                </p>
                                            </div>
                                        </div>

                                        {/* VISUAL OPTION WALL HOT-ZONE SLIDER */}
                                        <div className="flex flex-col gap-1.5 px-1 py-1 bg-slate-950/30 border border-slate-900/60 rounded-xl p-2.5">
                                            <div className="flex justify-between text-[13px] font-mono text-slate-500 uppercase tracking-widest">
                                                <span>Put Floor (${putFloor.toFixed(0)})</span>
                                                <span className="text-cyan-400 font-bold">LIVE GAP: {curPct.toFixed(0)}%</span>
                                                <span>Call Wall (${callWall.toFixed(0)})</span>
                                            </div>
                                            <div className="relative w-full h-2 bg-slate-950 rounded-full border border-slate-900 flex items-center overflow-hidden">
                                                {/* Optimal Buy Target Zone highlights */}
                                                <div 
                                                    className="absolute h-full bg-emerald-500/25 border-l border-r border-emerald-400/35"
                                                    style={{
                                                        left: `${Math.max(0, ((entryTargetMin - wallMin) / (wallMax - wallMin)) * 100)}%`,
                                                        width: `${Math.min(100, ((entryTargetMax - entryTargetMin) / (wallMax - wallMin)) * 100)}%`
                                                    }}
                                                />
                                                {/* Live Price glowing dot */}
                                                <div 
                                                    className="absolute w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee] border border-white"
                                                    style={{ left: `calc(${curPct}% - 6px)` }}
                                                />
                                            </div>
                                        </div>

                                        {/* TACTICAL TARGET ENTRY */}
                                        <div className="mt-1 border-t border-slate-800/40 pt-3 flex flex-col gap-2.5">
                                            <div className="flex justify-between items-center text-[13px]">
                                                <span className="font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Target className="w-3.5 h-3.5 text-cyan-400" />
                                                    {dict.optimalRange}
                                                </span>
                                                <span className="text-emerald-400 font-mono font-black bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg text-[13px]">
                                                    ${entryTargetMin.toFixed(2)} - ${entryTargetMax.toFixed(2)}
                                                </span>
                                            </div>

                                            {/* 3-Barrier pathing limits info */}
                                            <div className="grid grid-cols-2 gap-2 text-[13px] font-mono">
                                                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 flex justify-between">
                                                    <span>TAKE PROFIT (+3.5%)</span>
                                                    <strong>${takeProfit.toFixed(2)}</strong>
                                                </div>
                                                <div className="p-2 rounded bg-rose-950/20 border border-rose-500/10 text-rose-400 flex justify-between">
                                                    <span>STOP LOSS (-1.5%)</span>
                                                    <strong>${stopLoss.toFixed(2)}</strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ONE-CLICK COPY BRACKET ORDER (Actual Trading Execution Weapon) */}
                                        <button
                                            onClick={() => copyBracketToClipboard(item, entryTargetMax, takeProfit, stopLoss)}
                                            className={`w-full h-10 rounded-xl font-black text-[13px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 border ${
                                                copiedTicker === item.ticker
                                                    ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                                    : 'bg-slate-950/60 text-cyan-400 border-slate-800 hover:border-cyan-500/25 hover:bg-slate-900/60'
                                            }`}
                                        >
                                            {copiedTicker === item.ticker ? (
                                                <>
                                                    <Check className="w-4 h-4 text-emerald-400" />
                                                    {dict.copyBracketCopied}
                                                </>
                                            ) : (
                                                <>
                                                    <Clipboard className="w-4 h-4 text-cyan-500" />
                                                    {dict.copyBracket}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination HUD */}
                    {totalPages > 1 && (
                        <div className="mt-4 p-4 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex justify-between items-center">
                            <span className="text-[13px] font-mono text-slate-400 uppercase tracking-widest">
                                Page {page} of {totalPages} ({totalCount} total tickers matched)
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-400 hover:text-white"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-400 hover:text-white"
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
