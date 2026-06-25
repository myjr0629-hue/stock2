'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { useGuardian } from '@/components/guardian/GuardianProvider';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';
import GuardianAlertBanner from '@/components/guardian/GuardianAlertBanner';
import useSWR from 'swr';
import { Eye, Shield, Activity, Map } from 'lucide-react';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import s from '../dash/dash.module.css';
import { AdBanner } from '@/components/app/AdBanner';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { SwipeableTabs } from '@/components/app/SwipeableTabs';

/* ═══════════════════════════════════════════════════════════
   3-LANGUAGE LOCALIZATION DICTIONARY
   ═══════════════════════════════════════════════════════════ */

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ko: {
    macroTitle: '가디언 매크로 리스크',
    liveMonitor: '매크로 리스크 모니터 · LIVE',
    rlsiLabel: '종합 RLSI 지수',
    tabOverview: 'AI 요약',
    tabReality: '시장 현황',
    tabShield: '방어 지표',
    tabFlow: '기관 플로우',
    headerSub: '매크로 리스크 감시',
    macroStrip: '리스크 스트립',
    fgLabel: '공포·탐욕',
    vixLabel: 'VIX',
    spxLabel: 'S&P 500',
    ndxLabel: 'NASDAQ 100',
    extremeGreed: '극단적 탐욕',
    greed: '탐욕',
    neutral: '중립',
    fear: '공포',
    extremeFear: '극단적 공포',
    vixExtreme: '극단적 변동성',
    vixElevated: '변동성 상승',
    vixNormal: '정상 변동성',
    vixLow: '안정',
    dxyStrong: '강달러',
    dxyFirm: '달러 견조',
    dxyNeutral: '달러 중립',
    dxyWeak: '약달러',
  },
  en: {
    macroTitle: 'GUARDIAN MACRO',
    liveMonitor: 'MACRO RISK MONITOR · LIVE',
    rlsiLabel: 'COMPOSITE RLSI',
    tabOverview: 'AI Overview',
    tabReality: 'Reality',
    tabShield: 'Shield',
    tabFlow: 'Flow',
    headerSub: 'Macro Risk Sentinel',
    macroStrip: 'Risk Strip',
    fgLabel: 'Fear&Greed',
    vixLabel: 'VIX',
    spxLabel: 'S&P 500',
    ndxLabel: 'NASDAQ 100',
    extremeGreed: 'EXTREME GREED',
    greed: 'GREED',
    neutral: 'NEUTRAL',
    fear: 'FEAR',
    extremeFear: 'EXTREME FEAR',
    vixExtreme: 'EXTREME',
    vixElevated: 'ELEVATED',
    vixNormal: 'NORMAL',
    vixLow: 'LOW',
    dxyStrong: 'STRONG',
    dxyFirm: 'FIRM',
    dxyNeutral: 'NEUTRAL',
    dxyWeak: 'WEAK',
  },
  ja: {
    macroTitle: 'ガーディアン・マクロ',
    liveMonitor: 'マクロリスク・モニター · LIVE',
    rlsiLabel: '総合 RLSI 指数',
    tabOverview: 'AI 要約',
    tabReality: '市場現況',
    tabShield: '防御指標',
    tabFlow: '機関フロー',
    headerSub: 'マクロリスク監視',
    macroStrip: 'リスクストリップ',
    fgLabel: '恐怖・強欲',
    vixLabel: 'VIX',
    spxLabel: 'S&P 500',
    ndxLabel: 'NASDAQ 100',
    extremeGreed: '極限の強気',
    greed: '強気',
    neutral: '中立',
    fear: '弱気',
    extremeFear: '極限の弱気',
    vixExtreme: '極限のボラティリティ',
    vixElevated: '上昇',
    vixNormal: '正常',
    vixLow: '安定',
    dxyStrong: 'ドル高',
    dxyFirm: 'ドル堅調',
    dxyNeutral: 'ドル中立',
    dxyWeak: 'ドル安',
  }
};

// Lazy-loaded tab components from original components
const MobileGuardianOverview = dynamic(() => import('@/components/guardian/mobile/MobileGuardianOverview'), { ssr: false });
const MobileGuardianReality = dynamic(() => import('@/components/guardian/mobile/MobileGuardianReality'), { ssr: false });
const MobileGuardianShield = dynamic(() => import('@/components/guardian/mobile/MobileGuardianShield'), { ssr: false });
const MobileGuardianFlow = dynamic(() => import('@/components/guardian/mobile/MobileGuardianFlow'), { ssr: false });

