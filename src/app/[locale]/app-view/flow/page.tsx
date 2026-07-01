'use client';

import { useState, useEffect, useMemo, useRef, type SyntheticEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AdBanner } from '@/components/app/AdBanner';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { SwipeableTabs } from '@/components/app/SwipeableTabs';
import { ValueWall } from '@/components/app/ValueWall';
import dashStyles from '../dash/dash.module.css';
import s from '../cmd/cmd.module.css';

import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';

const LOGO = (t: string) => `https://assets.parqet.com/logos/symbol/${t}?format=png`;
const APP_LOGO = (t: string) => `/api/logo/${t}`;

function handleLogoFallback(event: SyntheticEvent<HTMLImageElement>, ticker: string) {
  const img = event.currentTarget;
  if (img.dataset.logoFallback !== 'parqet') {
    img.dataset.logoFallback = 'parqet';
    img.src = LOGO(ticker);
    return;
  }
  img.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   3-LANGUAGE LOCALIZATION DICTIONARY
   ═══════════════════════════════════════════════════════════ */

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ko: {
    title: '실시간 옵션 플로우',
    searchPlaceholder: '티커 입력 (예: NVDA)...',
    opiGauge: '옵션 압박 지수 (OPI)',
    pcRatio: 'Volume P/C 비율',
    totalPremium: '총 프리미엄',
    callBullish: 'Call (상승 베팅)',
    putBearish: 'Put (하락 베팅)',
    liveFlow: '실시간 옵션 체인 거래 내역',
    maxPain: '맥스 페인 레벨',
    lockTitle: '기관급 실시간 옵션 체인',
    lockDesc: '30초 광고를 시청하시면 1시간 동안 실시간 옵션 체인 분석 및 맥스페인 레벨을 즉시 잠금 해제합니다.',
    unlockBtn: '광고 시청 후 해제',
    unlockSub: '또는 월 $9.99에 무광고 이용',
    regime: '변동성 모드',
    underlyer: '기초자산 가격',
    whaleRadar: '고래 블록 거래 (Whale Sweep)',
    uoaTitle: '이례적 옵션 거래 폭발 (UOA)',
    darkPoolTitle: '다크풀 & 기관 거래 (Dark Pool & Block Trades)',
    vol: '거래량',
    oi: '미결제약정',
    ratio: '배수',
    whaleLockDesc: '30초 광고를 시청하시면 $100K 이상의 고래 거래 전체 내역과 실시간 다크풀/블록딜 내역을 1시간 동안 해금합니다.',
    opiLabel: '옵션 압박 지수 (OPI)',
    atmIvPctLabel: 'ATM IV 분위수',
    whaleNetBetLabel: '대형 고래 순베팅',
    support: '지지선',
    resistance: '저항선',
    expiry: '만기',
    lowVol: '저변동',
    neutral: '중립',
    highVol: '고변동',
    bullishMomentum: '상방 추세',
    neutralLabel: '중립',
    bearishPressure: '하방 압력',
  },
  en: {
    title: 'Live Options Flow',
    searchPlaceholder: 'Enter ticker (e.g. NVDA)...',
    opiGauge: 'Options Pressure Index (OPI)',
    pcRatio: 'Volume P/C Ratio',
    totalPremium: 'Total Premium',
    callBullish: 'Call (Bullish)',
    putBearish: 'Put (Bearish)',
    liveFlow: 'Live Options Chain Transactions',
    maxPain: 'Max Pain Level',
    lockTitle: 'Institutional Options Flow',
    lockDesc: 'Watch a 30-second video to unlock live options flow and max pain levels for 1 hour.',
    unlockBtn: 'Watch & Unlock',
    unlockSub: 'or subscribe for $9.99/mo — ad free',
    regime: 'Volatility Regime',
    underlyer: 'Underlying Price',
    whaleRadar: 'Whale Sweep Radar',
    uoaTitle: 'Unusual Options Activity (UOA)',
    darkPoolTitle: 'Dark Pool & Block Trades',
    vol: 'Volume',
    oi: 'OI',
    ratio: 'Ratio',
    whaleLockDesc: 'Watch a 30-second video to unlock the full list of Whale Sweeps (>$100K) and Dark Pool & Block Trades for 1 hour.',
    opiLabel: 'Options Pressure Index (OPI)',
    atmIvPctLabel: 'ATM IV Percentile',
    whaleNetBetLabel: 'Whale Net Bet',
    support: 'Support',
    resistance: 'Resistance',
    expiry: 'exp',
    lowVol: 'LOW VOL',
    neutral: 'NEUTRAL',
    highVol: 'HIGH VOL',
    bullishMomentum: 'BULLISH MOMENTUM',
    neutralLabel: 'NEUTRAL',
    bearishPressure: 'BEARISH PRESSURE',
  },
  ja: {
    title: 'リアルタイム・オプション・フロー',
    searchPlaceholder: 'ティッカー入力 (例: NVDA)...',
    opiGauge: 'オプション圧力指数 (OPI)',
    pcRatio: 'Volume P/C比率',
    totalPremium: '総プレミアム',
    callBullish: 'コール (強気)',
    putBearish: 'プット (弱気)',
    liveFlow: 'リアルタイム・オプション・チェーン取引履歴',
    maxPain: 'マックス・ペイン・レベル',
    lockTitle: '機関投資家向けオプション・フロー',
    lockDesc: '30秒の広告を視聴すると、1時間リアルタイム・オプション・フローとマックス・ペインを即座にアンロックします。',
    unlockBtn: '広告を視聴して解除',
    unlockSub: 'または月額 $9.99 で広告なし利用',
    regime: 'ボラティリティ・レジーム',
    underlyer: '原資産価格',
    whaleRadar: 'クジラ大口取引 (Whale Sweep)',
    uoaTitle: '異常オプション取引爆発 (UOA)',
    darkPoolTitle: 'ダークプール & 機関取引 (Dark Pool & Block Trades)',
    vol: '出来高',
    oi: '建玉',
    ratio: '倍率',
    whaleLockDesc: '30秒の動画を視聴すると、1時間$100K以上のクジラ取引全履歴とリアルタイムダークプール・ブロックディール内訳をアンロックできます。',
    opiLabel: 'オプション圧力指数 (OPI)',
    atmIvPctLabel: 'ATM IV パーセンタイル',
    whaleNetBetLabel: 'クジラ純ベット',
    support: 'サポート',
    resistance: 'レジスタンス',
    expiry: '満期',
    lowVol: '低変動',
    neutral: 'ニュートラル',
    highVol: '高変動',
    bullishMomentum: '上昇トレンド',
    neutralLabel: '中立',
    bearishPressure: '下落圧力',
  }
};

/* ═══════════════════════════════════════════════════════════
   DEMO FALLBACK DATA — Always show content even if APIs fail
   ═══════════════════════════════════════════════════════════ */

const APP_FLOW_COPY = {
  ko: {
    searchPlaceholder: '티커를 입력하거나 옵션 흐름을 바로 분석',
    searchCta: 'FLOW',
    searchHint: '옵션, 다크풀, 감마 구조를 하나의 흐름으로 압축',
    overviewEyebrow: 'OPTIONS FLOW OVERVIEW',
    drivers: '핵심 드라이버',
    opiFactors: 'OPI 구성 요인',
    factorPcr: 'P/C 압력',
    factorPremium: '프리미엄 우위',
    factorGamma: '감마 위치',
    pressurePair: 'Pressure Pair',
    pressureConclusion: '수급 압력 결론',
    netPremium: '순 프리미엄',
    callShare: 'Call Share',
    putShare: 'Put Share',
    sourceFreshness: 'Source',
    liveSource: 'LIVE FLOW',
    estimatedSource: 'ESTIMATED',
    gammaFlip: 'Gamma Flip',
    spot: 'Spot',
    flipDistance: 'Flip 거리',
    volatilityEffect: '변동성 효과',
    absorbsVol: '변동성 흡수',
    amplifiesVol: '변동성 확대',
    premiumFlow: '프리미엄 흐름',
    gammaMap: '감마 위치',
    riskState: '리스크 상태',
    highConviction: 'HIGH CONVICTION',
    mediumConviction: 'WATCH',
    lowConviction: 'NEUTRAL',
    callDominant: '콜 우위',
    putDominant: '풋 우위',
    balanced: '균형',
    aboveGamma: '감마 플립 위',
    belowGamma: '감마 플립 아래',
    stable: '안정',
    loaded: '변동성 장전',
    erupting: '분출 가능',
    opiInfoTitle: 'OPI 설명',
    opiInfo: '콜/풋 프리미엄, 거래량, P/C 비율을 합성해 옵션 압력이 어느 방향으로 기울었는지 보여줍니다.',
    intraday: '장중 작동',
    closed: '장마감',
    underlyingOpi: '기초자산 OPI',
    compositeIndex: '종합 수급 지수',
    compStrong: '강한 상방',
    compNeutral: '중립 혼조',
    compBear: '하방 압력',
    compositeInfoTitle: '종합지수 설명',
    compositeInfo: 'OPI, IV Rank, P/C, 감마 위치, 고래 플로우를 합성해 방향성 일치도를 점수화합니다.',
    squeezeProbability: '스퀴즈 분출 확률',
    squeezeHigh: '높음 (주의)',
    squeezeModerate: '보통 (대기)',
    squeezeLow: '낮음 (안정)',
    squeezeInfoTitle: '스퀴즈 확률 설명',
    squeezeInfo: '공매도 비율과 변동성, 옵션 포지셔닝을 결합해 급격한 가격 압축 해소 가능성을 추정합니다.',
    totalPremium: '총 프리미엄',
    callBias: 'Call 상방 베팅',
    putBias: 'Put 하방 베팅',
    spotTitle: '현재가 위치',
    spotInfoTitle: '현재가 위치 설명',
    spotInfo: '풋 플로어와 콜 월 사이에서 현재 가격이 어디에 놓여 있는지 보여줍니다.',
    support: '지지선',
    resistance: '저항선',
    optionsRegime: '옵션 시장 & GEX 레짐',
    longGamma: 'LONG GAMMA (안정적 레짐)',
    shortGamma: 'SHORT GAMMA (변동성 레짐)',
    regimeInfoTitle: '감마 레짐 설명',
    regimeInfo: '감마 노출 기반의 변동성 레짐입니다. Long Gamma는 변동성 흡수, Short Gamma는 변동성 확대 가능성을 뜻합니다.',
    regimeInsight: 'IV Rank {ivRank}%, P/C {pcRatio} 기준으로 현재 옵션 구조는 {bias}에 가깝습니다.',
    signals: {
      bullish: {
        title: '상방 플로우 우위',
        body: '종합 플로우 점수가 상방 쪽으로 기울어져 있습니다. OPI가 중립권이어도 고래 포지션, 스마트머니, UOA가 상방 결론을 강화합니다.',
        action: '콜 월 돌파 시 모멘텀 확인, 감마 플립 이탈 시 속도 둔화 가능성을 우선 체크하세요.'
      },
      neutral: {
        title: '균형 구간 압축',
        body: '프리미엄과 P/C가 균형권에 있어 방향성보다 레인지와 레짐 변화가 더 중요합니다.',
        action: '풋 플로어와 콜 월 사이에서 체결 강도 변화가 먼저 나타나는 쪽을 추적하세요.'
      },
      bearish: {
        title: '하방 헤지 압력',
        body: '풋 수요와 변동성 압력이 커지고 있습니다. 반등보다 지지선 방어 여부가 먼저입니다.',
        action: '풋 플로어 하향 이탈과 Short Gamma 전환이 겹치는지 확인하세요.'
      }
    }
  },
  en: {
    searchPlaceholder: 'Enter a ticker or scan options flow',
    searchCta: 'FLOW',
    searchHint: 'Options, dark pool, and gamma structure compressed into one read',
    overviewEyebrow: 'OPTIONS FLOW OVERVIEW',
    drivers: 'Key Drivers',
    opiFactors: 'OPI Factor Rail',
    factorPcr: 'P/C Pressure',
    factorPremium: 'Premium Bias',
    factorGamma: 'Gamma Position',
    pressurePair: 'Pressure Pair',
    pressureConclusion: 'Pressure Read',
    netPremium: 'Net Premium',
    callShare: 'Call Share',
    putShare: 'Put Share',
    sourceFreshness: 'Source',
    liveSource: 'LIVE FLOW',
    estimatedSource: 'ESTIMATED',
    gammaFlip: 'Gamma Flip',
    spot: 'Spot',
    flipDistance: 'Flip Distance',
    volatilityEffect: 'Vol Effect',
    absorbsVol: 'Vol absorbing',
    amplifiesVol: 'Vol amplifying',
    premiumFlow: 'Premium Flow',
    gammaMap: 'Gamma Map',
    riskState: 'Risk State',
    highConviction: 'HIGH CONVICTION',
    mediumConviction: 'WATCH',
    lowConviction: 'NEUTRAL',
    callDominant: 'Call dominant',
    putDominant: 'Put dominant',
    balanced: 'Balanced',
    aboveGamma: 'Above gamma flip',
    belowGamma: 'Below gamma flip',
    stable: 'Stable',
    loaded: 'Volatility loaded',
    erupting: 'Breakout risk',
    opiInfoTitle: 'OPI Info',
    opiInfo: 'Combines call/put premium, volume, and P/C ratio to show which direction options pressure is leaning.',
    intraday: 'Intraday',
    closed: 'Closed',
    underlyingOpi: 'Underlying OPI',
    compositeIndex: 'Composite Index',
    compStrong: 'Strong Bullish',
    compNeutral: 'Neutral Mixed',
    compBear: 'Bearish Flow',
    compositeInfoTitle: 'Composite Info',
    compositeInfo: 'Scores alignment across OPI, IV Rank, P/C, gamma position, and whale flow.',
    squeezeProbability: 'Squeeze Probability',
    squeezeHigh: 'High Squeeze',
    squeezeModerate: 'Moderate',
    squeezeLow: 'Low Squeeze',
    squeezeInfoTitle: 'Squeeze Info',
    squeezeInfo: 'Estimates compression-release risk by combining short volume, volatility, and options positioning.',
    totalPremium: 'Total Premium',
    callBias: 'Call bullish bet',
    putBias: 'Put bearish bet',
    spotTitle: 'Spot Price Position',
    spotInfoTitle: 'Ruler Info',
    spotInfo: 'Shows where the current price sits between Put Floor support and Call Wall resistance.',
    support: 'Support',
    resistance: 'Resistance',
    optionsRegime: 'Options Market & GEX Regime',
    longGamma: 'LONG GAMMA (STABLE)',
    shortGamma: 'SHORT GAMMA (VOLATILE)',
    regimeInfoTitle: 'Regime Info',
    regimeInfo: 'Gamma exposure regime. Long Gamma tends to absorb volatility, while Short Gamma can amplify moves.',
    regimeInsight: 'At IV Rank {ivRank}% and P/C {pcRatio}, the current options structure is near {bias}.',
    signals: {
      bullish: {
        title: 'Bullish flow dominance',
        body: 'The composite flow score is leaning bullish. Even when OPI is neutral, whale positioning, smart money, and UOA can carry the top-level verdict.',
        action: 'Confirm momentum on a Call Wall break, and watch for speed loss if price loses gamma flip.'
      },
      neutral: {
        title: 'Compressed balance zone',
        body: 'Premium and P/C are in balance, so range control and regime change matter more than direction.',
        action: 'Track which side prints stronger first between Put Floor and Call Wall.'
      },
      bearish: {
        title: 'Downside hedge pressure',
        body: 'Put demand and volatility pressure are rising. Support defense matters before chasing rebounds.',
        action: 'Watch whether a Put Floor break overlaps with a Short Gamma transition.'
      }
    }
  },
  ja: {
    searchPlaceholder: 'ティッカーを入力してオプションフローを分析',
    searchCta: 'FLOW',
    searchHint: 'オプション、ダークプール、ガンマ構造を一つの読み筋に集約',
    overviewEyebrow: 'OPTIONS FLOW OVERVIEW',
    drivers: '主要ドライバー',
    opiFactors: 'OPI構成要因',
    factorPcr: 'P/C圧力',
    factorPremium: 'プレミアム優位',
    factorGamma: 'ガンマ位置',
    pressurePair: 'Pressure Pair',
    pressureConclusion: '需給圧力の結論',
    netPremium: 'ネットプレミアム',
    callShare: 'Call Share',
    putShare: 'Put Share',
    sourceFreshness: 'Source',
    liveSource: 'LIVE FLOW',
    estimatedSource: 'ESTIMATED',
    gammaFlip: 'Gamma Flip',
    spot: 'Spot',
    flipDistance: 'Flip距離',
    volatilityEffect: '変動性効果',
    absorbsVol: '変動性吸収',
    amplifiesVol: '変動性拡大',
    premiumFlow: 'プレミアムフロー',
    gammaMap: 'ガンマ位置',
    riskState: 'リスク状態',
    highConviction: 'HIGH CONVICTION',
    mediumConviction: 'WATCH',
    lowConviction: 'NEUTRAL',
    callDominant: 'コール優勢',
    putDominant: 'プット優勢',
    balanced: '均衡',
    aboveGamma: 'ガンマフリップ上',
    belowGamma: 'ガンマフリップ下',
    stable: '安定',
    loaded: '変動性蓄積',
    erupting: 'ブレイク警戒',
    opiInfoTitle: 'OPI説明',
    opiInfo: 'コール/プットのプレミアム、出来高、P/C比率を合成し、オプション圧力の方向を示します。',
    intraday: '取引中',
    closed: '引け後',
    underlyingOpi: '原資産 OPI',
    compositeIndex: '総合需給指数',
    compStrong: '強い上方向',
    compNeutral: '中立混合',
    compBear: '下方向圧力',
    compositeInfoTitle: '総合指数説明',
    compositeInfo: 'OPI、IV Rank、P/C、ガンマ位置、ホエールフローの方向一致度を点数化します。',
    squeezeProbability: 'スクイーズ確率',
    squeezeHigh: '高い (注意)',
    squeezeModerate: '中程度',
    squeezeLow: '低い (安定)',
    squeezeInfoTitle: 'スクイーズ説明',
    squeezeInfo: 'ショート出来高、変動性、オプションポジションから価格圧縮の解放リスクを推定します。',
    totalPremium: '総プレミアム',
    callBias: 'コール上昇ベット',
    putBias: 'プット下落ベット',
    spotTitle: '現在値の位置',
    spotInfoTitle: '現在値位置説明',
    spotInfo: 'プットフロアとコールウォールの間で現在価格がどこにあるかを示します。',
    support: '支持線',
    resistance: '抵抗線',
    optionsRegime: 'オプション市場 & GEXレジーム',
    longGamma: 'LONG GAMMA (安定)',
    shortGamma: 'SHORT GAMMA (変動性)',
    regimeInfoTitle: 'ガンマレジーム説明',
    regimeInfo: 'ガンマエクスポージャーに基づく変動性レジームです。Long Gammaは変動性を吸収し、Short Gammaは値動きを拡大しやすくします。',
    regimeInsight: 'IV Rank {ivRank}%、P/C {pcRatio} 基準で現在のオプション構造は {bias} に近い状態です。',
    signals: {
      bullish: {
        title: '上方向フロー優勢',
        body: '総合フロースコアは上方向に傾いています。OPIが中立圏でも、ホエール、スマートマネー、UOAが上方向の結論を補強します。',
        action: 'コールウォール突破時はモメンタム確認、ガンマフリップ割れでは減速を優先確認します。'
      },
      neutral: {
        title: '均衡圏で圧縮',
        body: 'プレミアムとP/Cが均衡圏にあり、方向よりもレンジとレジーム変化が重要です。',
        action: 'プットフロアとコールウォールの間で先に強く約定する側を追跡します。'
      },
      bearish: {
        title: '下方向ヘッジ圧力',
        body: 'プット需要と変動性圧力が高まっています。反発より支持線防衛が先です。',
        action: 'プットフロア割れとShort Gamma転換が重なるか確認します。'
      }
    }
  }
} as const;

/* FlowTransaction & DEMO_FLOW — removed (orphan: never read in JSX) */

/* ═══════════════════════════════════════════════════════════
   OPI GAUGE ARC HELPER
   ═══════════════════════════════════════════════════════════ */

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

// Last REAL dark-pool trades, cached at module scope so the (gated) preview
// always holds real data across remounts — never the demo placeholder — and
// unlocking reveals it instantly. Data is prefetched while the gate is locked.
let lastGoodDarkPool: any[] | null = null;

const WHALE_PREMIUM_FLOOR = 50000;

