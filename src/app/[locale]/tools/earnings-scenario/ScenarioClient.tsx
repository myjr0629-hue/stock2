'use client';

import { useState } from 'react';
import { SCENARIO_COPY, type ScenarioLocale } from '@/lib/earningsScenario/copy';
import { finite, scenario, type OptionSide, type ScenarioRow } from '@/lib/earningsScenario/model';

export default function ScenarioClient({ locale, rows }: { locale: ScenarioLocale; rows: ScenarioRow[] }) {
  const c = SCENARIO_COPY[locale];
  const [index, setIndex] = useState(0), [side, setSide] = useState<OptionSide>('call');
  const [stockPct, setStockPct] = useState(0), [ivPp, setIvPp] = useState(rows[0]?.defaultIvPp ?? 0);
  const [days, setDays] = useState(rows[0]?.defaultDays ?? 0);
  const row = rows[index], contract = row?.[side] ?? null;
  const ready = !!row && finite(row.defaultIvPp);
  const result = ready ? scenario(contract, row.spot, row.years, stockPct, ivPp, days) : null;
  const money = (v: number | null | undefined) => {
    if (!finite(v)) return c.missing;
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${v < 0 && abs !== '0.00' ? '-' : ''}$${abs}`; // «-$1.23», 반올림 0은 부호 없음
  };
  const number = (v: number | null | undefined, suffix = '') => finite(v) ? `${v.toFixed(2)}${suffix}` : c.missing;
  const reset = (i: number) => { setIndex(i); setStockPct(0); setIvPp(rows[i]?.defaultIvPp ?? 0); setDays(rows[i]?.defaultDays ?? 0); };
  const methods: Record<string, string> = locale === 'ko'
    ? { weekly: '주간', monthly: '월간', 'event-split': '실적 분산 분리', 'chain-straddle': '운영 ATM 스트래들/현물' }
    : locale === 'ja' ? { weekly: '週次', monthly: '月次', 'event-split': '決算分散分離', 'chain-straddle': '運用ATMストラドル/株価' }
      : { weekly: 'Weekly', monthly: 'Monthly', 'event-split': 'Event variance split', 'chain-straddle': 'Operating ATM straddle/stock' };
  const fields: Array<[string, string]> = [
    [c.earnings, row?.earnings ?? c.missing], [c.expiry, row?.expiry ?? c.missing], [c.session, row?.session ?? c.missing],
    [c.spot, money(row?.spot)], [c.strike, money(contract?.strike)], [c.premium, money(contract?.price)],
    [c.currentIv, number(contract ? contract.iv * 100 : null, '%')],
    [c.move, row?.movePct ? `±${row.movePct.toFixed(2)}% · ${row.moveSession} · ${methods[row.moveMethod ?? ''] ?? c.missing}` : c.missing],
    [c.default, number(row?.defaultIvPp, ' %p')],
    [c.defaultDays, ready ? number(row?.defaultDays) : c.missing],
  ];
  return <>
    <section className="es-card" aria-label={c.ticker}>
      <label htmlFor="scenario-ticker">{c.ticker}</label>
      <select id="scenario-ticker" value={index} onChange={e => reset(Number(e.target.value))}>
        {rows.map((r, i) => <option key={r.ticker} value={i}>{r.ticker}</option>)}
      </select>
      <fieldset><legend>{row?.ticker} · ATM</legend>{(['call', 'put'] as const).map(s => <label className="es-choice" key={s}>
        <input type="radio" name="scenario-side" value={s} checked={s === side} onChange={() => setSide(s)} />{c[s]}</label>)}</fieldset>
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="es-meta">{contract?.code ?? c.missing}</p>
    </section>
    <section className="es-card" aria-label={c.result}>
      {[
        { id: 'stock', label: c.stock, value: stockPct, min: -30, max: 30, step: 0.5, change: setStockPct, text: `${stockPct > 0 ? '+' : ''}${stockPct.toFixed(1)}%` },
        { id: 'iv', label: c.iv, value: ivPp, min: Math.min(-100, Math.floor(row?.defaultIvPp ?? 0)), max: 100, step: 0.1, change: setIvPp, text: ready ? `${ivPp > 0 ? '+' : ''}${ivPp.toFixed(2)} %p` : c.missing },
        { id: 'days', label: c.days, value: days, min: 0, max: (row?.years ?? 0) * 365, step: 'any', change: setDays, text: ready ? number(days) : c.missing },
      ].map(s => <div className="es-slider" key={s.id}>
        <label htmlFor={`scenario-${s.id}`}>{s.label} <output htmlFor={`scenario-${s.id}`}>{s.text}</output></label>
        <input id={`scenario-${s.id}`} type="range" min={s.min} max={s.max} step={s.step} value={s.value}
          disabled={!result} aria-valuetext={s.text} onChange={e => s.change(Number(e.target.value))} />
      </div>)}
      <button type="button" onClick={() => reset(index)}>{c.reset}</button>
    </section>
    <section className="es-card" aria-labelledby="scenario-result" aria-live="polite" aria-atomic="true">
      <h2 id="scenario-result">{c.result}</h2><p className="es-note">{c.disclaimer}</p>
      {!result && <p role="status">{c.missing} · {c.incomplete}</p>}
      <dl className="es-result">{[
        [c.theory, money(result?.final)], [c.pnl, money(result?.pnl)],
        [c.direction, money(result?.direction)], [c.volatility, money(result?.volatility)], [c.time, money(result?.time)],
        [c.total, money(result?.total)], [c.base, money(result?.base)], [c.basis, money(result?.basis)],
        [c.assumedSpot, money(result?.nextSpot)], [c.assumedIv, number(result ? result.nextIv * 100 : null, '%')],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
  </>;
}
