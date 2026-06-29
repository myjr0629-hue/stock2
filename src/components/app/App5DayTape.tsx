'use client';

// ============================================================================
// App5DayTape — compact "last 5 trading days" daily-change card.
// Complements the interactive price chart (shape) and analyst consensus (forward)
// by showing discrete recent daily momentum. Sources real daily closes from the
// existing /api/chart (range=1m) — no new pipeline. App-only; graceful (renders
// nothing until valid data is present).
// ============================================================================

import { useEffect, useState, type CSSProperties } from 'react';

const GREEN = '#10b981';
const RED = '#ef4444';

interface Day { dateET: string; chg: number }

export function App5DayTape({ ticker, locale = 'en' }: { ticker: string; locale?: string }) {
  // Tag state with its ticker so a stale result never flashes after a ticker switch,
  // and so we never call setState synchronously in the effect body.
  const [state, setState] = useState<{ ticker: string; days: Day[] } | null>(null);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    fetch(`/api/chart?symbol=${encodeURIComponent(ticker)}&range=1m`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((json) => {
        if (!alive) return;
        const pts: any[] = Array.isArray(json?.data) ? json.data : [];
        // Daily close = last close seen for each ET date (points arrive oldest→newest).
        const byDay = new Map<string, number>();
        for (const p of pts) {
          const d = p?.dateET || (p?.date ? new Date(p.date).toISOString().slice(0, 10) : null);
          const c = typeof p?.close === 'number' ? p.close : null;
          if (d && c != null && c > 0) byDay.set(d, c);
        }
        const sorted = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
        if (sorted.length < 2) { setState(null); return; }
        const tail = sorted.slice(-6); // up to 6 closes → 5 day-over-day changes
        const out: Day[] = [];
        for (let i = 1; i < tail.length; i++) {
          const prev = tail[i - 1][1];
          const cur = tail[i][1];
          if (prev > 0) out.push({ dateET: tail[i][0], chg: ((cur - prev) / prev) * 100 });
        }
        setState({ ticker, days: out.slice(-5) });
      })
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [ticker]);

  const days = state && state.ticker === ticker ? state.days : null;
  if (!days || days.length === 0) return null; // graceful — no card without data

  const ups = days.filter((d) => d.chg >= 0).length;
  const downs = days.length - ups;
  const weekChg = (days.reduce((acc, d) => acc * (1 + d.chg / 100), 1) - 1) * 100;
  const title = locale === 'ko' ? '최근 5일' : locale === 'ja' ? '直近5日' : '5-DAY';
  const sumLabel = locale === 'ko' ? '주간' : locale === 'ja' ? '週間' : 'Week';
  const wd = (dateET: string) => {
    try {
      return new Date(dateET + 'T00:00:00').toLocaleDateString(
        locale === 'ja' ? 'ja-JP' : locale === 'ko' ? 'ko-KR' : 'en-US',
        { weekday: 'short' },
      );
    } catch { return dateET.slice(5); }
  };

  return (
    <div style={shell}>
      <div style={head}>
        <span style={titleStyle}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: weekChg >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
          {ups}↑ {downs}↓ · {sumLabel} {weekChg >= 0 ? '+' : ''}{weekChg.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 6 }}>
        {days.map((d, i) => (
          <div key={i} style={pill(d.chg)}>
            <span style={pillDay}>{wd(d.dateET)}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: d.chg >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
              {d.chg >= 0 ? '+' : ''}{d.chg.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const shell: CSSProperties = { padding: 14, borderRadius: 14, background: 'var(--surface-1)', border: '1px solid var(--border)', marginBottom: 'var(--s3)' };
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 };
const titleStyle: CSSProperties = { fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)' };
const pill = (chg: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 9, background: chg >= 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${(chg >= 0 ? GREEN : RED)}33` });
const pillDay: CSSProperties = { fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' };

export default App5DayTape;
