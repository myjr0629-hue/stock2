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
import { createPortal } from 'react-dom';

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
  whatNow: { ko: '지금 무슨 의미인가', en: 'WHAT THIS MEANS', ja: '今、何を意味するか' },
  pctUpper: { ko: '중상위', en: 'upper', ja: '中上位' },
  pctMid: { ko: '중간', en: 'mid', ja: '中位' },
  pctLower: { ko: '하위', en: 'lower', ja: '下位' },
  tlTitle: { ko: 'GEX 타임라인이란?', en: 'What is the GEX Timeline?', ja: 'GEXタイムラインとは？' },
  tlBody: {
    ko: '딜러(옵션 마켓메이커)가 떠안은 감마 포지션의 30일 추이입니다. 음수(숏 감마)면 딜러 헤지가 가격 변동을 키우고, 양수(롱 감마)면 변동을 억제합니다. 즉 이 종목이 구조적으로 "잘 튀는지" "눌리는지"를 보여줍니다.',
    en: 'The 30-day trend of dealer (option market-maker) gamma positioning. Negative (short gamma) means dealer hedging amplifies price moves; positive (long gamma) dampens them — i.e. whether this name is structurally "jumpy" or "pinned".',
    ja: 'ディーラー（オプション・マーケットメイカー）が抱えるガンマ・ポジションの30日推移です。マイナス（ショートガンマ）はヘッジが値動きを増幅し、プラス（ロングガンマ）は抑制します。つまりこの銘柄が構造的に「動きやすい」か「抑えられている」かを示します。',
  },
  close: { ko: '확인', en: 'Got it', ja: '閉じる' },
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
  const [tipOpen, setTipOpen] = useState(false);

  // Open/close the info sheet AND toggle the native banner in lock-step with the tap.
  // Driving it from the user action (not effect cleanup) makes restore reliable on device.
  const setSheet = (open: boolean) => {
    setTipOpen(open);
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { adManager } = await import('@/services/adManager');
        await adManager.setBannerSuppressed(open);
      } catch {}
    })();
  };

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

  // The native AdMob banner is an OS layer over the WebView — no web z-index can cover it,
  // so it must be hidden while the sheet is open. We drive it directly from the open/close
  // tap (setSheet) so restore is reliable on device. This effect is only a safety net:
  // if the component unmounts while the sheet is open, make sure the banner comes back.
  useEffect(() => {
    return () => {
      (async () => {
        try {
          const { Capacitor } = await import('@capacitor/core');
          if (!Capacitor.isNativePlatform()) return;
          const { adManager } = await import('@/services/adManager');
          await adManager.setBannerSuppressed(false);
        } catch {}
      })();
    };
  }, []);

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

  // Clear, app-native interpretation (compliance-safe / observational only): 3 scannable lines.
  const interp = useMemo(() => {
    if (!stats) return null;
    const { latest, percentile, streakDays, avgDuration, streakMultiple, isPositive } = stats;
    const gx = fmtGex(latest.gex);
    const pctWord = percentile >= 66 ? T.pctUpper : percentile >= 33 ? T.pctMid : T.pctLower;

    const meaning = isPositive
      ? { ko: '롱 감마 환경 — 딜러 헤지가 가격 움직임을 흡수하는 구조입니다.', en: 'Long-gamma environment — dealer hedging absorbs price moves.', ja: 'ロングガンマ環境 — ヘッジが値動きを吸収する構造です。' }
      : { ko: '숏 감마 환경 — 딜러 헤지가 가격 움직임을 키우는 구조입니다.', en: 'Short-gamma environment — dealer hedging amplifies price moves.', ja: 'ショートガンマ環境 — ヘッジが値動きを増幅する構造です。' };
    const behavior = isPositive
      ? { ko: '변동이 억제되고 박스권·평균회귀 경향이 관찰됩니다.', en: 'Moves tend to be dampened — range-bound, mean-reverting behavior is observed.', ja: '値動きが抑えられ、レンジ・平均回帰の傾向が観測されます。' }
      : { ko: '변동폭이 크고 추세가 이어지는 흐름이 관찰됩니다 (평균회귀보다 추세 추종).', en: 'Wider, trend-extending swings tend to be observed rather than mean-reversion.', ja: '平均回帰よりも、値幅が大きくトレンドが続きやすい動きが観測されます。' };

    let flipNote = { ko: '', en: '', ja: '' };
    if (currentPrice && gammaFlip && currentPrice > 0 && gammaFlip > 0) {
      flipNote = currentPrice >= gammaFlip
        ? { ko: ' 현재가는 감마플립 위 — 지지 우위 구조로 관찰됩니다.', en: ' Price sits above the gamma flip — a support-leaning structure is observed.', ja: ' 現在値はガンマフリップの上 — 支持寄りの構造が観測されます。' }
        : { ko: ' 현재가는 감마플립 아래 — 저항 우위 구조로 관찰됩니다.', en: ' Price sits below the gamma flip — a resistance-leaning structure is observed.', ja: ' 現在値はガンマフリップの下 — 抵抗寄りの構造が観測されます。' };
    }
    const persist = avgDuration > 0 && streakMultiple > 1.5
      ? { ko: ` 평균 ${avgDuration}${tr(T.days, locale)} 대비 ${streakMultiple}배 지속.`, en: ` ${streakMultiple}× its ${avgDuration}-day average.`, ja: ` 平均${avgDuration}日に対し${streakMultiple}倍持続。` }
      : { ko: '', en: '', ja: '' };

    const context = {
      ko: `현재 GEX ${gx} · 30일 중 ${tr(pctWord, 'ko')}(${percentile}번째 백분위) · ${streakDays}세션 연속.${tr(persist, 'ko')}${tr(flipNote, 'ko')}`,
      en: `GEX ${gx} · ${tr(pctWord, 'en')} of its 30-day range (${ordinal(percentile, 'en')}) · ${streakDays} sessions running.${tr(persist, 'en')}${tr(flipNote, 'en')}`,
      ja: `現在GEX ${gx} · 30日中${tr(pctWord, 'ja')}（${percentile}パーセンタイル） · ${streakDays}セッション連続。${tr(persist, 'ja')}${tr(flipNote, 'ja')}`,
    };

    return { meaning: tr(meaning, locale), behavior: tr(behavior, locale), context: tr(context, locale) };
  }, [stats, locale, currentPrice, gammaFlip]);

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
      <Header locale={locale} value={stats.latest.gex} percentile={stats.percentile} isPositive={stats.isPositive} onInfo={() => setSheet(!tipOpen)} infoOpen={tipOpen} />

      {/* What-is-this — premium bottom-sheet popup, portaled to body so no ancestor
          transform can trap the fixed overlay. Tap backdrop / button to close. */}
      {tipOpen && typeof document !== 'undefined' && createPortal(
        <div style={sheetOverlay} onClick={() => setSheet(false)} role="dialog" aria-modal="true">
          <style>{`@keyframes agxUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes agxFade{from{opacity:0}to{opacity:1}}`}</style>
          <div style={sheetCard} onClick={(e) => e.stopPropagation()}>
            <div style={sheetHandle} />
            <div style={sheetTitle}>{tr(T.tlTitle, locale)}</div>
            <div style={sheetBody}>{tr(T.tlBody, locale)}</div>
            <button type="button" style={sheetClose} onClick={() => setSheet(false)}>{tr(T.close, locale)}</button>
          </div>
        </div>,
        document.body,
      )}

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

      {/* Interpretation — clear "what this means now" (compliance-safe, app-native) */}
      {interp && (
        <div style={whatCard}>
          <div style={whatLabel}>{tr(T.whatNow, locale)}</div>
          <div style={interpStrong}>{interp.meaning}</div>
          <div style={interpLine}>{interp.behavior}</div>
          <div style={interpMuted}>{interp.context}</div>
        </div>
      )}

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

