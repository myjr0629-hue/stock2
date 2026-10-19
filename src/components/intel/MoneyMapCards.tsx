import React from 'react';
import { formatEventName } from '@/lib/econCalendarNames';
import { moneyMapEarnings, moneyMapCalendar, type MoneyMapData, type MapSector, type MapValue } from '@/lib/app/moneyMap';

export type MoneyMapCopy = Record<string, string>;
const pct = (v: number | null | undefined, unit = '%') => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}${unit}`;
const basis = (v: MapValue | null, c: MoneyMapCopy) => v ? `${v.date} ${v.session === 'PRE' ? 'PRE' : c.regular}` : '—';
const tone = (v: number | null | undefined) => v == null ? 'var(--text-muted, #94a3b8)' : v >= 0 ? '#34d399' : '#fb7185';
const panel: React.CSSProperties = { padding: 16, border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, background: 'rgba(15,23,42,.86)', minWidth: 0 };
const note: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted, #94a3b8)', lineHeight: 1.6 };

export function MoneyMapCards({ data, copy: c, locale, selectedId, onSelect, watchlist = [], now = Date.now() }: {
  data: MoneyMapData; copy: MoneyMapCopy; locale: string; selectedId: string; onSelect: (id: string) => void; watchlist?: string[]; now?: number;
}) {
  const selected = data.sectors.find(s => s.id === selectedId) || data.leaders[0] || data.sectors[0];
  const watching = new Set(watchlist);
  const rankStocks = selected?.stocks.filter(s => s.relative !== null).sort((a, b) => b.move!.value - a.move!.value) || [];
  const leaders = rankStocks.slice(0, 2), leaderIds = new Set(leaders.map(s => s.ticker));
  const laggards = rankStocks.filter(s => !leaderIds.has(s.ticker)).slice(-2).reverse();
  const shown = new Set([...leaders, ...laggards].map(s => s.ticker));
  const mine = selected?.stocks.filter(s => watching.has(s.ticker) && !shown.has(s.ticker)) || [];
  const earningsCalendar = moneyMapEarnings(data.sources, selected?.tickers || [], now);
  const earnings = earningsCalendar.earnings, week = earningsCalendar.range;
  const calendar = moneyMapCalendar(data.sources, now), events = calendar.events;
  const premium = selected?.premium;
  const why = selected?.why?.[locale as 'ko' | 'en' | 'ja'];
  const row = (s: MapSector) => <button key={s.id} type="button" aria-pressed={selected?.id === s.id} onClick={() => onSelect(s.id)} style={{ display: 'block', textAlign: 'left', width: '100%', border: selected?.id === s.id ? '1px solid #22d3ee' : '1px solid transparent', borderRadius: 10, padding: '9px 6px', background: selected?.id === s.id ? 'rgba(34,211,238,.07)' : 'transparent', color: 'inherit' }}>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}><span>{c[s.id] || s.id} <small style={note}>{s.id}</small></span><span style={{ color: tone(s.relative), whiteSpace: 'nowrap' }}>{pct(s.relative, 'pp')}</span></div>
    <div style={{ fontSize: 12, marginTop: 5 }}>{c.today} <span style={{ color: tone(s.today?.value) }}>{pct(s.today?.value)}</span> / {c.fiveDay} <span style={{ color: tone(s.fiveDay?.value) }}>{pct(s.fiveDay?.value)}</span>{s.bounce && <span style={{ color: '#fbbf24', marginLeft: 7 }}>↩ {c.bounce}</span>}</div>
    <div style={note}>{basis(s.today, c)} · {s.synthetic ? c.equalWeight : 'ETF'} · {s.today?.session === 'PRE' ? c.vsNq : c.vsSpy}{s.fiveDay && ` · ${c.fiveDay} ${s.fiveDay.basis === 'equalWeight' ? c.equalWeight : 'ETF'} ${s.fiveDay.date}${s.fiveDay.captured ? ` (${c.captured})` : ''}`}</div>
  </button>;
  const stockRow = (s: NonNullable<typeof selected>['stocks'][number]) => <div key={s.ticker} style={{ padding: '8px 0', borderBottom: '1px solid rgba(148,163,184,.1)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}><strong>{watching.has(s.ticker) && <span aria-label={c.myStocks} style={{ color: '#fbbf24' }}>★ </span>}{s.ticker}</strong><span style={{ color: tone(s.move?.value) }}>{pct(s.move?.value)} <small style={note}>({c.vsSector} {pct(s.relative, 'pp')})</small></span></div><div style={note}>{basis(s.move, c)}</div>
  </div>;
  return <section aria-label={c.title} style={{ padding: '16px', color: 'var(--text, #e2e8f0)' }}>
    <h2 style={{ fontSize: 19, margin: '0 0 5px', fontWeight: 850 }}>{c.title}</h2>
    <div style={{ ...note, marginBottom: 12 }}>{data.session} · {data.session === 'PRE' ? c.vsNq : c.vsSpy} · {c.market16}</div>
    <div className="money-map-grid">
      <article style={panel}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>01 · {c.direction}</h3>
        <div style={note}>{c.top3}</div>{data.leaders.map(row)}<div style={{ ...note, marginTop: 10 }}>{c.bottom3}</div>{data.laggards.map(row)}
        {data.prior.length > 0 && <div><div style={{ ...note, padding: '10px 0' }}>{c.prior} · {data.prior.length}</div>{data.prior.map(row)}</div>}
        {!data.leaders.length && <p style={note}>{c.noComparison}</p>}
        {why && <p style={{ fontSize: 12, lineHeight: 1.7, margin: '12px 0 0' }}><strong>AI · {c.why}</strong> {why}<br /><small style={note}>{selected.whyBasis && `${c[selected.whyBasis] || selected.whyBasis} · `}{c.asOf} {selected.whyAt?.slice(0, 10)}</small></p>}
      </article>
      <article style={panel}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>02 · {c.inside}</h3>
        <label style={note}>{c.sector}<select value={selected?.id || ''} onChange={e => onSelect(e.target.value)} style={{ width: '100%', margin: '6px 0 12px', padding: 10, background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 8 }}>{data.sectors.map(s => <option key={s.id} value={s.id}>{c[s.id] || s.id} · {s.id}</option>)}</select></label>
        <div style={note}>{c.leaders} · {selected?.synthetic ? c.equalWeight : 'ETF'}</div>{leaders.length ? leaders.map(stockRow) : <p>—</p>}
        <div style={{ ...note, marginTop: 14 }}>{c.laggards}</div>{laggards.length ? laggards.map(stockRow) : <p>—</p>}
        {mine.length > 0 && <><div style={{ ...note, marginTop: 14 }}>★ {c.myStocks}</div>{mine.map(stockRow)}</>}
        <p style={note}>{c.membersOnly}</p>
      </article>
      <article style={panel}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>03 · {c.check}</h3>
        <div style={note}>{c.earnings} · {week.from} ~ {week.to} ET</div>
        {earnings.length ? earnings.map(r => <div key={`${r.ticker}:${r.date}`} style={{ padding: '9px 0', fontSize: 13 }}><strong>{watching.has(r.ticker) ? '★ ' : ''}{r.ticker}</strong> · {r.date} {r.hour?.toUpperCase()} {r.dateStatus === 'est' && <small>{c.estimated}</small>}<div style={note}>{c.implied} {r.implied ? `±${r.implied.pct.toFixed(1)}% · ${c.asOf} ${r.implied.session || '—'} · ${c.expiry} ${r.implied.expiry}` : '—'}</div></div>) : <p style={note}>{earningsCalendar.current ? c.noEarnings : '—'}</p>}
        {earningsCalendar.asOf && <div style={note}>{c.asOf} {earningsCalendar.asOf.slice(0, 10)}</div>}
        <div style={{ ...note, marginTop: 15 }}>{c.economic} · {calendar.date} ET</div>
        {events.length ? events.map(e => <p key={`${e.date}:${e.time}:${e.event}`} style={{ fontSize: 12, lineHeight: 1.7 }}>{formatEventName(e.event, locale, false)}<br /><small style={note}>HIGH · {new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US', { timeZone: locale === 'ko' ? 'Asia/Seoul' : locale === 'ja' ? 'Asia/Tokyo' : 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(`${e.date}T${e.time.padStart(5, '0')}:00Z`))} {locale === 'ko' ? 'KST' : locale === 'ja' ? 'JST' : 'ET'}</small></p>) : <p style={note}>{calendar.current ? c.noEvents : '—'}</p>}
        {calendar.asOf && <div style={note}>{c.asOf} {calendar.asOf.slice(0, 10)}</div>}
        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', marginTop: 15, paddingTop: 12 }}><div style={note}>{c.netPremium}</div><strong style={{ color: tone(premium?.value), fontSize: 19 }}>{premium ? `${premium.value > 0 ? '+' : premium.value < 0 ? '−' : ''}$${(Math.abs(premium.value) / 1e6).toFixed(1)}M` : '—'}</strong><div style={note}>{c.asOf} {premium?.date || '—'}{premium?.captured && ` (${c.captured})`}{premium && ` · ${premium.count}/${selected?.tickers.length} ${c.coverage}`}</div></div>
      </article>
    </div>
    <style>{`.money-map-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}@media(max-width:900px){.money-map-grid{grid-template-columns:1fr}}`}</style>
  </section>;
}
