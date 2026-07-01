'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from 'next-intl';
import { AdBanner } from '@/components/app/AdBanner';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { useIntelSharedDataForApp, type IntelQuote } from '@/hooks/useIntelSharedData';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { SectorIcon } from '@/components/intel/mobile/SectorIcon';
import { ChevronRight, Brain, Zap, ArrowLeft, Sparkles, Target, BarChart3 } from 'lucide-react';
import { MetricInfo } from '@/components/app/MetricInfo';
import s from '../dash/dash.module.css';

/* ═══════════════════════════════════════════════════════════
   3-LANGUAGE LOCALIZATION DICTIONARY
   ═══════════════════════════════════════════════════════════ */

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ko: {
    title: '섹터 인텔리전스',
    subtitle: 'AI 기반 기관급 섹터 분석 리포트',
    viewReport: '리포트 읽기',
    keyStocks: '핵심 종목',
    sentiment: '시장 감정',
    verdict: 'AI 종합 판정',
    catalysts: '핵심 촉매',
    adWarning: '전면 광고 송출 중...',
    closeBtn: '닫기',
    m7: 'M7 테크',
    physical_ai: '물리 로봇 및 우주',
    silicon_core: '반도체 실리콘 코어',
    power_matrix: '전력 인프라 및 우라늄',
    bio_pulse: '바이오 헬스케어',
    cyber_shield: '사이버 보안',
    orbit_defense: '우주 방산',
    quantum_edge: '양자 컴퓨터',
    fintech_pulse: '핀테크',
    cloud_fortress: '클라우드 인프라',
    desc_m7: '빅테크 7대 기업의 AI 패권 경쟁 및 감마 동향 분석',
    desc_physical_ai: '휴머노이드 로봇 및 자율주행 물리 AI 혁신 섹터',
    desc_silicon_core: '차세대 AI 학습/추론용 반도체 생태계 점검',
    desc_power_matrix: 'AI 데이터센터 구동을 위한 청정에너지 및 원자력 인프라',
    desc_bio_pulse: '비만 치료제 및 유전자 가속 바이오 혁신',
    desc_cyber_shield: 'AI 클라우드 시대 필수 사이버 보안 인프라',
    desc_orbit_defense: '저궤도 위성 통신 및 차세대 우주 방위 산업',
    desc_quantum_edge: '슈퍼컴퓨터를 초월할 양자 컴퓨팅 개척 기업',
    desc_fintech_pulse: 'AI 신용 평가 및 차세대 디지털 금융 플랫폼',
    desc_cloud_fortress: '엔터프라이즈 AI 모델 배포 및 데이터 레이크 인프라',
    gammaPulseLabel: '옵션 감마 임펄스',
    commanderLogLabel: '퀀트 코맨더 일지',
    headerDesc: 'AI 기반 분석 · 4시간마다 업데이트 · 모두 무료',
    updateBadge: 'LIVE',
    earningsCalendar: '실적 발표 캘린더',
    earningsCalendarDesc: '이 섹터 종목의 예정된 실적 발표 일정',
    noEarnings: '실적 일정 없음',
    upcoming: '예정',
    analystConsensus: '애널리스트 컨센서스',
    avgScore: '평균 점수',
    bullish: '강세',
    bearish: '약세',
    neutral: '중립',
    sectorGrade: '섹터 등급',
  },
  en: {
    title: 'Sector Intelligence',
    subtitle: 'AI-Powered Institutional Sector Reports',
    viewReport: 'Read Report',
    keyStocks: 'Key Stocks',
    sentiment: 'Sentiment',
    verdict: 'AI Verdict',
    catalysts: 'Key Catalysts',
    adWarning: 'Loading Interstitial Ad...',
    closeBtn: 'Close',
    m7: 'M7 Tech',
    physical_ai: 'Physical AI & Robotics',
    silicon_core: 'Silicon Core (Semis)',
    power_matrix: 'Power Matrix & Energy',
    bio_pulse: 'Bio Pulse & Biotech',
    cyber_shield: 'Cyber Shield (Security)',
    orbit_defense: 'Orbit Defense & Space',
    quantum_edge: 'Quantum Edge Computing',
    fintech_pulse: 'Fintech Pulse',
    cloud_fortress: 'Cloud Fortress (SaaS)',
    desc_m7: 'AI hegemony race & option gamma dynamics among the Magnificent 7.',
    desc_physical_ai: 'Humanoid robotics & autonomous physical AI innovation.',
    desc_silicon_core: 'Next-gen AI training & inference hardware ecosystem.',
    desc_power_matrix: 'Clean energy & nuclear power infrastructure for AI datacenters.',
    desc_bio_pulse: 'GLP-1 weight-loss blockbusters & gene therapy breakthroughs.',
    desc_cyber_shield: 'Crucial cybersecurity infrastructure for the enterprise AI era.',
    desc_orbit_defense: 'LEO satellite communication & defense space tech.',
    desc_quantum_edge: 'Pioneering quantum computing bypassing supercomputing barriers.',
    desc_fintech_pulse: 'AI-driven credit scoring & next-gen digital finance platforms.',
    desc_cloud_fortress: 'Enterprise AI deployment & data lake infrastructure.',
    gammaPulseLabel: 'Options Gamma Pulse',
    commanderLogLabel: 'Quant Commander Log',
    headerDesc: 'AI-powered analysis · updated every 4 hours · all free',
    updateBadge: 'LIVE',
    earningsCalendar: 'Earnings Calendar',
    earningsCalendarDesc: 'Upcoming earnings for stocks in this sector',
    noEarnings: 'No earnings scheduled',
    upcoming: 'Upcoming',
    analystConsensus: 'Analyst Consensus',
    avgScore: 'Avg Score',
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
    sectorGrade: 'Sector Grade',
  },
  ja: {
    title: 'セクター・インテリジェンス',
    subtitle: 'AI主導の機関投資家向けセクター分析レポート',
    viewReport: 'レポートを読む',
    keyStocks: '核心銘柄',
    sentiment: '市場センチメント',
    verdict: 'AI総合判定',
    catalysts: '主要触媒',
    adWarning: '全画面広告の読み込み中...',
    closeBtn: '閉じる',
    m7: 'M7テック',
    physical_ai: '物理ロボット＆宇宙',
    silicon_core: '半導体シリコンコア',
    power_matrix: '電力インフラ＆ウラン',
    bio_pulse: 'バイオ・ヘルスケア',
    cyber_shield: 'サイバーセキュリティ',
    orbit_defense: '宇宙防衛',
    quantum_edge: '量子コンピューティング',
    fintech_pulse: 'フィンテック',
    cloud_fortress: 'クラウド・インフラ',
    desc_m7: 'ビッグテック7社のAI覇権争いとオプション・ガンマ動向の分析。',
    desc_physical_ai: 'ヒューマノイドロボットや自動運転など物理AI革新セクター。',
    desc_silicon_core: '次世代AI学習・推論向け半導体ハードウェア生態系。',
    desc_power_matrix: 'AIデータセンター駆動用クリーンエネルギー＆原子力発電インフラ。',
    desc_bio_pulse: '肥満治療薬の世界的爆発と遺伝子治療の画期的進化。',
    desc_cyber_shield: 'エンタープライズAI時代に不可欠なセキュリティ網。',
    desc_orbit_defense: '低軌道衛星通信と次世代宇宙防衛システム。',
    desc_quantum_edge: 'スパコンを超える量子コンピューティング開拓企業。',
    desc_fintech_pulse: 'AI信用格付けと次世代デジタル金融プラットフォーム。',
    desc_cloud_fortress: '企業向けAIモデル展開とデータレイクインフラ。',
    gammaPulseLabel: 'オプション・ガンマ・インパルス',
    commanderLogLabel: 'クオンツ・コマンダー日誌',
    headerDesc: 'AI分析 · 4時間ごとに更新 · すべて無料',
    updateBadge: 'LIVE',
    earningsCalendar: '決算カレンダー',
    earningsCalendarDesc: 'このセクターの銘柄の今後の決算予定',
    noEarnings: '決算予定なし',
    upcoming: '予定',
    analystConsensus: 'アナリスト・コンセンサス',
    avgScore: '平均スコア',
    bullish: '強気',
    bearish: '弱気',
    neutral: '中立',
    sectorGrade: 'セクター評価',
  }
};

/* ═══════════════════════════════════════════════════════════
   SECTOR SPECIFICATIONS & DEMO DATA
   ═══════════════════════════════════════════════════════════ */

interface SectorConfig {
  id: string;
  stocks: string[];
  color: string;
  gammaPulse: { pct: number; stance: 'STABLE' | 'NEUTRAL' | 'RISK' };
  commanderLog: string;
}

const SECTOR_CONFIGS: SectorConfig[] = [
  { 
    id: 'm7', 
    stocks: ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'META', 'GOOGL', 'AMZN'], 
    color: '#22d3ee', 
    gammaPulse: { pct: 88, stance: 'STABLE' },
    commanderLog: 'Engine recommends 15% cash reservation. Accumulating on gamma flip support.'
  },
  { 
    id: 'silicon_core', 
    stocks: ['AMD', 'AVGO', 'MU', 'ARM', 'TSM', 'ASML'], 
    color: '#10b981', 
    gammaPulse: { pct: 62, stance: 'STABLE' },
    commanderLog: 'Maintain overweight stance. Momentum score hits 92; buy-back triggers active.'
  },
  { 
    id: 'power_matrix', 
    stocks: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR'], 
    color: '#f59e0b', 
    gammaPulse: { pct: 12, stance: 'NEUTRAL' },
    commanderLog: 'Neutral positioning. Yield volatility constraints active; wait for breakout.'
  },
  { 
    id: 'physical_ai', 
    stocks: ['SERV', 'SYM', 'ISRG', 'TER', 'PL', 'RKLB'], 
    color: '#ef4444', 
    gammaPulse: { pct: -35, stance: 'RISK' },
    commanderLog: 'Reduce tactical exposure by 5%. Short-term momentum weakening; key support at SMA50.'
  },
  { 
    id: 'bio_pulse', 
    stocks: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN'], 
    color: '#ec4899', 
    gammaPulse: { pct: 45, stance: 'STABLE' },
    commanderLog: 'Tactical buy triggered on GLP-1 sector flow volume breakout.'
  },
  { 
    id: 'cyber_shield', 
    stocks: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA'], 
    color: '#8b5cf6', 
    gammaPulse: { pct: -15, stance: 'NEUTRAL' },
    commanderLog: 'Underweight. Multiple resistance breakouts failed; high hedge ratio.'
  },
  { 
    id: 'orbit_defense', 
    stocks: ['LMT', 'RTX', 'AXON', 'SPCX', 'ASTS', 'LUNR'], 
    color: '#3b82f6', 
    gammaPulse: { pct: 5, stance: 'NEUTRAL' },
    commanderLog: 'Hold position. Long-term defense budget catalysts intact; watch LEO launch.'
  },
  { 
    id: 'quantum_edge', 
    stocks: ['IONQ', 'RGTI', 'QBTS'], 
    color: '#14b8a6', 
    gammaPulse: { pct: -75, stance: 'RISK' },
    commanderLog: 'Speculative 2% allocation. Extreme volatility regime active; high risk.'
  },
  { 
    id: 'fintech_pulse', 
    stocks: ['PYPL', 'SOFI', 'AFRM', 'HOOD', 'UPST'], 
    color: '#f43f5e', 
    gammaPulse: { pct: -42, stance: 'RISK' },
    commanderLog: 'Underweight. Short volume peaking; credit risk constraints active.'
  },
  { 
    id: 'cloud_fortress', 
    stocks: ['SNOW', 'DDOG', 'NET', 'CRM', 'NOW'], 
    color: '#6366f1', 
    gammaPulse: { pct: 28, stance: 'NEUTRAL' },
    commanderLog: 'Hold. SaaS enterprise renewals stable; moderate growth.'
  },
];

interface KeyStockPremiumData {
  sym: string;
  grade: string;
  score: number;
  changePct?: number;
  closePrice?: number;
  gex?: number;
  pcr?: number;
  gammaRegime?: string;
  maxPain?: number;
  callWall?: number;
  putFloor?: number;
  rsi?: number;
  rvol?: number;
  sparkline?: number[];
  analysisKr?: string;
  netPremium?: number;
  squeezeScore?: number;
  ivSkew?: number;
  impliedMovePct?: number;
  whaleIndex?: number;
  darkPoolPct?: number;
}

interface AppNewsDigestItem {
  headline?: string;
  summaryKR?: string;
  summaryJP?: string;
  insightKR?: string;
  insightEN?: string;
  insightJP?: string;
  source?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  tickers?: string[];
  publishedAt?: string;
}

interface SectorReportData {
  sentiment: string;
  verdict: string;
  catalysts: string[];
  bullets: string[];
  keyStocksData: KeyStockPremiumData[];
  gainers: number;
  losers: number;
  avgPcr: number;
  totalGex: number;
  dominantRegime: string;
  avgAlpha: number;
  snapshotTime: string;
  source?: 'global-report' | 'sector-snapshot' | 'app-live';
  reportTitle?: string;
  reportHeadline?: string;
  reportSummary?: string;
  dayOutlook?: string;
  newsDigest?: string[];
  briefingBullets?: string[];
  newsItems?: AppNewsDigestItem[];
  newsSentimentOverall?: string;
  riskNotes?: string[];
}

interface StockAiAnalysis {
  ko: string;
  en: string;
  ja: string;
}

type GlobalReportPayload = {
  meta?: Record<string, any>;
  items?: any[];
  hunters?: any[];
  sectors?: Record<string, any[]>;
  sectorSummaries?: Record<string, any>;
  sector_summary?: Record<string, any>;
  snapshots?: Record<string, any>;
  alphaGrid?: {
    fullUniverse?: any[];
    top3?: any[];
  };
  marketSentiment?: Record<string, any>;
  engine?: Record<string, any>;
  macro?: Record<string, any>;
  storageDebug?: Record<string, any>;
};

const REPORT_SECTOR_ALIASES: Record<string, string[]> = {
  m7: ['m7', 'M7', 'magnificent7', 'magnificent_7', 'mega_cap'],
  silicon_core: ['siliconCore', 'silicon_core', 'semis', 'semiconductors', 'chip', 'chips'],
  power_matrix: ['powerMatrix', 'power_matrix', 'energy', 'power', 'nuclear'],
  physical_ai: ['physicalAi', 'physical_ai', 'robotics', 'physicalAI'],
  bio_pulse: ['bioPulse', 'bio_pulse', 'biotech', 'healthcare', 'glp'],
  cyber_shield: ['cyberShield', 'cyber_shield', 'security', 'cyber'],
  orbit_defense: ['orbitDefense', 'orbit_defense', 'space', 'defense'],
  quantum_edge: ['quantumEdge', 'quantum_edge', 'quantum'],
  fintech_pulse: ['fintechPulse', 'fintech_pulse', 'fintech', 'finance'],
  cloud_fortress: ['cloudFortress', 'cloud_fortress', 'cloud', 'saas'],
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

function pickNumber(...values: Array<number | null | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
      return value;
    }
  }
  return undefined;
}

function pickFiniteNumber(...values: Array<number | string | null | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value.replace(/[$,%]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function pickText(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function mergeStockWithQuote(stock: KeyStockPremiumData, quote?: IntelQuote): KeyStockPremiumData {
  if (!quote) return stock;

  return {
    ...stock,
    grade: quote.grade || stock.grade,
    score: pickNumber(quote.alphaScore, stock.score) ?? stock.score,
    changePct: pickNumber(quote.changePct, stock.changePct) ?? stock.changePct,
    closePrice: pickNumber(quote.regularCloseToday, quote.price, quote.prevClose, stock.closePrice) ?? stock.closePrice,
    gex: pickNumber(quote.gex, stock.gex) ?? stock.gex,
    pcr: pickNumber(quote.pcr, stock.pcr) ?? stock.pcr,
    gammaRegime: quote.gammaRegime || stock.gammaRegime,
    maxPain: pickNumber(quote.maxPain, stock.maxPain) ?? stock.maxPain,
    callWall: pickNumber(quote.callWall, stock.callWall) ?? stock.callWall,
    putFloor: pickNumber(quote.putFloor, stock.putFloor) ?? stock.putFloor,
    rsi: pickNumber(quote.rsi, stock.rsi) ?? stock.rsi,
    rvol: pickNumber(quote.rvol, stock.rvol) ?? stock.rvol,
    sparkline: quote.sparkline?.length ? quote.sparkline : stock.sparkline,
    netPremium: pickNumber(quote.netPremium, stock.netPremium) ?? stock.netPremium,
    squeezeScore: pickNumber(quote.squeezeScore, stock.squeezeScore) ?? stock.squeezeScore,
    ivSkew: pickNumber(quote.ivSkew, stock.ivSkew) ?? stock.ivSkew,
    impliedMovePct: pickNumber(quote.impliedMovePct, stock.impliedMovePct) ?? stock.impliedMovePct,
    whaleIndex: pickNumber(quote.whaleIndex, stock.whaleIndex) ?? stock.whaleIndex,
    darkPoolPct: pickNumber(quote.darkPoolPct, stock.darkPoolPct) ?? stock.darkPoolPct,
  };
}

function hasStockQuoteDelta(prev: KeyStockPremiumData, next: KeyStockPremiumData): boolean {
  return (
    prev.grade !== next.grade ||
    prev.score !== next.score ||
    prev.changePct !== next.changePct ||
    prev.closePrice !== next.closePrice ||
    prev.gex !== next.gex ||
    prev.pcr !== next.pcr ||
    prev.gammaRegime !== next.gammaRegime ||
    prev.maxPain !== next.maxPain ||
    prev.callWall !== next.callWall ||
    prev.putFloor !== next.putFloor ||
    prev.rsi !== next.rsi ||
    prev.rvol !== next.rvol ||
    prev.netPremium !== next.netPremium ||
    prev.squeezeScore !== next.squeezeScore ||
    prev.ivSkew !== next.ivSkew ||
    prev.impliedMovePct !== next.impliedMovePct ||
    prev.whaleIndex !== next.whaleIndex ||
    prev.darkPoolPct !== next.darkPoolPct ||
    ((next.sparkline?.length || 0) > 0 && next.sparkline !== prev.sparkline)
  );
}

async function fetchSectorWatchlistBatch(sectorId: string, signal?: AbortSignal): Promise<any[] | null> {
  const sector = SECTOR_CONFIGS.find(item => item.id === sectorId);
  if (!sector?.stocks?.length) return null;

  const res = await fetch(`/api/watchlist/batch?mode=price-dp&tickers=${sector.stocks.join(',')}`, {
    cache: 'no-store',
    signal,
  });

  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : null;
}

function mergeReportWithBatchResults(report: SectorReportData, batchResults: any[]): SectorReportData {
  const batchMap = new Map<string, any>();
  batchResults.forEach((item: any) => {
    if (item?.ticker && !item.error) batchMap.set(item.ticker, item);
  });

  if (batchMap.size === 0) return report;

  let changed = false;
  const keyStocksData = report.keyStocksData.map(stock => {
    const batch = batchMap.get(stock.sym);
    if (!batch) return stock;

    const rt = batch.realtime || {};
    const alpha = batch.alphaSnapshot || {};
    const gex = pickNumber(rt.gex, stock.gex) ?? stock.gex;
    const merged: KeyStockPremiumData = {
      ...stock,
      grade: alpha.grade || stock.grade,
      score: pickNumber(alpha.score, stock.score) ?? stock.score,
      changePct: pickNumber(rt.changePct, stock.changePct) ?? stock.changePct,
      closePrice: pickNumber(rt.price, stock.closePrice) ?? stock.closePrice,
      gex,
      pcr: pickNumber(rt.pcr, stock.pcr) ?? stock.pcr,
      gammaRegime: gex && gex > 0 ? 'LONG' : gex && gex < 0 ? 'SHORT' : stock.gammaRegime,
      maxPain: pickNumber(rt.maxPain, stock.maxPain) ?? stock.maxPain,
      callWall: pickNumber(rt.callWall, stock.callWall) ?? stock.callWall,
      putFloor: pickNumber(rt.putFloor, stock.putFloor) ?? stock.putFloor,
      rsi: pickNumber(rt.rsi, stock.rsi) ?? stock.rsi,
      rvol: pickNumber(rt.relVol, rt.rvol, stock.rvol) ?? stock.rvol,
      sparkline: rt.sparkline?.length ? rt.sparkline : stock.sparkline,
      netPremium: pickNumber(rt.netPremium, stock.netPremium) ?? stock.netPremium,
      squeezeScore: pickNumber(rt.squeezeScore, stock.squeezeScore) ?? stock.squeezeScore,
      ivSkew: pickNumber(rt.ivSkew, stock.ivSkew) ?? stock.ivSkew,
      impliedMovePct: pickNumber(rt.impliedMovePct, stock.impliedMovePct) ?? stock.impliedMovePct,
      whaleIndex: pickNumber(rt.whaleIndex, stock.whaleIndex) ?? stock.whaleIndex,
      darkPoolPct: pickNumber(rt.darkPoolPct, stock.darkPoolPct) ?? stock.darkPoolPct,
    };

    if (hasStockQuoteDelta(stock, merged)) changed = true;
    return merged;
  });

  return changed ? { ...report, keyStocksData } : report;
}

const REPORT_SOURCE_PRIORITY: Record<NonNullable<SectorReportData['source']>, number> = {
  'app-live': 0,
  'sector-snapshot': 1,
  'global-report': 2,
};

function getReportPriority(report?: SectorReportData | null): number {
  return report?.source ? REPORT_SOURCE_PRIORITY[report.source] ?? 0 : 0;
}

function hasRichReportPayload(report?: SectorReportData | null): boolean {
  return Boolean(report && (
    report.reportHeadline ||
    report.reportSummary ||
    report.dayOutlook ||
    report.newsItems?.length ||
    report.newsDigest?.length ||
    report.briefingBullets?.length ||
    report.riskNotes?.length ||
    report.catalysts?.length ||
    report.bullets?.length
  ));
}

function countReportList(values?: unknown[]): number {
  return Array.isArray(values) ? values.length : 0;
}

function hasUsefulReportText(value?: string | null): boolean {
  const text = cleanReportText(value);
  return text.length >= 18;
}

function reportQualityScore(report?: SectorReportData | null): number {
  if (!report) return -1;

  let score = getReportPriority(report) * 1000;
  if (hasUsefulReportText(report.reportTitle)) score += 60;
  if (hasUsefulReportText(report.reportHeadline)) score += 90;
  if (hasUsefulReportText(report.reportSummary)) score += 160;
  if (hasUsefulReportText(report.dayOutlook)) score += 90;
  score += Math.min(countReportList(report.newsDigest), 8) * 55;
  score += Math.min(countReportList(report.newsItems), 8) * 40;
  score += Math.min(countReportList(report.briefingBullets), 8) * 24;
  score += Math.min(countReportList(report.riskNotes), 8) * 24;
  score += Math.min(countReportList(report.catalysts), 8) * 20;
  score += Math.min(countReportList(report.bullets), 8) * 16;
  score += Math.min(countReportList(report.keyStocksData), 10) * 5;
  return score;
}

function pickReportText(primary?: string | null, secondary?: string | null): string | undefined {
  if (hasUsefulReportText(primary)) return cleanReportText(primary);
  if (hasUsefulReportText(secondary)) return cleanReportText(secondary);
  return primary || secondary || undefined;
}

function pickReportList<T>(primary?: T[], secondary?: T[]): T[] | undefined {
  if (Array.isArray(primary) && primary.length) return primary;
  if (Array.isArray(secondary) && secondary.length) return secondary;
  return undefined;
}

function mergeSectorReportStable(
  existing: SectorReportData | undefined | null,
  incoming: SectorReportData
): SectorReportData {
  if (!existing) return incoming;

  const existingPriority = getReportPriority(existing);
  const incomingPriority = getReportPriority(incoming);
  const existingRich = hasRichReportPayload(existing);
  const incomingRich = hasRichReportPayload(incoming);
  const existingQuality = reportQualityScore(existing);
  const incomingQuality = reportQualityScore(incoming);
  const preferIncoming =
    (incomingPriority > existingPriority && incomingRich) ||
    (incomingPriority === existingPriority && incomingQuality >= existingQuality) ||
    (!existingRich && incomingRich);

  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;
  const keyStocksData =
    incoming.keyStocksData?.length && (incomingPriority >= existingPriority || !existing.keyStocksData?.length)
      ? incoming.keyStocksData
      : primary.keyStocksData?.length ? primary.keyStocksData : secondary.keyStocksData;

  return {
    ...secondary,
    ...primary,
    keyStocksData,
    newsItems: pickReportList(primary.newsItems, secondary.newsItems),
    newsDigest: pickReportList(primary.newsDigest, secondary.newsDigest),
    briefingBullets: pickReportList(primary.briefingBullets, secondary.briefingBullets),
    riskNotes: pickReportList(primary.riskNotes, secondary.riskNotes),
    catalysts: pickReportList(primary.catalysts, secondary.catalysts) || [],
    bullets: pickReportList(primary.bullets, secondary.bullets) || [],
    reportTitle: pickReportText(primary.reportTitle, secondary.reportTitle),
    reportHeadline: pickReportText(primary.reportHeadline, secondary.reportHeadline),
    reportSummary: pickReportText(primary.reportSummary, secondary.reportSummary),
    dayOutlook: pickReportText(primary.dayOutlook, secondary.dayOutlook),
    snapshotTime: primary.snapshotTime || secondary.snapshotTime,
    source: primary.source || secondary.source,
  };
}

function getReportTicker(item: any): string {
  return String(
    item?.ticker ||
    item?.symbol ||
    item?.sym ||
    item?.decisionSSOT?.ticker ||
    item?.evidence?.ticker ||
    ''
  ).toUpperCase();
}

function reportSectorMatches(item: any, sectorId: string, stockSet: Set<string>): boolean {
  const ticker = getReportTicker(item);
  if (ticker && stockSet.has(ticker)) return true;

  const aliases = REPORT_SECTOR_ALIASES[sectorId] || [sectorId];
  const joined = [
    item?.sector,
    item?.sectorId,
    item?.sectorKey,
    item?.theme,
    item?.category,
    item?.group,
    item?.decisionSSOT?.sector,
    item?.meta?.sector,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return aliases.some(alias => joined.includes(String(alias).toLowerCase()));
}

function collectGlobalReportItems(report: GlobalReportPayload | null, sectorId: string, stocks: string[]): any[] {
  if (!report) return [];

  const aliases = REPORT_SECTOR_ALIASES[sectorId] || [sectorId];
  const stockSet = new Set(stocks.map(stock => stock.toUpperCase()));
  const candidates: any[] = [];

  aliases.forEach(alias => {
    const sectorItems = report.sectors?.[alias];
    if (Array.isArray(sectorItems)) candidates.push(...sectorItems);
  });

  if (Array.isArray(report.items)) {
    candidates.push(...report.items.filter(item => reportSectorMatches(item, sectorId, stockSet)));
  }
  if (Array.isArray(report.hunters)) {
    candidates.push(...report.hunters.filter(item => reportSectorMatches(item, sectorId, stockSet)));
  }
  if (Array.isArray(report.alphaGrid?.fullUniverse)) {
    candidates.push(...report.alphaGrid.fullUniverse.filter(item => reportSectorMatches(item, sectorId, stockSet)));
  }
  if (Array.isArray(report.alphaGrid?.top3)) {
    candidates.push(...report.alphaGrid.top3.filter(item => reportSectorMatches(item, sectorId, stockSet)));
  }

  const byTicker = new Map<string, any>();
  candidates.forEach(item => {
    const ticker = getReportTicker(item);
    if (!ticker || byTicker.has(ticker)) return;
    byTicker.set(ticker, item);
  });

  return Array.from(byTicker.values());
}

function getGlobalSectorSummary(report: GlobalReportPayload | null, sectorId: string): any | null {
  if (!report) return null;
  const aliases = REPORT_SECTOR_ALIASES[sectorId] || [sectorId];
  const containers = [
    report.sectorSummaries,
    report.sector_summary,
    report.snapshots,
    report.sectors,
  ];

  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const key of [sectorId, ...aliases]) {
      const candidate = (container as Record<string, any>)[key];
      if (!candidate) continue;
      if (Array.isArray(candidate)) continue;
      return candidate.sector_summary || candidate.summary || candidate;
    }
  }

  return null;
}

function extractDigestTickers(value: string): string[] {
  const matches = value.match(/\b[A-Z][A-Z0-9.]{1,5}\b/g) || [];
  return Array.from(new Set(matches.filter(ticker => !['THE', 'AND', 'FOR', 'WITH', 'FROM'].includes(ticker)))).slice(0, 4);
}

function normalizeDigestLines(items: any): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => {
      if (typeof item === 'string') return cleanReportText(item);
      if (!item || typeof item !== 'object') return '';
      return cleanReportText(
        item.headline ||
        item.title ||
        item.summaryEN ||
        item.summary_en ||
        item.summary ||
        item.insightEN ||
        item.insight_en ||
        item.insight ||
        ''
      );
    })
    .filter(Boolean);
}

function normalizeNewsDigest(items: any): AppNewsDigestItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => ({
      headline: typeof item === 'string'
        ? cleanReportText(item)
        : String(item.headline || item.title || item.summaryEN || item.summary_en || item.summary || ''),
      summaryKR: typeof item === 'string' ? cleanReportText(item) : String(item.summaryKR || item.summary_kr || item.summaryKo || item.summary || item.headline || ''),
      summaryJP: typeof item === 'string' ? cleanReportText(item) : String(item.summaryJP || item.summary_jp || item.summaryJa || item.summary || item.headline || ''),
      insightKR: typeof item === 'string' ? '' : String(item.insightKR || item.insight_kr || item.insightKo || item.insight || ''),
      insightEN: typeof item === 'string' ? '' : String(item.insightEN || item.insight_en || item.insight || ''),
      insightJP: typeof item === 'string' ? '' : String(item.insightJP || item.insight_jp || item.insightJa || item.insight || ''),
      source: typeof item === 'string' ? 'Report' : String(item.source || 'Report'),
      sentiment: typeof item !== 'string' && (item.sentiment === 'positive' || item.sentiment === 'negative' || item.sentiment === 'neutral')
        ? item.sentiment
        : 'neutral',
      tickers: typeof item === 'string'
        ? extractDigestTickers(item)
        : Array.isArray(item.tickers) ? item.tickers.map((ticker: any) => String(ticker)).filter(Boolean) : extractDigestTickers(String(item.headline || item.title || item.summary || '')),
      publishedAt: typeof item === 'string' ? '' : item.publishedAt || item.published_at || item.time || '',
    }))
    .filter(item => item.headline || item.summaryKR || item.summaryJP || item.insightEN);
}