const WHALE_DP_COPY = {
  ko: {
    sectionEyebrow: 'LEVEL 3 FLOW',
    sectionTitle: '기관 플로우 총량',
    sectionInfoTitle: '기관 플로우 설명',
    sectionInfo: '고래 옵션 체결과 다크풀 블록 거래를 같은 화면에서 압축해 기관성 수급이 어느 방향으로 쏠리는지 보여줍니다. 투자 조언이 아니라 시장 구조 참고용 지표입니다.',
    liveBadge: '실시간 집계',
    dayTotal: '당일 추적 총량',
    whaleOptions: '고래 옵션',
    darkBlocks: '다크풀 블록',
    callFlow: 'Call 흐름',
    putFlow: 'Put 흐름',
    buySide: '매수 판정',
    sellSide: '매도 판정',
    psychology: '심리 판독',
    psychologyInfoTitle: '심리 판독 설명',
    psychologyInfo: '고래 Call 비중, 다크풀 순방향, 숏볼륨 압력을 가중 합산한 파생 판독입니다. 원천 데이터의 방향 일치도를 보여주며 투자 조언은 아닙니다.',
    chase: '추격 매수 심리',
    hedge: '헤지 방어 심리',
    mixed: '혼합 수급',
    conviction: '확신도',
    dpDominance: '다크풀 비중',
    shortPressure: '숏 압력',
    blockIntensity: '블록 강도',
    netBias: '순방향',
    whaleTab: '고래',
    darkTab: '다크풀',
    chainTitle: '기관급 실시간 체인',
    chainSubtitle: '고래 스윕, 다크풀 블록, 가격대별 충격도를 1시간 동안 확인합니다.',
    unlockCta: '광고 보고 1시간 해제',
    adFree: '또는 $9.99/월 광고 제거',
    socialProof: '오늘 14.2K 잠금해제',
    freePreview: '무료 미리보기',
    largestPrint: '최대 체결',
    prints: '건',
    cost: '비용',
    bep: '손익분기',
    premium: '프리미엄',
    strike: '행사가',
    value: '거래대금',
    price: '체결가',
    shares: '주',
    impactHigh: 'HIGH',
    impactMid: 'MED',
    impactLow: 'LOW',
    sourceFresh: '데이터 신선도',
    liveData: 'LIVE',
    recentData: 'RECENT',
    closedData: 'CLOSED DATA',
    delayedData: 'DELAYED',
    noData: '현재 표시할 기관성 체결이 없습니다',
  },
  en: {
    sectionEyebrow: 'LEVEL 3 FLOW',
    sectionTitle: 'Institutional Flow Total',
    sectionInfoTitle: 'Institutional Flow',
    sectionInfo: 'Combines whale options prints and dark-pool block trades to show where institutional pressure is leaning. Educational market-structure signal, not investment advice.',
    liveBadge: 'Live aggregate',
    dayTotal: 'Tracked today',
    whaleOptions: 'Whale options',
    darkBlocks: 'Dark blocks',
    callFlow: 'Call flow',
    putFlow: 'Put flow',
    buySide: 'Buy classified',
    sellSide: 'Sell classified',
    psychology: 'Psychology Read',
    psychologyInfoTitle: 'Psychology Read',
    psychologyInfo: 'Derived read from weighted whale call share, dark-pool net direction, and short-volume pressure. It shows signal alignment, not investment advice.',
    chase: 'Chase demand',
    hedge: 'Hedge defense',
    mixed: 'Mixed flow',
    conviction: 'Conviction',
    dpDominance: 'Dark pool share',
    shortPressure: 'Short pressure',
    blockIntensity: 'Block intensity',
    netBias: 'Net bias',
    whaleTab: 'Whale',
    darkTab: 'Dark Pool',
    chainTitle: 'Institutional Live Chain',
    chainSubtitle: 'Unlock whale sweeps, dark-pool blocks, and strike-level impact for 1 hour.',
    unlockCta: 'Watch ad to unlock 1HR',
    adFree: 'or $9.99/mo ad-free',
    socialProof: '14.2K unlocked today',
    freePreview: 'Free preview',
    largestPrint: 'Largest print',
    prints: 'prints',
    cost: 'Cost',
    bep: 'BEP',
    premium: 'Premium',
    strike: 'Strike',
    value: 'Value',
    price: 'Price',
    shares: 'shares',
    impactHigh: 'HIGH',
    impactMid: 'MED',
    impactLow: 'LOW',
    sourceFresh: 'Freshness',
    liveData: 'LIVE',
    recentData: 'RECENT',
    closedData: 'CLOSED DATA',
    delayedData: 'DELAYED',
    noData: 'No institutional prints available right now',
  },
  ja: {
    sectionEyebrow: 'LEVEL 3 FLOW',
    sectionTitle: '機関フロー総量',
    sectionInfoTitle: '機関フロー説明',
    sectionInfo: '大口オプション約定とダークプールのブロック取引を圧縮し、機関性資金がどちらへ傾いているかを示します。投資助言ではなく市場構造の参考指標です。',
    liveBadge: 'リアルタイム集計',
    dayTotal: '本日追跡総量',
    whaleOptions: '大口オプション',
    darkBlocks: 'ダークブロック',
    callFlow: 'Call フロー',
    putFlow: 'Put フロー',
    buySide: '買い判定',
    sellSide: '売り判定',
    psychology: '心理判定',
    psychologyInfoTitle: '心理判定',
    psychologyInfo: '大口Call比率、ダークプールのネット方向、ショート出来高圧力を加重した派生判定です。原データの方向一致度を示すもので投資助言ではありません。',
    chase: '追随買い心理',
    hedge: 'ヘッジ防衛心理',
    mixed: '混合フロー',
    conviction: '確信度',
    dpDominance: 'ダークプール比率',
    shortPressure: 'ショート圧力',
    blockIntensity: 'ブロック強度',
    netBias: 'ネット方向',
    whaleTab: '大口',
    darkTab: 'ダーク',
    chainTitle: '機関級ライブチェーン',
    chainSubtitle: '大口スイープ、ダークプールブロック、価格帯別インパクトを1時間確認できます。',
    unlockCta: '広告視聴で1時間解除',
    adFree: 'または月$9.99で広告なし',
    socialProof: '本日14.2K件解除',
    freePreview: '無料プレビュー',
    largestPrint: '最大約定',
    prints: '件',
    cost: 'コスト',
    bep: 'BEP',
    premium: 'プレミアム',
    strike: '権利行使価格',
    value: '取引代金',
    price: '約定価格',
    shares: '株',
    impactHigh: 'HIGH',
    impactMid: 'MED',
    impactLow: 'LOW',
    sourceFresh: '鮮度',
    liveData: 'LIVE',
    recentData: 'RECENT',
    closedData: 'CLOSED DATA',
    delayedData: 'DELAYED',
    noData: '現在表示できる機関性約定はありません',
  }
} as const;

function formatCompactMoney(value: number | null | undefined, digits = 1) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1000000000) return `${sign}$${(abs / 1000000000).toFixed(digits)}B`;
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(digits)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function pctNumber(value: string | number | null | undefined) {
  if (typeof value === 'number') return value > 1 ? value : value * 100;
  if (!value) return 0;
  return Number(String(value).replace(/[^0-9.-]/g, '')) || 0;
}

function SparklineBg({ up, seed = 'default' }: { up: boolean; seed?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pts = useMemo(() => {
    if (!mounted) return '';
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = seed.charCodeAt(i) + ((h << 5) - h);
    }
    const rand = () => {
      const x = Math.sin(h++) * 10000;
      return x - Math.floor(x);
    };

    const n = 40;
    const vals: number[] = [];
    let v = 50;
    for (let i = 0; i < n; i++) {
      v += (rand() - (up ? 0.42 : 0.58)) * 8;
      v = Math.max(10, Math.min(90, v));
      vals.push(v);
    }
    return vals.map((y, i) => `${(i / (n - 1)) * 100},${100 - y}`).join(' ');
  }, [up, seed, mounted]);

  if (!mounted) {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
        style={{ position: 'absolute', inset: 0, opacity: 0 }}>
      </svg>
    );
  }

  const gradId = `sparkGrad-${seed}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
      style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0.15" />
          <stop offset="100%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={up ? 'var(--green)' : 'var(--red)'}
        strokeWidth="0.8" opacity="0.4" />
      <polygon points={`0,100 ${pts} 100,100`} fill={`url(#${gradId})`} />
    </svg>
  );
}

const BROKEN_COPY_NEEDLES = ['?', '?명', '媛', '而', '뚮', '꺍', '궥', '誤', '鸚', '쨌'];

function isSafeLocaleCopy(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return !BROKEN_COPY_NEEDLES.some(needle => text.includes(needle));
  } catch {
    return false;
  }
}

