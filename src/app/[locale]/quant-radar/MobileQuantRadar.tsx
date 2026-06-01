"use client";

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import { 
    Radar, Zap, Sliders, Activity, Search, ChevronRight, ChevronLeft, AlertCircle,
    TrendingUp, TrendingDown, Target, Lock, Clipboard, Check, DollarSign, Plus, CheckCircle2 
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useRealtimeData } from '@/providers/WebSocketProvider';

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
    rsi: number | null;
    gex: number | null;
    pcr: number | null;
    putFloor: number | null;
    gammaFlipLevel: number | null;
    whaleIndex: number;
    alphaSnapshot: {
        score: number;
        grade: string;
        action: string;
        whyKR?: string;
        why?: string;
        whyJA?: string;
    };
    realtime?: {
        price: number;
        changePct: number;
    };
}

export function MobileQuantRadar() {
    const t = useTranslations();
    const locale = useLocale();
    const dict = radarI18n[locale] || radarI18n.en;

    // 1. Enforce Admin Security Lock using Tier Context
    const { isAdmin, loading: tierLoading } = useTier();

    // 1.1 Real portfolio integration
    const { holdings, summary, addHolding, removeHolding } = usePortfolio();

    // Quick Add Bottom Sheet states
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
            console.error("Failed to batch inject on mobile:", e);
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
            console.error("Failed to liquidate on mobile:", e);
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
            console.error("Failed to rotate on mobile:", e);
        } finally {
            setIsInjecting(false);
        }
    };
    const [quickAddTicker, setQuickAddTicker] = useState('');
    const [quickAddQty, setQuickAddQty] = useState('');
    const [quickAddPrice, setQuickAddPrice] = useState('');

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
            console.error('Failed to add holding quick on mobile:', err);
        }
    };

    // Mobile Tabs
    const [activeTab, setActiveTab] = useState<'SIGNALS' | 'FILTER' | 'FACTS'>('SIGNALS');

    // Filter states
    const [scoreMin, setScoreMin] = useState(60);
    const [selectedGrades, setSelectedGrades] = useState<string[]>(['S', 'A', 'B']);
    const [selectedOverlay, setSelectedOverlay] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [gexMin, setGexMin] = useState<number>(-10);
    const [isAutoPilot, setIsAutoPilot] = useState(false);
    const [totalCapital, setTotalCapital] = useState(50000);
    
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [tickers, setTickers] = useState<TickerData[]>([]);
    const activeTickers = useMemo(() => tickers.map(t => t.ticker), [tickers]);
    const { getPrice } = useRealtimeData(activeTickers);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    // Clipboard copy indicators
    const [copiedTicker, setCopiedTicker] = useState<string | null>(null);

    const fetchMobileData = (isSilent = false) => {
        if (!isAdmin) return;
        if (!isSilent) setLoading(true);
        
        const queryParams = new URLSearchParams(isAutoPilot ? {
            mode: 'auto',
            totalCapital: totalCapital.toString()
        } : {
            scoreMin: scoreMin.toString(),
            grades: selectedGrades.join(','),
            overlay: selectedOverlay,
            search: searchQuery,
            gexMin: gexMin.toString(),
            sortBy: 'score',
            sortOrder: 'desc',
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
                console.error('[MobileQuantRadar] Fetch failed:', e);
            } finally {
                setLoading(false);
            }
        });
    };

    useEffect(() => {
        fetchMobileData(false);

        const interval = setInterval(() => {
            fetchMobileData(true);
        }, 5000);

        return () => clearInterval(interval);
    }, [scoreMin, selectedGrades, selectedOverlay, page, gexMin, isAdmin, isAutoPilot, totalCapital]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchMobileData();
    };

    const toggleGrade = (grade: string) => {
        if (selectedGrades.includes(grade)) {
            setSelectedGrades(selectedGrades.filter(g => g !== grade));
        } else {
            setSelectedGrades([...selectedGrades, grade]);
        }
        setPage(1);
    };

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

        const tickersText = tickers.map((item, i) => {
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
        }).join('\n\n');

        const text = headerText + stepsText + tickersText + `\n\nGenerated strictly on zero-bias expectation models.`;
        
        navigator.clipboard.writeText(text).then(() => {
            setCopiedTicker("PORTFOLIO");
            setTimeout(() => setCopiedTicker(null), 1500);
        });
    };

    const copyBracketToClipboard = (item: TickerData, entryPrice: number, tp: number, sl: number) => {
        const score = item.alphaSnapshot.score;
        const grade = item.alphaSnapshot.grade;
        
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
    // A. SECURITY LOCK SCREEN FOR MOBILE
    // ────────────────────────────────────────────────────────
    if (tierLoading) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center gap-3">
                <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Checking credentials...</p>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center px-6 relative overflow-hidden">
                <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[250px] h-[250px] rounded-full bg-rose-500/5 blur-[80px] pointer-events-none" />

                <div className="w-full p-6 rounded-2xl bg-[#0b0f19]/95 border border-rose-500/20 shadow-2xl backdrop-blur-xl relative z-10 flex flex-col items-center text-center gap-5">
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        <Lock className="w-6 h-6 animate-pulse" />
                    </div>

                    <div className="flex flex-col gap-1">
                        <h2 className="text-[13px] font-black text-rose-400 tracking-widest uppercase">PROPRIETARY LOCK</h2>
                        <h1 className="text-base font-black text-white tracking-tight">ADMIN ACCESS ONLY</h1>
                        <p className="text-[13px] text-slate-400 leading-relaxed mt-1">
                            This cockpit is locked for general visitors. Access is exclusive to the fund administrator.
                        </p>
                    </div>

                    <div className="w-full p-3.5 rounded-xl bg-slate-950/80 border border-slate-900 flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        <span className="text-[13px] font-mono text-slate-500 text-left leading-normal">
                            Please authenticate in settings using your administrator credentials.
                        </span>
                    </div>

                    <Link href="/" className="h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-[13px] font-bold flex items-center justify-center uppercase tracking-wider w-full">
                        Return
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

    // Mechanical execution sequence (priority score descending)
    const executionSequence = useMemo(() => {
        return tickers
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
    }, [tickers, holdings, getPrice]);

    // ────────────────────────────────────────────────────────
    // B. AUTHORIZED MOBILE QUANT COCKPIT
    // ────────────────────────────────────────────────────────
    return (
        <div className="w-full min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-jakarta relative pb-24">
            
            {/* Ambient Background Light */}
            <div className="absolute top-0 left-0 w-full h-[180px] bg-gradient-to-b from-cyan-500/10 to-transparent pointer-events-none" />

            {/* Mobile Header Banner */}
            <div className="w-full px-4 pt-4 pb-2 border-b border-slate-900 bg-[#070b13]/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Radar className="w-5 h-5 text-cyan-400 animate-pulse" />
                    <div>
                        <h1 className="text-[13px] font-black tracking-widest text-white uppercase">QUANT RADAR</h1>
                        <p className="text-[13px] font-bold text-emerald-400 tracking-widest uppercase">⚡ PROPRIETARY COCKPIT</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[13px] px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                    <Activity className={`w-2.5 h-2.5 ${loading ? 'animate-spin' : ''}`} />
                    {totalCount} CODES
                </div>
            </div>

            {/* 3-Tab Sub Navigation */}
            <div className="w-full px-4 py-2 bg-[#070b13]/90 backdrop-blur-md border-b border-slate-900 flex sticky top-11 z-30">
                <div className="w-full grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900">
                    {[
                        { id: 'SIGNALS', label: 'SIGNALS', icon: Activity },
                        { id: 'FILTER', label: 'DIY SCANS', icon: Sliders },
                        { id: 'FACTS', label: 'FACT SHEETS', icon: Zap },
                    ].map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`py-2 text-[13px] font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                    active 
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/10' 
                                        : 'text-slate-500 hover:text-slate-400'
                                }`}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* MAIN CONTENT BASED ON SELECTED TAB */}
            <div className="flex-1 w-full px-4 pt-3 relative z-10">

                {/* TAB 1: SIGNALS GRID */}
                {activeTab === 'SIGNALS' && (
                    <div className="flex flex-col gap-3.5">
                        {loading ? (
                            <div className="flex flex-col justify-center items-center py-32 gap-3">
                                <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                                <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest">Scanning signals...</p>
                            </div>
                        ) : isAutoPilot ? (
                            /* MOBILE AUTONOMOUS ALLOCATION HUD */
                            <div className="flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out]">
                                {/* MOBILE COMPACT PORTFOLIO HUD */}
                                <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#0c1322] to-[#070b13] border border-cyan-500/20 shadow-md flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2 border-b border-slate-900 pb-2">
                                        <DollarSign className="w-4 h-4 text-cyan-400 animate-pulse font-bold" />
                                        <span className="text-[13px] font-black text-slate-300 uppercase tracking-widest">{dict.realAssetStatus}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3.5 text-[13px]">
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">{dict.tradingCapitalLabel} / {dict.cashLabel}</span>
                                            <span className="text-sm font-black text-white font-mono mt-0.5">
                                                ${totalCapital.toLocaleString()} / <span className="text-cyan-400">${cashBalance.toLocaleString(undefined, {maximumFractionDigits:1})}</span>
                                            </span>
                                        </div>
                                        <div className="flex flex-col border-l border-slate-800/80 pl-3">
                                            <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">{dict.navLabel}</span>
                                            <span className="text-sm font-black text-white font-mono mt-0.5">${computedTotalNAV.toLocaleString(undefined, {maximumFractionDigits:1})}</span>
                                        </div>
                                        <div className="flex flex-col col-span-2 border-t border-slate-900 pt-2">
                                            <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">{dict.totalReturnLabel}</span>
                                            <span className={`text-sm font-black font-mono mt-0.5 flex items-center gap-1.5 ${
                                                computedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                            }`}>
                                                {computedPL >= 0 ? '+' : ''}${computedPL.toLocaleString(undefined, {maximumFractionDigits:1})}
                                                <span className="text-xs font-bold">({computedPL >= 0 ? '+' : ''}{computedPLPct.toFixed(1)}%)</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Master Copy Button */}
                                <button
                                    onClick={copyEntireAllocationMatrixToClipboard}
                                    className={`w-full h-10 rounded-xl font-black text-[13px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 border ${
                                        copiedTicker === "PORTFOLIO"
                                            ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/25 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                                            : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 active:bg-cyan-500/20'
                                    }`}
                                >
                                    {copiedTicker === "PORTFOLIO" ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            {dict.copyBtnCopied}
                                        </>
                                    ) : (
                                        <>
                                            <Clipboard className="w-3.5 h-3.5 text-cyan-500" />
                                            {dict.copyBtn}
                                        </>
                                    )}
                                </button>

                                {/* Dynamic Rotation HUD & MECHANICAL EXECUTION SEQUENCE */}
                                {(() => {
                                    const decayPositions = holdings.filter(h => h.alphaScore !== undefined && h.alphaScore < 50);

                                    const sortedHoldingsByScore = [...holdings]
                                        .filter(h => h.alphaScore !== undefined)
                                        .sort((a, b) => (a.alphaScore || 0) - (b.alphaScore || 0));
                                    const lowestScoreHolding = sortedHoldingsByScore[0];

                                    const sortedScannedByScore = [...tickers]
                                        .filter(t => t.alphaSnapshot?.score !== undefined)
                                        .sort((a, b) => (b.alphaSnapshot?.score || 0) - (a.alphaSnapshot?.score || 0));
                                    const highestScoreScanned = sortedScannedByScore.find(t => !holdings.some(h => h.ticker.toUpperCase() === t.ticker.toUpperCase()));

                                    const hasHoldings = holdings.length > 0;

                                    return (
                                        <div className="flex flex-col gap-4">
                                            {/* MECHANICAL EXECUTION SEQUENCE */}
                                            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-900 flex flex-col gap-3">
                                                <h3 className="text-[13px] font-black tracking-widest text-cyan-400 uppercase border-b border-slate-900/60 pb-2 flex items-center gap-1.5">
                                                    <Zap className="w-3.5 h-3.5 animate-pulse" />
                                                    기계적 매수 집행 순서 (EXECUTION SEQUENCE)
                                                </h3>
                                                <div className="flex flex-col gap-2.5">
                                                    {executionSequence.length === 0 ? (
                                                        <div className="p-3 rounded-lg bg-emerald-950/15 border border-emerald-500/20 flex flex-col gap-1">
                                                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[13px] uppercase tracking-wider">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                ALL POSITIONS ALIGNED
                                                            </div>
                                                            <p className="text-[13px] text-slate-400 leading-normal">
                                                                모든 종목의 매수 비중이 오토파일럿 모델과 완벽히 일치하여 정렬되었습니다. 추가 집행이 필요하지 않습니다.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-2.5 font-mono text-[13px]">
                                                            {executionSequence.map((item, index) => (
                                                                <div key={item.ticker} className="p-3 rounded-lg bg-[#070b13] border border-slate-900 flex flex-col gap-2 relative overflow-hidden">
                                                                    <div className="absolute top-0 right-0 px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-[11px] font-black rounded-bl border-l border-b border-cyan-500/20">
                                                                        SCORE {item.score}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-black text-xs shrink-0">
                                                                            {index + 1}
                                                                        </span>
                                                                        <span className="font-black text-white tracking-wider uppercase">{item.ticker}</span>
                                                                        <span className="text-[13px] text-emerald-400 font-black">+{item.diffQty}주 매수</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-1.5 mt-1 pt-1.5 border-t border-slate-900/60 text-center text-[12px] text-slate-400">
                                                                        <div className="flex flex-col gap-0.5 bg-slate-950/60 p-1 rounded border border-slate-900">
                                                                            <span className="text-[11px] text-slate-500 uppercase">LIMIT ENTRY</span>
                                                                            <span className="text-emerald-400 font-bold">${item.entry.toFixed(2)}</span>
                                                                        </div>
                                                                        <div className="flex flex-col gap-0.5 bg-slate-950/60 p-1 rounded border border-slate-900">
                                                                            <span className="text-[11px] text-slate-500 uppercase">STOP LOSS</span>
                                                                            <span className="text-rose-400 font-bold">${item.stopLoss.toFixed(2)}</span>
                                                                        </div>
                                                                        <div className="flex flex-col gap-0.5 bg-slate-950/60 p-1 rounded border border-slate-900">
                                                                            <span className="text-[11px] text-slate-500 uppercase">TAKE PROFIT</span>
                                                                            <span className="text-cyan-400 font-bold">${item.takeProfit.toFixed(2)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Dynamic Rotation & Decay HUD */}
                                            {!hasHoldings ? (
                                                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-900 flex flex-col gap-3">
                                                    <div className="flex items-center gap-1.5 text-amber-500 font-bold text-[13px] uppercase tracking-wider">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        NO ACTIVE HOLDINGS
                                                    </div>
                                                    <p className="text-[13px] text-slate-400 leading-normal">
                                                        {dict.noHoldingsTitle}
                                                    </p>
                                                    <button
                                                        onClick={handleBatchInject}
                                                        disabled={isInjecting || tickers.length === 0}
                                                        className="w-full h-10 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:bg-slate-900 disabled:opacity-40 text-emerald-400 disabled:text-slate-500 border border-emerald-500/30 disabled:border-slate-800 font-black transition-all flex items-center justify-center gap-2 tracking-widest uppercase text-[13px]"
                                                    >
                                                        {isInjecting ? (
                                                            <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
                                                        ) : (
                                                            <Plus className="w-4 h-4" />
                                                        )}
                                                        {dict.batchInjectBtn}
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Liquidation Alert */}
                                                    {decayPositions.length > 0 ? (
                                                        <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/15 flex flex-col gap-1.5 animate-[pulse_3s_infinite]">
                                                            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[13px] uppercase tracking-wider">
                                                                <AlertCircle className="w-3 h-3 animate-pulse" />
                                                                {dict.scoreDecayTitle}
                                                            </div>
                                                            <p className="text-[13px] text-slate-300 leading-normal font-mono">
                                                                active position인 {decayPositions.map(h => `${h.ticker} (${h.alphaScore})`).join(', ')}에 대한 기대치 점수가 임계치 50 미만으로 떨어졌습니다. 지금 바로 롱 포지션을 청산하세요.
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
                                                                className="w-full h-9 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-black transition-all flex items-center justify-center gap-1.5 tracking-wider uppercase text-[13px] mt-1"
                                                            >
                                                                {isInjecting ? (
                                                                    <div className="w-3.5 h-3.5 border-2 border-rose-500/20 border-t-rose-400 rounded-full animate-spin" />
                                                                ) : (
                                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                                )}
                                                                {dict.liquidateBtn}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="p-3.5 rounded-xl bg-emerald-950/15 border border-emerald-500/15 flex flex-col gap-1">
                                                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[13px] uppercase tracking-wider">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                RISK-ADJUSTED PASS
                                                            </div>
                                                            <p className="text-[13px] text-slate-400 leading-normal">
                                                                {dict.noDecayStatus}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Opportunity Cost Rotation Card */}
                                                    {lowestScoreHolding && highestScoreScanned && (highestScoreScanned.alphaSnapshot.score > (lowestScoreHolding.alphaScore || 0)) ? (
                                                        <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/15 flex flex-col gap-1.5">
                                                            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[13px] uppercase tracking-wider">
                                                                <Zap className="w-3 h-3" />
                                                                {dict.rotationTitle}
                                                            </div>
                                                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 font-mono text-[13px] text-center bg-slate-950/30 p-1.5 rounded border border-slate-900">
                                                                <div>
                                                                    <span className="text-rose-400 font-bold">{lowestScoreHolding.ticker}</span>
                                                                    <span className="text-[13px] text-slate-500 block">Score {lowestScoreHolding.alphaScore}</span>
                                                                </div>
                                                                <span className="text-slate-500 font-bold">➔</span>
                                                                <div>
                                                                    <span className="text-emerald-400 font-bold">{highestScoreScanned.ticker}</span>
                                                                    <span className="text-[13px] text-slate-500 block">Score {highestScoreScanned.alphaSnapshot.score}</span>
                                                                </div>
                                                            </div>
                                                            <p className="text-[13px] text-slate-400 leading-normal">
                                                                현재 보유 중인 {lowestScoreHolding.ticker}는 신규 스캔 1위인 {highestScoreScanned.ticker}와 비교했을 때 기회비용이 높습니다. 자본을 재배분하면 수학적으로 훨씬 유리한 기댓값을 확보할 수 있습니다.
                                                            </p>
                                                            <button
                                                                onClick={() => handleRotate(lowestScoreHolding.ticker, highestScoreScanned)}
                                                                disabled={isInjecting}
                                                                className="w-full h-9 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 font-black transition-all flex items-center justify-center gap-1.5 tracking-wider uppercase text-[13px] mt-1"
                                                            >
                                                                {isInjecting ? (
                                                                    <div className="w-3.5 h-3.5 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                                                                ) : (
                                                                    <Zap className="w-3.5 h-3.5" />
                                                                )}
                                                                {dict.executeRotationBtn}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="p-3.5 rounded-xl bg-slate-950/30 border border-slate-900 flex flex-col gap-1">
                                                            <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[13px] uppercase tracking-wider">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                                ROTATION OPTIMIZED
                                                            </div>
                                                            <p className="text-[13px] text-slate-500 leading-normal">
                                                                현재 기회비용 관점에서 교체가 유효한 보유 최저점 대비 신규 최고점의 유의미한 스코어 스프레드가 없습니다. 보유 비중을 안정적으로 유지하십시오.
                                                            </p>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* 초보자를 위한 오토파일럿 실전 주문 3단계 가이드 */}
                                <div className="p-3.5 rounded-xl bg-cyan-950/10 border border-cyan-500/20 flex flex-col gap-2.5">
                                    <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[13px] uppercase tracking-wider">
                                        <AlertCircle className="w-3.5 h-3.5 text-cyan-400" />
                                        {dict.guideTitle}
                                    </div>
                                    <div className="flex flex-col gap-2 text-[13px] text-slate-300 leading-relaxed font-jakarta">
                                        <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 flex flex-col">
                                            <strong className="text-white">{dict.guide1Title}</strong>
                                            <span className="text-slate-400 text-[13px] mt-0.5">{dict.guide1Desc}</span>
                                        </div>
                                        <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 flex flex-col">
                                            <strong className="text-white">{dict.guide2Title}</strong>
                                            <span className="text-slate-400 text-[13px] mt-0.5">{dict.guide2Desc}</span>
                                        </div>
                                        <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 flex flex-col">
                                            <strong className="text-white">{dict.guide3Title}</strong>
                                            <span className="text-slate-400 text-[13px] mt-0.5">{dict.guide3Desc}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Capital Allocation Cards */}
                                <div className="flex flex-col gap-3">
                                    <h3 className="text-[13px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                                        <Radar className="w-3 h-3 text-cyan-400" />
                                        Optimal Allocations
                                    </h3>
                                    
                                    {tickers.map((item, idx) => {
                                        const grade = item.alphaSnapshot?.grade || 'B';
                                        const score = item.alphaSnapshot?.score || 50;
                                        const weightPct = (((item as any).weight || 0) * 100).toFixed(1);
                                        const cap = (item as any).allocatedCapital || 0;
                                        const shares = (item as any).targetShares || 0;
                                        const wsPriceObj = getPrice(item.ticker);
                                        const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                        const exec = (item as any).execution || {};

                                        // Calculate real-time held & adjustment
                                        const heldObj = holdings.find(h => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                                        const heldQty = heldObj ? heldObj.quantity : 0;
                                        const diffQty = shares - heldQty;

                                        return (
                                            <div key={item.ticker} className="p-3.5 rounded-xl bg-[#0b101c]/50 border border-slate-900 flex flex-col gap-2.5">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-6 h-6 rounded flex items-center justify-center text-[13px] font-black border ${
                                                            grade === 'S' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' :
                                                            grade === 'A' ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/20' : 'bg-slate-950/40 text-slate-400 border-slate-900'
                                                        }`}>
                                                            {grade}
                                                        </span>
                                                         <span className="text-[13px] font-black text-white uppercase flex items-center gap-1">
                                                             <img 
                                                                 src={`/api/logo/${item.ticker}`} 
                                                                 className="w-3.5 h-3.5 rounded-full object-contain bg-slate-900 border border-slate-800" 
                                                                 alt="" 
                                                                 onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                                                             />
                                                             {item.ticker}
                                                         </span>
                                                    </div>
                                                    <span className="text-[13px] font-black font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded">
                                                        {weightPct}% {dict.weight}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 text-[13px] font-mono">
                                                    <div className="bg-slate-950/40 p-2 rounded border border-slate-900 flex justify-between">
                                                        <span className="text-slate-500">{dict.allocatedCap}</span>
                                                        <strong className="text-slate-300">${cap.toLocaleString(undefined, {maximumFractionDigits:0})}</strong>
                                                    </div>
                                                    <div className="bg-slate-950/40 p-2 rounded border border-slate-900 flex justify-between">
                                                        <span className="text-slate-500">{dict.shares}</span>
                                                        <strong className="text-slate-200">{shares}</strong>
                                                    </div>
                                                </div>

                                                {/* HELD & REBALANCE STATE IN CARD */}
                                                <div className="grid grid-cols-2 gap-2 text-[13px] font-mono border-t border-slate-900 pt-2">
                                                    <div className="bg-slate-950/40 p-2 rounded border border-slate-900 flex justify-between">
                                                        <span className="text-slate-500">{dict.held}</span>
                                                        <strong className="text-cyan-400">{heldQty}</strong>
                                                    </div>
                                                    <div className="bg-slate-950/40 p-2 rounded border border-slate-900 flex justify-between items-center px-2">
                                                        <span className="text-slate-500">{dict.adjustment}</span>
                                                        {diffQty > 0 ? (
                                                            <span className="text-emerald-400 font-bold">+{diffQty}</span>
                                                        ) : diffQty < 0 ? (
                                                            <span className="text-rose-400 font-bold">{diffQty}</span>
                                                        ) : (
                                                            <span className="text-slate-600 font-bold">0</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-900 flex flex-col gap-1.5 text-[13px] font-mono">
                                                    <div className="flex justify-between border-b border-slate-900 pb-1">
                                                        <span className="text-slate-500">ENTRY (LIMIT)</span>
                                                        <strong className="text-emerald-400">${(exec.entry || livePrice).toFixed(2)}</strong>
                                                    </div>
                                                    <div className="flex justify-between border-b border-slate-900 pb-1">
                                                        <span className="text-slate-500">STOP LOSS</span>
                                                        <strong className="text-rose-400">${(exec.stopLoss || 0).toFixed(2)}</strong>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">TAKE PROFIT</span>
                                                        <strong className="text-cyan-400">${(exec.takeProfit || 0).toFixed(2)}</strong>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 mt-1">
                                                    <button
                                                        onClick={() => copyBracketToClipboard(item, exec.entry || livePrice, exec.takeProfit || 0, exec.stopLoss || 0)}
                                                        className={`h-8 rounded-lg font-black text-[13px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                                                            copiedTicker === item.ticker
                                                                ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/25'
                                                                : 'bg-slate-950/60 text-cyan-400 border-slate-900 active:bg-slate-900'
                                                        }`}
                                                    >
                                                        {copiedTicker === item.ticker ? (
                                                            <>
                                                                <Check className="w-3 h-3 text-emerald-400" />
                                                                {dict.copyBracketCopied}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Clipboard className="w-3 h-3 text-cyan-500" />
                                                                {dict.copyBracket}
                                                            </>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setQuickAddTicker(item.ticker);
                                                            setQuickAddPrice(livePrice.toString());
                                                            setQuickAddQty(heldQty > 0 ? heldQty.toString() : '');
                                                            setShowQuickAdd(true);
                                                        }}
                                                        className="h-8 rounded-lg font-black text-[13px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 flex items-center justify-center gap-1.5"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        PORT INJECT
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            tickers.map(item => {
                                const score = item.alphaSnapshot?.score || 50;
                                const grade = item.alphaSnapshot?.grade || 'C';
                                const wsPriceObj = getPrice(item.ticker);
                                const curPrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                                const putFloor = item.putFloor || 0;
                                const flipLevel = item.gammaFlipLevel || 0;

                                // Optimal buy entry boundary calculation
                                let entryMin = 0;
                                let entryMax = 0;
                                if (item.gex != null && item.gex > 0) {
                                    entryMin = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                    entryMax = curPrice * 1.002;
                                } else {
                                    entryMin = putFloor > 0 ? putFloor : curPrice * 0.95;
                                    entryMax = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                }

                                const takeProfit = curPrice * 1.035;
                                const stopLoss = curPrice * 0.985;

                                // Direct Trade Signal Tags on mobile
                                let signalLabel = dict.neutral;
                                let signalColor = 'text-slate-400 border-slate-800 bg-slate-950/40';
                                if (score >= 80) {
                                    signalLabel = dict.strongBuy;
                                    signalColor = 'text-emerald-400 border-emerald-500/20 bg-emerald-950/30';
                                } else if (score >= 70) {
                                    signalLabel = dict.callBuy;
                                    signalColor = 'text-cyan-400 border-cyan-500/20 bg-cyan-950/30';
                                } else if (score <= 35) {
                                    signalLabel = dict.putShort;
                                    signalColor = 'text-rose-400 border-rose-500/20 bg-rose-950/30';
                                }

                                return (
                                    <div 
                                        key={item.ticker}
                                        className="p-4 rounded-xl bg-[#0b101c]/50 border border-slate-900 backdrop-blur-sm flex flex-col gap-3 active:bg-[#0c1222]/80 transition-all"
                                    >
                                        {/* Card Header: Ticker / Grade / Price */}
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-lg text-[13px] font-black flex items-center justify-center border ${
                                                    grade === 'S' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' :
                                                    grade === 'A' ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/20' :
                                                    grade === 'F' ? 'bg-rose-950/40 text-rose-400 border-rose-500/20' : 'bg-slate-950/40 text-slate-400 border-slate-900'
                                                }`}>
                                                    {grade}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[13px] font-black text-white uppercase tracking-wider">{item.ticker}</span>
                                                    <span className="text-[13px] font-mono text-slate-500">V7 COCKPIT</span>
                                                </div>
                                            </div>

                                            {/* Signal Badge */}
                                            <span className={`text-[13px] font-black tracking-widest px-2 py-0.5 rounded border uppercase ${signalColor}`}>
                                                {signalLabel}
                                            </span>
                                        </div>

                                        {/* Dynamic narrative + score progress row */}
                                        <div className="grid grid-cols-[38px_1fr] gap-3 items-center">
                                            <div className="h-[38px] rounded-lg bg-slate-950/60 border border-slate-900 flex flex-col justify-center items-center">
                                                <span className="text-[13px] font-black text-white font-mono leading-none">{score}</span>
                                                <span className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">SCORE</span>
                                            </div>

                                            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-900/60 min-h-[38px] flex items-center">
                                                <p className="text-[13px] font-bold text-slate-300 leading-normal">
                                                    {locale === 'en' 
                                                        ? (item.alphaSnapshot?.why || item.alphaSnapshot?.whyKR || dict.analyzing) 
                                                        : locale === 'ja' 
                                                            ? (item.alphaSnapshot?.whyJA || item.alphaSnapshot?.why || item.alphaSnapshot?.whyKR || dict.analyzing) 
                                                            : (item.alphaSnapshot?.whyKR || dict.analyzing)
                                                    }
                                                </p>
                                            </div>
                                        </div>

                                        {/* Tactical buy target entry zone */}
                                        <div className="p-2.5 rounded-lg bg-cyan-950/10 border border-cyan-500/10 flex justify-between items-center text-[13px]">
                                            <span className="font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                <Target className="w-3 h-3 text-cyan-400" />
                                                {dict.optimalRange}
                                            </span>
                                            <span className="text-emerald-400 font-mono font-black">
                                                ${entryMin.toFixed(2)} - ${entryMax.toFixed(2)}
                                            </span>
                                        </div>

                                        {/* One-click Clipboard Bracket Copy Button */}
                                        <button
                                            onClick={() => copyBracketToClipboard(item, entryMax, takeProfit, stopLoss)}
                                            className={`w-full h-9 rounded-lg font-black text-[13px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                                                copiedTicker === item.ticker
                                                    ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/25'
                                                    : 'bg-slate-950/60 text-cyan-400 border-slate-900 active:bg-slate-900'
                                            }`}
                                        >
                                            {copiedTicker === item.ticker ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    {dict.copyBracketCopied}
                                                </>
                                            ) : (
                                                <>
                                                    <Clipboard className="w-3.5 h-3.5 text-cyan-500" />
                                                    {dict.copyBracket}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })
                        )}

                        {/* Mobile pagination controls */}
                        {totalPages > 1 && (
                            <div className="py-2 flex justify-between items-center font-mono text-[13px] text-slate-500 border-t border-slate-900">
                                <span>PAGE {page} OF {totalPages}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-30"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-30"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: DIY SCANS CONTROLS */}
                {activeTab === 'FILTER' && (
                    <div className="flex flex-col gap-4 p-4 rounded-xl bg-[#0b101c]/50 border border-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                            <Sliders className="w-4 h-4 text-cyan-400" />
                            <span className="text-[13px] font-bold text-white uppercase tracking-wider">DIY screener knobs</span>
                        </div>

                        {/* Auto-Pilot Toggle Control */}
                        <div className="p-3 rounded-xl bg-cyan-950/15 border border-cyan-500/20 flex flex-col gap-2.5">
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

                            {/* Search Query */}
                            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-1.5">
                                <label className="text-[13px] font-bold text-slate-400 uppercase tracking-widest">Ticker Search</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                                    <input 
                                        type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="SEARCH e.g. TSLA, NVDA"
                                        className="w-full pl-8 pr-3 h-9 bg-slate-950/60 border border-slate-850 rounded-lg text-[13px] font-bold uppercase tracking-wider text-white outline-none"
                                    />
                                </div>
                            </form>

                            {/* Context Score Minimum */}
                            <div className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-center text-[13px] font-bold text-slate-400 uppercase">
                                    <span>Context Score Threshold</span>
                                    <span className="text-cyan-400 font-mono font-black text-[13px]">{scoreMin}</span>
                                </div>
                                <input 
                                    type="range" min="30" max="95" value={scoreMin}
                                    onChange={(e) => { setScoreMin(Number(e.target.value)); setPage(1); }}
                                    className="w-full h-1 bg-slate-950 rounded appearance-none cursor-pointer accent-cyan-500"
                                />
                            </div>

                            {/* Ticker Grades selection */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[13px] font-bold text-slate-400 uppercase tracking-widest">Alpha Grades</label>
                                <div className="grid grid-cols-6 gap-1">
                                    {['S', 'A', 'B', 'C', 'D', 'F'].map(g => {
                                        const active = selectedGrades.includes(g);
                                        return (
                                            <button
                                                key={g} onClick={() => toggleGrade(g)}
                                                className={`h-7 rounded-lg text-[13px] font-black transition-all ${
                                                    active 
                                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                                                        : 'bg-slate-950/60 text-slate-500 border border-slate-900'
                                                }`}
                                            >
                                                {g}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Statistical Overlays */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[13px] font-bold text-slate-400 uppercase tracking-widest">Macro Overlays</label>
                                <div className="flex flex-col gap-1">
                                    {[
                                        { value: '', label: 'All Indicators' },
                                        { value: 'extreme_oversold', label: '🔥 RSI Extreme Oversold (RSI < 25)' },
                                        { value: 'fear_resolution', label: '⚡ Fear Resolution (QQQ Panic Bounce)' },
                                        { value: 'r_mode', label: '🔄 Regime: R-Mode Recovery' },
                                        { value: 'whale', label: '🐳 Institutional whale (>= 65)' },
                                    ].map(item => (
                                        <button
                                            key={item.value} onClick={() => { setSelectedOverlay(item.value); setPage(1); }}
                                            className={`w-full text-left h-8 px-3 rounded-lg text-[13px] font-bold transition-all flex items-center ${
                                                selectedOverlay === item.value
                                                    ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-slate-950/40 text-slate-400'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => { setActiveTab('SIGNALS'); fetchMobileData(); }}
                            className="w-full py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-black text-[13px] tracking-wider uppercase shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                        >
                            RUN RADAR SCAN
                        </button>
                    </div>
                )}

                {/* TAB 3: BACKTEST STATS / FACTS */}
                {activeTab === 'FACTS' && (
                    <div className="flex flex-col gap-4 p-4 rounded-xl bg-[#0b101c]/50 border border-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                            <Zap className="w-4 h-4 text-cyan-400" />
                            <span className="text-[13px] font-bold text-white uppercase tracking-wider">Empirical Statistical backing</span>
                        </div>

                        <div className="flex flex-col gap-3 font-bold text-[13px] leading-relaxed text-slate-400">
                            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-900/60 flex flex-col gap-1">
                                <span className="text-emerald-400 uppercase tracking-widest text-[13px] font-black">🔥 S-Grade performance</span>
                                <p>Out-of-sample backtests over 54,850 chronological pairs prove S-Grade returns are monotonically increasing:</p>
                                <ul className="list-disc pl-4 space-y-1 mt-1 text-[13px] text-slate-500">
                                    <li>Average 3D return expectation: <strong className="text-emerald-400 font-mono">+3.42%</strong></li>
                                    <li>Out-of-sample Pearson Correlation r: <strong className="text-white font-mono">+0.2850</strong></li>
                                    <li>Probability Test: <strong className="text-white font-mono">p &lt; 0.0001</strong> (Highly Significant)</li>
                                </ul>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-900/60 flex flex-col gap-1">
                                <span className="text-rose-400 uppercase tracking-widest text-[13px] font-black">⚠️ F-Grade short mitigation</span>
                                <p>F-Grade score recalibrations clamp at -2.15% average returns over a 3-day hold period, providing perfect short hedge signals for technical analysis.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {/* MOBILE QUICK PORTFOLIO ADD BOTTOM SHEET */}
            {showQuickAdd && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#070b13]/85 backdrop-blur-sm p-0 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-[#0b0f19] border-t border-cyan-500/30 rounded-t-3xl p-6 w-full flex flex-col gap-4 shadow-[0_-10px_40px_rgba(6,182,212,0.15)] animate-[slideUp_0.25s_ease-out] max-h-[85vh] overflow-y-auto">
                        {/* Drag indicator handle */}
                        <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto" />

                        <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                            <div className="flex items-center gap-1.5">
                                <Plus className="w-4 h-4 text-cyan-400" />
                                <h3 className="text-[13px] font-black text-white tracking-widest uppercase">{dict.quickAddTitle}</h3>
                            </div>
                            <button
                                onClick={() => setShowQuickAdd(false)}
                                className="text-slate-400 hover:text-white font-bold text-[13px] uppercase tracking-wider transition-all"
                            >
                                CLOSE
                            </button>
                        </div>

                        <form onSubmit={handleQuickAddSubmit} className="flex flex-col gap-4.5 font-mono text-[13px]">
                            <div className="flex flex-col gap-1">
                                <label className="font-bold text-slate-500 uppercase tracking-widest text-[13px]">TICKER</label>
                                <input
                                    type="text"
                                    value={quickAddTicker}
                                    disabled
                                    className="w-full bg-slate-950/60 border border-slate-900 h-10 px-3 rounded-xl font-bold uppercase tracking-wider text-slate-400 select-none opacity-50"
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="font-bold text-slate-500 uppercase tracking-widest text-[13px]">{dict.quickAddQty}</label>
                                <input
                                    type="number"
                                    required
                                    step="any"
                                    value={quickAddQty}
                                    onChange={(e) => setQuickAddQty(e.target.value)}
                                    placeholder="e.g. 50"
                                    className="w-full bg-slate-950/80 border border-slate-900 focus:border-cyan-500/50 transition-all outline-none h-10 px-3 rounded-xl font-bold text-white"
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="font-bold text-slate-500 uppercase tracking-widest text-[13px]">{dict.quickAddPrice}</label>
                                <input
                                    type="number"
                                    required
                                    step="any"
                                    value={quickAddPrice}
                                    onChange={(e) => setQuickAddPrice(e.target.value)}
                                    placeholder="Avg Price (e.g. 120.5)"
                                    className="w-full bg-slate-950/80 border border-slate-900 focus:border-cyan-500/50 transition-all outline-none h-10 px-3 rounded-xl font-bold text-white"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full h-11 rounded-xl bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 font-black transition-all flex items-center justify-center gap-1.5 tracking-widest uppercase mt-1 shadow-md"
                            >
                                <Check className="w-3.5 h-3.5" />
                                {dict.quickAddSubmit}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