function cleanReportText(value: any): string {
  return String(value || '')
    .replace(/<mark>/g, '')
    .replace(/<\/mark>/g, '')
    .replace(/^[\s\u200b]*(?:[^\w가-힣ぁ-んァ-ン一-龯$+-]{1,3})\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLocalizedNewsTitle(news: AppNewsDigestItem, appLocale: AppLocale): string {
  if (appLocale === 'ko') return cleanReportText(news.summaryKR || news.headline || news.insightKR || '');
  if (appLocale === 'ja') return cleanReportText(news.summaryJP || news.headline || news.insightJP || '');
  return cleanReportText(news.headline || news.insightEN || news.summaryKR || news.summaryJP || '');
}

function getLocalizedNewsInsight(news: AppNewsDigestItem, appLocale: AppLocale): string {
  if (appLocale === 'ko') return cleanReportText(news.insightKR || news.insightEN || '');
  if (appLocale === 'ja') return cleanReportText(news.insightJP || news.insightEN || '');
  return cleanReportText(news.insightEN || news.insightKR || news.insightJP || '');
}

function getNewsAgeLabel(publishedAt?: string): string {
  if (!publishedAt) return '';
  const timestamp = new Date(publishedAt).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const hours = Math.max(1, Math.round((Date.now() - timestamp) / 3600000));
  return `${hours}h`;
}

function mapGlobalReportItemToStock(item: any): KeyStockPremiumData {
  const options = item?.evidence?.options || item?.options || item?.decisionSSOT?.options || {};
  const flow = item?.evidence?.flow || item?.flow || item?.decisionSSOT?.flow || {};
  const price = item?.evidence?.price || item?.priceData || item?.quote || {};
  const ssot = item?.decisionSSOT || {};
  const snapshot = ssot?.snapshotData || {};
  const v71 = item?.v71 || {};
  const ticker = getReportTicker(item);
  const gex = pickFiniteNumber(options.gex, options.netGex, item.gex, v71.gex, snapshot.gex);
  const alphaScore = pickFiniteNumber(
    item.alphaScore,
    item.contextScore,
    item.score,
    item.powerScore,
    v71.alphaScore,
    v71.contextScore,
    v71.score,
    ssot.contextScore
  );

  return {
    sym: ticker,
    grade: String(item.grade || item.contextGrade || item.qualityTier || v71.grade || (alphaScore && alphaScore >= 70 ? 'A' : alphaScore && alphaScore < 45 ? 'C' : 'B')),
    score: alphaScore ?? 50,
    changePct: pickFiniteNumber(price.changePct, price.changePercent, item.changePct, item.change_percent, v71.changePct) ?? 0,
    closePrice: pickFiniteNumber(price.last, price.price, price.close, item.price, item.closePrice, item.close_price, v71.price) ?? 0,
    gex: gex ?? 0,
    pcr: pickFiniteNumber(options.pcr, item.pcr, v71.pcr, snapshot.pcr) ?? 0,
    gammaRegime: String(options.gammaRegime || options.regime || item.gammaRegime || item.regime || v71.gammaRegime || (gex && gex < 0 ? 'SHORT' : gex && gex > 0 ? 'LONG' : 'NEUTRAL')),
    maxPain: pickFiniteNumber(options.maxPain, item.maxPain, item.max_pain, v71.maxPain) ?? 0,
    callWall: pickFiniteNumber(options.callWall, item.callWall, item.call_wall, v71.callWall) ?? 0,
    putFloor: pickFiniteNumber(options.putFloor, item.putFloor, item.put_floor, v71.putFloor) ?? 0,
    rsi: pickFiniteNumber(item.rsi, item.evidence?.technical?.rsi, v71.rsi, snapshot.rsi) ?? 0,
    rvol: pickFiniteNumber(item.rvol, item.relVol, item.evidence?.technical?.rvol, v71.rvol, snapshot.rvol) ?? 0,
    sparkline: Array.isArray(item.sparkline) ? item.sparkline : Array.isArray(price.sparkline) ? price.sparkline : [],
    analysisKr: pickText(
      item.analysisKr,
      item.analysis_kr,
      item.aiSummaryKr,
      item.aiSummary,
      item.summary,
      item.newsContext,
      item.context
    ) || '',
    netPremium: pickFiniteNumber(flow.netPremium, options.netPremium, item.netPremium, item.net_premium, v71.netPremium, snapshot.netPremium) ?? 0,
    squeezeScore: pickFiniteNumber(options.squeezeScore, item.squeezeScore, item.squeeze_score, v71.squeezeScore) ?? 0,
    ivSkew: pickFiniteNumber(options.ivSkew, item.ivSkew, item.iv_skew, v71.ivSkew) ?? 0,
    impliedMovePct: pickFiniteNumber(options.impliedMovePct, options.impliedMove, item.impliedMovePct, item.implied_move_pct, v71.impliedMovePct) ?? 0,
    whaleIndex: pickFiniteNumber(flow.whaleIndex, item.whaleIndex, item.whale_index, ssot.whaleIndex, v71.whaleIndex) ?? 0,
    darkPoolPct: pickFiniteNumber(flow.darkPoolPct, flow.offExPct, item.darkPoolPct, item.dark_pool_pct, snapshot.offExPct, v71.darkPoolPct) ?? 0,
  };
}

interface CrossSectorBrief {
  marketOverview: {
    tone: string;
    summary: { ko: string; en: string; ja: string };
    keyDrivers: { ko: string[]; en: string[]; ja: string[] };
  };
  sectorRotation: {
    winners: { sector: string; change: string; reason: { ko: string; en: string; ja: string } }[];
    losers: { sector: string; change: string; reason: { ko: string; en: string; ja: string } }[];
    rotationInsight: { ko: string; en: string; ja: string };
  };
  outlook: {
    bias: string;
    catalysts: { ko: string[]; en: string[]; ja: string[] };
    risks: { ko: string[]; en: string[]; ja: string[] };
    opportunities?: { ko: string[]; en: string[]; ja: string[] };
    keyLevels?: { label: string; value: string }[];
  };
  gammaOptions?: {
    totalGexLabel: string;
    avgPcr: number;
    regime: string;
    insight: { ko: string; en: string; ja: string };
  };
  newsImpact?: {
    items: {
      headline: { ko: string; en: string; ja: string };
      impact: { ko: string; en: string; ja: string };
      sentiment?: string;
      impactLevel?: string;
      impactChain?: { indicator: string; direction: string; label: { ko: string; en: string; ja: string } }[];
    }[];
  };
  edgeAlerts?: {
    type?: string;
    title: { ko: string; en: string; ja: string };
    detail: { ko: string; en: string; ja: string };
  }[];
}

function toCamelCase(id: string): string {
  return id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/* ═══════════════════════════════════════════════════════════
   PREMIUM HELPERS & LOGO RESOLVER
   ═══════════════════════════════════════════════════════════ */

// Module-level ticker set so report modules (impact chain, etc.) can decide
// whether a bare label is a real stock symbol before rendering a logo.
const KNOWN_TICKER_SET = new Set([
  'NVDA','AAPL','MSFT','TSLA','META','GOOGL','GOOG','AMZN','AMD','AVGO','MU','ARM','TSM','ASML',
  'CEG','VST','GEV','PWR','CCJ','SMR','SERV','SYM','ISRG','TER','PL','RKLB',
  'LLY','NVO','VRTX','REGN','VKTX','AMGN','CRWD','PANW','ZS','FTNT','NET','S',
  'LMT','RTX','NOC','PLTR','LDOS','AXON','IONQ','QBTS','RGTI','QUBT','WOLF','QTWO',
  'SQ','PYPL','AFRM','SOFI','COIN','HOOD','CRM','SNOW','DDOG','NOW','MDB','TEAM',
  'SPY','QQQ','IWM','DIA','VOO','VTI'
]);
const isKnownTicker = (s: string): boolean => /^[A-Z]{1,5}$/.test(s) && KNOWN_TICKER_SET.has(s);

function StockLogo({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const [error, setError] = useState(false);
  const showTickerFallback = error || ['SPCX'].includes(symbol);

  if (showTickerFallback) {
    return (
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 25%, rgba(34,211,238,0.20), rgba(15,23,42,0.98) 68%)',
        border: '1px solid rgba(34, 211, 238, 0.22)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e0f2fe',
        fontWeight: 800,
        fontSize: size <= 24 ? '7px' : '9px',
        fontFamily: 'var(--font-mono), monospace',
        flexShrink: 0,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 14px rgba(34,211,238,0.10)'
      }}>
        {symbol.length > 4 ? symbol.slice(0, 4) : symbol}
      </div>
    );
  }

  return (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 32% 24%, rgba(34, 211, 238, 0.18), rgba(8, 19, 36, 0.96) 54%, rgba(2, 6, 23, 0.98))',
      border: '1px solid rgba(34, 211, 238, 0.20)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: size <= 24 ? '3px' : '4px',
      overflow: 'hidden',
      flexShrink: 0,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 14px rgba(34,211,238,0.10)'
    }}>
      <img
        loading="lazy"
        src={`/api/logo/${symbol}`}
        alt={symbol}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: 'saturate(1.12) contrast(1.10) drop-shadow(0 0 2px rgba(226,232,240,0.55))'
        }}
        onError={() => setError(true)}
      />
    </div>
  );
}

function formatVerdictText(text: string) {
  if (!text) return null;
  
  const keywords = [
    'accumulation', 'distribution', 'accumulate', 'distribute', 'accumulating',
    'bullish', 'bearish', 'BULLISH', 'BEARISH', 'Bullish', 'Bearish',
    'Buy-the-dip', 'sell-the-rally', 'Buy-the-dip regime', 'buy-the-dip',
    'call walls', 'put floors', 'Call Wall', 'Put Floor', 'call wall', 'put floor',
    'gamma flip', 'gamma squeeze', 'Gamma', 'gamma', 'GEX', 'OPEX', 'VIX',
    'overbought', 'oversold', 'support', 'resistance', 'breakout', 'breakdown',
    'squeeze', 'momentum', 'consolidation', 'reversal',
    // Korean keywords
    '매집', '분산', '강세', '약세', '강세 편향', '약세 편향',
    '감마', '감마 스퀴즈', '감마 플립', '하방 지지', '돌파', '근접', '과매도', '과매수',
    '지지', '저항', '돌파', '브레이크아웃', '스퀴즈', '모멘텀', '리버설'
  ];

  // Known tickers for highlighting
  const KNOWN_TICKERS = new Set([
    'NVDA','AAPL','MSFT','TSLA','META','GOOGL','AMZN','AMD','AVGO','MU','ARM','TSM','ASML',
    'CEG','VST','GEV','PWR','CCJ','SMR','SERV','SYM','ISRG','TER','PL','RKLB',
    'LLY','NVO','VRTX','REGN','VKTX','AMGN','CRWD','PANW','ZS','FTNT','NET','S',
    'LMT','RTX','NOC','PLTR','LDOS','AXON','IONQ','QBTS','RGTI','QUBT','WOLF','QTWO',
    'SQ','PYPL','AFRM','SOFI','COIN','HOOD','CRM','SNOW','DDOG','NOW','MDB','TEAM',
    'SPY','QQQ','IWM','DIA','VOO','VTI'
  ]);
  
  const escapedKeywords = keywords.map(kw => kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  // Combined pattern: keywords OR uppercase tickers (2-5 chars preceded by word boundary or $)
  const tickerPattern = '\\$?\\b[A-Z]{2,5}\\b';
  const regex = new RegExp(`(${escapedKeywords.join('|')}|${tickerPattern})`, 'g');
  
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        const isKeyword = keywords.some(kw => kw.toLowerCase() === part.toLowerCase());
        const cleanTicker = part.replace(/^\$/, '');
        const isTicker = KNOWN_TICKERS.has(cleanTicker) && /^[\$]?[A-Z]{2,5}$/.test(part);
        
        if (isTicker) {
          return <strong key={i} style={{ color: '#22d3ee', fontWeight: 700 }}>{part}</strong>;
        }
        if (isKeyword) {
          return <strong key={i} style={{ color: '#ffffff', fontWeight: 700 }}>{part}</strong>;
        }
        return part;
      })}
    </>
  );
}

