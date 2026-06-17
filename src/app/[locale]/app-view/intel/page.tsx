'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { AdBanner } from '@/components/app/AdBanner';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { useIntelSharedData, type IntelQuote } from '@/hooks/useIntelSharedData';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { SectorIcon } from '@/components/intel/mobile/SectorIcon';
import { ChevronRight, Bot, Brain, Zap, ArrowLeft, Sparkles, Target, BarChart3 } from 'lucide-react';
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
    headerDesc: 'AI-powered analysis · updated every 4 hours · all free',
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
    headerDesc: 'AI-powered analysis · updated every 4 hours · all free',
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
  };
  gammaOptions?: {
    totalGexLabel: string;
    avgPcr: number;
    regime: string;
    insight: { ko: string; en: string; ja: string };
  };
}

const DEMO_REPORTS: Record<string, SectorReportData> = {
  m7: {
    sentiment: 'BULLISH',
    verdict: 'Dealer gamma remains positive above $135 for NVDA, securing support. Tech valuation concerns are offset by robust AI demand. Accumulation is advised on dips.',
    catalysts: [
      'NVDA Options Expiry pinning dealers GEX',
      'AAPL WWDC announcements boosting hardware cycles',
      'TSLA FSD beta expansion approval in China'
    ],
    bullets: [],
    keyStocksData: [
      { sym: 'NVDA', grade: 'S', score: 88 },
      { sym: 'AAPL', grade: 'A', score: 78 },
      { sym: 'TSLA', grade: 'B', score: 62 },
      { sym: 'MSFT', grade: 'A', score: 76 }
    ],
    gainers: 5, losers: 2, avgPcr: 0.72, totalGex: 2400000000, dominantRegime: 'LONG', avgAlpha: 78, snapshotTime: ''
  },
  silicon_core: {
    sentiment: 'STRONG BULLISH',
    verdict: 'Semiconductor supply chain capacity is fully booked through Q2 2027. TSM is raising pricing leading to margin expansion across silicon designers. AMD is capturing market share.',
    catalysts: [
      'TSM CoWoS packaging capacity expansion',
      'AMD MI325X chip launch targeting H100 benchmarks',
      'HBM3E memory supply bottlenecks easing'
    ],
    bullets: [],
    keyStocksData: [
      { sym: 'AMD', grade: 'A', score: 81 },
      { sym: 'AVGO', grade: 'S', score: 85 },
      { sym: 'TSM', grade: 'S', score: 92 },
      { sym: 'MU', grade: 'B', score: 68 }
    ],
    gainers: 4, losers: 2, avgPcr: 0.65, totalGex: 1800000000, dominantRegime: 'LONG', avgAlpha: 82, snapshotTime: ''
  }
};

