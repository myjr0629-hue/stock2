"use client";

import React from "react";
import { useLocale } from "next-intl";

/**
 * GuardianTooltip — CSS-only hover tooltip for Guardian section labels.
 * Shows a brief description of the indicator on hover.
 * Compliance: observational only, no advisory language.
 */

// ── Tooltip descriptions per section (ko/en/ja) ──
const TOOLTIP_MAP: Record<string, { ko: string; en: string; ja: string }> = {
    gravityGauge: {
        ko: "RLSI 기반 시장 방향 게이지 — 모멘텀, 심리, 포지션, 회전 5대 요소를 종합한 실시간 시장 중력 지표",
        en: "RLSI-based Market Direction Gauge — real-time market gravity indicator synthesizing 5 core factors: momentum, sentiment, positioning, rotation & volatility",
        ja: "RLSI市場方向ゲージ — モメンタム・心理・ポジション・ローテーション・ボラティリティ5要素を統合したリアルタイム市場重力指標",
    },
    realityCheck: {
        ko: "매크로 핵심 지표 레이더 — 미국 10년물, S&P 500, NDX, DOW, 금리, 달러 흐름을 한눈에 파악",
        en: "Macro Core Radar — US 10Y yield, S&P 500, NDX, DOW, rates & dollar flow at a glance for cross-asset awareness",
        ja: "マクロコアレーダー — 米10年債・S&P 500・NDX・DOW・金利・ドルフローを一目で把握するクロスアセット指標",
    },
    gammaShield: {
        ko: "감마 노출 방패 — 옵션 시장의 감마 압력, 스퀴즈 리스크, 주요 지지/저항 밴드를 기관급으로 시각화",
        en: "Gamma Exposure Shield — institutional-grade visualization of options gamma pressure, squeeze risk & key support/resistance bands",
        ja: "ガンマエクスポージャーシールド — オプション市場のガンマ圧力・スクイーズリスク・主要サポ/レジバンドを機関級で可視化",
    },
    flowMap: {
        ko: "자금 흐름 토폴로지 맵 — 15개 섹터 간 실시간 자금 이동, 회전 패턴, 순유입/유출을 3D로 시각화",
        en: "Capital Flow Topology Map — 3D visualization of real-time fund rotation across 15 sectors, showing inflow/outflow patterns & rotation regimes",
        ja: "資金フロートポロジーマップ — 15セクター間のリアルタイム資金移動・ローテーションパターンを3Dで可視化",
    },
    rlsiInsight: {
        ko: "RLSI 인사이트 — AI 기반 시장 컨디션 분석, 모닝 브리핑 & 전술적 판단을 제공하는 종합 인텔리전스",
        en: "RLSI Insight — AI-powered market condition analysis providing morning briefings & tactical intelligence across multiple timeframes",
        ja: "RLSIインサイト — AI市場コンディション分析、モーニングブリーフィング＆タクティカルインテリジェンスを提供する総合情報",
    },
    marketBreadth: {
        ko: "시장 광폭성 분석 — 상승/하락 비율, A/D 라인, 거래량 분석으로 시장 전체 건강도를 진단",
        en: "Market Breadth Analysis — advance/decline ratio, A/D line & volume analysis diagnosing overall market health",
        ja: "市場ブレッド分析 — 騰落比率・AD比率・出来高分析で市場全体の健全性を診断",
    },
    economicCalendar: {
        ko: "경제 캘린더 — 금리 결정, 고용 지표, GDP 등 시장에 영향을 미치는 주요 이벤트 스케줄",
        en: "Economic Calendar — schedule of key market-moving events including rate decisions, employment data & GDP releases",
        ja: "経済カレンダー — 金利決定・雇用指標・GDPなど市場に影響を与える重要イベントスケジュール",
    },
    tacticalVerdict: {
        ko: "순환매 전술 분석 — 섹터 간 자금 흐름, 로테이션 패턴, 수급 변화를 AI가 종합 분석한 전술적 시장 판단",
        en: "Sector Rotation Tactical Analysis — AI-synthesized verdict on inter-sector fund flows, rotation patterns & supply-demand shifts",
        ja: "セクターローテーション戦術分析 — セクター間資金フロー・ローテーションパターン・需給変化をAIが総合分析した戦術的市場判断",
    },
    sectorIntel: {
        ko: "섹터 인텔리전스 — 선택된 섹터의 5일 추세, 거래량 강도, IFS(기관 수급 점수) 및 가격-기관 괴리 분석을 통한 심층 수급 진단",
        en: "Sector Intelligence — deep analysis of selected sector's 5-day trend, volume intensity, IFS (Institutional Flow Score) & price-institutional divergence detection",
        ja: "セクターインテリジェンス — 選択セクターの5日トレンド・出来高強度・IFS(機関フロースコア)・価格-機関乖離分析による深層需給診断",
    },
    ifs: {
        ko: "IFS (Institutional Flow Score) — 섹터별 기관 수급 점수 (-100~+100). Whale Index(40%), Net Premium(30%), Dark Pool(20%), PCR(10%)를 종합하여 기관의 실제 자금 방향을 수치화. CONFIRMED=가격과 수급 일치, DIVERGENT=가격과 수급 괴리(스텔스 매집/개인 주도 의심)",
        en: "IFS (Institutional Flow Score) — sector-level institutional flow composite (-100 to +100). Synthesizes Whale Index (40%), Net Premium (30%), Dark Pool (20%) & PCR (10%) to quantify true institutional direction. CONFIRMED = price-flow aligned, DIVERGENT = stealth accumulation or retail-driven rally detected",
        ja: "IFS (Institutional Flow Score) — セクター別機関フロースコア(-100~+100)。Whale Index(40%)・Net Premium(30%)・Dark Pool(20%)・PCR(10%)を統合し機関の実際の資金方向を数値化。CONFIRMED=価格と需給一致、DIVERGENT=ステルス買集/個人主導の乖離を検出",
    },
    whatIf: {
        ko: "What-If 시뮬레이터 — VIX, 금리, 심리, 모멘텀을 조정해 RLSI 점수 변화를 시뮬레이션",
        en: "What-If Simulator — simulate RLSI score changes by adjusting VIX, yield, sentiment & momentum parameters",
        ja: "What-Ifシミュレーター — VIX・金利・心理・モメンタムを調整しRLSIスコア変化をシミュレーション",
    },
};