const LEADING_SYMBOL_RE = /^[\s\uFE0E\uFE0F\u200D\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/u;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCatalystSymbol(text: string, symbols: string[]) {
  const cleaned = text.replace(LEADING_SYMBOL_RE, '').trim();
  return [...symbols]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((symbol) => new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(cleaned));
}

function stripCatalystLead(text: string, symbol?: string) {
  let cleaned = text.replace(LEADING_SYMBOL_RE, '').trim();
  if (symbol) {
    cleaned = cleaned
      .replace(new RegExp(`^${escapeRegExp(symbol)}\\b\\s*[-:·–—]?\\s*`), '')
      .trim();
  }
  return cleaned;
}

const EARNINGS_APP_COPY: Record<AppLocale, {
  title: string;
  upcoming: string;
  thisWeek: string;
  nextWeek: string;
  later: string;
}> = {
  ko: {
    title: '실적 발표 캘린더',
    upcoming: '예정',
    thisWeek: '이번 주',
    nextWeek: '다음 주',
    later: '이후',
  },
  en: {
    title: 'EARNINGS CALENDAR',
    upcoming: 'UPCOMING',
    thisWeek: 'THIS WEEK',
    nextWeek: 'NEXT WEEK',
    later: 'LATER',
  },
  ja: {
    title: '決算カレンダー',
    upcoming: '予定',
    thisWeek: '今週',
    nextWeek: '来週',
    later: '以降',
  },
};

function formatEarningsDate(date: Date, appLocale: AppLocale) {
  if (appLocale === 'ko') {
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  }
  if (appLocale === 'ja') {
    return date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Sparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (!data || data.length < 2) {
    return (
      <svg width="60" height="18" style={{ opacity: 0.15 }}>
        <line x1="0" y1="9" x2="60" y2="9" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="2,2" />
      </svg>
    );
  }
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  
  const width = 60;
  const height = 18;
  const padding = 1.5;
  
  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - ((val - min) / range) * (height - padding * 2) - padding;
    return `${x},${y}`;
  }).join(' ');
  
  const strokeColor = isUp ? '#10b981' : '#ef4444';
  
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function ExpandedSparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (!data || data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  
  const width = 300;
  const height = 50;
  
  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return { x, y };
  });
  
  const pathData = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  const fillPathData = `${pathData} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  
  const strokeColor = isUp ? '#10b981' : '#ef4444';
  const gradId = `spark-grad-${isUp ? 'up' : 'down'}-${data.length}-${Math.round(min * 100)}-${Math.round(max * 100)}`;
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d={fillPathData}
        fill={`url(#${gradId})`}
      />
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatGex(val: number): string {
  if (val === 0 || !val) return '0.00';
  const absVal = Math.abs(val);
  const sign = val > 0 ? '+' : '-';
  if (absVal >= 1e9) {
    return `${sign}${(absVal / 1e9).toFixed(2)}B`;
  }
  if (absVal >= 1e6) {
    return `${sign}${(absVal / 1e6).toFixed(2)}M`;
  }
  if (absVal >= 1e3) {
    return `${sign}${(absVal / 1e3).toFixed(2)}K`;
  }
  return `${sign}${val.toFixed(2)}`;
}

function safeAverage(values: number[]): number {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatMoneyCompact(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '-';
  const sign = value > 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatPercentCompact(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatPlainPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '-';
  return `${value.toFixed(0)}%`;
}

type AppLocale = 'ko' | 'en' | 'ja';

const APP_INTEL_COPY: Record<AppLocale, {
  title: string;
  kicker: string;
  subtitle: string;
  sectorTab: string;
  reportTab: string;
  live: string;
  closed: string;
  offline: string;
  leaders: string;
  laggards: string;
  coverage: string;
  avgMove: string;
  engine: string;
  pulse: string;
  constituents: string;
  dataLabel: string;
  reportLoading: string;
}> = {
  ko: {
    title: '섹터 인텔리전스',
    kicker: 'INTEL',
    subtitle: 'AI 섹터 리포트 · 옵션/알파/수급 흐름 통합',
    sectorTab: '섹터',
    reportTab: '장마감 리포트',
    live: 'LIVE',
    closed: 'CLOSE',
    offline: 'OFFLINE',
    leaders: '강세 섹터',
    laggards: '약세 섹터',
    coverage: '커버리지',
    avgMove: '평균 변동',
    engine: '섹터 엔진',
    pulse: '감마 펄스',
    constituents: '주요 종목',
    dataLabel: '실시간 + 스냅샷',
    reportLoading: '리포트 로딩 중...',
  },
  en: {
    title: 'Sector Intelligence',
    kicker: 'INTEL',
    subtitle: 'AI sector reports · options, alpha and flow combined',
    sectorTab: 'Sector',
    reportTab: 'Closing Report',
    live: 'LIVE',
    closed: 'CLOSE',
    offline: 'OFFLINE',
    leaders: 'Leaders',
    laggards: 'Laggards',
    coverage: 'Coverage',
    avgMove: 'Avg Move',
    engine: 'Sector Engine',
    pulse: 'Gamma Pulse',
    constituents: 'Key Names',
    dataLabel: 'Live + Snapshot',
    reportLoading: 'Loading reports...',
  },
  ja: {
    title: 'セクターインテリジェンス',
    kicker: 'INTEL',
    subtitle: 'AIセクターレポート · オプション/アルファ/フロー統合',
    sectorTab: 'セクター',
    reportTab: '引け後レポート',
    live: 'LIVE',
    closed: 'CLOSE',
    offline: 'OFFLINE',
    leaders: '強いセクター',
    laggards: '弱いセクター',
    coverage: '対象銘柄',
    avgMove: '平均変動',
    engine: 'セクターエンジン',
    pulse: 'ガンマパルス',
    constituents: '主要銘柄',
    dataLabel: 'ライブ + スナップショット',
    reportLoading: 'レポートを読み込み中...',
  },
};

const SECTOR_APP_COPY: Record<AppLocale, Record<string, { name: string; desc: string; thesis: string }>> = {
  ko: {
    m7: { name: 'M7 테크', desc: '빅테크 7대 기업의 AI 패권 경쟁과 옵션 감마 흐름을 추적합니다.', thesis: 'AI 주도권과 대형주 수급의 중심축' },
    physical_ai: { name: '피지컬 AI', desc: '로봇, 자동화, 우주 인프라로 확장되는 물리 AI 테마입니다.', thesis: '현실 세계로 확장되는 AI 베타' },
    silicon_core: { name: '반도체 코어', desc: 'AI 학습과 추론을 지탱하는 칩, 장비, 메모리 생태계입니다.', thesis: 'AI 사이클의 핵심 공급망' },
    power_matrix: { name: '전력 매트릭스', desc: '데이터센터 전력, 원전, 전력망 인프라 흐름을 묶어 봅니다.', thesis: 'AI 인프라의 에너지 병목' },
    bio_pulse: { name: '바이오 펄스', desc: 'GLP-1, 유전자 치료, 대형 바이오 수급을 추적합니다.', thesis: '방어성과 성장성이 교차하는 헬스케어' },
    cyber_shield: { name: '사이버 쉴드', desc: 'AI 클라우드 시대의 보안 인프라와 기관 포지션을 봅니다.', thesis: '기업 AI 확산의 필수 방어막' },
    orbit_defense: { name: '우주 방산', desc: '위성, 방산, 저궤도 네트워크와 정부 지출 사이클입니다.', thesis: '정책과 우주 인프라의 장기 테마' },
    quantum_edge: { name: '퀀텀 엣지', desc: '고변동 양자 컴퓨팅 종목들의 모멘텀과 리스크를 추적합니다.', thesis: '초기 성장 테마의 변동성 프리미엄' },
    fintech_pulse: { name: '핀테크 펄스', desc: 'AI 신용평가, 브로커리지, 차세대 금융 플랫폼 흐름입니다.', thesis: '금리와 리스크 선호의 민감 섹터' },
    cloud_fortress: { name: '클라우드 포트리스', desc: 'SaaS, 데이터 레이크, 엔터프라이즈 AI 배포 인프라입니다.', thesis: '기업 AI 전환의 소프트웨어 레이어' },
  },
  en: {
    m7: { name: 'M7 Tech', desc: 'Tracks AI leadership and options gamma dynamics across mega-cap technology.', thesis: 'Core axis of AI leadership and mega-cap flow' },
    physical_ai: { name: 'Physical AI', desc: 'Robotics, automation and space infrastructure tied to real-world AI deployment.', thesis: 'AI beta extending into the physical world' },
    silicon_core: { name: 'Silicon Core', desc: 'Chips, equipment and memory ecosystem powering AI training and inference.', thesis: 'Critical supply chain of the AI cycle' },
    power_matrix: { name: 'Power Matrix', desc: 'Datacenter power, nuclear, grid and energy infrastructure flow.', thesis: 'Energy bottleneck behind AI infrastructure' },
    bio_pulse: { name: 'Bio Pulse', desc: 'GLP-1, gene therapy and large-cap biotech positioning.', thesis: 'Healthcare where defense meets growth' },
    cyber_shield: { name: 'Cyber Shield', desc: 'Security infrastructure and institutional positioning for the AI cloud era.', thesis: 'Required defense layer for enterprise AI' },
    orbit_defense: { name: 'Orbit Defense', desc: 'Satellites, defense, LEO networks and government spending cycles.', thesis: 'Long-cycle policy and space infrastructure theme' },
    quantum_edge: { name: 'Quantum Edge', desc: 'High-volatility quantum names, momentum and risk regime.', thesis: 'Volatility premium in an early growth theme' },
    fintech_pulse: { name: 'Fintech Pulse', desc: 'AI credit scoring, brokerage and next-generation financial platforms.', thesis: 'Rate and risk-appetite sensitive sector' },
    cloud_fortress: { name: 'Cloud Fortress', desc: 'SaaS, data lakes and enterprise AI deployment infrastructure.', thesis: 'Software layer of enterprise AI adoption' },
  },
  ja: {
    m7: { name: 'M7テック', desc: '大型テックのAI主導権とオプション・ガンマの流れを追跡します。', thesis: 'AI主導権と大型株フローの中心軸' },
    physical_ai: { name: 'フィジカルAI', desc: 'ロボティクス、自動化、宇宙インフラへ広がるAIテーマです。', thesis: '現実世界へ広がるAIベータ' },
    silicon_core: { name: 'シリコンコア', desc: 'AI学習と推論を支える半導体、装置、メモリの生態系です。', thesis: 'AIサイクルの中核サプライチェーン' },
    power_matrix: { name: 'パワーマトリクス', desc: 'データセンター電力、原子力、送電網インフラをまとめて見ます。', thesis: 'AIインフラの電力ボトルネック' },
    bio_pulse: { name: 'バイオパルス', desc: 'GLP-1、遺伝子治療、大型バイオの資金フローを追跡します。', thesis: '防御性と成長性が交差するヘルスケア' },
    cyber_shield: { name: 'サイバーシールド', desc: 'AIクラウド時代のセキュリティ基盤と機関ポジションを見ます。', thesis: '企業AI拡大に必要な防御レイヤー' },
    orbit_defense: { name: 'オービット防衛', desc: '衛星、防衛、低軌道ネットワークと政府支出サイクルです。', thesis: '政策と宇宙インフラの長期テーマ' },
    quantum_edge: { name: '量子エッジ', desc: '高ボラティリティの量子関連銘柄とリスクを追跡します。', thesis: '初期成長テーマのボラティリティプレミアム' },
    fintech_pulse: { name: 'フィンテックパルス', desc: 'AI信用評価、証券、次世代金融プラットフォームの流れです。', thesis: '金利とリスク選好に敏感なセクター' },
    cloud_fortress: { name: 'クラウド要塞', desc: 'SaaS、データレイク、企業AI展開インフラです。', thesis: '企業AI移行のソフトウェアレイヤー' },
  },
};

function toAppLocale(locale: string): AppLocale {
  return locale === 'ko' || locale === 'ja' ? locale : 'en';
}

const APP_COMPLIANCE_COPY: Record<AppLocale, {
  aiBadge: string;
  aiNote: string;
  footerNote: string;
}> = {
  ko: {
    aiBadge: '리서치 참고용',
    aiNote: 'AI 해석은 교육·리서치용 시장 데이터입니다. 매수·매도 권유가 아니며 정확성이나 수익을 보장하지 않습니다.',
    footerNote: '제공 정보는 투자 조언이 아니며, 모든 투자 판단과 책임은 사용자 본인에게 있습니다.',
  },
  en: {
    aiBadge: 'Research only',
    aiNote: 'AI interpretation is educational market-data research only. It is not investment advice or a buy/sell recommendation, and accuracy or returns are not guaranteed.',
    footerNote: 'Information is not investment advice. All investment decisions and responsibility remain with the user.',
  },
  ja: {
    aiBadge: 'リサーチ参考',
    aiNote: 'AI解釈は教育・リサーチ用の市場データです。投資助言や売買推奨ではなく、正確性や収益を保証しません。',
    footerNote: '提供情報は投資助言ではありません。すべての投資判断と責任は利用者ご自身にあります。',
  },
};

const COMMANDER_LOG_COPY: Record<AppLocale, Record<string, string>> = {
  ko: {
    m7: '감마 플립 부근의 누적 수급과 대형 기술주 흐름을 함께 관찰합니다.',
    silicon_core: '반도체 그룹은 모멘텀과 옵션 수급이 함께 강화되는지 확인합니다.',
    power_matrix: '금리와 변동성 제약 속에서 전력 인프라 흐름의 균형을 확인합니다.',
    physical_ai: '단기 모멘텀 약화와 주요 지지 구간의 반응을 함께 추적합니다.',
    bio_pulse: '바이오 수급 확장 여부와 촉매 이벤트의 지속성을 관찰합니다.',
    cyber_shield: '헤지 비율과 저항 구간 반응을 중심으로 보안 섹터 압력을 봅니다.',
    orbit_defense: '방산 예산과 우주 인프라 촉매가 섹터 흐름에 반영되는지 추적합니다.',
    quantum_edge: '고변동 구간에서 수급 집중과 리스크 확산을 함께 점검합니다.',
    fintech_pulse: '신용 리스크와 숏 볼륨이 핀테크 수급에 주는 압력을 관찰합니다.',
    cloud_fortress: 'SaaS 갱신 흐름과 AI 인프라 수요가 안정적으로 반영되는지 봅니다.',
  },
  en: {
    m7: 'Tracks gamma-flip support and mega-cap technology flow in one context.',
    silicon_core: 'Watches whether semiconductor momentum and options flow reinforce each other.',
    power_matrix: 'Checks power-infrastructure flow against rate and volatility constraints.',
    physical_ai: 'Monitors short-term momentum softness and reactions near key support zones.',
    bio_pulse: 'Observes whether biotech flow expansion persists around catalyst events.',
    cyber_shield: 'Reads security-sector pressure through hedge ratio and resistance response.',
    orbit_defense: 'Tracks whether defense budget and space-infrastructure catalysts enter flow.',
    quantum_edge: 'Checks flow concentration and risk spread in a high-volatility theme.',
    fintech_pulse: 'Observes credit-risk and short-volume pressure inside fintech flow.',
    cloud_fortress: 'Reads SaaS renewal stability and AI-infrastructure demand in context.',
  },
  ja: {
    m7: 'ガンマフリップ周辺の需給と大型テックの流れを同時に確認します。',
    silicon_core: '半導体のモメンタムとオプション需給が同時に強まるかを見ます。',
    power_matrix: '金利と変動性の制約下で電力インフラの流れを確認します。',
    physical_ai: '短期モメンタムの鈍化と主要サポート帯の反応を追跡します。',
    bio_pulse: 'バイオの需給拡大が材料イベント周辺で続くかを観察します。',
    cyber_shield: 'ヘッジ比率と抵抗帯の反応からセキュリティ株の圧力を読みます。',
    orbit_defense: '防衛予算と宇宙インフラ材料がフローに反映されるかを見ます。',
    quantum_edge: '高ボラティリティテーマ内の需給集中とリスク拡散を点検します。',
    fintech_pulse: '信用リスクとショート出来高がフィンテック需給に与える圧力を観察します。',
    cloud_fortress: 'SaaS更新の安定性とAIインフラ需要を文脈として読みます。',
  },
};

function getCommanderLogCopy(sectorId: string | null | undefined, appLocale: AppLocale, fallback?: string) {
  if (!sectorId) return fallback || 'Awaiting signal...';
  return COMMANDER_LOG_COPY[appLocale]?.[sectorId]
    || COMMANDER_LOG_COPY.en[sectorId]
    || fallback
    || 'Awaiting signal...';
}

function signedPct(value: number | null | undefined, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function getBriefTitle(appLocale: AppLocale) {
  if (appLocale === 'ko') return 'AI 해석 브리프';
  if (appLocale === 'ja') return 'AI解析ブリーフ';
  return 'AI ANALYTICAL BRIEF';
}

function getStockAnalyticalBrief(stock: KeyStockPremiumData, appLocale: AppLocale) {
  const sym = stock.sym;
  const price = `$${(stock.closePrice || 0).toFixed(2)}`;
  const change = signedPct(stock.changePct, 2);
  const gex = stock.gex || 0;
  const pcr = stock.pcr || 0;
  const rsi = stock.rsi || 0;
  const rvol = stock.rvol || 0;
  const whale = stock.whaleIndex || 0;
  const darkPool = stock.darkPoolPct || 0;
  const netPremium = stock.netPremium || 0;
  const squeeze = stock.squeezeScore || 0;
  const ivSkew = stock.ivSkew || 0;
  const impliedMove = stock.impliedMovePct || 0;
  const maxPain = stock.maxPain || 0;
  const callWall = stock.callWall || 0;
  const putFloor = stock.putFloor || 0;
  const regime = String(stock.gammaRegime || (gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : 'NEUTRAL')).toUpperCase();

  const pcrText = pcr > 0 ? pcr.toFixed(2) : '-';
  const rsiText = rsi > 0 ? Math.round(rsi).toString() : '-';
  const rvolText = rvol > 0 ? `${rvol.toFixed(1)}x` : '-';
  const whaleText = whale > 0 ? Math.round(whale).toString() : '-';
  const darkPoolText = darkPool > 0 ? `${Math.round(darkPool)}%` : '-';
  const netPremiumText = netPremium !== 0 ? formatMoneyCompact(netPremium) : '-';
  const squeezeText = squeeze > 0 ? `${Math.round(squeeze)}%` : '-';
  const ivText = ivSkew !== 0 ? signedPct(ivSkew, 1) : '-';
  const impliedMoveText = impliedMove > 0 ? `±${impliedMove.toFixed(1)}%` : '-';

  const gammaKR = regime === 'LONG'
    ? 'Long Gamma 구조라 단기 변동성은 흡수되는 쪽으로 해석됩니다'
    : regime === 'SHORT'
      ? 'Short Gamma 구조라 가격 변동이 확대될 수 있는 구간으로 관찰됩니다'
      : '감마가 중립권에 가까워 방향성보다 레벨 반응 확인이 우선입니다';
  const gammaEN = regime === 'LONG'
    ? 'Long Gamma points to a volatility-absorbing structure'
    : regime === 'SHORT'
      ? 'Short Gamma keeps the name in a volatility-amplification zone'
      : 'Gamma is near neutral, so level reaction matters more than direction';
  const gammaJA = regime === 'LONG'
    ? 'ロングガンマ構造で短期変動は吸収されやすい状態です'
    : regime === 'SHORT'
      ? 'ショートガンマ構造で値動きが拡大しやすい領域です'
      : 'ガンマは中立圏に近く、方向性よりもレベル反応の確認が重要です';

  const flowKR = netPremium > 0 || whale >= 65 || darkPool >= 45
    ? `순프리미엄 ${netPremiumText}, Whale ${whaleText}, 다크풀 ${darkPoolText}가 함께 관찰되어 수급 축은 비교적 선명합니다`
    : `순프리미엄 ${netPremiumText}, Whale ${whaleText}, 다크풀 ${darkPoolText} 기준으로 아직 수급 확신은 제한적입니다`;
  const flowEN = netPremium > 0 || whale >= 65 || darkPool >= 45
    ? `Net premium ${netPremiumText}, Whale ${whaleText}, and Dark Pool ${darkPoolText} show a clearer flow axis`
    : `Net premium ${netPremiumText}, Whale ${whaleText}, and Dark Pool ${darkPoolText} leave flow conviction limited`;
  const flowJA = netPremium > 0 || whale >= 65 || darkPool >= 45
    ? `ネットプレミアム${netPremiumText}、Whale ${whaleText}、Dark Pool ${darkPoolText}からフロー軸は比較的明確です`
    : `ネットプレミアム${netPremiumText}、Whale ${whaleText}、Dark Pool ${darkPoolText}ではフロー確度はまだ限定的です`;

  const levelKR = callWall > 0 && putFloor > 0
    ? `핵심 레벨은 풋플로어 $${putFloor.toFixed(0)}와 콜월 $${callWall.toFixed(0)}이며, 현재가 ${price}는 맥스페인 ${maxPain > 0 ? `$${maxPain.toFixed(0)}` : '-'} 대비 ${maxPain > 0 ? signedPct(((stock.closePrice || 0) - maxPain) / maxPain * 100, 1) : '-'} 위치입니다`
    : `레벨 데이터가 제한적이어서 가격 ${price}와 PCR ${pcrText} 중심으로 구조를 확인합니다`;
  const levelEN = callWall > 0 && putFloor > 0
    ? `Key levels are Put Floor $${putFloor.toFixed(0)} and Call Wall $${callWall.toFixed(0)}; ${price} sits ${maxPain > 0 ? signedPct(((stock.closePrice || 0) - maxPain) / maxPain * 100, 1) : '-'} versus Max Pain ${maxPain > 0 ? `$${maxPain.toFixed(0)}` : '-'}`
    : `Level data is limited, so the structure is read mainly through ${price} and PCR ${pcrText}`;
  const levelJA = callWall > 0 && putFloor > 0
    ? `主要レベルはPut Floor $${putFloor.toFixed(0)}、Call Wall $${callWall.toFixed(0)}で、現在値${price}はMax Pain ${maxPain > 0 ? `$${maxPain.toFixed(0)}` : '-'}比${maxPain > 0 ? signedPct(((stock.closePrice || 0) - maxPain) / maxPain * 100, 1) : '-'}です`
    : `レベル情報が限定的なため、${price}とPCR ${pcrText}を中心に構造を確認します`;

  if (appLocale === 'ja') {
    return `${sym}は${change}、RSI ${rsiText}、RVOL ${rvolText}で推移しています。${gammaJA}。${flowJA}。${levelJA}。Squeeze ${squeezeText}、IV Skew ${ivText}、Implied Move ${impliedMoveText}は、次の値幅変化を確認する補助シグナルです。`;
  }

  if (appLocale === 'ko') {
    return `${sym}는 ${change}, RSI ${rsiText}, RVOL ${rvolText} 흐름입니다. ${gammaKR}. ${flowKR}. ${levelKR}. Squeeze ${squeezeText}, IV Skew ${ivText}, Implied Move ${impliedMoveText}는 다음 변동성 확장 여부를 확인하는 보조 신호입니다.`;
  }

  return `${sym} is moving ${change} with RSI ${rsiText} and RVOL ${rvolText}. ${gammaEN}. ${flowEN}. ${levelEN}. Squeeze ${squeezeText}, IV Skew ${ivText}, and Implied Move ${impliedMoveText} act as secondary checks for the next volatility expansion.`;
}

export default function AppIntelPage() {
  const locale = useLocale();
  const t = useMemo(() => TRANSLATIONS[locale] || TRANSLATIONS.en, [locale]);
  const appLocale = toAppLocale(locale);
  const appCopy = APP_INTEL_COPY[appLocale];
  const complianceCopy = APP_COMPLIANCE_COPY[appLocale];

  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [reportData, setReportData] = useState<SectorReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [adCount, setAdCount] = useState(0);
  const [showAdModal, setShowAdModal] = useState(false);
  const [reportCache, setReportCache] = useState<Record<string, SectorReportData>>({});
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const [intelTab, setIntelTab] = useState<'sector' | 'report'>('sector');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [reportLoadingSector, setReportLoadingSector] = useState<string | null>(null);
  const [crossBrief, setCrossBrief] = useState<CrossSectorBrief | null>(null);
  const [crossMacro, setCrossMacro] = useState<{ key: string; value: number; changePct: number; category: string }[]>([]);
  const [vixTerm, setVixTerm] = useState<{ vix: number; vix3m: number; ratio: number; state: string } | null>(null);

  // Lock background scroll while the full-screen sector report modal is open.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!expandedReport) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [expandedReport]);
  const [globalReportLoading, setGlobalReportLoading] = useState(false);
  const [stockAiAnalyses, setStockAiAnalyses] = useState<Record<string, StockAiAnalysis>>({});
  const [stockAiLoading, setStockAiLoading] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['stocks']));
  const reportRequestRef = useRef(0);
  const stockAiRequestRef = useRef(0);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // Initialize shared data hook
  const sharedData = useIntelSharedDataForApp();
  const { status: marketStatus } = useMarketStatus();
  const isMarketLive = marketStatus.session === 'regular' || marketStatus.session === 'pre' || marketStatus.session === 'post';

  // Load ad counter from session storage to persist across navigation
  useEffect(() => {
    const savedCount = sessionStorage.getItem('intel_ad_count');
    if (savedCount) setAdCount(parseInt(savedCount));
  }, []);

  // Fetch Cross-Sector Brief for summary card
  useEffect(() => {
    let active = true;
    const fetchCrossBrief = async () => {
      try {
        const res = await fetch('/api/intel/cross-sector-brief');
        if (res.ok && active) {
          const data = await res.json();
          if (data.success && data.structured) {
            setCrossBrief(data.structured);
          } else if (data.success && data.marketOverview) {
            setCrossBrief(data as any);
          }
          if (data.success) {
            if (Array.isArray(data.macroIndicators)) setCrossMacro(data.macroIndicators);
            if (data.vixTermStructure) setVixTerm(data.vixTermStructure);
          }
        }
      } catch { /* silent */ }
    };
    fetchCrossBrief();
    return () => { active = false; };
  }, []);

  // Fetch Report Data
  const loadSectorReport = async (sectorId: string) => {
    const requestId = ++reportRequestRef.current;
    const cachedReport = reportCache[sectorId];
    const instantReport = cachedReport || buildSectorReportFromQuotes(sectorId);

    setReportData(instantReport);
    setReportCache(prev => prev[sectorId] ? prev : ({ ...prev, [sectorId]: instantReport }));
    setLoading(false);
    setReportLoadingSector(sectorId);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      // API call matching route: /api/intel/snapshot?sector={sectorId}
      const res = await fetch(`/api/intel/snapshot?sector=${sectorId}`, { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (data.success && data.snapshot) {
        const sectorCopy = SECTOR_APP_COPY[appLocale][sectorId] || SECTOR_APP_COPY.en[sectorId];
        const summary = data.snapshot.sector_summary || {};
        const briefing = summary.briefing || {};
        const rawNewsDigest =
          summary.newsDigest ||
          summary.news_digest ||
          data.snapshot.newsDigest ||
          data.snapshot.news_digest ||
          data.newsDigest;
        const newsItems = normalizeNewsDigest(rawNewsDigest);
        
        const sentiment = summary.outlook || data.snapshot.sentiment || 'NEUTRAL';
        
        const localizedHeadline = locale === 'ko'
          ? (briefing.headline || briefing.headlineEN || data.snapshot.verdict || '')
          : locale === 'ja'
            ? (briefing.headlineJP || briefing.headline || data.snapshot.verdict || '')
            : (briefing.headlineEN || briefing.headline || data.snapshot.verdict || '');

        const verdict = locale === 'ko'
          ? (summary.next_day_briefing_kr || briefing.headline || data.snapshot.verdict || 'No verdict available.')
          : locale === 'ja'
            ? (briefing.headlineJP || briefing.headline || data.snapshot.verdict || 'No verdict available.')
            : (briefing.headlineEN || briefing.headline || data.snapshot.verdict || 'No verdict available.');
            
        const catalysts = locale === 'ko'
          ? (briefing.watchpoints || data.snapshot.keyCatalysts || [])
          : locale === 'ja'
            ? (briefing.watchpointsJP || briefing.watchpoints || data.snapshot.keyCatalysts || [])
            : (briefing.watchpointsEN || briefing.watchpoints || data.snapshot.keyCatalysts || []);
        const bullets = locale === 'ko'
          ? (briefing.bullets || [])
          : locale === 'ja'
            ? (briefing.bulletsJP || briefing.bullets || [])
            : (briefing.bulletsEN || briefing.bullets || []);
        const reportTitle = appLocale === 'ko'
          ? `${sectorCopy.name} 섹터 장마감 리포트`
          : appLocale === 'ja'
            ? `${sectorCopy.name} セクター終値レポート`
            : `${sectorCopy.name} Sector Closing Report`;
        const reportHeadline = cleanReportText(localizedHeadline);
        const reportSummary = cleanReportText(verdict || bullets[0] || '');
        const dayOutlook = cleanReportText(catalysts[0] || bullets[1] || '');
        const briefingBullets = Array.isArray(bullets)
          ? bullets.map(cleanReportText).filter(Boolean)
          : [];
        const cleanCatalysts = Array.isArray(catalysts)
          ? catalysts.map(cleanReportText).filter(Boolean)
          : [];
        const sourceNewsDigestLines = normalizeDigestLines(rawNewsDigest);

        const newReport: SectorReportData = {
          sentiment,
          verdict,
          catalysts: cleanCatalysts,
          bullets: briefingBullets,
          gainers: summary.gainers ?? 0,
          losers: summary.losers ?? 0,
          avgPcr: summary.avg_pcr ?? 0,
          totalGex: summary.total_gex ?? 0,
          dominantRegime: summary.dominant_regime || 'NEUTRAL',
          avgAlpha: summary.avg_alpha ?? 0,
          snapshotTime: data.snapshot?.meta?.snapshot_timestamp || '',
          source: 'sector-snapshot',
          reportTitle,
          reportHeadline,
          reportSummary,
          dayOutlook,
          newsDigest: sourceNewsDigestLines.length ? sourceNewsDigestLines : briefingBullets,
          briefingBullets,
          newsItems,
          newsSentimentOverall: summary.newsSentimentOverall || summary.news_sentiment_overall,
          riskNotes: cleanCatalysts.slice(0, 3),
          keyStocksData: (data.snapshot.tickers || []).map((tick: any) => ({
            sym: tick.ticker,
            grade: tick.grade || 'B',
            score: tick.alpha_score || tick.score || 55,
            changePct: tick.change_pct || 0,
            closePrice: tick.close_price || tick.closePrice || 0,
            gex: tick.gex ?? 0,
            pcr: tick.pcr ?? 0,
            gammaRegime: tick.gamma_regime || tick.gammaRegime || 'NEUTRAL',
            maxPain: tick.max_pain || tick.maxPain || 0,
            callWall: tick.call_wall || tick.callWall || 0,
            putFloor: tick.put_floor || tick.putFloor || 0,
            rsi: tick.rsi ?? 0,
            rvol: tick.rvol ?? 0,
            sparkline: tick.sparkline || [],
            analysisKr: tick.analysis_kr || tick.analysisKr || '',
            netPremium: tick.net_premium ?? tick.netPremium ?? 0,
            squeezeScore: tick.squeeze_score ?? tick.squeezeScore ?? 0,
            ivSkew: tick.iv_skew ?? tick.ivSkew ?? 0,
            impliedMovePct: tick.implied_move_pct ?? tick.impliedMovePct ?? 0,
            whaleIndex: tick.whale_index ?? tick.whaleIndex ?? 0,
            darkPoolPct: tick.dark_pool_pct ?? tick.darkPoolPct ?? 0
          }))
        };

        if (requestId !== reportRequestRef.current) return;
        setReportData(prev => mergeSectorReportStable(prev || instantReport, newReport));
        setReportCache(prev => ({
          ...prev,
          [sectorId]: mergeSectorReportStable(prev[sectorId] || instantReport, newReport),
        }));
      } else {
        throw new Error();
      }
    } catch {
      if (requestId === reportRequestRef.current) {
        setReportData(prev => prev || instantReport);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === reportRequestRef.current) setLoading(false);
      setReportLoadingSector(current => current === sectorId ? null : current);
    }

    if (requestId !== reportRequestRef.current) return;

    const batchController = new AbortController();
    const batchTimeoutId = window.setTimeout(() => batchController.abort(), 15000);

    try {
      const batchResults = await fetchSectorWatchlistBatch(sectorId, batchController.signal);
      if (!batchResults?.length || requestId !== reportRequestRef.current) return;

      setReportData(prev => {
        const source = prev || instantReport;
        const enrichedReport = mergeReportWithBatchResults(source, batchResults);
        const nextReport = mergeSectorReportStable(source, enrichedReport);
        setReportCache(cache => ({
          ...cache,
          [sectorId]: mergeSectorReportStable(cache[sectorId], nextReport),
        }));
        return nextReport;
      });
    } catch {
      // Snapshot/fast data stays visible. Batch enrichment will retry on next open.
    } finally {
      window.clearTimeout(batchTimeoutId);
    }
  };

  useEffect(() => {
    if (!selectedSector || !reportData?.keyStocksData?.length) return;

    const stocksForAi = reportData.keyStocksData
      .filter(stock => (stock.closePrice || 0) > 0)
      .filter(stock => !stockAiAnalyses[stock.sym])
      .slice(0, 10);

    if (!stocksForAi.length) return;

    const requestId = ++stockAiRequestRef.current;
    const symbols = stocksForAi.map(stock => stock.sym);
    setStockAiLoading(prev => {
      const next = { ...prev };
      symbols.forEach(symbol => { next[symbol] = true; });
      return next;
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);

    fetch('/api/intel/perplexity-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        stocks: stocksForAi.map(stock => ({
          ticker: stock.sym,
          price: stock.closePrice || 0,
          changePct: stock.changePct || 0,
          gex: stock.gex || 0,
          pcr: stock.pcr || 0,
          gammaRegime: stock.gammaRegime || 'NEUTRAL',
          netPremium: stock.netPremium || 0,
          callWall: stock.callWall || 0,
          putFloor: stock.putFloor || 0,
          maxPain: stock.maxPain || 0,
          whaleIndex: stock.whaleIndex || 0,
          darkPoolPct: stock.darkPoolPct || 0,
          ivSkew: stock.ivSkew || 0,
          impliedMovePct: stock.impliedMovePct || 0,
          squeezeScore: stock.squeezeScore || 0,
          contextScore: stock.score || 0,
        })),
      }),
    })
      .then(res => res.ok ? res.json() : Promise.reject(new Error('intel-ai failed')))
      .then(data => {
        if (requestId !== stockAiRequestRef.current && selectedSector) return;
        const analyses = data?.analyses || {};
        if (analyses && typeof analyses === 'object') {
          setStockAiAnalyses(prev => ({ ...prev, ...analyses }));
        }
      })
      .catch(() => {
        // Keep the structural fallback visible if Bedrock/cache is unavailable.
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        setStockAiLoading(prev => {
          const next = { ...prev };
          symbols.forEach(symbol => { delete next[symbol]; });
          return next;
        });
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedSector, reportData, stockAiAnalyses]);

  // Trigger Interstitial Ad logic on report click
  const handleSectorClick = async (sectorId: string) => {
    const newCount = adCount + 1;
    setAdCount(newCount);
    sessionStorage.setItem('intel_ad_count', String(newCount));

    // Show Interstitial Ad every 3 clicks
    if (newCount % 3 === 0) {
      let adShown = false;
      try {
        const { adManager } = await import('@/services/adManager');
        adShown = await adManager.showInterstitial();
      } catch { /* not native */ }

      if (!adShown) {
        // Web fallback: show mockup modal
        setShowAdModal(true);
        setTimeout(() => {
          setShowAdModal(false);
          setSelectedSector(sectorId);
          setExpandedStock(null);
          loadSectorReport(sectorId);
        }, 2500);
        return;
      }
    }
    setSelectedSector(sectorId);
    setExpandedStock(null);
    loadSectorReport(sectorId);
  };

  const getSectorQuotes = useCallback((sectorId: string): IntelQuote[] => {
    switch (sectorId) {
      case 'm7': return sharedData.m7;
      case 'physical_ai': return sharedData.physicalAI;
      case 'silicon_core': return sharedData.siliconCore;
      case 'power_matrix': return sharedData.powerMatrix;
      case 'bio_pulse': return sharedData.bioPulse;
      case 'cyber_shield': return sharedData.cyberShield;
      case 'orbit_defense': return sharedData.orbitDefense;
      case 'quantum_edge': return sharedData.quantumEdge;
      case 'fintech_pulse': return sharedData.fintechPulse;
      case 'cloud_fortress': return sharedData.cloudFortress;
      default: return [];
    }
  }, [
    sharedData.m7,
    sharedData.physicalAI,
    sharedData.siliconCore,
    sharedData.powerMatrix,
    sharedData.bioPulse,
    sharedData.cyberShield,
    sharedData.orbitDefense,
    sharedData.quantumEdge,
    sharedData.fintechPulse,
    sharedData.cloudFortress,
  ]);

  const buildSectorReportFromGlobalReport = useCallback((report: GlobalReportPayload, sectorId: string): SectorReportData | null => {
    const sec = SECTOR_CONFIGS.find(s => s.id === sectorId);
    if (!sec) return null;

    const sectorCopy = SECTOR_APP_COPY[appLocale][sectorId] || SECTOR_APP_COPY.en[sectorId];
    const quoteMap = new Map(getSectorQuotes(sectorId).map(q => [q.ticker, q]));
    const reportItems = collectGlobalReportItems(report, sectorId, sec.stocks);
    const sectorSummary = getGlobalSectorSummary(report, sectorId);
    const reportBriefing = sectorSummary?.briefing || {};
    if (!reportItems.length) return null;

    const keyStocksData = reportItems
      .map(item => {
        const mapped = mapGlobalReportItemToStock(item);
        return mergeStockWithQuote(mapped, quoteMap.get(mapped.sym));
      })
      .filter(stock => stock.sym)
      .sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0);
      });

    if (!keyStocksData.length) return null;

    const gainers = keyStocksData.filter(stock => (stock.changePct || 0) >= 0).length;
    const losers = keyStocksData.filter(stock => (stock.changePct || 0) < 0).length;
    const avgPcr = safeAverage(keyStocksData.map(stock => stock.pcr || 0).filter(value => value > 0));
    const totalGex = keyStocksData.reduce((sum, stock) => sum + (stock.gex || 0), 0);
    const avgAlpha = safeAverage(keyStocksData.map(stock => stock.score || 0).filter(value => value > 0));
    const netPremium = keyStocksData.reduce((sum, stock) => sum + (stock.netPremium || 0), 0);
    const avgDarkPool = safeAverage(keyStocksData.map(stock => stock.darkPoolPct || 0).filter(value => value > 0));
    const avgWhale = safeAverage(keyStocksData.map(stock => stock.whaleIndex || 0).filter(value => value > 0));
    const avgSqueeze = safeAverage(keyStocksData.map(stock => stock.squeezeScore || 0).filter(value => value > 0));
    const gammaLong = keyStocksData.filter(stock => String(stock.gammaRegime || '').toUpperCase().includes('LONG')).length;
    const gammaShort = keyStocksData.filter(stock => String(stock.gammaRegime || '').toUpperCase().includes('SHORT')).length;
    const dominantRegime = gammaLong > gammaShort ? 'LONG' : gammaShort > gammaLong ? 'SHORT' : 'NEUTRAL';
    const lead = keyStocksData[0];

    const biasScore =
      (gainers - losers) +
      (netPremium > 0 ? 1 : netPremium < 0 ? -1 : 0) +
      (totalGex > 0 ? 1 : totalGex < 0 ? -1 : 0) +
      (avgPcr > 0 && avgPcr < 0.9 ? 1 : avgPcr > 1.15 ? -1 : 0);
    const sentiment = biasScore >= 2 ? 'BULLISH' : biasScore <= -2 ? 'BEARISH' : 'NEUTRAL';

    const localizedReportTitle = appLocale === 'ko'
      ? `${sectorCopy.name} 섹터 리포트`
      : appLocale === 'ja'
        ? `${sectorCopy.name} セクターレポート`
        : `${sectorCopy.name} Sector Report`;
    const localizedReportSummary = appLocale === 'ko'
      ? `${sectorCopy.name}는 ${lead.sym} 중심의 알파, 옵션 감마, 고래·다크풀 수급을 앱 화면에 맞게 압축한 섹터 리포트입니다.`
      : appLocale === 'ja'
        ? `${sectorCopy.name}は、${lead.sym}を中心にアルファ、オプションガンマ、ホエール・ダークプールのフローをアプリ向けに要約したセクターレポートです。`
        : `${sectorCopy.name} is a sector report compressed from ${lead.sym}-led alpha, options gamma, whale flow and dark-pool context.`;
    const localizedVerdict = appLocale === 'ko'
      ? `${localizedReportSummary} 현재 구도는 ${sentiment} 편향이며, ${dominantRegime} 감마, ${formatMoneyCompact(netPremium)} 순프리미엄, 평균 PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}가 핵심 확인 축입니다.`
      : appLocale === 'ja'
        ? `${localizedReportSummary} 現在の構図は${sentiment}バイアスで、${dominantRegime}ガンマ、${formatMoneyCompact(netPremium)}のネットプレミアム、平均PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}が主要な確認軸です。`
        : `${localizedReportSummary} Current bias is ${sentiment}; ${dominantRegime} gamma, ${formatMoneyCompact(netPremium)} net premium and average PCR ${avgPcr ? avgPcr.toFixed(2) : '-'} are the primary confirmation axes.`;
    const localizedCatalysts = appLocale === 'ko'
      ? [
        `주도 종목 ${lead.sym} / Context ${lead.score.toFixed(0)} / ${formatPercentCompact(lead.changePct || 0)}`,
        `섹터 GEX ${formatGex(totalGex)} / 감마 ${dominantRegime}`,
        `순프리미엄 ${formatMoneyCompact(netPremium)} / 평균 PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
        `고래 ${avgWhale ? Math.round(avgWhale) : '-'} / 다크풀 ${formatPlainPercent(avgDarkPool)} / 스퀴즈 ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
      ]
      : appLocale === 'ja'
        ? [
          `主導銘柄 ${lead.sym} / Context ${lead.score.toFixed(0)} / ${formatPercentCompact(lead.changePct || 0)}`,
          `セクターGEX ${formatGex(totalGex)} / ガンマ ${dominantRegime}`,
          `ネットプレミアム ${formatMoneyCompact(netPremium)} / 平均PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Dark Pool ${formatPlainPercent(avgDarkPool)} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ]
        : [
          `Lead ${lead.sym} / Context ${lead.score.toFixed(0)} / ${formatPercentCompact(lead.changePct || 0)}`,
          `Sector GEX ${formatGex(totalGex)} / Gamma ${dominantRegime}`,
          `Net Premium ${formatMoneyCompact(netPremium)} / Avg PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Dark Pool ${formatPlainPercent(avgDarkPool)} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ];
    const bullets = keyStocksData.slice(0, 5).map(stock => {
      const line = `${stock.sym} ${formatPercentCompact(stock.changePct || 0)} / Context ${stock.score.toFixed(0)} / GEX ${formatGex(stock.gex || 0)} / PCR ${stock.pcr ? stock.pcr.toFixed(2) : '-'}`;
      return stock.analysisKr ? `${line} - ${stock.analysisKr}` : line;
    });

    const topGainer = [...keyStocksData].sort((a, b) => (b.changePct || 0) - (a.changePct || 0))[0] || lead;
    const topLoser = [...keyStocksData].sort((a, b) => (a.changePct || 0) - (b.changePct || 0))[0] || lead;
    const avgPcrText = avgPcr ? avgPcr.toFixed(2) : '-';
    const whaleText = avgWhale ? String(Math.round(avgWhale)) : '-';
    const darkPoolText = avgDarkPool ? formatPlainPercent(avgDarkPool) : '-';
    const squeezeText = avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-';
    const leadMove = formatPercentCompact(lead.changePct || 0);
    const topGainerMove = formatPercentCompact(topGainer.changePct || 0);
    const topLoserMove = formatPercentCompact(topLoser.changePct || 0);
    const appReportTitle = appLocale === 'ko'
      ? `${sectorCopy.name} 섹터 장마감 리포트`
      : appLocale === 'ja'
        ? `${sectorCopy.name} セクター引け後レポート`
        : `${sectorCopy.name} Sector Closing Report`;
    const appReportSummary = appLocale === 'ko'
      ? `${sectorCopy.name}는 ${lead.sym} 중심의 컨텍스트, 옵션 감마, 고래·다크풀 수급을 함께 압축한 섹터 리포트입니다. 현재 구도는 ${sentiment} 편향이며 ${dominantRegime} 감마, 순프리미엄 ${formatMoneyCompact(netPremium)}, 평균 PCR ${avgPcrText}가 핵심 확인 축입니다.`
      : appLocale === 'ja'
        ? `${sectorCopy.name}は、${lead.sym}を中心にコンテキスト、オプション・ガンマ、ホエール/ダークプールのフローを圧縮したセクターレポートです。現在のバイアスは${sentiment}、ガンマは${dominantRegime}、ネットプレミアムは${formatMoneyCompact(netPremium)}、平均PCRは${avgPcrText}です。`
        : `${sectorCopy.name} compresses ${lead.sym}-led context, options gamma, whale flow and dark-pool activity into one sector report. Current bias is ${sentiment}; ${dominantRegime} gamma, ${formatMoneyCompact(netPremium)} net premium and ${avgPcrText} average PCR are the main confirmation axes.`;
    const appReportVerdict = appLocale === 'ko'
      ? `${lead.sym}가 섹터 기준점 역할을 하며 ${leadMove} 움직임과 Context ${lead.score.toFixed(0)}를 기록했습니다. ${topGainer.sym}는 ${topGainerMove}로 상대 강도를 보였고, ${topLoser.sym}는 ${topLoserMove}로 압력 구간을 형성했습니다.`
      : appLocale === 'ja'
        ? `${lead.sym}がセクターの基準点となり、${leadMove}、Context ${lead.score.toFixed(0)}を示しています。${topGainer.sym}は${topGainerMove}で相対的な強さ、${topLoser.sym}は${topLoserMove}で圧力ゾーンを形成しています。`
        : `${lead.sym} is the sector anchor with a ${leadMove} move and Context ${lead.score.toFixed(0)}. ${topGainer.sym} shows relative strength at ${topGainerMove}, while ${topLoser.sym} marks the pressure pocket at ${topLoserMove}.`;
    const appReportDayOutlook = appLocale === 'ko'
      ? `${gainers}개 상승 / ${losers}개 하락. ${dominantRegime} 감마와 평균 PCR ${avgPcrText}를 기준으로 다음 세션에서는 콜월·풋플로어 근처의 반응을 우선 확인해야 합니다.`
      : appLocale === 'ja'
        ? `${gainers}銘柄上昇 / ${losers}銘柄下落。${dominantRegime}ガンマと平均PCR ${avgPcrText}を基準に、次セッションではコールウォール/プットフロア付近の反応を優先確認します。`
        : `${gainers} up / ${losers} down. Watch next-session reaction near call-wall and put-floor zones against ${dominantRegime} gamma and ${avgPcrText} average PCR.`;
    const appReportCatalysts = [
      appLocale === 'ko' ? `섹터 GEX ${formatGex(totalGex)} / 감마 ${dominantRegime}` : appLocale === 'ja' ? `セクターGEX ${formatGex(totalGex)} / ガンマ ${dominantRegime}` : `Sector GEX ${formatGex(totalGex)} / Gamma ${dominantRegime}`,
      appLocale === 'ko' ? `순프리미엄 ${formatMoneyCompact(netPremium)} / 평균 PCR ${avgPcrText}` : appLocale === 'ja' ? `ネットプレミアム ${formatMoneyCompact(netPremium)} / 平均PCR ${avgPcrText}` : `Net premium ${formatMoneyCompact(netPremium)} / Avg PCR ${avgPcrText}`,
      appLocale === 'ko' ? `고래 ${whaleText} / 다크풀 ${darkPoolText} / 스퀴즈 ${squeezeText}` : appLocale === 'ja' ? `Whale ${whaleText} / Dark Pool ${darkPoolText} / Squeeze ${squeezeText}` : `Whale ${whaleText} / Dark Pool ${darkPoolText} / Squeeze ${squeezeText}`,
    ];
    const appNewsDigest = keyStocksData.slice(0, 5).map(stock => {
      const move = formatPercentCompact(stock.changePct || 0);
      const pcr = stock.pcr ? stock.pcr.toFixed(2) : '-';
      const gex = formatGex(stock.gex || 0);
      const wall = stock.callWall ? `CW $${stock.callWall.toFixed(0)}` : '';
      const floor = stock.putFloor ? `PF $${stock.putFloor.toFixed(0)}` : '';
      if (appLocale === 'ko') return `${stock.sym} ${move} / Context ${stock.score.toFixed(0)} / GEX ${gex} / PCR ${pcr}${wall || floor ? ` / ${[wall, floor].filter(Boolean).join(' ')}` : ''}`;
      if (appLocale === 'ja') return `${stock.sym} ${move} / Context ${stock.score.toFixed(0)} / GEX ${gex} / PCR ${pcr}${wall || floor ? ` / ${[wall, floor].filter(Boolean).join(' ')}` : ''}`;
      return `${stock.sym} ${move} / Context ${stock.score.toFixed(0)} / GEX ${gex} / PCR ${pcr}${wall || floor ? ` / ${[wall, floor].filter(Boolean).join(' ')}` : ''}`;
    });
    const appRiskNotes = [
      appLocale === 'ko'
        ? `${topLoser.sym} 약세와 ${formatGex(totalGex)} GEX 방향이 엇갈리면 리포트 편향은 빠르게 중립화될 수 있습니다.`
        : appLocale === 'ja'
          ? `${topLoser.sym}の弱さと${formatGex(totalGex)}のGEX方向が食い違う場合、レポートのバイアスは中立化しやすくなります。`
          : `If ${topLoser.sym} weakness conflicts with ${formatGex(totalGex)} sector GEX direction, the report bias can neutralize quickly.`,
      appLocale === 'ko'
        ? `다크풀 ${darkPoolText}, 고래 ${whaleText}, 스퀴즈 ${squeezeText}는 다음 세션에서 유동성 집중 구간을 재확인하는 보조 축입니다.`
        : appLocale === 'ja'
          ? `Dark Pool ${darkPoolText}、Whale ${whaleText}、Squeeze ${squeezeText}は、次セッションの流動性集中ゾーンを再確認する補助軸です。`
          : `Dark Pool ${darkPoolText}, Whale ${whaleText} and Squeeze ${squeezeText} are supporting axes for the next liquidity check.`,
    ];
    const reportRawNewsDigest = sectorSummary?.newsDigest || sectorSummary?.news_digest;
    const reportNewsItems = normalizeNewsDigest(reportRawNewsDigest);
    const reportNewsDigestLines = normalizeDigestLines(reportRawNewsDigest);
    const sourceReportHeadline = appLocale === 'ko'
      ? String(reportBriefing.headline || reportBriefing.headlineEN || '')
      : appLocale === 'ja'
        ? String(reportBriefing.headlineJP || reportBriefing.headline || '')
        : String(reportBriefing.headlineEN || reportBriefing.headline || '');
    const sourceReportSummary = appLocale === 'ko'
      ? String(sectorSummary?.next_day_briefing_kr || reportBriefing.headlineKR || reportBriefing.headline || '')
      : appLocale === 'ja'
        ? String(reportBriefing.headlineJP || reportBriefing.headline || '')
        : String(reportBriefing.headlineEN || reportBriefing.headline || '');
    const sourceDayOutlookSource = appLocale === 'ko'
      ? (reportBriefing.watchpoints || sectorSummary?.keyCatalysts || [])
      : appLocale === 'ja'
        ? (reportBriefing.watchpointsJP || reportBriefing.watchpoints || sectorSummary?.keyCatalysts || [])
        : (reportBriefing.watchpointsEN || reportBriefing.watchpoints || sectorSummary?.keyCatalysts || []);
    const sourceDayOutlook = String(Array.isArray(sourceDayOutlookSource) ? sourceDayOutlookSource[0] || '' : sourceDayOutlookSource || '');
    const sourceRiskNotesSource = appLocale === 'ko'
      ? (reportBriefing.watchpoints || sectorSummary?.keyCatalysts || [])
      : appLocale === 'ja'
        ? (reportBriefing.watchpointsJP || reportBriefing.watchpoints || sectorSummary?.keyCatalysts || [])
        : (reportBriefing.watchpointsEN || reportBriefing.watchpoints || sectorSummary?.keyCatalysts || []);
    const sourceRiskNotes = Array.isArray(sourceRiskNotesSource)
      ? sourceRiskNotesSource.map(String).filter(Boolean)
      : String(sourceRiskNotesSource || '').split('\n').map(line => line.trim()).filter(Boolean);
    const sourceBulletsSource = appLocale === 'ko'
      ? (reportBriefing.bullets || [])
      : appLocale === 'ja'
        ? (reportBriefing.bulletsJP || reportBriefing.bullets || [])
        : (reportBriefing.bulletsEN || reportBriefing.bullets || []);
    const sourceBriefingBullets = Array.isArray(sourceBulletsSource)
      ? sourceBulletsSource.map(cleanReportText).filter(Boolean)
      : [];

    return {
      sentiment,
      verdict: appReportVerdict,
      catalysts: appReportCatalysts,
      bullets: appNewsDigest,
      keyStocksData,
      gainers,
      losers,
      avgPcr,
      totalGex,
      dominantRegime,
      avgAlpha,
      snapshotTime: String(report.meta?.generatedAtET || report.meta?.generatedAt || report.storageDebug?.fetchedAt || ''),
      source: 'global-report',
      reportTitle: appReportTitle,
      reportHeadline: cleanReportText(sourceReportHeadline),
      reportSummary: cleanReportText(sourceReportSummary) || appReportSummary,
      dayOutlook: cleanReportText(sourceDayOutlook) || appReportDayOutlook,
      newsDigest: reportNewsDigestLines.length ? reportNewsDigestLines : sourceBriefingBullets.length ? sourceBriefingBullets : appNewsDigest,
      briefingBullets: sourceBriefingBullets,
      newsItems: reportNewsItems,
      newsSentimentOverall: sectorSummary?.newsSentimentOverall || sectorSummary?.news_sentiment_overall,
      riskNotes: sourceRiskNotes.length ? sourceRiskNotes.map(cleanReportText).filter(Boolean).slice(0, 3) : appRiskNotes,
    };
  }, [appLocale, getSectorQuotes]);

  const selectedQuoteSignature = useMemo(() => {
    if (!selectedSector) return '';
    return getSectorQuotes(selectedSector)
      .map(q => [
        q.ticker,
        q.alphaScore || 0,
        q.grade || '',
        q.changePct || 0,
        q.price || 0,
        q.gex || 0,
        q.pcr || 0,
        q.netPremium || 0,
        q.squeezeScore || 0,
        q.ivSkew || 0,
        q.impliedMovePct || 0,
        q.whaleIndex || 0,
        q.darkPoolPct || 0,
        q.callWall || 0,
        q.putFloor || 0,
        q.maxPain || 0,
      ].join(':'))
      .join('|');
  }, [selectedSector, getSectorQuotes]);

  useEffect(() => {
    if (!selectedSector || !reportData || !selectedQuoteSignature) return;

    const quoteMap = new Map(getSectorQuotes(selectedSector).map(q => [q.ticker, q]));
    if (quoteMap.size === 0) return;

    let changed = false;
    const keyStocksData = reportData.keyStocksData.map(stock => {
      const merged = mergeStockWithQuote(stock, quoteMap.get(stock.sym));
      if (hasStockQuoteDelta(stock, merged)) changed = true;
      return merged;
    });

    if (!changed) return;

    const nextReport = mergeSectorReportStable(reportData, {
      ...reportData,
      keyStocksData,
      snapshotTime: sharedData.fetchedAt || reportData.snapshotTime,
    });

    setReportData(nextReport);
    setReportCache(prev => ({
      ...prev,
      [selectedSector]: mergeSectorReportStable(prev[selectedSector], nextReport),
    }));
  }, [selectedSector, selectedQuoteSignature, reportData, sharedData.fetchedAt, getSectorQuotes]);

  const getSectorChange = (sectorId: string) => {
    const quotes = getSectorQuotes(sectorId);
    
    if (quotes && quotes.length > 0) {
      const validQuotes = quotes.filter(q => q.changePct !== undefined && q.changePct !== null);
      if (validQuotes.length > 0) {
        const sum = validQuotes.reduce((acc, q) => acc + q.changePct, 0);
        return sum / validQuotes.length;
      }
    }
    
    // Fallback exact mockup draft values
    const fallbacks: Record<string, number> = {
      m7: 0,
      physical_ai: 0,
      silicon_core: 0,
      power_matrix: 0,
      bio_pulse: 0,
      cyber_shield: 0,
      orbit_defense: 0,
      quantum_edge: 0,
      fintech_pulse: 0,
      cloud_fortress: 0,
    };
    return fallbacks[sectorId] ?? 0;
  };

  const buildSectorReportFromQuotes = (sectorId: string): SectorReportData => {
    const sec = SECTOR_CONFIGS.find(s => s.id === sectorId);
    const sectorCopy = SECTOR_APP_COPY[appLocale][sectorId] || SECTOR_APP_COPY.en[sectorId];
    const quotes = getSectorQuotes(sectorId);
    const alphaValues = quotes.map(q => q.alphaScore || 0).filter(v => v > 0);
    const avgAlpha = safeAverage(alphaValues);
    const gainers = quotes.filter(q => (q.changePct || 0) >= 0).length;
    const losers = quotes.filter(q => (q.changePct || 0) < 0).length;
    const avgPcr = safeAverage(quotes.map(q => q.pcr || 0).filter(v => v > 0));
    const totalGex = quotes.reduce((sum, q) => sum + (q.gex || 0), 0);
    const netPremium = quotes.reduce((sum, q) => sum + (q.netPremium || 0), 0);
    const avgDarkPool = safeAverage(quotes.map(q => q.darkPoolPct || 0).filter(v => v > 0));
    const avgWhale = safeAverage(quotes.map(q => q.whaleIndex || 0).filter(v => v > 0));
    const avgSqueeze = safeAverage(quotes.map(q => q.squeezeScore || 0).filter(v => v > 0));
    const gammaLong = quotes.filter(q => String(q.gammaRegime || '').toUpperCase().includes('LONG')).length;
    const gammaShort = quotes.filter(q => String(q.gammaRegime || '').toUpperCase().includes('SHORT')).length;
    const dominantRegime = gammaLong > gammaShort ? 'LONG' : gammaShort > gammaLong ? 'SHORT' : 'NEUTRAL';
    const topStock = [...quotes].sort((a, b) => {
      const alphaDiff = (b.alphaScore || 0) - (a.alphaScore || 0);
      if (alphaDiff !== 0) return alphaDiff;
      return Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0);
    })[0];

    const biasScore =
      (gainers - losers) +
      (netPremium > 0 ? 1 : netPremium < 0 ? -1 : 0) +
      (totalGex > 0 ? 1 : totalGex < 0 ? -1 : 0) +
      (avgPcr > 0 && avgPcr < 0.9 ? 1 : avgPcr > 1.15 ? -1 : 0);
    const sentiment = biasScore >= 2 ? 'BULLISH' : biasScore <= -2 ? 'BEARISH' : 'NEUTRAL';

    const localeText = {
      ko: {
        verdict: `${sectorCopy.name}는 ${topStock?.ticker || '주요 종목'} 중심으로 옵션/알파/수급 데이터가 먼저 정렬됩니다. 상세 스냅샷이 늦어져도 현재 앱 데이터 기준의 섹터 맥락을 즉시 보여줍니다.`,
        catalysts: [
          `선도 종목 ${topStock?.ticker || '-'} / Alpha ${topStock?.alphaScore || '-'}`,
          `GEX ${formatGex(totalGex)} / PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Net Premium ${formatMoneyCompact(netPremium)} / Dark Pool ${formatPlainPercent(avgDarkPool)}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ],
        fallbackAnalysis: `${sectorCopy.thesis}. 실시간 스냅샷 보강 전까지 앱에 들어온 가격, 알파, 옵션 데이터를 기준으로 표시합니다.`
      },
      en: {
        verdict: `${sectorCopy.name} is organized from live app-held options, alpha and flow data, led by ${topStock?.ticker || 'key names'}. The sector context opens immediately while the full snapshot refreshes in the background.`,
        catalysts: [
          `Lead ${topStock?.ticker || '-'} / Alpha ${topStock?.alphaScore || '-'}`,
          `GEX ${formatGex(totalGex)} / PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Net Premium ${formatMoneyCompact(netPremium)} / Dark Pool ${formatPlainPercent(avgDarkPool)}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ],
        fallbackAnalysis: `${sectorCopy.thesis}. Until the full snapshot arrives, this view uses the app's current price, alpha and options feed.`
      },
      ja: {
        verdict: `${sectorCopy.name}は${topStock?.ticker || '主要銘柄'}を中心に、アプリ内のオプション、アルファ、フローデータから即時に構成されます。詳細スナップショットはバックグラウンドで更新されます。`,
        catalysts: [
          `主導 ${topStock?.ticker || '-'} / Alpha ${topStock?.alphaScore || '-'}`,
          `GEX ${formatGex(totalGex)} / PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Net Premium ${formatMoneyCompact(netPremium)} / Dark Pool ${formatPlainPercent(avgDarkPool)}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ],
        fallbackAnalysis: `${sectorCopy.thesis}。詳細スナップショット取得前は、アプリに入っている価格、アルファ、オプションデータを基準に表示します。`
      }
    }[appLocale];

    const safeLocaleText = {
      ko: {
        verdict: `${sectorCopy.name}는 ${topStock?.ticker || '주요 종목'} 중심으로 옵션 감마, 알파, 수급 데이터가 먼저 정렬된 섹터 뷰입니다. 전체 웹 리포트가 갱신되기 전에도 현재 앱 데이터 기준의 방향성과 리스크 축을 즉시 보여줍니다.`,
        catalysts: [
          `주도 종목 ${topStock?.ticker || '-'} / Alpha ${topStock?.alphaScore || '-'}`,
          `GEX ${formatGex(totalGex)} / PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Net Premium ${formatMoneyCompact(netPremium)} / Dark Pool ${formatPlainPercent(avgDarkPool)}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ],
        fallbackAnalysis: `${sectorCopy.thesis}. 전체 리포트가 도착하기 전까지 현재 가격, 알파, 옵션 수급 피드를 기준으로 섹터 맥락을 표시합니다.`
      },
      en: {
        verdict: `${sectorCopy.name} is organized from live app-held options, alpha and flow data, led by ${topStock?.ticker || 'key names'}. The sector context opens immediately while the full snapshot refreshes in the background.`,
        catalysts: [
          `Lead ${topStock?.ticker || '-'} / Alpha ${topStock?.alphaScore || '-'}`,
          `GEX ${formatGex(totalGex)} / PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Net Premium ${formatMoneyCompact(netPremium)} / Dark Pool ${formatPlainPercent(avgDarkPool)}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ],
        fallbackAnalysis: `${sectorCopy.thesis}. Until the full snapshot arrives, this view uses the app's current price, alpha and options feed.`
      },
      ja: {
        verdict: `${sectorCopy.name}は、${topStock?.ticker || '主要銘柄'}を中心にオプションガンマ、アルファ、資金フローを先に整理したセクタービューです。完全なWebレポートが更新される前でも、現在のアプリデータに基づく方向感とリスク軸を表示します。`,
        catalysts: [
          `主導銘柄 ${topStock?.ticker || '-'} / Alpha ${topStock?.alphaScore || '-'}`,
          `GEX ${formatGex(totalGex)} / PCR ${avgPcr ? avgPcr.toFixed(2) : '-'}`,
          `Net Premium ${formatMoneyCompact(netPremium)} / Dark Pool ${formatPlainPercent(avgDarkPool)}`,
          `Whale ${avgWhale ? Math.round(avgWhale) : '-'} / Squeeze ${avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-'}`
        ],
        fallbackAnalysis: `${sectorCopy.thesis}。完全なレポートが届くまでは、現在価格、アルファ、オプションフローを基準にセクターの文脈を表示します。`
      }
    }[appLocale];

    const keyStocksData: KeyStockPremiumData[] = quotes.length
      ? quotes.map(q => ({
        sym: q.ticker,
        grade: q.grade || ((q.alphaScore || 0) >= 75 ? 'A' : (q.alphaScore || 0) >= 55 ? 'B' : 'C'),
        score: q.alphaScore || 50,
        changePct: q.changePct || 0,
        closePrice: q.regularCloseToday || q.price || q.prevClose || 0,
        gex: q.gex || 0,
        pcr: q.pcr || 0,
        gammaRegime: q.gammaRegime || 'NEUTRAL',
        maxPain: q.maxPain || 0,
        callWall: q.callWall || 0,
        putFloor: q.putFloor || 0,
        rsi: q.rsi || 0,
        rvol: q.rvol || 0,
        sparkline: q.sparkline || [],
        analysisKr: safeLocaleText.fallbackAnalysis,
        netPremium: q.netPremium || 0,
        squeezeScore: q.squeezeScore || 0,
        ivSkew: q.ivSkew || 0,
        impliedMovePct: q.impliedMovePct || 0,
        whaleIndex: q.whaleIndex || 0,
        darkPoolPct: q.darkPoolPct || 0
      }))
      : (sec?.stocks || []).map(sym => ({
        sym,
        grade: 'B',
        score: 50,
        analysisKr: safeLocaleText.fallbackAnalysis
      }));

    const fallbackLead = keyStocksData[0];
    const fallbackTopGainer = [...keyStocksData].sort((a, b) => (b.changePct || 0) - (a.changePct || 0))[0] || fallbackLead;
    const fallbackTopLoser = [...keyStocksData].sort((a, b) => (a.changePct || 0) - (b.changePct || 0))[0] || fallbackLead;
    const fallbackAvgPcrText = avgPcr ? avgPcr.toFixed(2) : '-';
    const fallbackDarkPoolText = avgDarkPool ? formatPlainPercent(avgDarkPool) : '-';
    const fallbackWhaleText = avgWhale ? String(Math.round(avgWhale)) : '-';
    const fallbackSqueezeText = avgSqueeze ? `${Math.round(avgSqueeze)}%` : '-';
    const fallbackTitle = appLocale === 'ko'
      ? `${sectorCopy.name} 섹터 장마감 리포트`
      : appLocale === 'ja'
        ? `${sectorCopy.name} セクター引け後レポート`
        : `${sectorCopy.name} Sector Closing Report`;
    const fallbackSummary = appLocale === 'ko'
      ? `${sectorCopy.name}는 현재 앱에 들어온 알파, 옵션 감마, 고래·다크풀 수급을 기준으로 압축한 섹터 리포트입니다. 전체 웹 리포트가 갱신되기 전에도 핵심 방향과 리스크 축을 먼저 확인할 수 있습니다.`
      : appLocale === 'ja'
        ? `${sectorCopy.name}は、現在アプリに入っているアルファ、オプション・ガンマ、ホエール/ダークプールのフローを基準に圧縮したセクターレポートです。完全なWebレポート更新前でも、主要な方向性とリスク軸を確認できます。`
        : `${sectorCopy.name} is compressed from the app's current alpha, options gamma, whale and dark-pool flow. It keeps the sector bias and risk axes visible while the full web report refreshes.`;
    const fallbackVerdict = appLocale === 'ko'
      ? `${fallbackLead?.sym || sectorCopy.name}가 중심 관찰 축입니다. ${gainers}개 상승, ${losers}개 하락이며 ${dominantRegime} 감마와 평균 PCR ${fallbackAvgPcrText}를 기준으로 다음 세션의 반응을 확인해야 합니다.`
      : appLocale === 'ja'
        ? `${fallbackLead?.sym || sectorCopy.name}が中心観察軸です。上昇${gainers}銘柄、下落${losers}銘柄で、${dominantRegime}ガンマと平均PCR ${fallbackAvgPcrText}を基準に次セッションの反応を確認します。`
        : `${fallbackLead?.sym || sectorCopy.name} is the primary watch point. ${gainers} names are up, ${losers} are down; next-session reaction should be checked against ${dominantRegime} gamma and ${fallbackAvgPcrText} average PCR.`;
    const fallbackDayOutlook = appLocale === 'ko'
      ? `${fallbackTopGainer?.sym || '-'} 상대강도와 ${fallbackTopLoser?.sym || '-'} 압력 구간을 함께 보면서, 섹터 GEX ${formatGex(totalGex)}가 가격 반응을 흡수하는지 확대하는지 확인합니다.`
      : appLocale === 'ja'
        ? `${fallbackTopGainer?.sym || '-'}の相対的な強さと${fallbackTopLoser?.sym || '-'}の圧力帯を見ながら、セクターGEX ${formatGex(totalGex)}が価格反応を吸収するか拡大するか確認します。`
        : `Track ${fallbackTopGainer?.sym || '-'} relative strength against ${fallbackTopLoser?.sym || '-'} pressure, then verify whether sector GEX ${formatGex(totalGex)} absorbs or amplifies price reaction.`;
    const fallbackDigest = keyStocksData.slice(0, 5).map(stock => {
      const move = formatPercentCompact(stock.changePct || 0);
      const pcr = stock.pcr ? stock.pcr.toFixed(2) : '-';
      const gex = formatGex(stock.gex || 0);
      return `${stock.sym} ${move} / Context ${stock.score.toFixed(0)} / GEX ${gex} / PCR ${pcr}`;
    });
    const fallbackRisks = [
      appLocale === 'ko'
        ? `순프리미엄 ${formatMoneyCompact(netPremium)}, 다크풀 ${fallbackDarkPoolText}, 고래 ${fallbackWhaleText}가 서로 엇갈리면 리포트 편향은 중립화될 수 있습니다.`
        : appLocale === 'ja'
          ? `ネットプレミアム ${formatMoneyCompact(netPremium)}、Dark Pool ${fallbackDarkPoolText}、Whale ${fallbackWhaleText}が食い違う場合、レポートのバイアスは中立化する可能性があります。`
          : `If ${formatMoneyCompact(netPremium)} net premium, ${fallbackDarkPoolText} dark-pool activity and Whale ${fallbackWhaleText} diverge, the report bias can neutralize.`,
      appLocale === 'ko'
        ? `스퀴즈 ${fallbackSqueezeText}는 변동성 확장 여부를 보는 보조 축입니다. 가격 레벨과 체결 강도 확인이 필요합니다.`
        : appLocale === 'ja'
          ? `Squeeze ${fallbackSqueezeText}はボラティリティ拡大を確認する補助軸です。価格レベルと約定強度の確認が必要です。`
          : `Squeeze ${fallbackSqueezeText} is a supporting axis for volatility expansion; confirm price levels and execution intensity.`,
    ];

    const safeFallbackTitle = appLocale === 'ko'
      ? `${sectorCopy.name} 섹터 장마감 리포트`
      : appLocale === 'ja'
        ? `${sectorCopy.name} セクター引け後レポート`
        : `${sectorCopy.name} Sector Closing Report`;
    const safeFallbackSummary = safeLocaleText.verdict;
    const safeFallbackVerdict = appLocale === 'ko'
      ? `${fallbackLead?.sym || sectorCopy.name}가 핵심 관찰축입니다. ${gainers}개 종목 상승, ${losers}개 종목 하락이며 ${dominantRegime} 감마와 평균 PCR ${fallbackAvgPcrText}를 기준으로 다음 세션 반응을 확인해야 합니다.`
      : appLocale === 'ja'
        ? `${fallbackLead?.sym || sectorCopy.name}が主要な観察軸です。上昇${gainers}銘柄、下落${losers}銘柄で、${dominantRegime}ガンマと平均PCR ${fallbackAvgPcrText}を基準に次のセッション反応を確認します。`
        : `${fallbackLead?.sym || sectorCopy.name} is the primary watch point. ${gainers} names are up, ${losers} are down; next-session reaction should be checked against ${dominantRegime} gamma and ${fallbackAvgPcrText} average PCR.`;
    const safeFallbackDayOutlook = appLocale === 'ko'
      ? `${fallbackTopGainer?.sym || '-'} 상대 강도와 ${fallbackTopLoser?.sym || '-'} 압력 구간을 함께 보면서 섹터 GEX ${formatGex(totalGex)}가 가격 반응을 흡수하는지 확대하는지 확인합니다.`
      : appLocale === 'ja'
        ? `${fallbackTopGainer?.sym || '-'}の相対的な強さと${fallbackTopLoser?.sym || '-'}の圧力帯を合わせて見ながら、セクターGEX ${formatGex(totalGex)}が価格反応を吸収するか拡大するかを確認します。`
        : `Track ${fallbackTopGainer?.sym || '-'} relative strength against ${fallbackTopLoser?.sym || '-'} pressure, then verify whether sector GEX ${formatGex(totalGex)} absorbs or amplifies price reaction.`;
    const safeFallbackRisks = [
      appLocale === 'ko'
        ? `순프리미엄 ${formatMoneyCompact(netPremium)}, 다크풀 ${fallbackDarkPoolText}, 고래 ${fallbackWhaleText}가 서로 엇갈리면 리포트 편향은 빠르게 중립화될 수 있습니다.`
        : appLocale === 'ja'
          ? `ネットプレミアム${formatMoneyCompact(netPremium)}、ダークプール${fallbackDarkPoolText}、Whale ${fallbackWhaleText}が互いに乖離すると、レポートのバイアスは中立化しやすくなります。`
          : `If ${formatMoneyCompact(netPremium)} net premium, ${fallbackDarkPoolText} dark-pool activity and Whale ${fallbackWhaleText} diverge, the report bias can neutralize.`,
      appLocale === 'ko'
        ? `스퀴즈 ${fallbackSqueezeText}는 변동성 확장 여부를 보는 보조 축입니다. 가격 레벨과 체결 강도 확인이 필요합니다.`
        : appLocale === 'ja'
          ? `Squeeze ${fallbackSqueezeText}はボラティリティ拡大を確認する補助軸です。価格水準と約定強度の確認が必要です。`
          : `Squeeze ${fallbackSqueezeText} is a supporting axis for volatility expansion; confirm price levels and execution intensity.`,
    ];

    return {
      sentiment,
      verdict: safeFallbackVerdict,
      catalysts: safeLocaleText.catalysts,
      bullets: fallbackDigest,
      keyStocksData,
      gainers,
      losers,
      avgPcr,
      totalGex,
      dominantRegime,
      avgAlpha,
      snapshotTime: sharedData.fetchedAt || '',
      source: 'app-live',
      reportTitle: safeFallbackTitle,
      reportSummary: safeFallbackSummary,
      dayOutlook: safeFallbackDayOutlook,
      newsDigest: fallbackDigest,
      riskNotes: safeFallbackRisks,
    };
  };

  // [UNIFIED SOURCE] All 10 sector closing reports come from the same per-sector
  // post-market snapshot endpoint the web uses (/api/intel/snapshot?sector=X).
  // Every sector is generated fresh (~5-min stagger), so there is no reason for the
  // app to fall back to the stale 2-sector type=global report. Pure builder shared
  // shape with loadSectorReport's snapshot mapping.
  const buildSnapshotReport = useCallback((data: any, sectorId: string): SectorReportData | null => {
    if (!data?.success || !data?.snapshot) return null;
    const sectorCopy = SECTOR_APP_COPY[appLocale][sectorId] || SECTOR_APP_COPY.en[sectorId];
    const summary = data.snapshot.sector_summary || {};
    const briefing = summary.briefing || {};
    const rawNewsDigest =
      summary.newsDigest || summary.news_digest ||
      data.snapshot.newsDigest || data.snapshot.news_digest || data.newsDigest;
    const newsItems = normalizeNewsDigest(rawNewsDigest);
    const sentiment = summary.outlook || data.snapshot.sentiment || 'NEUTRAL';
    const localizedHeadline = locale === 'ko'
      ? (briefing.headline || briefing.headlineEN || data.snapshot.verdict || '')
      : locale === 'ja'
        ? (briefing.headlineJP || briefing.headline || data.snapshot.verdict || '')
        : (briefing.headlineEN || briefing.headline || data.snapshot.verdict || '');
    const verdict = locale === 'ko'
      ? (summary.next_day_briefing_kr || briefing.headline || data.snapshot.verdict || 'No verdict available.')
      : locale === 'ja'
        ? (briefing.headlineJP || briefing.headline || data.snapshot.verdict || 'No verdict available.')
        : (briefing.headlineEN || briefing.headline || data.snapshot.verdict || 'No verdict available.');
    const catalysts = locale === 'ko'
      ? (briefing.watchpoints || data.snapshot.keyCatalysts || [])
      : locale === 'ja'
        ? (briefing.watchpointsJP || briefing.watchpoints || data.snapshot.keyCatalysts || [])
        : (briefing.watchpointsEN || briefing.watchpoints || data.snapshot.keyCatalysts || []);
    const bullets = locale === 'ko'
      ? (briefing.bullets || [])
      : locale === 'ja'
        ? (briefing.bulletsJP || briefing.bullets || [])
        : (briefing.bulletsEN || briefing.bullets || []);
    const reportTitle = appLocale === 'ko'
      ? `${sectorCopy.name} 섹터 장마감 리포트`
      : appLocale === 'ja'
        ? `${sectorCopy.name} セクター終値レポート`
        : `${sectorCopy.name} Sector Closing Report`;
    const reportHeadline = cleanReportText(localizedHeadline);
    const reportSummary = cleanReportText(verdict || bullets[0] || '');
    const dayOutlook = cleanReportText(catalysts[0] || bullets[1] || '');
    const briefingBullets = Array.isArray(bullets) ? bullets.map(cleanReportText).filter(Boolean) : [];
    const cleanCatalysts = Array.isArray(catalysts) ? catalysts.map(cleanReportText).filter(Boolean) : [];
    const sourceNewsDigestLines = normalizeDigestLines(rawNewsDigest);
    return {
      sentiment,
      verdict,
      catalysts: cleanCatalysts,
      bullets: briefingBullets,
      gainers: summary.gainers ?? 0,
      losers: summary.losers ?? 0,
      avgPcr: summary.avg_pcr ?? 0,
      totalGex: summary.total_gex ?? 0,
      dominantRegime: summary.dominant_regime || 'NEUTRAL',
      avgAlpha: summary.avg_alpha ?? 0,
      snapshotTime: data.snapshot?.meta?.snapshot_timestamp || '',
      source: 'sector-snapshot',
      reportTitle,
      reportHeadline,
      reportSummary,
      dayOutlook,
      newsDigest: sourceNewsDigestLines.length ? sourceNewsDigestLines : briefingBullets,
      briefingBullets,
      newsItems,
      newsSentimentOverall: summary.newsSentimentOverall || summary.news_sentiment_overall,
      riskNotes: cleanCatalysts.slice(0, 3),
      keyStocksData: (data.snapshot.tickers || []).map((tick: any) => ({
        sym: tick.ticker,
        grade: tick.grade || 'B',
        score: tick.alpha_score || tick.score || 55,
        changePct: tick.change_pct || 0,
        closePrice: tick.close_price || tick.closePrice || 0,
        gex: tick.gex ?? 0,
        pcr: tick.pcr ?? 0,
        gammaRegime: tick.gamma_regime || tick.gammaRegime || 'NEUTRAL',
        maxPain: tick.max_pain || tick.maxPain || 0,
        callWall: tick.call_wall || tick.callWall || 0,
        putFloor: tick.put_floor || tick.putFloor || 0,
        rsi: tick.rsi ?? 0,
        rvol: tick.rvol ?? 0,
        sparkline: tick.sparkline || [],
        analysisKr: tick.analysis_kr || tick.analysisKr || '',
        netPremium: tick.net_premium ?? tick.netPremium ?? 0,
        squeezeScore: tick.squeeze_score ?? tick.squeezeScore ?? 0,
        ivSkew: tick.iv_skew ?? tick.ivSkew ?? 0,
        impliedMovePct: tick.implied_move_pct ?? tick.impliedMovePct ?? 0,
        whaleIndex: tick.whale_index ?? tick.whaleIndex ?? 0,
        darkPoolPct: tick.dark_pool_pct ?? tick.darkPoolPct ?? 0
      }))
    };
  }, [locale, appLocale]);

  useEffect(() => {
    if (intelTab !== 'report') return;

    let active = true;
    const controller = new AbortController();
    setGlobalReportLoading(true);

    // Instant fallback so cards render immediately; snapshot overwrites when it lands.
    setReportCache(prev => {
      const next = { ...prev };
      SECTOR_CONFIGS.forEach(sec => { if (!next[sec.id]) next[sec.id] = buildSectorReportFromQuotes(sec.id); });
      return next;
    });

    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    // Fetch all 10 per-sector closing snapshots in parallel — one unified source.
    Promise.allSettled(
      SECTOR_CONFIGS.map(sec =>
        fetch(`/api/intel/snapshot?sector=${sec.id}`, { cache: 'no-store', signal: controller.signal })
          .then(res => res.ok ? res.json() : null)
          .then(data => ({ id: sec.id, report: buildSnapshotReport(data, sec.id) }))
      )
    )
      .then(results => {
        if (!active) return;
        const fresh: Record<string, SectorReportData> = {};
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value?.report) fresh[r.value.id] = r.value.report;
        });
        if (Object.keys(fresh).length) {
          setReportCache(prev => {
            const next = { ...prev };
            Object.entries(fresh).forEach(([id, rep]) => {
              next[id] = mergeSectorReportStable(next[id], rep);
            });
            return next;
          });
          if (selectedSector && fresh[selectedSector]) {
            setReportData(prev => mergeSectorReportStable(prev || buildSectorReportFromQuotes(selectedSector), fresh[selectedSector]));
          }
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) setGlobalReportLoading(false);
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [intelTab, selectedSector, buildSnapshotReport]);

  const sectorSummaries = SECTOR_CONFIGS.map(sec => {
    const quotes = getSectorQuotes(sec.id);
    const validQuotes = quotes.filter(q => q.changePct !== undefined && q.changePct !== null);
    const change = getSectorChange(sec.id);
    const alphaValues = quotes.map(q => q.alphaScore || 0).filter(v => v > 0);
    const avgAlpha = alphaValues.length
      ? alphaValues.reduce((sum, v) => sum + v, 0) / alphaValues.length
      : 0;
    const totalGex = quotes.reduce((sum, q) => sum + (q.gex || 0), 0);
    const avgPcr = safeAverage(quotes.map(q => q.pcr || 0).filter(v => v > 0));
    const netPremium = quotes.reduce((sum, q) => sum + (q.netPremium || 0), 0);
    const avgDarkPool = safeAverage(quotes.map(q => q.darkPoolPct || 0).filter(v => v > 0));
    const avgWhale = safeAverage(quotes.map(q => q.whaleIndex || 0).filter(v => v > 0));
    const avgSqueeze = safeAverage(quotes.map(q => q.squeezeScore || 0).filter(v => v > 0));
    const avgIvSkew = safeAverage(quotes.map(q => q.ivSkew || 0).filter(v => v !== 0));
    const avgImpliedMove = safeAverage(quotes.map(q => q.impliedMovePct || 0).filter(v => v > 0));
    const gammaLong = quotes.filter(q => String(q.gammaRegime || '').toUpperCase().includes('LONG')).length;
    const gammaShort = quotes.filter(q => String(q.gammaRegime || '').toUpperCase().includes('SHORT')).length;
    const topStock = [...quotes].sort((a, b) => {
      const alphaDiff = (b.alphaScore || 0) - (a.alphaScore || 0);
      if (alphaDiff !== 0) return alphaDiff;
      return Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0);
    })[0] || null;
    const cached = reportCache[sec.id];
    const aiLine = cached?.verdict || getCommanderLogCopy(sec.id, appLocale, sec.commanderLog);

    return {
      id: sec.id,
      color: sec.color,
      stocks: sec.stocks,
      gammaPulse: sec.gammaPulse,
      change,
      quoteCount: quotes.length || sec.stocks.length,
      liveCount: validQuotes.length,
      avgAlpha,
      totalGex,
      avgPcr,
      netPremium,
      avgDarkPool,
      avgWhale,
      avgSqueeze,
      avgIvSkew,
      avgImpliedMove,
      gammaLong,
      gammaShort,
      topStock,
      aiLine,
    };
  });

  const leadingSector = sectorSummaries.length
    ? sectorSummaries.reduce((best, item) => item.change > best.change ? item : best)
    : null;
  const laggingSector = sectorSummaries.length
    ? sectorSummaries.reduce((worst, item) => item.change < worst.change ? item : worst)
    : null;
  const averageSectorMove = sectorSummaries.length
    ? sectorSummaries.reduce((sum, item) => sum + Math.abs(item.change), 0) / sectorSummaries.length
    : 0;
  const totalCoverage = sectorSummaries.reduce((sum, item) => sum + item.quoteCount, 0);
  const sessionLabel = isMarketLive ? appCopy.live : marketStatus.session === 'closed' ? appCopy.closed : appCopy.offline;

  // Session-accurate status badge — "LIVE" only means regular hours are running.
  // Pre/post/closed each get their own label + color so the pill never claims LIVE
  // while the visible screen is actually pre-market, after-hours or closed.
  const sessionBadge = marketStatus.session === 'regular'
    ? { text: 'LIVE', color: '#10b981', pulse: true }
    : marketStatus.session === 'pre'
      ? { text: locale === 'ko' ? '프리마켓' : locale === 'ja' ? 'プレ' : 'PRE-MKT', color: '#f59e0b', pulse: true }
      : marketStatus.session === 'post'
        ? { text: locale === 'ko' ? '애프터' : locale === 'ja' ? 'アフター' : 'POST-MKT', color: '#22d3ee', pulse: true }
        : { text: locale === 'ko' ? '장마감' : locale === 'ja' ? '引け' : 'CLOSED', color: '#94a3b8', pulse: false };

  return (
    <div className={s.page} style={{
      paddingBottom: '90px',
      minHeight: '100dvh',
      position: 'relative',
      background: [
        'radial-gradient(circle at 50% -7%, rgba(34, 211, 238, 0.18), transparent 360px)',
        'radial-gradient(circle at 12% 26%, rgba(139, 92, 246, 0.10), transparent 300px)',
        'radial-gradient(circle at 88% 58%, rgba(16, 185, 129, 0.08), transparent 280px)',
        'linear-gradient(180deg, #07111f 0%, #050a14 42%, #070b13 100%)'
      ].join(', '),
      backgroundAttachment: 'local',
      isolation: 'isolate'
    }}>
      {/* HEADER */}
      {!selectedSector && (
        <div role="banner" style={{ padding: '14px 16px 0', position: 'relative' }}>
          <div style={{
            borderRadius: '22px',
            padding: '16px',
            background: 'linear-gradient(145deg, rgba(12, 33, 52, 0.94), rgba(10, 16, 31, 0.97) 56%, rgba(3, 10, 20, 0.99))',
            border: '1px solid rgba(34, 211, 238, 0.20)',
            boxShadow: '0 22px 52px rgba(0, 0, 0, 0.38), 0 0 34px rgba(34,211,238,0.06), inset 0 1px 0 rgba(255,255,255,0.07)',
            overflow: 'hidden',
            marginBottom: '10px',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 12% 8%, rgba(34,211,238,0.19), transparent 34%), radial-gradient(circle at 88% 10%, rgba(16,185,129,0.12), transparent 30%), linear-gradient(90deg, rgba(255,255,255,0.025), transparent 38%)',
              pointerEvents: 'none'
            }} />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(34, 211, 238, 0.10)',
                    border: '1px solid rgba(34, 211, 238, 0.22)',
                    color: '#22d3ee',
                    boxShadow: '0 0 18px rgba(34,211,238,0.18)'
                  }}>
                    <Brain size={16} />
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 900,
                    letterSpacing: '0.12em',
                    color: '#22d3ee',
                    textTransform: 'uppercase'
                  }}>
                    {appCopy.kicker}
                  </span>
                </div>
                <h1 style={{
                  fontSize: '25px',
                  fontWeight: 950,
                  color: 'var(--text)',
                  margin: 0,
                  lineHeight: 1.05,
                  letterSpacing: '0'
                }}>
                  {appCopy.title}
                </h1>
                <p style={{
                  margin: '8px 0 0',
                  fontSize: '12px',
                  lineHeight: 1.45,
                  color: 'rgba(191, 219, 254, 0.84)',
                  fontWeight: 650
                }}>
                  {appCopy.subtitle}
                </p>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                padding: '6px 9px',
                borderRadius: '999px',
                background: isMarketLive ? 'rgba(16, 185, 129, 0.10)' : 'rgba(148, 163, 184, 0.08)',
                border: isMarketLive ? '1px solid rgba(16, 185, 129, 0.24)' : '1px solid rgba(148, 163, 184, 0.16)',
                color: isMarketLive ? '#10b981' : '#94a3b8',
                fontSize: '10px',
                fontWeight: 900,
                letterSpacing: '0.06em'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isMarketLive ? '#10b981' : '#64748b',
                  boxShadow: isMarketLive ? '0 0 8px #10b981' : 'none',
                  animation: isMarketLive ? 'appPulse 2s infinite' : 'none'
                }} />
                {sessionLabel}
              </div>
            </div>
          </div>

          <div style={{
            borderRadius: '18px 18px 0 0',
            padding: '12px',
            background: 'linear-gradient(145deg, rgba(12, 31, 48, 0.78), rgba(8, 13, 26, 0.92))',
            border: '1px solid rgba(34, 211, 238, 0.14)',
            borderBottom: '1px solid rgba(34, 211, 238, 0.08)',
            boxShadow: '0 14px 30px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255,255,255,0.045)'
          }}>
            <div style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              marginTop: 0
            }}>
              {[
                {
                  label: appCopy.leaders,
                  value: leadingSector ? SECTOR_APP_COPY[appLocale][leadingSector.id]?.name || leadingSector.id : '-',
                  meta: leadingSector ? `${leadingSector.change >= 0 ? '+' : ''}${leadingSector.change.toFixed(1)}%` : '-',
                  color: '#10b981',
                  iconColor: leadingSector?.color || '#10b981',
                  icon: leadingSector ? <SectorIcon sectorKey={toCamelCase(leadingSector.id)} color={leadingSector.color} size={18} /> : <Sparkles size={17} />,
                  metaColor: leadingSector && leadingSector.change < 0 ? '#ef4444' : '#10b981',
                  onClick: leadingSector ? () => handleSectorClick(leadingSector.id) : undefined
                },
                {
                  label: appCopy.laggards,
                  value: laggingSector ? SECTOR_APP_COPY[appLocale][laggingSector.id]?.name || laggingSector.id : '-',
                  meta: laggingSector ? `${laggingSector.change >= 0 ? '+' : ''}${laggingSector.change.toFixed(1)}%` : '-',
                  color: '#ef4444',
                  iconColor: laggingSector?.color || '#ef4444',
                  icon: laggingSector ? <SectorIcon sectorKey={toCamelCase(laggingSector.id)} color={laggingSector.color} size={18} /> : <Zap size={17} />,
                  metaColor: laggingSector && laggingSector.change >= 0 ? '#10b981' : '#ef4444',
                  onClick: laggingSector ? () => handleSectorClick(laggingSector.id) : undefined
                },
                {
                  label: appCopy.coverage,
                  value: `${totalCoverage}`,
                  meta: appCopy.constituents,
                  color: '#22d3ee',
                  iconColor: '#22d3ee',
                  icon: <BarChart3 size={17} />,
                  metaColor: 'rgba(203, 213, 225, 0.72)',
                  onClick: undefined
                },
                {
                  label: appCopy.avgMove,
                  value: `${averageSectorMove.toFixed(1)}%`,
                  meta: appCopy.dataLabel,
                  color: averageSectorMove >= 2 ? '#f59e0b' : '#67e8f9',
                  iconColor: '#f59e0b',
                  icon: <Zap size={17} />,
                  metaColor: averageSectorMove >= 2 ? '#f59e0b' : 'rgba(203, 213, 225, 0.72)',
                  onClick: undefined
                }
              ].map(item => (
                <div key={item.label}
                  onClick={item.onClick}
                  role={item.onClick ? 'button' : undefined}
                  style={{
                  minWidth: 0,
                  padding: '11px',
                  borderRadius: '14px',
                  cursor: item.onClick ? 'pointer' : 'default',
                  WebkitTapHighlightColor: 'transparent',
                  background: `linear-gradient(135deg, ${item.iconColor}12, rgba(15, 23, 42, 0.62) 46%, rgba(2, 6, 23, 0.46))`,
                  border: `1px solid ${item.iconColor}22`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 18px ${item.iconColor}09`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    <span style={{
                      width: '25px',
                      height: '25px',
                      borderRadius: '9px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: item.iconColor,
                      background: `${item.iconColor}12`,
                      border: `1px solid ${item.iconColor}26`,
                      flexShrink: 0
                    }}>
                      {item.icon}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 900, color: 'rgba(148, 163, 184, 0.90)', letterSpacing: '0.05em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                  </div>
                  <div style={{ marginTop: '5px', color: item.color, fontSize: '15px', lineHeight: 1.1, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.value}
                  </div>
                  <div style={{ marginTop: '4px', color: item.metaColor, fontSize: '10.5px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.meta}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {false && !selectedSector && (
        <header className="app-header" style={{ display: 'flex', flexDirection: 'column', borderBottom: 'none', padding: '16px 16px 4px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            width: '100%'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <h1 style={{
                  fontSize: '28px',
                  fontWeight: 950,
                  color: 'var(--text)',
                  margin: 0,
                  lineHeight: 1.1
                }}>
                  INTEL
                </h1>
                <span style={{
                  font: 'var(--f-micro)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}>
                  SECTOR INTELLIGENCE
                </span>
              </div>
              {locale !== 'en' && (
                <div style={{
                  font: 'var(--f-micro)',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  marginTop: '3px',
                  fontWeight: 500
                }}>
                  {locale === 'ko' ? '섹터 인텔리전스' : locale === 'ja' ? 'セクター・インテリジェンス' : 'Sector Intelligence'}
                </div>
              )}
            </div>

            {/* Pulsing Status Pill — market-session driven (session-accurate) */}
            <div style={{
              background: `${sessionBadge.color}14`,
              border: `1px solid ${sessionBadge.color}33`,
              borderRadius: '20px',
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '2px'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: sessionBadge.color,
                boxShadow: sessionBadge.pulse ? `0 0 6px ${sessionBadge.color}` : 'none',
                animation: sessionBadge.pulse ? 'appPulse 2s infinite' : 'none'
              }} />
              <span style={{
                font: 'var(--f-micro)',
                fontSize: '9px',
                fontWeight: 900,
                color: sessionBadge.color,
                letterSpacing: '0.05em'
              }}>
                {sessionBadge.text}
              </span>
            </div>
          </div>

          {/* Subheading */}
          <div style={{
            font: 'var(--f-micro)',
            fontSize: '11px',
            color: '#10b981',
            fontWeight: 600,
            margin: '8px 0 0',
            opacity: 0.95,
            width: '100%'
          }}>
            {t.headerDesc}
            {locale !== 'en' && (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'normal', fontWeight: 400, marginLeft: '6px' }}>
                ({t.subtitle})
              </span>
            )}
          </div>
        </header>
      )}

      {/* TAB BAR: SECTOR / CLOSING REPORT */}
      {!selectedSector && (
        <div style={{
          display: 'flex',
          margin: '-1px 16px 12px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(2, 6, 23, 0.78))',
          border: '1px solid rgba(148, 163, 184, 0.12)',
          borderTop: '1px solid rgba(34, 211, 238, 0.08)',
          borderRadius: '0 0 16px 16px',
          padding: '4px',
          gap: '4px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 34px rgba(0,0,0,0.20)'
        }}>
          {(['sector', 'report'] as const).map((tab) => {
            const isActive = intelTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setIntelTab(tab)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '12px',
                  border: isActive ? '1px solid rgba(34, 211, 238, 0.22)' : '1px solid transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? 900 : 750,
                  color: isActive ? '#e0f2fe' : 'rgba(148, 163, 184, 0.82)',
                  background: isActive ? 'linear-gradient(135deg, rgba(8, 145, 178, 0.30), rgba(15, 23, 42, 0.72))' : 'transparent',
                  transition: 'all 0.2s',
                  letterSpacing: '0.02em',
                  boxShadow: isActive ? '0 10px 24px rgba(8, 145, 178, 0.18)' : 'none'
                }}
              >
                {tab === 'sector' ? appCopy.sectorTab : appCopy.reportTab}
              </button>
            );
          })}
        </div>
      )}

      {/* CLOSING REPORT VIEW */}
      {!selectedSector && intelTab === 'report' && (
        <div style={{ padding: '12px 16px 0', animation: 'fadeSlideIn 0.25s ease' }}>
          {Object.keys(reportCache).length === 0 ? (
            <div style={{
              padding: '48px 20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px'
            }}>
              <div style={{ marginBottom: '8px', opacity: 0.5 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              </div>
              {appCopy.reportLoading}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* ═══ CROSS SECTOR SUMMARY CARD ═══ */}
              {crossBrief && (() => {
                const brief = crossBrief;
                // Locale FX gating — USD/KRW is Korea-only, USD/JPY is Japan-only.
                // The API returns both (and can bleed a KRW risk line into en/ja), so the
                // app filters by the viewer's language: web already does this.
                const fxKeyAllowed = (key: string) => {
                  if (/USD\/KRW|\bKRW\b|₩/i.test(key)) return locale === 'ko';
                  if (/USD\/JPY|\bJPY\b|¥/i.test(key)) return locale === 'ja';
                  return true;
                };
                const fxTextAllowed = (t: string) => {
                  const s = String(t || '');
                  if (/USD\s*\/\s*KRW|원\s*\/\s*달러|원달러|\bKRW\b|₩/i.test(s) && locale !== 'ko') return false;
                  if (/USD\s*\/\s*JPY|円\s*\/\s*ドル|\bJPY\b|¥/i.test(s) && locale !== 'ja') return false;
                  return true;
                };
                const toneColor = brief.marketOverview.tone === 'BULLISH' ? '#10b981' : brief.marketOverview.tone === 'BEARISH' ? '#ef4444' : brief.marketOverview.tone === 'CAUTIOUS' ? '#f59e0b' : '#8b5cf6';
                const toneBg = brief.marketOverview.tone === 'BULLISH' ? 'rgba(16,185,129,0.08)' : brief.marketOverview.tone === 'BEARISH' ? 'rgba(239,68,68,0.08)' : brief.marketOverview.tone === 'CAUTIOUS' ? 'rgba(245,158,11,0.08)' : 'rgba(139,92,246,0.08)';
                const biasColor = brief.outlook?.bias === 'BULLISH' ? '#10b981' : brief.outlook?.bias === 'BEARISH' ? '#ef4444' : '#f59e0b';
                const summary = brief.marketOverview.summary[locale as 'ko' | 'en' | 'ja'] || brief.marketOverview.summary.en;
                const drivers = (brief.marketOverview.keyDrivers[locale as 'ko' | 'en' | 'ja'] || brief.marketOverview.keyDrivers.en || []).filter(fxTextAllowed);
                const catalysts = (brief.outlook?.catalysts?.[locale as 'ko' | 'en' | 'ja'] || brief.outlook?.catalysts?.en || []).filter(fxTextAllowed);
                const risks = (brief.outlook?.risks?.[locale as 'ko' | 'en' | 'ja'] || brief.outlook?.risks?.en || []).filter(fxTextAllowed);
                const rotationInsight = brief.sectorRotation?.rotationInsight?.[locale as 'ko' | 'en' | 'ja'] || brief.sectorRotation?.rotationInsight?.en || '';
                const L = (locale as 'ko' | 'en' | 'ja');
                const opportunities = (brief.outlook?.opportunities?.[L] || brief.outlook?.opportunities?.en || []).filter(fxTextAllowed);
                const macroChips = (crossMacro || []).filter(m => fxKeyAllowed(m.key));
                const newsItems = (brief.newsImpact?.items || []).slice(0, 3);
                const edgeAlerts = (brief.edgeAlerts || []).slice(0, 3);
                const dirColor = (d: string) => d === '↑' ? '#10b981' : d === '↓' ? '#ef4444' : 'var(--text-muted)';
                const edgeTone = (t?: string) => t === 'EXTREME' ? { c: '#ef4444', bg: 'rgba(239,68,68,0.08)', b: 'rgba(239,68,68,0.18)' } : t === 'ANOMALY' ? { c: '#a78bfa', bg: 'rgba(167,139,250,0.08)', b: 'rgba(167,139,250,0.18)' } : { c: '#f59e0b', bg: 'rgba(245,158,11,0.08)', b: 'rgba(245,158,11,0.18)' };
                const gamma = brief.gammaOptions;
                const gammaInsight = gamma?.insight?.[L] || gamma?.insight?.en || '';
                const gRegimeColor = gamma?.regime === 'LONG' ? '#10b981' : gamma?.regime === 'SHORT' ? '#ef4444' : '#f59e0b';
                const keyLevels = (brief.outlook?.keyLevels || []).slice(0, 4);
                // Aggregate W/L from all cached reports
                const totalGainers = Object.values(reportCache).reduce((sum, r) => sum + (r.gainers || 0), 0);
                const totalLosers = Object.values(reportCache).reduce((sum, r) => sum + (r.losers || 0), 0);
                return (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(139,92,246,0.04) 100%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    marginBottom: '4px'
                  }}>
                    {/* Header */}
                    <div style={{
                      padding: '16px 16px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={toneColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.04em' }}>
                            {locale === 'ko' ? '크로스 섹터 요약' : locale === 'ja' ? 'クロスセクター概要' : 'CROSS SECTOR BRIEF'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {(totalGainers > 0 || totalLosers > 0) && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                              <span style={{ color: '#10b981' }}>{totalGainers}W</span>
                              <span style={{ margin: '0 2px', opacity: 0.3 }}>/</span>
                              <span style={{ color: '#ef4444' }}>{totalLosers}L</span>
                            </span>
                          )}
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: toneColor,
                            background: toneBg,
                            padding: '4px 12px',
                            borderRadius: '6px',
                            letterSpacing: '0.04em'
                          }}>
                            {brief.marketOverview.tone}
                          </span>
                        </div>
                      </div>
                      {/* Market Summary */}
                      <div style={{
                        fontSize: '14px',
                        lineHeight: 1.75,
                        color: 'var(--text-dim)',
                        fontWeight: 400
                      }}>
                        {summary}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '12px 16px 16px' }}>
                      {/* Macro snapshot — index/vol/bond/commodity + locale-gated FX chips */}
                      {macroChips.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {macroChips.map((m, i) => {
                              const up = m.changePct >= 0;
                              const c = up ? '#10b981' : '#ef4444';
                              const val = Math.abs(m.value) >= 1000
                                ? m.value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                : m.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
                              return (
                                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 9px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 700 }}>{m.key}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 800, fontFamily: 'var(--font-mono, monospace)' }}>{val}</span>
                                  <span style={{ fontSize: '9.5px', color: c, fontWeight: 800, fontFamily: 'var(--font-mono, monospace)' }}>{up ? '+' : ''}{m.changePct.toFixed(2)}%</span>
                                </div>
                              );
                            })}
                          </div>
                          {vixTerm && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '8px', padding: '5px 10px', borderRadius: '8px', background: vixTerm.state === 'BACKWARDATION' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.06)', border: `1px solid ${vixTerm.state === 'BACKWARDATION' ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.14)'}` }}>
                              <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', color: vixTerm.state === 'BACKWARDATION' ? '#ef4444' : '#10b981' }}>VIX TERM</span>
                              <span style={{ fontSize: '10.5px', color: 'var(--text-dim)', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{vixTerm.vix} / {vixTerm.vix3m}</span>
                              <span style={{ fontSize: '10px', fontWeight: 800, color: vixTerm.state === 'BACKWARDATION' ? '#ef4444' : '#10b981' }}>{vixTerm.state} ({vixTerm.ratio})</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Options Snapshot — gamma / pcr / regime (visual strip) */}
                      {gamma && (
                        <div style={{ marginBottom: '12px', padding: '11px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ flex: 1, textAlign: 'center' }}>
                              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '3px' }}>GEX</div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: gamma.regime === 'SHORT' ? '#ef4444' : gamma.regime === 'LONG' ? '#10b981' : '#f59e0b', fontFamily: 'var(--font-mono, monospace)' }}>{(gamma.totalGexLabel || '-').split(' ')[0]}</div>
                            </div>
                            <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ flex: 1, textAlign: 'center' }}>
                              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '3px' }}>PCR</div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-dim)', fontFamily: 'var(--font-mono, monospace)' }}>{typeof gamma.avgPcr === 'number' ? gamma.avgPcr.toFixed(2) : '-'}</div>
                            </div>
                            <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ flex: 1, textAlign: 'center' }}>
                              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '3px' }}>{locale === 'ko' ? '레짐' : locale === 'ja' ? 'レジーム' : 'REGIME'}</div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: gRegimeColor }}>{gamma.regime || '-'}</div>
                            </div>
                          </div>
                          {gammaInsight && <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>{gammaInsight}</div>}
                        </div>
                      )}

                      {/* Sector Rotation Winners/Losers */}
                      {brief.sectorRotation && (brief.sectorRotation.winners?.length > 0 || brief.sectorRotation.losers?.length > 0) && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px' }}>
                            {locale === 'ko' ? '섹터 로테이션' : locale === 'ja' ? 'セクターローテーション' : 'SECTOR ROTATION'}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {/* Winners */}
                            <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(16,185,129,0.06)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.1)' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', marginBottom: '6px', letterSpacing: '0.06em' }}>
                                {locale === 'ko' ? '강세' : 'LEADERS'}
                              </div>
                              {brief.sectorRotation.winners.slice(0, 3).map((w, i) => {
                                const bw = Math.max(8, Math.min(100, Math.abs(parseFloat(String(w.change)) || 0) * 11));
                                return (
                                  <div key={i} style={{ marginBottom: '7px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                      <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.sector}</span>
                                      <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', flexShrink: 0, marginLeft: '6px' }}>{w.change}</span>
                                    </div>
                                    <div style={{ height: '4px', borderRadius: '999px', background: 'rgba(16,185,129,0.12)', overflow: 'hidden' }}>
                                      <div style={{ width: `${bw}%`, height: '100%', background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: '999px' }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* Losers */}
                            <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', marginBottom: '6px', letterSpacing: '0.06em' }}>
                                {locale === 'ko' ? '약세' : 'LAGGARDS'}
                              </div>
                              {brief.sectorRotation.losers.slice(0, 3).map((l, i) => {
                                const bw = Math.max(8, Math.min(100, Math.abs(parseFloat(String(l.change)) || 0) * 11));
                                return (
                                  <div key={i} style={{ marginBottom: '7px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                      <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.sector}</span>
                                      <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', flexShrink: 0, marginLeft: '6px' }}>{l.change}</span>
                                    </div>
                                    <div style={{ height: '4px', borderRadius: '999px', background: 'rgba(239,68,68,0.12)', overflow: 'hidden' }}>
                                      <div style={{ width: `${bw}%`, height: '100%', background: 'linear-gradient(90deg, #dc2626, #f87171)', borderRadius: '999px' }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {rotationInsight && (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '8px', fontStyle: 'italic' }}>
                              {rotationInsight}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Key Drivers */}
                      {drivers.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px' }}>
                            {locale === 'ko' ? '핵심 동인' : locale === 'ja' ? '主要ドライバー' : 'KEY DRIVERS'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {drivers.slice(0, 3).map((d, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                <span style={{ color: toneColor, fontSize: '5px', marginTop: '8px', flexShrink: 0 }}>&#9679;</span>
                                <span style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.65 }}>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Outlook: Catalysts & Risks side by side */}
                      {(catalysts.length > 0 || risks.length > 0) && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {catalysts.length > 0 && (
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', letterSpacing: '0.06em', marginBottom: '6px' }}>
                                {locale === 'ko' ? '촉매' : 'CATALYSTS'}
                              </div>
                              {catalysts.slice(0, 2).map((c, i) => (
                                <div key={i} style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: '4px' }}>
                                  {c}
                                </div>
                              ))}
                            </div>
                          )}
                          {risks.length > 0 && (
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', letterSpacing: '0.06em', marginBottom: '6px' }}>
                                {locale === 'ko' ? '리스크' : 'RISKS'}
                              </div>
                              {risks.slice(0, 2).map((r, i) => (
                                <div key={i} style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: '4px' }}>
                                  {r}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Opportunities */}
                      {opportunities.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#22d3ee', letterSpacing: '0.06em', marginBottom: '6px' }}>
                            {locale === 'ko' ? '기회 요인' : locale === 'ja' ? '機会' : 'OPPORTUNITIES'}
                          </div>
                          {opportunities.slice(0, 2).map((o, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '4px' }}>
                              <span style={{ color: '#22d3ee', fontSize: '5px', marginTop: '8px', flexShrink: 0 }}>&#9679;</span>
                              <span style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.55 }}>{o}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* News Impact — causal impact chain */}
                      {newsItems.length > 0 && (
                        <div style={{ marginTop: '14px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px' }}>
                            {locale === 'ko' ? '뉴스 임팩트' : locale === 'ja' ? 'ニュース影響' : 'NEWS IMPACT'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {newsItems.map((n, i) => {
                              const headline = n.headline?.[L] || n.headline?.en || '';
                              const impact = n.impact?.[L] || n.impact?.en || '';
                              const chain = n.impactChain || [];
                              if (!headline) return null;
                              return (
                                <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: impact ? '4px' : '0' }}>{headline}</div>
                                  {impact && <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: chain.length ? '8px' : '0' }}>{impact}</div>}
                                  {chain.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                      {chain.slice(0, 3).map((step, j) => (
                                        <React.Fragment key={j}>
                                          {j > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.6 }}>&#8594;</span>}
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, padding: '4px 8px', borderRadius: '7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono, monospace)' }}>
                                            {isKnownTicker(step.indicator) && <StockLogo symbol={step.indicator} size={14} />}
                                            {step.indicator}
                                            <span style={{ color: dirColor(step.direction), fontWeight: 900 }}>{step.direction}</span>
                                          </span>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Edge Alerts */}
                      {edgeAlerts.length > 0 && (
                        <div style={{ marginTop: '14px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px' }}>
                            {locale === 'ko' ? '엣지 알림' : locale === 'ja' ? 'エッジアラート' : 'EDGE ALERTS'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {edgeAlerts.map((e, i) => {
                              const tone = edgeTone(e.type);
                              const title = e.title?.[L] || e.title?.en || '';
                              const detail = e.detail?.[L] || e.detail?.en || '';
                              if (!title) return null;
                              return (
                                <div key={i} style={{ padding: '10px 12px', background: tone.bg, borderRadius: '10px', border: `1px solid ${tone.b}` }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: detail ? '3px' : '0' }}>
                                    <span style={{ fontSize: '12px', color: tone.c }}>&#9650;</span>
                                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: tone.c }}>{title}</span>
                                  </div>
                                  {detail && <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5, paddingLeft: '18px' }}>{detail}</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Outlook Bias */}
                      {brief.outlook?.bias && (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px 14px',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.04)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                            {locale === 'ko' ? '내일 전망' : locale === 'ja' ? '明日の見通し' : 'NEXT DAY OUTLOOK'}
                          </span>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            color: biasColor,
                            letterSpacing: '0.04em'
                          }}>
                            {brief.outlook.bias}
                          </span>
                        </div>
                      )}

                      {/* Key Levels — support / resistance chips (visual) */}
                      {keyLevels.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '7px' }}>
                            {locale === 'ko' ? '핵심 레벨' : locale === 'ja' ? '主要レベル' : 'KEY LEVELS'}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {keyLevels.map((kl, i) => {
                              const lbl = kl.label || '';
                              const isRes = /resist|저항|レジス/i.test(lbl);
                              const isSup = /support|지지|サポ/i.test(lbl);
                              const kind = isRes ? 'res' : isSup ? 'sup' : 'thr';
                              const kColor = kind === 'res' ? '#ef4444' : kind === 'sup' ? '#10b981' : '#f59e0b';
                              const kCaret = kind === 'res' ? '▲' : kind === 'sup' ? '▼' : '◆';
                              const instrument = lbl.replace(/\s*(resistance|support|threshold|저항|지지|임계|レジスタンス|サポート|閾値)\s*/ig, '').trim() || lbl;
                              const kindLabel = locale === 'ko'
                                ? (kind === 'res' ? '저항' : kind === 'sup' ? '지지' : '임계')
                                : locale === 'ja'
                                  ? (kind === 'res' ? 'レジスタンス' : kind === 'sup' ? 'サポート' : '閾値')
                                  : (kind === 'res' ? 'Resistance' : kind === 'sup' ? 'Support' : 'Threshold');
                              return (
                                <div key={i} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                                  padding: '6px 10px', borderRadius: '8px',
                                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                                  borderLeft: `2px solid ${kColor}`
                                }}>
                                  <span style={{ fontSize: '9px', color: kColor, lineHeight: 1 }}>{kCaret}</span>
                                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '1px' }}>
                                    <span style={{ fontSize: '9px', color: kColor, fontWeight: 700, letterSpacing: '0.02em' }}>{kindLabel}</span>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{instrument}</span>
                                  </span>
                                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 800, fontFamily: 'var(--font-mono, monospace)', marginLeft: '2px' }}>{kl.value}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {SECTOR_CONFIGS.map((sec) => {
                const cached = reportCache[sec.id] || buildSectorReportFromQuotes(sec.id);
                const englishName = TRANSLATIONS.en[sec.id] || sec.id;
                const displayName = cached.reportTitle || englishName;
                // Unified source: every sector is a real post-market closing report.
                // Only the rare quotes-fallback (snapshot fetch failed) reads "실시간".
                const sourceLabel = cached.source === 'app-live'
                  ? (locale === 'ko' ? '실시간' : locale === 'ja' ? '速報' : 'LIVE')
                  : (locale === 'ko' ? '장마감 리포트' : locale === 'ja' ? '引け後レポート' : 'CLOSE REPORT');
                const isExpanded = expandedReport === sec.id;
                const sentimentColor = cached.sentiment.includes('BULL') ? '#10b981' : cached.sentiment.includes('BEAR') ? '#ef4444' : '#f59e0b';
                const sentimentBg = cached.sentiment.includes('BULL') ? 'rgba(16, 185, 129, 0.1)' : cached.sentiment.includes('BEAR') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
                const regimeColor = cached.dominantRegime === 'LONG' ? '#10b981' : cached.dominantRegime === 'SHORT' ? '#ef4444' : '#f59e0b';
                const reportLabels = locale === 'ko'
                  ? {
                      brief: '섹터 클로징 브리프',
                      sourceWeb: '웹 리포트 기반',
                      sourceLive: '실제 리포트 기반',
                      outlook: '다음 세션 관찰축',
                      digest: '뉴스 다이제스트',
                      risk: '리스크 체크',
                      structure: '수급 구조',
                      keyStocks: '주요 종목',
                      closeReport: '장마감 리포트'
                    }
                  : locale === 'ja'
                    ? {
                        brief: 'セクター終値ブリーフ',
                        sourceWeb: 'Webレポート基盤',
                        sourceLive: '実レポート基盤',
                        outlook: '次セッションの注目軸',
                        digest: 'ニュースダイジェスト',
                        risk: 'リスク確認',
                        structure: 'フロー構造',
                        keyStocks: '主要銘柄',
                        closeReport: '引け後レポート'
                      }
                    : {
                        brief: 'Sector Closing Brief',
                        sourceWeb: 'Web report source',
                        sourceLive: 'Live report source',
                        outlook: 'Next Session Watch',
                        digest: 'News Digest',
                        risk: 'Risk Check',
                        structure: 'Flow Structure',
                        keyStocks: 'Key Stocks',
                        closeReport: 'Close Report'
                      };
                const newsItems = (cached.newsItems || []).slice(0, 6);
                const sourceDigestLines = (
                  cached.newsDigest?.length
                    ? cached.newsDigest
                    : cached.briefingBullets?.length
                      ? cached.briefingBullets
                      : []
                ).map(cleanReportText).filter(Boolean).slice(0, 6);
                const fallbackMetricLines = (cached.bullets || []).map(cleanReportText).filter(Boolean).slice(0, 6);
                const digestLines = newsItems.length ? [] : (sourceDigestLines.length ? sourceDigestLines : fallbackMetricLines);
                const riskLines = (cached.riskNotes && cached.riskNotes.length > 0 ? cached.riskNotes : cached.catalysts || []).slice(0, 3);
                const reportSourceText = reportLabels.sourceLive;
                const needsSnapshotRefresh =
                  (cached.source !== 'sector-snapshot' && newsItems.length === 0) ||
                  (cached.source !== 'global-report' && !hasRichReportPayload(cached));
                const isReportRefreshing = reportLoadingSector === sec.id;
                const digestTitle = appLocale === 'en'
                  ? `${sec.id === 'm7' ? 'M7' : (SECTOR_APP_COPY.en[sec.id]?.name || 'Sector').replace(/\s+Tech$/i, '').replace(/\s+Sector$/i, '')} News Digest`
                  : reportLabels.digest;
                const newsSourceFallback = appLocale === 'ko' ? '뉴스' : appLocale === 'ja' ? 'ニュース' : 'News';
                const newsTone = String(cached.newsSentimentOverall || cached.sentiment || '').toUpperCase();
                const newsToneColor = newsTone.includes('BULL') || newsTone.includes('강세')
                  ? '#10b981'
                  : newsTone.includes('BEAR') || newsTone.includes('약세')
                    ? '#ef4444'
                    : '#f59e0b';
                return (
                  <div key={sec.id} style={{
                    background: 'var(--surface-1)',
                    border: isExpanded ? `1px solid ${sec.color}30` : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    transition: 'all 0.25s ease'
                  }}>
                    {/* ── Sector Header ── */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedReport(null);
                          return;
                        }
                        setExpandedReport(sec.id);
                        if (needsSnapshotRefresh) {
                          void loadSectorReport(sec.id);
                        }
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 16px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <SectorIcon sectorKey={toCamelCase(sec.id)} color={sec.color} size={20} />
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{displayName}</span>
                          <span style={{
                            color: cached.source !== 'app-live' ? '#f59e0b' : '#22d3ee',
                            background: cached.source !== 'app-live' ? 'rgba(245, 158, 11, 0.10)' : 'rgba(34, 211, 238, 0.09)',
                            border: cached.source !== 'app-live' ? '1px solid rgba(245, 158, 11, 0.18)' : '1px solid rgba(34, 211, 238, 0.16)',
                            borderRadius: '999px',
                            padding: '2px 7px',
                            fontSize: '10px',
                            lineHeight: 1,
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                            fontWeight: 850
                          }}>
                            {sourceLabel}
                          </span>
                          {/* W/L mini row */}
                          {(cached.gainers > 0 || cached.losers > 0) && (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                              <span style={{ color: '#10b981' }}>{cached.gainers}W</span>
                              <span style={{ margin: '0 3px', opacity: 0.3 }}>/</span>
                              <span style={{ color: '#ef4444' }}>{cached.losers}L</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: sentimentColor,
                          background: sentimentBg,
                          padding: '4px 12px',
                          borderRadius: '6px',
                          letterSpacing: '0.04em'
                        }}>
                          {cached.sentiment}
                        </span>
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease', opacity: 0.4 }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>

                    {/* ── Expanded Content — full-screen report modal (portal) ── */}
                    {isExpanded && typeof document !== 'undefined' && createPortal(
                      <div
                        onClick={() => setExpandedReport(null)}
                        style={{
                          position: 'fixed', inset: 0, zIndex: 4000,
                          background: 'rgba(2,6,18,0.72)',
                          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                          animation: 'sheetFadeIn 0.18s ease'
                        }}
                      >
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            top: 'max(env(safe-area-inset-top), 20px)',
                            display: 'flex', flexDirection: 'column',
                            background: 'var(--surface-1, #0b1220)',
                            borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
                            border: `1px solid ${sec.color}30`, borderBottom: 'none',
                            boxShadow: '0 -12px 48px rgba(0,0,0,0.5)',
                            overflow: 'hidden',
                            animation: 'sheetUp 0.26s cubic-bezier(0.22,1,0.36,1)'
                          }}
                        >
                          {/* Grab handle */}
                          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                            <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.18)' }} />
                          </div>
                          {/* Sticky modal header */}
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                              <SectorIcon sectorKey={toCamelCase(sec.id)} color={sec.color} size={20} />
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 800, color: sentimentColor, background: sentimentBg, padding: '2px 7px', borderRadius: '5px', letterSpacing: '0.04em' }}>{cached.sentiment}</span>
                                  <span style={{ fontSize: '10px', color: cached.source !== 'app-live' ? '#f59e0b' : '#22d3ee', fontWeight: 700, letterSpacing: '0.02em' }}>{sourceLabel}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedReport(null)}
                              aria-label="Close"
                              style={{ appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', flexShrink: 0, width: '34px', height: '34px', minWidth: '34px', minHeight: '34px', maxWidth: '34px', maxHeight: '34px', aspectRatio: '1 / 1', padding: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-dim)', WebkitTapHighlightColor: 'transparent' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                          {/* Scrollable report body */}
                          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 16px calc(env(safe-area-inset-bottom) + 28px)' }}>
                        {isReportRefreshing && (
                          <div style={{
                            marginBottom: '12px',
                            padding: '9px 11px',
                            borderRadius: '12px',
                            border: '1px solid rgba(34, 211, 238, 0.16)',
                            background: 'linear-gradient(135deg, rgba(8,145,178,0.10), rgba(15,23,42,0.52))',
                            color: 'rgba(165, 243, 252, 0.92)',
                            fontSize: '11px',
                            fontWeight: 850,
                            letterSpacing: '0.04em',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px'
                          }}>
                            <span>
                              {appLocale === 'ko' ? '실제 섹터 리포트 동기화 중' : appLocale === 'ja' ? '実レポートを同期中' : 'Syncing live sector report'}
                            </span>
                            <span className="app-skeleton" style={{ width: '72px', height: '7px', borderRadius: '999px' }} />
                          </div>
                        )}
                        <div style={{
                          padding: '14px',
                          marginBottom: '14px',
                          borderRadius: '14px',
                          border: '1px solid rgba(34, 211, 238, 0.18)',
                          background: 'linear-gradient(135deg, rgba(8, 145, 178, 0.14), rgba(15, 23, 42, 0.72) 48%, rgba(2, 6, 23, 0.82))',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 46px rgba(0,0,0,0.18)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 900, color: '#22d3ee', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                                {reportLabels.brief}
                              </div>
                              <div style={{ marginTop: '3px', fontSize: '18px', lineHeight: 1.25, color: 'var(--text)', fontWeight: 900 }}>
                                {displayName}
                              </div>
                            </div>
                            <span style={{
                              flexShrink: 0,
                              fontSize: '10px',
                              fontWeight: 900,
                              color: cached.source !== 'app-live' ? '#f59e0b' : '#22d3ee',
                              border: cached.source !== 'app-live' ? '1px solid rgba(245,158,11,0.28)' : '1px solid rgba(34,211,238,0.28)',
                              background: cached.source !== 'app-live' ? 'rgba(245,158,11,0.10)' : 'rgba(34,211,238,0.10)',
                              borderRadius: '999px',
                              padding: '5px 8px',
                              whiteSpace: 'nowrap'
                            }}>
                              {reportSourceText}
                            </span>
                          </div>

                          {cached.reportHeadline && (
                            <div style={{
                              marginBottom: '10px',
                              color: 'rgba(226,232,240,0.96)',
                              fontSize: '15px',
                              lineHeight: 1.42,
                              fontWeight: 900,
                              letterSpacing: '0.01em'
                            }}>
                              {cached.reportHeadline}
                            </div>
                          )}

                          {(cached.reportSummary || cached.verdict) && (
                            <div style={{
                              padding: '12px 13px',
                              borderRadius: '12px',
                              border: '1px solid rgba(255,255,255,0.07)',
                              background: 'rgba(2, 6, 23, 0.38)',
                              color: 'rgba(226,232,240,0.92)',
                              fontSize: '13px',
                              lineHeight: 1.68,
                              fontWeight: 650
                            }}>
                              {cleanReportText(cached.reportSummary || cached.verdict)}
                            </div>
                          )}

                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            gap: '8px',
                            marginTop: '10px'
                          }}>
                            <div style={{ padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.56)' }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px' }}>SCORE</div>
                              <div style={{ fontSize: '17px', color: cached.avgAlpha >= 55 ? '#10b981' : cached.avgAlpha >= 45 ? '#f59e0b' : '#ef4444', fontWeight: 900 }}>
                                {cached.avgAlpha.toFixed(0)}
                              </div>
                            </div>
                            <div style={{ padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.56)' }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>GEX<MetricInfo term="gex" locale={appLocale} size={9} /></div>
                              <div style={{ fontSize: '15px', color: cached.totalGex >= 0 ? '#10b981' : '#ef4444', fontWeight: 900, fontFamily: 'var(--font-mono, monospace)' }}>
                                {formatGex(cached.totalGex)}
                              </div>
                            </div>
                            <div style={{ padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.56)' }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px' }}>{reportLabels.structure}</div>
                              <div style={{ fontSize: '15px', color: regimeColor, fontWeight: 900 }}>
                                {cached.dominantRegime}
                              </div>
                            </div>
                          </div>
                        </div>

                        {cached.dayOutlook && (
                          <div style={{
                            padding: '13px 14px',
                            marginBottom: '14px',
                            borderRadius: '13px',
                            border: `1px solid ${sentimentColor}30`,
                            borderLeft: `3px solid ${sentimentColor}`,
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(15,23,42,0.64))'
                          }}>
                            <div style={{ fontSize: '11px', fontWeight: 900, color: sentimentColor, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '7px' }}>
                              {reportLabels.outlook}
                            </div>
                            <div style={{ fontSize: '13px', color: 'rgba(226,232,240,0.90)', lineHeight: 1.68, fontWeight: 620 }}>
                              {cleanReportText(cached.dayOutlook)}
                            </div>
                          </div>
                        )}

                        {newsItems.length > 0 && (
                          <div style={{ marginBottom: '15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '10px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 900, color: '#22d3ee', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                                {digestTitle}
                              </div>
                              {newsTone && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 900,
                                  color: newsToneColor,
                                  border: `1px solid ${newsToneColor}33`,
                                  background: `${newsToneColor}14`,
                                  borderRadius: '999px',
                                  padding: '3px 7px',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {newsTone}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {newsItems.map((news, i) => {
                                const title = getLocalizedNewsTitle(news, appLocale);
                                const insight = getLocalizedNewsInsight(news, appLocale);
                                const age = getNewsAgeLabel(news.publishedAt);
                                const sentiment = String(news.sentiment || '').toUpperCase();
                                const itemColor = sentiment.includes('BULL') || sentiment.includes('POSITIVE')
                                  ? '#10b981'
                                  : sentiment.includes('BEAR') || sentiment.includes('NEGATIVE')
                                    ? '#ef4444'
                                    : '#94a3b8';
                                return (
                                  <div key={`${title}-${i}`} style={{
                                    padding: '11px 12px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.065)',
                                    background: 'linear-gradient(135deg, rgba(15,23,42,0.72), rgba(2,6,23,0.48))',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)'
                                  }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                      <span style={{
                                        width: '7px',
                                        height: '7px',
                                        borderRadius: '50%',
                                        background: itemColor,
                                        boxShadow: `0 0 12px ${itemColor}88`,
                                        marginTop: '7px',
                                        flexShrink: 0
                                      }} />
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: '13px', lineHeight: 1.45, color: 'var(--text)', fontWeight: 820 }}>
                                          {title}
                                        </div>
                                        {insight && (
                                          <div style={{ marginTop: '4px', fontSize: '12.2px', lineHeight: 1.55, color: 'rgba(103,232,249,0.88)', fontWeight: 620 }}>
                                            {insight}
                                          </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '8px' }}>
                                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                            {(news.tickers || []).slice(0, 3).map(ticker => (
                                              <span key={ticker} style={{
                                                fontSize: '10px',
                                                fontWeight: 850,
                                                color: 'rgba(226,232,240,0.78)',
                                                background: 'rgba(148,163,184,0.13)',
                                                border: '1px solid rgba(148,163,184,0.14)',
                                                borderRadius: '5px',
                                                padding: '2px 5px'
                                              }}>
                                                {ticker}
                                              </span>
                                            ))}
                                          </div>
                                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 760, whiteSpace: 'nowrap' }}>
                                            {news.source || newsSourceFallback}{age ? ` · ${age}` : ''}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {digestLines.length > 0 && (
                          <div style={{ marginBottom: '15px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 900, color: '#22d3ee', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
                              {digestTitle}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                              {digestLines.map((line, i) => {
                                const symbolMatch = line.match(/^([A-Z][A-Z0-9.-]{1,5})(?=\s|[:/|-])/);
                                const symbol = symbolMatch?.[0] || String(i + 1).padStart(2, '0');
                                const detail = symbolMatch ? line.slice(symbol.length).replace(/^[\s:/|-]+/, '') : line;
                                return (
                                  <div key={i} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '42px 1fr',
                                    gap: '9px',
                                    alignItems: 'start',
                                    padding: '10px 11px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.055)',
                                    background: 'rgba(255,255,255,0.022)'
                                  }}>
                                    <span style={{ color: '#22d3ee', fontSize: '12px', fontWeight: 900, fontFamily: 'var(--font-mono, monospace)' }}>
                                      {symbol}
                                    </span>
                                    <span style={{ fontSize: '12.5px', lineHeight: 1.62, color: 'rgba(226,232,240,0.86)', fontWeight: 560 }}>
                                      {detail}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {riskLines.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 900, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
                              {reportLabels.risk}
                            </div>
                            <div style={{ display: 'grid', gap: '7px' }}>
                              {riskLines.map((risk, i) => (
                                <div key={i} style={{
                                  padding: '9px 11px',
                                  borderRadius: '10px',
                                  border: '1px solid rgba(245,158,11,0.16)',
                                  background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(15,23,42,0.48))',
                                  fontSize: '12.5px',
                                  lineHeight: 1.6,
                                  color: 'rgba(226,232,240,0.86)',
                                  fontWeight: 560
                                }}>
                                  {risk}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {false && cached.reportSummary && (
                          <div style={{
                            padding: '12px 14px',
                            marginBottom: '14px',
                            borderRadius: '12px',
                            border: '1px solid rgba(34, 211, 238, 0.12)',
                            background: 'linear-gradient(135deg, rgba(8, 145, 178, 0.11), rgba(15, 23, 42, 0.58))',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)'
                          }}>
                            <div style={{
                              fontSize: '11px',
                              fontWeight: 900,
                              color: '#22d3ee',
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              marginBottom: '6px'
                            }}>
                              {locale === 'ko' ? '섹터 리포트 요약' : locale === 'ja' ? 'セクターレポート要約' : 'SECTOR REPORT SUMMARY'}
                            </div>
                            <div style={{
                              fontSize: '13px',
                              lineHeight: 1.65,
                              color: 'rgba(226, 232, 240, 0.88)',
                              fontWeight: 650
                            }}>
                              {cached.reportSummary}
                            </div>
                          </div>
                        )}

                        {/* ─ Scoreboard Mini Bar ─ */}
                        {false && (cached.avgAlpha > 0 || cached.totalGex !== 0 || cached.avgPcr > 0) && (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '8px',
                            marginBottom: '14px'
                          }}>
                            {/* Alpha Score */}
                            <div style={{
                              padding: '10px',
                              background: 'rgba(255,255,255,0.02)',
                              borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.04)',
                              textAlign: 'center' as const
                            }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '4px' }}>
                                {locale === 'ko' ? '평균 스코어' : 'AVG SCORE'}
                              </div>
                              <div style={{ fontSize: '18px', fontWeight: 800, color: cached.avgAlpha >= 70 ? '#10b981' : cached.avgAlpha >= 50 ? '#f59e0b' : '#ef4444' }}>
                                {cached.avgAlpha.toFixed(0)}
                              </div>
                            </div>
                            {/* GEX */}
                            <div style={{
                              padding: '10px',
                              background: 'rgba(255,255,255,0.02)',
                              borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.04)',
                              textAlign: 'center' as const
                            }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '4px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>GEX<MetricInfo term="gex" locale={appLocale} size={9} /></div>
                              <div style={{ fontSize: '16px', fontWeight: 800, color: cached.totalGex >= 0 ? '#10b981' : '#ef4444', fontFamily: 'var(--font-mono, monospace)' }}>
                                {formatGex(cached.totalGex)}
                              </div>
                            </div>
                            {/* Regime */}
                            <div style={{
                              padding: '10px',
                              background: 'rgba(255,255,255,0.02)',
                              borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.04)',
                              textAlign: 'center' as const
                            }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '4px' }}>
                                {locale === 'ko' ? '감마' : 'GAMMA'}
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: regimeColor }}>
                                {cached.dominantRegime}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ─ Verdict ─ */}
                        {cached.verdict && cleanReportText(cached.verdict) !== cleanReportText(cached.reportSummary) && (
                        <div style={{
                          padding: '14px 16px',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: '10px',
                          borderLeft: `3px solid ${sentimentColor}`,
                          marginBottom: '16px'
                        }}>
                          <div style={{
                            fontSize: '14px',
                            lineHeight: 1.75,
                            color: 'var(--text-dim)',
                            fontWeight: 400
                          }}>
                            {cleanReportText(cached.verdict)}
                          </div>
                        </div>
                        )}

                        {/* ─ Bullets (structured analysis) ─ */}
                        {false && cached.bullets && cached.bullets.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 800,
                              color: 'var(--text-muted)',
                              letterSpacing: '0.08em',
                              marginBottom: '8px',
                              textTransform: 'uppercase' as const
                            }}>
                              {locale === 'ko' ? '분석 포인트' : locale === 'ja' ? '分析ポイント' : 'ANALYSIS'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {cached.bullets.slice(0, 6).map((bullet, i) => (
                                <div key={i} style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '8px',
                                  padding: '8px 12px',
                                  background: 'rgba(255,255,255,0.015)',
                                  borderRadius: '6px'
                                }}>
                                  <span style={{
                                    color: sec.color,
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    marginTop: '2px',
                                    flexShrink: 0,
                                    opacity: 0.7,
                                    fontFamily: 'var(--font-mono, monospace)'
                                  }}>{String(i + 1).padStart(2, '0')}</span>
                                  <span
                                    style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.7 }}
                                    dangerouslySetInnerHTML={{
                                      __html: bullet.replace(/<mark>/g, '<span style="background:rgba(250,204,21,0.15);color:#fcd34d;padding:0 2px;border-radius:2px">').replace(/<\/mark>/g, '</span>')
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ─ Catalysts ─ */}
                        {false && cached.catalysts.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 800,
                              color: 'var(--text-muted)',
                              letterSpacing: '0.08em',
                              marginBottom: '8px',
                              textTransform: 'uppercase' as const
                            }}>
                              {locale === 'ko' ? '핵심 촉매' : locale === 'ja' ? 'カタリスト' : 'KEY CATALYSTS'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {cached.catalysts.slice(0, 4).map((cat, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                  <span style={{
                                    color: sentimentColor,
                                    fontSize: '5px',
                                    marginTop: '8px',
                                    flexShrink: 0,
                                    lineHeight: 1
                                  }}>&#9679;</span>
                                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.7 }}>{cat}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ─ Key Stocks with Logos ─ */}
                        {cached.keyStocksData && cached.keyStocksData.length > 0 && (
                          <div>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 800,
                              color: 'var(--text-muted)',
                              letterSpacing: '0.08em',
                              marginBottom: '10px',
                              textTransform: 'uppercase' as const
                            }}>
                              {locale === 'ko' ? '주요 종목' : locale === 'ja' ? '主要銘柄' : 'KEY STOCKS'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {cached.keyStocksData.slice(0, 5).map((stock) => {
                                const isUp = (stock.changePct ?? 0) >= 0;
                                const changeColor = isUp ? '#10b981' : '#ef4444';
                                const gradeColor =
                                  stock.grade === 'S' ? '#f59e0b' :
                                  stock.grade === 'A' ? '#10b981' :
                                  stock.grade === 'B' ? '#3b82f6' :
                                  stock.grade === 'C' ? '#8b5cf6' : 'var(--text-muted)';
                                return (
                                  <div key={stock.sym} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.02)',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.04)'
                                  }}>
                                    {/* Stock Logo */}
                                    <StockLogo symbol={stock.sym} />
                                    {/* Info column */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <span style={{
                                          fontSize: '14px',
                                          fontWeight: 800,
                                          color: 'var(--text)',
                                          fontFamily: 'var(--font-mono, monospace)',
                                          letterSpacing: '0.03em'
                                        }}>
                                          {stock.sym}
                                        </span>
                                        <span style={{
                                          fontSize: '11px',
                                          fontWeight: 900,
                                          color: gradeColor,
                                          background: `${gradeColor}15`,
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          letterSpacing: '0.02em'
                                        }}>
                                          {stock.grade}
                                        </span>
                                        {stock.score > 0 && (
                                          <span style={{
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: 'var(--text-muted)'
                                          }}>
                                            {stock.score}pts
                                          </span>
                                        )}
                                      </div>
                                      {/* Price row */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {(stock.closePrice ?? 0) > 0 && (
                                          <span style={{
                                            fontSize: '14px',
                                            fontWeight: 700,
                                            color: 'var(--text-dim)',
                                            fontFamily: 'var(--font-mono, monospace)'
                                          }}>
                                            ${stock.closePrice?.toFixed(2)}
                                          </span>
                                        )}
                                        <span style={{
                                          fontSize: '13px',
                                          fontWeight: 700,
                                          color: changeColor,
                                          fontFamily: 'var(--font-mono, monospace)'
                                        }}>
                                          {isUp ? '+' : ''}{(stock.changePct ?? 0).toFixed(2)}%
                                        </span>
                                        {/* Option levels inline */}
                                        {((stock.callWall ?? 0) > 0 || (stock.putFloor ?? 0) > 0) && (
                                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                            {(stock.callWall ?? 0) > 0 && <span>CW <span style={{ color: '#10b981', fontWeight: 700 }}>${stock.callWall}</span></span>}
                                            {(stock.callWall ?? 0) > 0 && (stock.putFloor ?? 0) > 0 && <span style={{ margin: '0 4px', opacity: 0.3 }}>|</span>}
                                            {(stock.putFloor ?? 0) > 0 && <span>PF <span style={{ color: '#ef4444', fontWeight: 700 }}>${stock.putFloor}</span></span>}
                                          </span>
                                        )}
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
                      </div>,
                      document.body
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTOR CARD LIST */}
      {!selectedSector && intelTab === 'sector' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '0 16px' }}>
          {sectorSummaries.map((sec, index) => {
            const sectorCopy = SECTOR_APP_COPY[appLocale][sec.id] || SECTOR_APP_COPY.en[sec.id];
            const englishCopy = SECTOR_APP_COPY.en[sec.id];
            const isUp = sec.change >= 0;
            const coverage = sec.quoteCount;
            const toneColor = isUp ? '#10b981' : '#ef4444';
            const pulseColor = sec.gammaPulse.stance === 'STABLE' ? '#10b981' : sec.gammaPulse.stance === 'NEUTRAL' ? '#f59e0b' : '#ef4444';
            const pulseLabel = sec.gammaPulse.stance === 'STABLE'
              ? (appLocale === 'ko' ? '안정' : appLocale === 'ja' ? '安定' : 'Stable')
              : sec.gammaPulse.stance === 'NEUTRAL'
                ? (appLocale === 'ko' ? '중립' : appLocale === 'ja' ? '中立' : 'Neutral')
                : (appLocale === 'ko' ? '주의' : appLocale === 'ja' ? '注意' : 'Risk');

            const labels = appLocale === 'ko'
              ? {
                aiRead: 'AI 해석',
                lead: '주도 종목',
                coverage: '커버리지',
                gammaLong: '롱 감마 우위',
                gammaShort: '숏 감마 우위',
                gammaMixed: '감마 혼재',
                net: 'NET PREM',
                darkPool: 'DARK POOL',
                whale: 'WHALE',
                squeeze: 'SQUEEZE',
                pcr: 'PCR',
                gex: 'GEX',
              }
              : appLocale === 'ja'
                ? {
                  aiRead: 'AI解釈',
                  lead: '主導銘柄',
                  coverage: 'カバレッジ',
                  gammaLong: 'ロングガンマ優位',
                  gammaShort: 'ショートガンマ優位',
                  gammaMixed: 'ガンマ混在',
                  net: 'NET PREM',
                  darkPool: 'DARK POOL',
                  whale: 'WHALE',
                  squeeze: 'SQUEEZE',
                  pcr: 'PCR',
                  gex: 'GEX',
                }
                : {
                  aiRead: 'AI Read',
                  lead: 'Lead Name',
                  coverage: 'Coverage',
                  gammaLong: 'Long Gamma Bias',
                  gammaShort: 'Short Gamma Bias',
                  gammaMixed: 'Mixed Gamma',
                  net: 'NET PREM',
                  darkPool: 'DARK POOL',
                  whale: 'WHALE',
                  squeeze: 'SQUEEZE',
                  pcr: 'PCR',
                  gex: 'GEX',
                };
            const regimeText = sec.gammaLong > sec.gammaShort ? labels.gammaLong : sec.gammaShort > sec.gammaLong ? labels.gammaShort : labels.gammaMixed;
            const topStock = sec.topStock;
            const aiLine = (sec.aiLine || sectorCopy.thesis || '').replace(/\s+/g, ' ');
            const displayGex = sec.totalGex !== 0 ? sec.totalGex : sec.gammaPulse.pct * -700000;
            const displayPcr = sec.avgPcr || (sec.gammaPulse.stance === 'STABLE' ? 0.72 : sec.gammaPulse.stance === 'NEUTRAL' ? 0.98 : 1.24);
            const displayNetPremium = sec.netPremium !== 0 ? sec.netPremium : sec.change * 18000000;
            const displayDarkPool = sec.avgDarkPool || Math.max(38, Math.min(68, 48 + Math.abs(sec.gammaPulse.pct) * 0.18));
            const displayWhale = sec.avgWhale || Math.max(42, Math.min(82, 52 + Math.abs(sec.gammaPulse.pct) * 0.22));
            const displaySqueeze = sec.avgSqueeze || Math.max(22, Math.min(76, 28 + Math.abs(sec.gammaPulse.pct) * 0.35));
            const tapeMetrics = [
              { label: labels.gex, value: formatGex(displayGex), color: displayGex >= 0 ? '#10b981' : '#ef4444' },
              { label: labels.pcr, value: displayPcr.toFixed(2), color: displayPcr < 0.8 ? '#10b981' : displayPcr > 1.1 ? '#ef4444' : '#e2e8f0' },
              { label: labels.net, value: formatMoneyCompact(displayNetPremium), color: displayNetPremium >= 0 ? '#10b981' : '#ef4444' },
              { label: labels.darkPool, value: formatPlainPercent(displayDarkPool), color: displayDarkPool >= 40 ? '#cbd5e1' : '#94a3b8' },
              { label: labels.whale, value: Math.round(displayWhale).toString(), color: displayWhale >= 60 ? '#a78bfa' : '#94a3b8' },
              { label: labels.squeeze, value: `${Math.round(displaySqueeze)}%`, color: displaySqueeze >= 70 ? '#f59e0b' : displaySqueeze >= 40 ? '#facc15' : '#94a3b8' },
            ];
            const coreMetrics = tapeMetrics.slice(0, 3);
            const flowMetrics = tapeMetrics.slice(3);
            const leadSymbol = (topStock as any)?.ticker || topStock?.ticker || sec.stocks[0] || '-';
            const leadMove = topStock ? formatPercentCompact(topStock.changePct || sec.change || 0) : formatPercentCompact(sec.change);
            const leadMoveColor = topStock && (topStock.changePct || 0) < 0 ? '#ef4444' : '#10b981';
            // 섹터 종목 실시간 데이터 (브레드스 칩 색상 + 주도종목 추세선 — 실제 데이터)
            const sectorQuotes = getSectorQuotes(sec.id);
            const sectorQuoteMap = new Map(sectorQuotes.map(q => [q.ticker, q.changePct]));
            const leadQuote = sectorQuotes.find(q => q.ticker === leadSymbol) || sectorQuotes[0];
            const leadSparkline = (leadQuote?.sparkline && leadQuote.sparkline.length >= 3) ? leadQuote.sparkline : null;
            const leadSparkUp = (leadQuote?.changePct ?? sec.change) >= 0;

            return (
              <React.Fragment key={sec.id}>
                <button
                  className="app-pressable"
                  onClick={() => handleSectorClick(sec.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: `1px solid ${sec.color}24`,
                    borderRadius: '22px',
                    padding: '15px',
                    background: `linear-gradient(145deg, rgba(16, 27, 46, 0.93), rgba(5, 10, 22, 0.97) 62%, rgba(3, 8, 17, 0.99)), linear-gradient(135deg, ${sec.color}2f, transparent 54%)`,
                    boxShadow: `0 20px 42px rgba(0,0,0,0.32), 0 0 30px ${sec.color}0f, inset 0 1px 0 rgba(255,255,255,0.055)`,
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(circle at 9% 0%, ${sec.color}26, transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.018), transparent 36%)`,
                    opacity: 0.9,
                    pointerEvents: 'none'
                  }} />

                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '11px', minWidth: 0, alignItems: 'flex-start' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '15px',
                          background: `${sec.color}14`,
                          border: `1px solid ${sec.color}38`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: `0 0 24px ${sec.color}1d`
                        }}>
                          <SectorIcon sectorKey={toCamelCase(sec.id)} color={sec.color} size={23} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                            <span style={{ color: 'var(--text)', fontSize: '16px', lineHeight: 1.12, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sectorCopy.name}
                            </span>
                            {appLocale !== 'en' && englishCopy && (
                              <span style={{ color: 'rgba(148, 163, 184, 0.72)', fontSize: '9.5px', fontWeight: 850, letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>
                                {englishCopy.name}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '6px 0 0', color: 'rgba(203, 213, 225, 0.80)', fontSize: '11.5px', lineHeight: 1.35, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sectorCopy.desc}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                        {leadSparkline && (
                          <div style={{ width: '62px', height: '18px', opacity: 0.92 }}>
                            <Sparkline data={leadSparkline} isUp={leadSparkUp} />
                          </div>
                        )}
                        <div style={{
                          color: toneColor,
                          background: isUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                          border: isUp ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(239,68,68,0.28)',
                          borderRadius: '999px',
                          padding: '6px 9px',
                          fontSize: '12.5px',
                          fontWeight: 950,
                          lineHeight: 1,
                          fontFamily: 'var(--font-mono), monospace',
                          boxShadow: isUp ? '0 0 18px rgba(16,185,129,0.10)' : '0 0 18px rgba(239,68,68,0.10)'
                        }}>
                          {formatPercentCompact(sec.change)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '11px' }}>
                      <div style={{
                        padding: '10px 11px',
                        borderRadius: '14px',
                        background: `linear-gradient(135deg, ${sec.color}14, rgba(2, 6, 23, 0.58) 56%)`,
                        border: `1px solid ${sec.color}2f`,
                        color: 'rgba(226, 232, 240, 0.90)',
                        fontSize: '12px',
                        lineHeight: 1.42,
                        fontWeight: 760,
                        overflow: 'hidden',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                          <span style={{
                            width: '25px',
                            height: '25px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '9px',
                            color: sec.color,
                            background: `${sec.color}14`,
                            border: `1px solid ${sec.color}28`,
                            flexShrink: 0
                          }}>
                            <Brain size={14} />
                          </span>
                          <span style={{ color: sec.color, fontSize: '10px', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {labels.aiRead}
                          </span>
                        </div>
                        <div style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {aiLine}
                        </div>
                      </div>

                      <div style={{
                        borderRadius: '15px',
                        background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.72), rgba(2, 6, 23, 0.52))',
                        border: '1px solid rgba(148, 163, 184, 0.12)',
                        overflow: 'hidden',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)'
                      }}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          borderBottom: '1px solid rgba(148, 163, 184, 0.10)'
                        }}>
                          <div style={{ padding: '10px 11px 9px', borderRight: '1px solid rgba(148, 163, 184, 0.10)', minWidth: 0 }}>
                            <div style={{ color: 'rgba(148, 163, 184, 0.88)', fontSize: '9.5px', fontWeight: 950, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {appCopy.pulse}
                            </div>
                            <div style={{ marginTop: '5px', color: pulseColor, fontSize: '15px', fontWeight: 950, lineHeight: 1, fontFamily: 'var(--font-mono), monospace' }}>
                              {sec.gammaPulse.pct > 0 ? '+' : ''}{sec.gammaPulse.pct}
                            </div>
                          </div>
                          <div style={{ padding: '10px 11px 9px', minWidth: 0 }}>
                            <div style={{ color: 'rgba(148, 163, 184, 0.88)', fontSize: '9.5px', fontWeight: 950, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {labels.lead}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '5px', minWidth: 0, flexWrap: 'wrap' }}>
                              <span style={{ color: leadMoveColor, fontSize: '15px', fontWeight: 950, lineHeight: 1, fontFamily: 'var(--font-mono), monospace' }}>
                                {leadSymbol}
                              </span>
                              <span style={{ color: leadMoveColor, fontSize: '10px', fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap' }}>
                                {leadMove}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'
                        }}>
                          {coreMetrics.map((metric, metricIndex) => (
                            <div key={metric.label} style={{
                              padding: '9px 10px',
                              borderRight: metricIndex < coreMetrics.length - 1 ? '1px solid rgba(148, 163, 184, 0.10)' : 'none',
                              minWidth: 0
                            }}>
                              <div style={{ color: 'rgba(148, 163, 184, 0.88)', fontSize: '9px', fontWeight: 950, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                                {metric.label}
                              </div>
                              <div style={{ marginTop: '5px', color: metric.color, fontSize: '12.5px', fontWeight: 950, lineHeight: 1.05, fontFamily: 'var(--font-mono), monospace', overflowWrap: 'anywhere' }}>
                                {metric.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '5px', minWidth: 0, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '9.5px',
                            fontWeight: 900,
                            background: 'rgba(34,211,238,0.08)',
                            border: '1px solid rgba(34,211,238,0.16)',
                            borderRadius: '999px',
                            padding: '4px 7px',
                            color: '#67e8f9',
                            whiteSpace: 'nowrap'
                          }}>
                            {labels.coverage} {coverage}
                          </span>
                          {sec.stocks.slice(0, 3).map(sym => {
                            const ch = sectorQuoteMap.get(sym);
                            const has = typeof ch === 'number' && Number.isFinite(ch);
                            const up = (ch ?? 0) >= 0;
                            return (
                              <span key={sym} style={{
                                fontSize: '9.5px',
                                fontWeight: 850,
                                background: has ? (up ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)') : 'rgba(255,255,255,0.038)',
                                border: `1px solid ${has ? (up ? 'rgba(16,185,129,0.24)' : 'rgba(239,68,68,0.24)') : 'rgba(255,255,255,0.075)'}`,
                                borderRadius: '999px',
                                padding: '4px 7px',
                                color: has ? (up ? '#34d399' : '#f87171') : 'rgba(203, 213, 225, 0.78)',
                                whiteSpace: 'nowrap',
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                {sym}{has ? ` ${up ? '+' : ''}${(ch as number).toFixed(1)}%` : ''}
                              </span>
                            );
                          })}
                          {sec.stocks.length > 3 && (
                            <span style={{
                              fontSize: '9.5px',
                              fontWeight: 850,
                              background: `${sec.color}10`,
                              border: `1px solid ${sec.color}20`,
                              borderRadius: '999px',
                              padding: '4px 7px',
                              color: 'rgba(226,232,240,0.78)',
                              whiteSpace: 'nowrap'
                            }}>
                              +{sec.stocks.length - 3}
                            </span>
                          )}
                          {flowMetrics.map(metric => (
                            <span key={metric.label} style={{
                              fontSize: '9px',
                              fontWeight: 850,
                              color: metric.color,
                              background: 'rgba(2, 6, 23, 0.38)',
                              border: '1px solid rgba(148, 163, 184, 0.10)',
                              borderRadius: '999px',
                              padding: '4px 7px',
                              whiteSpace: 'nowrap'
                            }}>
                              {metric.label.replace('DARK ', 'D.')} {metric.value}
                            </span>
                          ))}
                        </div>
                        <ChevronRight size={16} color="rgba(148, 163, 184, 0.72)" style={{ flexShrink: 0 }} />
                      </div>
                    </div>
                  </div>
                </button>

                {(index === 2 || index === 5) && (
                  <div style={{ height: '1px', margin: '2px 18px', background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.16), transparent)' }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {false && !selectedSector && intelTab === 'sector' && (
        <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 16px' }}>
          {SECTOR_CONFIGS.map((sec, index) => {
            const nameKey = sec.id;
            const descKey = `desc_${sec.id}`;
            const englishName = TRANSLATIONS.en[nameKey] || sec.id;
            const localizedName = t[nameKey] || sec.id;
            const englishDesc = TRANSLATIONS.en[descKey] || '';
            const localizedDesc = t[descKey] || '';

            const avgChange = getSectorChange(sec.id);
            const isUp = avgChange >= 0;
            const leftBorderColor = isUp ? '#10b981' : '#ef4444';
            const badgeColor = isUp ? '#10b981' : '#ef4444';
            const badgeBg = isUp ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';
            const badgeBorder = isUp ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)';

            return (
              <React.Fragment key={sec.id}>
                <div
                  className="app-card app-pressable"
                  onClick={() => handleSectorClick(sec.id)}
                  style={{
                    cursor: 'pointer',
                    borderLeft: `4px solid ${leftBorderColor}`,
                    background: 'var(--surface-1)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    borderTop: '1px solid rgba(255,255,255,0.03)',
                    borderRight: '1px solid rgba(255,255,255,0.03)',
                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    {/* Left Icon Container */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <SectorIcon sectorKey={toCamelCase(sec.id)} color={sec.color} size={22} />
                    </div>

                    {/* Middle Column */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Titles */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
                          {englishName}
                        </span>
                        {locale !== 'en' && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {localizedName}
                          </span>
                        )}
                      </div>

                      {/* Descriptions */}
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4, display: 'flex', flexDirection: 'column' }}>
                        <span>{englishDesc}</span>
                        {locale !== 'en' && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>{localizedDesc}</span>
                        )}
                      </div>

                      {/* Bottom Stance & Constituents */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: sec.gammaPulse.stance === 'STABLE' ? '#10b981' : sec.gammaPulse.stance === 'NEUTRAL' ? '#f59e0b' : '#ef4444',
                            boxShadow: `0 0 5px ${sec.gammaPulse.stance === 'STABLE' ? '#10b981' : sec.gammaPulse.stance === 'NEUTRAL' ? '#f59e0b' : '#ef4444'}`
                          }} />
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            color: sec.gammaPulse.stance === 'STABLE' ? '#10b981' : sec.gammaPulse.stance === 'NEUTRAL' ? '#f59e0b' : '#ef4444',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                          }}>
                            GAMMA PULSE
                          </span>

                        </div>

                        {/* Tickers */}
                        <div style={{ display: 'flex', gap: '3px', marginLeft: '4px' }}>
                          {sec.stocks.slice(0, 4).map((sym) => (
                            <span
                              key={sym}
                              style={{
                                fontSize: '9px',
                                fontWeight: 600,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '3px',
                                padding: '1px 4px',
                                color: 'var(--text-muted)'
                              }}
                            >
                              {sym}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Return badge and mini label */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0 }}>
                    <div style={{
                      background: badgeBg,
                      border: badgeBorder,
                      borderRadius: '8px',
                      padding: '5px 9px',
                      minWidth: '58px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: badgeColor,
                      fontFamily: 'var(--font-mono), monospace',
                      fontSize: '12px',
                      fontWeight: 800,
                      letterSpacing: '-0.01em'
                    }}>
                      {isUp ? '+' : ''}{avgChange.toFixed(1)}%
                    </div>
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      opacity: 0.6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* AD break dividers */}
                {(index === 2 || index === 5) && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '12px 16px',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.05)' }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
           SECTOR DETAILED REPORT VIEW — Premium Redesign v2
           Accordion pattern, Key Stocks first, Bento Grid metrics
           ═══════════════════════════════════════════════════════════ */}
      {selectedSector && (
        <div style={{ padding: '12px 0 0' }}>
          {/* Back Navigation */}
          <button
            onClick={() => {
              setSelectedSector(null);
              setReportData(null);
              setExpandedStock(null);
              setExpandedSections(new Set(['stocks']));
            }}
            style={{
              margin: '0 16px 16px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-btn)',
              padding: '6px 14px',
              font: 'var(--f-small)',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.closeBtn}</span>
          </button>

          {loading ? (
            <div className="app-card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="app-skeleton" style={{ width: '100%', height: '100%' }} />
            </div>
          ) : (
            reportData && (
              <div className="intel-detail-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px' }}>

                {/* ═══ SECTION 1: HERO HEADER CARD (Enhanced with Scoreboard) ═══ */}
                {(() => {
                  const sec = SECTOR_CONFIGS.find(s => s.id === selectedSector);
                  const englishName = sec ? (TRANSLATIONS.en[sec.id] || sec.id) : '';
                  const localizedName = sec ? (t[sec.id] || sec.id) : '';
                  const descKey = sec ? `desc_${sec.id}` : '';
                  const localizedDesc = sec ? (t[descKey] || '') : '';
                  const avgChange = sec ? getSectorChange(sec.id) : 0;
                  const isUp = avgChange >= 0;
                  const badgeColor = isUp ? '#10b981' : '#ef4444';
                  const stocks = reportData.keyStocksData;
                  const avgScore = stocks.length > 0 ? stocks.reduce((s, x) => s + (x.score || 0), 0) / stocks.length : 0;
                  const sectorGrade = avgScore >= 75 ? 'S' : avgScore >= 60 ? 'A' : avgScore >= 45 ? 'B' : avgScore >= 30 ? 'C' : 'D';
                  const gradeColor = sectorGrade === 'S' ? '#06b6d4' : sectorGrade === 'A' ? '#10b981' : sectorGrade === 'B' ? '#f59e0b' : '#ef4444';
                  const regimeColor = reportData.dominantRegime === 'LONG' ? '#10b981' : reportData.dominantRegime === 'SHORT' ? '#ef4444' : '#f59e0b';

                  return (
                    <div className="app-card" style={{
                      background: 'linear-gradient(135deg, rgba(16, 28, 52, 0.65) 0%, rgba(8, 14, 28, 0.85) 100%)',
                      borderRadius: '16px',
                      padding: '18px 16px 14px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      {/* Accent strip */}
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: sec?.color || 'var(--cyan)' }} />

                      {/* Top: Icon + Name + Change Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{
                            width: '46px', height: '46px', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                          }}>
                            {sec && <SectorIcon sectorKey={toCamelCase(sec.id)} color={sec.color} size={24} />}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ font: 'var(--f-h2)', fontSize: '18px', fontWeight: 850, color: '#ffffff', letterSpacing: '-0.02em' }}>
                                {englishName}
                              </span>
                              {locale !== 'en' && (
                                <span style={{ font: 'var(--f-micro)', fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                                  {localizedName}
                                </span>
                              )}
                            </div>
                            <div style={{ font: 'var(--f-micro)', fontSize: '10.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', lineHeight: 1.3 }}>
                              {localizedDesc}
                            </div>
                          </div>
                        </div>
                        <div style={{
                          background: isUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                          border: isUp ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.25)',
                          borderRadius: '8px', padding: '5px 10px',
                          color: badgeColor, fontFamily: 'var(--font-mono), monospace',
                          fontSize: '13px', fontWeight: 800, flexShrink: 0
                        }}>
                          {isUp ? '+' : ''}{avgChange.toFixed(1)}%
                        </div>
                      </div>

                      {/* Scoreboard Row */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0',
                        marginTop: '14px', paddingTop: '12px',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.02)', borderRadius: '10px', overflow: 'hidden'
                      }}>
                        {[
                          { label: 'GEX', value: formatGex(reportData.totalGex), color: reportData.totalGex > 0 ? '#10b981' : reportData.totalGex < 0 ? '#ef4444' : '#94a3b8' },
                          { label: 'PCR', value: reportData.avgPcr > 0 ? reportData.avgPcr.toFixed(2) : '-', color: reportData.avgPcr < 0.7 ? '#10b981' : reportData.avgPcr > 1.2 ? '#ef4444' : '#f8fafc' },
                          { label: 'W/L', value: `${reportData.gainers}/${reportData.losers}`, color: reportData.gainers > reportData.losers ? '#10b981' : '#ef4444' },
                          { label: 'SCORE', value: avgScore > 0 ? Math.round(avgScore).toString() : '-', color: gradeColor },
                          { label: 'REGIME', value: reportData.dominantRegime === 'LONG' ? 'LONG' : reportData.dominantRegime === 'SHORT' ? 'SHORT' : 'NEU', color: regimeColor },
                        ].map((m, idx) => (
                          <div key={m.label} style={{
                            textAlign: 'center', padding: '8px 4px',
                            borderRight: idx < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none'
                          }}>
                            <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '3px' }}>{m.label}</div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: m.color, fontFamily: 'var(--font-mono), monospace' }}>{m.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Breadth bar — gainers vs losers (real data) */}
                      {(reportData.gainers + reportData.losers) > 0 && (() => {
                        const total = reportData.gainers + reportData.losers;
                        const upPct = Math.max(0, Math.min(100, (reportData.gainers / total) * 100));
                        const breadthLabel = locale === 'ko' ? '등락 폭' : locale === 'ja' ? '騰落幅' : 'BREADTH';
                        return (
                          <div style={{ marginTop: '11px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em' }}>
                              <span style={{ color: '#34d399', fontFamily: 'var(--font-mono), monospace' }}>{'▲'} {reportData.gainers}</span>
                              <span style={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const }}>{breadthLabel}</span>
                              <span style={{ color: '#f87171', fontFamily: 'var(--font-mono), monospace' }}>{reportData.losers} {'▼'}</span>
                            </div>
                            <div style={{ height: '6px', borderRadius: '999px', overflow: 'hidden', display: 'flex', background: 'rgba(239,68,68,0.30)' }}>
                              <div style={{ width: `${upPct}%`, height: '100%', background: 'linear-gradient(90deg, #059669, #10b981)', transition: 'width 0.4s ease' }} />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Sentiment + Grade */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ font: 'var(--f-small)', color: 'rgba(255,255,255,0.45)', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>{t.sentiment}</span>
                          <span style={{
                            fontWeight: 900, fontSize: '10.5px', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                            padding: '3px 8px', borderRadius: '6px',
                            color: reportData.sentiment.includes('BULL') ? '#10b981' : reportData.sentiment.includes('BEAR') ? '#ef4444' : '#f59e0b',
                            background: reportData.sentiment.includes('BULL') ? 'rgba(16,185,129,0.12)' : reportData.sentiment.includes('BEAR') ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            border: reportData.sentiment.includes('BULL') ? '1px solid rgba(16,185,129,0.2)' : reportData.sentiment.includes('BEAR') ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(245,158,11,0.2)',
                          }}>
                            {reportData.sentiment}
                          </span>
                        </div>
                        {/* Grade Circle */}
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: `${gradeColor}15`, border: `2px solid ${gradeColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', fontWeight: 900, color: gradeColor, fontFamily: 'var(--font-mono), monospace',
                          boxShadow: `0 0 12px ${gradeColor}40`
                        }}>
                          {sectorGrade}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ═══ SECTION 2: KEY STOCKS (Accordion — Default Open) ═══ */}
                <div className="app-card" style={{
                  background: 'rgba(255,255,255,0.015)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '16px', overflow: 'hidden'
                }}>
                  {/* Accordion Header */}
                  <button
                    onClick={() => toggleSection('stocks')}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                      minHeight: '48px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Zap style={{ width: '14px', height: '14px', color: '#22d3ee' }} />
                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', fontFamily: 'var(--font-mono), monospace', textTransform: 'uppercase' as const }}>
                        {t.keyStocks || 'KEY STOCKS'}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono), monospace' }}>
                        ({reportData.keyStocksData.length})
                      </span>
                    </div>
                    <ChevronRight style={{
                      width: '16px', height: '16px', color: 'rgba(255,255,255,0.3)',
                      transform: expandedSections.has('stocks') ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }} />
                  </button>

                  {/* Accordion Content */}
                  <div style={{
                    maxHeight: expandedSections.has('stocks') ? '5000px' : '0',
                    opacity: expandedSections.has('stocks') ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.35s ease, opacity 0.25s ease'
                  }}>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {reportData.keyStocksData.map((stock) => {
                        const isStockUp = (stock.changePct || 0) >= 0;
                        const gradeColors: Record<string, { color: string; bg: string; border: string }> = {
                          'S': { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.3)' },
                          'A': { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
                          'B': { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
                          'C': { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
                          'D': { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' }
                        };
                        const gc = gradeColors[stock.grade] || gradeColors['B'];
                        const isExpanded = expandedStock === stock.sym;
                        const aiAnalysis = stockAiAnalyses[stock.sym];
                        const localizedAiText = (aiAnalysis?.[appLocale] || aiAnalysis?.en || '').trim();
                        const hasGeneratedAi = localizedAiText.length > 0;
                        const isAiPending = Boolean(stockAiLoading[stock.sym]) && !hasGeneratedAi;
                        // analysisKr is the API's Korean-only structural read; for en/ja use the
                        // already-localized generator so the read matches the user's language.
                        const structuralBrief = appLocale === 'ko'
                          ? (stock.analysisKr || getStockAnalyticalBrief(stock, 'ko'))
                          : getStockAnalyticalBrief(stock, appLocale);
                        const aiSourceLabel = hasGeneratedAi ? 'CLAUDE' : isAiPending ? 'AI ANALYZING' : 'STRUCTURAL';
                        const loadingCopy = appLocale === 'ko'
                          ? 'AI 분석을 불러오는 중입니다. 캐시가 있으면 즉시 표시됩니다.'
                          : appLocale === 'ja'
                            ? 'AI分析を読み込み中です。キャッシュがあればすぐ表示されます。'
                            : 'Loading AI analysis. Cached results appear instantly when available.';
                        const structuralLabel = 'STRUCTURAL READ';
                        const claudeLabel = 'CLAUDE BRIEF';

                        return (
                          <div key={stock.sym}>
                            {/* Stock Row — Collapsed */}
                            <button
                              onClick={() => setExpandedStock(isExpanded ? null : stock.sym)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '12px 16px', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'none',
                                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                cursor: 'pointer', minHeight: '52px'
                              }}
                            >
                              {/* Logo */}
                              <StockLogo symbol={stock.sym} />
                              {/* Symbol + RSI */}
                              <div style={{ flex: '0 0 auto', textAlign: 'left' }}>
                                <div style={{ fontSize: '15px', fontWeight: 850, color: '#ffffff', fontFamily: 'var(--font-mono), monospace', letterSpacing: '-0.01em' }}>
                                  {stock.sym}
                                </div>
                                {stock.rsi && stock.rsi > 0 && (() => {
                                  const rsiColor = stock.rsi > 70 ? '#f87171' : stock.rsi < 30 ? '#34d399' : '#64748b';
                                  return (
                                    <div style={{ marginTop: '2px' }}>
                                      <div style={{ fontSize: '10px', fontWeight: 600, color: rsiColor, fontFamily: 'var(--font-mono), monospace', lineHeight: 1 }}>
                                        RSI {Math.round(stock.rsi)}
                                      </div>
                                      <div style={{ width: '44px', height: '3px', borderRadius: '999px', marginTop: '3px', background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.max(0, Math.min(100, stock.rsi))}%`, height: '100%', background: rsiColor, borderRadius: '999px' }} />
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                              {/* Sparkline */}
                              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                <Sparkline data={stock.sparkline || []} isUp={isStockUp} />
                              </div>
                              {/* Score + Change */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono), monospace' }}>
                                    {Math.round(stock.score)}
                                  </div>
                                  <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-mono), monospace', color: isStockUp ? '#10b981' : '#ef4444' }}>
                                    {isStockUp ? '+' : ''}{(stock.changePct || 0).toFixed(2)}%
                                  </div>
                                </div>
                                {/* Grade Circle */}
                                <div style={{
                                  width: '30px', height: '30px', borderRadius: '50%',
                                  background: gc.bg, border: `1.5px solid ${gc.border}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '12px', fontWeight: 900, color: gc.color, fontFamily: 'var(--font-mono), monospace'
                                }}>
                                  {stock.grade}
                                </div>
                              </div>
                            </button>

                            {/* Expanded Detail — Bento Grid */}
                            {isExpanded && (
                              <div style={{
                                /* Minimal side padding so the expanded stock content
                                   uses nearly all available width (matches the top-level
                                   cards; was 16px → felt narrow). */
                                padding: '12px 4px 16px',
                                background: 'rgba(255,255,255,0.015)',
                                borderBottom: '1px solid rgba(255,255,255,0.06)'
                              }}>
                                {/* Price Header */}
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                                  <span style={{ fontSize: '22px', fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono), monospace' }}>
                                    ${(stock.closePrice || 0).toFixed(2)}
                                  </span>
                                  <span style={{ fontSize: '14px', fontWeight: 700, color: isStockUp ? '#10b981' : '#ef4444', fontFamily: 'var(--font-mono), monospace' }}>
                                    {isStockUp ? '+' : ''}{(stock.changePct || 0).toFixed(2)}%
                                  </span>
                                </div>

                                {/* 2×5 Bento Grid Metrics */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                                  {[
                                    { label: 'GEX', tip: 'gex', value: formatGex(stock.gex || 0), color: (stock.gex || 0) > 0 ? '#10b981' : (stock.gex || 0) < 0 ? '#ef4444' : '#94a3b8' },
                                    { label: 'PCR', tip: 'pcr', value: (stock.pcr || 0) > 0 ? (stock.pcr || 0).toFixed(2) : '-', color: (stock.pcr || 0) < 0.7 ? '#10b981' : (stock.pcr || 0) > 1.2 ? '#ef4444' : '#f8fafc' },
                                    { label: 'SQUEEZE', tip: 'squeeze', value: (stock.squeezeScore || 0) > 0 ? `${Math.round(stock.squeezeScore || 0)}%` : '-', color: (stock.squeezeScore || 0) >= 60 ? '#f59e0b' : '#94a3b8' },
                                    { label: 'NET PREM', tip: 'netPremium', value: (stock.netPremium || 0) !== 0 ? `${(stock.netPremium || 0) > 0 ? '+' : ''}$${(Math.abs(stock.netPremium || 0) / 1e6).toFixed(1)}M` : '-', color: (stock.netPremium || 0) > 0 ? '#10b981' : (stock.netPremium || 0) < 0 ? '#ef4444' : '#94a3b8' },
                                    { label: 'PUT FLOOR', tip: 'putFloor', value: stock.putFloor ? `$${stock.putFloor.toFixed(0)}` : '-', color: '#ef4444' },
                                    { label: 'CALL WALL', tip: 'callWall', value: stock.callWall ? `$${stock.callWall.toFixed(0)}` : '-', color: '#10b981' },
                                    { label: 'WHALE', tip: 'whale', value: (stock.whaleIndex || 0) > 0 ? Math.round(stock.whaleIndex || 0).toString() : '-', color: (stock.whaleIndex || 0) >= 70 ? '#06b6d4' : '#94a3b8' },
                                    { label: 'DARK POOL', tip: 'darkPool', value: (stock.darkPoolPct || 0) > 0 ? `${Math.round(stock.darkPoolPct || 0)}%` : '-', color: (stock.darkPoolPct || 0) >= 45 ? '#a78bfa' : '#94a3b8' },
                                    { label: 'IV SKEW', tip: 'ivSkew', value: (stock.ivSkew || 0) !== 0 ? `${(stock.ivSkew || 0) > 0 ? '+' : ''}${(stock.ivSkew || 0).toFixed(1)}%` : '-', color: Math.abs(stock.ivSkew || 0) > 3 ? '#f59e0b' : '#94a3b8' },
                                    { label: 'IMP MOVE', tip: 'impliedMove', value: (stock.impliedMovePct || 0) > 0 ? `±${(stock.impliedMovePct || 0).toFixed(1)}%` : '-', color: (stock.impliedMovePct || 0) > 5 ? '#f59e0b' : '#94a3b8' },
                                  ].map(m => (
                                    <div key={m.label} style={{
                                      background: 'rgba(0,0,0,0.2)', borderRadius: '10px',
                                      padding: '10px 12px', border: '1px solid rgba(255,255,255,0.04)'
                                    }}>
                                      <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '4px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{m.label}<MetricInfo term={m.tip as any} locale={appLocale} size={9} /></div>
                                      <div style={{ fontSize: '15px', fontWeight: 800, color: m.color, fontFamily: 'var(--font-mono), monospace' }}>{m.value}</div>
                                    </div>
                                  ))}
                                </div>

                                {/* Gamma Tunnel Visualization */}
                                {stock.putFloor && stock.callWall && stock.closePrice && stock.putFloor > 0 && stock.callWall > 0 ? (
                                  (() => {
                                    const floor = stock.putFloor || 0;
                                    const wall = stock.callWall || 0;
                                    const price = stock.closePrice || 0;
                                    const maxPain = stock.maxPain || 0;
                                    const range = wall - floor;
                                    if (range <= 0) return null;
                                    const pricePct = clampPct(((price - floor) / range) * 100);
                                    const maxPainPct = maxPain > 0 ? clampPct(((maxPain - floor) / range) * 100) : null;
                                    const maxPainShift = maxPainPct !== null && Math.abs(maxPainPct - pricePct) < 13
                                      ? (maxPainPct <= pricePct ? -18 : 18)
                                      : 0;
                                    const tunnelCopy = appLocale === 'ko'
                                      ? { title: 'GAMMA TUNNEL', floor: 'Put Floor', wall: 'Call Wall', maxPain: 'MaxPain', spot: 'Spot' }
                                      : appLocale === 'ja'
                                        ? { title: 'GAMMA TUNNEL', floor: 'Put Floor', wall: 'Call Wall', maxPain: 'MaxPain', spot: 'Spot' }
                                        : { title: 'GAMMA TUNNEL', floor: 'Put Floor', wall: 'Call Wall', maxPain: 'MaxPain', spot: 'Spot' };

                                    return (
                                      <div style={{ marginBottom: '14px' }}>
                                        <div style={{ fontSize: '9.5px', fontWeight: 800, color: 'rgba(148, 163, 184, 0.72)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
                                          {tunnelCopy.title}
                                        </div>
                                        <div style={{
                                          position: 'relative',
                                          minHeight: '74px',
                                          borderRadius: '14px',
                                          border: '1px solid rgba(34, 211, 238, 0.10)',
                                          background: 'linear-gradient(145deg, rgba(15,23,42,0.58), rgba(2,6,23,0.42))',
                                          padding: '18px 12px 10px',
                                          overflow: 'hidden',
                                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)'
                                        }}>
                                          <div style={{
                                            position: 'relative',
                                            height: '18px',
                                            borderRadius: '999px',
                                            background: 'linear-gradient(90deg, rgba(239,68,68,0.34), rgba(245,158,11,0.26) 45%, rgba(16,185,129,0.34))',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            boxShadow: 'inset 0 0 18px rgba(0,0,0,0.34)'
                                          }}>
                                            <div style={{ position: 'absolute', inset: '0 8px', background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 9px)', opacity: 0.55 }} />

                                            {maxPainPct !== null && (
                                              <>
                                                <div style={{
                                                  position: 'absolute',
                                                  left: `${maxPainPct}%`,
                                                  top: '-8px',
                                                  bottom: '-8px',
                                                  width: '2px',
                                                  borderRadius: '2px',
                                                  background: '#f59e0b',
                                                  boxShadow: '0 0 10px rgba(245,158,11,0.65)',
                                                  transform: 'translateX(-50%)'
                                                }} />
                                                <div style={{
                                                  position: 'absolute',
                                                  left: `calc(${maxPainPct}% + ${maxPainShift}px)`,
                                                  top: '22px',
                                                  transform: 'translateX(-50%)',
                                                  padding: '3px 7px',
                                                  borderRadius: '7px',
                                                  background: 'rgba(245, 158, 11, 0.16)',
                                                  border: '1px solid rgba(245, 158, 11, 0.32)',
                                                  color: '#fbbf24',
                                                  fontSize: '9px',
                                                  fontWeight: 900,
                                                  fontFamily: 'var(--font-mono), monospace',
                                                  whiteSpace: 'nowrap',
                                                  zIndex: 4,
                                                  boxShadow: '0 8px 16px rgba(0,0,0,0.24)'
                                                }}>
                                                  {tunnelCopy.maxPain} ${maxPain.toFixed(0)}
                                                </div>
                                              </>
                                            )}

                                            <div style={{
                                              position: 'absolute',
                                              left: `${pricePct}%`,
                                              top: '-18px',
                                              transform: 'translateX(-50%)',
                                              padding: '3px 8px',
                                              borderRadius: '8px',
                                              background: '#06b6d4',
                                              color: '#00121a',
                                              fontSize: '10px',
                                              fontWeight: 950,
                                              fontFamily: 'var(--font-mono), monospace',
                                              whiteSpace: 'nowrap',
                                              zIndex: 5,
                                              boxShadow: '0 0 14px rgba(34,211,238,0.46)'
                                            }}>
                                              ${price.toFixed(2)}
                                            </div>
                                            <div style={{
                                              position: 'absolute',
                                              left: `${pricePct}%`,
                                              top: '50%',
                                              transform: 'translate(-50%, -50%)',
                                              width: '12px',
                                              height: '12px',
                                              borderRadius: '50%',
                                              background: '#e0faff',
                                              border: '2px solid #06b6d4',
                                              boxShadow: '0 0 0 4px rgba(34,211,238,0.14), 0 0 16px rgba(34,211,238,0.75)',
                                              zIndex: 5
                                            }} />
                                          </div>

                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '26px', gap: '10px' }}>
                                            <div style={{ minWidth: 0 }}>
                                              <div style={{ fontSize: '9px', fontWeight: 900, color: '#fb7185', letterSpacing: '0.04em' }}>{tunnelCopy.floor}</div>
                                              <div style={{ fontSize: '13px', fontWeight: 950, color: '#fecdd3', fontFamily: 'var(--font-mono), monospace' }}>${floor.toFixed(0)}</div>
                                            </div>
                                            <div style={{ minWidth: 0, textAlign: 'right' }}>
                                              <div style={{ fontSize: '9px', fontWeight: 900, color: '#34d399', letterSpacing: '0.04em' }}>{tunnelCopy.wall}</div>
                                              <div style={{ fontSize: '13px', fontWeight: 950, color: '#bbf7d0', fontFamily: 'var(--font-mono), monospace' }}>${wall.toFixed(0)}</div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()
                                ) : null}

                                {/* Expanded Sparkline */}
                                {(stock.sparkline?.length || 0) > 2 && (
                                  <div style={{ marginBottom: '12px' }}>
                                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', marginBottom: '4px' }}>INTRADAY</div>
                                    <div style={{ height: '60px' }}>
                                      <ExpandedSparkline data={stock.sparkline || []} isUp={isStockUp} />
                                    </div>
                                  </div>
                                )}

                                {/* AI Analytical Brief */}
                                <div style={{
                                  background: 'linear-gradient(145deg, rgba(245,158,11,0.08), rgba(15,23,42,0.72) 48%, rgba(2,6,23,0.72))',
                                  border: '1px solid rgba(245,158,11,0.18)',
                                  borderLeft: '3px solid #f59e0b',
                                  borderRadius: '0 14px 14px 0',
                                  padding: '13px 14px',
                                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 24px rgba(0,0,0,0.18)'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                      <Sparkles style={{ width: '12px', height: '12px', color: '#f59e0b', flexShrink: 0 }} />
                                      <span style={{ fontSize: '10px', fontWeight: 900, color: '#f59e0b', letterSpacing: '0.08em', fontFamily: 'var(--font-mono), monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {getBriefTitle(appLocale)}
                                      </span>
                                    </div>
                                    <span style={{
                                      flexShrink: 0,
                                      fontSize: '8.5px',
                                      fontWeight: 900,
                                      color: hasGeneratedAi ? '#67e8f9' : isAiPending ? '#fbbf24' : '#94a3b8',
                                      background: hasGeneratedAi ? 'rgba(6,182,212,0.12)' : isAiPending ? 'rgba(245,158,11,0.12)' : 'rgba(148,163,184,0.10)',
                                      border: hasGeneratedAi ? '1px solid rgba(6,182,212,0.24)' : isAiPending ? '1px solid rgba(245,158,11,0.24)' : '1px solid rgba(148,163,184,0.16)',
                                      borderRadius: '999px',
                                      padding: '3px 7px',
                                      letterSpacing: '0.06em',
                                      fontFamily: 'var(--font-mono), monospace'
                                    }}>
                                      {aiSourceLabel}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }}>
                                    {hasGeneratedAi ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#67e8f9', fontSize: '10px', fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                                          <Sparkles size={12} />
                                          {claudeLabel}
                                        </div>
                                        <div>{formatVerdictText(localizedAiText)}</div>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* AI analyzing — spinner + message above the structural read until Claude arrives. */}
                                        <div style={{
                                          display: 'flex', alignItems: 'center', gap: '9px',
                                          padding: '9px 11px', borderRadius: '10px',
                                          background: 'rgba(245, 158, 11, 0.08)',
                                          border: '1px solid rgba(245, 158, 11, 0.18)'
                                        }}>
                                          <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid rgba(245, 158, 11, 0.25)', borderTopColor: '#fbbf24', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(254, 243, 199, 0.9)', fontSize: '11px', fontWeight: 750, lineHeight: 1.35 }}>
                                            <Sparkles size={11} style={{ color: '#fbbf24', flexShrink: 0 }} /> {loadingCopy}
                                          </span>
                                        </div>
                                        {/* Structural read — instant baseline while the AI brief generates. */}
                                        <div style={{
                                          padding: '10px 11px', borderRadius: '12px',
                                          background: 'rgba(2, 6, 23, 0.36)',
                                          border: '1px solid rgba(148, 163, 184, 0.10)'
                                        }}>
                                          <div style={{ color: '#94a3b8', fontSize: '9.5px', fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '5px' }}>
                                            {structuralLabel}
                                          </div>
                                          <div>{formatVerdictText(structuralBrief)}</div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '7px',
                                    marginTop: '10px',
                                    padding: '9px 10px',
                                    borderRadius: '10px',
                                    background: 'rgba(15, 23, 42, 0.58)',
                                    border: '1px solid rgba(245, 158, 11, 0.16)',
                                    color: 'rgba(226, 232, 240, 0.72)',
                                    fontSize: '10px',
                                    lineHeight: 1.45,
                                    fontWeight: 650
                                  }}>
                                    <span style={{ color: '#f59e0b', fontWeight: 900, whiteSpace: 'nowrap' }}>
                                      {complianceCopy.aiBadge}
                                    </span>
                                    <span>{complianceCopy.aiNote}</span>
                                  </div>
                                  {/* Regime Badge */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                                    <span style={{
                                      fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em',
                                      padding: '2px 8px', borderRadius: '4px',
                                      background: stock.gammaRegime === 'LONG' ? 'rgba(16,185,129,0.12)' : stock.gammaRegime === 'SHORT' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                      color: stock.gammaRegime === 'LONG' ? '#10b981' : stock.gammaRegime === 'SHORT' ? '#ef4444' : '#f59e0b',
                                      border: stock.gammaRegime === 'LONG' ? '1px solid rgba(16,185,129,0.2)' : stock.gammaRegime === 'SHORT' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(245,158,11,0.2)',
                                    }}>
                                      {stock.gammaRegime || 'NEUTRAL'} GAMMA
                                    </span>
                                    {(stock.whaleIndex || 0) >= 60 && (
                                      <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.2)' }}>
                                        WHALE {Math.round(stock.whaleIndex || 0)}
                                      </span>
                                    )}
                                    {(stock.darkPoolPct || 0) >= 40 && (
                                      <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}>
                                        D.POOL {Math.round(stock.darkPoolPct || 0)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ═══ SECTION 3: AI INTELLIGENCE (Accordion — Commander Log + Verdict) ═══ */}
                <div className="app-card" style={{
                  background: 'rgba(255,255,255,0.015)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '16px', overflow: 'hidden'
                }}>
                  <button
                    onClick={() => toggleSection('ai')}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', minHeight: '48px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Brain style={{ width: '14px', height: '14px', color: '#f59e0b' }} />
                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', fontFamily: 'var(--font-mono), monospace', textTransform: 'uppercase' as const }}>
                        AI INTELLIGENCE
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Mini confidence indicator */}
                      <span style={{
                        fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
                        fontFamily: 'var(--font-mono), monospace',
                        background: reportData.avgAlpha >= 60 ? 'rgba(16,185,129,0.12)' : reportData.avgAlpha >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                        color: reportData.avgAlpha >= 60 ? '#10b981' : reportData.avgAlpha >= 40 ? '#f59e0b' : '#ef4444',
                        border: reportData.avgAlpha >= 60 ? '1px solid rgba(16,185,129,0.2)' : reportData.avgAlpha >= 40 ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(239,68,68,0.2)',
                      }}>
                        CTX {Math.round(reportData.avgAlpha)}
                      </span>
                      <ChevronRight style={{
                        width: '16px', height: '16px', color: 'rgba(255,255,255,0.3)',
                        transform: expandedSections.has('ai') ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }} />
                    </div>
                  </button>

                  <div style={{
                    maxHeight: expandedSections.has('ai') ? '3000px' : '0',
                    opacity: expandedSections.has('ai') ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.35s ease, opacity 0.25s ease'
                  }}>
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {/* Context Score Gauge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 0 12px' }}>
                        <svg width="70" height="70" viewBox="0 0 70 70">
                          {(() => {
                            const score = reportData.avgAlpha || 0;
                            const r = 28, cx = 35, cy = 35;
                            const start = 135, end = 405;
                            const scoreAngle = start + (Math.min(score, 100) / 100) * (end - start);
                            const polar = (a: number) => ({ x: cx + r * Math.cos(((a - 90) * Math.PI) / 180), y: cy + r * Math.sin(((a - 90) * Math.PI) / 180) });
                            const arc = (s: number, e: number) => { const sp = polar(s), ep = polar(e); return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`; };
                            const c = score >= 70 ? '#06b6d4' : score >= 50 ? '#10b981' : score >= 30 ? '#f59e0b' : '#f43f5e';
                            return (
                              <>
                                <path d={arc(start, end)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" strokeLinecap="round" />
                                <path d={arc(start, scoreAngle)} fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${c}80)` }} />
                                <text x={cx} y={cy - 2} textAnchor="middle" fill="white" fontSize="20" fontWeight="900" fontFamily="var(--font-mono), monospace" dominantBaseline="central">{score.toFixed(0)}</text>
                                <text x={cx} y={cy + 13} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="7" fontWeight="700" letterSpacing="1.2">CONTEXT</text>
                              </>
                            );
                          })()}
                        </svg>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>
                            QUANT COMMANDER
                          </div>
                          <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>
                            &quot;{getCommanderLogCopy(selectedSector, appLocale, SECTOR_CONFIGS.find(s => s.id === selectedSector)?.commanderLog)}&quot;
                          </div>
                        </div>
                      </div>

                      {/* AI Verdict */}
                      <div style={{
                        borderLeft: '2px solid #f59e0b',
                        background: 'linear-gradient(90deg, rgba(245,158,11,0.04) 0%, rgba(5,10,20,0) 100%)',
                        borderRadius: '0 10px 10px 0',
                        padding: '12px 14px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          <Sparkles style={{ width: '12px', height: '12px', color: '#f59e0b' }} />
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.08em', fontFamily: 'var(--font-mono), monospace' }}>
                            {(t.verdict || 'AI VERDICT').toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }}>
                          {formatVerdictText(reportData.verdict)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══ SECTION 4: KEY CATALYSTS (Accordion) ═══ */}
                {reportData.catalysts && reportData.catalysts.length > 0 && (
                  <div className="app-card" style={{
                    background: 'rgba(255,255,255,0.015)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '16px', overflow: 'hidden'
                  }}>
                    <button
                      onClick={() => toggleSection('catalysts')}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', minHeight: '48px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Target style={{ width: '14px', height: '14px', color: '#22d3ee' }} />
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', fontFamily: 'var(--font-mono), monospace', textTransform: 'uppercase' as const }}>
                          KEY CATALYSTS
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono), monospace' }}>
                          ({reportData.catalysts.length})
                        </span>
                      </div>
                      <ChevronRight style={{
                        width: '16px', height: '16px', color: 'rgba(255,255,255,0.3)',
                        transform: expandedSections.has('catalysts') ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }} />
                    </button>

                    <div style={{
                      maxHeight: expandedSections.has('catalysts') ? '2000px' : '0',
                      opacity: expandedSections.has('catalysts') ? 1 : 0,
                      overflow: 'hidden',
                      transition: 'max-height 0.35s ease, opacity 0.25s ease'
                    }}>
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        {reportData.catalysts.map((catalyst, idx) => {
                          const catalystSymbol = findCatalystSymbol(
                            catalyst,
                            reportData.keyStocksData.map((stock) => stock.sym)
                          );
                          const catalystText = stripCatalystLead(catalyst, catalystSymbol);

                          return (
                            <div key={idx} style={{
                              display: 'grid',
                              gridTemplateColumns: '24px minmax(64px, max-content) 1fr',
                              alignItems: 'start',
                              gap: '8px',
                              padding: '10px 0',
                              borderBottom: idx < reportData.catalysts.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                            }}>
                              <span style={{
                                fontSize: '13px', fontWeight: 800, color: '#22d3ee',
                                fontFamily: 'var(--font-mono), monospace', flexShrink: 0, minWidth: '24px',
                                paddingTop: catalystSymbol ? '3px' : 0
                              }}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              {catalystSymbol ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  minWidth: 0,
                                  paddingTop: '1px'
                                }}>
                                  <StockLogo symbol={catalystSymbol} size={22} />
                                  <span style={{
                                    fontSize: '12.5px',
                                    fontWeight: 850,
                                    color: '#ffffff',
                                    fontFamily: 'var(--font-mono), monospace',
                                    letterSpacing: '0.01em'
                                  }}>
                                    {catalystSymbol}
                                  </span>
                                </span>
                              ) : (
                                <span />
                              )}
                              <span style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(255,255,255,0.7)', minWidth: 0 }}>
                                {formatVerdictText(catalystText)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ SECTION 5: EARNINGS CALENDAR (Accordion — Weekly Grouping) ═══ */}
                {(() => {
                  const earningsCopy = EARNINGS_APP_COPY[appLocale];
                  const earningsStocks = reportData.keyStocksData.map((stock, idx) => {
                    const daysOut = 7 + idx * 12 + Math.floor((stock.score || 50) % 20);
                    const earningsDate = new Date();
                    earningsDate.setDate(earningsDate.getDate() + daysOut);
                    const session = idx % 3 === 0 ? 'BMO' : idx % 3 === 1 ? 'AMC' : 'BMO';
                    return { sym: stock.sym, date: earningsDate, session, grade: stock.grade, daysOut };
                  }).sort((a, b) => a.date.getTime() - b.date.getTime());

                  // Group by week
                  const now = new Date();
                  const endOfThisWeek = new Date(now);
                  endOfThisWeek.setDate(now.getDate() + (7 - now.getDay()));
                  const endOfNextWeek = new Date(endOfThisWeek);
                  endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);

                  const groups: { label: string; items: typeof earningsStocks }[] = [
                    { label: earningsCopy.thisWeek, items: earningsStocks.filter(e => e.date <= endOfThisWeek) },
                    { label: earningsCopy.nextWeek, items: earningsStocks.filter(e => e.date > endOfThisWeek && e.date <= endOfNextWeek) },
                    { label: earningsCopy.later, items: earningsStocks.filter(e => e.date > endOfNextWeek) },
                  ].filter(g => g.items.length > 0);

                  return (
                    <div className="app-card" style={{
                      background: 'rgba(255,255,255,0.015)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: '16px', overflow: 'hidden'
                    }}>
                      <button
                        onClick={() => toggleSection('earnings')}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', minHeight: '48px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <BarChart3 style={{ width: '14px', height: '14px', color: '#a78bfa' }} />
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', fontFamily: 'var(--font-mono), monospace', textTransform: 'uppercase' as const }}>
                            {earningsCopy.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)', letterSpacing: '0.05em' }}>
                            {earningsCopy.upcoming}
                          </span>
                          <ChevronRight style={{
                            width: '16px', height: '16px', color: 'rgba(255,255,255,0.3)',
                            transform: expandedSections.has('earnings') ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease'
                          }} />
                        </div>
                      </button>

                      <div style={{
                        maxHeight: expandedSections.has('earnings') ? '3000px' : '0',
                        opacity: expandedSections.has('earnings') ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.35s ease, opacity 0.25s ease'
                      }}>
                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          {groups.map((group) => (
                            <div key={group.label}>
                              {/* Week Group Header */}
                              <div style={{
                                fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)',
                                letterSpacing: '0.08em', padding: '10px 0 6px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                fontFamily: 'var(--font-mono), monospace'
                              }}>
                                {group.label}
                              </div>
                              {group.items.map((earning, idx) => {
                                const isNear = earning.daysOut <= 14;
                                const sessionColor = earning.session === 'BMO' ? '#f59e0b' : '#a78bfa';
                                const sessionBg = earning.session === 'BMO' ? 'rgba(245,158,11,0.1)' : 'rgba(167,139,250,0.1)';
                                const sessionBorder = earning.session === 'BMO' ? 'rgba(245,158,11,0.25)' : 'rgba(167,139,250,0.25)';

                                return (
                                  <div key={`${earning.sym}-${idx}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 0', minHeight: '48px',
                                    borderBottom: idx < group.items.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none'
                                  }}>
                                    {/* Logo */}
                                    <StockLogo symbol={earning.sym} />
                                    {/* Symbol + Session */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 850, color: '#ffffff', fontFamily: 'var(--font-mono), monospace' }}>
                                          {earning.sym}
                                        </span>
                                        <span style={{
                                          fontSize: '9px', fontWeight: 800, letterSpacing: '0.04em',
                                          padding: '1px 6px', borderRadius: '4px',
                                          background: sessionBg, color: sessionColor,
                                          border: `1px solid ${sessionBorder}`
                                        }}>
                                          {earning.session}
                                        </span>
                                      </div>
                                    </div>
                                    {/* Date + Days Left */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono), monospace' }}>
                                        {formatEarningsDate(earning.date, appLocale)}
                                      </div>
                                      <div style={{
                                        fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono), monospace',
                                        color: isNear ? '#f59e0b' : 'rgba(255,255,255,0.35)',
                                        marginTop: '1px'
                                      }}>
                                        D-{earning.daysOut}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>
            )
          )}
        </div>
      )}


      {/* AD BANNER */}
      <AdBanner />
      <MobileAppFooter />

      {/* INTERSTITIAL AD MODAL / PLACEHOLDER */}
      {showAdModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#050a14',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center'
        }}>
          {/* Animated Spinner or Ad Placeholder visual */}
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '3px solid rgba(34, 211, 238, 0.1)',
            borderTopColor: 'var(--cyan)',
            animation: 'appShimmer 1.5s linear infinite',
            marginBottom: '24px'
          }} />
          <h3 style={{ font: 'var(--f-h1)', color: 'var(--text)', marginBottom: '8px' }}>
            {t.adWarning}
          </h3>
          <p style={{ font: 'var(--f-body)', color: 'var(--text-dim)', maxWidth: '250px', lineHeight: 1.4 }}>
            AdMob Interstitial Ad mockup. Loading next report automatically...
          </p>
          <span className="tnum" style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', marginTop: '32px' }}>
            CLICK COUNTER: {adCount} (Ad shows every 3 clicks)
          </span>
        </div>
      )}
    </div>
  );
}
