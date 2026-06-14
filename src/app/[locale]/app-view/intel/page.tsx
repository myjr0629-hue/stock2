'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { AdBanner } from '@/components/app/AdBanner';
import { useIntelSharedData, type IntelQuote } from '@/hooks/useIntelSharedData';
import { SectorIcon } from '@/components/intel/mobile/SectorIcon';
import { ChevronRight, Bot, Brain, Zap, ArrowLeft, Sparkles } from 'lucide-react';
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
    updateBadge: 'UPD 2H AGO',
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
    updateBadge: 'UPD 2H AGO',
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
    updateBadge: 'UPD 2H AGO',
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

interface SectorReportData {
  sentiment: string;
  verdict: string;
  catalysts: string[];
  keyStocksData: { sym: string; grade: string; score: number; changePct?: number }[];
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
    keyStocksData: [
      { sym: 'NVDA', grade: 'S', score: 88 },
      { sym: 'AAPL', grade: 'A', score: 78 },
      { sym: 'TSLA', grade: 'B', score: 62 },
      { sym: 'MSFT', grade: 'A', score: 76 }
    ]
  },
  silicon_core: {
    sentiment: 'STRONG BULLISH',
    verdict: 'Semiconductor supply chain capacity is fully booked through Q2 2027. TSM is raising pricing leading to margin expansion across silicon designers. AMD is capturing market share.',
    catalysts: [
      'TSM CoWoS packaging capacity expansion',
      'AMD MI325X chip launch targeting H100 benchmarks',
      'HBM3E memory supply bottlenecks easing'
    ],
    keyStocksData: [
      { sym: 'AMD', grade: 'A', score: 81 },
      { sym: 'AVGO', grade: 'S', score: 85 },
      { sym: 'TSM', grade: 'S', score: 92 },
      { sym: 'MU', grade: 'B', score: 68 }
    ]
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
    'overbought', 'oversold',
    // Korean keywords
    '매집', '분산', '강세', '약세', '강세 편향', '약세 편향',
    '감마', '감마 스퀴즈', '감마 플립', '하방 지지', '돌파', '근접', '과매도', '과매수'
  ];
  
  const escapedKeywords = keywords.map(kw => kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'g');
  
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some(kw => kw.toLowerCase() === part.toLowerCase());
        return isMatch ? <strong key={i} style={{ color: '#ffffff', fontWeight: 700 }}>{part}</strong> : part;
      })}
    </>
  );
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

  // Initialize shared data hook
  const sharedData = useIntelSharedData();

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

              const newReport = {
                sentiment,
                verdict,
                catalysts,
                keyStocksData: (data.snapshot.tickers || []).map((tick: any) => ({
                  sym: tick.ticker,
                  grade: tick.grade || 'B',
                  score: tick.alpha_score || tick.score || 55,
                  changePct: tick.change_pct || 0
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

        const newReport = {
          sentiment,
          verdict,
          catalysts,
          keyStocksData: (data.snapshot.tickers || []).map((tick: any) => ({
            sym: tick.ticker,
            grade: tick.grade || 'B',
            score: tick.alpha_score || tick.score || 55,
            changePct: tick.change_pct || 0
          }))
        };

        setReportData(newReport);
        setReportCache(prev => ({ ...prev, [sectorId]: newReport }));
      } else {
        throw new Error();
      }
    } catch {
      // Fallback to demo data or make synthetic report if demo does not exist
      const fallback = DEMO_REPORTS[sectorId] || {
        sentiment: 'NEUTRAL',
        verdict: 'AI analysis suggests macro headwinds are balanced by structural cloud migration. High interest rates remain a drag on leveraged players.',
        catalysts: [
          'Enterprise IT budget renewals in progress',
          'Yield curve stabilization lowering risk premiums'
        ],
        keyStocksData: (SECTOR_CONFIGS.find(s => s.id === sectorId)?.stocks || []).slice(0, 3).map(sym => ({
          sym,
          grade: 'B',
          score: 58
        }))
      };
      setReportData(fallback);
      setReportCache(prev => ({ ...prev, [sectorId]: fallback }));
    } finally {
      setLoading(false);
    }
  };

  // Trigger Interstitial Ad logic on report click
  const handleSectorClick = (sectorId: string) => {
    const newCount = adCount + 1;
    setAdCount(newCount);
    sessionStorage.setItem('intel_ad_count', String(newCount));

    // Show Interstitial Ad every 3 clicks
    if (newCount % 3 === 0) {
      setShowAdModal(true);
      // Simulate ad duration of 2.5 seconds
      setTimeout(() => {
        setShowAdModal(false);
        setSelectedSector(sectorId);
        loadSectorReport(sectorId);
      }, 2500);
    } else {
      setSelectedSector(sectorId);
      loadSectorReport(sectorId);
    }
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
              <h1 style={{
                fontSize: '28px',
                fontWeight: 950,
                color: 'var(--text)',
                margin: 0,
                lineHeight: 1.1
              }}>
                INTEL
              </h1>
              <div style={{
                font: 'var(--f-micro)',
                fontSize: '10px',
                fontWeight: 800,
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginTop: '2px'
              }}>
                SECTOR INTELLIGENCE
              </div>
              {locale !== 'en' && (
                <div style={{
                  font: 'var(--f-micro)',
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  marginTop: '3px',
                  fontWeight: 500
                }}>
                  {locale === 'ko' ? '섹터 인텔리전스' : 'セクター・インテリジェンス'}
                </div>
              )}
            </div>

            {/* Pulsing Status Pill */}
            <div style={{
              background: 'rgba(34, 211, 238, 0.08)',
              border: '1px solid rgba(34, 211, 238, 0.2)',
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
                background: 'var(--cyan)',
                boxShadow: '0 0 6px var(--cyan)',
                animation: 'appPulse 2s infinite'
              }} />
              <span style={{
                font: 'var(--f-micro)',
                fontSize: '9px',
                fontWeight: 900,
                color: 'var(--cyan)',
                letterSpacing: '0.05em'
              }}>
                {TRANSLATIONS.en.updateBadge}
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

      {/* SECTOR CARD LIST */}
      {!selectedSector && (
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
                        <span style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--text)' }}>
                          {englishName}
                        </span>
                        {locale !== 'en' && (
                          <span style={{ font: 'var(--f-micro)', fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {localizedName}
                          </span>
                        )}
                      </div>

                      {/* Descriptions */}
                      <div style={{ font: 'var(--f-micro)', color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.3, display: 'flex', flexDirection: 'column' }}>
                        <span>{englishDesc}</span>
                        {locale !== 'en' && (
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: 1 }}>{localizedDesc}</span>
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
                            font: 'var(--f-micro)',
                            fontSize: '9px',
                            fontWeight: 800,
                            color: sec.gammaPulse.stance === 'STABLE' ? '#10b981' : sec.gammaPulse.stance === 'NEUTRAL' ? '#f59e0b' : '#ef4444',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                          }}>
                            GAMMA PULSE
                          </span>
                          <span style={{ font: 'var(--f-micro)', fontSize: '9px', color: 'var(--text-muted)' }}>
                            · 2hr ago
                          </span>
                        </div>

                        {/* Tickers */}
                        <div style={{ display: 'flex', gap: '3px', marginLeft: '4px' }}>
                          {sec.stocks.slice(0, 4).map((sym) => (
                            <span
                              key={sym}
                              style={{
                                font: 'var(--f-micro)',
                                fontSize: '8px',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.04)',
                                borderRadius: '2px',
                                padding: '0.5px 3px',
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
                      font: 'var(--f-micro)',
                      fontSize: '8px',
                      color: 'var(--text-muted)',
                      opacity: 0.7,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}>
                      {locale === 'ko' ? '리포트 읽기' : locale === 'ja' ? 'レポートを読む' : 'Read Report'}
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
                    <span style={{
                      font: 'var(--f-micro)',
                      fontSize: '8px',
                      fontWeight: 800,
                      color: 'rgba(255, 255, 255, 0.22)',
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase'
                    }}>
                      INTERSTITIAL AD BREAK
                    </span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.05)' }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* SECTOR DETAILED REPORT VIEW */}
      {selectedSector && (
        <div style={{ padding: '12px 0 0' }}>
          {/* Back Navigation Button */}
          <button
            onClick={() => {
              setSelectedSector(null);
              setReportData(null);
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px' }}>
                {/* Sector Header Card */}
                {(() => {
                  const sec = SECTOR_CONFIGS.find(s => s.id === selectedSector);
                  const englishName = sec ? (TRANSLATIONS.en[sec.id] || sec.id) : '';
                  const localizedName = sec ? (t[sec.id] || sec.id) : '';
                  const descKey = sec ? `desc_${sec.id}` : '';
                  const localizedDesc = sec ? (t[descKey] || '') : '';
                  
                  const avgChange = sec ? getSectorChange(sec.id) : 0;
                  const isUp = avgChange >= 0;
                  const badgeColor = isUp ? '#10b981' : '#ef4444';
                  const badgeBg = isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
                  const badgeBorder = isUp ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)';
                  
                  return (
                    <div className="app-card" style={{
                      background: 'linear-gradient(135deg, rgba(16, 28, 52, 0.65) 0%, rgba(8, 14, 28, 0.85) 100%)',
                      borderRadius: '16px',
                      padding: '18px 16px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      {/* Left highlight strip matching sector accent color */}
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '4px',
                        background: sec?.color || 'var(--cyan)'
                      }} />
                      
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          {/* Sector Icon Wrapper */}
                          <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
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
                            {/* Subtitle / Description */}
                            <div style={{ font: 'var(--f-micro)', fontSize: '10.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', lineHeight: 1.3 }}>
                              {localizedDesc}
                            </div>
                          </div>
                        </div>

                        {/* Change / Return Badge */}
                        <div style={{
                          background: badgeBg,
                          border: badgeBorder,
                          borderRadius: '8px',
                          padding: '5px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: badgeColor,
                          fontFamily: 'var(--font-mono), monospace',
                          fontSize: '13px',
                          fontWeight: 800,
                          letterSpacing: '-0.01em',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                        }}>
                          {isUp ? '+' : ''}{avgChange.toFixed(1)}%
                        </div>
                      </div>

                      {/* Sentiment Row */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: '1px solid rgba(255,255,255,0.06)'
                      }}>
                        <span style={{ font: 'var(--f-small)', color: 'rgba(255,255,255,0.45)', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t.sentiment}</span>
                        <span style={{
                          font: 'var(--f-small)',
                          fontWeight: 900,
                          color: reportData.sentiment.includes('BULL') ? '#10b981' : reportData.sentiment.includes('BEAR') ? '#ef4444' : '#f59e0b',
                          background: reportData.sentiment.includes('BULL') ? 'rgba(16, 185, 129, 0.12)' : reportData.sentiment.includes('BEAR') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                          border: reportData.sentiment.includes('BULL') ? '1px solid rgba(16, 185, 129, 0.2)' : reportData.sentiment.includes('BEAR') ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '10.5px',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase'
                        }}>
                          {reportData.sentiment}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* QUANT COMMANDER LOG */}
                {(() => {
                  const sec = SECTOR_CONFIGS.find(s => s.id === selectedSector);
                  if (!sec) return null;
                  return (
                    <div className="app-card" style={{
                      borderLeft: '3px solid #22d3ee',
                      background: 'linear-gradient(90deg, rgba(34, 211, 238, 0.04) 0%, rgba(5, 10, 20, 0) 100%)',
                      borderTop: '1px solid rgba(255,255,255,0.02)',
                      borderRight: '1px solid rgba(255,255,255,0.02)',
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      borderRadius: '12px',
                      padding: '16px'
                    }}>
                      <div className="app-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="app-card-title" style={{ color: '#22d3ee', fontFamily: 'var(--font-mono), monospace', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em' }}>
                          ~ {t.commanderLogLabel.toUpperCase()}
                        </span>
                        <Bot className="w-4 h-4" style={{ color: '#22d3ee' }} />
                      </div>
                      <p style={{ font: 'var(--f-body)', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.6, fontStyle: 'italic', fontWeight: 500, fontSize: '13px', margin: 0 }}>
                        "{sec.commanderLog}"
                      </p>
                    </div>
                  );
                })()}

                {/* AI VERDICT */}
                <div className="app-card" style={{
                  borderLeft: '3px solid #f59e0b',
                  background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.04) 0%, rgba(5, 10, 20, 0) 100%)',
                  borderTop: '1px solid rgba(255,255,255,0.02)',
                  borderRight: '1px solid rgba(255,255,255,0.02)',
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div className="app-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="app-card-title" style={{ color: '#f59e0b', fontFamily: 'var(--font-mono), monospace', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em' }}>
                      ~ {t.verdict.toUpperCase()}
                    </span>
                    <Sparkles className="w-4 h-4" style={{ color: '#f59e0b' }} />
                  </div>
                  <p style={{ font: 'var(--f-body)', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.6, fontSize: '13px', margin: 0 }}>
                    {formatVerdictText(reportData.verdict)}
                  </p>
                </div>

                {/* KEY CATALYSTS */}
                <div className="app-card" style={{
                  background: 'rgba(255, 255, 255, 0.015)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '16px',
                  padding: '16px'
                }}>
                  <div className="app-card-head" style={{ marginBottom: '14px' }}>
                    <span className="app-card-title" style={{ fontFamily: 'var(--font-mono), monospace', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(255, 255, 255, 0.45)' }}>
                      {t.catalysts.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {reportData.catalysts.map((cat, i) => {
                      const numStr = String(i + 1).padStart(2, '0');
                      return (
                        <div 
                          key={i} 
                          style={{ 
                            display: 'flex', 
                            gap: '14px', 
                            alignItems: 'flex-start',
                            paddingBottom: i < reportData.catalysts.length - 1 ? '12px' : '0',
                            borderBottom: i < reportData.catalysts.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
                          }}
                        >
                          <span style={{ 
                            fontFamily: 'var(--font-mono), monospace', 
                            fontSize: '13px', 
                            fontWeight: 800, 
                            color: '#22d3ee', 
                            width: '20px', 
                            flexShrink: 0, 
                            marginTop: '2px' 
                          }}>
                            {numStr}
                          </span>
                          <p style={{ 
                            font: 'var(--f-body)', 
                            color: 'rgba(255, 255, 255, 0.7)', 
                            margin: 0, 
                            lineHeight: 1.5,
                            fontSize: '13px'
                          }}>
                            {cat}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* KEY STOCKS GRID */}
                <div className="app-label" style={{
                  fontFamily: 'var(--font-mono), monospace',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'rgba(255, 255, 255, 0.45)',
                  padding: '12px 16px 6px'
                }}>
                  <span>{t.keyStocks.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '0 var(--s4)' }}>
                  {reportData.keyStocksData.map((stock) => {
                    const gradeColor = stock.grade === 'S' ? '#10b981' : stock.grade === 'A' ? '#22d3ee' : stock.grade === 'B' ? '#f59e0b' : 'rgba(255,255,255,0.45)';
                    const gradeBg = stock.grade === 'S' ? 'rgba(16, 185, 129, 0.08)' : stock.grade === 'A' ? 'rgba(34, 211, 238, 0.08)' : stock.grade === 'B' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)';
                    const gradeBorder = stock.grade === 'S' ? '1px solid rgba(16, 185, 129, 0.2)' : stock.grade === 'A' ? '1px solid rgba(34, 211, 238, 0.2)' : stock.grade === 'B' ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(255,255,255,0.06)';
                    
                    const changeVal = stock.changePct ?? 0;
                    const isPositive = changeVal >= 0;
                    const changeColor = isPositive ? '#10b981' : '#ef4444';
                    return (
                      <div
                        key={stock.sym}
                        style={{
                          background: 'rgba(255, 255, 255, 0.015)',
                          border: '1px solid rgba(255, 255, 255, 0.04)',
                          borderRadius: '12px',
                          padding: '12px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)'
                        }}
                      >
                        {/* Left Side: Logo + Sym */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <StockLogo symbol={stock.sym} />
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono), monospace', letterSpacing: '-0.01em' }}>
                            {stock.sym}
                          </span>
                        </div>

                        {/* Right Side: Score, Change, Grade */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div className="tnum" style={{ fontFamily: 'var(--font-mono), monospace', fontWeight: 700, color: 'rgba(255,255,255,0.45)', fontSize: '11px' }}>
                              Score: {stock.score}
                            </div>
                            <div className="tnum" style={{ fontFamily: 'var(--font-mono), monospace', fontWeight: 800, color: changeColor, fontSize: '11px' }}>
                              {isPositive ? '+' : ''}{changeVal.toFixed(2)}%
                            </div>
                          </div>
                          <span style={{
                            fontFamily: 'var(--font-mono), monospace',
                            fontWeight: 900,
                            color: gradeColor,
                            background: gradeBg,
                            border: gradeBorder,
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                          }}>
                            {stock.grade}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* AD BANNER */}
      <AdBanner />

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
