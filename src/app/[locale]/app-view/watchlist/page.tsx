'use client';

// ============================================================================
// «내 종목» — 앱 전용 포지셔닝 워치리스트 (기획서 .agent/product/WATCHLIST-PLAN-2026-09-29.md)
// ----------------------------------------------------------------------------
// 가격표가 아니라 «내 종목의 옵션 지형»을 모은다. 행마다 증권사 목록에 없는 두 칸:
//   ① 포지셔닝 지도(풋플로어 ─ ◆맥스페인 ─ ●가격 ─ 콜월)  ② 오늘의 사실 칩(무료 1 · PRO 2)
// 원본은 기기(localStorage 'sg-watchlist-v1') — 로그인·서버 저장 없음. 무료 5종목 · PRO 무제한.
// 숫자와 사실만(예측·권유 없음) · 정의를 어긴/오래된 레벨은 숨긴다(«레벨 갱신 대기») · 지어내지 않는다.
// 알림(벨)은 NEXT_PUBLIC_WATCHLIST_ALERTS === '1' 일 때만 보인다.
// 시안: /tmp/ego/wl/proto 01(무료) · 02(PRO) · 05a(빈 상태)
// ============================================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { WlIcon } from '@/components/app/watchlist/icons';
import { PositionMap, MiniMap } from '@/components/app/watchlist/PositionMap';
import { ChipLine } from '@/components/app/watchlist/ChipLine';
import { wlCopy } from '@/components/app/watchlist/copy';
import { addStar } from '@/components/app/watchlist/starActions';
import { useStarLongPress, lpRowClass } from '@/components/app/watchlist/useLongPress';
import { useWatchlistData, type BatchRealtime, type DarkPoolInfo, type EarningsInfo, type WhaleInfo } from '@/components/app/watchlist/useWatchlistData';
import ws from '@/components/app/watchlist/watchlist.module.css';
import { FREE_LIMIT, useAppWatchlist } from '@/lib/app/watchlist';
import { isPreviewHost, whenProReady } from '@/lib/app/proEntitlement';
import { useWatchlistAlertsEnabled } from '@/lib/app/watchlistFlags';
import { ALERT_PREFS_KEY } from '@/lib/app/watchlistAlerts';
import { wlUI, type VerifiedLevels } from '@/lib/app/watchlistUI';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { tickerName } from '@/lib/app/tickerNames';
import {
  checkLevels, fmtMD, fmtPrice, fmtSignedPct, localTodayYmd, priceBasis, priceBasisLabel, selectInsights, segText,
  toWlLocale, type InsightChip, type LevelsVerdict, type WlLocale,
} from '@/lib/app/watchlistInsights';
import p from './watchlist.module.css';

const EditList = dynamic(() => import('./EditList'), { ssr: false });
const TickerSearchOverlay = dynamic(
  () => import('@/components/app/watchlist/TickerSearchOverlay').then((m) => m.TickerSearchOverlay),
  { ssr: false },
);