type TabKey = 'overview' | 'reality' | 'shield' | 'flow';

const indexFetcher = (url: string) => fetch(url).then(r => r.json());
interface IndexQuote { price: number; changePct: number; updatedAt: string; }
interface IndexCloseData { nasdaq: IndexQuote | null; dow: IndexQuote | null; spx: IndexQuote | null; }

function tabFromParam(param: string | null): TabKey {
  if (param === 'reality') return 'reality';
  if (param === 'shield') return 'shield';
  if (param === 'flow') return 'flow';
  return 'overview';
}

function GuardianPageContent() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const t = useMemo(() => TRANSLATIONS[locale] || TRANSLATIONS.en, [locale]);

  const { data: globalData, loading, alerts, connectionMode, rlsi } = useGuardian();
  const data = globalData as any;
  const { snapshot } = useMacroSnapshot();
  const { status: marketStatusInfo } = useMarketStatus();
  const { data: idxData } = useSWR<IndexCloseData>('/api/market/index-close', indexFetcher, { refreshInterval: 60000, dedupingInterval: 30000 });
  const [activeTab, setActiveTab] = useState<TabKey>(() => tabFromParam(tabParam));
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabParamRef = useRef(tabParam);

  // Sync activeTab with tabParam if provided
  useEffect(() => {
    if (tabParamRef.current !== tabParam) {
      tabParamRef.current = tabParam;
      const nextTab = tabFromParam(tabParam);
      const raf = requestAnimationFrame(() => setActiveTab(nextTab));
      return () => cancelAnimationFrame(raf);
    }
  }, [tabParam]);

  // Macro Pill Status Helpers
  const getFgStatus = (score: number) => {
    if (score >= 75) return { label: t.extremeGreed, color: '#34d399', border: 'rgba(16, 185, 129, 0.25)', bg: 'rgba(16, 185, 129, 0.06)' };
    if (score >= 55) return { label: t.greed, color: '#86efac', border: 'rgba(16, 185, 129, 0.15)', bg: 'rgba(16, 185, 129, 0.04)' };
    if (score >= 45) return { label: t.neutral, color: '#94a3b8', border: 'rgba(255,255,255,0.06)', bg: 'rgba(255,255,255,0.02)' };
    if (score >= 25) return { label: t.fear, color: '#f59e0b', border: 'rgba(245, 158, 11, 0.15)', bg: 'rgba(245, 158, 11, 0.04)' };
    return { label: t.extremeFear, color: '#f43f5e', border: 'rgba(239, 68, 68, 0.25)', bg: 'rgba(239, 68, 68, 0.06)' };
  };

  const getVixStatus = (v: number) => {
    if (v <= 0) return { label: '—', color: '#94a3b8', border: 'rgba(255, 255, 255, 0.06)', bg: 'rgba(255, 255, 255, 0.02)' };
    if (v > 30) return { label: t.vixExtreme, color: '#f43f5e', border: 'rgba(239, 68, 68, 0.25)', bg: 'rgba(239, 68, 68, 0.06)' };
    if (v > 20) return { label: t.vixElevated, color: '#f59e0b', border: 'rgba(245, 158, 11, 0.15)', bg: 'rgba(245, 158, 11, 0.04)' };
    if (v > 15) return { label: t.vixNormal, color: '#94a3b8', border: 'rgba(255, 255, 255, 0.06)', bg: 'rgba(255, 255, 255, 0.02)' };
    return { label: t.vixLow, color: '#34d399', border: 'rgba(16, 185, 129, 0.15)', bg: 'rgba(16, 185, 129, 0.04)' };
  };

  const getIndexStatus = (chg: number | null) => {
    if (chg === null) return { color: '#94a3b8', border: 'rgba(255, 255, 255, 0.06)', bg: 'rgba(255, 255, 255, 0.02)' };
    if (chg >= 0) {
      return { color: '#34d399', border: 'rgba(52, 211, 153, 0.25)', bg: 'rgba(52, 211, 153, 0.06)' };
    } else {
      return { color: '#f43f5e', border: 'rgba(239, 68, 68, 0.25)', bg: 'rgba(239, 68, 68, 0.06)' };
    }
  };

  // Macro data
  const fgScore = rlsi?.components?.sentimentScore ?? 0;
  const vix = snapshot?.factors?.vix?.level ?? 0;
  const vixChg = snapshot?.factors?.vix?.chgPct ?? 0;
  const fgStatus = getFgStatus(fgScore);
  const vixStatus = getVixStatus(vix);

  const spxPrice = snapshot?.factors?.spx?.level ?? idxData?.spx?.price ?? null;
  const spxChg = snapshot?.factors?.spx?.chgPct ?? idxData?.spx?.changePct ?? null;
  const spxStatus = getIndexStatus(spxChg);

  const ndxPrice = snapshot?.factors?.nasdaq100?.level ?? idxData?.nasdaq?.price ?? null;
  const ndxChg = snapshot?.factors?.nasdaq100?.chgPct ?? idxData?.nasdaq?.changePct ?? null;
  const ndxStatus = getIndexStatus(ndxChg);

  // RLSI score color
  const rlsiScore = data?.rlsi?.score ?? 0;
  const rlsiColor = rlsiScore >= 60 ? '#34d399' : rlsiScore >= 40 ? '#fbbf24' : '#f87171';

  // Tab configurations
  const TABS_CONFIG = [
    { key: 'overview' as TabKey, label: t.tabOverview, icon: Eye },
    { key: 'reality' as TabKey, label: t.tabReality, icon: Activity },
    { key: 'shield' as TabKey, label: t.tabShield, icon: Shield },
    { key: 'flow' as TabKey, label: t.tabFlow, icon: Map },
  ];

  // Tab scroll active effect
  useEffect(() => {
    if (!tabsRef.current) return;
    const activeEl = tabsRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  const handleTabSwitch = useCallback((tab: TabKey) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    setActiveTab(tab);
  }, []);

  // Verdict computation
  const verdict = useMemo(() => {
    if (!data || !data.verdict) return {
      title: 'SYSTEM INITIALIZING...',
      desc: 'ESTABLISHING SECURE CONNECTION TO GUARDIAN NODE...',
      color: 'text-slate-500',
      sentiment: 'NEUTRAL' as const,
      realityInsight: undefined as string | undefined,
    };
    const v = data.verdict;
    let color = 'text-slate-300';
    if (v.sentiment === 'BULLISH') color = 'text-emerald-400';
    if (v.sentiment === 'BEARISH') color = 'text-rose-400';
    return {
      title: v.title,
      desc: v.description,
      color,
      sentiment: v.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
      realityInsight: v.realityInsight as string | undefined,
      gammaInsight: v.gammaInsight as string | undefined,
    };
  }, [data]);

  const session = data?.rlsi?.session;
  const isRiskStreamActive = session === 'REG' || session === 'PRE' || session === 'POST';
  const isVolMetricActive = session === 'REG' || session === 'POST';
  const sessionBadge = (() => {
    if (marketStatusInfo.isHoliday) return { label: 'HOLIDAY', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)' };
    if (session === 'REG') return { label: 'LIVE', color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.32)' };
    if (session === 'PRE') return { label: 'PRE', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.32)' };
    if (session === 'POST') return { label: 'AFTER', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.32)' };
    return { label: 'CLOSED', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.18)' };
  })();

  const macroCards = [
    {
      key: 'fg',
      label: t.fgLabel,
      value: fgScore > 0 ? fgScore.toFixed(0) : '—',
      sub: fgStatus.label,
      color: fgStatus.color,
      border: fgStatus.border,
      bg: fgStatus.bg,
      active: false,
    },
    {
      key: 'vix',
      label: t.vixLabel,
      value: vix > 0 ? vix.toFixed(1) : '—',
      sub: `${vixChg >= 0 ? '+' : ''}${vixChg.toFixed(1)}%`,
      color: vixStatus.color,
      subColor: vixChg >= 0 ? 'var(--red)' : 'var(--green)',
      border: vixStatus.border,
      bg: vixStatus.bg,
      active: isVolMetricActive && vix > 0,
    },
    {
      key: 'spx',
      label: t.spxLabel,
      value: spxChg !== null ? `${spxChg >= 0 ? '+' : ''}${spxChg.toFixed(2)}%` : '—',
      sub: spxPrice !== null ? Number(spxPrice).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
      color: spxStatus.color,
      border: spxStatus.border,
      bg: spxStatus.bg,
      active: isRiskStreamActive && spxChg !== null,
    },
    {
      key: 'ndx',
      label: t.ndxLabel,
      value: ndxChg !== null ? `${ndxChg >= 0 ? '+' : ''}${ndxChg.toFixed(2)}%` : '—',
      sub: ndxPrice !== null ? Number(ndxPrice).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
      color: ndxStatus.color,
      border: ndxStatus.border,
      bg: ndxStatus.bg,
      active: isRiskStreamActive && ndxChg !== null,
    },
  ];

  return (
    <div className={s.page} style={{ paddingBottom: '90px' }}>
      
      {/* ═══ APP-VIEW OPTIMIZED HEADER (NO WEB HEADER OFFSET) ═══ */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(5,10,20,0.98) 0%, rgba(5,10,20,0.90) 100%)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.45)',
        backdropFilter: 'blur(24px) saturate(1.45)',
        borderBottom: '1px solid rgba(52,211,153,0.08)',
        padding: '8px 12px 7px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 18,
          border: '1px solid rgba(148,163,184,0.13)',
          background: 'linear-gradient(145deg, rgba(15,23,42,0.78), rgba(2,6,23,0.66))',
          boxShadow: '0 18px 48px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(circle at 12% 8%, rgba(52,211,153,0.18), transparent 36%), radial-gradient(circle at 82% 12%, rgba(6,182,212,0.12), transparent 32%)'
          }} />

          {/* ── COMMAND HEADER ── */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 13px 9px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <div className="app-skeleton" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(52,211,153,0.36)', background: 'rgba(52,211,153,0.08)' }} />
                <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', border: '1px solid rgba(6,182,212,0.18)' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 14px rgba(52,211,153,0.75)' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ font: '850 16px/1 Inter, sans-serif', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                    GUARDIAN
                  </span>
                  <span style={{
                    font: 'var(--f-micro)',
                    color: sessionBadge.color,
                    background: sessionBadge.bg,
                    border: `1px solid ${sessionBadge.border}`,
                    padding: '2px 7px',
                    borderRadius: 999,
                    letterSpacing: '0.08em',
                    fontWeight: 900,
                    whiteSpace: 'nowrap'
                  }}>
                    {sessionBadge.label}
                  </span>
                </div>
                <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', letterSpacing: '0.05em', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.headerSub}
                </div>
              </div>
            </div>

            <div style={{
              border: `1px solid ${rlsiColor}38`,
              background: `linear-gradient(145deg, ${rlsiColor}18, rgba(15,23,42,0.78))`,
              borderRadius: 12,
              padding: '6px 10px',
              textAlign: 'right',
              minWidth: 62,
              boxShadow: `0 0 18px ${rlsiColor}12`
            }}>
              <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>RLSI</div>
              <div className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 950, color: rlsiColor, lineHeight: 1 }}>
                {rlsiScore.toFixed(0)}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── GUARDIAN ANALYSIS CONTROL DECK ── */}
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{
          overflow: 'hidden',
          borderRadius: '18px 18px 13px 13px',
          border: '1px solid rgba(52,211,153,0.14)',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.82), rgba(2,6,23,0.68))',
          boxShadow: '0 12px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.045)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.25)',
          backdropFilter: 'blur(18px) saturate(1.25)'
        }}>
          <div style={{ position: 'relative', padding: '7px 8px 6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 2px 6px' }}>
              <span style={{ font: 'var(--f-micro)', color: 'var(--cyan)', letterSpacing: '0.12em', fontWeight: 900, textTransform: 'uppercase' }}>
                {t.macroStrip}
              </span>
              <span style={{ width: 44, height: 1, background: 'linear-gradient(90deg, rgba(6,182,212,0.45), transparent)' }} />
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 5,
              padding: 4,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.055)',
              background: 'rgba(2,6,23,0.38)',
            }}>
              {macroCards.map(card => (
                <div
                  key={card.key}
                  className={card.active && (card.key === 'spx' || card.key === 'ndx') ? 'app-live-index-pulse' : undefined}
                  style={{
                    position: 'relative',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: 50,
                    padding: '5px 3px',
                    borderRadius: 10,
                    border: card.active ? '1px solid rgba(34, 211, 238, 0.48)' : `1px solid ${card.border}`,
                    background: card.active
                      ? `linear-gradient(180deg, rgba(8,145,178,0.16), ${card.bg} 52%, rgba(15,23,42,0.30))`
                      : `linear-gradient(180deg, ${card.bg}, rgba(15,23,42,0.30))`,
                    textAlign: 'center',
                    boxShadow: card.active
                      ? '0 0 18px rgba(34, 211, 238, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.03)'
                  }}
                >
                  {card.active && (
                    <span style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: '#22d3ee',
                      boxShadow: '0 0 10px rgba(34,211,238,0.85)'
                    }} />
                  )}
                  <span style={{ maxWidth: '100%', font: "800 8.5px/1.08 'Inter'", color: 'var(--text-dim)', letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {card.label}
                  </span>
                  <span className="tnum" style={{ maxWidth: '100%', marginTop: 3, font: "950 14px/1 'Inter'", color: card.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {card.value}
                  </span>
                  <span className="tnum" style={{ maxWidth: '100%', marginTop: 3, font: "800 8.5px/1.08 'Inter'", color: card.subColor || card.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {card.sub}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            padding: '5px 6px 6px',
            borderTop: '1px solid rgba(148,163,184,0.08)',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.30), rgba(2,6,23,0.40))'
          }}>
            <div ref={tabsRef} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 5,
            }}>
              {TABS_CONFIG.map(tab => {
                const isActive = activeTab === tab.key;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    data-tab={tab.key}
                    onClick={() => handleTabSwitch(tab.key)}
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      height: 44,
                      minHeight: 44,
                      padding: '0 2px',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(6,182,212,0.22), rgba(52,211,153,0.15))'
                        : 'rgba(15,23,42,0.22)',
                      border: isActive ? '1px solid rgba(52,211,153,0.34)' : '1px solid rgba(148,163,184,0.035)',
                      borderRadius: 10,
                      cursor: 'pointer',
                      color: isActive ? 'var(--text)' : 'var(--text-dim)',
                      outline: 'none',
                      transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isActive ? '0 0 18px rgba(6,182,212,0.14), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    <TabIcon size={11} style={{ flex: '0 0 auto', color: isActive ? 'var(--cyan)' : 'var(--text-muted)' }} />
                    <span style={{ minWidth: 0, font: 'var(--f-micro)', fontWeight: 900, fontSize: '9px', letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{
          width: 1,
          height: 10,
          margin: '0 auto -2px',
          background: 'linear-gradient(180deg, rgba(52,211,153,0.34), rgba(52,211,153,0.03))',
          boxShadow: '0 0 14px rgba(6,182,212,0.22)',
        }} />
      </div>

      {/* ALERT BANNER */}
      {alerts.length > 0 && (
        <div style={{ padding: '6px 16px 4px' }}>
          <GuardianAlertBanner alerts={alerts} connectionMode={connectionMode} />
        </div>
      )}

      {/* TAB CONTENT (RECYCLING ORIGINAL COMPONENTS) */}
      <SwipeableTabs
        onSwipeLeft={() => { const TABS: TabKey[] = ['overview','reality','shield','flow']; const i = TABS.indexOf(activeTab); if (i < TABS.length - 1) setActiveTab(TABS[i + 1]); }}
        onSwipeRight={() => { const TABS: TabKey[] = ['overview','reality','shield','flow']; const i = TABS.indexOf(activeTab); if (i > 0) setActiveTab(TABS[i - 1]); }}
      >
      <div style={{ marginTop: 0, display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px' }}>
        {activeTab === 'overview' && (
          <MobileGuardianOverview
            data={data}
            loading={loading}
            verdict={verdict}
            session={session}
          />
        )}
        {activeTab === 'reality' && (
          <MobileGuardianReality
            data={data}
            verdict={verdict}
          />
        )}
        {activeTab === 'shield' && (
          <MobileGuardianShield
            data={data}
            loading={loading}
            verdict={verdict}
            session={session}
            useAppValueWall
          />
        )}
        {activeTab === 'flow' && (
          <MobileGuardianFlow
            data={data}
            loading={loading}
            verdict={verdict}
            session={session}
          />
        )}
      </div>
      </SwipeableTabs>

      {/* AD BANNER */}
      <AdBanner />
      <MobileAppFooter />
    </div>
  );
}

export default function AppGuardianPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '80px 16px 16px', textAlign: 'center' }}>
        <h1 style={{ font: 'var(--f-h1)', color: 'var(--text)' }}>Guardian</h1>
        <p style={{ font: 'var(--f-body)', color: 'var(--text-dim)', marginTop: 8 }}>Loading…</p>
      </div>
    }>
      <GuardianPageContent />
    </Suspense>
  );
}
