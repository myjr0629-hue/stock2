'use client';

// ============================================================================
// PRO «가격 레벨 알림» 설정 시트(2026-11-12) — NEXT_PUBLIC_WATCHLIST_ALERTS === '1' 일 때만 열린다(WatchlistHost)
//   종목마다 내가 정한 가격 최대 5개 · «넘으면 / 내려가면» 한 번 알림 · 옵션 레벨(콜 월·맥스 페인·풋 플로어·감마 플립)은
//   검증된 숫자가 있을 때만 한 번 눌러 추가. 미 정규장에만 약 5분마다 확인(즉시 아님) · 현지 23–07시는 소리 없이.
//   무료 «내 종목 이상 신호»(설정 › 알림)와는 별개 — 이 시트에는 그 신호 목록·장외 비중 항목이 없다(유료 혜택으로 나열하지 않는다).
//   바뀐 것은 시트가 닫힐 때 기기에 저장하고 서버 사본(POST /api/app/watchlist/alerts v:2)을 맞춘다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import type { RowMeta, VerifiedLevels } from '@/lib/app/watchlistUI';
import { wlUI } from '@/lib/app/watchlistUI';
import { getProSnapshot } from '@/lib/app/proEntitlement';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { tickerName } from '@/lib/app/tickerNames';
import { fmtLevel, fmtPrice, fmtSignedPct, type WlLocale } from '@/lib/app/watchlistInsights';
import { readPriceAlerts, syncPriceAlerts, writePriceAlerts } from '@/lib/app/watchlistAlerts';
import {
  LEVELS_PER_TICKER, PRICE_ALERT_TICKER_CAP, addLevel, autoDir, parseTarget, removeLevel, toggleLevel, tickersWithAlertsOn,
  type AddError, type PriceAlertPrefs, type PriceDir, type PriceLevel,
} from '@/lib/app/priceAlerts';
import { wlCopy } from './copy';
import { wlText } from './starActions';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

type L3 = { ko: string; en: string; ja: string };

const K = {
  ko: {
    title: (t: string) => `${t} 가격 알림`,
    now: (p: string) => `지금 ${p}`,
    count: (n: number) => `${n}/${LEVELS_PER_TICKER}`,
    done: '완료',
    quickL: '옵션 레벨로 바로 추가', quickR: (d: string | null) => (d ? `${d} 마감 기준` : ''),
    customL: '직접 입력', inputPh: '목표 가격', inputAria: '목표 가격(달러)',
    up: '넘으면', down: '내려가면', add: '추가',
    listL: '이 종목 레벨', listR: '미 정규장 · 약 5분마다 확인',
    lvl: (px: string, d: PriceDir) => `${px} ${d === 'up' ? '넘으면' : '내려가면'}`,
    dist: (pct: string) => `지금보다 ${pct}`,
    off: '꺼짐 · 켜면 알립니다',
    fired: (when: string, px: string | null) => `${when} 도달${px ? ` (${px})` : ''} · 알림 보냄 · 다시 켜면 또 알립니다`,
    empty: '아직 정한 가격이 없습니다 · 위에서 추가해 주세요',
    del: (px: string) => `${px} 레벨 삭제`,
    note: <><b>미 정규장(09:30–16:00 ET)에만, 약 5분마다 확인합니다.</b> 도달 순간 즉시를 보장하지 않으며, 레벨마다 한 번 알린 뒤 꺼집니다. 현지 23–07시에는 소리 없이 보냅니다.</>,
  },
  en: {
    title: (t: string) => `${t} price alerts`,
    now: (p: string) => `now ${p}`,
    count: (n: number) => `${n}/${LEVELS_PER_TICKER}`,
    done: 'Done',
    quickL: 'Add from options levels', quickR: (d: string | null) => (d ? `as of ${d} close` : ''),
    customL: 'Enter a price', inputPh: 'Target price', inputAria: 'Target price (USD)',
    up: 'Rises above', down: 'Falls below', add: 'Add',
    listL: 'Levels for this stock', listR: 'US session · checked ~every 5 min',
    lvl: (px: string, d: PriceDir) => `${d === 'up' ? 'Above' : 'Below'} ${px}`,
    dist: (pct: string) => `${pct} from now`,
    off: 'Off · turn on to get alerted',
    fired: (when: string, px: string | null) => `Hit ${when}${px ? ` (${px})` : ''} · alert sent · turn on to re-arm`,
    empty: 'No price levels yet · add one above',
    del: (px: string) => `Delete ${px} level`,
    note: <><b>Checked about every 5 minutes, US regular hours (9:30–4:00 ET) only.</b> Not instant — each level alerts once, then turns off. From 11pm to 7am local time, alerts arrive silently.</>,
  },
  ja: {
    title: (t: string) => `${t} 価格アラート`,
    now: (p: string) => `現在 ${p}`,
    count: (n: number) => `${n}/${LEVELS_PER_TICKER}`,
    done: '完了',
    quickL: 'オプションのレベルから追加', quickR: (d: string | null) => (d ? `${d}引け基準` : ''),
    customL: '価格を入力', inputPh: '目標価格', inputAria: '目標価格（ドル）',
    up: '上抜け', down: '下抜け', add: '追加',
    listL: 'この銘柄のレベル', listR: '米国通常取引 · 約5分ごとに確認',
    lvl: (px: string, d: PriceDir) => `${px} を${d === 'up' ? '上抜け' : '下抜け'}`,
    dist: (pct: string) => `現在比 ${pct}`,
    off: 'オフ · オンにすると通知します',
    fired: (when: string, px: string | null) => `${when} 到達${px ? `（${px}）` : ''} · 通知済み · オンで再設定`,
    empty: 'まだ価格レベルがありません · 上で追加してください',
    del: (px: string) => `${px} のレベルを削除`,
    note: <><b>米国通常取引時間（09:30–16:00 ET）のみ、約5分ごとに確認します。</b> 到達の瞬間の即時通知は保証せず、各レベルは1回通知するとオフになります。現地23–07時は音なしで届きます。</>,
  },
} as const;

