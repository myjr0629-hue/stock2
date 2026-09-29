'use client';

// ============================================================================
// PRO 종목 알림 설정(시안 04) — NEXT_PUBLIC_WATCHLIST_ALERTS === '1' 일 때만 열린다
//   현재 레벨 5개(풋플로어 · 맥스페인 · 가격 · 감마 플립 · 콜월)를 먼저 보여 주고 7개 이벤트를 그 숫자로 설명.
//   레벨이 검증되지 않았으면 숫자를 쓰지 않는다(«레벨 갱신 대기»).
//   조용한 시간은 «소리만 끔» · 하루 상한 · 권한은 처음 켤 때만 · 알림엔 광고·권유 없음.
//   바뀐 것은 시트가 닫힐 때 기기에 저장하고 서버 사본(계약: POST /api/app/watchlist/alerts)을 맞춘다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import type { RowMeta, VerifiedLevels } from '@/lib/app/watchlistUI';
import { wlUI } from '@/lib/app/watchlistUI';
import { getProSnapshot } from '@/lib/app/proEntitlement';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { tickerName } from '@/lib/app/tickerNames';
import { fmtLevel, mapGeometry, type WlLocale } from '@/lib/app/watchlistInsights';
import {
  ALERT_EVENTS, ALERT_TICKER_CAP, DAILY_CAP_MAX, DAILY_CAP_MIN, DEFAULT_EVENTS, alertTickersOn, canEnableMore,
  readAlertPrefs, syncAlertPrefs, writeAlertPrefs, type AlertEventId, type AlertPrefs,
} from '@/lib/app/watchlistAlerts';
import { wlCopy } from './copy';
import { WlIcon, type WlIconName } from './icons';
import s from './watchlist.module.css';

const EV_META: Record<AlertEventId, { icon: WlIconName; tile: string; fill?: boolean }> = {
  call_wall_break: { icon: 'ceil', tile: s.tLvl },
  put_floor_break: { icon: 'floor', tile: s.tLvl },
  gamma_flip_cross: { icon: 'gamma', tile: s.tGam },
  maxpain_divergence: { icon: 'diamond', tile: s.tMp, fill: true },
  darkpool_spike: { icon: 'layers', tile: s.tFlow },
  whale_new: { icon: 'bolt', tile: s.tFlow },
  earnings_d1: { icon: 'cal', tile: s.tEv },
};