export default function AppFlowPage() {
  const locale = useLocale();
  const t = useMemo(() => {
    const copy = TRANSLATIONS[locale];
    return copy && isSafeLocaleCopy(copy) ? copy : TRANSLATIONS.en;
  }, [locale]);
  const flowCopy = useMemo(() => {
    const copy = APP_FLOW_COPY[locale as keyof typeof APP_FLOW_COPY];
    return copy && isSafeLocaleCopy(copy) ? copy : APP_FLOW_COPY.en;
  }, [locale]);
  const tIndicators = useTranslations('indicators');

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const queryTicker = new URLSearchParams(window.location.search).get('t')?.trim().toUpperCase();
    const savedTicker = localStorage.getItem('app-active-ticker');
    if (queryTicker) {
      setTicker(queryTicker);
      setSearchInput(queryTicker);
    } else if (savedTicker) {
      setTicker(savedTicker);
      setSearchInput(savedTicker);
    }
  }, []);

  const [ticker, setTicker] = useState('NVDA');
  const [searchInput, setSearchInput] = useState('NVDA');

  // Sync ticker to localStorage for Flow ↔ Command sync
  useEffect(() => {
    if (ticker) localStorage.setItem('app-active-ticker', ticker);
  }, [ticker]);
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Real-time market / price integrations (similar to cmd/page.tsx)
  const { status: marketStatus } = useMarketStatus();
  const livePrice = useLivePrice(ticker, marketStatus.market);
  const { getPrice: wsGetPrice } = useRealtimeData([ticker]);
  const wsPrice = wsGetPrice(ticker);

  // Flow State
  const [tickerData, setTickerData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'ai-intel' | 'whale-flow' | 'strike-profile'>('overview');
  
  const [price, setPrice] = useState(0);
  const [change, setChange] = useState(0);
  const [opi, setOpi] = useState(0); // 0-100
  const [pcRatio, setPcRatio] = useState(0);
  const [pcRatioOI, setPcRatioOI] = useState(0);
  const [pcCallVol, setPcCallVol] = useState(0);
  const [pcPutVol, setPcPutVol] = useState(0);
  const [pcCallOI, setPcCallOI] = useState(0);
  const [pcPutOI, setPcPutOI] = useState(0);
  const [totalPrem, setTotalPrem] = useState(0); // USD
  const [callPct, setCallPct] = useState(50); // %
  const [maxPainVal, setMaxPainVal] = useState(0);
  const [volRegime, setVolRegime] = useState('STABLE'); // STABLE, LOADED, ERUPTING
  /* transactions state — removed (orphan: never read in JSX) */
  const [rawChain, setRawChain] = useState<any[]>([]);
  const [whaleTradesFeed, setWhaleTradesFeed] = useState<any[]>([]);
  const [darkPoolTrades, setDarkPoolTrades] = useState<any[]>(lastGoodDarkPool ?? []);
  const [darkPoolMeta, setDarkPoolMeta] = useState<any>(null);
  const [whaleMeta, setWhaleMeta] = useState<any>(null);
  const [flowTab, setFlowTab] = useState<'whale' | 'darkpool'>('whale');
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [ivRankOverride, setIvRankOverride] = useState<number | null>(null);

  // Click outside to close popovers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (activePopover && !(e.target as HTMLElement).closest('.popover-container') && !(e.target as HTMLElement).closest('.info-btn')) {
        setActivePopover(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [activePopover]);

  // Compute display prices via util
  const effectiveSession = marketStatus.isHoliday || marketStatus.market === 'closed'
    ? 'CLOSED'
    : (tickerData?.session || tickerData?.rawTickerData?.session || 'CLOSED').toUpperCase();

  const opiCalculated = useMemo(() => {
    return {
      value: opi,
      isFallback: effectiveSession === 'CLOSED'
    };
  }, [opi, effectiveSession]);

  const pickPositiveNumber = (...values: unknown[]) => {
    for (const value of values) {
      if (value == null || value === '') continue;
      const n = typeof value === 'string'
        ? Number(value.replace(/[$,%\s,]/g, ''))
        : Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  const liveGammaFlipRaw = pickPositiveNumber(
    tickerData?.flow?.gammaFlipLevel,
    tickerData?.rawTickerData?.flow?.gammaFlipLevel,
    tickerData?.flow?.gammaFlip,
    tickerData?.rawTickerData?.flow?.gammaFlip,
    tickerData?.premium?.gammaFlipRaw,
    tickerData?.rawTickerData?.premium?.gammaFlipRaw,
    tickerData?.premium?.gammaFlip,
    tickerData?.rawTickerData?.premium?.gammaFlip,
  );
  const liveGammaFlip = liveGammaFlipRaw
    ? `$${liveGammaFlipRaw.toFixed(2)}`
    : '—';

  const { displayPrice, displayChangePct, activeExtPrice, activeExtLabel, activeExtPct } = calcPriceDisplay({
    livePrice: wsPrice?.price || livePrice?.price,
    liveChangePct: wsPrice?.changePct || livePrice?.changePercent,
    liveExtPrice: livePrice?.extendedPrice,
    liveExtChangePct: livePrice?.extendedChangePercent,
    liveExtLabel: livePrice?.extendedLabel
      ? (effectiveSession === 'CLOSED' ? `${livePrice.extendedLabel} (CLOSED)` : livePrice.extendedLabel)
      : undefined,
    apiDisplayPrice: tickerData?.display?.price || tickerData?.rawTickerData?.display?.price || price || 0,
    apiDisplayChangePct: tickerData?.display?.changePctPct || tickerData?.rawTickerData?.display?.changePctPct || change || 0,
    session: effectiveSession,
    prevRegularClose: tickerData?.prices?.prevRegularClose || tickerData?.rawTickerData?.prices?.prevRegularClose || tickerData?.prevClose || null,
    prevClose: tickerData?.prevClose || tickerData?.rawTickerData?.prevClose || null,
    regularCloseToday: tickerData?.prices?.regularCloseToday || tickerData?.rawTickerData?.prices?.regularCloseToday || undefined,
    prevChangePct: tickerData?.prices?.prevChangePct || tickerData?.rawTickerData?.prices?.prevChangePct,
    fallbackChangePct: tickerData?.display?.changePctPct || tickerData?.rawTickerData?.display?.changePctPct || change || 0,
    lastTrade: tickerData?.prices?.lastTrade || tickerData?.rawTickerData?.prices?.lastTrade || price || 0,
    extended: tickerData?.extended || tickerData?.rawTickerData?.extended || {},
    prices: tickerData?.prices || tickerData?.rawTickerData?.prices || {},
  });

  const liveRsi = pickPositiveNumber(
    tickerData?.display?.rsi14,
    tickerData?.rawTickerData?.display?.rsi14,
  ) ?? 0;
  const liveVwap = pickPositiveNumber(
    tickerData?.vwap,
    tickerData?.rawTickerData?.vwap,
    tickerData?.display?.vwap,
    tickerData?.rawTickerData?.display?.vwap,
  ) ?? (displayPrice * 0.995);
  const liveHigh = pickPositiveNumber(
    tickerData?.prices?.high,
    tickerData?.rawTickerData?.prices?.high,
    tickerData?.display?.high,
    tickerData?.rawTickerData?.display?.high,
  ) ?? (displayPrice * 1.015);
  const liveLow = pickPositiveNumber(
    tickerData?.prices?.low,
    tickerData?.rawTickerData?.prices?.low,
    tickerData?.display?.low,
    tickerData?.rawTickerData?.display?.low,
  ) ?? (displayPrice * 0.985);

  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [extFlash, setExtFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef(displayPrice);
  const prevExtPriceRef = useRef(activeExtPrice);
  const displayPriceRef = useRef(displayPrice);
  const displayChangePctRef = useRef(displayChangePct);
  const effectiveSessionRef = useRef(effectiveSession);

  // Dynamic Dark Pool / Squeezes
  const dpPct = tickerData?.flow?.darkPoolPct ? (tickerData.flow.darkPoolPct > 1 ? tickerData.flow.darkPoolPct.toFixed(1) : (tickerData.flow.darkPoolPct * 100).toFixed(1)) + '%' : '—';
  
  let dpVolStr = locale === 'ko' ? 'DP — / 전체 —' : locale === 'ja' ? 'DP — / 全体 —' : 'DP — / Total —';
  if (tickerData?.flow?.darkPoolVol && tickerData?.flow?.darkPoolTotalVol) {
    const v1 = (tickerData.flow.darkPoolVol / 1000).toFixed(1);
    const v2 = (tickerData.flow.darkPoolTotalVol / 1000).toFixed(1);
    const totalLabel = locale === 'ko' ? '전체' : locale === 'ja' ? '全体' : 'Total';
    dpVolStr = 'DP ' + v1 + 'K / ' + totalLabel + ' ' + v2 + 'K';
  }
  
  let dpNetBuyStr = locale === 'ko' ? '순매수 —' : locale === 'ja' ? '純買い —' : 'Net Buy —';
  if (tickerData?.flow?.darkPoolNetBuyVal !== undefined && tickerData?.flow?.darkPoolNetBuyVal !== null) {
    const prefix = tickerData.flow.darkPoolNetBuyVal >= 0 ? '+' : '';
    const val = (tickerData.flow.darkPoolNetBuyVal / 1000).toFixed(1);
    const label = locale === 'ko' ? '순매수' : locale === 'ja' ? '純買い' : 'Net Buy';
    dpNetBuyStr = label + ' ' + prefix + val + 'K';
  }

  const shortPct = tickerData?.flow?.shortVolPct ? (tickerData.flow.shortVolPct > 1 ? tickerData.flow.shortVolPct.toFixed(1) : (tickerData.flow.shortVolPct * 100).toFixed(1)) + '%' : '—';
  
  let shortVolStr = locale === 'ko' ? '공매도 — / 전체 —' : locale === 'ja' ? '空売り — / 全体 —' : 'Short Vol — / Total —';
  if (tickerData?.flow?.shortVol && tickerData?.flow?.shortTotalVol) {
    const s1 = (tickerData.flow.shortVol / 1000000).toFixed(1);
    const s2 = (tickerData.flow.shortTotalVol / 1000000).toFixed(1);
    const shortLabel = locale === 'ko' ? '공매도' : locale === 'ja' ? '空売り' : 'Short Vol';
    const totalLabel = locale === 'ko' ? '전체' : locale === 'ja' ? '全体' : 'Total';
    shortVolStr = shortLabel + ' ' + s1 + 'M / ' + totalLabel + ' ' + s2 + 'M';
  }

  const blockCount = tickerData?.flow?.blockTrades ?? darkPoolMeta?.tradeCount ?? 0;

  useEffect(() => {
    displayPriceRef.current = displayPrice;
    displayChangePctRef.current = displayChangePct;
    effectiveSessionRef.current = effectiveSession;
    if (displayPrice !== prevPriceRef.current) {
      const isUp = displayPrice >= prevPriceRef.current;
      setFlash(isUp ? 'up' : 'down');
      prevPriceRef.current = displayPrice;
      const tId = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(tId);
    }
  }, [displayPrice, displayChangePct, effectiveSession]);

  useEffect(() => {
    if (effectiveSession !== 'PRE' && effectiveSession !== 'POST') {
      prevExtPriceRef.current = activeExtPrice;
      setExtFlash(null);
      return;
    }
    if (!activeExtPrice || activeExtPrice <= 0) {
      prevExtPriceRef.current = activeExtPrice;
      return;
    }
    if (activeExtPrice !== prevExtPriceRef.current) {
      const isUp = activeExtPrice >= prevExtPriceRef.current;
      setExtFlash(isUp ? 'up' : 'down');
      prevExtPriceRef.current = activeExtPrice;
      const tId = setTimeout(() => setExtFlash(null), 950);
      return () => clearTimeout(tId);
    }
  }, [activeExtPrice, effectiveSession]);

  const resolvedPrevClose = tickerData?.prices?.prevRegularClose || tickerData?.rawTickerData?.prices?.prevRegularClose || tickerData?.prevClose || 0;
  const finalChangeAbs = resolvedPrevClose > 0 ? Math.abs(displayPrice - resolvedPrevClose) : Math.abs(tickerData?.display?.changeAbs || 0);
  const up = displayChangePct >= 0;
  // Always color the change by direction (red down / green up), even when the market is
  // closed — matches the Command page so the two screens stay consistent.
  const priceColorClass = up ? s.pos : s.neg;

  // Check localStorage for unlock timestamp
  useEffect(() => {
    const checkUnlock = () => {
      const raw = localStorage.getItem('signum_ad_unlock');
      if (!raw) { setIsLocked(true); return; }
      try {
        const parsed = JSON.parse(raw);
        const until = parsed.unlockedUntil || parsed;
        setIsLocked(Date.now() >= Number(until));
      } catch {
        setIsLocked(Date.now() >= Number(raw));
      }
    };
    checkUnlock();
    window.addEventListener('storage', checkUnlock);
    window.addEventListener('signum:unlock', checkUnlock as EventListener);
    return () => {
      window.removeEventListener('storage', checkUnlock);
      window.removeEventListener('signum:unlock', checkUnlock as EventListener);
    };
  }, []);

  // Fetch Ticker Option Flow Data
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    initialLoadRef.current = true;

    async function fetchFlow() {
      if (initialLoadRef.current) {
        setLoading(true);
        setTickerData(null);
      }
      try {
        const optionalFetch = async (url: string, timeoutMs = 4500) => {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), timeoutMs);
          try {
            return await fetch(url, { signal: controller.signal, cache: 'no-store' });
          } catch {
            return null;
          } finally {
            window.clearTimeout(timer);
          }
        };

        const res = await fetch(`/api/live/ticker?t=${ticker.toUpperCase()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (cancelled) return;

        setTickerData(data);
        if (data.display?.price) setPrice(data.display.price);
        if (data.display?.changePctPct) setChange(data.display.changePctPct);

        const flow = data.flow;
        if (flow) {
          if (flow.oiPcr != null) {
            // pcRatio is set later from rawChain volume calculation (line ~1076)
            // Do NOT set pcRatio here to avoid flicker (oiPcr vs volume-based race condition)
            const calcOpi = Math.max(10, Math.min(95, Math.round(100 - flow.oiPcr * 50)));
            setOpi(calcOpi);
          }
          if (flow.netPremium != null) {
            setTotalPrem(Math.abs(flow.netPremium));
            // callPct will be set from rawChain real volumes below
          }
          if (flow.maxPain != null) setMaxPainVal(flow.maxPain);
          if (data.volatilityRegime?.regime) setVolRegime(data.volatilityRegime.regime);
          if (flow.rawChain && flow.rawChain.length > 0) {
            setRawChain(flow.rawChain);
          } else {
            setRawChain([]);
          }
        }

        setLoading(false);
        initialLoadRef.current = false;

        const [dpRes, ivRes, whaleRes] = await Promise.all([
          optionalFetch(`/api/flow/dark-pool-trades?ticker=${ticker.toUpperCase()}&limit=20`),
          optionalFetch(`/api/flow/iv-percentile?ticker=${ticker.toUpperCase()}`),
          optionalFetch(`/api/live/options/trades?t=${ticker.toUpperCase()}`, 3500)
        ]);

        let dpItems: any[] | null = null;
        let dpMetaNext: any = null;
        if (dpRes && dpRes.ok) {
          const dpData = await dpRes.json();
          dpMetaNext = dpData;
          if (dpData && Array.isArray(dpData.items) && dpData.items.length > 0) {
            dpItems = dpData.items;
          }
        }

        let whaleItems: any[] = [];
        let whaleMetaNext: any = null;
        if (whaleRes && whaleRes.ok) {
          const whaleData = await whaleRes.json();
          whaleMetaNext = whaleData;
          if (whaleData && Array.isArray(whaleData.items)) {
            whaleItems = whaleData.items;
          }
        }

        let ivRankFromPercentile: number | null = null;
        if (ivRes && ivRes.ok) {
          const ivData = await ivRes.json();
          const rawIvRank = ivData?.percentile ?? ivData?.ivRank ?? ivData?.ivPercentile ?? null;
          if (rawIvRank != null && Number.isFinite(Number(rawIvRank))) {
            ivRankFromPercentile = Math.round(Number(rawIvRank));
          }
        }

        if (cancelled) return;

        // Only commit real trades; if this round returned nothing, keep the last
        // real values (behind the gate) instead of clearing or showing demo.
        if (dpItems && dpItems.length > 0) { lastGoodDarkPool = dpItems; setDarkPoolTrades(dpItems); }
        setDarkPoolMeta(dpMetaNext);
        setWhaleTradesFeed(whaleItems);
        setWhaleMeta(whaleMetaNext);
        setTickerData(data);
        setIvRankOverride(ivRankFromPercentile);
        if (data.display?.price) setPrice(data.display.price);
        if (data.display?.changePctPct) setChange(data.display.changePctPct);

        const flowAfterOptional = data.flow;
        if (flowAfterOptional) {
          if (flowAfterOptional.oiPcr != null) {
            // pcRatio is set from rawChain volume calculation below
            // Do NOT set pcRatio here to avoid flicker
            const calcOpi = Math.max(10, Math.min(95, Math.round(100 - flowAfterOptional.oiPcr * 50)));
            setOpi(calcOpi);
          }
          if (flowAfterOptional.netPremium != null) {
            setTotalPrem(Math.abs(flowAfterOptional.netPremium));
            // callPct will be set from rawChain real volumes below
          }
          if (flowAfterOptional.maxPain != null) setMaxPainVal(flowAfterOptional.maxPain);
          if (data.volatilityRegime?.regime) setVolRegime(data.volatilityRegime.regime);

          // Convert raw chain data to transactions
          if (flowAfterOptional.rawChain && flowAfterOptional.rawChain.length > 0) {
            setRawChain(flowAfterOptional.rawChain);
            // Calculate P/C Ratio Volume (weekly expiry) and OI (monthly/all expiry)
            const chainData = flowAfterOptional.rawChain;
            const allExpiries = Array.from(new Set(chainData.map((c: any) => c.details?.expiration_date).filter(Boolean))).sort() as string[];
            const weeklyExpiry = allExpiries[0] || '';
            
            // Volume P/C: nearest weekly expiry only
            let cVol = 0, pVol = 0;
            chainData.forEach((c: any) => {
              if (weeklyExpiry && c.details?.expiration_date !== weeklyExpiry) return;
              const vol = c.day?.volume || 0;
              const type = c.details?.contract_type;
              if (type === 'call') cVol += vol;
              else if (type === 'put') pVol += vol;
            });
            if (pVol > 0) setPcRatio(Math.round(cVol / pVol * 100) / 100);
            setPcCallVol(cVol);
            setPcPutVol(pVol);
            // Real call % from actual volumes
            if (cVol + pVol > 0) setCallPct(Math.round(cVol / (cVol + pVol) * 1000) / 10);
            
            // OI P/C: all available expiries (monthly scope)
            let cOI = 0, pOI = 0;
            chainData.forEach((c: any) => {
              const oi = c.open_interest || 0;
              const type = c.details?.contract_type;
              if (type === 'call') cOI += oi;
              else if (type === 'put') pOI += oi;
            });
            setPcRatioOI(pOI > 0 ? Math.round(cOI / pOI * 100) / 100 : 0);
            setPcCallOI(cOI);
            setPcPutOI(pOI);
            const txs = flowAfterOptional.rawChain.slice(0, 8).map((c: any, i: number) => {
              const timeStr = c.time || new Date(Date.now() - i * 120000).toTimeString().split(' ')[0];
              return {
                time: timeStr,
                strike: c.details?.strike_price || c.strike || 0,
                type: c.details?.contract_type?.toUpperCase() || c.type || (i % 2 === 0 ? 'CALL' : 'PUT'),
                expiry: c.details?.expiration_date ? c.details.expiration_date.split('-').slice(1).join('/') : '',
                size: c.day?.volume || c.size || 100 * (i + 1),
                px: c.last_quote?.midpoint || c.price || 1.5,
                premium: (c.day?.volume && c.last_quote?.midpoint) ? c.day.volume * c.last_quote.midpoint * 100 : (c.premium || (c.size || 100) * (c.price || 1.5) * 100),
                dir: c.side || (i % 3 === 0 ? 'ASK' : i % 3 === 1 ? 'BID' : 'MID'),
              };
            });
            // txs computed but no longer stored in state (orphan removed)
          } else {
            setRawChain([]);
          }
        }
      } catch {
        // Transient fetch error: keep the last real values (the gated preview
        // stays populated with real data) rather than clearing or showing demo.
      } finally {
        if (!cancelled) {
          setLoading(false);
          initialLoadRef.current = false;
        }
      }
    }

    fetchFlow();
    const interval = setInterval(() => { if (!cancelled) fetchFlow(); }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [ticker]);

  // Demo Sweeps & UOA for fallback
  // Compute real Whale Sweeps
  const whaleSweeps = useMemo(() => {
    const apiList = whaleTradesFeed.map((tx: any, i: number) => {
      const type = (tx.type || tx.optionType || 'CALL').toUpperCase();
      const expiry = tx.expiry
        ? String(tx.expiry).includes('-')
          ? String(tx.expiry).split('-').slice(1).join('/')
          : String(tx.expiry)
        : '';
      return {
        id: tx.id || `whale-${i}`,
        time: tx.timeET || tx.time || new Date(Date.now() - i * 120000).toTimeString().split(' ')[0],
        tradeDate: tx.tradeDate || null,
        strike: Number(tx.strike || 0),
        type: type as 'CALL' | 'PUT',
        expiry,
        size: Number(tx.size || 0),
        px: Number(tx.price || tx.px || 0),
        premium: Number(tx.premium || 0),
        dir: tx.side || (type === 'CALL' ? 'ASK' : 'BID'),
        contractTicker: tx.ticker || ''
      };
    });

    const baseList = apiList.length > 0
      ? apiList
      : (!rawChain || rawChain.length === 0)
      ? []
      : rawChain.map((c: any, i: number) => {
          const strike = c.details?.strike_price || 0;
          const type = (c.details?.contract_type || 'call').toUpperCase();
          const expiry = c.details?.expiration_date ? c.details.expiration_date.split('-').slice(1).join('/') : '';
          const volume = c.day?.volume || 0;
          const px = c.last_quote?.midpoint || c.day?.close || 0;
          const premium = volume * px * 100;
          const delta = c.greeks?.delta || 0;
          const dir = type === 'CALL' ? (delta > 0.6 ? 'ASK' : 'BID') : (delta < -0.6 ? 'ASK' : 'BID');
          const timeStr = c.time || new Date(Date.now() - i * 120000).toTimeString().split(' ')[0];

          return {
            time: timeStr,
            strike,
            type: type as 'CALL' | 'PUT',
            expiry,
            size: volume,
            px,
            premium,
            dir
          };
        });

    const filtered = baseList.filter(tx => tx.premium >= WHALE_PREMIUM_FLOOR);
    return filtered.sort((a, b) => b.premium - a.premium);
  }, [rawChain, whaleTradesFeed]);

  const filteredDarkPoolTrades = useMemo(() => {
    return darkPoolTrades.filter((tx: any) => tx.isBlock !== false && tx.premium >= 200000);
  }, [darkPoolTrades]);

  const whaleSummary = useMemo(() => {
    const count = whaleSweeps.length;
    const total = whaleSweeps.reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const callSum = whaleSweeps.filter((tx: any) => tx.type === 'CALL').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const putSum = whaleSweeps.filter((tx: any) => tx.type === 'PUT').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    return { count, total, callSum, putSum };
  }, [whaleSweeps]);

  const dpSummary = useMemo(() => {
    const count = filteredDarkPoolTrades.length;
    const total = filteredDarkPoolTrades.reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const buySum = filteredDarkPoolTrades.filter((tx: any) => tx.side === 'BUY').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const sellSum = filteredDarkPoolTrades.filter((tx: any) => tx.side === 'SELL').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    return { count, total, buySum, sellSum };
  }, [filteredDarkPoolTrades]);

  const whaleCopy = useMemo(() => WHALE_DP_COPY[locale as keyof typeof WHALE_DP_COPY] || WHALE_DP_COPY.en, [locale]);
  const institutionalTotalLabel = locale === 'ko'
    ? '당일 추적 명목총액'
    : locale === 'ja'
    ? '本日追跡名目総額'
    : 'Tracked notional today';
  const totalCompositionLabel = locale === 'ko'
    ? '총량 구성'
    : locale === 'ja'
    ? '総額構成'
    : 'Total mix';
  const dpDayValue = Number(darkPoolMeta?.totalDarkPoolValue ?? dpSummary.total ?? 0);
  const dpDayCount = Number(tickerData?.flow?.blockTrades ?? darkPoolMeta?.tradeCount ?? filteredDarkPoolTrades.length);
  const dpDayPct = Number(pctNumber(dpPct) || darkPoolMeta?.darkPoolPercent || 0);
  const dpNetBuyValue = Number(tickerData?.flow?.darkPoolNetBuyVal ?? (dpSummary.buySum - dpSummary.sellSum));
  const whaleDayTotal = Number(whaleSummary.total || 0);
  const whaleDayCount = Number(whaleMeta?.count ?? whaleSummary.count ?? 0);
  const institutionalTotal = whaleDayTotal + dpDayValue;
  const whaleCallShare = whaleDayTotal > 0 ? (whaleSummary.callSum / whaleDayTotal) * 100 : callPct;
  const largestWhalePrint = whaleSweeps[0]?.premium || 0;
  const largestDpPrint = Math.max(0, ...filteredDarkPoolTrades.map((tx: any) => Number(tx.premium || 0)));
  const largestInstitutionalPrint = Math.max(largestWhalePrint, largestDpPrint);
  const shortPressureNum = pctNumber(shortPct);
  const whaleBiasScore = Math.max(-100, Math.min(100, Math.round((whaleCallShare - 50) * 2)));
  const dpBiasScore = institutionalTotal > 0 ? Math.max(-100, Math.min(100, Math.round((dpNetBuyValue / Math.max(dpDayValue, 1)) * 100))) : 0;
  const pressureScore = Math.max(-100, Math.min(100, Math.round((whaleBiasScore * 0.5) + (dpBiasScore * 0.3) - ((shortPressureNum - 45) * 0.8))));
  const psychologyLabel = pressureScore >= 20
    ? whaleCopy.chase
    : pressureScore <= -20
    ? whaleCopy.hedge
    : whaleCopy.mixed;
  const psychologyAccent = pressureScore >= 20 ? '#10b981' : pressureScore <= -20 ? '#f43f5e' : '#f59e0b';
  const rawBlockCount = Number(dpDayCount || blockCount || 0);
  const formattedBlockCount = rawBlockCount.toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'ko' ? 'ko-KR' : 'en-US');
  const convictionPct = Math.max(35, Math.min(92, Math.round(
    45
    + Math.abs(pressureScore) * 0.35
    + Math.min(whaleDayCount, 25) * 0.4
    + Math.min(dpDayPct, 60) * 0.12
  )));
  const blockIntensityPct = Math.max(5, Math.min(100, Math.round((rawBlockCount / 10000) * 100)));
  const isSessionClosed = effectiveSession === 'CLOSED';
  const isFlowStale = Boolean(darkPoolMeta?._stale);
  const isFlowCached = Boolean(darkPoolMeta?._cached || whaleMeta?._cached);
  const flowFreshness = isSessionClosed
    ? whaleCopy.closedData
    : isFlowStale
    ? whaleCopy.delayedData
    : isFlowCached
    ? whaleCopy.recentData
    : whaleCopy.liveData;
  const flowPreviewStats = [
    { label: whaleCopy.largestPrint, value: formatCompactMoney(largestInstitutionalPrint), color: largestInstitutionalPrint >= 1000000 ? '#f59e0b' : '#38bdf8' },
    { label: whaleCopy.netBias, value: `${dpNetBuyValue >= 0 ? '+' : '-'}${formatCompactMoney(Math.abs(dpNetBuyValue))}`, color: dpNetBuyValue >= 0 ? '#10b981' : '#f43f5e' },
    { label: whaleCopy.sourceFresh, value: flowFreshness, color: flowFreshness === whaleCopy.liveData ? '#22d3ee' : isSessionClosed ? '#94a3b8' : '#f59e0b' },
  ];

  // Compute real UOA
  const uoaList = useMemo(() => {
    if (!rawChain || rawChain.length === 0) return [];
    const uoas = rawChain.map((c: any) => {
      const strike = c.details?.strike_price || 0;
      const type = (c.details?.contract_type || 'call').toUpperCase();
      const expiry = c.details?.expiration_date ? c.details.expiration_date.split('-').slice(1).join('/') : '';
      const volume = c.day?.volume || 0;
      const oi = c.open_interest || c.day?.open_interest || 1;
      const ratio = volume / oi;

      return {
        strike,
        type,
        expiry,
        volume,
        oi,
        ratio
      };
    }).filter(item => item.ratio >= 2.0 && item.volume > 500);

    return uoas.length > 0 ? uoas.sort((a, b) => b.ratio - a.ratio) : [];
  }, [rawChain]);

  // Handle Search submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setTicker(searchInput.toUpperCase().trim());
      setIsSearchOpen(false);
    }
  };

  // Handle manual unlock (Simulated for now, AdMob callback in Phase 2)
  const handleUnlock = () => {
    const state = { unlockedUntil: Date.now() + 60 * 60 * 1000, tier: 'premium' };
    localStorage.setItem('signum_ad_unlock', JSON.stringify(state));
    window.dispatchEvent(new Event('signum:unlock'));
    setIsLocked(false);
  };

  // Gauge calculations
  const gaugeColor = opi >= 60 ? 'var(--green)' : opi >= 40 ? 'var(--amber)' : 'var(--red)';
  const gaugeStatus = opi >= 60 ? 'BULLISH' : opi >= 40 ? 'NEUTRAL' : 'BEARISH';
  const rotationAngle = -90 + (opi / 100) * 180; // maps 0-100 to -90 to +90 degrees

  // ── Task 5: Derived dynamic values for Overview & AI Intel tabs ──
  const rawIvRankVal = ivRankOverride
    ?? tickerData?.flow?.ivRank
    ?? tickerData?.rawTickerData?.flow?.ivRank
    ?? tickerData?.unified?.volatility?.ivRank
    ?? tickerData?.volatility?.ivRank
    ?? null;
  const ivRankVal = rawIvRankVal != null && Number.isFinite(Number(rawIvRankVal))
    ? Math.round(Number(rawIvRankVal))
    : null;
  const ivSkewVal = tickerData?.flow?.ivSkew ?? null;
  const putFloorValApi = tickerData?.flow?.putFloor ?? null;
  const callWallValApi = tickerData?.flow?.callWall ?? null;
  const atmIvVal = tickerData?.flow?.atmIv ?? tickerData?.unified?.volatility?.atmIv ?? null;

  // ── [MATCH WEB] rawChain-based Call Wall / Put Floor (same as FlowRadar.tsx L1275-1288) ──
  // Web uses rawChain VOLUME with 0-7 DTE multi-expiry to find max call/put volume strikes
  const { callWallDerived, putFloorDerived } = useMemo(() => {
    if (!rawChain || rawChain.length === 0) return { callWallDerived: 0, putFloorDerived: 0 };
    // 0-7 DTE filter (same as web FlowRadar VOLUME mode)
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const today = new Date(etNow.getFullYear(), etNow.getMonth(), etNow.getDate());
    const maxDTE = 7;
    const filtered = rawChain.filter((opt: any) => {
      const expiryStr = opt.details?.expiration_date;
      if (!expiryStr) return false;
      const parts = expiryStr.split('-');
      if (parts.length !== 3) return false;
      const expiryDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const dte = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return dte >= 0 && dte <= maxDTE;
    });
    const source = filtered.length > 0 ? filtered : rawChain;
    // Aggregate volume per strike
    const map: Record<number, { callVol: number; putVol: number }> = {};
    source.forEach((opt: any) => {
      const strike = opt.details?.strike_price;
      if (typeof strike !== 'number') return;
      const vol = opt.day?.volume || 0;
      const type = opt.details?.contract_type;
      if (!map[strike]) map[strike] = { callVol: 0, putVol: 0 };
      if (type === 'call') map[strike].callVol += vol;
      else if (type === 'put') map[strike].putVol += vol;
    });
    let maxCall = -1, maxPut = -1, cStrike = 0, pStrike = 0;
    Object.entries(map).forEach(([s, d]) => {
      const strike = Number(s);
      if (d.callVol > maxCall) { maxCall = d.callVol; cStrike = strike; }
      if (d.putVol > maxPut) { maxPut = d.putVol; pStrike = strike; }
    });
    return { callWallDerived: cStrike, putFloorDerived: pStrike };
  }, [rawChain]);

  // Use rawChain-derived values (web standard), fall back to API if rawChain empty
  const putFloorVal = putFloorDerived > 0 ? putFloorDerived : putFloorValApi;
  const callWallVal = callWallDerived > 0 ? callWallDerived : callWallValApi;
  const impliedMoveRaw = tickerData?.flow?.impliedMove ?? (atmIvVal != null ? (atmIvVal / Math.sqrt(252) * 100) : null);
  const impliedMoveStr = impliedMoveRaw != null ? `±${impliedMoveRaw.toFixed(1)}%` : '—';

  // Nearest expiry from rawChain
  const nearestExpiry = useMemo(() => {
    if (!rawChain || rawChain.length === 0) return null;
    const expiries = rawChain.map((c: any) => c?.expiry || c?.expirationDate).filter(Boolean);
    if (expiries.length === 0) return null;
    const sorted = [...expiries].sort();
    return sorted[0];
  }, [rawChain]);
  const nearestExpiryLabel = nearestExpiry
    ? `${nearestExpiry.slice(5, 7)}/${nearestExpiry.slice(8, 10)} ${t.expiry}`
    : '';

  // Regime label (Options Market Regime)
  const regimeLabel = ivRankVal == null ? '—' : ivRankVal < 30 ? t.lowVol : ivRankVal < 70 ? t.neutral : t.highVol;
  const regimeBadgeClass = ivRankVal == null ? s.badgeAmber : ivRankVal < 30 ? s.badgeGreen : ivRankVal < 70 ? s.badgeAmber : `${s.headerBadge}`;

  // AI Verdict derived values
  const aiIvRank = ivRankVal ?? null;
  const whaleNetBetRaw = tickerData?.flow?.darkPoolNetBuyVal ?? null;
  const whaleNetBetStr = whaleNetBetRaw != null
    ? (Math.abs(whaleNetBetRaw) >= 1000000
      ? `${whaleNetBetRaw >= 0 ? '+' : '-'}$${(Math.abs(whaleNetBetRaw) / 1000000).toFixed(1)}M`
      : `${whaleNetBetRaw >= 0 ? '+' : '-'}$${(Math.abs(whaleNetBetRaw) / 1000).toFixed(0)}K`)
    : '—';

  // ── 9-Factor Option Sentiment Scoring Logic ──
  const netWhalePremium = useMemo(() => {
    return whaleNetBetRaw ?? (totalPrem * (callPct / 100 - 0.5) * 2);
  }, [whaleNetBetRaw, totalPrem, callPct]);

  const opiScore = useMemo(() => {
    const opiVal = (opi - 50) * 2; // maps 0~100 to -100~+100
    return opiVal * 0.25;
  }, [opi]);

  const whaleScore = useMemo(() => {
    if (netWhalePremium > 500000) return 25;
    if (netWhalePremium > 100000) return 15;
    if (netWhalePremium < -500000) return -25;
    if (netWhalePremium < -100000) return -15;
    return 0;
  }, [netWhalePremium]);

  const squeezeProb = useMemo(() => {
    return Math.round((parseFloat(shortPct) || 45.2) * 0.5 + (ivRankVal ?? 50) * 0.5);
  }, [shortPct, ivRankVal]);

  const squeezeScore = useMemo(() => {
    let score = 0;
    if (squeezeProb >= 70) score = 15;
    else if (squeezeProb >= 45) score = 8;
    return (opi - 50) > 0 ? score : -score;
  }, [squeezeProb, opi]);

  const skewScore = useMemo(() => {
    const val = ivSkewVal ?? 0;
    return Math.max(-15, Math.min(15, -val * 1.5));
  }, [ivSkewVal]);

  const smartScore = useMemo(() => {
    const smartMoneyScore = Math.max(10, Math.min(95, (blockCount / 3)));
    let score = 0;
    if (smartMoneyScore >= 60) score = 10;
    else if (smartMoneyScore >= 40) score = 5;
    else if (smartMoneyScore < 20) score = -5;
    return netWhalePremium >= 0 ? score : -score;
  }, [blockCount, netWhalePremium]);

  const dexScore = useMemo(() => {
    const gammaFlipNum = typeof liveGammaFlip === 'number'
      ? liveGammaFlip
      : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
    const dist = gammaFlipNum > 0 ? ((displayPrice - gammaFlipNum) / gammaFlipNum) * 100 : 0;
    if (dist > 5) return -10;
    if (dist > 2) return -5;
    if (dist < -5) return 10;
    if (dist < -2) return 5;
    return 0;
  }, [liveGammaFlip, displayPrice]);

  const uoaScore = useMemo(() => {
    const uoaCount = uoaList.length;
    let score = 0;
    if (uoaCount >= 4) score = 5;
    else if (uoaCount >= 2) score = 3;
    return (opi - 50) < 0 ? -score : score;
  }, [uoaList, opi]);

  const pcScore = useMemo(() => {
    if (pcRatio >= 2.0) return -5;
    if (pcRatio >= 1.3) return -3;
    if (pcRatio <= 0.5) return 5;
    if (pcRatio <= 0.75) return 3;
    return 0;
  }, [pcRatio]);

  const zdteScore = useMemo(() => {
    const pinStrength = volRegime === 'STABLE' ? 75 : volRegime === 'LOADED' ? 45 : 15;
    let score = 0;
    if (pinStrength >= 60) score = 5;
    else if (pinStrength >= 35) score = 3;
    return (opi - 50) < 0 ? -score : score;
  }, [volRegime, opi]);

  const compositeScore = useMemo(() => {
    const flowBonus = Math.abs(netWhalePremium) > 1000000 ? (netWhalePremium > 0 ? 5 : -5) : 0;
    const score = opiScore + whaleScore + squeezeScore + skewScore + smartScore + dexScore + uoaScore + pcScore + zdteScore + flowBonus;
    return Math.max(-100, Math.min(100, Math.round(score)));
  }, [opiScore, whaleScore, squeezeScore, skewScore, smartScore, dexScore, uoaScore, pcScore, zdteScore, netWhalePremium]);

  const gammaFlipNumForOverview = typeof liveGammaFlip === 'number'
    ? liveGammaFlip
    : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
  const overviewDirection = compositeScore >= 20 ? 'bullish' : compositeScore <= -20 ? 'bearish' : 'neutral';
  const overviewSignal = flowCopy.signals[overviewDirection];
  const overviewAccent = overviewDirection === 'bullish'
    ? '#10b981'
    : overviewDirection === 'bearish'
    ? '#f43f5e'
    : '#f59e0b';
  const premiumBiasLabel = callPct >= 55
    ? flowCopy.callDominant
    : callPct <= 45
    ? flowCopy.putDominant
    : flowCopy.balanced;
  const gammaPositionLabel = gammaFlipNumForOverview > 0 && displayPrice >= gammaFlipNumForOverview
    ? flowCopy.aboveGamma
    : flowCopy.belowGamma;
  const riskStateLabel = volRegime === 'ERUPTING'
    ? flowCopy.erupting
    : volRegime === 'LOADED'
    ? flowCopy.loaded
    : flowCopy.stable;
  const convictionLabel = Math.abs(compositeScore) >= 45 || opi >= 68 || opi <= 35
    ? flowCopy.highConviction
    : Math.abs(compositeScore) >= 20 || squeezeProb >= 55
    ? flowCopy.mediumConviction
    : flowCopy.lowConviction;
  const netPremiumOverview = tickerData?.flow?.netPremium
    ?? (callPct >= 50 ? totalPrem * (callPct - 50) / 50 : -totalPrem * (50 - callPct) / 50);
  const netPremiumText = `${netPremiumOverview >= 0 ? '+' : '-'}$${Math.abs(netPremiumOverview) >= 1000000
    ? `${(Math.abs(netPremiumOverview) / 1000000).toFixed(1)}M`
    : `${(Math.abs(netPremiumOverview) / 1000).toFixed(0)}K`
  }`;
  const gammaDistancePct = gammaFlipNumForOverview > 0
    ? ((displayPrice - gammaFlipNumForOverview) / gammaFlipNumForOverview) * 100
    : 0;
  const gammaDistanceText = gammaFlipNumForOverview > 0
    ? `${gammaDistancePct >= 0 ? '+' : ''}${gammaDistancePct.toFixed(1)}%`
    : '--';
  const opiFactorRails = [
    {
      label: flowCopy.factorPcr,
      value: pcRatio.toFixed(2),
      color: pcRatio <= 0.75 ? '#10b981' : pcRatio >= 1.25 ? '#f43f5e' : '#f59e0b',
      width: Math.max(12, Math.min(100, Math.abs(1 - pcRatio) * 80 + 28))
    },
    {
      label: flowCopy.factorPremium,
      value: `${callPct.toFixed(0)}% Call`,
      color: callPct >= 55 ? '#10b981' : callPct <= 45 ? '#f43f5e' : '#f59e0b',
      width: Math.max(12, Math.min(100, Math.abs(callPct - 50) * 2 + 28))
    },
    {
      label: flowCopy.factorGamma,
      value: gammaDistanceText,
      color: gammaDistancePct >= 0 ? '#10b981' : '#f43f5e',
      width: Math.max(12, Math.min(100, Math.abs(gammaDistancePct) * 16 + 24))
    }
  ];
  const regimeInsightText = flowCopy.regimeInsight
    .replace('{ivRank}', `${ivRankVal ?? '--'}`)
    .replace('{pcRatio}', pcRatio.toFixed(2))
    .replace('{bias}', premiumBiasLabel);

  const aiVerdictLabel = overviewSignal.title;
  const aiVerdictBadgeStyle = overviewDirection === 'bullish'
    ? { background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)', border: '1px solid rgba(16, 185, 129, 0.25)' }
    : overviewDirection === 'neutral'
    ? { background: 'rgba(245, 158, 11, 0.12)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.25)' }
    : { background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.25)' };
  const aiOpiColor = opi >= 65 ? 'var(--green)' : opi >= 40 ? 'var(--amber)' : 'var(--red)';

  // Info popover helper components
  // Render FUNCTION (not a component) on purpose: a component defined inside
  // render gets a new identity every render, so React unmounts/remounts its
  // <button> — on the constantly-updating Flow page that replaced the node
  // mid-tap and iOS WKWebView dropped the click. Inlining the element instead
  // lets React reconcile (reuse) the same DOM node, so taps always land.
  const renderInfoBtn = (popKey: string) => (
    <button
      className="info-btn"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setActivePopover(activePopover === popKey ? null : popKey);
      }}
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        flex: '0 0 auto',
        padding: 0,
        marginLeft: '6px',
        color: activePopover === popKey ? '#06121a' : 'var(--cyan)',
        background: activePopover === popKey ? 'var(--cyan)' : 'var(--cyan-dim)',
        border: '1px solid var(--cyan)',
        boxShadow: 'var(--glow-cyan)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 800,
        fontStyle: 'italic',
        lineHeight: 1,
        outline: 'none',
        transition: 'all 0.2s ease',
        verticalAlign: 'middle'
      }}
    >
      i
    </button>
  );

  const renderPopover = (popKey: string, text: string, title: string) => {
    if (activePopover !== popKey) return null;
    return (
      <div 
        className="popover-container animate-in fade-in zoom-in-95 duration-150"
        style={{
          position: 'absolute',
          top: '42px',
          left: '14px',
          right: '14px',
          background: 'linear-gradient(135deg, rgba(8, 20, 38, 0.88), rgba(13, 30, 52, 0.72))',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '12px',
          padding: '11px 12px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 34px -12px rgba(0, 0, 0, 0.72), 0 8px 18px -12px rgba(6, 182, 212, 0.55)',
          zIndex: 100,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {title}
          </span>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); setActivePopover(null); }}
            aria-label="Close info"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', fontSize: 0, lineHeight: 0, backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(148,163,184,0.95) 46%, rgba(148,163,184,0.95) 54%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(148,163,184,0.95) 46%, rgba(148,163,184,0.95) 54%, transparent 55%)' }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: '11px', lineHeight: '1.45', color: '#b4c6ef', fontWeight: 600, textAlign: 'left' }}>
          {text}
        </div>
      </div>
    );
  };

  const renderWhaleCard = (tx: any, idx: number) => {
    const isCall = tx.type === 'CALL';
    const dirColor = tx.dir === 'ASK' ? '#10b981' : tx.dir === 'BID' ? '#ef4444' : '#f59e0b';
    const impactLabel = tx.premium > 500000 ? whaleCopy.impactHigh : tx.premium > 100000 ? whaleCopy.impactMid : whaleCopy.impactLow;
    const impactColor = tx.premium > 500000 ? '#ef4444' : tx.premium > 100000 ? '#f59e0b' : 'var(--cyan)';
    const cost = tx.size > 0 ? tx.premium / (tx.size * 100) : tx.px || 0;
    const bep = isCall ? Number(tx.strike || 0) + cost : Number(tx.strike || 0) - cost;

    return (
      <div
        key={tx.id || idx}
        style={{
          flex: '0 0 78%',
          scrollSnapAlign: 'start',
          background: isCall
            ? 'linear-gradient(145deg, rgba(8, 47, 73, 0.52), rgba(15, 23, 42, 0.78))'
            : 'linear-gradient(145deg, rgba(76, 5, 25, 0.42), rgba(15, 23, 42, 0.78))',
          border: `1px solid ${isCall ? 'rgba(16,185,129,0.34)' : 'rgba(244,63,94,0.3)'}`,
          borderRadius: '14px',
          padding: '12px 14px',
          position: 'relative',
          boxShadow: isCall
            ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 26px rgba(16,185,129,0.05)'
            : 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 26px rgba(244,63,94,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '152px',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 18% 0%, rgba(255,255,255,0.12), transparent 32%)' }} />
        {/* Ticker & Type */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#ffffff' }}>{ticker}</span>
            <span style={{
              fontSize: '8px',
              fontWeight: 900,
              padding: '2px 5px',
              borderRadius: '4px',
              background: isCall ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              color: isCall ? '#10b981' : '#ef4444',
              border: `1px solid ${isCall ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`
            }}>
              {isCall ? 'CALL' : 'PUT'} | {tx.expiry}
            </span>
          </div>
          <span style={{ fontSize: '8px', fontWeight: 900, color: impactColor, background: 'rgba(255,255,255,0.04)', padding: '3px 6px', borderRadius: '999px', border: `1px solid ${impactColor}33`, whiteSpace: 'nowrap' }}>
            IMPACT {impactLabel}
          </span>
        </div>

        {/* Premium & Strike */}
        <div style={{ position: 'relative', margin: '10px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {whaleCopy.premium}
            </span>
            <span className="tnum" style={{ fontSize: '17px', fontWeight: 900, color: dirColor }}>
              ${(tx.premium / 1000).toFixed(1)}K
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {whaleCopy.strike}
            </span>
            <span className="tnum" style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
              ${tx.strike}
            </span>
          </div>
        </div>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginBottom: '8px' }}>
          <div style={{ padding: '7px 8px', borderRadius: '9px', background: 'rgba(2, 6, 23, 0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ display: 'block', fontSize: '8px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{whaleCopy.cost}</span>
            <span className="tnum" style={{ fontSize: '12px', fontWeight: 900, color: '#e2e8f0' }}>${cost.toFixed(2)}</span>
          </div>
          <div style={{ padding: '7px 8px', borderRadius: '9px', background: 'rgba(2, 6, 23, 0.25)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: '8px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{whaleCopy.bep}</span>
            <span className="tnum" style={{ fontSize: '12px', fontWeight: 900, color: bep >= displayPrice ? '#10b981' : '#f43f5e' }}>${bep.toFixed(2)}</span>
          </div>
        </div>

        {/* Time & Side */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '7px' }}>
          <span>{tx.time}</span>
          <span style={{ fontWeight: 800, color: '#ffffff' }}>
            {tx.dir}
          </span>
        </div>
      </div>
    );
  };

  const renderDarkPoolCard = (tx: any, idx: number) => {
    const isBuy = tx.side === 'BUY';
    const isSell = tx.side === 'SELL';
    const sideColor = isBuy ? '#10b981' : isSell ? '#ef4444' : 'var(--text-muted)';
    const sideText = isBuy ? 'BLOCK - BUY' : isSell ? 'BLOCK - SELL' : 'NEUTRAL';

    return (
      <div
        key={idx}
        style={{
          flex: '0 0 78%',
          scrollSnapAlign: 'start',
          background: isBuy
            ? 'linear-gradient(145deg, rgba(6, 78, 59, 0.42), rgba(15, 23, 42, 0.78))'
            : isSell
            ? 'linear-gradient(145deg, rgba(76, 5, 25, 0.4), rgba(15, 23, 42, 0.78))'
            : 'linear-gradient(145deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.78))',
          border: `1px solid ${isBuy ? 'rgba(16,185,129,0.34)' : isSell ? 'rgba(244,63,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '14px',
          padding: '12px 14px',
          position: 'relative',
          boxShadow: isBuy
            ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 26px rgba(16,185,129,0.05)'
            : isSell
            ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 26px rgba(244,63,94,0.05)'
            : 'inset 0 1px 0 rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '138px',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 18% 0%, rgba(255,255,255,0.12), transparent 32%)' }} />
        {/* Ticker & Side */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#ffffff' }}>{ticker}</span>
            <span style={{
              fontSize: '8px',
              fontWeight: 900,
              padding: '2px 5px',
              borderRadius: '4px',
              background: isBuy ? 'rgba(16,185,129,0.08)' : isSell ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
              color: sideColor,
              border: `1px solid ${isBuy ? 'rgba(16,185,129,0.15)' : isSell ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)'}`
            }}>
              {sideText}
            </span>
          </div>
          <span style={{ fontSize: '8px', fontWeight: 800, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '2px 5px', borderRadius: '4px' }}>
            {tx.exchangeName}
          </span>
        </div>

        {/* Value & Price */}
        <div style={{ position: 'relative', margin: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {whaleCopy.value}
            </span>
            <span className="tnum" style={{ fontSize: '17px', fontWeight: 900, color: 'var(--cyan)' }}>
              ${(tx.premium / 1000).toFixed(0)}K
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {whaleCopy.price}
            </span>
            <span className="tnum" style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
              ${tx.price.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Size & Time */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '7px' }}>
          <span>{tx.timeET}</span>
          <span style={{ fontWeight: 800, color: '#ffffff' }}>
            {(tx.size / 1000).toFixed(1)}K {whaleCopy.shares}
          </span>
        </div>
      </div>
    );
  };

  const BRAND_COLORS: Record<string, { color: string, glow: string }> = {
    NVDA: { color: '#76b900', glow: 'rgba(118, 185, 0, 0.4)' },
    TSLA: { color: '#cc0000', glow: 'rgba(204, 0, 0, 0.4)' },
    AAPL: { color: '#a2aaad', glow: 'rgba(162, 170, 173, 0.4)' },
    SPY: { color: '#0ea5e9', glow: 'rgba(14, 165, 233, 0.4)' },
    QQQ: { color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.4)' }
  };

  return (
    <div className={dashStyles.page} style={{ paddingBottom: '160px' }}>
      {/* HEADER */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Heartbeat/Pulse Icon SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.5))' }}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <div className={dashStyles.headerTitle} style={{ font: 'var(--f-h2)', fontWeight: 800 }}>
            {t.title}
          </div>
        </div>
        <div className={dashStyles.headerActions} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Search Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: isSearchOpen ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.7)',
              transition: 'all 0.2s ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--cyan)';
            }}
            onMouseLeave={(e) => {
              if (!isSearchOpen) {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', font: 'var(--f-micro)', fontWeight: 800, color: '#10b981', letterSpacing: '0.05em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            LIVE
          </span>
        </div>
      </header>

      {/* SEARCH BAR (Toggleable) */}
      {isSearchOpen && (
        <form onSubmit={handleSearch} style={{ padding: '12px 16px 6px', display: 'flex', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center', position: 'relative' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              {/* Magnifying Glass Icon on Left */}
              <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none', opacity: 0.9, zIndex: 2 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={flowCopy.searchPlaceholder}
                style={{
                  width: '100%',
                  height: '44px',
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(30, 41, 59, 0.48))',
                  border: '1px solid rgba(125, 211, 252, 0.22)',
                  borderRadius: '16px',
                  padding: '0 76px 0 40px',
                  font: 'var(--f-small)',
                  fontWeight: 800,
                  color: 'var(--text)',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 14px 34px rgba(0, 0, 0, 0.34), 0 0 24px rgba(6, 182, 212, 0.08)',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                font: 'var(--f-micro)',
                fontWeight: 900,
                color: 'var(--cyan)',
                letterSpacing: '0.08em',
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                borderRadius: '999px',
                padding: '4px 8px',
                pointerEvents: 'none'
              }}>
                {flowCopy.searchCta}
              </span>
            </div>
            {/* Close Search Button */}
            <button
              type="button"
              className="close-search-btn"
              onClick={() => setIsSearchOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '44px',
                height: '44px',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(30, 41, 59, 0.5))',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                borderRadius: '14px',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.7)',
                transition: 'all 0.2s ease',
                outline: 'none',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 14px 34px rgba(0, 0, 0, 0.28)',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
              }}
            >
              {/* Close/Cross (X) Icon SVG */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '0 4px 0 6px' }}>
            <span style={{ font: 'var(--f-micro)', color: 'rgba(180, 198, 239, 0.72)', fontWeight: 700, lineHeight: 1.25 }}>
              {flowCopy.searchHint}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {[0, 1, 2].map((dot) => (
                <span key={dot} style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: dot === 1 ? 'var(--cyan)' : 'rgba(34, 211, 238, 0.35)',
                  boxShadow: dot === 1 ? '0 0 8px rgba(34, 211, 238, 0.9)' : 'none'
                }} />
              ))}
            </span>
          </div>
          </div>
        </form>
      )}

      {/* UNDERLYER TICKER TABS (M7 Ticker Logos with brand glows) */}
      <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="no-scrollbar">
        {['NVDA', 'TSLA', 'AAPL', 'SPY', 'QQQ'].map((sym) => {
          const brand = BRAND_COLORS[sym] || { color: 'var(--cyan)', glow: 'rgba(6, 182, 212, 0.3)' };
          const isActive = ticker === sym;
          return (
            <button
              key={sym}
              onClick={() => {
                setTicker(sym);
                setSearchInput(sym);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                height: '32px',
                minHeight: 0,
                padding: '0 14px',
                boxSizing: 'border-box',
                borderRadius: 'var(--r-pill)',
                border: '1px solid',
                borderColor: isActive ? brand.color : 'rgba(255,255,255,0.06)',
                background: isActive ? 'rgba(30, 41, 59, 0.55)' : 'rgba(255,255,255,0.02)',
                color: isActive ? '#ffffff' : 'var(--text-dim)',
                font: 'var(--f-micro)',
                fontWeight: 700,
                lineHeight: 1,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isActive ? `0 0 12px ${brand.glow}` : 'none',
                flexShrink: 0,
                outline: 'none'
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img
                  src={`https://assets.parqet.com/logos/symbol/${sym}?format=png`}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <span>{sym}</span>
            </button>
          );
        })}
      </div>

      {/* ── LOADING SKELETON ── */}
      {loading && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          {/* Price card skeleton */}
          <div className="app-skeleton" style={{ height: '180px', borderRadius: '12px' }} />
          {/* Tab bar skeleton */}
          <div className="app-skeleton" style={{ height: '44px', borderRadius: '10px' }} />
          {/* Content skeleton */}
          <div className="app-skeleton" style={{ height: '200px', borderRadius: '12px' }} />
          <div className="app-skeleton" style={{ height: '150px', borderRadius: '12px' }} />
        </div>
      )}

      {/* ── MAIN CONTENT (hidden during loading) ── */}
      {!loading && !tickerData && (
        <div style={{ padding: '0 16px', marginTop: '16px' }}>
          <div
            className="premium-card"
            style={{
              padding: '18px',
              borderColor: 'rgba(255, 176, 32, 0.35)',
              background: 'linear-gradient(135deg, rgba(255,176,32,0.10), rgba(9,15,28,0.92))'
            }}
          >
            <div className="app-label" style={{ color: '#ffb020', marginBottom: '8px' }}>{locale === 'ko' ? '데이터 재연결 중' : locale === 'ja' ? 'データ再接続中' : 'DATA RECONNECTING'}</div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fbff' }}>{locale === 'ko' ? '데이터를 준비하고 있습니다' : locale === 'ja' ? 'データを準備しています' : 'Flow data is warming up'}</h2>
            <p style={{ margin: '8px 0 0', color: '#aeb9c9', fontSize: '13px', lineHeight: 1.5 }}>
              {locale === 'ko' ? '실시간 데이터가 아직 응답하지 않았습니다. 페이지를 다시 열거나 잠시 후 재시도하세요.' : locale === 'ja' ? 'リアルタイムデータがまだ応答していません。ページを再度開くか、しばらくしてから再試行してください。' : 'Live ticker data did not respond yet. Reopen this page or try again in a moment.'}
            </p>
          </div>
        </div>
      )}

      {!loading && tickerData && (<>

      {/* ── PRICE CARD v2 (From cmd/page.tsx) ── */}
      {(() => {
        const sessionLabel = effectiveSession === 'REG' ? 'MARKET OPEN'
          : effectiveSession === 'PRE' ? 'PRE-MARKET'
          : effectiveSession === 'POST' ? 'AFTER HOURS'
          : 'MARKET CLOSED';

        const isOpen = effectiveSession === 'REG';
        const isPrePost = effectiveSession === 'PRE' || effectiveSession === 'POST';
        const hasExt = activeExtPrice > 0 && activeExtLabel;
        const extCardClassName = [
          s.heroExtCard,
          isPrePost ? s.extLive : s.extClosed,
          isPrePost && extFlash ? s[extFlash === 'up' ? 'extUp' : 'extDown'] : '',
        ].filter(Boolean).join(' ');

        const companyName = tickerData?.name || tickerData?.company || tickerData?.rawTickerData?.name || (ticker === 'NVDA' ? 'NVIDIA Corp' : ticker === 'TSLA' ? 'Tesla Inc' : ticker === 'AAPL' ? 'Apple Inc' : ticker === 'SPY' ? 'SPDR S&P 500 ETF' : ticker === 'QQQ' ? 'Invesco QQQ Trust' : '');

        return (
          <div
            className={`${s.p2Card} ${s.connectedP2Card} ${s.animateIn} ${s.delay1}`}
            style={{
              margin: '4px 16px 0px',
              borderBottom: 'none',
              borderBottomLeftRadius: '0px',
              borderBottomRightRadius: '0px'
            }}
          >
            {/* Background sparkline decoration */}
            <SparklineBg up={up} seed={ticker} />

            {/* ── Row 1: Identity (Logo + Ticker/Company) | Status ── */}
            <div className={s.heroIdentity}>
              <div className={s.heroLeft}>
                <div className={s.heroLogo}>
                  {ticker === 'SPCX' ? (
                    <span className={s.heroLogoFallback}>SPCX</span>
                  ) : (
                    <img
                      src={APP_LOGO(ticker)}
                      alt={ticker}
                      onError={(e) => handleLogoFallback(e, ticker)}
                    />
                  )}
                </div>
                <div className={s.heroNameGroup}>
                  <span className={s.heroTicker}>{ticker}</span>
                  <span className={s.heroCompany}>{companyName}</span>
                </div>
                <span className={`${s.p2Tick} ${flash ? s[`show-${flash}`] : ''}`}>
                  {flash === 'down' ? '▼ TICK' : '▲ TICK'}
                </span>
              </div>
              <div className={s.heroRight}>
                <div className={isOpen ? s.heroStatusOpen : isPrePost ? s.heroStatusPrePost : s.heroStatusClosed}>
                  {isOpen ? (
                    <span className={s.marketDotActive} />
                  ) : isPrePost ? (
                    <span className={s.marketDotPulse} />
                  ) : null}
                  {sessionLabel}
                </div>
                <span className={s.heroTime}>
                  {mounted ? (() => {
                    const now = new Date();
                    const etStr = now.toLocaleString('en-US', {
                      timeZone: 'America/New_York',
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
                    });
                    return `${etStr} ET`;
                  })() : ''}
                </span>
              </div>
            </div>

            {/* ── Row 2: Big Price | Extended Hours Card ── */}
            <div className={s.heroMainRow}>
              <div className={s.heroPriceBlock}>
                <span className={`${s.p2Price} ${flash ? s[`flash-${flash}`] : ''}`}>
                  ${displayPrice.toFixed(2)}
                </span>
                <span className={`${s.p2Chg} ${priceColorClass}`}>
                  {up ? '▲' : '▼'} {up ? '+' : ''}{displayChangePct.toFixed(2)}%
                </span>
              </div>
              {hasExt && (
                <div className={extCardClassName}>
                  <SparklineBg up={activeExtPct >= 0} seed={`${ticker}-ext`} />
                  <span className={s.heroExtLabel}>{activeExtLabel}</span>
                  <span className={s.heroExtPrice}>${activeExtPrice.toFixed(2)}</span>
                  <span className={s.heroExtChange} style={{ color: activeExtPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {activeExtPct >= 0 ? '+' : ''}{activeExtPct.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            {/* ── Row 3: Option Metrics — MAX PAIN / GAMMA FLIP / TOTAL PREMIUM ── */}
            {(() => {
              const mpDiff = maxPainVal > 0 ? ((displayPrice - maxPainVal) / maxPainVal) * 100 : 0;
              const gammaFlipNum = typeof liveGammaFlip === 'number'
                ? liveGammaFlip
                : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
              const gfDiff = gammaFlipNum > 0 ? ((displayPrice - gammaFlipNum) / gammaFlipNum) * 100 : 0;
              const netPremiumVal = tickerData?.flow?.netPremium ?? (callPct >= 50 ? totalPrem * (callPct - 50) / 50 : -totalPrem * (50 - callPct) / 50);

              return (
                <div className={s.heroMetrics}>
                  <div className={s.heroMetricCard}>
                    <span className={s.heroMetricLabel}>MAX PAIN</span>
                    <span className={s.heroMetricValue}>
                      ${maxPainVal > 0 ? maxPainVal.toFixed(0) : '—'}
                    </span>
                    {maxPainVal > 0 && (
                      <span className={s.heroMetricSub} style={{ color: Math.abs(mpDiff) <= 1.5 ? 'var(--amber)' : mpDiff > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {mpDiff >= 0 ? '+' : ''}{mpDiff.toFixed(2)}% {locale === 'ko' ? '괴리' : locale === 'ja' ? '乖離' : 'gap'}
                      </span>
                    )}
                  </div>
                  <div className={s.heroMetricCard}>
                    <span className={s.heroMetricLabel}>GAMMA FLIP</span>
                    <span className={s.heroMetricValue}>{liveGammaFlip}</span>
                    {gammaFlipNum > 0 && (
                      <span className={s.heroMetricSub} style={{ color: gfDiff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {gfDiff >= 0
                          ? (locale === 'ko' ? '상회' : locale === 'ja' ? '上回る' : 'above')
                          : (locale === 'ko' ? '하회' : locale === 'ja' ? '下回る' : 'below')
                        } ({gfDiff >= 0 ? '+' : ''}{gfDiff.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                  <div className={s.heroMetricCard}>
                    <span className={s.heroMetricLabel}>TOTAL PREMIUM</span>
                    <span className={s.heroMetricValue}>
                      {netPremiumVal !== 0
                        ? (Math.abs(netPremiumVal) >= 1e6
                          ? `$${(netPremiumVal / 1e6).toFixed(1)}M`
                          : `$${(netPremiumVal / 1e3).toFixed(0)}K`)
                        : '—'}
                    </span>
                    <span className={s.heroMetricSub} style={{ color: netPremiumVal >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {netPremiumVal >= 0
                        ? (locale === 'ko' ? '콜 우세' : locale === 'ja' ? 'コール優勢' : 'Call dominant')
                        : (locale === 'ko' ? '풋 우세' : locale === 'ja' ? 'プット優勢' : 'Put dominant')
                      }
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* ── Row 4: Vitals Strip (RSI / VWAP / DAY RANGE) ── */}
            <div className={s.p2Vitals}>
              <div className={s.p2Vital}>
                <div className={s.k}>RSI 14</div>
                <div className={s.v}>{liveRsi.toFixed(1)}</div>
                {(() => {
                  const rsiPct = Math.max(0, Math.min(100, liveRsi || 0));
                  const rsiState = rsiPct >= 70 ? 'Hot' : rsiPct >= 60 ? 'Warm' : rsiPct <= 30 ? 'Oversold' : rsiPct <= 40 ? 'Cool' : 'Neutral';
                  const rsiColor = rsiPct >= 70 ? 'var(--red)' : rsiPct >= 60 ? 'var(--amber)' : rsiPct <= 30 ? 'var(--green)' : 'var(--cyan)';
                  return (
                    <>
                      <div className={s.vitalSub} style={{ color: rsiColor }}>{rsiState}</div>
                      <div className={s.bar}><i style={{ width: `${rsiPct}%`, background: rsiColor }} /></div>
                    </>
                  );
                })()}
              </div>
              <div className={s.p2Vital}>
                <div className={s.k}>VWAP</div>
                <div className={s.v}>${liveVwap.toFixed(2)}</div>
                {(() => {
                  const vwapDiff = liveVwap > 0 ? ((displayPrice - liveVwap) / liveVwap) * 100 : 0;
                  const vwapColor = vwapDiff >= 0 ? 'var(--green)' : 'var(--red)';
                  return (
                    <>
                      <div className={s.vitalSub} style={{ color: vwapColor }}>
                        {vwapDiff >= 0
                          ? (locale === 'ko' ? '상회' : locale === 'ja' ? '上回る' : 'above')
                          : (locale === 'ko' ? '하회' : locale === 'ja' ? '下回る' : 'below')} {vwapDiff >= 0 ? '+' : ''}{vwapDiff.toFixed(2)}%
                      </div>
                      <div className={s.bar}><i style={{ width: `${Math.min(100, Math.max(6, 50 + vwapDiff * 8))}%`, background: vwapColor }} /></div>
                    </>
                  );
                })()}
              </div>
              <div className={s.p2Vital}>
                <div className={s.k}>DAY RANGE</div>
                {(() => {
                  const rangePct = Math.max(0, Math.min(100, ((displayPrice - liveLow) / (liveHigh - liveLow || 1)) * 100));
                  const rangeColor = rangePct >= 70 ? 'var(--green)' : rangePct <= 30 ? 'var(--red)' : 'var(--cyan)';
                  return (
                    <div className={s.dayRangeMetric}>
                      <div className={s.rangeRail}>
                        <i style={{ width: `${rangePct}%`, background: `linear-gradient(90deg, rgba(239,68,68,0.65), ${rangeColor})` }} />
                        <span className={s.rangePin} style={{ left: `${rangePct}%`, borderColor: rangeColor, boxShadow: `0 0 12px ${rangeColor}` }} />
                      </div>
                      <div className={s.rangeBottom}>
                        <span>LOW <strong>${liveLow.toFixed(1)}</strong></span>
                        <span>HIGH <strong>${liveHigh.toFixed(1)}</strong></span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── SEGMENTED SUB-TABS (Overview, AI Intel, Options Flow, Strike Profile) ── */}
      <div 
        className={`${s.seg} ${s.seg4} ${s.connectedSeg}`} 
        style={{ 
          marginTop: '0px',
          marginBottom: '0px',
          borderRadius: '0px',
          borderTop: '1px solid rgba(255, 255, 255, 0.055)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.055)',
          marginLeft: '16px',
          marginRight: '16px'
        }}
      >
        <span className={s.segPill} style={{ left: `calc(3px + ${['overview', 'ai-intel', 'whale-flow', 'strike-profile'].indexOf(activeTab)} * (100% - 6px) / 4)` }}></span>
        <button
          className={activeTab === 'overview' ? s.on : ''}
          onClick={() => setActiveTab('overview')}
        >
          OVERVIEW
        </button>
        <button
          className={activeTab === 'ai-intel' ? s.on : ''}
          onClick={() => setActiveTab('ai-intel')}
        >
          <span style={{
            background: 'linear-gradient(90deg, #a855f7, #ec4899, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 900,
            opacity: activeTab === 'ai-intel' ? 1 : 0.65
          }}>
            AI INTEL
          </span>
        </button>
        <button
          className={activeTab === 'whale-flow' ? s.on : ''}
          onClick={() => setActiveTab('whale-flow')}
        >
          WHALE & DP
        </button>
        <button
          className={activeTab === 'strike-profile' ? s.on : ''}
          onClick={() => setActiveTab('strike-profile')}
        >
          STRIKE
        </button>
      </div>


      {/* ── STYLE TAG FOR CUSTOM PREMIUM SCROLLBAR & VITAL CARD GLOWS ── */}
      <style jsx global>{`
        .premium-card {
          background: rgba(30, 41, 59, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 8px 32px rgba(0, 0, 0, 0.24);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .animate-glow {
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.02);
          transition: box-shadow 0.3s ease;
        }
        .animate-glow:hover {
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .premium-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .premium-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01);
          border-radius: 4px;
        }
        .premium-scroll::-webkit-scrollbar-thumb {
          background: rgba(6, 182, 212, 0.25);
          border-radius: 4px;
          border: 1px solid rgba(6, 182, 212, 0.1);
        }
        .premium-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(6, 182, 212, 0.55);
        }
        .no-scrollbar {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }

        @keyframes vital-pulse-gold {
          0% { border-color: rgba(245, 158, 11, 0.25); box-shadow: 0 0 4px rgba(245, 158, 11, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
          100% { border-color: rgba(245, 158, 11, 0.65); box-shadow: 0 0 10px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
        }
        @keyframes vital-pulse-cyan {
          0% { border-color: rgba(34, 211, 238, 0.25); box-shadow: 0 0 4px rgba(34, 211, 238, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
          100% { border-color: rgba(34, 211, 238, 0.65); box-shadow: 0 0 10px rgba(34, 211, 238, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
        }
        @keyframes vital-pulse-red {
          0% { border-color: rgba(239, 68, 68, 0.25); box-shadow: 0 0 4px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
          100% { border-color: rgba(239, 68, 68, 0.65); box-shadow: 0 0 10px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
        }
        @keyframes ext-live-breathe {
          0%, 100% {
            border-color: rgba(148, 163, 184, 0.13);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 rgba(6,182,212,0);
          }
          50% {
            border-color: rgba(6, 182, 212, 0.34);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 18px rgba(6,182,212,0.13);
          }
        }
        @keyframes ext-flash-up {
          0% {
            border-color: rgba(16, 185, 129, 0.86);
            background-color: rgba(16, 185, 129, 0.13);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 24px rgba(16,185,129,0.32);
          }
          100% {
            border-color: rgba(148, 163, 184, 0.13);
            background-color: rgba(15, 23, 42, 0.32);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 rgba(16,185,129,0);
          }
        }
        @keyframes ext-flash-down {
          0% {
            border-color: rgba(244, 63, 94, 0.86);
            background-color: rgba(244, 63, 94, 0.13);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 24px rgba(244,63,94,0.32);
          }
          100% {
            border-color: rgba(148, 163, 184, 0.13);
            background-color: rgba(15, 23, 42, 0.32);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 rgba(244,63,94,0);
          }
        }
        .ext-live {
          position: relative;
          animation: ext-live-breathe 2.6s ease-in-out infinite;
          will-change: border-color, box-shadow, background-color;
        }
        .ext-up {
          animation: ext-flash-up 0.95s ease-out 1, ext-live-breathe 2.6s ease-in-out 0.95s infinite;
        }
        .ext-down {
          animation: ext-flash-down 0.95s ease-out 1, ext-live-breathe 2.6s ease-in-out 0.95s infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ext-live,
          .ext-up,
          .ext-down {
            animation: none;
          }
        }

        .vital-gold-glow {
          animation: vital-pulse-gold 2s infinite alternate;
          background: rgba(245, 158, 11, 0.04) !important;
          border-color: rgba(245, 158, 11, 0.5) !important;
        }
        .vital-cyan-glow {
          animation: vital-pulse-cyan 2s infinite alternate;
          background: rgba(34, 211, 238, 0.04) !important;
          border-color: rgba(34, 211, 238, 0.5) !important;
        }
        .vital-red-glow {
          animation: vital-pulse-red 2s infinite alternate;
          background: rgba(239, 68, 68, 0.04) !important;
          border-color: rgba(239, 68, 68, 0.5) !important;
        }
      `}</style>

      {/* ── TAB CONTENT ── */}
      <SwipeableTabs
        onSwipeLeft={() => { const TABS = ['overview', 'ai-intel', 'whale-flow', 'strike-profile'] as const; const i = TABS.indexOf(activeTab); if (i < TABS.length - 1) setActiveTab(TABS[i + 1]); }}
        onSwipeRight={() => { const TABS = ['overview', 'ai-intel', 'whale-flow', 'strike-profile'] as const; const i = TABS.indexOf(activeTab); if (i > 0) setActiveTab(TABS[i - 1]); }}
      >
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
          {/* Premium Flow Briefing */}
          <div className="premium-card animate-glow" style={{
            padding: '16px',
            margin: 0,
            position: 'relative',
            overflow: 'hidden',
            borderTop: 'none',
            borderTopLeftRadius: '0px',
            borderTopRightRadius: '0px',
            background: `linear-gradient(135deg, ${overviewAccent}18 0%, rgba(15, 23, 42, 0.7) 42%, rgba(30, 41, 59, 0.46) 100%)`,
            borderColor: `${overviewAccent}40`
          }}>
            <div style={{
              position: 'absolute',
              right: '-48px',
              top: '-56px',
              width: '150px',
              height: '150px',
              borderRadius: '50%',
              background: `${overviewAccent}1f`,
              filter: 'blur(28px)'
            }} />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ font: 'var(--f-micro)', fontWeight: 900, color: 'rgba(180, 198, 239, 0.82)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {flowCopy.overviewEyebrow}
              </span>
              <span style={{
                font: 'var(--f-micro)',
                fontWeight: 900,
                color: overviewAccent,
                background: `${overviewAccent}14`,
                border: `1px solid ${overviewAccent}35`,
                borderRadius: '999px',
                padding: '4px 8px',
                whiteSpace: 'nowrap'
              }}>
                {convictionLabel}
              </span>
            </div>

            <div style={{ position: 'relative', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: '14px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: overviewAccent,
                background: `${overviewAccent}14`,
                border: `1px solid ${overviewAccent}35`,
                boxShadow: `0 0 20px ${overviewAccent}22`
              }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l6-6 4 4 8-8" />
                  <path d="M14 7h7v7" />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: 'var(--f-h2)', fontWeight: 900, color: '#f8fafc', lineHeight: 1.12, marginBottom: '6px' }}>
                  {overviewSignal.title}
                </div>
                <div style={{ font: 'var(--f-small)', fontWeight: 650, color: '#b4c6ef', lineHeight: 1.5 }}>
                  {overviewSignal.body}
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: '14px' }}>
              {[
                { label: flowCopy.premiumFlow, value: premiumBiasLabel, color: callPct >= 55 ? '#10b981' : callPct <= 45 ? '#f43f5e' : '#f59e0b' },
                { label: flowCopy.gammaMap, value: gammaPositionLabel, color: gammaFlipNumForOverview > 0 && displayPrice >= gammaFlipNumForOverview ? '#10b981' : '#f59e0b' },
                { label: flowCopy.riskState, value: riskStateLabel, color: volRegime === 'ERUPTING' ? '#f43f5e' : volRegime === 'LOADED' ? '#f59e0b' : '#10b981' }
              ].map((item) => (
                <div key={item.label} style={{
                  minWidth: 0,
                  padding: '10px 8px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.42)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)'
                }}>
                  <div style={{ font: 'var(--f-micro)', fontWeight: 800, color: 'rgba(148, 163, 184, 0.9)', marginBottom: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </div>
                  <div style={{ font: 'var(--f-micro)', fontWeight: 900, color: item.color, lineHeight: 1.25, minHeight: '22px' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              position: 'relative',
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '10px',
              color: '#dbeafe',
              font: 'var(--f-small)',
              fontWeight: 700,
              lineHeight: 1.45,
              background: 'rgba(6, 182, 212, 0.055)',
              border: '1px solid rgba(6, 182, 212, 0.16)'
            }}>
              {overviewSignal.action}
            </div>
          </div>

          {/* OPI Radial Gauge (Module 1) */}
          <div className="premium-card" style={{ padding: '18px 16px', margin: 0, position: 'relative' }}>
            {renderPopover('opi', flowCopy.opiInfo, flowCopy.opiInfoTitle)}
            <div className="app-card-head" style={{ marginBottom: 0 }}>
              <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: '#f8fafc', fontWeight: 800 }}>
                {t.opiGauge}
                {renderInfoBtn("opi")}
                <span style={{ 
                  fontSize: '8px', 
                  fontWeight: 900, 
                  background: opiCalculated.isFallback ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)', 
                  color: opiCalculated.isFallback ? '#f43f5e' : '#10b981',
                  border: `1px solid ${opiCalculated.isFallback ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                  padding: '2.5px 7px', 
                  borderRadius: '12px', 
                  marginLeft: '8px',
                  verticalAlign: 'middle',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em'
                }}>
                  {opiCalculated.isFallback ? flowCopy.closed : flowCopy.intraday}
                </span>
              </span>
              <span style={{ font: 'var(--f-micro)', fontWeight: 900, color: gaugeColor, letterSpacing: '0.05em' }}>{gaugeStatus}</span>
            </div>

            {/* Semi-circular Gauge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10, position: 'relative', height: '108px' }}>
              <svg width="182" height="100" viewBox="0 0 180 100">
                <defs>
                  <linearGradient id="opiGaugeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="50%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                {/* Arc track */}
                <path
                  d={describeArc(90, 90, 80, -90, 90)}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.04)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                {/* Filled arc with gradient */}
                <path
                  d={describeArc(90, 90, 80, -90, -90 + (opi / 100) * 180)}
                  fill="none"
                  stroke="url(#opiGaugeGrad)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.25))' }}
                />
                {/* Dial center pin */}
                <circle cx="90" cy="90" r="4.5" fill="#f8fafc" />
                {/* Dial hand */}
                <line
                  x1="90"
                  y1="90"
                  x2="90"
                  y2="30"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{
                    transform: `rotate(${rotationAngle}deg)`,
                    transformOrigin: '90px 90px',
                    transition: 'transform 1.2s cubic-bezier(0.19, 1, 0.22, 1)',
                    filter: 'drop-shadow(0 0 3px rgba(255, 255, 255, 0.6))'
                  }}
                />
              </svg>
              {/* Positioned value badge below the hand but inside the arc */}
              <div style={{ position: 'absolute', bottom: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="tnum" style={{ font: 'var(--f-display)', fontSize: '30px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em', textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                  {opi.toFixed(1)}
                </span>
                <span style={{ font: 'var(--f-micro)', fontWeight: 800, color: 'var(--text-muted)', fontSize: '8.5px', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '-4px' }}>
                  OPI SCORE
                </span>
              </div>
            </div>

            <div style={{ marginTop: '6px', padding: '10px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.32)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ font: 'var(--f-micro)', fontWeight: 900, color: 'rgba(180, 198, 239, 0.78)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>
                {flowCopy.opiFactors}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {opiFactorRails.map((factor) => (
                  <div key={factor.label} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 54px', alignItems: 'center', gap: '8px' }}>
                    <span style={{ font: 'var(--f-micro)', fontWeight: 800, color: 'rgba(148, 163, 184, 0.95)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {factor.label}
                    </span>
                    <div style={{ height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        width: `${factor.width}%`,
                        height: '100%',
                        borderRadius: '999px',
                        background: `linear-gradient(90deg, ${factor.color}88, ${factor.color})`,
                        boxShadow: `0 0 10px ${factor.color}55`
                      }} />
                    </div>
                    <span className="tnum" style={{ font: 'var(--f-micro)', fontWeight: 900, color: factor.color, textAlign: 'right' }}>
                      {factor.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* PCR Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.pcRatio}</span>
                <span className="tnum" style={{ font: 'var(--f-body)', fontWeight: 800, color: '#ffffff', marginTop: 4 }}>{pcRatio.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{flowCopy.underlyingOpi}</span>
                <span className="tnum" style={{ font: 'var(--f-body)', fontWeight: 800, color: gaugeColor, marginTop: 4 }}>{opi.toFixed(0)} ({gaugeStatus})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.regime}</span>
                <span style={{ 
                  font: 'var(--f-micro)', 
                  fontWeight: 900, 
                  color: volRegime === 'ERUPTING' ? '#f43f5e' : volRegime === 'LOADED' ? '#fbbf24' : '#10b981',
                  background: volRegime === 'ERUPTING' ? 'rgba(239, 68, 68, 0.08)' : volRegime === 'LOADED' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  border: `1px solid ${volRegime === 'ERUPTING' ? 'rgba(239, 68, 68, 0.15)' : volRegime === 'LOADED' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'}`,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  marginTop: 4,
                  letterSpacing: '0.03em'
                }}>
                  {volRegime}
                </span>
              </div>
            </div>
          </div>

          {/* Pressure Pair (Composite + Squeeze) */}
          {(() => {
            const compStatus = compositeScore >= 20 ? flowCopy.compStrong : compositeScore <= -20 ? flowCopy.compBear : flowCopy.compNeutral;
            const compColor = compositeScore >= 20 ? '#10b981' : compositeScore <= -20 ? '#f43f5e' : '#f59e0b';
            const sqStatus = squeezeProb >= 70 ? flowCopy.squeezeHigh : squeezeProb >= 40 ? flowCopy.squeezeModerate : flowCopy.squeezeLow;
            const sqColor = squeezeProb >= 70 ? '#f43f5e' : squeezeProb >= 40 ? '#fbbf24' : '#10b981';
            const compositePos = Math.max(0, Math.min(100, (compositeScore + 100) / 2));

            return (
              <div className="premium-card" style={{ padding: '14px', margin: 0, position: 'relative', overflow: 'hidden' }}>
                {renderPopover('composite', flowCopy.compositeInfo, flowCopy.compositeInfoTitle)}
                {renderPopover('squeeze', flowCopy.squeezeInfo, flowCopy.squeezeInfoTitle)}
                <div className="app-card-head" style={{ marginBottom: '10px', alignItems: 'center' }}>
                  <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {flowCopy.pressurePair}
                    {renderInfoBtn("composite")}
                  </span>
                  <span style={{
                    font: 'var(--f-micro)',
                    fontWeight: 900,
                    color: compColor,
                    background: `${compColor}14`,
                    border: `1px solid ${compColor}30`,
                    borderRadius: '999px',
                    padding: '3px 8px'
                  }}>
                    {compStatus}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 68px 1fr', gap: '8px', alignItems: 'center' }}>
                  <div style={{ padding: '11px 10px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.38)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.9)', fontWeight: 800, marginBottom: '7px' }}>{flowCopy.compositeIndex}</div>
                    <div className="tnum" style={{ fontSize: '22px', fontWeight: 950, color: compColor, lineHeight: 1 }}>
                      {compositeScore > 0 ? '+' : ''}{compositeScore}
                    </div>
                    <div style={{ height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', marginTop: '10px', overflow: 'hidden' }}>
                      <div style={{ width: `${compositePos}%`, height: '100%', background: `linear-gradient(90deg, rgba(239,68,68,0.75), ${compColor})`, borderRadius: '999px' }} />
                    </div>
                  </div>

                  <div style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `radial-gradient(circle at 50% 42%, ${overviewAccent}26, rgba(15,23,42,0.52) 68%)`,
                    border: `1px solid ${overviewAccent}35`,
                    boxShadow: `0 0 24px ${overviewAccent}16`
                  }}>
                    <span style={{ font: 'var(--f-micro)', color: 'rgba(180,198,239,0.75)', fontWeight: 800 }}>{flowCopy.pressureConclusion}</span>
                    <span style={{ font: 'var(--f-micro)', color: overviewAccent, fontWeight: 950, marginTop: '4px', textAlign: 'center', lineHeight: 1.1 }}>
                      {overviewSignal.title}
                    </span>
                  </div>

                  <div style={{ padding: '11px 10px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.38)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.9)', fontWeight: 800 }}>{flowCopy.squeezeProbability}</span>
                      {renderInfoBtn("squeeze")}
                    </div>
                    <div className="tnum" style={{ fontSize: '22px', fontWeight: 950, color: sqColor, lineHeight: 1, marginTop: '7px' }}>
                      {squeezeProb}%
                    </div>
                    <div style={{ font: 'var(--f-micro)', color: sqColor, fontWeight: 900, marginTop: '6px' }}>
                      {sqStatus}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* P/C RATIO — Volume (Weekly) + OI (Monthly) */}
          <div className="premium-card" style={{ padding: '14px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: '10px' }}>
              <span className="app-card-title" style={{ color: 'var(--text-muted)', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                C/P RATIO
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* Volume P/C (Weekly) */}
              <div style={{
                padding: '12px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(15,23,42,0.4))',
                border: '1px solid rgba(99,102,241,0.15)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '6px' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 6px #818cf8' }} />
                  <span style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.9)', fontWeight: 800 }}>VOLUME</span>
                </div>
                <div className="tnum" style={{ fontSize: '20px', fontWeight: 950, color: pcRatio >= 1.3 ? '#10b981' : pcRatio <= 0.75 ? '#f43f5e' : '#ffffff', lineHeight: 1, marginBottom: '6px' }}>
                  {pcRatio.toFixed(2)}
                </div>
                <div style={{ font: 'var(--f-micro)', color: pcRatio >= 1.3 ? '#10b981' : pcRatio <= 0.75 ? '#f43f5e' : '#f59e0b', fontWeight: 800, marginBottom: '6px' }}>
                  {pcRatio >= 2.0 ? (locale === 'ko' ? '강한 콜 우위' : locale === 'ja' ? '強いコール優位' : 'Strong Call') : pcRatio >= 1.3 ? (locale === 'ko' ? '콜 우위' : locale === 'ja' ? 'コール優位' : 'Call dominant') : pcRatio <= 0.5 ? (locale === 'ko' ? '강한 풋 우위' : locale === 'ja' ? '強いプット優位' : 'Strong Put') : pcRatio <= 0.75 ? (locale === 'ko' ? '풋 우위' : locale === 'ja' ? 'プット優位' : 'Put dominant') : (locale === 'ko' ? '균형' : locale === 'ja' ? 'バランス' : 'Balanced')}
                </div>
                <div className="tnum" style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 600 }}>
                  C {pcCallVol >= 1000 ? `${(pcCallVol / 1000).toFixed(0)}K` : pcCallVol} / P {pcPutVol >= 1000 ? `${(pcPutVol / 1000).toFixed(0)}K` : pcPutVol}
                </div>
                {/* Mini bar */}
                <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: '8px', background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ width: `${pcCallVol + pcPutVol > 0 ? (pcCallVol / (pcCallVol + pcPutVol)) * 100 : 50}%`, background: '#10b981', height: '100%' }} />
                  <div style={{ flex: 1, background: '#ef4444', height: '100%' }} />
                </div>
              </div>

              {/* OI P/C (Monthly) */}
              <div style={{
                padding: '12px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(15,23,42,0.4))',
                border: '1px solid rgba(99,102,241,0.15)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '6px' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }} />
                  <span style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.9)', fontWeight: 800 }}>OI</span>
                </div>
                <div className="tnum" style={{ fontSize: '20px', fontWeight: 950, color: pcRatioOI >= 1.3 ? '#10b981' : pcRatioOI <= 0.75 ? '#f43f5e' : '#ffffff', lineHeight: 1, marginBottom: '6px' }}>
                  {pcRatioOI.toFixed(2)}
                </div>
                <div style={{ font: 'var(--f-micro)', color: pcRatioOI >= 1.3 ? '#10b981' : pcRatioOI <= 0.75 ? '#f43f5e' : '#f59e0b', fontWeight: 800, marginBottom: '6px' }}>
                  {pcRatioOI >= 2.0 ? (locale === 'ko' ? '강한 콜 우위' : locale === 'ja' ? '強いコール優位' : 'Strong Call') : pcRatioOI >= 1.3 ? (locale === 'ko' ? '콜 우위' : locale === 'ja' ? 'コール優位' : 'Call dominant') : pcRatioOI <= 0.5 ? (locale === 'ko' ? '강한 풋 우위' : locale === 'ja' ? '強いプット優位' : 'Strong Put') : pcRatioOI <= 0.75 ? (locale === 'ko' ? '풋 우위' : locale === 'ja' ? 'プット優位' : 'Put dominant') : (locale === 'ko' ? '균형' : locale === 'ja' ? 'バランス' : 'Balanced')}
                </div>
                <div className="tnum" style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 600 }}>
                  C {pcCallOI >= 1000 ? `${(pcCallOI / 1000).toFixed(0)}K` : pcCallOI} / P {pcPutOI >= 1000 ? `${(pcPutOI / 1000).toFixed(0)}K` : pcPutOI}
                </div>
                {/* Mini bar */}
                <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: '8px', background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ width: `${pcCallOI + pcPutOI > 0 ? (pcCallOI / (pcCallOI + pcPutOI)) * 100 : 50}%`, background: '#10b981', height: '100%' }} />
                  <div style={{ flex: 1, background: '#ef4444', height: '100%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Premium Total Option Flows (Module 3) */}
          <div className="premium-card" style={{ padding: '16px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: '8px' }}>
              <span className="app-card-title" style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{flowCopy.totalPremium}</span>
              <span className="tnum" style={{ font: 'var(--f-h2)', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>
                ${(totalPrem / 1000000).toFixed(1)}M
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', margin: '10px 0 12px' }}>
              {[
                { label: flowCopy.netPremium, value: netPremiumText, color: netPremiumOverview >= 0 ? '#10b981' : '#f43f5e' },
                { label: flowCopy.sourceFreshness, value: opiCalculated.isFallback ? flowCopy.estimatedSource : flowCopy.liveSource, color: opiCalculated.isFallback ? '#f59e0b' : 'var(--cyan)' }
              ].map((item) => (
                <div key={item.label} style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.34)',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.9)', fontWeight: 800, marginBottom: '5px' }}>{item.label}</div>
                  <div className="tnum" style={{ font: 'var(--f-small)', color: item.color, fontWeight: 950 }}>{item.value}</div>
                </div>
              ))}
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex', margin: '6px 0 14px', border: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ width: `${callPct}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', height: '100%' }} />
              <div style={{ width: `${100 - callPct}%`, background: 'linear-gradient(90deg, #ef4444, #f43f5e)', height: '100%' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-dim)', fontWeight: 600 }}>{flowCopy.callBias}</span>
                <span className="tnum" style={{ font: 'var(--f-micro)', fontWeight: 800, color: '#10b981' }}>{callPct.toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-dim)', fontWeight: 600 }}>{flowCopy.putBias}</span>
                <span className="tnum" style={{ font: 'var(--f-micro)', fontWeight: 800, color: '#ef4444' }}>{(100 - callPct).toFixed(1)}%</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
              <div style={{ padding: '7px 10px', borderRadius: '10px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                <div style={{ font: 'var(--f-micro)', color: 'rgba(180,198,239,0.72)', fontWeight: 800 }}>{flowCopy.callShare}</div>
                <div className="tnum" style={{ font: 'var(--f-small)', fontWeight: 950, color: '#10b981', marginTop: '3px' }}>{callPct.toFixed(1)}%</div>
              </div>
              <div style={{ padding: '7px 10px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                <div style={{ font: 'var(--f-micro)', color: 'rgba(180,198,239,0.72)', fontWeight: 800 }}>{flowCopy.putShare}</div>
                <div className="tnum" style={{ font: 'var(--f-small)', fontWeight: 950, color: '#f43f5e', marginTop: '3px' }}>{(100 - callPct).toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Spot Price Positioning Ruler (Module 4) */}
          {(() => {
            const floor = putFloorVal || (displayPrice * 0.95);
            const wall = callWallVal || (displayPrice * 1.05);
            const range = wall - floor || 1;
            const pct = Math.max(2, Math.min(98, ((displayPrice - floor) / range) * 100));
            const gammaPct = gammaFlipNumForOverview > 0
              ? Math.max(2, Math.min(98, ((gammaFlipNumForOverview - floor) / range) * 100))
              : null;

            return (
              <div className="premium-card" style={{ padding: '16px', margin: 0, position: 'relative' }}>
                {renderPopover('ruler', flowCopy.spotInfo, flowCopy.spotInfoTitle)}
                <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', marginBottom: '14px', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {flowCopy.spotTitle}
                  {renderInfoBtn("ruler")}
                </span>
                
                {/* Ruler track */}
                <div style={{ 
                  position: 'relative', 
                  height: '8px', 
                  background: 'rgba(255, 255, 255, 0.04)', 
                  borderRadius: '4px', 
                  margin: '24px 8px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.02)'
                }}>
                  {/* Subtle technical tick marks behind slider */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 10px)',
                    borderRadius: '4px'
                  }} />
                  
                  {/* Glowing center indicator bar */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, rgba(245, 158, 11, 0.06) 50%, rgba(16, 185, 129, 0.12) 100%)', borderRadius: '4px' }} />

                  {gammaPct != null && (
                    <div style={{
                      position: 'absolute',
                      left: `${gammaPct}%`,
                      top: '-9px',
                      bottom: '-9px',
                      width: '1px',
                      background: 'rgba(245, 158, 11, 0.72)',
                      boxShadow: '0 0 10px rgba(245, 158, 11, 0.55)',
                      zIndex: 2
                    }}>
                      <span aria-hidden="true" style={{
                        position: 'absolute',
                        top: '-4px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: '#f59e0b',
                        border: '1px solid rgba(255,255,255,0.55)',
                        boxShadow: '0 0 8px rgba(245, 158, 11, 0.7)'
                      }} />
                    </div>
                  )}
                  
                  {/* Floating Price Pin with Tooltip */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 3,
                    }}
                  >
                    {/* Tooltip box above the pin */}
                    <div style={{
                      position: 'absolute',
                      bottom: '14px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(6, 182, 212, 0.95)',
                      border: '1px solid rgba(34, 211, 238, 0.4)',
                      boxShadow: '0 4px 14px rgba(6, 182, 212, 0.3)',
                      color: '#050a14',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      font: 'var(--f-micro)',
                      fontWeight: 900,
                      fontSize: '10px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                    }}>
                      <span>${displayPrice.toFixed(2)}</span>
                      <span style={{ opacity: 0.8 }}>({pct.toFixed(0)}%)</span>
                    </div>
                    {/* Tooltip arrow */}
                    <div style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: '4px solid rgba(6, 182, 212, 0.95)',
                      zIndex: 4,
                    }} />
                    {/* Glowing marker dot */}
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: 'var(--cyan)',
                      border: '2.5px solid #ffffff',
                      boxShadow: '0 0 10px var(--cyan), 0 0 4px #ffffff',
                    }} />
                  </div>
                </div>

                {/* Left & Right Anchors */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--f-micro)', fontWeight: 700, padding: '0 4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: '#ef4444', fontSize: '9px', letterSpacing: '0.04em' }}>PUT FLOOR ({flowCopy.support})</span>
                    <span className="tnum" style={{ fontSize: '13px', fontWeight: 900, color: '#f8fafc', marginTop: '3px' }}>${floor.toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ color: '#10b981', fontSize: '9px', letterSpacing: '0.04em' }}>CALL WALL ({flowCopy.resistance})</span>
                    <span className="tnum" style={{ fontSize: '13px', fontWeight: 900, color: '#f8fafc', marginTop: '3px' }}>${wall.toFixed(0)}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: '14px' }}>
                  {[
                    { label: flowCopy.spot, value: `$${displayPrice.toFixed(2)}`, color: 'var(--cyan)' },
                    { label: flowCopy.gammaFlip, value: gammaFlipNumForOverview > 0 ? `$${gammaFlipNumForOverview.toFixed(2)}` : '--', color: '#f59e0b' },
                    { label: flowCopy.flipDistance, value: gammaDistanceText, color: gammaDistancePct >= 0 ? '#10b981' : '#f43f5e' }
                  ].map((item) => (
                    <div key={item.label} style={{ padding: '8px 8px', borderRadius: '9px', background: 'rgba(15,23,42,0.34)', border: '1px solid rgba(255,255,255,0.05)', minWidth: 0 }}>
                      <div style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.88)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                      <div className="tnum" style={{ font: 'var(--f-micro)', color: item.color, fontWeight: 950, marginTop: '4px', whiteSpace: 'nowrap' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Options Market & GEX Regime Monitor (Module 5) */}
          {(() => {
            const gammaFlipNum = typeof liveGammaFlip === 'number'
              ? liveGammaFlip
              : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
            const isAboveGamma = displayPrice >= gammaFlipNum;
            const gexRegimeColor = isAboveGamma ? '#10b981' : '#ef4444';
            const gexRegimeLabel = isAboveGamma ? flowCopy.longGamma : flowCopy.shortGamma;

            return (
              <ValueWall
                locale={locale}
                compact
                title={locale === 'ko' ? 'GEX 레짐 잠금해제' : locale === 'ja' ? 'GEXレジーム解除' : 'Unlock GEX Regime'}
                subtitle={
                  locale === 'ko'
                    ? '광고 시청 후 1시간 동안 IV Rank, 감마 플립, 변동성 레짐 상세 해석을 확인합니다.'
                    : locale === 'ja'
                    ? '広告視聴後1時間、IV Rank・Gamma Flip・ボラティリティレジームの詳細解釈を確認できます。'
                    : 'Watch an ad to unlock IV Rank, Gamma Flip, and volatility regime context for 1 hour.'
                }
                socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : locale === 'ja' ? '本日14.2Kが解除' : '14.2K unlocked today'}
                teaser={{
                  label: locale === 'ko' ? 'FREE PREVIEW · GEX 레짐' : locale === 'ja' ? 'FREE PREVIEW · GEXレジーム' : 'FREE PREVIEW · GEX REGIME',
                  value: gexRegimeLabel
                }}
                previewChipLabel={whaleCopy.freePreview}
                ctaLabel={whaleCopy.unlockCta}
                adFreeLabel={whaleCopy.adFree}
                onUnlock={() => setIsLocked(false)}
              >
                <div className="premium-card" style={{ padding: '16px', margin: 0, position: 'relative' }}>
                {renderPopover('gex', flowCopy.regimeInfo, flowCopy.regimeInfoTitle)}
                <div className="app-card-head" style={{ marginBottom: '12px', alignItems: 'center' }}>
                  <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {flowCopy.optionsRegime}
                    {renderInfoBtn("gex")}
                  </span>
                  <span style={{
                    fontSize: '8px',
                    fontWeight: 900,
                    padding: '3px 8px',
                    borderRadius: '12px',
                    background: isAboveGamma ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    color: gexRegimeColor,
                    border: `1px solid ${isAboveGamma ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em'
                  }}>
                    {gexRegimeLabel}
                  </span>
                </div>

                <div style={{
                  marginBottom: '10px',
                  padding: '9px 11px',
                  borderRadius: '10px',
                  background: isAboveGamma ? 'rgba(16,185,129,0.055)' : 'rgba(239,68,68,0.055)',
                  border: `1px solid ${isAboveGamma ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div>
                    <div style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.9)', fontWeight: 800, marginBottom: '3px' }}>{flowCopy.volatilityEffect}</div>
                    <div style={{ font: 'var(--f-small)', color: gexRegimeColor, fontWeight: 950 }}>
                      {isAboveGamma ? flowCopy.absorbsVol : flowCopy.amplifiesVol}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.9)', fontWeight: 800, marginBottom: '3px' }}>{flowCopy.flipDistance}</div>
                    <div className="tnum" style={{ font: 'var(--f-small)', color: gexRegimeColor, fontWeight: 950 }}>{gammaDistanceText}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '11px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>IV Rank</div>
                    <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>{ivRankVal != null ? `${ivRankVal}%` : '—'}</div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '11px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>IV Skew</div>
                    <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#f43f5e', marginTop: '4px' }}>{ivSkewVal != null ? `${ivSkewVal.toFixed(1)}%` : '—'}</div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '11px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>Volume P/C</div>
                    <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>{pcRatio.toFixed(2)}</div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '11px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>{flowCopy.gammaFlip}</div>
                    <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#f59e0b', marginTop: '4px' }}>{gammaFlipNum > 0 ? `$${gammaFlipNum.toFixed(0)}` : '—'}</div>
                  </div>
                </div>

                <div style={{ 
                  font: 'var(--f-micro)', 
                  fontWeight: 600,
                  color: '#b4c6ef', 
                  background: 'rgba(6, 182, 212, 0.04)', 
                  border: '1px solid rgba(6, 182, 212, 0.15)', 
                  borderRadius: '8px', 
                  padding: '10px 12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px',
                  lineHeight: 1.4
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
                  <span>{regimeInsightText}</span>
                </div>
              </div>
              </ValueWall>
            );
          })()}
        </div>
      )}
      {/* 2. AI INTEL TAB */}
      {activeTab === 'ai-intel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
          {(() => {
            const posPct = Math.max(0, Math.min(100, ((compositeScore + 100) / 200) * 100));
            const scoreColor = overviewDirection === 'bullish' ? '#10b981' : overviewDirection === 'bearish' ? '#ef4444' : '#f59e0b';
            const bullishBias = Math.round((compositeScore + 100) / 2);
            const confidence = Math.round(Math.max(35, Math.min(96, Math.abs(compositeScore) * 0.72 + Math.abs(netPremiumOverview / Math.max(totalPrem, 1)) * 32 + (convictionLabel === flowCopy.highConviction ? 18 : 8))));
            const conflictRisk = Math.round(Math.max(5, Math.min(92, (Math.sign(opiScore) !== Math.sign(compositeScore) ? 24 : 8) + (squeezeProb >= 60 ? 18 : 6) + (overviewDirection === 'neutral' ? 18 : 0) + (volRegime === 'ERUPTING' ? 22 : volRegime === 'LOADED' ? 14 : 4))));
            const conflictLabel = conflictRisk >= 65
              ? (locale === 'ko' ? '높음' : locale === 'ja' ? '高い' : 'High')
              : conflictRisk >= 38
              ? (locale === 'ko' ? '보통' : locale === 'ja' ? '中程度' : 'Medium')
              : (locale === 'ko' ? '낮음' : locale === 'ja' ? '低い' : 'Low');
            const flowGroupScore = Math.round(opiScore + whaleScore + smartScore + uoaScore);
            const volatilityGroupScore = Math.round(squeezeScore + skewScore + zdteScore);
            const positioningGroupScore = Math.round(dexScore + pcScore + (gammaDistancePct >= 0 ? 6 : -6));
            const rail = (score: number, max = 60) => Math.max(4, Math.min(100, (Math.abs(score) / max) * 100));
            const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
            const directionText = overviewDirection === 'bullish'
              ? (locale === 'ko' ? '상방 우위' : locale === 'ja' ? '上方向優勢' : 'Bullish bias')
              : overviewDirection === 'bearish'
              ? (locale === 'ko' ? '하방 압력' : locale === 'ja' ? '下方向圧力' : 'Bearish pressure')
              : (locale === 'ko' ? '중립 압축' : locale === 'ja' ? '中立圧縮' : 'Neutral compression');
            const ui = locale === 'ko'
              ? {
                  verdictInfoTitle: 'AI Verdict 설명',
                  verdictInfo: 'AI Verdict는 OPI 하나가 아니라 OPI, 고래 포지션, 스마트머니, UOA, IV 스큐, P/C, 감마 위치, 스퀴즈 확률을 합성한 방향성 점수입니다. 투자 조언이 아니라 현재 옵션 수급 구조를 요약한 참고용 인사이트입니다.',
                  analysisVerdict: '종합 판정',
                  bearishEdge: '하방 -100',
                  neutralEdge: '중립 0',
                  bullishEdge: '상방 +100',
                  bullishBias: 'Bullish Bias',
                  confidence: 'Confidence',
                  conflictRisk: 'Conflict Risk',
                  engineAxes: '엔진 축',
                  flow: 'Flow',
                  volatility: 'Volatility',
                  positioning: 'Positioning',
                  aiCard: 'AI 플로우 인텔리전스',
                  coreConclusion: '핵심 결론',
                  evidence: '근거',
                  priceCondition: '가격 조건',
                  unlockTitle: 'AI 상세 시나리오 잠금해제',
                  unlockSub: '광고 시청 후 1시간 동안 상세 시나리오, 위험 조건, 가격 트리거를 확인합니다.',
                  social: '오늘 14.2K 잠금해제',
                  teaserLabel: 'FREE PREVIEW · AI 맥락',
                  watchCta: '광고 보고 1시간 해제',
                  adFree: '또는 월 $9.99 광고 제거',
                  details: '상세 시나리오',
                  riskLabel: '리스크 조건',
                  noAdvice: '참고용 시장 구조 분석'
                }
              : locale === 'ja'
              ? {
                  verdictInfoTitle: 'AI Verdict説明',
                  verdictInfo: 'AI VerdictはOPI単独ではなく、OPI、ホエール、スマートマネー、UOA、IVスキュー、P/C、ガンマ位置、スクイーズ確率を合成した方向性スコアです。投資助言ではなく、現在のオプション需給構造を要約した参考情報です。',
                  analysisVerdict: '総合判定',
                  bearishEdge: '下方向 -100',
                  neutralEdge: '中立 0',
                  bullishEdge: '上方向 +100',
                  bullishBias: 'Bullish Bias',
                  confidence: 'Confidence',
                  conflictRisk: 'Conflict Risk',
                  engineAxes: 'エンジン軸',
                  flow: 'Flow',
                  volatility: 'Volatility',
                  positioning: 'Positioning',
                  aiCard: 'AIフロー・インテリジェンス',
                  coreConclusion: '核心結論',
                  evidence: '根拠',
                  priceCondition: '価格条件',
                  unlockTitle: 'AI詳細シナリオを解除',
                  unlockSub: '広告視聴後1時間、詳細シナリオ、リスク条件、価格トリガーを確認できます。',
                  social: '本日14.2Kが解除',
                  teaserLabel: 'FREE PREVIEW · AI文脈',
                  watchCta: '広告で1時間解除',
                  adFree: 'または月額$9.99で広告なし',
                  details: '詳細シナリオ',
                  riskLabel: 'リスク条件',
                  noAdvice: '参考用の市場構造分析'
                }
              : {
                  verdictInfoTitle: 'AI Verdict Info',
                  verdictInfo: 'AI Verdict is not OPI alone. It blends OPI, whale positioning, smart money, UOA, IV skew, P/C, gamma position, and squeeze probability into one directional score. It is market-structure context, not investment advice.',
                  analysisVerdict: 'Composite Verdict',
                  bearishEdge: 'Bearish -100',
                  neutralEdge: 'Neutral 0',
                  bullishEdge: 'Bullish +100',
                  bullishBias: 'Bullish Bias',
                  confidence: 'Confidence',
                  conflictRisk: 'Conflict Risk',
                  engineAxes: 'Engine Axes',
                  flow: 'Flow',
                  volatility: 'Volatility',
                  positioning: 'Positioning',
                  aiCard: 'AI Flow Intelligence',
                  coreConclusion: 'Core Read',
                  evidence: 'Evidence',
                  priceCondition: 'Price Condition',
                  unlockTitle: 'Unlock Detailed AI Scenario',
                  unlockSub: 'Watch an ad to unlock detailed scenarios, risk conditions, and price triggers for 1 hour.',
                  social: '14.2K unlocked today',
                  teaserLabel: 'FREE PREVIEW · AI CONTEXT',
                  watchCta: 'Watch & Unlock · 1HR',
                  adFree: 'or $9.99/mo ad-free',
                  details: 'Detailed Scenario',
                  riskLabel: 'Risk Condition',
                  noAdvice: 'Market-structure context only'
                };
            const factorGroups = [
              {
                label: ui.flow,
                score: flowGroupScore,
                color: flowGroupScore >= 0 ? '#10b981' : '#f43f5e',
                items: [
                  { label: 'OPI', value: signed(Math.round(opiScore)) },
                  { label: locale === 'ko' ? '고래' : locale === 'ja' ? 'ホエール' : 'Whale', value: signed(Math.round(whaleScore)) },
                  { label: 'UOA', value: signed(Math.round(uoaScore)) }
                ]
              },
              {
                label: ui.volatility,
                score: volatilityGroupScore,
                color: volatilityGroupScore >= 0 ? '#10b981' : '#f59e0b',
                items: [
                  { label: locale === 'ko' ? '스퀴즈' : locale === 'ja' ? 'スクイーズ' : 'Squeeze', value: signed(Math.round(squeezeScore)) },
                  { label: 'IV Skew', value: `${ivSkewVal != null ? ivSkewVal.toFixed(1) : '--'}%` },
                  { label: locale === 'ko' ? '레짐' : locale === 'ja' ? 'レジーム' : 'Regime', value: riskStateLabel }
                ]
              },
              {
                label: ui.positioning,
                score: positioningGroupScore,
                color: positioningGroupScore >= 0 ? '#10b981' : '#f43f5e',
                items: [
                  { label: 'P/C', value: pcRatio.toFixed(2) },
                  { label: flowCopy.gammaFlip, value: gammaFlipNumForOverview > 0 ? `$${gammaFlipNumForOverview.toFixed(0)}` : '--' },
                  { label: flowCopy.flipDistance, value: gammaDistanceText }
                ]
              }
            ];
            const evidenceRows = [
              { label: ui.coreConclusion, value: overviewSignal.title, body: overviewSignal.body },
              { label: ui.evidence, value: `${premiumBiasLabel} · ${gammaPositionLabel} · ${convictionLabel}`, body: `${locale === 'ko' ? '종합 점수' : locale === 'ja' ? '総合スコア' : 'Composite'} ${signed(compositeScore)}, ${flowCopy.totalPremium} $${(totalPrem / 1000000).toFixed(1)}M, P/C ${pcRatio.toFixed(2)}` },
              { label: ui.priceCondition, value: overviewSignal.action, body: `${flowCopy.spot} $${displayPrice.toFixed(2)} / ${flowCopy.gammaFlip} ${gammaFlipNumForOverview > 0 ? `$${gammaFlipNumForOverview.toFixed(2)}` : '--'} / ${flowCopy.flipDistance} ${gammaDistanceText}` }
            ];
            const lockedScenario = [
              `${locale === 'ko' ? '콜 월' : locale === 'ja' ? 'コールウォール' : 'Call Wall'} ${callWallVal ? `$${callWallVal.toFixed(0)}` : '--'} ${locale === 'ko' ? '돌파 시 모멘텀 지속 여부를 확인합니다.' : locale === 'ja' ? '突破時にモメンタム継続を確認します。' : 'break confirms whether momentum can persist.'}`,
              `${locale === 'ko' ? '감마 플립' : locale === 'ja' ? 'ガンマフリップ' : 'Gamma Flip'} ${gammaFlipNumForOverview > 0 ? `$${gammaFlipNumForOverview.toFixed(0)}` : '--'} ${locale === 'ko' ? '이탈 시 속도 둔화 또는 레짐 전환 가능성을 점검합니다.' : locale === 'ja' ? '割れでは減速またはレジーム転換を確認します。' : 'loss flags possible speed loss or regime shift.'}`,
              `${locale === 'ko' ? '풋 플로어' : locale === 'ja' ? 'プットフロア' : 'Put Floor'} ${putFloorVal ? `$${putFloorVal.toFixed(0)}` : '--'} ${locale === 'ko' ? '하향 이탈은 리스크 재가격 조건입니다.' : locale === 'ja' ? '下抜けはリスク再価格条件です。' : 'breakdown is the downside repricing condition.'}`
            ];

            return (
              <>
                <div className="premium-card animate-glow" style={{ padding: '18px 16px', margin: 0, position: 'relative', borderTop: 'none', borderTopLeftRadius: '0px', borderTopRightRadius: '0px', background: 'linear-gradient(150deg, rgba(15,23,42,0.88), rgba(13,25,48,0.76) 48%, rgba(6,182,212,0.045))', border: `1px solid ${overviewDirection === 'bullish' ? 'rgba(16,185,129,0.18)' : overviewDirection === 'bearish' ? 'rgba(244,63,94,0.18)' : 'rgba(245,158,11,0.16)'}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.045), 0 18px 42px -28px ${scoreColor}` }}>
                  {renderPopover('ai-verdict', ui.verdictInfo, ui.verdictInfoTitle)}
                  <div className="app-card-head" style={{ marginBottom: '13px', alignItems: 'center' }}>
                    <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 850, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      AI VERDICT
                      {renderInfoBtn("ai-verdict")}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 950, padding: '3px 8px', borderRadius: '12px', ...aiVerdictBadgeStyle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {aiVerdictLabel}
                    </span>
                  </div>

                  <div style={{ marginBottom: '13px', background: 'linear-gradient(180deg, rgba(30,41,59,0.26), rgba(15,23,42,0.16))', padding: '13px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.045)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '9px', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 850, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{ui.analysisVerdict}</div>
                        <div style={{ fontSize: '15px', color: '#f8fafc', fontWeight: 950, marginTop: '3px', lineHeight: 1.15 }}>{directionText}</div>
                      </div>
                      <span className="tnum" style={{ fontSize: '22px', fontWeight: 950, color: scoreColor, textShadow: `0 0 14px ${scoreColor}55`, lineHeight: 1 }}>
                        {signed(compositeScore)}
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: '7px', borderRadius: '999px', background: 'linear-gradient(90deg, rgba(239,68,68,0.78) 0%, rgba(30,41,59,0.9) 47%, rgba(30,41,59,0.9) 53%, rgba(16,185,129,0.86) 100%)', border: '1px solid rgba(255,255,255,0.055)', margin: '12px 0 9px', overflow: 'visible' }}>
                      <div style={{ position: 'absolute', left: '50%', top: '-4px', bottom: '-4px', width: '1px', background: 'rgba(255,255,255,0.22)' }} />
                      <div style={{ position: 'absolute', left: `calc(${posPct}% - 5px)`, top: '-6px', width: '10px', height: '19px', borderRadius: '6px', background: '#ffffff', boxShadow: `0 0 12px ${scoreColor}, 0 0 5px #ffffff`, border: `1.5px solid ${scoreColor}`, zIndex: 3, transition: 'left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-muted)', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <span>{ui.bearishEdge}</span>
                      <span>{ui.neutralEdge}</span>
                      <span>{ui.bullishEdge}</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '13px' }}>
                    {[
                      { label: ui.bullishBias, value: `${bullishBias}%`, color: scoreColor },
                      { label: ui.confidence, value: `${confidence}%`, color: confidence >= 70 ? '#10b981' : '#f59e0b' },
                      { label: ui.conflictRisk, value: conflictLabel, color: conflictRisk >= 65 ? '#f43f5e' : conflictRisk >= 38 ? '#f59e0b' : '#10b981' }
                    ].map((item) => (
                      <div key={item.label} style={{ minWidth: 0, padding: '10px 8px', borderRadius: '10px', background: `linear-gradient(160deg, ${item.color}14, rgba(15,23,42,0.28))`, border: `1px solid ${item.color}22`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.035)` }}>
                        <div style={{ font: 'var(--f-micro)', color: 'rgba(180,198,239,0.72)', fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                        <div className="tnum" style={{ color: item.color, fontSize: '15px', fontWeight: 950, marginTop: '5px', whiteSpace: 'nowrap' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '9px' }}>
                    <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 850, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{ui.engineAxes}</span>
                    <span style={{ font: 'var(--f-micro)', color: 'rgba(180,198,239,0.72)', fontWeight: 750 }}>{flowCopy.liveSource}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {factorGroups.map((group) => (
                      <div key={group.label} style={{ padding: '10px 10px', borderRadius: '11px', background: 'rgba(15,23,42,0.30)', border: '1px solid rgba(255,255,255,0.055)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr 40px', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: '#dbeafe', fontWeight: 900, whiteSpace: 'nowrap' }}>{group.label}</span>
                          <div style={{ position: 'relative', height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.22)' }} />
                            <div style={{ position: 'absolute', left: group.score >= 0 ? '50%' : `calc(50% - ${rail(group.score)}%)`, width: `${rail(group.score)}%`, top: 0, bottom: 0, borderRadius: '999px', background: `linear-gradient(90deg, ${group.color}88, ${group.color})`, boxShadow: `0 0 8px ${group.color}66` }} />
                          </div>
                          <span className="tnum" style={{ color: group.color, fontWeight: 950, textAlign: 'right', fontSize: '12px' }}>{signed(group.score)}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', marginTop: '9px' }}>
                          {group.items.map((item) => (
                            <div key={item.label} style={{ minWidth: 0 }}>
                              <div style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.74)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                              <div className="tnum" style={{ font: 'var(--f-micro)', color: '#f8fafc', fontWeight: 900, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="premium-card" style={{ padding: '18px 16px', margin: 0, position: 'relative', background: 'linear-gradient(155deg, rgba(15,23,42,0.88), rgba(12,22,42,0.72) 54%, rgba(245,158,11,0.045))', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045), 0 18px 46px -34px rgba(245,158,11,0.55)' }}>
                  <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                      <span style={{
                        width: 26,
                        height: 26,
                        borderRadius: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                        background: 'linear-gradient(145deg, rgba(6,182,212,0.16), rgba(15,23,42,0.72))',
                        border: '1px solid rgba(6,182,212,0.24)',
                        boxShadow: '0 0 18px rgba(6,182,212,0.14), inset 0 1px 0 rgba(255,255,255,0.08)'
                      }}>
                        <img
                          src="/signum-sg-vectorized.svg"
                          alt=""
                          width={15}
                          height={15}
                          style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(34,211,238,0.45))' }}
                        />
                      </span>
                      <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: '#dff7ff', fontWeight: 950, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.055em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ui.aiCard}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 950, background: 'rgba(6, 182, 212, 0.08)', color: 'var(--cyan)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '2px 8px', borderRadius: '12px', letterSpacing: '0.06em' }}>
                      Claude
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {evidenceRows.map((row, idx) => (
                      <div key={row.label} style={{ padding: '12px 12px', borderRadius: '11px', background: idx === 0 ? `linear-gradient(135deg, ${scoreColor}16, rgba(15,23,42,0.28))` : 'rgba(15,23,42,0.30)', border: idx === 0 ? `1px solid ${scoreColor}2a` : '1px solid rgba(255,255,255,0.055)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ font: 'var(--f-micro)', color: 'rgba(148,163,184,0.86)', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{row.label}</span>
                          {idx === 0 && <span style={{ fontSize: '8px', fontWeight: 950, color: scoreColor, background: `${scoreColor}16`, border: `1px solid ${scoreColor}2a`, padding: '2px 6px', borderRadius: '999px', whiteSpace: 'nowrap' }}>{convictionLabel}</span>}
                        </div>
                        <div style={{ color: idx === 0 ? '#f8fafc' : '#dbeafe', fontWeight: idx === 0 ? 950 : 850, lineHeight: 1.35, fontSize: idx === 0 ? '14px' : '12.5px' }}>{row.value}</div>
                        <div style={{ color: '#b4c6ef', lineHeight: 1.55, fontSize: '12px', marginTop: '7px' }}>{row.body}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.055)', paddingTop: '14px', marginTop: '14px', position: 'relative' }}>
                    <ValueWall
                      locale={locale}
                      title={ui.unlockTitle}
                      subtitle={ui.unlockSub}
                      socialProof={ui.social}
                      teaser={{ label: ui.teaserLabel, value: `${ui.details} · ${directionText}` }}
                      ctaLabel={ui.watchCta}
                      adFreeLabel={ui.adFree}
                      previewChipLabel={whaleCopy.freePreview}
                      onUnlock={() => setIsLocked(false)}
                      lockedPreview={
                        <div style={{ opacity: 0.14, filter: 'blur(3.5px)', pointerEvents: 'none' }}>
                          <div style={{ fontSize: '11px', fontWeight: 850, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ui.details}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12.5px', lineHeight: '1.55' }}>
                            {lockedScenario.slice(0, 2).map((txt) => (
                              <div key={txt} style={{ color: '#b4c6ef', paddingLeft: '12px', borderLeft: '2px solid rgba(6,182,212,0.35)' }}>{txt}</div>
                            ))}
                          </div>
                        </div>
                      }
                    >
                      <div style={{ fontSize: '11px', fontWeight: 850, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ui.details}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12.5px', lineHeight: '1.55' }}>
                        {lockedScenario.map((txt) => (
                          <div key={txt} style={{ color: '#b4c6ef', paddingLeft: '12px', borderLeft: `2px solid ${scoreColor}88` }}>{txt}</div>
                        ))}
                      </div>
                    </ValueWall>
                  </div>

                  <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(245, 158, 11, 0.045)', border: '1px solid rgba(245, 158, 11, 0.16)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ui.riskLabel}</span>
                      <span style={{ font: 'var(--f-small)', fontWeight: 850, color: '#ffffff', marginTop: '2px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{overviewSignal.action}</span>
                    </div>
                    <span style={{ fontSize: '8px', fontWeight: 950, background: 'rgba(6, 182, 212, 0.07)', color: 'var(--cyan)', border: '1px solid rgba(6, 182, 212, 0.18)', padding: '3px 7px', borderRadius: '12px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {ui.noAdvice}
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}{/* 3. FLOW (WHALE RADAR) TAB */}
      {activeTab === 'whale-flow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
            {/* TODAY'S WHALE FLOW & SUMMARY WIDGET */}
            {(() => {
              const whaleTotalVol = institutionalTotal;
              const optionMixPct = whaleTotalVol > 0 ? Math.max(1, Math.min(99, (whaleDayTotal / whaleTotalVol) * 100)) : 50;
              const darkMixPct = 100 - optionMixPct;

              return (
                <div className="premium-card animate-glow" style={{ padding: '18px 16px', margin: 0, borderTop: 'none', borderTopLeftRadius: '0px', borderTopRightRadius: '0px', position: 'relative', background: 'linear-gradient(150deg, rgba(15,23,42,0.9), rgba(11,25,45,0.78) 52%, rgba(6,182,212,0.06))', border: '1px solid rgba(6, 182, 212, 0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 44px -30px rgba(6,182,212,0.45)' }}>
                  {renderPopover('inst-flow', whaleCopy.sectionInfo, whaleCopy.sectionInfoTitle)}
                  <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
                    <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {whaleCopy.sectionTitle}
                      {renderInfoBtn("inst-flow")}
                    </span>
                    <span style={{
                      fontSize: '8px',
                      fontWeight: 900,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: 'rgba(6, 182, 212, 0.08)',
                      color: 'var(--cyan)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      {whaleCopy.liveBadge}
                    </span>
                  </div>

                  <div style={{ marginBottom: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: '11px', color: '#a8b8d8', display: 'block', fontWeight: 850, letterSpacing: '0.01em' }}>
                          {institutionalTotalLabel}
                        </span>
                        <span className="tnum" style={{ fontSize: '28px', lineHeight: 1.05, fontWeight: 950, color: '#ffffff', letterSpacing: '-0.02em', marginTop: '4px', display: 'block' }}>
                          {formatCompactMoney(whaleTotalVol, 2)}
                        </span>
                      </div>
                      <span style={{ fontSize: '9px', color: '#8da3c7', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '3px', whiteSpace: 'nowrap' }}>
                        {totalCompositionLabel}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                      <div style={{ minWidth: 0, padding: '9px 10px', borderRadius: '10px', background: 'rgba(16,185,129,0.075)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <div style={{ fontSize: '9px', color: '#91a6ca', fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{whaleCopy.whaleOptions}</div>
                        <div className="tnum" style={{ marginTop: '3px', fontSize: '14px', fontWeight: 950, color: '#10f2b0' }}>{formatCompactMoney(whaleDayTotal, 1)}</div>
                      </div>
                      <div style={{ minWidth: 0, padding: '9px 10px', borderRadius: '10px', background: 'rgba(34,211,238,0.075)', border: '1px solid rgba(34,211,238,0.15)' }}>
                        <div style={{ fontSize: '9px', color: '#91a6ca', fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{whaleCopy.darkBlocks}</div>
                        <div className="tnum" style={{ marginTop: '3px', fontSize: '14px', fontWeight: 950, color: '#22d3ee' }}>{formatCompactMoney(dpDayValue, 1)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Total composition bar */}
                  <div style={{ height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex', marginBottom: '16px', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.025)' }}>
                    <div style={{ width: `${optionMixPct}%`, minWidth: whaleDayTotal > 0 ? '4px' : 0, background: 'linear-gradient(90deg, #10b981, #34d399)', transition: 'width 0.4s ease' }} />
                    <div style={{ width: `${darkMixPct}%`, background: 'linear-gradient(90deg, #22d3ee, #0891b2)', transition: 'width 0.4s ease' }} />
                  </div>

                  {/* Three metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '14px' }}>
                    <div style={{ background: 'rgba(30, 41, 59, 0.15)', padding: '10px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 800, fontSize: '9px', textTransform: 'uppercase' }}>{whaleCopy.dpDominance}</div>
                      <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: 'var(--cyan)', marginTop: '4px' }}>{dpDayPct.toFixed(1)}%</div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {dpNetBuyValue >= 0 ? '+' : '-'}{formatCompactMoney(Math.abs(dpNetBuyValue), 1)}
                      </span>
                    </div>
                    <div style={{ background: 'rgba(30, 41, 59, 0.15)', padding: '10px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 800, fontSize: '9px', textTransform: 'uppercase' }}>{whaleCopy.shortPressure}</div>
                      <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#f43f5e', marginTop: '4px' }}>{shortPct}</div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px' }}>
                        {whaleCopy.psychology}
                      </span>
                    </div>
                    <div style={{ background: 'rgba(30, 41, 59, 0.15)', padding: '10px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 800, fontSize: '9px', textTransform: 'uppercase' }}>{whaleCopy.blockIntensity}</div>
                      <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>{dpDayCount || blockCount}</div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px' }}>
                        {blockIntensityPct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="premium-card" style={{ padding: '15px 14px', margin: 0, position: 'relative', background: 'linear-gradient(155deg, rgba(15,23,42,0.88), rgba(12,22,42,0.72) 58%, rgba(245,158,11,0.045))', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)' }}>
              {renderPopover('flow-psych', whaleCopy.psychologyInfo, whaleCopy.psychologyInfoTitle)}
              <div className="app-card-head" style={{ marginBottom: '12px', alignItems: 'center' }}>
                <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {whaleCopy.psychology}
                  {renderInfoBtn("flow-psych")}
                </span>
                <span style={{ fontSize: '8px', fontWeight: 950, padding: '3px 8px', borderRadius: '999px', color: psychologyAccent, background: `${psychologyAccent}16`, border: `1px solid ${psychologyAccent}28`, whiteSpace: 'nowrap' }}>
                  {psychologyLabel}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 1fr', gap: '8px', alignItems: 'stretch' }}>
                <div style={{ padding: '11px 10px', borderRadius: '11px', background: 'rgba(15,23,42,0.34)', border: '1px solid rgba(255,255,255,0.055)' }}>
                  <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 850 }}>{whaleCopy.conviction}</div>
                  <div className="tnum" style={{ color: psychologyAccent, fontSize: '18px', fontWeight: 950, marginTop: '5px' }}>{convictionPct}%</div>
                  <div style={{ height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: '7px' }}>
                    <div style={{ width: `${convictionPct}%`, height: '100%', background: psychologyAccent, boxShadow: `0 0 10px ${psychologyAccent}99` }} />
                  </div>
                </div>
                <div style={{ display: 'grid', placeItems: 'center', textAlign: 'center', borderRadius: '999px', background: `radial-gradient(circle, ${psychologyAccent}1e, rgba(15,23,42,0.2) 64%)`, border: `1px solid ${psychologyAccent}24`, minHeight: '72px' }}>
                  <div>
                    <div className="tnum" style={{ fontSize: '17px', fontWeight: 950, color: psychologyAccent }}>{pressureScore >= 0 ? '+' : ''}{pressureScore}</div>
                    <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase' }}>{whaleCopy.netBias}</div>
                  </div>
                </div>
                <div style={{ padding: '11px 10px', borderRadius: '11px', background: 'rgba(15,23,42,0.34)', border: '1px solid rgba(255,255,255,0.055)' }}>
                  <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 850 }}>{whaleCopy.blockIntensity}</div>
                  <div className="tnum" style={{ color: '#22d3ee', fontSize: '18px', fontWeight: 950, marginTop: '5px' }}>{formattedBlockCount}</div>
                  <div style={{ height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: '7px' }}>
                    <div style={{ width: `${blockIntensityPct}%`, height: '100%', background: '#22d3ee', boxShadow: '0 0 10px rgba(34,211,238,0.7)' }} />
                  </div>
                  <div style={{ marginTop: '5px', fontSize: '8px', color: '#91a6ca', fontWeight: 850 }}>{blockIntensityPct}%</div>
                </div>
              </div>
            </div>

            {/* VALUE WALL / PREMIUM OPTIONS TABLE */}
            <div style={{ position: 'relative', overflow: 'hidden', background: 'rgba(30, 41, 59, 0.12)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '12px' }}>
              {/* Sub-Tab Selector */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '3px', borderRadius: '8px', marginBottom: '14px' }}>
                <button
                  onClick={() => setFlowTab('whale')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '6px',
                    border: 'none',
                    background: flowTab === 'whale' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                    color: flowTab === 'whale' ? 'var(--cyan)' : 'var(--text-muted)',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {whaleCopy.whaleTab} <span className="tnum" style={{ opacity: 0.8 }}>{whaleDayCount}</span>
                </button>
                <button
                  onClick={() => setFlowTab('darkpool')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '6px',
                    border: 'none',
                    background: flowTab === 'darkpool' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                    color: flowTab === 'darkpool' ? 'var(--cyan)' : 'var(--text-muted)',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {whaleCopy.darkTab} <span className="tnum" style={{ opacity: 0.8 }}>{dpDayCount}</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '7px', marginBottom: '12px' }}>
                {flowPreviewStats.map((item) => (
                  <div key={item.label} style={{ minWidth: 0, padding: '10px 9px', borderRadius: '10px', background: `linear-gradient(155deg, ${item.color}12, rgba(15,23,42,0.3))`, border: `1px solid ${item.color}22` }}>
                    <div style={{ fontSize: '9px', color: '#91a6ca', fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                    <div className="tnum" style={{ color: item.color, fontSize: '13px', fontWeight: 950, marginTop: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Horizontal Scroll Deck wrapped in ValueWall.
                  Break out of this card's 12px side/bottom padding so the gate
                  spans the full card width — matches the gates on other tabs,
                  which were ~12px wider on each side. */}
              <div style={{ margin: '0 -12px -12px' }}>
              <ValueWall
                locale={locale}
                title={whaleCopy.chainTitle}
                subtitle={whaleCopy.chainSubtitle}
                socialProof={whaleCopy.socialProof}
                teaser={{ label: whaleCopy.freePreview, value: `${flowTab === 'whale' ? whaleDayCount : dpDayCount} ${whaleCopy.prints} / ${formatCompactMoney(flowTab === 'whale' ? largestWhalePrint : largestDpPrint, 1)}` }}
                ctaLabel={whaleCopy.unlockCta}
                adFreeLabel={whaleCopy.adFree}
                previewChipLabel={whaleCopy.freePreview}
                onUnlock={() => setIsLocked(false)}
                lockedPreview={
                  <div 
                    className="premium-scroll no-scrollbar" 
                    style={{ 
                      display: 'flex',
                      gap: '12px',
                      overflowX: 'hidden',
                      padding: '4px 0 10px',
                      opacity: 0.12,
                      filter: 'blur(3px)',
                      pointerEvents: 'none'
                    }}
                    aria-hidden="true"
                  >
                    {flowTab === 'whale'
                      ? whaleSweeps.slice(0, 2).map((tx, idx) => renderWhaleCard(tx, idx))
                      : filteredDarkPoolTrades.slice(0, 2).map((tx, idx) => renderDarkPoolCard(tx, idx))
                    }
                  </div>
                }
              >
                <div 
                  className="premium-scroll no-scrollbar" 
                  style={{ 
                    display: 'flex',
                    gap: '12px',
                    overflowX: 'auto',
                    padding: '4px 0 10px',
                    scrollSnapType: 'x mandatory',
                    WebkitOverflowScrolling: 'touch',
                    minHeight: flowTab === 'whale' ? '170px' : '150px'
                  }}
                >
                  {flowTab === 'whale'
                    ? (whaleSweeps.length > 0 ? whaleSweeps.map((tx, idx) => renderWhaleCard(tx, idx)) : <div style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '12px', padding: '18px 4px' }}>{whaleCopy.noData}</div>)
                    : (filteredDarkPoolTrades.length > 0 ? filteredDarkPoolTrades.map((tx, idx) => renderDarkPoolCard(tx, idx)) : <div style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '12px', padding: '18px 4px' }}>{whaleCopy.noData}</div>)
                  }
                </div>
              </ValueWall>
              </div>
            </div>

            {/* Max Pain Info (also blurred if locked) */}
            <div style={{ 
              filter: isLocked ? 'blur(5px)' : 'none',
              opacity: isLocked ? 0.25 : 1,
              padding: '12px 14px',
              margin: 0,
              background: 'rgba(30, 41, 59, 0.15)',
              border: '1px solid rgba(255,255,255,0.03)',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.3s ease'
            }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.maxPain}</span>
              <span className="tnum" style={{ fontSize: '16px', fontWeight: 900, color: 'var(--amber)' }}>
                ${maxPainVal.toFixed(1)}
              </span>
            </div>

        </div>
      )}{/* 4. STRIKE PROFILE TAB */}
      {activeTab === 'strike-profile' && (() => {
        const strikeCopy = locale === 'ko'
          ? {
              title: '주간 스트라이크 맵',
              weekly: '주간 만기',
              spotRegime: '현재가 레짐',
              callWall: '콜 월',
              putFloor: '풋 플로어',
              gammaFlip: '감마 플립',
              aboveFlip: '플립 위',
              belowFlip: '플립 아래',
              nearestResistance: '근접 저항',
              nearestSupport: '근접 지지',
              breakout: '돌파 조건',
              breakdown: '이탈 조건',
              compression: '압축 폭',
              currentLane: '현재가 레인',
              callSide: 'CALL 저항',
              putSide: 'PUT 지지',
              callWallNote: '콜 월 돌파 시 상단 감마 저항 재평가',
              putFloorNote: '풋 플로어 이탈 시 하단 헤지 압력 확인',
              liveMove: '장중 현재가 기준으로 레인이 재계산됩니다',
            }
          : locale === 'ja'
          ? {
              title: '週間ストライクマップ',
              weekly: '週間満期',
              spotRegime: '現在値レジーム',
              callWall: 'コールウォール',
              putFloor: 'プットフロア',
              gammaFlip: 'ガンマフリップ',
              aboveFlip: 'フリップ上',
              belowFlip: 'フリップ下',
              nearestResistance: '近接抵抗',
              nearestSupport: '近接支持',
              breakout: '突破条件',
              breakdown: '下抜け条件',
              compression: '圧縮幅',
              currentLane: '現在値レーン',
              callSide: 'CALL抵抗',
              putSide: 'PUT支持',
              callWallNote: 'コールウォール突破時は上値ガンマ抵抗を再評価',
              putFloorNote: 'プットフロア割れでは下方向ヘッジ圧力を確認',
              liveMove: '取引中は現在値を基準にレーンを再計算します',
            }
          : {
              title: 'Weekly Strike Map',
              weekly: 'Weekly Expiry',
              spotRegime: 'Spot Regime',
              callWall: 'Call Wall',
              putFloor: 'Put Floor',
              gammaFlip: 'Gamma Flip',
              aboveFlip: 'Above flip',
              belowFlip: 'Below flip',
              nearestResistance: 'Nearest resistance',
              nearestSupport: 'Nearest support',
              breakout: 'Breakout trigger',
              breakdown: 'Breakdown trigger',
              compression: 'Compression',
              currentLane: 'Current lane',
              callSide: 'CALL resistance',
              putSide: 'PUT support',
              callWallNote: 'Recheck upper gamma resistance on a Call Wall break',
              putFloorNote: 'Watch downside hedge pressure if Put Floor breaks',
              liveMove: 'During market hours, the lane recalculates around live spot',
            };
        const parseStrikePrice = (value: any) => {
          if (typeof value === 'number') return value;
          const parsed = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
          return Number.isFinite(parsed) ? parsed : null;
        };
        // Group rawChain by strike price
        const strikeMap: Record<number, { strike: number; put: number; call: number; isWall: boolean; isFloor: boolean; isUnderlyer?: boolean }> = {};
        
        const chain = rawChain || [];
        // [MATCH WEB] 0-7 DTE multi-expiry filter (same as FlowRadar VOLUME mode)
        const etNowStrike = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const todayStrike = new Date(etNowStrike.getFullYear(), etNowStrike.getMonth(), etNowStrike.getDate());
        const maxDTEStrike = 7;
        const dteFiltered = chain.filter(opt => {
          const expiryStr = opt.details?.expiration_date;
          if (!expiryStr) return false;
          const parts = expiryStr.split('-');
          if (parts.length !== 3) return false;
          const expiryDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          const dte = Math.ceil((expiryDate.getTime() - todayStrike.getTime()) / (1000 * 60 * 60 * 24));
          return dte >= 0 && dte <= maxDTEStrike;
        });
        const effectiveChain = dteFiltered.length > 0 ? dteFiltered : chain;

        effectiveChain.forEach(opt => {
          const strike = opt.details?.strike_price;
          if (typeof strike !== 'number') return;
          
          const type = opt.details?.contract_type?.toUpperCase(); // "CALL" or "PUT"
          const vol = opt.day?.volume || 0;
          
          if (!strikeMap[strike]) {
            strikeMap[strike] = { strike, put: 0, call: 0, isWall: false, isFloor: false };
          }
          
          if (type === 'CALL') {
            strikeMap[strike].call += vol;
          } else if (type === 'PUT') {
            strikeMap[strike].put += vol;
          }
        });

        // Unique strikes sorted ascending
        const strikes = Object.keys(strikeMap).map(Number).sort((a, b) => a - b);
        
        // If empty or too few strikes, generate synthetic fallback strikes surrounding displayPrice
        if (strikes.length === 0) {
          const base = Math.round(displayPrice);
          const interval = displayPrice > 400 ? 10 : displayPrice > 100 ? 5 : 2.5;
          for (let i = -6; i <= 5; i++) {
            const strike = base + i * interval;
            strikes.push(strike);
            const dist = Math.abs(i);
            // Dummy distribution centered around current price
            strikeMap[strike] = {
              strike,
              put: Math.max(100, Math.round((12000 - dist * 1500) * (dist % 2 === 0 ? 0.8 : 1.2))),
              call: Math.max(100, Math.round((12000 - dist * 1500) * (dist % 2 === 0 ? 1.2 : 0.8))),
              isWall: false,
              isFloor: false
            };
          }
          strikes.sort((a, b) => a - b);
        }

        // Find closest strike index to displayPrice
        let closestIdx = 0;
        let minDiff = Infinity;
        strikes.forEach((stk, idx) => {
          const diff = Math.abs(stk - displayPrice);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        });

        // Select a window of 12 strikes around the closest strike
        const startIdx = Math.max(0, closestIdx - 5);
        const endIdx = Math.min(strikes.length - 1, closestIdx + 6);
        const selectedStrikes = strikes.slice(startIdx, endIdx + 1);
        
        // Sort descending (highest strike at the top)
        selectedStrikes.sort((a, b) => b - a);

        // Calculate max call and put volume in the selected window for auto-scaling
        let maxVal = Math.max(100, ...selectedStrikes.map(stk => Math.max(strikeMap[stk].call || 0, strikeMap[stk].put || 0)));

        // Find dynamic call wall and put floor in the selected window
        let maxCallVol = 0;
        let maxPutVol = 0;
        let wallStrike = -1;
        let floorStrike = -1;

        selectedStrikes.forEach(stk => {
          const cVol = strikeMap[stk].call || 0;
          const pVol = strikeMap[stk].put || 0;
          if (cVol > maxCallVol) {
            maxCallVol = cVol;
            wallStrike = stk;
          }
          if (pVol > maxPutVol) {
            maxPutVol = pVol;
            floorStrike = stk;
          }
        });

        const flowCallWall = parseStrikePrice(callWallVal);
        const flowPutFloor = parseStrikePrice(putFloorVal);
        const flowGammaFlip = parseStrikePrice(liveGammaFlip);
        [flowCallWall, flowPutFloor, flowGammaFlip].forEach((level) => {
          if (level != null && !selectedStrikes.includes(level)) {
            selectedStrikes.push(level);
            if (!strikeMap[level]) strikeMap[level] = { strike: level, put: 0, call: 0, isWall: false, isFloor: false };
          }
        });
        selectedStrikes.sort((a, b) => b - a);
        maxVal = Math.max(100, ...selectedStrikes.map(stk => Math.max(strikeMap[stk].call || 0, strikeMap[stk].put || 0)));
        // [MATCH WEB] Use rawChain-derived VOLUME values (not API OI cache)
        // API levels only used as fallback when rawChain calculation found nothing
        if (wallStrike <= 0 && flowCallWall != null) wallStrike = flowCallWall;
        if (floorStrike <= 0 && flowPutFloor != null) floorStrike = flowPutFloor;

        const closestStrike = selectedStrikes.reduce((prev, curr) => 
          Math.abs(curr - displayPrice) < Math.abs(prev - displayPrice) ? curr : prev
        , selectedStrikes[0]);

        const expirations = Array.from(new Set(effectiveChain.map(opt => opt.details?.expiration_date).filter(Boolean))).sort() as string[];
        const chartExpiry = expirations[0] || '';
        const weeklyExpiryLabel = chartExpiry ? `${chartExpiry.slice(5)} ${strikeCopy.weekly}` : strikeCopy.weekly;
        const nearestResistance = selectedStrikes.filter(stk => stk > displayPrice).sort((a, b) => a - b)[0] ?? wallStrike;
        const nearestSupport = selectedStrikes.filter(stk => stk < displayPrice).sort((a, b) => b - a)[0] ?? floorStrike;
        const wallDistancePct = wallStrike > 0 ? ((wallStrike - displayPrice) / displayPrice) * 100 : 0;
        const floorDistancePct = floorStrike > 0 ? ((displayPrice - floorStrike) / displayPrice) * 100 : 0;
        const compressionPct = wallStrike > 0 && floorStrike > 0 ? ((wallStrike - floorStrike) / displayPrice) * 100 : 0;
        const isAboveGamma = flowGammaFlip != null ? displayPrice >= flowGammaFlip : true;
        const laneLabel = wallStrike > 0 && floorStrike > 0 && displayPrice > floorStrike && displayPrice < wallStrike
          ? `${strikeCopy.putFloor} $${floorStrike} - ${strikeCopy.callWall} $${wallStrike}`
          : displayPrice >= wallStrike
          ? `${strikeCopy.callWall} $${wallStrike} ${strikeCopy.breakout}`
          : `${strikeCopy.putFloor} $${floorStrike} ${strikeCopy.breakdown}`;
        const formatDistance = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
        const rangeSpan = Math.max(0.01, wallStrike - floorStrike);
        const clampPct = (value: number) => Math.max(0, Math.min(100, value));
        const spotRangePct = wallStrike > floorStrike ? clampPct(((displayPrice - floorStrike) / rangeSpan) * 100) : 50;
        const gammaRangePct = flowGammaFlip != null && wallStrike > floorStrike ? clampPct(((flowGammaFlip - floorStrike) / rangeSpan) * 100) : null;

        // Format nearest expiry date
        const expiryLabel = nearestExpiry 
          ? nearestExpiry.split('-').slice(1).join('/') + ' ' + (locale === 'ko' ? '만기' : locale === 'ja' ? '満期' : 'Expiry')
          : (locale === 'ko' ? '실시간 만기' : locale === 'ja' ? 'リアルタイム満期' : 'Live Expiry');

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
            <div className="premium-card" style={{ padding: '16px 16px', margin: 0, borderTop: 'none', borderTopLeftRadius: '0px', borderTopRightRadius: '0px', background: 'linear-gradient(155deg, rgba(15,23,42,0.92), rgba(8,20,38,0.78) 58%, rgba(6,182,212,0.045))', border: '1px solid rgba(6,182,212,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 38px -32px rgba(6,182,212,0.5)' }}>
              <div className="app-card-head" style={{ display: 'none', marginBottom: '14px', alignItems: 'center' }}>
                <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {locale === 'ko' ? '장중 행사가 프로파일' : locale === 'ja' ? 'イントラデイ行使価格プロファイル' : 'INTRADAY STRIKE PROFILE'}
                </span>
                <span style={{ fontSize: '9px', fontWeight: 900, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '12px', letterSpacing: '0.04em' }}>
                  {expiryLabel}
                </span>
              </div>

              <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
                <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: '#9fb5d9', fontWeight: 900, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {strikeCopy.title}
                </span>
                <span style={{ fontSize: '9px', fontWeight: 950, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)', color: 'var(--cyan)', padding: '3px 8px', borderRadius: '12px', letterSpacing: '0.04em' }}>
                  {weeklyExpiryLabel}
                </span>
              </div>

              <div style={{ padding: '12px', borderRadius: '13px', background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(15,23,42,0.38))', border: '1px solid rgba(6,182,212,0.16)', marginBottom: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '11px' }}>
                  <div>
                    <div style={{ fontSize: '9px', color: '#91a6ca', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{strikeCopy.spotRegime}</div>
                    <div className="tnum" style={{ marginTop: '3px', fontSize: '24px', lineHeight: 1, fontWeight: 950, color: '#ffffff' }}>${displayPrice.toFixed(2)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', color: '#91a6ca', fontWeight: 900, textTransform: 'uppercase' }}>{strikeCopy.gammaFlip}</div>
                    <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 950, color: isAboveGamma ? '#10f2b0' : '#fb7185' }}>{isAboveGamma ? strikeCopy.aboveFlip : strikeCopy.belowFlip}</div>
                    <div className="tnum" style={{ marginTop: '2px', fontSize: '11px', color: '#cbd5e1', fontWeight: 850 }}>{flowGammaFlip != null ? `$${flowGammaFlip.toFixed(2)}` : '--'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '7px' }}>
                  {[
                    { label: strikeCopy.putFloor, value: floorStrike > 0 ? `$${floorStrike}` : '--', sub: floorStrike > 0 ? `-${floorDistancePct.toFixed(1)}%` : '--', color: '#fb7185' },
                    { label: strikeCopy.compression, value: compressionPct > 0 ? `${compressionPct.toFixed(1)}%` : '--', sub: strikeCopy.currentLane, color: '#f59e0b' },
                    { label: strikeCopy.callWall, value: wallStrike > 0 ? `$${wallStrike}` : '--', sub: wallStrike > 0 ? formatDistance(wallDistancePct) : '--', color: '#10f2b0' },
                  ].map((item) => (
                    <div key={item.label} style={{ minWidth: 0, padding: '9px 8px', borderRadius: '10px', background: `${item.color}0e`, border: `1px solid ${item.color}24` }}>
                      <div style={{ fontSize: '8px', color: '#91a6ca', fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                      <div className="tnum" style={{ marginTop: '4px', fontSize: '14px', fontWeight: 950, color: item.color, whiteSpace: 'nowrap' }}>{item.value}</div>
                      <div style={{ marginTop: '3px', fontSize: '8px', color: '#c6d3ea', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '13px', padding: '12px 8px 8px', borderRadius: '11px', background: 'rgba(2,8,23,0.22)', border: '1px solid rgba(255,255,255,0.045)' }}>
                  <div style={{ position: 'relative', height: '26px' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '11px', height: '6px', borderRadius: '999px', background: 'linear-gradient(90deg, rgba(251,113,133,0.62), rgba(245,158,11,0.5), rgba(16,242,176,0.66))', boxShadow: '0 0 16px rgba(6,182,212,0.12)' }} />
                    {gammaRangePct != null && (
                      <div style={{ position: 'absolute', left: `${gammaRangePct}%`, top: '3px', transform: 'translateX(-50%)', width: '2px', height: '22px', borderRadius: '2px', background: '#f59e0b', boxShadow: '0 0 9px rgba(245,158,11,0.7)' }} />
                    )}
                    <div style={{ position: 'absolute', left: `${spotRangePct}%`, top: '14px', transform: 'translate(-50%, -50%)', display: 'grid', placeItems: 'center', zIndex: 4 }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#22d3ee', border: '2px solid rgba(7,18,32,0.95)', boxShadow: '0 0 16px rgba(34,211,238,0.85)' }} />
                      <div className="tnum" style={{ position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)', fontSize: '8px', fontWeight: 950, color: '#aeefff', whiteSpace: 'nowrap' }}>${displayPrice.toFixed(1)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '8px', fontWeight: 900, color: '#91a6ca' }}>
                    <span style={{ color: '#fb7185' }}>${floorStrike}</span>
                    <span style={{ color: '#f59e0b' }}>{flowGammaFlip != null ? `$${flowGammaFlip.toFixed(0)}` : strikeCopy.gammaFlip}</span>
                    <span style={{ color: '#10f2b0' }}>${wallStrike}</span>
                  </div>
                </div>
                <div style={{ marginTop: '10px', padding: '8px 9px', borderRadius: '9px', background: 'rgba(2,8,23,0.28)', border: '1px solid rgba(255,255,255,0.055)', color: '#c7d7f4', fontSize: '10px', lineHeight: 1.45, fontWeight: 800 }}>
                  {laneLabel}
                </div>
              </div>

              {/* Label header */}
              <div style={{ display: 'none', justifyContent: 'space-between', font: 'var(--f-micro)', color: 'var(--text-muted)', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span style={{ color: '#ef4444' }}>{locale === 'ko' ? 'PUT 지지' : 'PUT SUPPORT'}</span>
                <span style={{ width: '60px', textAlign: 'center' }}>STRIKE</span>
                <span style={{ color: '#10b981' }}>{locale === 'ko' ? 'CALL 저항' : 'CALL RESIST'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', paddingBottom: '9px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span style={{ color: '#fb7185', fontSize: '10px' }}>{strikeCopy.putSide}</span>
                <span style={{ width: '66px', textAlign: 'center', fontSize: '10px', color: '#dbeafe' }}>STRIKE</span>
                <span style={{ color: '#10f2b0', fontSize: '10px' }}>{strikeCopy.callSide}</span>
              </div>

              {/* Bar List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '14px', position: 'relative' }}>
                
                {/* Dynamic Underlyer Line */}
                {(() => {
                  if (selectedStrikes.length < 2) return null;
                  
                  let yPos = -999;
                  const rowHeight = 27;
                  const rowGap = 9;
                  const rowPitch = rowHeight + rowGap;
                  const rowCenter = rowHeight / 2;
                  const topStrike = selectedStrikes[0];
                  const bottomStrike = selectedStrikes[selectedStrikes.length - 1];
                  
                  if (displayPrice >= topStrike) {
                    yPos = rowCenter;
                  } else if (displayPrice <= bottomStrike) {
                    yPos = (selectedStrikes.length - 1) * rowPitch + rowCenter;
                  } else {
                    for (let i = 0; i < selectedStrikes.length - 1; i++) {
                      const upper = selectedStrikes[i];
                      const lower = selectedStrikes[i + 1];
                      if (displayPrice <= upper && displayPrice > lower) {
                        const ratio = (upper - displayPrice) / (upper - lower);
                        yPos = i * rowPitch + rowCenter + ratio * rowPitch;
                        break;
                      }
                    }
                  }
                  
                  if (yPos === -999) return null;
                  
                  return (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${yPos}px`,
                      display: 'flex',
                      alignItems: 'center',
                      transform: 'translateY(-50%)',
                      zIndex: 5,
                      pointerEvents: 'none'
                    }}>
                      <div style={{
                        flex: 1,
                        borderTop: '1.5px dashed var(--cyan)',
                        opacity: 0.85,
                        boxShadow: '0 0 6px rgba(6, 182, 212, 0.4)'
                      }} />
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(34,211,238,0.98), rgba(14,165,233,0.95))',
                        color: '#04111f',
                        font: '950 10px var(--f-mono)',
                        padding: '4px 9px',
                        borderRadius: '12px',
                        boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
                        marginLeft: '8px',
                        marginRight: '8px',
                        border: '1px solid var(--cyan)',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.02em'
                      }}>
                        ${displayPrice.toFixed(2)}
                      </div>
                      <div style={{
                        flex: 1,
                        borderTop: '1.5px dashed var(--cyan)',
                        opacity: 0.85,
                        boxShadow: '0 0 6px rgba(6, 182, 212, 0.4)'
                      }} />
                    </div>
                  );
                })()}

                {/* Rows */}
                {selectedStrikes.map((strike, idx) => {
                  const data = strikeMap[strike];
                  const putPct = Math.min(90, Math.max(2, (data.put / maxVal) * 100));
                  const callPct = Math.min(90, Math.max(2, (data.call / maxVal) * 100));
                  const isClosest = strike === closestStrike;
                  const isWall = strike === wallStrike;
                  const isFloor = strike === floorStrike;
                  const isGamma = flowGammaFlip != null && Math.abs(strike - flowGammaFlip) < 0.01;

                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', height: '27px', position: 'relative', borderRadius: '9px', background: isClosest ? 'rgba(6,182,212,0.045)' : isWall ? 'rgba(16,185,129,0.035)' : isFloor ? 'rgba(239,68,68,0.035)' : 'transparent' }}>
                      {/* Put bar (grows left) */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '12px' }}>
                        <div style={{
                          width: `${putPct}%`,
                          height: isFloor ? '10px' : '8px',
                          background: isFloor 
                            ? 'linear-gradient(270deg, rgba(239, 68, 68, 0.22) 0%, #fb7185 100%)'
                            : 'linear-gradient(270deg, rgba(239, 68, 68, 0.06) 0%, rgba(239, 68, 68, 0.65) 100%)',
                          borderRadius: '999px',
                          boxShadow: isFloor ? '0 0 12px rgba(239, 68, 68, 0.55)' : 'none',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {/* Strike Label */}
                      <div className="tnum" style={{
                        width: '66px',
                        textAlign: 'center',
                        fontSize: isClosest ? '12px' : '11px',
                        fontWeight: 950,
                        color: isClosest ? '#22d3ee' : isGamma ? '#f59e0b' : '#ffffff',
                        background: isClosest ? 'rgba(6, 182, 212, 0.14)' : isGamma ? 'rgba(245,158,11,0.10)' : 'rgba(15,23,42,0.18)',
                        border: isClosest ? '1px solid rgba(6, 182, 212, 0.34)' : isGamma ? '1px solid rgba(245,158,11,0.22)' : '1px solid rgba(255,255,255,0.035)',
                        borderRadius: '8px',
                        padding: isClosest ? '2px 0' : 0,
                        zIndex: 2,
                        textShadow: isClosest ? '0 0 8px rgba(6, 182, 212, 0.3)' : 'none'
                      }}>
                        ${strike}
                      </div>

                      {/* Call bar (grows right) */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '12px' }}>
                        <div style={{
                          width: `${callPct}%`,
                          height: isWall ? '10px' : '8px',
                          background: isWall 
                            ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.22) 0%, #10f2b0 100%)'
                            : 'linear-gradient(90deg, rgba(16, 185, 129, 0.06) 0%, rgba(16, 185, 129, 0.65) 100%)',
                          borderRadius: '999px',
                          boxShadow: isWall ? '0 0 12px rgba(16, 185, 129, 0.55)' : 'none',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {/* Floating Barrier Badges */}
                      {isWall && (
                        <span style={{
                          position: 'absolute',
                          right: '2px',
                          fontSize: '9px',
                          fontFamily: 'var(--f-mono)',
                          fontWeight: 950,
                          background: 'rgba(16, 185, 129, 0.16)',
                          color: '#10f2b0',
                          padding: '3px 7px',
                          borderRadius: '999px',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          letterSpacing: '0.04em'
                        }}>
                          CALL WALL
                        </span>
                      )}
                      {isFloor && (
                        <span style={{
                          position: 'absolute',
                          left: '2px',
                          fontSize: '9px',
                          fontFamily: 'var(--f-mono)',
                          fontWeight: 950,
                          background: 'rgba(239, 68, 68, 0.16)',
                          color: '#fb7185',
                          padding: '3px 7px',
                          borderRadius: '999px',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          letterSpacing: '0.04em'
                        }}>
                          PUT FLOOR
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="premium-card" style={{ padding: '14px', margin: 0, background: 'linear-gradient(150deg, rgba(15,23,42,0.86), rgba(8,18,34,0.72))', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: strikeCopy.nearestSupport, value: nearestSupport ? `$${nearestSupport}` : '--', sub: strikeCopy.putFloorNote, color: '#fb7185' },
                  { label: strikeCopy.nearestResistance, value: nearestResistance ? `$${nearestResistance}` : '--', sub: strikeCopy.callWallNote, color: '#10f2b0' },
                  { label: strikeCopy.breakdown, value: floorStrike > 0 ? `$${floorStrike}` : '--', sub: strikeCopy.putFloor, color: '#f43f5e' },
                  { label: strikeCopy.breakout, value: wallStrike > 0 ? `$${wallStrike}` : '--', sub: strikeCopy.callWall, color: '#22d3ee' },
                ].map((item) => (
                  <div key={item.label} style={{ minWidth: 0, padding: '11px 10px', borderRadius: '11px', background: `${item.color}0d`, border: `1px solid ${item.color}20` }}>
                    <div style={{ fontSize: '9px', color: '#91a6ca', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                    <div className="tnum" style={{ marginTop: '4px', color: item.color, fontSize: '17px', fontWeight: 950 }}>{item.value}</div>
                    <div style={{ marginTop: '5px', fontSize: '8.5px', color: '#c1ccea', lineHeight: 1.35, fontWeight: 760, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '10px', padding: '9px 10px', borderRadius: '10px', background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.14)', color: '#aeefff', fontSize: '10px', fontWeight: 850 }}>
                {strikeCopy.liveMove}
              </div>
            </div>
          </div>
        );
      })()}</SwipeableTabs>
      </>)}

      {/* AD BANNER */}
      <AdBanner />
      <MobileAppFooter />
    </div>
  );
}