interface GuardianTooltipProps {
    sectionId: keyof typeof TOOLTIP_MAP;
    children: React.ReactNode;
    position?: "top" | "bottom" | "right";
}

export function GuardianTooltip({ sectionId, children, position = "bottom" }: GuardianTooltipProps) {
    const locale = useLocale() as "ko" | "en" | "ja";
    const tooltip = TOOLTIP_MAP[sectionId];
    if (!tooltip) return <>{children}</>;

    const text = tooltip[locale] || tooltip.en;

    const positionClasses = {
        top: "bottom-full left-0 mb-2",
        bottom: "top-full left-0 mt-2",
        right: "left-full top-0 ml-2",
    };

    return (
        <span className="relative group inline-flex items-center cursor-help">
            {children}
            <span
                className={`
                    absolute ${positionClasses[position]} z-[60] w-[280px] max-w-[90vw]
                    px-3 py-2.5 rounded-lg
                    bg-slate-900/95 backdrop-blur-xl
                    border border-slate-600/40
                    shadow-2xl shadow-black/50
                    text-[12px] leading-[1.6] text-slate-300 font-normal tracking-normal normal-case
                    opacity-0 invisible group-hover:opacity-100 group-hover:visible
                    transition-all duration-200 ease-out
                    pointer-events-none
                `}
            >
                {text}
            </span>
        </span>
    );
}

export default GuardianTooltip;