// ── 문구 ────────────────────────────────────────────────────────────────
const PC = {
  ko: {
    back: '대시보드', backAria: '대시보드로 돌아가기', edit: '편집', done: '완료', add: '종목 추가',
    countAria: (n: number, m: number) => `${m}종목 중 ${n}종목`, countAriaPro: (n: number) => `${n}종목`,
    emptySub: '아직 담은 종목이 없습니다', alertsOn: (n: number) => `알림 켠 종목 ${n}`,
    sorts: { change: '변화 큰 순', pct: '등락률', earnings: '실적 임박', alerts: '알림 켠 종목' },
    infoAria: '지도 읽는 법', toFlow: '플로우 화면으로',
    both: (d: string) => `옵션 레벨·장외 비중 ${d} 마감 기준`, lv: (d: string) => `레벨 ${d} 마감 기준`, dp: (d: string) => `장외 비중 ${d} 마감 기준`,
    pbAlertT: '레벨에 닿는 순간, 푸시로', pbAlertS: '콜월 돌파 · 감마 플립 교차 · 장외 비중 급변 · 종목 무제한',
    pbGenT: '내 종목을 제한 없이', pbGenS: (n: number) => `모든 인사이트 칩 · 광고 없음 · 무료는 ${n}종목까지`,
    disc: '숫자와 사실만 보여 줍니다 · 투자 권유가 아닙니다',
    emEb: '무엇이 다른가요', emH: '가격표가 아니라, 옵션 지형을 모읍니다',
    emP: '종목마다 풋플로어–맥스페인–콜월 사이 지금 위치와, 오늘 달라진 사실 하나를 한 줄로 보여 줍니다.',
    emPv: '미리보기 — 담으면 이렇게 보입니다', picks: '자주 보는 종목 · 눌러서 담기', freeN: (n: number) => `무료 ${n}종목`,
    search: '검색해서 추가',
    tip: '종목 화면 오른쪽 위 별로도 담을 수 있습니다. 담은 종목은 대시보드 맨 위와 종목 칩 줄 맨 앞에 모입니다.',
    bellLock: (t: string) => `${t} 알림 — PRO 전용`, bellOn: (t: string) => `${t} 알림 켜짐 — 설정 열기`, bellOff: (t: string) => `${t} 알림 꺼짐 — 설정 열기`,
    fail: '가격을 불러오지 못했습니다', retry: '다시 시도', pickAdd: (t: string) => `${t} 내 종목에 추가`,
  },
  en: {
    back: 'DASHBOARD', backAria: 'Back to Dashboard', edit: 'Edit', done: 'Done', add: 'Add stock',
    countAria: (n: number, m: number) => `${n} of ${m} stocks`, countAriaPro: (n: number) => `${n} stocks`,
    emptySub: 'No stocks yet', alertsOn: (n: number) => `Alerts on ${n}`,
    sorts: { change: 'Biggest move', pct: '% change', earnings: 'Earnings soon', alerts: 'Alerts on' },
    infoAria: 'How to read the map', toFlow: 'open Flow',
    both: (d: string) => `levels & off-exchange as of ${d} close`, lv: (d: string) => `levels as of ${d} close`, dp: (d: string) => `off-exchange as of ${d} close`,
    pbAlertT: 'Pushed the moment a level is hit', pbAlertS: 'Call wall breaks · gamma flip crosses · off-exchange spikes · unlimited stocks',
    pbGenT: 'Unlimited watchlist', pbGenS: (n: number) => `Every insight chip · no ads · free covers ${n}`,
    disc: 'Numbers and facts only · not investment advice',
    emEb: 'WHAT’S DIFFERENT', emH: 'Not a price list — your options map',
    emP: 'For each stock: where price sits between put floor, max pain and call wall, plus one fact that changed today.',
    emPv: 'PREVIEW — HOW YOUR LIST WILL LOOK', picks: 'Popular · tap to add', freeN: (n: number) => `Free ${n}`,
    search: 'Search to add',
    tip: 'You can also use the star at the top right of a stock screen. Starred stocks gather at the top of the Dashboard and the front of the ticker chips.',
    bellLock: (t: string) => `${t} alerts — PRO only`, bellOn: (t: string) => `${t} alerts on — open settings`, bellOff: (t: string) => `${t} alerts off — open settings`,
    fail: 'Couldn’t load prices', retry: 'Retry', pickAdd: (t: string) => `Add ${t} to My Watchlist`,
  },
  ja: {
    back: 'ダッシュボード', backAria: 'ダッシュボードに戻る', edit: '編集', done: '完了', add: '銘柄を追加',
    countAria: (n: number, m: number) => `${m}銘柄中${n}銘柄`, countAriaPro: (n: number) => `${n}銘柄`,
    emptySub: 'まだ登録した銘柄はありません', alertsOn: (n: number) => `通知オン ${n}`,
    sorts: { change: '変化の大きい順', pct: '騰落率', earnings: '決算が近い', alerts: '通知オン' },
    infoAria: 'マップの見方', toFlow: 'フロー画面へ',
    both: (d: string) => `オプションレベル・場外比率 ${d}引け基準`, lv: (d: string) => `レベル ${d}引け基準`, dp: (d: string) => `場外比率 ${d}引け基準`,
    pbAlertT: 'レベルに触れた瞬間、プッシュで', pbAlertS: 'コールウォール突破 · ガンマフリップ交差 · 場外比率の急変 · 銘柄数無制限',
    pbGenT: 'マイ銘柄を上限なしで', pbGenS: (n: number) => `すべてのインサイトチップ · 広告なし · 無料は${n}銘柄まで`,
    disc: '数字と事実だけを表示します · 投資勧誘ではありません',
    emEb: '何が違うのか', emH: '株価表ではなく、オプションの地形を集めます',
    emP: '銘柄ごとに、プットフロア–マックスペイン–コールウォールの間の現在位置と、今日変わった事実をひとつ、一行で。',
    emPv: 'プレビュー — 追加するとこう見えます', picks: 'よく見る銘柄 · タップで追加', freeN: (n: number) => `無料${n}銘柄`,
    search: '検索して追加',
    tip: '銘柄画面の右上の★でも追加できます。マイ銘柄はダッシュボード上部と銘柄チップ列の先頭に集まります。',
    bellLock: (t: string) => `${t}の通知 — PRO専用`, bellOn: (t: string) => `${t}の通知オン — 設定を開く`, bellOff: (t: string) => `${t}の通知オフ — 設定を開く`,
    fail: '価格を読み込めませんでした', retry: '再試行', pickAdd: (t: string) => `${t}をマイ銘柄に追加`,
  },
} as const;

