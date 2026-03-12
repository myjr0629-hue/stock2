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
