"use client";

/**
 * CardTooltip — Fixed-position hover tooltip for card labels
 * 
 * Uses position:fixed + getBoundingClientRect() to escape
 * parent overflow:hidden containers. Renders on top of everything.
 */

import { useLocale } from "next-intl";
import { ReactNode, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface CardTooltipProps {
    children: ReactNode;
    /** Multi-language tooltip (COMMAND page style) */
    tooltip?: { ko: string; en: string; ja: string };
    /** Simple string tooltip (Dashboard style — backward compatible) */
    text?: string;
    /** Position hint (kept for backward compatibility, portal auto-positions) */
    position?: 'bottom' | 'top' | 'left' | 'right';
    /** Optional FOMO badge text */
    badge?: { ko: string; en: string; ja: string } | null;
}

export function CardTooltip({ children, tooltip, text: textProp, badge }: CardTooltipProps) {
    const locale = useLocale() as "ko" | "en" | "ja";
    const displayText = textProp || (tooltip ? (tooltip[locale] || tooltip.en) : '');
    const badgeText = badge ? (badge[locale] || badge.en) : null;
    const triggerRef = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Smart positioning: prefer bottom, fallback to top if near bottom edge
            let top = rect.bottom + 8;
            let left = rect.left;

            // If tooltip would go off-screen right, shift left
            if (left + 230 > vw) {
                left = vw - 240;
            }

            // If tooltip would go off-screen bottom, show above
            if (top + 100 > vh) {
                top = rect.top - 8; // will use transform to go upwards
            }

            setCoords({ top, left });
            setVisible(true);
        }
    }, []);

    const hide = useCallback(() => {
        timerRef.current = setTimeout(() => setVisible(false), 100);
    }, []);

    return (
        <>
            <span
                ref={triggerRef}
                className="inline-flex cursor-default"
                onMouseEnter={show}
                onMouseLeave={hide}
            >
                {children}
            </span>
            {visible && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed z-[9999] pointer-events-none"
                    style={{ top: coords.top, left: coords.left }}
                    onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
                    onMouseLeave={() => setVisible(false)}
                >
                    {/* Solid opaque tooltip */}
                    <div
                        className="rounded-lg border border-slate-500/50 px-3 py-2.5 w-[220px]"
                        style={{
                            backgroundColor: '#1e293b',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(71,85,105,0.3)',
                        }}
                    >
                        <p className="text-[12px] text-slate-200 leading-[1.5] font-jakarta font-normal normal-case tracking-normal m-0">
                            {displayText}
                        </p>
                        {badgeText && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-600/40">
                                <span className="inline-flex items-center gap-1 text-[11px] text-indigo-400 font-semibold font-jakarta uppercase tracking-wider">
                                    <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                                        <path d="M5 0L6.2 3.2L9.5 3.8L7.2 6.2L7.6 9.5L5 8L2.4 9.5L2.8 6.2L0.5 3.8L3.8 3.2Z" fill="currentColor" />
                                    </svg>
                                    {badgeText}
                                </span>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

/**
 * Pre-defined tooltip content for all COMMAND page cards.
 * All text is observational/descriptive — compliance-safe.
 */
export const COMMAND_TOOLTIPS = {
    SIGNAL_CORE: {
        tooltip: {
            ko: '복합 시그널 엔진 — SMA, 플로우, 센티먼트 융합 분석',
            en: 'Multi-signal convergence — SMA, flow & sentiment fusion',
            ja: '複合シグナルエンジン — SMA・フロー・センチメント融合',
        },
        badge: {
            ko: '기관급 시그널 분석',
            en: 'Institutional-grade signals',
            ja: '機関投資家級シグナル',
        },
    },
    FLOW_UNIT: {
        tooltip: {
            ko: '실시간 옵션 프리미엄 플로우 — 콜/풋 비율, 거래량 강도',
            en: 'Real-time options flow — call/put ratio & volume strength',
            ja: 'リアルタイムオプションフロー — コール/プット比率・出来高',
        },
        badge: {
            ko: '실시간 딜러 플로우',
            en: 'Live dealer flow data',
            ja: 'リアルタイムディーラーフロー',
        },
    },
    GAMMA_PRESSURE: {
        tooltip: {
            ko: '딜러 감마 포지셔닝 — 풋 플로어~콜 월 범위와 플립 레벨',
            en: 'Dealer gamma positioning — put floor to call wall range',
            ja: 'ディーラーガンマポジショニング — PP〜CW範囲',
        },
        badge: {
            ko: '감마 익스포저 시각화',
            en: 'Gamma exposure visual',
            ja: 'ガンマエクスポージャー可視化',
        },
    },
    INTEL_FEED: {
        tooltip: {
            ko: 'AI 뉴스 센티먼트 분석 — 불리시/베어리시 실시간 분류',
            en: 'AI news sentiment — real-time bullish/bearish classification',
            ja: 'AIニュースセンチメント — リアルタイム分類',
        },
        badge: {
            ko: 'AI 인텔리전스',
            en: 'AI intelligence feed',
            ja: 'AIインテリジェンス',
        },
    },
    PRICE_HISTORY: {
        tooltip: {
            ko: 'OHLC 차트 — SMA 오버레이, 세션 마커, 이동평균 교차 감지',
            en: 'OHLC chart — SMA overlays & session markers',
            ja: 'OHLCチャート — SMAオーバーレイ・セッションマーカー',
        },
        badge: null,
    },
    GEX_TIMELINE: {
        tooltip: {
            ko: '감마 익스포저 히스토리 — 레짐 전환과 딜러 헤징 트렌드',
            en: 'GEX history — regime transitions & dealer hedging trends',
            ja: 'GEX履歴 — レジーム転換とディーラーヘッジ',
        },
        badge: {
            ko: '30일 딜러 포지셔닝',
            en: '30-day dealer positioning',
            ja: '30日間ディーラーポジショニング',
        },
    },
    TECH_LEVELS: {
        tooltip: {
            ko: '핵심 기술적 레벨 맵 — SMA, VWAP, Max Pain, 감마 레벨 대비 현재가 위치를 시각화',
            en: 'Key technical levels — current price position vs SMA, VWAP, Max Pain & gamma levels',
            ja: '主要テクニカルレベル — SMA・VWAP・マックスペイン・ガンマ対比の現在価格位置',
        },
        badge: {
            ko: '기관급 레벨 분석',
            en: 'Institutional-grade levels',
            ja: '機関投資家級レベル分析',
        },
    },
    TACTICAL_RANGE: {
        tooltip: {
            ko: '옵션 기반 지지/저항 — 맥스 페인 수렴도 분석',
            en: 'Options-derived support/resistance — max pain convergence',
            ja: 'オプション基盤S/R — マックスペイン収束分析',
        },
        badge: {
            ko: '옵션 구조 분석',
            en: 'Options structure analysis',
            ja: 'オプション構造分析',
        },
    },
    NET_GAMMA_ENGINE: {
        tooltip: {
            ko: '행사가별 감마 분포 — 콜 월, 풋 플로어, 플립 레벨',
            en: 'Strike-level gamma — call wall, put floor & flip level',
            ja: '行使価格別ガンマ — CW・PF・フリップレベル',
        },
        badge: {
            ko: '감마 스트라이크 맵',
            en: 'Gamma strike map',
            ja: 'ガンマストライクマップ',
        },
    },
    VOL_REGIME: {
        tooltip: {
            ko: '변동성 압축/확장 상태 — GEX 기반 레짐',
            en: 'Volatility state — GEX-implied regime',
            ja: 'ボラティリティ状態 — GEXレジーム',
        },
        badge: null,
    },
    CONVICTION: {
        tooltip: {
            ko: '멀티팩터 강세/약세 확신도',
            en: 'Multi-factor bullish/bearish conviction',
            ja: 'マルチファクター確信度スコア',
        },
        badge: null,
    },
    VWAP: {
        tooltip: {
            ko: '거래량 가중 평균가 — 기관 체결 기준가',
            en: 'Volume-weighted average — institutional benchmark',
            ja: '出来高加重平均価格 — 機関ベンチマーク',
        },
        badge: null,
    },
    SHORT_SQUEEZE: {
        tooltip: {
            ko: '숏 스퀴즈 확률 — 공매도 비율, 이용률, DTC',
            en: 'Squeeze probability — SI, utilization & DTC',
            ja: 'スクイーズ確率 — SI・利用率・DTC',
        },
        badge: null,
    },
    ANALYST_TARGET: {
        tooltip: {
            ko: '월가 컨센서스 목표가 분포',
            en: 'Wall Street consensus target distribution',
            ja: 'ウォール街コンセンサス目標価格',
        },
        badge: null,
    },
    INST_RADAR: {
        tooltip: {
            ko: '다크풀 활동 및 기관 플로우 감지',
            en: 'Dark pool activity & institutional flow',
            ja: 'ダークプール・機関投資家フロー検出',
        },
        badge: null,
    },
    TREND_PHASE: {
        tooltip: {
            ko: 'SMA 교차 상태 — 골든/데드 크로스',
            en: 'SMA cross — golden/dead cross detection',
            ja: 'SMAクロス — ゴールデン/デッドクロス',
        },
        badge: null,
    },
    FUNDAMENTAL: {
        tooltip: {
            ko: '핵심 재무 — P/E, ROE, 마진, FCF',
            en: 'Key financials — P/E, ROE, margins & FCF',
            ja: '主要財務 — P/E・ROE・マージン・FCF',
        },
        badge: null,
    },
    EARNINGS: {
        tooltip: {
            ko: '어닝 일정 및 실적 서프라이즈',
            en: 'Earnings calendar & surprise tracking',
            ja: '決算日程・サプライズ追跡',
        },
        badge: null,
    },
    RELATED: {
        tooltip: {
            ko: '관련 종목 실시간 동반 움직임',
            en: 'Related tickers — correlated moves',
            ja: '関連銘柄リアルタイム連動',
        },
        badge: null,
    },
    PUT_FLOOR: {
        tooltip: {
            ko: '풋 감마 집중 가격대 — 지지선 역할',
            en: 'Put gamma concentration — acts as support',
            ja: 'プットガンマ集中 — サポート機能',
        },
        badge: null,
    },
    CALL_WALL: {
        tooltip: {
            ko: '콜 감마 집중 가격대 — 저항선 역할',
            en: 'Call gamma concentration — acts as resistance',
            ja: 'コールガンマ集中 — レジスタンス機能',
        },
        badge: null,
    },
    GAMMA_FLIP: {
        tooltip: {
            ko: '감마 레짐 전환 가격 — 변동성 구조 전환점',
            en: 'Gamma regime flip price — volatility structure shift',
            ja: 'ガンマレジーム転換価格 — ボラ構造シフト',
        },
        badge: null,
    },
    SQUEEZE_RISK: {
        tooltip: {
            ko: '숏 감마 환경 급등/급락 리스크',
            en: 'Spike risk in short gamma environment',
            ja: 'ショートガンマ急騰/急落リスク',
        },
        badge: null,
    },
    SENTIMENT_OVERVIEW: {
        tooltip: {
            ko: 'AI 뉴스 기반 시장 센티먼트 분포',
            en: 'AI news-based market sentiment distribution',
            ja: 'AIニュース基盤センチメント分布',
        },
        badge: null,
    },
} as const;

/**
 * Pre-defined tooltip content for FLOW page indicator cards.
 * All text is observational/descriptive — compliance-safe.
 */
export const FLOW_TOOLTIPS = {
    SMART_MONEY: {
        tooltip: {
            ko: '블록 거래($50K+, $100K+) 기반 기관 자금 흐름 스코어. 대형 프리미엄 방향 집중도를 수치화합니다.',
            en: 'Block trade-based institutional flow score. Quantifies large premium directional concentration ($50K+ / $100K+ trades).',
            ja: 'ブロック取引($50K+・$100K+)基盤の機関マネーフロースコア。大口プレミアム方向集中度を数値化。',
        },
        badge: {
            ko: '기관 전용 플로우 분석',
            en: 'Institutional-only flow analysis',
            ja: '機関投資家専用フロー分析',
        },
    },
    MAX_PAIN: {
        tooltip: {
            ko: '옵션 만기 시 옵션 보유자 손실이 극대화되는 가격. 만기일 가격 수렴(pinning) 경향을 파악하는 핵심 지표입니다.',
            en: 'Price where option holder losses are maximized at expiry. Key indicator for expiry-day price convergence (pinning) tendencies.',
            ja: '満期時にオプション保有者の損失が最大化する価格。満期日の価格収束(ピニング)傾向を把握する指標。',
        },
        badge: {
            ko: '만기일 가격 수렴 분석',
            en: 'Expiry convergence analysis',
            ja: '満期日価格収束分析',
        },
    },
    IV_SKEW: {
        tooltip: {
            ko: 'Put IV - Call IV 차이. 양(+)이면 풋 수요 과다(하방 헤지 증가), 음(-)이면 콜 수요 과다(상승 기대)를 나타냅니다.',
            en: 'Put IV minus Call IV spread. Positive means excess put demand (downside hedging), negative means excess call demand (upside expectation).',
            ja: 'Put IV − Call IV差。正値はプット需要過多(下方ヘッジ増加)、負値はコール需要過多(上昇期待)を示す。',
        },
        badge: {
            ko: 'IV 구조 불균형 감지',
            en: 'IV structure imbalance detection',
            ja: 'IV構造不均衡検出',
        },
    },
    DEX: {
        tooltip: {
            ko: '델타 익스포저 — 옵션 체인 전체의 순 델타 합계. 양(+)이면 콜 델타 우위(딜러 숏 주식 필요), 음(-)이면 풋 델타 우위입니다.',
            en: 'Net delta across the full options chain. Positive means call delta dominance (dealers need to short stock), negative means put delta dominance.',
            ja: 'フルオプションチェーンのネットデルタ合計。正値はコールデルタ優位(ディーラーの株売り需要)、負値はプットデルタ優位。',
        },
        badge: {
            ko: '딜러 헤징 방향 분석',
            en: 'Dealer hedging direction analysis',
            ja: 'ディーラーヘッジ方向分析',
        },
    },
    UOA: {
        tooltip: {
            ko: '이례적 옵션 활동 — 당일 거래량/미결제약정 비율. 평균 대비 급증 시 포지션 구축 또는 정보 거래 가능성을 나타냅니다.',
            en: 'Unusual Options Activity — today\'s volume vs open interest ratio. Spikes above average signal potential position building or informed trading.',
            ja: '異常オプション活動 — 当日出来高/建玉比率。平均比急増時にポジション構築または情報取引の可能性。',
        },
        badge: {
            ko: '비정상 거래 탐지',
            en: 'Anomaly detection engine',
            ja: '異常取引検出エンジン',
        },
    },
    DARK_POOL_PCT: {
        tooltip: {
            ko: '다크풀(장외) 거래 비중 — 전체 거래량 대비 FINRA TRF/ADF 거래소 볼륨 비율. Quote Rule로 매수/매도 분류합니다.',
            en: 'Dark pool (off-exchange) volume as % of total. Ratio of FINRA TRF/ADF venue volume. Buy/sell classified via Quote Rule.',
            ja: 'ダークプール(取引所外)比率 — 全取引量対FINRA TRF/ADF出来高比率。Quote Ruleで売買分類。',
        },
        badge: {
            ko: '기관 거래소 외 분석',
            en: 'Off-exchange institutional analysis',
            ja: '取引所外機関分析',
        },
    },
    IMPLIED_MOVE: {
        tooltip: {
            ko: 'ATM 스트래들 가격 기반 예상 변동폭. 만기까지 시장이 가격 결정한 등락 범위를 %로 표시합니다.',
            en: 'ATM straddle-based expected move. Shows the market-priced percentage range of movement through expiry.',
            ja: 'ATMストラドル価格基盤の予想変動幅。満期までの市場織り込み済み変動範囲を%表示。',
        },
        badge: {
            ko: '시장 내재 변동성',
            en: 'Market-implied volatility',
            ja: '市場インプライド・ボラティリティ',
        },
    },
    PUT_FLOOR: {
        tooltip: {
            ko: '풋 감마 집중 가격 — 딜러가 주식 매수 헤지를 시작하는 구간으로 지지선 역할을 합니다.',
            en: 'Put gamma concentration — price level where dealers begin buying stock to hedge, acting as support.',
            ja: 'プットガンマ集中価格 — ディーラーが株買いヘッジを開始する区間でサポート機能。',
        },
        badge: null,
    },
    CALL_WALL: {
        tooltip: {
            ko: '콜 감마 집중 가격 — 딜러가 주식 매도 헤지를 시작하는 구간으로 저항선 역할을 합니다.',
            en: 'Call gamma concentration — price level where dealers begin selling stock to hedge, acting as resistance.',
            ja: 'コールガンマ集中価格 — ディーラーが株売りヘッジを開始する区間でレジスタンス機能。',
        },
        badge: null,
    },
    SQUEEZE: {
        tooltip: {
            ko: '숏 스퀴즈 지표 — 공매도 비율, 대차 이용률, DTC(Days to Cover) 종합 확률. 높을수록 급등 압력 증가.',
            en: 'Short squeeze indicator — combines short interest, utilization rate & DTC. Higher values indicate increased squeeze pressure.',
            ja: 'ショートスクイーズ指標 — 空売り比率・貸株利用率・DTC総合確率。高値ほど急騰圧力増大。',
        },
        badge: {
            ko: '스퀴즈 리스크 분석',
            en: 'Squeeze risk analysis',
            ja: 'スクイーズリスク分析',
        },
    },
    WHALE_POSITION: {
        tooltip: {
            ko: '대형 기관 포지션 분석 — 프리미엄 $150K+ 거래 기반 방향성. 콜 도미넌트 또는 풋 도미넌트를 감지합니다.',
            en: 'Large institutional position — directional bias from $150K+ premium trades. Detects call or put dominance.',
            ja: '大口機関ポジション分析 — $150K+プレミアム取引基盤の方向性。コール/プットドミナンスを検出。',
        },
        badge: {
            ko: '기관 포지셔닝 감지',
            en: 'Institutional positioning',
            ja: '機関ポジショニング検出',
        },
    },
    GEX_REGIME: {
        tooltip: {
            ko: '감마 익스포저 레짐 — 양(+)이면 변동성 억제(딜러 역추세 헤지), 음(-)이면 변동성 증폭(딜러 순추세 헤지) 환경.',
            en: 'Gamma exposure regime — positive means volatility suppression (dealer counter-trend hedging), negative means amplification (pro-trend hedging).',
            ja: 'ガンマエクスポージャーレジーム — 正値は変動性抑制、負値は変動性増幅環境。',
        },
        badge: {
            ko: '딜러 포지셔닝 레짐',
            en: 'Dealer positioning regime',
            ja: 'ディーラーポジショニングレジーム',
        },
    },
    SHORT_VOL: {
        tooltip: {
            ko: '공매도 거래량 비율 — 전체 거래량 대비 공매도 볼륨. 높을수록 하방 포지션 구축 또는 마켓메이킹 활동 증가.',
            en: 'Short volume as % of total — higher values indicate increased short positioning or market-making activity.',
            ja: '空売り出来高比率 — 全取引量対空売りボリューム。高値ほどショートポジション構築増加。',
        },
        badge: null,
    },
    PC_RATIO: {
        tooltip: {
            ko: '풋/콜 거래량 비율 — 1.0 이상이면 풋 우위(하방 헤지/약세), 이하면 콜 우위(상승 기대).',
            en: 'Put/Call volume ratio — above 1.0 means put dominance (downside hedging), below means call dominance (upside expectation).',
            ja: 'プット/コール出来高比率 — 1.0以上はプット優位(下方ヘッジ)、以下はコール優位(上昇期待)。',
        },
        badge: null,
    },
    COMPOSITE_INDEX: {
        tooltip: {
            ko: '복합 지표 지수 — 9개 핵심 지표(플로우, 감마, IV, 공매도 등)의 방향 일치도를 종합 점수화.',
            en: 'Multi-indicator composite — direction alignment score across 9 core indicators (flow, gamma, IV, short interest, etc.).',
            ja: '複合指標指数 — 9つの主要指標(フロー・ガンマ・IV・空売り等)の方向一致度を総合スコア化。',
        },
        badge: {
            ko: '멀티시그널 융합 엔진',
            en: 'Multi-signal fusion engine',
            ja: 'マルチシグナル融合エンジン',
        },
    },
    OPI: {
        tooltip: {
            ko: '옵션 프라이스 게이지 — 콜/풋 포지셔닝 기반 가격 압력 방향. +는 콜 가격 우위, -는 풋 가격 우위.',
            en: 'Options Price Gauge — price pressure direction from call/put positioning. Positive = call-price dominance, negative = put-price dominance.',
            ja: 'オプション価格ゲージ — コール/プットポジショニング基盤の価格圧力。正値=コール優位、負値=プット優位。',
        },
        badge: null,
    },
    ATM_IV: {
        tooltip: {
            ko: 'ATM 내재변동성 — 등가격 옵션에서 추출한 시장 내재 변동성. 시장의 향후 변동 기대치를 반영합니다.',
            en: 'ATM implied volatility — market-implied volatility extracted from at-the-money options. Reflects market\'s forward volatility expectation.',
            ja: 'ATMインプライドボラティリティ — 等価格オプションから抽出した市場内在変動性。',
        },
        badge: null,
    },
    PRICE_POSITION: {
        tooltip: {
            ko: '현재가 위치 분석 — 오늘의 고/저가 범위 내 현재가 위치. 극단 위치 시 반전 또는 추세 지속 가능성.',
            en: 'Current price position within today\'s high/low range. Extreme positions may indicate reversal or trend continuation potential.',
            ja: '現在価格位置分析 — 本日の高値/安値範囲内の現在価格位置。',
        },
        badge: null,
    },
    AI_VERDICT: {
        tooltip: {
            ko: 'AI 종합 판정 — 플로우, 감마, IV, 공매도 등 10개 지표를 가중 합산한 복합 방향성 스코어. 실시간 옵션 데이터 기반.',
            en: 'AI composite verdict — weighted aggregate of 10 indicators (flow, gamma, IV, short interest, etc.). Based on real-time options data.',
            ja: 'AI総合判定 — フロー・ガンマ・IV・空売り等10指標の加重合算スコア。リアルタイムオプションデータ基盤。',
        },
        badge: {
            ko: '멀티팩터 AI 분석',
            en: 'Multi-factor AI analysis',
            ja: 'マルチファクターAI分析',
        },
    },
    INSTITUTIONAL_FLOW: {
        tooltip: {
            ko: '기관 대형 주문 추적 — $150K+ 프리미엄 옵션 거래를 실시간 감지. 블록/스윕 분류와 BEP(손익분기점) 계산 포함.',
            en: 'Institutional order tracking — detects $150K+ premium options in real-time. Includes block/sweep classification and BEP calculation.',
            ja: '機関大口注文追跡 — $150K+プレミアムオプション取引をリアルタイム検出。ブロック/スイープ分類とBEP計算。',
        },
        badge: {
            ko: '고빈도 기관 데이터',
            en: 'High-frequency institutional data',
            ja: '高頻度機関データ',
        },
    },
    DARK_POOL_SECTION: {
        tooltip: {
            ko: 'FINRA 다크풀 블록 거래 피드 — 10,000주 이상 장외 거래를 실시간 표시. Quote Rule로 매수/매도 분류.',
            en: 'FINRA dark pool block trade feed — displays 10,000+ share off-exchange trades. Buy/sell classified via Quote Rule.',
            ja: 'FINRAダークプール・ブロック取引フィード — 1万株以上の取引所外取引を表示。Quote Ruleで売買分類。',
        },
        badge: {
            ko: 'FINRA 장외 거래 분석',
            en: 'FINRA off-exchange analysis',
            ja: 'FINRA取引所外分析',
        },
    },
    INTRADAY_STRIKE: {
        tooltip: {
            ko: '장중 행사가별 콜/풋 거래량 분포 — 가격대별 매수-매도 세력 집중도를 시각화. 핵심 지지/저항 가격대 탐지.',
            en: 'Intraday call/put volume by strike — visualizes buyer-seller concentration at each price level. Detects key support/resistance zones.',
            ja: '日中行使価格別コール/プット出来高分布 — 価格帯別の売買集中度を可視化。主要S/R帯検出。',
        },
        badge: {
            ko: '옵션 지형 시각화',
            en: 'Options terrain visualization',
            ja: 'オプション地形可視化',
        },
    },
} as const;

/**
 * Pre-defined tooltip content for PORTFOLIO analytics dashboard cards.
 * All text is observational/descriptive — compliance-safe.
 */
export const PORTFOLIO_TOOLTIPS = {
    SECTOR_DISTRIBUTION: {
        tooltip: {
            ko: '보유 종목의 섹터별 비중 분포 — 포트폴리오의 산업 다각화 수준을 한눈에 파악할 수 있습니다.',
            en: 'Sector allocation of your holdings — visualize industry diversification at a glance.',
            ja: '保有銘柄のセクター別比率分布 — ポートフォリオの業種分散度を一目で把握。',
        },
        badge: {
            ko: '섹터 집중도 분석',
            en: 'Sector concentration analysis',
            ja: 'セクター集中度分析',
        },
    },
    RISK_ASSESSMENT: {
        tooltip: {
            ko: '포트폴리오 리스크 진단 — 집중도(단일 종목), 섹터 편중, 분산도 3가지 축으로 리스크를 측정합니다.',
            en: 'Portfolio risk diagnosis — measures concentration, sector bias, and diversification across three dimensions.',
            ja: 'ポートフォリオリスク診断 — 集中度・セクター偏重・分散度の3つの軸でリスクを測定。',
        },
        badge: {
            ko: '3축 리스크 분석',
            en: '3-axis risk analysis',
            ja: '3軸リスク分析',
        },
    },
    PNL_TREEMAP: {
        tooltip: {
            ko: '종목별 당일 손익 트리맵 — 사각형 크기는 비중, 색상은 당일 변동률. 초록(상승) / 빨강(하락).',
            en: 'Daily P&L treemap — rectangle size = weight, color = today\'s change. Green (gain) / Red (loss).',
            ja: '銘柄別当日損益ツリーマップ — 面積=比重、色=当日変動率。緑(上昇)/赤(下落)。',
        },
        badge: {
            ko: '비중+성과 시각화',
            en: 'Weight + performance visual',
            ja: '比重+パフォーマンス可視化',
        },
    },
    CONCENTRATION: {
        tooltip: {
            ko: '단일 종목 최대 비중 — 40% 이상 시 집중 위험, 30% 이하 시 분산 양호. 리밸런싱 참고 지표.',
            en: 'Top single-stock weight — above 40% signals concentration risk, below 30% is well diversified.',
            ja: '単一銘柄最大比重 — 40%以上は集中リスク、30%以下は分散良好。リバランス参考指標。',
        },
        badge: null,
    },
    SECTOR_BIAS: {
        tooltip: {
            ko: '최대 섹터 비중 — 특정 섹터 60% 이상 시 섹터 리스크 주의. 산업 분산이 하락 방어에 기여합니다.',
            en: 'Top sector weight — above 60% signals sector risk. Industry diversification helps in downside protection.',
            ja: '最大セクター比重 — 60%以上はセクターリスク注意。業種分散が下落防御に寄与。',
        },
        badge: null,
    },
    DIVERSIFICATION: {
        tooltip: {
            ko: '보유 종목 수 / 섹터 수 — 더 많은 섹터에 분산될수록 포트폴리오 안정성이 높아집니다.',
            en: 'Holdings count vs sector count — more sectors = higher stability and lower correlation risk.',
            ja: '保有銘柄数/セクター数 — より多くのセクターに分散するほどポートフォリオの安定性が向上。',
        },
        badge: null,
    },
} as const;