type SortKey = 'change' | 'pct' | 'earnings' | 'alerts';
const SORT_KEY = 'sg-watchlist-sort-v1';
const PICKS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];
const PREVIEW_CANDIDATES = ['NVDA', 'MU', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'TSLA', 'AMD'];

// ── 분 단위 «지금» — 날짜 라벨·신선도 판정용(렌더에서 Date.now() 를 부르지 않는다) ──
let nowMs = 0;
let nowTimer: number | null = null;
const nowListeners = new Set<() => void>();
function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  if (nowTimer == null) {
    nowTimer = window.setInterval(() => { nowMs = Date.now(); nowListeners.forEach((l) => l()); }, 60_000);
  }
  return () => {
    nowListeners.delete(cb);
    if (!nowListeners.size && nowTimer != null) { window.clearInterval(nowTimer); nowTimer = null; }
  };
}
function getNow() { if (!nowMs) nowMs = Date.now(); return nowMs; }

const noopSubscribe = () => () => {};
function canBuySnapshot(): boolean {
  try {
    if (isPreviewHost()) return true;
    return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  } catch { return false; }
}

// ── 정렬 칩(뷰어 편의 — 기기에만) ──
let memSort: string | null = null;
function subscribeSort(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (!e.key || e.key === SORT_KEY) cb(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener('sg:wl-sort', cb);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('sg:wl-sort', cb); };
}
function getSort(): string {
  try { return localStorage.getItem(SORT_KEY) || memSort || 'change'; } catch { return memSort || 'change'; }
}
function setSortPref(k: SortKey) {
  memSort = k;
  try { localStorage.setItem(SORT_KEY, k); } catch { /* 사생활 모드 — 메모리로 */ }
  window.dispatchEvent(new Event('sg:wl-sort'));
}

// ── 알림 켠 종목(플래그 켜짐일 때만 읽는다) ──
function subscribeAlerts(cb: () => void) {
  window.addEventListener('sg:watchlist-alerts', cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener('sg:watchlist-alerts', cb); window.removeEventListener('storage', cb); };
}
function getAlertsRaw(): string {
  try { return localStorage.getItem(ALERT_PREFS_KEY) || ''; } catch { return ''; }
}

interface RowModel {
  t: string;
  name: string;
  rt: BatchRealtime | undefined;
  levels: LevelsVerdict;
  verified: VerifiedLevels | null;
  chips: InsightChip[];
  chipSig: string;
  basisShort: string;
}

function mostCommon(xs: (string | null | undefined)[]): string | null {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) || 0) + 1);
  let best: string | null = null, n = 0;
  for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
}

