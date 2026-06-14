'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { useGuardian } from '@/components/guardian/GuardianProvider';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';
import GuardianAlertBanner from '@/components/guardian/GuardianAlertBanner';
import useSWR from 'swr';
import { Eye, Shield, Activity, Map } from 'lucide-react';
import s from '../dash/dash.module.css';
import { AdBanner } from '@/components/app/AdBanner';

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

export default function AppGuardianPage() {
  const locale = useLocale();
  const t = useMemo(() => TRANSLATIONS[locale] || TRANSLATIONS.en, [locale]);

  const { data: globalData, loading, alerts, connectionMode, rlsi } = useGuardian();
  const data = globalData as any;
  const { snapshot } = useMacroSnapshot();
  const { data: idxData } = useSWR<IndexCloseData>('/api/market/index-close', indexFetcher, { refreshInterval: 60000, dedupingInterval: 30000 });
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const tabsRef = useRef<HTMLDivElement>(null);

  // Macro Pill Status Helpers
  const getFgStatus = (score: number) => {
    if (score >= 75) return { label: t.extremeGreed, color: '#34d399', border: 'rgba(16, 185, 129, 0.25)', bg: 'rgba(16, 185, 129, 0.06)' };
    if (score >= 55) return { label: t.greed, color: '#86efac', border: 'rgba(16, 185, 129, 0.15)', bg: 'rgba(16, 185, 129, 0.04)' };
    if (score >= 45) return { label: t.neutral, color: '#94a3b8', border: 'rgba(255,255,255,0.06)', bg: 'rgba(255,255,255,0.02)' };
    if (score >= 25) return { label: t.fear, color: '#f59e0b', border: 'rgba(245, 158, 11, 0.15)', bg: 'rgba(245, 158, 11, 0.04)' };
    return { label: t.extremeFear, color: '#f43f5e', border: 'rgba(239, 68, 68, 0.25)', bg: 'rgba(239, 68, 68, 0.06)' };
  };

  const getVixStatus = (v: number) => {
    if (v > 30) return { label: t.vixExtreme, color: '#f43f5e' };
    if (v > 20) return { label: t.vixElevated, color: '#f59e0b' };
    if (v > 15) return { label: t.vixNormal, color: '#94a3b8' };
    return { label: t.vixLow, color: '#34d399' };
  };

  const getDxyStatus = (d: number) => {
    if (d > 105) return { label: t.dxyStrong, color: '#f43f5e' };
    if (d > 100) return { label: t.dxyFirm, color: '#f59e0b' };
    if (d > 95) return { label: t.dxyNeutral, color: '#94a3b8' };
    return { label: t.dxyWeak, color: '#34d399' };
  };

  // Macro data
  const fgScore = rlsi?.components?.sentimentScore ?? 0;
  const vix = snapshot?.factors?.vix?.level ?? 0;
  const vixChg = snapshot?.factors?.vix?.chgPct ?? 0;
  const fgStatus = getFgStatus(fgScore);
  const vixStatus = getVixStatus(vix);

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
    };
  }, [data]);

  const session = data?.rlsi?.session;

  return (
    <div className={s.page} style={{ paddingBottom: '90px' }}>
      
      {/* ═══ APP-VIEW OPTIMIZED HEADER (NO WEB HEADER OFFSET) ═══ */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(5,10,20,0.98) 0%, rgba(5,10,20,0.92) 100%)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        borderBottom: '1px solid rgba(52,211,153,0.08)',
        padding: '12px 16px 8px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* ── GUARDIAN EYE BANNER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Animated Pulse Ring */}
            <div style={{ position: 'relative', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="app-skeleton" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(52,211,153,0.3)' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 10px #34d399' }} />
            </div>
            <div>
              <div style={{ font: 'var(--f-h2)', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                GUARDIAN
              </div>
              <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', letterSpacing: '0.08em', marginTop: 2 }}>
                {locale === 'ko' ? '가디언 매크로 리스크 · LIVE' : locale === 'ja' ? 'ガーディアン・マクロ · LIVE' : 'MARKET RISK SENTINEL · LIVE'}
              </div>
            </div>
          </div>

          {/* RLSI Score Badge */}
          <div style={{
            border: `1px solid ${rlsiColor}33`,
            background: `linear-gradient(135deg, ${rlsiColor}15, ${rlsiColor}08)`,
            borderRadius: 'var(--r-card)',
            padding: '6px 12px',
            textAlign: 'right'
          }}>
            <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>RLSI</div>
            <div className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 900, color: rlsiColor }}>
              {rlsiScore.toFixed(0)}
            </div>
          </div>
        </div>

        {/* ── MACRO INDICATOR GRID (4 cards) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '8px' }}>
          {/* Fear & Greed */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '8px 4px', borderRadius: 'var(--r-btn)', border: '1px solid',
            borderColor: fgStatus.border, background: fgStatus.bg, textAlign: 'center'
          }}>
            <span style={{ font: "600 10.5px/1.2 'Inter'", color: 'var(--text-dim)', marginBottom: 4 }}>
              Fear&amp;Greed
            </span>
            <span className="tnum" style={{ font: "900 18px/1 'Inter'", color: fgStatus.color }}>
              {fgScore > 0 ? fgScore.toFixed(0) : '—'}
            </span>
            <span style={{ font: "800 10.5px/1.2 'Inter'", color: fgStatus.color, marginTop: 4 }}>
              {fgStatus.label}
            </span>
          </div>

          {/* VIX */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '8px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--surface-1)'
          }}>
            <span style={{ font: "600 10.5px/1.2 'Inter'", color: 'var(--text-dim)', marginBottom: 4 }}>VIX</span>
            <span className="tnum" style={{ font: "900 18px/1 'Inter'", color: vixStatus.color }}>
              {vix > 0 ? vix.toFixed(1) : '—'}
            </span>
            <span className="tnum" style={{ font: "700 10.5px/1.2 'Inter'", color: vixChg >= 0 ? 'var(--red)' : 'var(--green)', marginTop: 4 }}>
              {vixChg >= 0 ? '+' : ''}{vixChg.toFixed(1)}%
            </span>
          </div>

          {/* S&P 500 */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '8px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--surface-1)'
          }}>
            <span style={{ font: "600 10.5px/1.2 'Inter'", color: 'var(--text-dim)', marginBottom: 4 }}>S&amp;P 500</span>
            <span className="tnum" style={{ font: "800 13px/1.2 'Inter'", fontWeight: 900, color: (idxData?.spx?.changePct ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {idxData?.spx ? (idxData.spx.changePct >= 0 ? '+' : '') + idxData.spx.changePct.toFixed(2) + '%' : '—'}
            </span>
            <span className="tnum" style={{ font: "500 10px/1.2 'Inter'", color: 'var(--text-muted)', marginTop: 4 }}>
              {idxData?.spx ? Number(idxData.spx.price).toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}
            </span>
          </div>

          {/* NASDAQ 100 */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '8px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--surface-1)'
          }}>
            <span style={{ font: "600 10.5px/1.2 'Inter'", color: 'var(--text-dim)', marginBottom: 4 }}>NASDAQ 100</span>
            <span className="tnum" style={{ font: "800 13px/1.2 'Inter'", fontWeight: 900, color: (idxData?.nasdaq?.changePct ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {idxData?.nasdaq ? (idxData.nasdaq.changePct >= 0 ? '+' : '') + idxData.nasdaq.changePct.toFixed(2) + '%' : '—'}
            </span>
            <span className="tnum" style={{ font: "500 10px/1.2 'Inter'", color: 'var(--text-muted)', marginTop: 4 }}>
              {idxData?.nasdaq ? Number(idxData.nasdaq.price).toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}
            </span>
          </div>
        </div>

        {/* ── SUB-TAB NAVIGATION (Separated capsule row) ── */}
        <div style={{
          marginTop: '14px',
          padding: '4px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '24px',
          boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.03), 0 4px 12px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
        }}>
          <div ref={tabsRef} style={{ display: 'flex', gap: '2px' }}>
            {TABS_CONFIG.map(tab => {
              const isActive = activeTab === tab.key;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.key}
                  data-tab={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 0',
                    background: isActive ? 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(52,211,153,0.15) 100%)' : 'transparent',
                    border: isActive ? '1px solid rgba(52,211,153,0.25)' : '1px solid transparent',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    color: isActive ? 'var(--text)' : 'var(--text-dim)',
                    outline: 'none',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isActive ? '0 2px 8px rgba(52,211,153,0.08)' : 'none',
                    WebkitTapHighlightColor: 'transparent'
                  }}
                >
                  <TabIcon size={13} style={{ color: isActive ? 'var(--cyan)' : 'var(--text-muted)' }} />
                  <span style={{ font: 'var(--f-micro)', fontWeight: 800, fontSize: '11px', letterSpacing: '0.02em' }}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ALERT BANNER */}
      <div style={{ padding: '12px 16px 4px' }}>
        <GuardianAlertBanner alerts={alerts} connectionMode={connectionMode} />
      </div>

      {/* TAB CONTENT (RECYCLING ORIGINAL COMPONENTS) */}
      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

      {/* AD BANNER */}
      <AdBanner />
    </div>
  );
}