function evCopy(loc: WlLocale, id: AlertEventId, lv: VerifiedLevels | null | undefined): { b: string; sub: string } {
  const cw = lv ? fmtLevel(lv.cw) : null, pf = lv ? fmtLevel(lv.pf) : null, gf = lv?.gf != null ? fmtLevel(lv.gf) : null;
  const K = {
    ko: {
      call_wall_break: { b: '콜월 돌파', sub: cw ? `${cw} 위로 확정 · 5분 봉 종가 기준` : '콜월 위로 확정 · 5분 봉 종가 기준' },
      put_floor_break: { b: '풋플로어 이탈', sub: pf ? `${pf} 아래로 확정 · 5분 봉 종가 기준` : '풋플로어 아래로 확정 · 5분 봉 종가 기준' },
      gamma_flip_cross: { b: '감마 플립 교차', sub: gf ? `${gf} 위·아래가 바뀔 때` : '감마 플립 위·아래가 바뀔 때' },
      maxpain_divergence: { b: '만기 주간 맥스페인 괴리', sub: '만기 3거래일 전부터 · 괴리가 평소 상위 10%' },
      darkpool_spike: { b: '장외(다크풀) 비중 급변', sub: 'FINRA 일간 · 20일 평균 대비 · 장 마감 후 1회' },
      whale_new: { b: '고래 신규 포지션', sub: '미결제약정이 급증한 새 계약 · 아침 1회' },
      earnings_d1: { b: '실적 D-1', sub: '실적 전날 · 옵션 내재 변동과 함께' },
    },
    en: {
      call_wall_break: { b: 'Call wall break', sub: cw ? `Confirmed above ${cw} · 5-min close` : 'Confirmed above the call wall · 5-min close' },
      put_floor_break: { b: 'Put floor break', sub: pf ? `Confirmed below ${pf} · 5-min close` : 'Confirmed below the put floor · 5-min close' },
      gamma_flip_cross: { b: 'Gamma flip cross', sub: gf ? `When price crosses ${gf}` : 'When price crosses the gamma flip' },
      maxpain_divergence: { b: 'Expiry-week max-pain gap', sub: 'From 3 sessions out · gap in its top 10%' },
      darkpool_spike: { b: 'Off-exchange (dark pool) spike', sub: 'FINRA daily · vs 20-day avg · once after close' },
      whale_new: { b: 'Whale new position', sub: 'New contracts with surging open interest · each morning' },
      earnings_d1: { b: 'Earnings D-1', sub: 'The day before · with the implied move' },
    },
    ja: {
      call_wall_break: { b: 'コールウォール突破', sub: cw ? `${cw}上で確定 · 5分足終値` : 'コールウォール上で確定 · 5分足終値' },
      put_floor_break: { b: 'プットフロア割れ', sub: pf ? `${pf}下で確定 · 5分足終値` : 'プットフロア下で確定 · 5分足終値' },
      gamma_flip_cross: { b: 'ガンマフリップ交差', sub: gf ? `${gf}の上下が入れ替わるとき` : 'ガンマフリップの上下が入れ替わるとき' },
      maxpain_divergence: { b: '満期週のマックスペイン乖離', sub: '満期3営業日前から · 乖離が平常の上位10%' },
      darkpool_spike: { b: '場外(ダークプール)比率の急変', sub: 'FINRA日次 · 20日平均比 · 引け後1回' },
      whale_new: { b: '大口の新規ポジション', sub: '建玉が急増した新規契約 · 朝1回' },
      earnings_d1: { b: '決算 D-1', sub: '決算前日 · 予想変動と一緒に' },
    },
  } as const;
  return K[loc][id];
}

/** 미 정규장(09:30–16:00 ET)을 기기 시간대로 */
function sessionLocal(loc: WlLocale): string {
  try {
    const now = new Date();
    const etDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
    // 그날 ET 오프셋(서머타임)을 구해 09:30·16:00 ET 의 순간을 만든다
    const probe = new Date(`${etDay}T12:00:00Z`);
    const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(probe)) % 24;
    const offset = etHour - 12;                           // -4 (EDT) / -5 (EST)
    const at = (h: number, m: number) => new Date(Date.parse(`${etDay}T00:00:00Z`) + ((h - offset) * 60 + m) * 60_000);
    const f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const a = f.format(at(9, 30)), b = f.format(at(16, 0));
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (loc === 'ko') return `미 정규장 = ${tz === 'Asia/Seoul' ? '한국' : '현지'} ${a}–${b}`;
    if (loc === 'ja') return `米国通常取引 = ${tz === 'Asia/Tokyo' ? '日本' : '現地'} ${a}–${b}`;
    return `US session = ${a}–${b} local`;
  } catch {
    return loc === 'ko' ? '미 정규장 09:30–16:00 ET' : loc === 'ja' ? '米国通常取引 09:30–16:00 ET' : 'US session 09:30–16:00 ET';
  }
}