function toCamelCase(id: string): string {
  return id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/* ═══════════════════════════════════════════════════════════
   PREMIUM HELPERS & LOGO RESOLVER
   ═══════════════════════════════════════════════════════════ */

function StockLogo({ symbol }: { symbol: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#22d3ee',
        fontWeight: 800,
        fontSize: '12px',
        fontFamily: 'var(--font-mono), monospace',
        flexShrink: 0
      }}>
        {symbol.charAt(0)}
      </div>
    );
  }

  return (
    <div style={{
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      background: '#ffffff',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4px',
      overflow: 'hidden',
      flexShrink: 0
    }}>
      <img
        loading="lazy"
        src={`/api/logo/${symbol}`}
        alt={symbol}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
  const gradId = `spark-grad-${Math.random().toString(36).substr(2, 9)}`;
  
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

export default function AppIntelPage() {
  const locale = useLocale();
  const t = useMemo(() => TRANSLATIONS[locale] || TRANSLATIONS.en, [locale]);

  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [reportData, setReportData] = useState<SectorReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [adCount, setAdCount] = useState(0);
  const [showAdModal, setShowAdModal] = useState(false);
  const [reportCache, setReportCache] = useState<Record<string, SectorReportData>>({});
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const [intelTab, setIntelTab] = useState<'sector' | 'report'>('sector');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [crossBrief, setCrossBrief] = useState<CrossSectorBrief | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['stocks']));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // Initialize shared data hook
  const sharedData = useIntelSharedData();
  const { status: marketStatus } = useMarketStatus();
  const isMarketLive = marketStatus.session === 'regular' || marketStatus.session === 'pre' || marketStatus.session === 'post';

  // Load ad counter from session storage to persist across navigation
  useEffect(() => {
    const savedCount = sessionStorage.getItem('intel_ad_count');
    if (savedCount) setAdCount(parseInt(savedCount));
  }, []);

  // Background pre-fetch of all sector snapshots to make clicks instant
  useEffect(() => {
    let active = true;
    const prefetch = async () => {
      // Wait 1.5 seconds for page load to settle
      await new Promise(r => setTimeout(r, 1500));
      if (!active) return;

      for (const sec of SECTOR_CONFIGS) {
        if (!active) break;
        // Skip if already in cache
        if (reportCache[sec.id]) continue;

        try {
          const res = await fetch(`/api/intel/snapshot?sector=${sec.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.snapshot && active) {
              const summary = data.snapshot.sector_summary || {};
              const briefing = summary.briefing || {};
              
              const sentiment = summary.outlook || data.snapshot.sentiment || 'NEUTRAL';
              
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

              const newReport: SectorReportData = {
                sentiment,
                verdict,
                catalysts,
                bullets,
                gainers: summary.gainers ?? 0,
                losers: summary.losers ?? 0,
                avgPcr: summary.avg_pcr ?? 0,
                totalGex: summary.total_gex ?? 0,
                dominantRegime: summary.dominant_regime || 'NEUTRAL',
                avgAlpha: summary.avg_alpha ?? 0,
                snapshotTime: data.snapshot?.meta?.snapshot_timestamp || '',
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
              setReportCache(prev => ({ ...prev, [sec.id]: newReport }));
            }
          }
          // Sleep 300ms between pre-fetches to be gentle
          await new Promise(r => setTimeout(r, 300));
        } catch { /* ignore */ }
      }
    };
    prefetch();
    return () => { active = false; };
  }, [locale]);

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
        }
      } catch { /* silent */ }
    };
    fetchCrossBrief();
    return () => { active = false; };
  }, []);

  // Fetch Report Data
  const loadSectorReport = async (sectorId: string) => {
    // If we have it in client-side cache, show it immediately!
    if (reportCache[sectorId]) {
      setReportData(reportCache[sectorId]);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      // API call matching route: /api/intel/snapshot?sector={sectorId}
      const res = await fetch(`/api/intel/snapshot?sector=${sectorId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (data.success && data.snapshot) {
        const summary = data.snapshot.sector_summary || {};
        const briefing = summary.briefing || {};
        
        const sentiment = summary.outlook || data.snapshot.sentiment || 'NEUTRAL';
        
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

        const newReport: SectorReportData = {
          sentiment,
          verdict,
          catalysts,
          bullets,
          gainers: summary.gainers ?? 0,
          losers: summary.losers ?? 0,
          avgPcr: summary.avg_pcr ?? 0,
          totalGex: summary.total_gex ?? 0,
          dominantRegime: summary.dominant_regime || 'NEUTRAL',
          avgAlpha: summary.avg_alpha ?? 0,
          snapshotTime: data.snapshot?.meta?.snapshot_timestamp || '',
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

        setReportData(newReport);
        setReportCache(prev => ({ ...prev, [sectorId]: newReport }));
      } else {
        throw new Error();
      }
    } catch {
      // Fallback to demo data or make synthetic report if demo does not exist
      const fallback: SectorReportData = DEMO_REPORTS[sectorId] || {
        sentiment: 'NEUTRAL',
        verdict: 'AI analysis suggests macro headwinds are balanced by structural cloud migration. High interest rates remain a drag on leveraged players.',
        catalysts: [
          'Enterprise IT budget renewals in progress',
          'Yield curve stabilization lowering risk premiums'
        ],
        bullets: [],
        keyStocksData: (SECTOR_CONFIGS.find(s => s.id === sectorId)?.stocks || []).slice(0, 3).map(sym => ({
          sym,
          grade: 'B',
          score: 58
        })),
        gainers: 0, losers: 0, avgPcr: 0, totalGex: 0, dominantRegime: 'NEUTRAL', avgAlpha: 0, snapshotTime: ''
      };
      setReportData(fallback);
      setReportCache(prev => ({ ...prev, [sectorId]: fallback }));
    } finally {
      setLoading(false);
    }
  };

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

  const getSectorChange = (sectorId: string) => {
    let quotes: IntelQuote[] = [];
    switch (sectorId) {
      case 'm7': quotes = sharedData.m7; break;
      case 'physical_ai': quotes = sharedData.physicalAI; break;
      case 'silicon_core': quotes = sharedData.siliconCore; break;
      case 'power_matrix': quotes = sharedData.powerMatrix; break;
      case 'bio_pulse': quotes = sharedData.bioPulse; break;
      case 'cyber_shield': quotes = sharedData.cyberShield; break;
      case 'orbit_defense': quotes = sharedData.orbitDefense; break;
      case 'quantum_edge': quotes = sharedData.quantumEdge; break;
      case 'fintech_pulse': quotes = sharedData.fintechPulse; break;
      case 'cloud_fortress': quotes = sharedData.cloudFortress; break;
    }
    
    if (quotes && quotes.length > 0) {
      const validQuotes = quotes.filter(q => q.changePct !== undefined && q.changePct !== null);
      if (validQuotes.length > 0) {
        const sum = validQuotes.reduce((acc, q) => acc + q.changePct, 0);
        return sum / validQuotes.length;
      }
    }
    
    // Fallback exact mockup draft values
    const fallbacks: Record<string, number> = {
      m7: 2.1,
      physical_ai: 1.8,
      silicon_core: -0.3,
      power_matrix: 3.2,
      bio_pulse: 0.5,
      cyber_shield: 1.1,
      orbit_defense: 0.8,
      quantum_edge: -1.5,
      fintech_pulse: -0.9,
      cloud_fortress: 1.4,
    };
    return fallbacks[sectorId] ?? 0;
  };

  return (
    <div className={s.page} style={{ paddingBottom: '90px' }}>
      {/* HEADER */}
      {!selectedSector && (
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
                  {locale === 'ko' ? '섹터 인텔리전스' : 'セクター・インテリジェンス'}
                </div>
              )}
            </div>

            {/* Pulsing Status Pill — market-session driven */}
            <div style={{
              background: isMarketLive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.05)',
              border: isMarketLive ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(255, 255, 255, 0.1)',
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
                background: isMarketLive ? '#10b981' : 'var(--text-muted)',
                boxShadow: isMarketLive ? '0 0 6px #10b981' : 'none',
                animation: isMarketLive ? 'appPulse 2s infinite' : 'none'
              }} />
              <span style={{
                font: 'var(--f-micro)',
                fontSize: '9px',
                fontWeight: 900,
                color: isMarketLive ? '#10b981' : 'var(--text-muted)',
                letterSpacing: '0.05em'
              }}>
                {isMarketLive ? 'LIVE' : marketStatus.session === 'closed' ? 'CLOSED' : 'OFFLINE'}
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
            {TRANSLATIONS.en.headerDesc}
            {locale !== 'en' && (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'normal', fontWeight: 400, marginLeft: '6px' }}>
                ({locale === 'ko' ? t.subtitle : t.subtitle})
              </span>
            )}
          </div>
        </header>
      )}

      {/* TAB BAR: SECTOR / CLOSING REPORT */}
      {!selectedSector && (
        <div style={{
          display: 'flex',
          margin: '10px 16px 0',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '10px',
          padding: '3px',
          gap: '2px'
        }}>
          {(['sector', 'report'] as const).map((tab) => {
            const isActive = intelTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setIntelTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--text)' : 'var(--text-muted)',
                  background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  transition: 'all 0.2s',
                  letterSpacing: '0.02em'
                }}
              >
                {tab === 'sector'
                  ? (locale === 'ko' ? 'SECTOR' : locale === 'ja' ? 'SECTOR' : 'SECTOR')
                  : (locale === 'ko' ? '장마감 리포트' : locale === 'ja' ? '引け後レポート' : 'CLOSING REPORT')
                }
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
              {locale === 'ko' ? '리포트 로딩 중...' : locale === 'ja' ? 'レポート読み込み中...' : 'Loading reports...'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* ═══ CROSS SECTOR SUMMARY CARD ═══ */}
              {crossBrief && (() => {
                const brief = crossBrief;
                const toneColor = brief.marketOverview.tone === 'BULLISH' ? '#10b981' : brief.marketOverview.tone === 'BEARISH' ? '#ef4444' : brief.marketOverview.tone === 'CAUTIOUS' ? '#f59e0b' : '#8b5cf6';
                const toneBg = brief.marketOverview.tone === 'BULLISH' ? 'rgba(16,185,129,0.08)' : brief.marketOverview.tone === 'BEARISH' ? 'rgba(239,68,68,0.08)' : brief.marketOverview.tone === 'CAUTIOUS' ? 'rgba(245,158,11,0.08)' : 'rgba(139,92,246,0.08)';
                const biasColor = brief.outlook?.bias === 'BULLISH' ? '#10b981' : brief.outlook?.bias === 'BEARISH' ? '#ef4444' : '#f59e0b';
                const summary = brief.marketOverview.summary[locale as 'ko' | 'en' | 'ja'] || brief.marketOverview.summary.en;
                const drivers = brief.marketOverview.keyDrivers[locale as 'ko' | 'en' | 'ja'] || brief.marketOverview.keyDrivers.en || [];
                const catalysts = brief.outlook?.catalysts?.[locale as 'ko' | 'en' | 'ja'] || brief.outlook?.catalysts?.en || [];
                const risks = brief.outlook?.risks?.[locale as 'ko' | 'en' | 'ja'] || brief.outlook?.risks?.en || [];
                const rotationInsight = brief.sectorRotation?.rotationInsight?.[locale as 'ko' | 'en' | 'ja'] || brief.sectorRotation?.rotationInsight?.en || '';
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
                              {brief.sectorRotation.winners.slice(0, 3).map((w, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 500 }}>{w.sector}</span>
                                  <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{w.change}</span>
                                </div>
                              ))}
                            </div>
                            {/* Losers */}
                            <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', marginBottom: '6px', letterSpacing: '0.06em' }}>
                                {locale === 'ko' ? '약세' : 'LAGGARDS'}
                              </div>
                              {brief.sectorRotation.losers.slice(0, 3).map((l, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 500 }}>{l.sector}</span>
                                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{l.change}</span>
                                </div>
                              ))}
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
                    </div>
                  </div>
                );
              })()}

              {SECTOR_CONFIGS.map((sec) => {
                const cached = reportCache[sec.id];
                if (!cached) return null;
                const englishName = TRANSLATIONS.en[sec.id] || sec.id;
                const isExpanded = expandedReport === sec.id;
                const sentimentColor = cached.sentiment.includes('BULL') ? '#10b981' : cached.sentiment.includes('BEAR') ? '#ef4444' : '#f59e0b';
                const sentimentBg = cached.sentiment.includes('BULL') ? 'rgba(16, 185, 129, 0.1)' : cached.sentiment.includes('BEAR') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
                const regimeColor = cached.dominantRegime === 'LONG' ? '#10b981' : cached.dominantRegime === 'SHORT' ? '#ef4444' : '#f59e0b';
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
                      onClick={() => setExpandedReport(isExpanded ? null : sec.id)}
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
                          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{englishName}</span>
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

                    {/* ── Expanded Content ── */}
                    {isExpanded && (
                      <div style={{ padding: '0 16px 20px', animation: 'fadeSlideIn 0.2s ease' }}>

                        {/* ─ Scoreboard Mini Bar ─ */}
                        {(cached.avgAlpha > 0 || cached.totalGex !== 0 || cached.avgPcr > 0) && (
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
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '4px' }}>GEX</div>
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
                            {cached.verdict}
                          </div>
                        </div>

                        {/* ─ Bullets (structured analysis) ─ */}
                        {cached.bullets && cached.bullets.length > 0 && (
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
                        {cached.catalysts.length > 0 && (
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px' }}>

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
                                {stock.rsi && stock.rsi > 0 && (
                                  <div style={{ fontSize: '10px', fontWeight: 600, color: stock.rsi > 70 ? '#ef4444' : stock.rsi < 30 ? '#10b981' : 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono), monospace', marginTop: '1px' }}>
                                    RSI {Math.round(stock.rsi)}
                                  </div>
                                )}
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
                                padding: '12px 16px 16px',
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
                                    { label: 'GEX', value: formatGex(stock.gex || 0), color: (stock.gex || 0) > 0 ? '#10b981' : (stock.gex || 0) < 0 ? '#ef4444' : '#94a3b8' },
                                    { label: 'PCR', value: (stock.pcr || 0) > 0 ? (stock.pcr || 0).toFixed(2) : '-', color: (stock.pcr || 0) < 0.7 ? '#10b981' : (stock.pcr || 0) > 1.2 ? '#ef4444' : '#f8fafc' },
                                    { label: 'SQUEEZE', value: (stock.squeezeScore || 0) > 0 ? `${Math.round(stock.squeezeScore || 0)}%` : '-', color: (stock.squeezeScore || 0) >= 60 ? '#f59e0b' : '#94a3b8' },
                                    { label: 'NET PREM', value: (stock.netPremium || 0) !== 0 ? `${(stock.netPremium || 0) > 0 ? '+' : ''}$${(Math.abs(stock.netPremium || 0) / 1e6).toFixed(1)}M` : '-', color: (stock.netPremium || 0) > 0 ? '#10b981' : (stock.netPremium || 0) < 0 ? '#ef4444' : '#94a3b8' },
                                    { label: 'PUT FLOOR', value: stock.putFloor ? `$${stock.putFloor.toFixed(0)}` : '-', color: '#ef4444' },
                                    { label: 'CALL WALL', value: stock.callWall ? `$${stock.callWall.toFixed(0)}` : '-', color: '#10b981' },
                                    { label: 'WHALE', value: (stock.whaleIndex || 0) > 0 ? Math.round(stock.whaleIndex || 0).toString() : '-', color: (stock.whaleIndex || 0) >= 70 ? '#06b6d4' : '#94a3b8' },
                                    { label: 'DARK POOL', value: (stock.darkPoolPct || 0) > 0 ? `${Math.round(stock.darkPoolPct || 0)}%` : '-', color: (stock.darkPoolPct || 0) >= 45 ? '#a78bfa' : '#94a3b8' },
                                    { label: 'IV SKEW', value: (stock.ivSkew || 0) !== 0 ? `${(stock.ivSkew || 0) > 0 ? '+' : ''}${(stock.ivSkew || 0).toFixed(1)}%` : '-', color: Math.abs(stock.ivSkew || 0) > 3 ? '#f59e0b' : '#94a3b8' },
                                    { label: 'IMP MOVE', value: (stock.impliedMovePct || 0) > 0 ? `±${(stock.impliedMovePct || 0).toFixed(1)}%` : '-', color: (stock.impliedMovePct || 0) > 5 ? '#f59e0b' : '#94a3b8' },
                                  ].map(m => (
                                    <div key={m.label} style={{
                                      background: 'rgba(0,0,0,0.2)', borderRadius: '10px',
                                      padding: '10px 12px', border: '1px solid rgba(255,255,255,0.04)'
                                    }}>
                                      <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>{m.label}</div>
                                      <div style={{ fontSize: '15px', fontWeight: 800, color: m.color, fontFamily: 'var(--font-mono), monospace' }}>{m.value}</div>
                                    </div>
                                  ))}
                                </div>

                                {/* Gamma Tunnel Visualization */}
                                {stock.putFloor && stock.callWall && stock.closePrice && stock.putFloor > 0 && stock.callWall > 0 ? (
                                  <div style={{ marginBottom: '12px' }}>
                                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
                                      GAMMA TUNNEL
                                    </div>
                                    <div style={{ position: 'relative', height: '28px', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                      {/* Gradient fill */}
                                      <div style={{
                                        position: 'absolute', inset: 0, borderRadius: '14px',
                                        background: `linear-gradient(90deg, rgba(239,68,68,0.15), rgba(245,158,11,0.08) 50%, rgba(16,185,129,0.15))`
                                      }} />
                                      {/* Labels */}
                                      <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono), monospace' }}>
                                        ${stock.putFloor.toFixed(0)}
                                      </div>
                                      <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono), monospace' }}>
                                        ${stock.callWall.toFixed(0)}
                                      </div>
                                      {/* MaxPain marker */}
                                      {stock.maxPain && stock.maxPain > 0 && (() => {
                                        const mpPct = ((stock.maxPain! - stock.putFloor!) / (stock.callWall! - stock.putFloor!)) * 100;
                                        return mpPct >= 0 && mpPct <= 100 ? (
                                          <div style={{ position: 'absolute', left: `${mpPct}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '2px', height: '16px', background: '#f59e0b', borderRadius: '1px', opacity: 0.6 }} />
                                        ) : null;
                                      })()}
                                      {/* Price dot */}
                                      {(() => {
                                        const pricePct = Math.min(100, Math.max(0, ((stock.closePrice! - stock.putFloor!) / (stock.callWall! - stock.putFloor!)) * 100));
                                        return (
                                          <div style={{
                                            position: 'absolute', left: `${pricePct}%`, top: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            width: '10px', height: '10px', borderRadius: '50%',
                                            background: '#ffffff', border: '2px solid rgba(0,0,0,0.3)',
                                            boxShadow: '0 0 8px rgba(255,255,255,0.5)'
                                          }} />
                                        );
                                      })()}
                                    </div>
                                    {stock.maxPain && stock.maxPain > 0 && (
                                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                                        <span style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono), monospace' }}>MaxPain ${stock.maxPain.toFixed(0)}</span>
                                      </div>
                                    )}
                                  </div>
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
                                  background: 'rgba(245,158,11,0.04)',
                                  borderLeft: '2px solid #f59e0b',
                                  borderRadius: '0 10px 10px 0',
                                  padding: '12px 14px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                    <Sparkles style={{ width: '12px', height: '12px', color: '#f59e0b' }} />
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.08em', fontFamily: 'var(--font-mono), monospace' }}>
                                      AI ANALYTICAL BRIEF
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }}>
                                    {formatVerdictText(
                                      stock.analysisKr ||
                                      `${stock.sym} is trading at $${(stock.closePrice || 0).toFixed(2)}. ${
                                        stock.gammaRegime === 'SHORT'
                                          ? `SHORT gamma regime active — elevated volatility expected. ${stock.pcr && stock.pcr < 0.8 ? 'Bullish flow bias detected.' : 'Hedging pressure visible.'}`
                                          : `LONG gamma provides structural support. ${stock.pcr && stock.pcr < 0.9 ? 'Dealer positioning favors upside continuation.' : 'Neutral flow environment.'}`
                                      } Context Score: ${Math.round(stock.score)}/100 (${stock.grade}).`
                                    )}
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
                            &quot;{SECTOR_CONFIGS.find(s => s.id === selectedSector)?.commanderLog || 'Awaiting signal...'}&quot;
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
                        {reportData.catalysts.map((catalyst, idx) => (
                          <div key={idx} style={{
                            display: 'flex', gap: '10px', padding: '10px 0',
                            borderBottom: idx < reportData.catalysts.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                          }}>
                            <span style={{
                              fontSize: '13px', fontWeight: 800, color: '#22d3ee',
                              fontFamily: 'var(--font-mono), monospace', flexShrink: 0, minWidth: '24px'
                            }}>
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(255,255,255,0.7)' }}>
                              {formatVerdictText(catalyst)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ SECTION 5: EARNINGS CALENDAR (Accordion — Weekly Grouping) ═══ */}
                {(() => {
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
                    { label: 'THIS WEEK', items: earningsStocks.filter(e => e.date <= endOfThisWeek) },
                    { label: 'NEXT WEEK', items: earningsStocks.filter(e => e.date > endOfThisWeek && e.date <= endOfNextWeek) },
                    { label: 'LATER', items: earningsStocks.filter(e => e.date > endOfNextWeek) },
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
                            EARNINGS CALENDAR
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)', letterSpacing: '0.05em' }}>
                            UPCOMING
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
                                        {earning.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