const ADD_ERR: Record<AddError, L3> = {
  bad: { ko: '가격을 확인해 주세요', en: 'Check the price', ja: '価格を確認してください' },
  per_ticker: { ko: `종목마다 ${LEVELS_PER_TICKER}개까지 정할 수 있습니다`, en: `Up to ${LEVELS_PER_TICKER} levels per stock`, ja: `1銘柄${LEVELS_PER_TICKER}件まで設定できます` },
  tickers: { ko: `가격 알림은 ${PRICE_ALERT_TICKER_CAP}종목까지입니다`, en: `Price alerts cover up to ${PRICE_ALERT_TICKER_CAP} stocks`, ja: `価格アラートは${PRICE_ALERT_TICKER_CAP}銘柄までです` },
  dup: { ko: '이미 있는 레벨입니다', en: 'That level is already set', ja: 'すでにあるレベルです' },
};

function whenText(ms: number): string {
  try {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  } catch { return ''; }
}

export function PriceAlertSheet({ loc, ticker, levels, meta, titleId, onClose }: {
  loc: WlLocale;
  ticker: string;
  levels?: VerifiedLevels | null;
  meta?: RowMeta;
  titleId: string;
  onClose: () => void;
}) {
  const c = wlCopy(loc);
  const k = K[loc];
  const initial = useMemo(() => readPriceAlerts(), []);
  const hadAnyOn = useMemo(() => tickersWithAlertsOn(initial).size > 0, [initial]);
  const [prefs, setPrefs] = useState<PriceAlertPrefs>(initial);
  const [input, setInput] = useState('');
  const [dir, setDir] = useState<PriceDir>('up');
  const dirTouched = useRef(false);
  const dirty = useRef(false);
  const latest = useRef(prefs);
  useEffect(() => { latest.current = prefs; }, [prefs]);

  const current = typeof meta?.price === 'number' && meta.price > 0 ? meta.price : levels?.S && levels.S > 0 ? levels.S : null;

  // 닫힐 때(완료·밀기·뒤로가기 모두) 저장하고 서버 사본을 맞춘다
  useEffect(() => () => {
    if (!dirty.current) return;
    const p = { ...latest.current, pendingSync: true };
    writePriceAlerts(p);
    const onNow = tickersWithAlertsOn(p).size;
    trackWatchlist('wl_alert_save', { tickers: onNow, events: (p.tickers[ticker] || []).length });
    void syncPriceAlerts(p, loc, { askPermission: !hadAnyOn && onNow > 0 }).then((r) => {
      if (r === 'not_pro') {
        // 서버가 PRO 가 아니라고 한다. 기기도 PRO 가 아니면(만료) 권유 시트, 기기는 PRO 라면(서버 확인이 늦음) 다음에 다시 보낸다
        if (!getProSnapshot().isPro) {
          wlUI.openSheet({ kind: 'alertUpsell', ticker, src: 'not_pro', levels, meta });
          return;
        }
        wlUI.showToast({ kind: 'text', tone: 'warn', text: {
          ko: 'PRO 확인이 끝나면 다시 저장합니다', en: 'Will save again once PRO is confirmed', ja: 'PRO確認後にもう一度保存します',
        } }, 3500);
        return;
      }
      const text = r === 'ok'
        ? { ko: '가격 알림을 저장했습니다', en: 'Price alerts saved', ja: '価格アラートを保存しました' }
        : r === 'denied'
          ? { ko: '알림 권한이 꺼져 있습니다 · 기기 설정에서 켜 주세요', en: 'Notifications are off · turn them on in Settings', ja: '通知がオフです · 端末の設定でオンにしてください' }
          : r === 'retry' || r === 'error'
            ? { ko: '잠시 후 다시 저장합니다 · 설정은 기기에 남아 있습니다', en: 'Will retry shortly · settings are kept on this device', ja: 'しばらくして再保存します · 設定は端末に残っています' }
            : wlText((x) => x.alertSavedHere);
      wlUI.showToast({ kind: 'text', text, tone: r === 'ok' ? 'ok' : 'warn' }, 3500);
    });
  }, [hadAnyOn, loc, ticker, levels, meta]);

  const list: PriceLevel[] = prefs.tickers[ticker] || [];
  const full = list.length >= LEVELS_PER_TICKER;

  const tryAdd = (px: number | null, d: PriceDir) => {
    if (px == null) { wlUI.showToast({ kind: 'text', tone: 'warn', text: ADD_ERR.bad }, 2500); return false; }
    const r = addLevel(latest.current, ticker, px, d);
    if (r.error) { wlUI.showToast({ kind: 'text', tone: 'warn', text: ADD_ERR[r.error] }, 3000); return false; }
    dirty.current = true;
    latest.current = r.prefs;
    setPrefs(r.prefs);
    return true;
  };
  const onInput = (v: string) => {
    setInput(v);
    const px = parseTarget(v);
    if (px != null && !dirTouched.current) setDir(autoDir(px, current));
  };
  const onAddCustom = () => {
    if (tryAdd(parseTarget(input), dir)) { setInput(''); dirTouched.current = false; }
  };
  const onToggle = (id: string) => {
    dirty.current = true;
    const next = toggleLevel(latest.current, ticker, id);
    latest.current = next;
    setPrefs(next);
  };
  const onRemove = (id: string) => {
    dirty.current = true;
    const next = removeLevel(latest.current, ticker, id);
    latest.current = next;
    setPrefs(next);
  };

  // 옵션 레벨 바로 추가 — 검증된 숫자가 있을 때만(지도·사다리와 같은 판정 · levels 가 없으면 줄 자체가 없다)
  const quick = levels ? ([
    { key: 'cw', name: c.callWall, v: levels.cw, icon: 'ceil' as const },
    { key: 'mp', name: c.maxPain, v: levels.mp, icon: 'diamond' as const },
    ...(levels.gf != null ? [{ key: 'gf', name: c.gammaFlip, v: levels.gf, icon: 'gamma' as const }] : []),
    { key: 'pf', name: c.putFloor, v: levels.pf, icon: 'floor' as const },
  ].filter((q) => Number.isFinite(q.v) && q.v > 0)) : [];

  const name = tickerName(ticker, loc, meta?.name);
  const sub = [name || null, current ? k.now(fmtPrice(current)) : null, k.count(list.length)].filter(Boolean).join(' · ');
  const dirLbl = (d: PriceDir) => (d === 'up' ? k.up : k.down);

  return (
    <>
      <div className={s.shHd}>
        <AppTickerLogo symbol={ticker} size={36} />
        <div className={s.tt}>
          <b id={titleId} tabIndex={-1}>{k.title(ticker)}</b>
          <small>{sub}</small>
        </div>
        <button type="button" className={s.done} onClick={onClose}>{k.done}</button>
      </div>

      {quick.length > 0 && (
        <>
          <div className={s.secL}>{k.quickL}<span>{k.quickR(levels?.asOf ?? null)}</span></div>
          <div className={s.paQuick}>
            {quick.map((q) => {
              const px = parseTarget(q.v);
              const d = px != null ? autoDir(px, current) : 'up';
              const has = px != null && list.some((l) => l.px === px && l.dir === d && l.on);
              return (
                <button key={q.key} type="button" className={`${s.paQ} ${has ? s.paQOn : ''}`} disabled={has || full}
                  aria-label={`${q.name} ${fmtLevel(q.v)} — ${dirLbl(d)}`}
                  onClick={() => { tryAdd(px, d); }}>
                  <WlIcon name={q.icon} className={s.paQi} />
                  <span>{q.name}</span>
                  <b>{fmtLevel(q.v)}</b>
                  <small>{d === 'up' ? '↑' : '↓'}</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className={s.secL}>{k.customL}<span>{k.count(list.length)}</span></div>
      <div className={s.paAdd}>
        <label className={s.paIn}>
          <span aria-hidden="true">$</span>
          <input type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done" placeholder={k.inputPh} aria-label={k.inputAria}
            value={input} disabled={full} maxLength={12}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddCustom(); } }} />
        </label>
        <span className={s.paSeg} role="group" aria-label={`${k.up} / ${k.down}`}>
          {(['up', 'down'] as const).map((d) => (
            <button key={d} type="button" aria-pressed={dir === d} className={dir === d ? s.paSegOn : ''} disabled={full}
              onClick={() => { dirTouched.current = true; setDir(d); }}>{dirLbl(d)}</button>
          ))}
        </span>
        <button type="button" className={s.paBtn} disabled={full || parseTarget(input) == null} onClick={onAddCustom}>{k.add}</button>
      </div>

      <div className={s.secL}>{k.listL}<span>{k.listR}</span></div>
      <div className={s.grp}>
        {list.length === 0 ? (
          <div className={`${s.set} ${s.setOff}`}>
            <span className={`${s.tile} ${s.tEv}`}><WlIcon name="bell" /></span>
            <span className={s.setTx}><small>{k.empty}</small></span>
          </div>
        ) : list.map((l) => {
          const pxS = fmtPrice(l.px);
          const dist = current ? fmtSignedPct(((l.px - current) / current) * 100, 1) : null;
          const subT = l.firedAt ? k.fired(whenText(l.firedAt), l.firedPx ? fmtPrice(l.firedPx) : null) : !l.on ? k.off : dist ? k.dist(dist) : '';
          return (
            <div key={l.id} className={`${s.set} ${l.on ? '' : s.setOff}`}>
              <span className={`${s.tile} ${s.tLvl}`}><WlIcon name={l.dir === 'up' ? 'ceil' : 'floor'} /></span>
              <button type="button" role="switch" aria-checked={l.on} className={s.paRowBtn} onClick={() => onToggle(l.id)}>
                <span className={s.setTx}><b>{k.lvl(pxS, l.dir)}</b>{subT && <small>{subT}</small>}</span>
                <span className={`${s.sw} ${l.on ? s.swOn : ''}`} aria-hidden="true" />
              </button>
              <button type="button" className={s.paDel} aria-label={k.del(pxS)} onClick={() => onRemove(l.id)}><WlIcon name="x" /></button>
            </div>
          );
        })}
      </div>

      <div className={s.tnote}>
        <WlIcon name="clock" />
        <span>{k.note}</span>
      </div>
    </>
  );
}