function Header({ locale, value, percentile, isPositive, onInfo, infoOpen }: { locale: string; value?: number; percentile?: number; isPositive?: boolean; onInfo?: () => void; infoOpen?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text)' }}>
          {tr(T.title, locale)} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· 30D</span>
        </span>
        {onInfo && (
          <button
            type="button"
            onClick={onInfo}
            aria-label="What is the GEX Timeline?"
            style={{
              width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, cursor: 'pointer',
              color: infoOpen ? '#06121a' : 'var(--cyan)',
              background: infoOpen ? 'var(--cyan)' : 'var(--cyan-dim)',
              border: '1px solid var(--cyan)', padding: 0,
              boxShadow: 'var(--glow-cyan)',
            }}
          >
            i
          </button>
        )}
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
const sheetOverlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(2,6,16,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'agxFade 0.2s ease' };
const sheetCard: CSSProperties = { width: '100%', maxWidth: 460, background: 'var(--bg-elev)', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: '1px solid var(--border-strong)', padding: '12px 20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -12px 40px rgba(0,0,0,0.5)', animation: 'agxUp 0.3s cubic-bezier(0.32,0.72,0,1)' };
const sheetHandle: CSSProperties = { width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)', margin: '2px auto 14px' };
const sheetTitle: CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 };
const sheetBody: CSSProperties = { fontSize: 13, lineHeight: 1.65, color: 'var(--text-dim)' };
const sheetClose: CSSProperties = { marginTop: 18, width: '100%', padding: 12, borderRadius: 12, background: 'var(--cyan-dim)', color: 'var(--cyan)', border: '1px solid var(--cyan)', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const whatCard: CSSProperties = { marginTop: 12, padding: '11px 12px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' };
const whatLabel: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 };
const interpStrong: CSSProperties = { fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--text)' };
const interpLine: CSSProperties = { fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-dim)', marginTop: 4 };
const interpMuted: CSSProperties = { fontSize: 10.5, lineHeight: 1.55, color: 'var(--text-muted)', marginTop: 6 };

export default AppGexTimeline;