function buildRows(
  tickers: readonly string[], loc: WlLocale, now: number, max: number,
  data: { rows: Record<string, BatchRealtime>; earnings: Record<string, EarningsInfo>; darkPool: Record<string, DarkPoolInfo>; whales: Record<string, WhaleInfo> },
): RowModel[] {
  const today = localTodayYmd(now);
  return tickers.map((t) => {
    const rt = data.rows[t];
    const levels = checkLevels({
      price: rt?.price, maxPain: rt?.maxPain, callWall: rt?.callWall, putFloor: rt?.putFloor, gammaFlipLevel: rt?.gammaFlipLevel,
      levelsChainDate: rt?.levelsChainDate, levelsSource: rt?.levelsSource, hasLevelsMeta: rt?.hasLevelsMeta,
    }, now);
    const basis = priceBasis(rt?.session, now);
    const basisShort = priceBasisLabel(basis, loc, true);
    const e = data.earnings[t];
    const chips = rt ? selectInsights({
      price: rt.price ?? null,
      changePct: rt.changePct ?? null,
      levels,
      impliedMovePct: rt.impliedMovePct ?? null,
      earnings: e && e.date >= today ? { date: e.date, hour: e.hour } : null,
      whale: data.whales[t] ?? null,
      darkPool: data.darkPool[t] ?? null,
      levelsExpiration: rt.levelsExpiration ?? null,
      todayLocal: today,
      nowMs: now,
    }, loc, max) : [];
    return {
      t,
      name: tickerName(t, loc, e?.name),
      rt,
      levels,
      verified: levels.ok ? {
        S: levels.S, pf: levels.pf, mp: levels.mp, cw: levels.cw, gf: levels.gf,
        asOf: levels.chainDate ? fmtMD(levels.chainDate) : null, basisLabel: basisShort,
      } : null,
      chips,
      chipSig: chips.map((c) => `${c.kind}:${segText(c.long)}`).join('|'),
      basisShort,
    };
  });
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={null}>
      <WatchlistInner />
    </Suspense>
  );
}