export function AlertSettingsSheet({ loc, ticker, levels, meta, titleId, onClose }: {
  loc: WlLocale;
  ticker: string;
  levels?: VerifiedLevels | null;
  meta?: RowMeta;
  titleId: string;
  onClose: () => void;
}) {
  const c = wlCopy(loc);
  const initial = useMemo(() => readAlertPrefs(), []);
  const hadAnyOn = useMemo(() => alertTickersOn(initial).length > 0, [initial]);
  // 처음 여는 종목은 기본값을 «켠» 상태로 연다 — 단 켠 종목이 이미 50개면(서버 상한) 꺼진 채로
  const firstOpen = !initial.tickers[ticker];
  const roomForNew = canEnableMore(initial, ticker);
  const [prefs, setPrefs] = useState<AlertPrefs>(() => ({
    ...initial,
    tickers: { ...initial.tickers, [ticker]: initial.tickers[ticker] ?? (roomForNew ? [...DEFAULT_EVENTS] : []) },
  }));
  const dirty = useRef(firstOpen && roomForNew);
  const latest = useRef(prefs);
  useEffect(() => { latest.current = prefs; }, [prefs]);

  // 닫힐 때(완료·밀기·뒤로가기 모두) 저장하고 서버 사본을 맞춘다
  useEffect(() => () => {
    if (!dirty.current) return;
    const p = { ...latest.current, pendingSync: true };
    writeAlertPrefs(p);
    const firstOn = !hadAnyOn && alertTickersOn(p).length > 0;
    trackWatchlist('wl_alert_save', { tickers: alertTickersOn(p).length, events: (p.tickers[ticker] || []).length });
    void syncAlertPrefs(p, loc, { askPermission: firstOn }).then((r) => {
      if (r === 'not_pro') {
        // 서버가 PRO 가 아니라고 한다. 기기도 PRO 가 아니면(만료) 권유 시트,
        // 기기는 PRO 라고 하면(서버 확인이 늦음) 조용히 다음에 다시 보낸다 — 시트가 번갈아 뜨지 않게.
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
        ? { ko: '알림 설정을 저장했습니다', en: 'Alert settings saved', ja: '通知設定を保存しました' }
        : r === 'denied'
          ? { ko: '알림 권한이 꺼져 있습니다 · 기기 설정에서 켜 주세요', en: 'Notifications are off · turn them on in Settings', ja: '通知がオフです · 端末の設定でオンにしてください' }
          : r === 'retry' || r === 'error'
            ? { ko: '잠시 후 다시 저장합니다 · 설정은 기기에 남아 있습니다', en: 'Will retry shortly · settings are kept on this device', ja: 'しばらくして再保存します · 設定は端末に残っています' }
            : { ko: '설정을 기기에 저장했습니다 · 알림은 곧 시작됩니다', en: 'Saved on this device · alerts start soon', ja: 'この端末に保存しました · 通知はまもなく開始します' };
      wlUI.showToast({ kind: 'text', text, tone: r === 'ok' ? 'ok' : 'warn' }, 3500);
    });
  }, [hadAnyOn, loc, ticker, levels, meta]);

  const evs = prefs.tickers[ticker] || [];
  const toggle = (id: AlertEventId) => {
    if (!evs.length && !canEnableMore(prefs, ticker)) {
      wlUI.showToast({ kind: 'text', tone: 'warn', text: {
        ko: `알림은 ${ALERT_TICKER_CAP}종목까지 켤 수 있습니다`,
        en: `Alerts can be on for up to ${ALERT_TICKER_CAP} stocks`,
        ja: `通知は${ALERT_TICKER_CAP}銘柄までオンにできます`,
      } }, 3000);
      return;
    }
    dirty.current = true;
    setPrefs((p) => {
      const cur = new Set(p.tickers[ticker] || []);
      if (cur.has(id)) cur.delete(id); else cur.add(id);
      return { ...p, tickers: { ...p.tickers, [ticker]: ALERT_EVENTS.filter((e) => cur.has(e)) } };
    });
  };
  const setCap = (d: number) => {
    dirty.current = true;
    setPrefs((p) => ({ ...p, dailyCap: Math.min(DAILY_CAP_MAX, Math.max(DAILY_CAP_MIN, p.dailyCap + d)) }));
  };
  const toggleQuiet = () => {
    dirty.current = true;
    setPrefs((p) => ({ ...p, quiet: { ...p.quiet, on: !p.quiet.on } }));
  };

  const name = tickerName(ticker, loc, meta?.name);
  const onCount = evs.length;
  const asOf = levels?.asOf ?? null;
  const subParts = [
    name || null,
    loc === 'ko' ? `7개 중 ${onCount}개 켜짐` : loc === 'ja' ? `7件中${onCount}件オン` : `${onCount} of 7 on`,
    asOf ? (loc === 'ko' ? `레벨 ${asOf} 마감 기준` : loc === 'ja' ? `レベル${asOf}引け基準` : `levels as of ${asOf} close`) : null,
  ].filter(Boolean);

  const g = levels ? mapGeometry(levels) : null;
  const gfPos = levels?.gf != null ? Math.max(0, Math.min(1, (levels.gf - levels.pf) / (levels.cw - levels.pf))) : null;
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const basis = levels?.basisLabel || (loc === 'ko' ? '종가' : loc === 'ja' ? '終値' : 'Close');

  return (
    <>
      <div className={s.shHd}>
        <AppTickerLogo symbol={ticker} size={36} />
        <div className={s.tt}>
          <b id={titleId} tabIndex={-1}>{loc === 'en' ? `${ticker} alerts` : loc === 'ja' ? `${ticker} 通知` : `${ticker} 알림`}</b>
          <small>{subParts.join(' · ')}</small>
        </div>
        <button type="button" className={s.done} onClick={onClose}>{loc === 'ko' ? '완료' : loc === 'ja' ? '完了' : 'Done'}</button>
      </div>

      <div className={s.ladder}>
        {levels && g ? (
          <>
            <span className={`${s.pm} ${s.pmBig}`} role="img"
              aria-label={`${c.putFloor} ${fmtLevel(levels.pf)}, ${c.maxPain} ${fmtLevel(levels.mp)}, ${basis} ${fmtLevel(levels.S)}${levels.gf != null ? `, ${c.gammaFlip} ${fmtLevel(levels.gf)}` : ''}, ${c.callWall} ${fmtLevel(levels.cw)}`}>
              <i className={s.pmTk} />
              <i className={s.pmSg} style={{
                left: pct(g.segLeft), width: pct(g.segWidth),
                background: `linear-gradient(${g.segFrom === 'left' ? 90 : 270}deg, rgba(251,191,36,.38), rgba(251,191,36,.06))`,
              }} />
              {gfPos != null && <i className={s.pmGf} style={{ left: pct(gfPos) }} />}
              <i className={s.pmMp} style={{ left: pct(g.mp) }} />
              <i className={s.pmPx} style={{ left: pct(g.px) }} />
            </span>
            <div className={s.lad} aria-hidden="true">
              <span><i className={s.ladG}><i className={s.gCap} /></i>{c.putFloor}<b>{fmtLevel(levels.pf)}</b></span>
              <span><i className={s.ladG}><i className={s.gMp} /></i>{c.maxPain}<b>{fmtLevel(levels.mp)}</b></span>
              <span className={s.now}><i className={s.ladG}><i className={s.gPx} /></i>{basis}<b>{fmtLevel(Number(levels.S.toFixed(2)))}</b></span>
              {levels.gf != null
                ? <span><i className={s.ladG}><i className={s.gGf} /></i>{c.gammaFlip}<b>{fmtLevel(levels.gf)}</b></span>
                : <span />}
              <span><i className={s.ladG}><i className={s.gCap} /></i>{c.callWall}<b>{fmtLevel(levels.cw)}</b></span>
            </div>
          </>
        ) : (
          <span className={`${s.pm} ${s.pmNa}`} role="img" aria-label={c.levelsWaitAria}>
            <i className={s.pmTk} />
            <span className={s.pmNaL}><WlIcon name="clock" />{c.levelsWait}</span>
          </span>
        )}
      </div>

      <div className={s.secL}>
        {loc === 'ko' ? '이 종목 알림' : loc === 'ja' ? 'この銘柄の通知' : 'Alerts for this stock'}
        <span>{loc === 'ko' ? '장중 5–15분마다 확인' : loc === 'ja' ? '取引中5–15分ごとに確認' : 'Checked every 5–15 min'}</span>
      </div>
      <div className={s.grp}>
        {ALERT_EVENTS.map((id) => {
          const m = EV_META[id];
          const t = evCopy(loc, id, levels);
          const onE = evs.includes(id);
          return (
            <button key={id} type="button" role="switch" aria-checked={onE} className={`${s.set} ${onE ? '' : s.setOff}`} onClick={() => toggle(id)}>
              <span className={`${s.tile} ${m.tile} ${m.fill ? s.tileFill : ''}`}><WlIcon name={m.icon} /></span>
              <span className={s.setTx}><b>{t.b}</b><small>{t.sub}</small></span>
              <span className={`${s.sw} ${onE ? s.swOn : ''}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className={s.secL}>
        {loc === 'ko' ? '모든 종목 공통' : loc === 'ja' ? '全銘柄共通' : 'All stocks'}
        <span>{sessionLocal(loc)}</span>
      </div>
      <div className={s.grp}>
        <button type="button" role="switch" aria-checked={prefs.quiet.on} className={`${s.set} ${prefs.quiet.on ? '' : s.setOff}`} onClick={toggleQuiet}>
          <span className={`${s.tile} ${s.tEv}`}><WlIcon name="moon" /></span>
          <span className={s.setTx}>
            <b>{loc === 'ko' ? '조용한 시간' : loc === 'ja' ? 'おやすみ時間' : 'Quiet hours'}<span className={s.tpill}>{prefs.quiet.start}–{prefs.quiet.end}</span></b>
            <small>{loc === 'ko' ? '소리·진동 없이 알림 센터에만 쌓입니다' : loc === 'ja' ? '音・振動なしで通知センターにだけ届きます' : 'No sound or vibration — they wait in Notification Center'}</small>
          </span>
          <span className={`${s.sw} ${prefs.quiet.on ? s.swOn : ''}`} aria-hidden="true" />
        </button>
        <div className={s.set} role="group" aria-label={loc === 'ko' ? '하루 최대 알림 수' : loc === 'ja' ? '1日の通知上限' : 'Daily alert limit'}>
          <span className={`${s.tile} ${s.tEv}`}><WlIcon name="capn" /></span>
          <span className={s.setTx}>
            <b>{loc === 'ko' ? '하루 최대' : loc === 'ja' ? '1日の上限' : 'Daily max'}</b>
            <small>{loc === 'ko' ? '같은 종목·같은 알림은 하루 1회' : loc === 'ja' ? '同じ銘柄・同じ通知は1日1回' : 'Same stock, same alert: once a day'}</small>
          </span>
          <span className={s.stp}>
            <button type="button" aria-label={loc === 'ko' ? '줄이기' : loc === 'ja' ? '減らす' : 'Decrease'} disabled={prefs.dailyCap <= DAILY_CAP_MIN} onClick={() => setCap(-1)}><WlIcon name="minus" /></button>
            <b aria-live="polite">{prefs.dailyCap}</b>
            <button type="button" aria-label={loc === 'ko' ? '늘리기' : loc === 'ja' ? '増やす' : 'Increase'} disabled={prefs.dailyCap >= DAILY_CAP_MAX} onClick={() => setCap(1)}><WlIcon name="plus" /></button>
          </span>
        </div>
      </div>

      <div className={s.tnote}>
        <WlIcon name="bell" />
        <span>
          {loc === 'ko' ? <><b>처음 켤 때 알림 권한을 묻습니다.</b> 가격·레벨 알림에는 광고나 구독 권유를 넣지 않습니다.</>
            : loc === 'ja' ? <><b>初めてオンにするときに通知の許可を求めます。</b> 価格・レベル通知に広告や購読の勧誘は入れません。</>
            : <><b>We ask for notification permission the first time you turn one on.</b> Price and level alerts never carry ads or upsells.</>}
        </span>
      </div>
    </>
  );
}
