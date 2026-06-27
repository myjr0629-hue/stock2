'use client';

/**
 * AppGexTimeline — App-native premium GEX regime timeline.
 *
 * Data: /api/history?type=gex&ticker=X&days=30 (existing public API, DynamoDB signum-gex-history).
 * Computation mirrors the web GexTimeline.tsx (percentile / regime streak / flip events) so the
 * numbers stay consistent with the web SSOT. App-only file — web is never touched.
 *
 * Accuracy contract: positions/scale/labels map 1:1 to real data. No fake/placeholder data — when
 * history is empty we say so honestly instead of drawing a misleading chart.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

interface GexPoint {
  timestamp: number;
  gex: number;
  flipLevel: number | null;
  callWall: number | null;
  putFloor: number | null;
  maxPain: number | null;
  price: number;
  gammaRegime: string;
}

interface Props {
  ticker: string;
  locale?: string;
  currentPrice?: number;
  callWall?: number | null;
  putFloor?: number | null;
  gammaFlip?: number | null;
  days?: number;
}

const GOLD = '#f59e0b';
const GREEN = '#10b981';
const RED = '#ef4444';

function fmtGex(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtPrice(v?: number | null): string {
  if (v == null || !isFinite(v) || v === 0) return '—';
  return `$${v.toFixed(v >= 100 ? 1 : 2)}`;
}

function ordinal(n: number, locale: string): string {
  if (locale === 'ko') return `${n}번째 백분위`;
  if (locale === 'ja') return `${n}パーセンタイル`;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]} pct`;
}

const T = {
  title: { ko: 'GEX 타임라인', en: 'GEX TIMELINE', ja: 'GEXタイムライン' },
  longGamma: { ko: '롱 감마', en: 'Long Gamma', ja: 'ロングガンマ' },
  shortGamma: { ko: '숏 감마', en: 'Short Gamma', ja: 'ショートガンマ' },
  negative: { ko: '음의 GEX', en: 'Negative', ja: '負のGEX' },
  neutral: { ko: '중립', en: 'Neutral', ja: '中立' },
  positive: { ko: '양의 GEX', en: 'Positive', ja: '正のGEX' },
  persistence: { ko: '레짐 지속', en: 'REGIME PERSISTENCE', ja: 'レジーム持続' },
  sessions: { ko: '세션 연속', en: 'sessions', ja: 'セッション連続' },
  avgDur: { ko: '평균 지속', en: 'Avg duration', ja: '平均持続' },
  days: { ko: '일', en: 'd', ja: '日' },
  flips: { ko: '레짐 전환', en: 'FLIP EVENTS', ja: 'レジーム転換' },
  callWall: { ko: '콜 월', en: 'Call Wall', ja: 'コールウォール' },
  putFloor: { ko: '풋 플로어', en: 'Put Floor', ja: 'プットフロア' },
  gammaFlip: { ko: '감마 플립', en: 'Gamma Flip', ja: 'ガンマフリップ' },
  loading: { ko: 'GEX 히스토리 불러오는 중…', en: 'Loading GEX history…', ja: 'GEX履歴を読み込み中…' },
  empty: {
    ko: 'GEX 히스토리가 아직 충분하지 않습니다. 데이터가 쌓이면 표시됩니다.',
    en: 'Not enough GEX history yet. This builds up as snapshots accumulate.',
    ja: 'GEX履歴がまだ十分ではありません。データ蓄積後に表示されます。',
  },
  disclaimer: {
    ko: '구조적 데이터 분석 참고 자료이며, 방향성 예측이 아닙니다.',
    en: 'Structural data for reference — not a directional forecast.',
    ja: '構造データの参考情報であり、方向性の予測ではありません。',
  },
};

function tr(o: Record<string, string>, locale: string): string {
  return o[locale] ?? o.en;
}

export function AppGexTimeline({
  ticker,
  locale = 'en',
  currentPrice,
  callWall,
  putFloor,
  gammaFlip,
  days = 30,
}: Props) {
  const [points, setPoints] = useState<GexPoint[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    setStatus('loading');
    setPoints(null);
    fetch(`/api/history?type=gex&ticker=${encodeURIComponent(ticker)}&days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!alive) return;
        const raw: GexPoint[] = Array.isArray(json?.data) ? json.data : [];
        const clean = raw
          .filter((d) => d && typeof d.gex === 'number' && isFinite(d.gex) && d.timestamp)
          .sort((a, b) => a.timestamp - b.timestamp);
        if (clean.length < 2) {
          setStatus('empty');
          setPoints(clean);
        } else {
          setPoints(clean);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [ticker, days]);

  const stats = useMemo(() => {
    if (!points || points.length < 2) return null;
    const gexValues = points.map((d) => d.gex);
    const max = Math.max(...gexValues);
    const min = Math.min(...gexValues);
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];
    const trend: 'rising' | 'falling' | 'flat' =
      latest.gex > prev.gex ? 'rising' : latest.gex < prev.gex ? 'falling' : 'flat';

    // Percentile of current GEX vs window — identical formula to web GexTimeline (SSOT parity)
    const sorted = [...gexValues].sort((a, b) => a - b);
    const idx = sorted.findIndex((v) => v >= latest.gex);
    const percentile = Math.round((idx / sorted.length) * 100);

    // Flip events — regime transitions
    const flipEvents: { from: string; to: string; timestamp: number; price: number }[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1].gammaRegime;
      const b = points[i].gammaRegime;
      if (a && b && a !== b) flipEvents.push({ from: a, to: b, timestamp: points[i].timestamp, price: points[i].price });
    }

    // Regime streak in unique trading days (mirror web)
    const latestRegime = latest.gammaRegime;
    let streakCount = 0;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].gammaRegime === latestRegime) streakCount++;
      else break;
    }
    const streakDays = new Set(
      points.slice(points.length - streakCount).map((d) => new Date(d.timestamp).toISOString().slice(0, 10)),
    ).size;

    // Average duration of this regime across the window
    const durations: number[] = [];
    let rStart = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].gammaRegime !== points[rStart].gammaRegime) {
        const d = new Set(points.slice(rStart, i).map((p) => new Date(p.timestamp).toISOString().slice(0, 10)));
        if (points[rStart].gammaRegime === latestRegime) durations.push(d.size);
        rStart = i;
      }
    }
    const lastSet = new Set(points.slice(rStart).map((p) => new Date(p.timestamp).toISOString().slice(0, 10)));
    if (points[rStart].gammaRegime === latestRegime) durations.push(lastSet.size);
    const avgDuration = durations.length ? +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : 0;
    const streakMultiple = avgDuration > 0 ? +(streakDays / avgDuration).toFixed(1) : 0;

    const isPositive = latest.gex >= 0;
    return {
      max, min, latest, trend, percentile, flipEvents, streakDays, avgDuration, streakMultiple, isPositive,
    };
  }, [points]);

  const insight = useMemo(() => {
    if (!stats) return '';
    const { latest, percentile, streakDays, avgDuration, streakMultiple, isPositive } = stats;
    const regime = isPositive ? tr(T.longGamma, locale) : tr(T.shortGamma, locale);
    const gx = fmtGex(latest.gex);
    const mech = isPositive
      ? { ko: '딜러가 변동성을 흡수하는 안정 국면', en: 'dealers absorb volatility (stabilizing)', ja: 'ディーラーがボラを吸収する安定局面' }
      : { ko: '딜러가 변동성을 증폭하는 국면', en: 'dealers amplify volatility', ja: 'ディーラーがボラを増幅する局面' };
    const suffix =
      avgDuration > 0 && streakMultiple > 1.5
        ? {
            ko: ` 평균 ${avgDuration}${tr(T.days, locale)} 대비 ${streakMultiple}배 지속 중.`,
            en: ` ${streakMultiple}× the ${avgDuration}-day average.`,
            ja: ` 平均${avgDuration}日に対し${streakMultiple}倍持続中。`,
          }
        : { ko: '', en: '', ja: '' };
    if (locale === 'ko')
      return `GEX ${gx} · ${percentile}번째 백분위 — ${regime}(${tr(mech, 'ko')}). ${streakDays}세션 연속 관찰.${tr(suffix, 'ko')}`;
    if (locale === 'ja')
      return `GEX ${gx} · ${percentile}パーセンタイル — ${regime}（${tr(mech, 'ja')}）。${streakDays}セッション連続で観測。${tr(suffix, 'ja')}`;
    return `GEX ${gx} · ${ordinal(percentile, 'en')} — ${regime} (${tr(mech, 'en')}). Observed for ${streakDays} consecutive sessions.${tr(suffix, 'en')}`;
  }, [stats, locale]);

  // ---- Honest non-ready states (no fake chart) ----
  if (status === 'loading') {
    return (
      <div style={shell}>
        <Header locale={locale} />
        <div style={{ ...skeleton, height: 96 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <div style={{ ...skeleton, height: 56, flex: 1 }} />
          <div style={{ ...skeleton, height: 56, flex: 1 }} />
        </div>
      </div>
    );
  }
  if (status === 'empty' || status === 'error' || !stats || !points) {
    return (
      <div style={shell}>
        <Header locale={locale} />
        <div style={emptyBox}>{tr(T.empty, locale)}</div>
      </div>
    );
  }

  // ---- Chart geometry (accurate scale incl. zero line) ----
  const W = 320;
  const H = 96;
  const lo = Math.min(stats.min, 0);
  const hi = Math.max(stats.max, 0);
  const span = hi - lo || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - ((v - lo) / span) * H;
  const zeroY = y(0);
  const linePts = points.map((d, i) => `${x(i).toFixed(1)},${y(d.gex).toFixed(1)}`).join(' ');
  const areaPath = `M ${x(0).toFixed(1)},${zeroY.toFixed(1)} L ${linePts.replace(/ /g, ' L ')} L ${x(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const lineColor = stats.isPositive ? GREEN : RED;
  const lastX = x(points.length - 1);
  const lastY = y(stats.latest.gex);

  // Percentile gauge knob position (current GEX within window range)
  const knob = Math.max(2, Math.min(98, ((stats.latest.gex - lo) / span) * 100));

  const firstDate = new Date(points[0].timestamp);
  const lastDate = new Date(stats.latest.timestamp);
  const dateFmt = (d: Date) =>
    d.toLocaleDateString(locale === 'ja' ? 'ja-JP' : locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' });

  return (
    <div style={shell}>
      <Header locale={locale} value={stats.latest.gex} percentile={stats.percentile} isPositive={stats.isPositive} />

      {/* 30D area chart with zero reference */}
      <div style={{ position: 'relative', marginTop: 6 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 96, display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="gexFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {/* zero line — the structural reference */}
          <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 3" />
          <path d={areaPath} fill="url(#gexFill)" />
          <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={lastX} cy={lastY} r={3.5} fill={lineColor} stroke="#0b111e" strokeWidth={1.5} />
        </svg>
        <span style={{ position: 'absolute', top: 0, right: 4, fontSize: 9, color: 'var(--text-muted)' }}>{fmtGex(hi)}</span>
        <span style={{ position: 'absolute', bottom: 0, right: 4, fontSize: 9, color: 'var(--text-muted)' }}>{fmtGex(lo)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
        <span>{dateFmt(firstDate)}</span>
        <span>{dateFmt(lastDate)}</span>
      </div>

      {/* Percentile / regime gauge */}
      <div style={{ marginTop: 12 }}>
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${RED} 0%, rgba(148,163,184,0.4) 50%, ${GREEN} 100%)` }}>
          <span style={{ position: 'absolute', left: `${knob}%`, top: '50%', width: 12, height: 12, borderRadius: '50%', background: '#fff', border: `2px solid ${lineColor}`, transform: 'translate(-50%, -50%)', boxShadow: '0 0 6px rgba(0,0,0,0.5)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--text-muted)', marginTop: 4 }}>
          <span>{tr(T.negative, locale)}</span>
          <span>{tr(T.neutral, locale)}</span>
          <span>{tr(T.positive, locale)}</span>
        </div>
      </div>

      {/* Regime persistence */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <div style={statCard}>
          <div style={statBig}>
            <span style={{ color: stats.isPositive ? GREEN : RED }}>{stats.streakDays}</span>
            <span style={statUnit}>{tr(T.sessions, locale)}</span>
          </div>
          <div style={statLabel}>{tr(T.persistence, locale)}</div>
        </div>
        <div style={statCard}>
          <div style={statBig}>
            {stats.avgDuration > 0 ? stats.avgDuration : '—'}
            <span style={statUnit}>{tr(T.days, locale)}{stats.streakMultiple > 1.5 ? ` · ${stats.streakMultiple}×` : ''}</span>
          </div>
          <div style={statLabel}>{tr(T.avgDur, locale)}</div>
        </div>
      </div>

      {/* Auto insight (compliance-safe) */}
      <p style={insightStyle}>{insight}</p>

      {/* Flip events */}
      {stats.flipEvents.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.4, marginBottom: 6 }}>
            {tr(T.flips, locale)} ({stats.flipEvents.length})
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {stats.flipEvents.slice(-6).map((f, i) => {
              const toPos = /pos/i.test(f.to);
              return (
                <div key={i} style={{ flex: '0 0 auto', padding: '4px 8px', borderRadius: 7, background: toPos ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${toPos ? GREEN : RED}33`, fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  <b style={{ color: toPos ? GREEN : RED }}>{new Date(f.timestamp).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</b>
                  {' '}{toPos ? 'NEG→POS' : 'POS→NEG'}{f.price ? ` $${f.price.toFixed(0)}` : ''}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Current structural levels (accurate live scalars) */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <LevelChip label={tr(T.gammaFlip, locale)} value={fmtPrice(gammaFlip)} color={GOLD} />
        <LevelChip label={tr(T.callWall, locale)} value={fmtPrice(callWall)} color={GREEN} />
        <LevelChip label={tr(T.putFloor, locale)} value={fmtPrice(putFloor)} color={RED} />
      </div>

      <p style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 10, opacity: 0.8 }}>{tr(T.disclaimer, locale)}</p>
    </div>
  );
}

function Header({ locale, value, percentile, isPositive }: { locale: string; value?: number; percentile?: number; isPositive?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text)' }}>
        {tr(T.title, locale)} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· 30D</span>
      </div>
      {value != null && (
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: isPositive ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>{fmtGex(value)}</span>
          {percentile != null && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{ordinal(percentile, locale)}</span>}
        </div>
      )}
    </div>
  );
}

function LevelChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

const shell: CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: 'var(--surface-1)',
  border: '1px solid var(--border)',
  marginBottom: 'var(--s3)',
};
const skeleton: CSSProperties = { borderRadius: 8, background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))' };
const emptyBox: CSSProperties = { marginTop: 10, padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 };
const statCard: CSSProperties = { flex: 1, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' };
const statBig: CSSProperties = { fontSize: 20, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'baseline', gap: 5, fontVariantNumeric: 'tabular-nums' };
const statUnit: CSSProperties = { fontSize: 10, fontWeight: 500, color: 'var(--text-muted)' };
const statLabel: CSSProperties = { fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: 0.4, marginTop: 3, textTransform: 'uppercase' };
const insightStyle: CSSProperties = { fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-dim)', marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--surface-1)', border: '1px solid var(--border)' };

export default AppGexTimeline;