function WatchlistInner() {
  const locale = useLocale();
  const loc = toWlLocale(locale);
  const t = PC[loc];
  const c = wlCopy(loc);
  const router = useRouter();
  const params = useSearchParams();
  const wl = useAppWatchlist();
  const alertsOn = useWatchlistAlertsEnabled();
  const now = useSyncExternalStore(subscribeNow, getNow, () => 0);
  const sortRaw = useSyncExternalStore(subscribeSort, getSort, () => 'change');
  const alertsRaw = useSyncExternalStore(subscribeAlerts, getAlertsRaw, () => '');
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [searchOpen, setSearchOpen] = useState(false);
  const isPro = wl.isPro;
  const sort: SortKey = sortRaw === 'pct' || sortRaw === 'earnings' ? sortRaw
    : sortRaw === 'alerts' && isPro && alertsOn ? 'alerts' : 'change';
  // 살 수 있는 곳(네이티브) · 프리뷰에서만 PRO 안내 카드 — 살릴 수 없는 버튼은 보이지 않는다(useProStatus 원칙)
  const canBuyHere = useSyncExternalStore(noopSubscribe, canBuySnapshot, () => false);
  const showBuy = !isPro && canBuyHere;

  const data = useWatchlistData(wl.tickers, { extras: true, locale: loc });
  const empty = wl.count === 0;
  const preview = useWatchlistData(empty ? PREVIEW_CANDIDATES : [], { extras: true, locale: loc });

  // 다른 곳(한도 시트 «기존 종목 정리하기»)에서 편집 모드를 켠다
  useEffect(() => {
    const on = () => { setSearchOpen(false); setEditing(true); };
    window.addEventListener('sg:watchlist-edit', on);
    return () => window.removeEventListener('sg:watchlist-edit', on);
  }, []);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackWatchlist('wl_view', { count: wl.count, isPro: wl.isPro });
  }, [wl.count, wl.isPro]);

  const alertTickers = useMemo(() => {
    if (!alertsOn || !alertsRaw) return new Set<string>();
    try {
      const d = JSON.parse(alertsRaw);
      return new Set(Object.entries<unknown>(d?.tickers || {}).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k]) => k));
    } catch { return new Set<string>(); }
  }, [alertsOn, alertsRaw]);

  const rows = useMemo(
    () => (now ? buildRows(wl.tickers, loc, now, isPro ? 2 : 1, data) : []),
    [wl.tickers, loc, now, isPro, data],
  );

  const sorted = useMemo(() => {
    const idx = new Map(wl.tickers.map((x, i) => [x, i]));
    const chg = (r: RowModel) => r.rt?.changePct;
    const earn = (r: RowModel) => data.earnings[r.t]?.date;
    const today = now ? localTodayYmd(now) : '';
    const arr = rows.slice();
    arr.sort((a, b) => {
      let d = 0;
      if (sort === 'change') {
        const x = chg(a), y = chg(b);
        d = (y == null ? -1 : Math.abs(y)) - (x == null ? -1 : Math.abs(x));
      } else if (sort === 'pct') {
        const x = chg(a), y = chg(b);
        d = (y == null ? -Infinity : y) - (x == null ? -Infinity : x);
        if (!Number.isFinite(d)) d = x == null && y == null ? 0 : x == null ? 1 : -1;
      } else if (sort === 'earnings') {
        const x = earn(a), y = earn(b);
        const xa = x && x >= today ? x : null, ya = y && y >= today ? y : null;
        d = xa && ya ? xa.localeCompare(ya) : xa ? -1 : ya ? 1 : 0;
      } else if (sort === 'alerts') {
        d = Number(alertTickers.has(b.t)) - Number(alertTickers.has(a.t));
      }
      return d || (idx.get(a.t)! - idx.get(b.t)!);
    });
    return arr;
  }, [rows, sort, wl.tickers, data.earnings, alertTickers, now]);

  // 머리말 한 줄 — 가격 기준(종가·장중) + 레벨·장외 비중 기준 날짜(아는 것만)
  const firstSession = useMemo(() => rows.find((r) => r.rt?.session)?.rt?.session ?? null, [rows]);
  const basis = now && firstSession ? priceBasis(firstSession, now) : null;
  const lvDate = mostCommon(rows.map((r) => (r.levels.ok ? r.levels.chainDate : null)));
  const dpDate = mostCommon(wl.tickers.map((x) => data.darkPool[x]?.date ?? null));
  const dateParts: string[] = [];
  if (lvDate && dpDate && lvDate === dpDate) dateParts.push(t.both(fmtMD(lvDate)));
  else {
    if (lvDate) dateParts.push(t.lv(fmtMD(lvDate)));
    if (dpDate) dateParts.push(t.dp(fmtMD(dpDate)));
  }
  const anyDpChip = rows.some((r) => r.chips.some((x) => x.kind === 'darkpool'));

  const lp = useStarLongPress();
  const openFlow = useCallback((x: string) => router.push(`/${loc}/app-view/flow?t=${encodeURIComponent(x)}`), [router, loc]);
  const goBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace(`/${loc}/app-view/dash`);
  }, [router, loc]);

  const onBell = useCallback(async (r: RowModel, el: HTMLElement) => {
    const pro = (await whenProReady(2500)).isPro;
    const meta = { name: r.name, price: r.rt?.price ?? null, changePct: r.rt?.changePct ?? null };
    if (pro) wlUI.openSheet({ kind: 'alertSettings', ticker: r.t, levels: r.verified, meta }, el);
    else wlUI.openSheet({ kind: 'alertUpsell', ticker: r.t, levels: r.verified, src: 'bell', meta }, el);
  }, []);

  const renderRow = (r: RowModel, interactive = true, forceLoading = false) => {
    const rt = r.rt;
    const loadingRow = forceLoading || (!rt && (interactive ? data.loading : preview.loading));
    const ch = rt?.changePct ?? null;
    const dir = ch == null ? ws.flat : ch > 0 ? ws.up : ch < 0 ? ws.dn : ws.flat;
    const alertOn = alertTickers.has(r.t);
    const meta = { name: r.name, price: rt?.price ?? null, changePct: ch };
    return (
      <div key={r.t} className={p.row} role="listitem">
        <button
          type="button"
          className={`${p.hit} ${lpRowClass}`}
          aria-label={`${r.t}${r.name ? ` ${r.name}` : ''} — ${t.toFlow}`}
          onClick={() => openFlow(r.t)}
          {...lp(r.t, meta)}
        />
        <div className={p.r1}>
          <span className={p.logoCell}><AppTickerLogo symbol={r.t} size={30} /></span>
          <span className={p.id}>
            <b>{r.t}</b>
            {r.name && <small>{r.name}</small>}
          </span>
          {loadingRow
            ? <span><i className={`${p.skel} ${p.skelMap}`} /></span>
            : <PositionMap levels={r.levels} basisShort={r.basisShort}
                labels={{ putFloor: c.putFloor, callWall: c.callWall, maxPain: c.maxPain, wait: c.levelsWait, waitAria: c.levelsWaitAria }} />}
          <span className={p.pr}>
            {loadingRow ? (
              <><i className={`${p.skel} ${p.skelPx}`} /><i className={`${p.skel} ${p.skelCh}`} /></>
            ) : (
              <>
                <b>{rt?.price ? fmtPrice(rt.price) : <span className={p.dash}>—</span>}</b>
                {ch != null && <small className={dir}><i className={ws.tri} />{fmtSignedPct(ch, 2)}</small>}
              </>
            )}
          </span>
        </div>
        {(r.chips.length > 0 || alertsOn) && !loadingRow && (
          <div className={p.r2}>
            {r.chips.length > 0 ? <ChipLine key={r.chipSig} chips={r.chips} /> : <span style={{ flex: 1 }} />}
            {alertsOn && (
              isPro ? (
                <button type="button" className={`${ws.bell} ${alertOn ? ws.bellOn : ''}`}
                  aria-pressed={alertOn} aria-label={alertOn ? t.bellOn(r.t) : t.bellOff(r.t)}
                  onClick={(e) => { void onBell(r, e.currentTarget); }}>
                  {alertOn ? <span className={ws.bellBub}><WlIcon name="bell" /></span> : <WlIcon name="bell" />}
                </button>
              ) : (
                <button type="button" className={ws.bell} aria-label={t.bellLock(r.t)}
                  onClick={(e) => { void onBell(r, e.currentTarget); }}>
                  <WlIcon name="bell" />
                  <span className={ws.bellLk}><WlIcon name="lock" /></span>
                </button>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  // 빈 상태 미리보기 — 실제 데이터에서 «지도가 서는» 두 종목(없으면 가격이 있는 두 종목). 숫자를 지어내지 않는다.
  const previewRows = useMemo(() => {
    if (!empty || !now) return [];
    const built = buildRows(PREVIEW_CANDIDATES, loc, now, 1, preview);
    const withMap = built.filter((r) => r.levels.ok);
    const withPrice = built.filter((r) => r.rt?.price);
    return (withMap.length >= 2 ? withMap : [...withMap, ...withPrice.filter((r) => !r.levels.ok)]).slice(0, 2);
  }, [empty, now, loc, preview]);

  const meterN = Math.min(wl.count, FREE_LIMIT);

  return (
    <div className={p.page}>
      <div className={p.glow} aria-hidden="true" />
      <div className={p.inner}>
        <div className={p.nav}>
          <button type="button" className={p.back} aria-label={t.backAria} onClick={goBack}>
            <i><WlIcon name="chevL" /></i>
          </button>
          <span className={p.eyebrow}>{t.back}</span>
          <div className={p.navR}>
            {!empty && (
              <button type="button" className={p.tbtn} aria-pressed={editing} onClick={() => setEditing((x) => !x)}>
                {editing ? t.done : t.edit}
              </button>
            )}
            {!editing && (
              <button type="button" className={p.ibtn} aria-label={t.add} onClick={() => setSearchOpen(true)}>
                <i><WlIcon name="plus" /></i>
              </button>
            )}
          </div>
        </div>

        <div className={p.ttl}>
          <h1>{c.myList}</h1>
          {isPro ? (
            <>
              <span className={p.cnt} aria-label={t.countAriaPro(wl.count)}>{wl.count}</span>
              <span className={p.proB}>PRO</span>
            </>
          ) : (
            <span className={p.cnt} aria-label={t.countAria(wl.count, FREE_LIMIT)}>
              {wl.count}/{FREE_LIMIT}
              <span className={p.mt} aria-hidden="true">
                {Array.from({ length: FREE_LIMIT }, (_, i) => <s key={i} className={i < meterN ? p.f : undefined} />)}
              </span>
            </span>
          )}
        </div>
        <p className={p.sub}>
          {empty ? t.emptySub : (
            <>
              {isPro && alertsOn && alertTickers.size > 0 && <><b>{t.alertsOn(alertTickers.size)}</b> · </>}
              {basis && <b>{priceBasisLabel(basis, loc)}</b>}
              {basis && dateParts.length > 0 && ' · '}
              {dateParts.join(' · ')}
            </>
          )}
        </p>

        {editing && !empty ? (
          <EditList loc={loc} />
        ) : !empty ? (
          <>
            <div className={p.sorts} role="tablist" aria-label={c.myList}>
              {(['change', 'pct', 'earnings', ...(isPro && alertsOn ? ['alerts'] as const : [])] as SortKey[]).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={sort === k}
                  className={`${p.srt} ${sort === k ? p.srtOn : ''}`}
                  onClick={() => { setSortPref(k); trackWatchlist('wl_sort', { key: k }); }}>
                  {t.sorts[k]}
                </button>
              ))}
            </div>

            <div className={p.legend}>
              <span>{c.putFloor}</span>
              <MiniMap />
              <span>{c.callWall}</span>
              <i className={p.sep} aria-hidden="true" />
              <span className={p.lk}><i className={p.dMp} aria-hidden="true" />{c.maxPain}</span>
              <span className={p.lk}><i className={p.dPx} aria-hidden="true" />{basis ? priceBasisLabel(basis, loc, true) : (loc === 'ko' ? '가격' : loc === 'ja' ? '価格' : 'Price')}</span>
              <button type="button" className={p.inf} aria-label={t.infoAria}
                onClick={(e) => wlUI.openSheet({ kind: 'mapInfo' }, e.currentTarget)}>
                <WlIcon name="info" />
              </button>
            </div>

            <div className={p.list} role="list">
              {sorted.map((r) => renderRow(r))}
              {!rows.length && wl.tickers.map((x) => renderRow({
                t: x, name: tickerName(x, loc), rt: undefined, levels: { ok: false, reason: 'no-price' }, verified: null, chips: [], chipSig: '', basisShort: '',
              }, true, true))}
            </div>
            {data.error && (
              <p className={p.disc}>
                {t.fail} · <button type="button" className={p.tbtn} style={{ height: 32 }} onClick={data.refresh}>{t.retry}</button>
              </p>
            )}

            {showBuy && (
              <button type="button" className={p.probar}
                onClick={(e) => {
                  if (alertsOn) {
                    const first = sorted[0];
                    wlUI.openSheet({ kind: 'alertUpsell', ticker: first?.t ?? null, levels: first?.verified ?? null, src: 'probar' }, e.currentTarget);
                  } else {
                    wlUI.openSheet({ kind: 'proGeneric', src: 'probar' }, e.currentTarget);
                  }
                }}>
                <span className={p.pbIc}><WlIcon name={alertsOn ? 'bell' : 'list'} /></span>
                <span className={p.pbTx}>
                  <b>{alertsOn ? t.pbAlertT : t.pbGenT}<span className={p.proB}>PRO</span></b>
                  <small>{alertsOn ? t.pbAlertS : t.pbGenS(FREE_LIMIT)}</small>
                </span>
                <span className={p.pbCh}><WlIcon name="chevR" /></span>
              </button>
            )}
            <p className={p.disc}>{t.disc}</p>
            {anyDpChip && <p className={p.disc} style={{ marginTop: 4 }}>Data source: FINRA</p>}
          </>
        ) : (
          /* ── 빈 상태(05a) ── */
          <div className={p.empty}>
            <div className={p.emCard}>
              <span className={p.emEb}>{t.emEb}</span>
              <h2>{t.emH}</h2>
              <p>{t.emP}</p>
              {previewRows.length > 0 && (
                <>
                  <div className={p.emPv}>{t.emPv}</div>
                  <div className={p.emList} role="list">{previewRows.map((r) => renderRow(r, false))}</div>
                </>
              )}
            </div>
            <div className={p.secL}>{t.picks}<span>{!isPro && t.freeN(FREE_LIMIT)}</span></div>
            <div className={p.pick}>
              {PICKS.map((x) => {
                const on = wl.has(x);
                return (
                  <button key={x} type="button" className={`${p.pk} ${on ? p.pkOn : ''}`} aria-pressed={on} aria-label={t.pickAdd(x)}
                    onClick={(e) => { void addStar(x, 'empty', e.currentTarget); }}>
                    <AppTickerLogo symbol={x} size={26} />
                    <span>{x}</span>
                    <WlIcon name="star" className={p.pkSt} />
                  </button>
                );
              })}
              <button type="button" className={`${p.pk} ${p.pkSrch}`} onClick={() => setSearchOpen(true)}>
                <WlIcon name="search" /><span>{t.search}</span>
              </button>
            </div>
            <p className={p.tip}><WlIcon name="star" /><span>{t.tip}</span></p>
          </div>
        )}
      </div>

      {searchOpen && <TickerSearchOverlay loc={loc} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
