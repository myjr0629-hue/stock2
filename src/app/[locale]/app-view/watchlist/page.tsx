'use client';

// ============================================================================
// «내 종목» — 앱 전용 포지셔닝 워치리스트 (기획서 .agent/product/WATCHLIST-PLAN-2026-09-29.md)
// ----------------------------------------------------------------------------
// 가격표가 아니라 «내 종목의 옵션 지형»을 모은다. 행마다 증권사 목록에 없는 두 칸:
//   ① 포지셔닝 지도(풋플로어 ─ ◆맥스페인 ─ ●가격 ─ 콜월)  ② 오늘의 사실 칩(행마다 2개)
//   칩 차등(무료 1 + 잠긴 두 번째 칩 · PRO 2)은 WATCHLIST_CHIP_TIERING(watchlistFlags) 뒤에 있다 — 기본 꺼짐(대표 결정 전).
// 원본은 기기(localStorage 'sg-watchlist-v1') — 로그인·서버 저장 없음. 무료 5종목 · PRO 100종목(MAX_ITEMS).
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
import { useWatchlistData, useWlNow, wlTickerName, type BatchRealtime, type DarkPoolInfo, type EarningsInfo, type WhaleInfo } from '@/components/app/watchlist/useWatchlistData';
import ws from '@/components/app/watchlist/watchlist.module.css';
import { FREE_LIMIT, MAX_ITEMS, getWatchlistStore, useAppWatchlist } from '@/lib/app/watchlist';
import { isPreviewHost, whenProReady } from '@/lib/app/proEntitlement';
import { WATCHLIST_CHIP_TIERING, useWatchlistAlertsEnabled } from '@/lib/app/watchlistFlags';
import { ALERT_PREFS_KEY, ALERT_TICKER_CAP } from '@/lib/app/watchlistAlerts';
import { hasInAppBack } from '@/lib/app/inAppHistory';
import { wlUI, type VerifiedLevels } from '@/lib/app/watchlistUI';
import { takeWatchlistEntry, trackWatchlist } from '@/lib/app/watchlistAnalytics';
import {
  checkLevels, chipsForPlan, earningsPending, fmtMD, fmtPrice, fmtSignedPct, localTodayYmd, priceBasis, priceBasisLabel, selectInsights, segText,
  toWlLocale, type InsightChip, type LevelsVerdict, type LockedChip, type WlLocale,
} from '@/lib/app/watchlistInsights';
import p from './watchlist.module.css';

const EditList = dynamic(() => import('./EditList'), { ssr: false });
const TickerSearchOverlay = dynamic(
  () => import('@/components/app/watchlist/TickerSearchOverlay').then((m) => m.TickerSearchOverlay),
  { ssr: false },
);

// ── 문구 ────────────────────────────────────────────────────────────────
// 한국어는 합쇼체·동사 «담기» · 화면 이름은 탭바처럼 영문(Dashboard·Command·Flow) · 레벨 이름은 앱 용어집과 같게(C10·C12·C19)
const PC = {
  ko: {
    // «뒤로»는 앱 안 이동 기록을 따른다(뒤에 앱 화면이 없으면 Dashboard 로) — 라벨이 목적지를 약속하지 않는다(B12)
    back: '뒤로', backAria: '뒤로 가기', edit: '편집', done: '완료', add: '종목 담기',
    countAria: (n: number, m: number) => `${m}종목 중 ${n}종목`, countAriaPro: (n: number) => `${n}종목`,
    alertsOn: (n: number) => `알림 켠 종목 ${n}`,
    sorts: { change: '변화 큰 순', pct: '등락률', earnings: '실적 임박', alerts: '알림 켠 종목' },
    infoAria: '지도 읽는 법', toFlow: 'Flow 화면으로',
    price: '가격',
    // 알림 카드(플래그 켜짐)의 종목 수는 서버 상한(ALERT_TICKER_CAP)까지다
    pbAlertT: '레벨을 넘으면 푸시로', pbAlertS: (cap: number) => `콜 월 돌파 · 감마 플립 교차 · 5분 봉 확정 · 최대 ${cap}종목`,
    pbGenS: (n: number, chips: boolean) => `${chips ? '행마다 칩 2개 · ' : ''}광고 없음 · 무료는 ${n}종목까지`,
    // 빈 상태 — 제목 + 무엇을 보여 주는지 한 문장 + 미리보기 · 인기 종목 원탭 · 검색(대표 9/29: ☆ 위치·칩 모임 팁은 토스트·헤더 ★ 와 중복이라 삭제)
    emH: '가격표가 아니라, 옵션 지형을 모읍니다',
    emP: '종목마다 풋 플로어–맥스 페인–콜 월 사이 지금 위치를 보여 줍니다.',
    emPv: '미리보기', picks: '인기 종목', freeN: (n: number) => `무료 ${n}종목`,
    search: '검색해서 담기',
    bellLock: (t: string) => `${t} 알림 — PRO 전용`, bellOn: (t: string) => `${t} 알림 켜짐 — 설정 열기`, bellOff: (t: string) => `${t} 알림 꺼짐 — 설정 열기`, bellAny: (t: string) => `${t} 알림`,
    fail: '가격을 불러오지 못했습니다', retry: '다시 시도', pickAdd: (t: string) => `${t} 내 종목에 담기`,
  },
  en: {
    back: 'BACK', backAria: 'Back', edit: 'Edit', done: 'Done', add: 'Add stock',
    countAria: (n: number, m: number) => `${n} of ${m} stocks`, countAriaPro: (n: number) => `${n} ${n === 1 ? 'stock' : 'stocks'}`,
    alertsOn: (n: number) => `Alerts on ${n}`,
    sorts: { change: 'Biggest move', pct: '% change', earnings: 'Earnings soon', alerts: 'Alerts on' },
    infoAria: 'How to read the map', toFlow: 'open Flow',
    price: 'Price',
    pbAlertT: 'Pushed when a level breaks', pbAlertS: (cap: number) => `Call wall breakouts · gamma flip crossings · on 5-min closes · up to ${cap} stocks`,
    pbGenS: (n: number, chips: boolean) => (chips ? `2 chips per row · no ads · free plan: up to ${n} stocks` : `No ads · free plan: up to ${n} stocks`),
    emH: 'Not a price list — your options map',
    emP: 'For each stock: where price sits between put floor, max pain and call wall.',
    emPv: 'PREVIEW', picks: 'Popular', freeN: (n: number) => `${n} free`,
    search: 'Search to add',
    bellLock: (t: string) => `${t} alerts — PRO only`, bellOn: (t: string) => `${t} alerts on — open settings`, bellOff: (t: string) => `${t} alerts off — open settings`, bellAny: (t: string) => `${t} alerts`,
    fail: 'Couldn’t load prices', retry: 'Retry', pickAdd: (t: string) => `Add ${t} to My Watchlist`,
  },
  ja: {
    back: '戻る', backAria: '戻る', edit: '編集', done: '完了', add: '銘柄を追加',
    countAria: (n: number, m: number) => `${m}銘柄中${n}銘柄`, countAriaPro: (n: number) => `${n}銘柄`,
    alertsOn: (n: number) => `通知オン ${n}`,
    sorts: { change: '変化の大きい順', pct: '騰落率', earnings: '決算が近い', alerts: '通知オン' },
    infoAria: 'マップの見方', toFlow: 'Flow画面へ',
    price: '価格',
    pbAlertT: 'レベルを抜けたらプッシュで', pbAlertS: (cap: number) => `コールウォール突破 · ガンマフリップ交差 · 5分足確定 · 最大${cap}銘柄`,
    pbGenS: (n: number, chips: boolean) => `${chips ? '1行にチップ2つ · ' : ''}広告なし · 無料は${n}銘柄まで`,
    emH: '株価表ではなく、オプションの地形を集めます',
    emP: '銘柄ごとに、プットフロア–マックスペイン–コールウォールの間の現在位置を表示します。',
    emPv: 'プレビュー', picks: '人気銘柄', freeN: (n: number) => `無料${n}銘柄`,
    search: '検索して追加',
    bellLock: (t: string) => `${t}の通知 — PRO専用`, bellOn: (t: string) => `${t}の通知オン — 設定を開く`, bellOff: (t: string) => `${t}の通知オフ — 設定を開く`, bellAny: (t: string) => `${t}の通知`,
    fail: '価格を読み込めませんでした', retry: '再試行', pickAdd: (t: string) => `${t}をマイ銘柄に追加`,
  },
} as const;

type SortKey = 'change' | 'pct' | 'earnings' | 'alerts';
const SORT_KEY = 'sg-watchlist-sort-v1';
const PICKS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];
const PREVIEW_CANDIDATES = ['NVDA', 'MU', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'TSLA', 'AMD'];

const noopSubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

// ── PRO 확인(네이티브 SDK)이 늦어도 칩을 2.5초 넘게 뼈대로 붙잡지 않는다 — 앱 실행당 한 번 ──
let graceOver = false;
let graceTimer: ReturnType<typeof setTimeout> | null = null;
const graceListeners = new Set<() => void>();
function subscribeGrace(cb: () => void) {
  graceListeners.add(cb);
  if (!graceOver && !graceTimer) {
    graceTimer = setTimeout(() => { graceOver = true; graceListeners.forEach((l) => l()); }, 2500);
  }
  return () => { graceListeners.delete(cb); };
}
const getGrace = () => graceOver;
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
  /** 무료 행에 실제로 있는 두 번째 칩의 종류(잠금 칩) — PRO·미리보기·구독 확인 전엔 null */
  locked: LockedChip | null;
  chipSig: string;
  basisShort: string;
}

/**
 * 행 모델. 칩은 늘 두 개까지 골라 두고 chipsForPlan 이 자른다 — 칩 차등(WATCHLIST_CHIP_TIERING)이 꺼져 있으면(기본)
 * 무료·PRO 모두 두 칩, 켜져 있으면 무료 1 · PRO 2(무료의 첫 칩은 예전 그대로).
 * lock: 무료로 «확인된» 사용자의 실제 목록에서만 잘려 나간 두 번째 칩의 종류를 잠금 칩으로 넘긴다(차등이 켜졌을 때만 생긴다).
 * 빈 상태 미리보기도 같은 규칙 — 담은 뒤의 모습 그대로(칩 2개까지 · 한 줄에 안 들어가면 ChipLine 줄바꿈 규칙).
 */
function buildRows(
  tickers: readonly string[], loc: WlLocale, now: number, isPro: boolean, lock: boolean,
  data: { rows: Record<string, BatchRealtime>; earnings: Record<string, EarningsInfo>; darkPool: Record<string, DarkPoolInfo>; whales: Record<string, WhaleInfo> },
): RowModel[] {
  const today = localTodayYmd(now);
  return tickers.map((t) => {
    const rt = data.rows[t];
    const levels = checkLevels({
      price: rt?.price, maxPain: rt?.maxPain, callWall: rt?.callWall, putFloor: rt?.putFloor, gammaFlipLevel: rt?.gammaFlipLevel,
      levelsChainDate: rt?.levelsChainDate, levelsSource: rt?.levelsSource, hasLevelsMeta: rt?.hasLevelsMeta, levelsDropped: rt?.levelsDropped,
    }, now);
    // 가격 기준(«9/28 종가»·«장중»)은 «이 값을 받은 시각»으로 — 캐시 행이 남은 채 돌아와도 옛 값에 오늘 라벨을 붙이지 않는다
    const basis = priceBasis(rt?.session, rt?.receivedAt ?? now);
    const basisShort = priceBasisLabel(basis, loc, true);
    const e = data.earnings[t];
    const all = rt ? selectInsights({
      price: rt.price ?? null,
      changePct: rt.changePct ?? null,
      levels,
      // 지났는지는 ET 날짜 + 발표 시각(기기 날짜로 거르면 한·일에서 amc 당일 칩이 미국 장중 내내 사라졌다)
      earnings: e && earningsPending(e.date, e.hour, now) ? { date: e.date, hour: e.hour } : null,
      whale: data.whales[t] ?? null,
      darkPool: data.darkPool[t] ?? null,
      levelsExpiration: rt.levelsExpiration ?? null,
      todayLocal: today,
      nowMs: now,
    }, loc, 2) : [];
    const plan = chipsForPlan(all, { isPro, tiering: WATCHLIST_CHIP_TIERING }, loc);
    const chips = plan.chips;
    const locked = lock ? plan.locked : null;
    return {
      t,
      // 이름 공급원은 편집 목록·대시보드와 같다(이름표 → 실적 브리프 이름)
      name: wlTickerName(t, loc),
      rt,
      levels,
      verified: levels.ok ? {
        S: levels.S, pf: levels.pf, mp: levels.mp, cw: levels.cw, gf: levels.gf,
        asOf: levels.chainDate ? fmtMD(levels.chainDate) : null, basisLabel: basisShort,
      } : null,
      chips,
      locked,
      chipSig: chips.map((c) => `${c.kind}:${segText(c.long)}`).join('|') + (locked ? `|lock:${locked.kind}:${locked.label}` : ''),
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
  const now = useWlNow();
  // 서버 HTML·하이드레이션 첫 그림 — 기기 목록(localStorage)을 아직 모른다. 빈 화면 대신 뼈대를 그린다.
  const hydrated = useSyncExternalStore(noopSubscribe, getTrue, getFalse);
  const grace = useSyncExternalStore(subscribeGrace, getGrace, getFalse);
  const sortRaw = useSyncExternalStore(subscribeSort, getSort, () => 'change');
  const alertsRaw = useSyncExternalStore(subscribeAlerts, getAlertsRaw, () => '');
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [searchOpen, setSearchOpen] = useState(false);
  const isPro = wl.isPro;
  // 구독 여부가 정해지기 전엔 권유(잠금 벨·PRO 카드·N/5 미터)를 그리지 않는다 — 구독자에게 «업그레이드»가 번쩍이지 않게
  const proKnown = wl.proReady;
  const proSettled = proKnown || grace;
  const sort: SortKey = sortRaw === 'pct' || sortRaw === 'earnings' ? sortRaw
    : sortRaw === 'alerts' && isPro && alertsOn ? 'alerts' : 'change';
  // 살 수 있는 곳(네이티브) · 프리뷰에서만 PRO 안내 카드 — 살릴 수 없는 버튼은 보이지 않는다(useProStatus 원칙)
  const canBuyHere = useSyncExternalStore(noopSubscribe, canBuySnapshot, () => false);
  const showBuy = proKnown && !isPro && canBuyHere;

  const data = useWatchlistData(wl.tickers, { extras: true, locale: loc });
  const empty = wl.count === 0;
  const preview = useWatchlistData(empty ? PREVIEW_CANDIDATES : [], { extras: true, locale: loc });

  // ?edit=1 로 들어왔으면(한도 시트 «기존 종목 정리하기») 편집은 이미 켰다 — 주소에서 지운다.
  //   남겨 두면 다른 화면에 갔다가 뒤로 돌아올 때마다 다시 편집 모드로 열렸다(B11).
  //   층(시트·페이월)이 떠 있지 않을 때만 — 층이 얹은 히스토리 칸을 주소 바꾸기가 덮지 않게(마운트 때는 보통 없다)
  useEffect(() => {
    if (params.get('edit') !== '1') return;
    const ui = wlUI.getSnapshot();
    if (ui.sheet || ui.paywall) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete('edit');
    const q = rest.toString();
    router.replace(`/${loc}/app-view/watchlist${q ? `?${q}` : ''}`, { scroll: false });
  }, [params, router, loc]);

  // 다른 곳(한도 시트 «기존 종목 정리하기»)에서 편집 모드를 켠다
  useEffect(() => {
    const on = () => { setSearchOpen(false); setEditing(true); };
    window.addEventListener('sg:watchlist-edit', on);
    return () => window.removeEventListener('sg:watchlist-edit', on);
  }, []);
  // 편집 중에 마지막 종목까지 빼면 편집을 끝낸다(빈 화면에서 다시 담았을 때 편집 목록이 뜨지 않게)
  useEffect(() => {
    const store = getWatchlistStore();
    return store.subscribe(() => { if (store.count() === 0) setEditing(false); });
  }, []);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackWatchlist('wl_view', { count: wl.count, isPro: wl.isPro, src: takeWatchlistEntry() });
  }, [wl.count, wl.isPro]);

  const alertTickers = useMemo(() => {
    if (!alertsOn || !alertsRaw) return new Set<string>();
    try {
      const d = JSON.parse(alertsRaw);
      return new Set(Object.entries<unknown>(d?.tickers || {}).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k]) => k));
    } catch { return new Set<string>(); }
  }, [alertsOn, alertsRaw]);

  // 잠금 칩은 무료로 «확인된» 뒤에만 — 구독자에게 PRO 권유가 번쩍이지 않게(잠금 벨·PRO 카드·N/5 미터와 같은 원칙)
  const rows = useMemo(
    () => (now ? buildRows(wl.tickers, loc, now, isPro, proKnown && !isPro, data) : []),
    [wl.tickers, loc, now, isPro, proKnown, data],
  );

  const sorted = useMemo(() => {
    const idx = new Map(wl.tickers.map((x, i) => [x, i]));
    const chg = (r: RowModel) => r.rt?.changePct;
    // 다가오는 실적만(ET 날짜 + 발표 시각으로 «지났나» — 칩과 같은 기준)
    const earn = (r: RowModel) => {
      const e = data.earnings[r.t];
      return e && now && earningsPending(e.date, e.hour, now) ? e.date : null;
    };
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
        const xa = earn(a), ya = earn(b);
        d = xa && ya ? xa.localeCompare(ya) : xa ? -1 : ya ? 1 : 0;
      } else if (sort === 'alerts') {
        d = Number(alertTickers.has(b.t)) - Number(alertTickers.has(a.t));
      }
      return d || (idx.get(a.t)! - idx.get(b.t)!);
    });
    return arr;
  }, [rows, sort, wl.tickers, data.earnings, alertTickers, now]);

  // 머리말 한 줄 — 가격 기준(«9/28(월) 종가»·«장중»)만(대표 9/29: 레벨·장외 비중 날짜 줄은 삭제 — 설명을 늘어놓지 않는다).
  //   가격 기준은 «가장 최근에 받은 행»의 세션을 «그 행을 받은 시각»으로 — 지금 시각으로 계산하면 캐시 행에 오늘 라벨이 붙는다
  const basisRow = useMemo(() => {
    let best: BatchRealtime | null = null;
    for (const r of rows) {
      if (!r.rt?.session) continue;
      if (!best || (r.rt.receivedAt ?? 0) > (best.receivedAt ?? 0)) best = r.rt;
    }
    return best;
  }, [rows]);
  const basis = now && basisRow?.session ? priceBasis(basisRow.session, basisRow.receivedAt ?? now) : null;

  const lp = useStarLongPress();
  const openFlow = useCallback((x: string) => router.push(`/${loc}/app-view/flow?t=${encodeURIComponent(x)}`), [router, loc]);
  // 뒤로 — 앱 안에서 들어왔으면 그 화면으로, 아니면(앱을 켠 첫 화면·새로고침·딥링크) Dashboard 로 바꿔 간다(B12).
  //   history.length 는 앞으로 가기 칸·앱 이전 칸까지 세서 앱 밖으로 나갈 수 있었다 — 앱 안 이동 기록(inAppHistory)으로 판정
  const goBack = useCallback(() => {
    if (hasInAppBack()) router.back();
    else router.replace(`/${loc}/app-view/dash`);
  }, [router, loc]);

  const onBell = useCallback(async (r: RowModel, el: HTMLElement) => {
    const pro = (await whenProReady(2500)).isPro;
    const meta = { name: r.name, price: r.rt?.price ?? null, changePct: r.rt?.changePct ?? null };
    if (pro) wlUI.openSheet({ kind: 'alertSettings', ticker: r.t, levels: r.verified, meta }, el);
    else wlUI.openSheet({ kind: 'alertUpsell', ticker: r.t, levels: r.verified, src: 'bell', meta }, el);
  }, []);
  // 잠긴 두 번째 칩 → PRO 안내(«행마다 인사이트 칩 2개» — 칩 차등이 켜졌을 때만 잠긴 칩이 있다)
  const onLockTap = useCallback((el: HTMLElement) => {
    wlUI.openSheet({ kind: 'proGeneric', src: 'chip_lock', focus: 'chips' }, el);
  }, []);

  // 뼈대 — 최종 행과 같은 칸(로고 30 · 티커/이름 · 지도 36px · 가격 두 줄 · 칩 줄 26px)이라 값이 와도 높이가 변하지 않는다
  const mapSkel = (
    <span className={p.skelMapBox}>
      <i className={`${p.skel} ${p.skelTrack}`} />
      <span className={p.skelLbls}><i className={p.skel} /><i className={p.skel} /></span>
    </span>
  );
  const pxSkel = <><i className={`${p.skel} ${p.skelPx}`} /><i className={`${p.skel} ${p.skelCh}`} /></>;
  const chipSkel = <span className={p.chipSlot}><i className={`${p.skel} ${p.skelChip}`} /></span>;
  // 값이 하나도 없을 때는 «누가 어디»도 그리지 않는다 — 정렬(변화 큰 순)이 값을 받은 뒤 행이 자리를 바꾸며 튀지 않게
  const skeletonRows = (n: number) => Array.from({ length: n }, (_, i) => (
    <div key={`sk${i}`} className={p.row} aria-hidden="true">
      <div className={p.r1}>
        <span className={p.logoCell}><i className={`${p.skel} ${p.skelLogo}`} /></span>
        <span className={p.id}><i className={`${p.skel} ${p.skelTk}`} /><i className={`${p.skel} ${p.skelNm}`} /></span>
        {mapSkel}
        <span className={p.pr}>{pxSkel}</span>
      </div>
      <div className={p.r2w}><div className={`${p.r2} ${p.r2Clip}`}>{chipSkel}</div></div>
    </div>
  ));

  const renderRow = (r: RowModel, interactive = true) => {
    const src = interactive ? data : preview;
    const rt = r.rt;
    const loadingRow = !rt && src.pending;
    // 이 행의 사실(가격·레벨·실적·장외·고래)이 아직 다 안 왔다
    const factsWait = loadingRow || !src.extrasReadyFor(r.t);
    // 칩은 «한 번에 최종 모양으로» — 사실이 정해질 때까지 뼈대(칩이 바뀌며 깜빡이지 않게). 칩 차등이 켜졌을 때만
    //   구독 여부(무료 1 · PRO 2)도 기다린다 — 꺼져 있으면 누구에게나 같은 칩이라 구독 확인을 기다릴 까닭이 없다.
    const chipsWait = factsWait || (WATCHLIST_CHIP_TIERING && !proSettled);
    const showBell = alertsOn && interactive;
    // 칩 줄은 값이 오는 동안만 26px 자리를 잡는다. 다 받았는데 세울 칩이 없으면(벨도 없으면) 접는다.
    //   «칩이 하나라도 서는가»는 구독 여부와 무관하다(1개 한도에서 0개면 2개 한도에서도 0개) — 구독 확인을 기다리지 않는다.
    //   기억해 둔 값으로 그리는 재방문은 첫 그림부터 접힌 채(움직임 없음) · 처음 받는 경우에만 부드럽게 접힌다.
    const noLine = !factsWait && r.chips.length === 0 && !showBell;
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
            ? mapSkel
            : <PositionMap levels={r.levels} basisShort={r.basisShort}
                labels={{
                  putFloor: c.putFloor, callWall: c.callWall, maxPain: c.maxPain,
                  wait: c.levelsWait, waitAria: c.levelsWaitAria, none: c.levelsNone, noneAria: c.levelsNoneAria,
                }} />}
          <span className={p.pr}>
            {loadingRow ? pxSkel : (
              <>
                <b>{rt?.price ? fmtPrice(rt.price) : <span className={p.dash}>—</span>}</b>
                {ch != null && <small className={dir}><i className={ws.tri} />{fmtSignedPct(ch, 2)}</small>}
              </>
            )}
          </span>
        </div>
        {/* 접힐 때는 뼈대가 같이 흐려지며 사라지고, 나중에 칩이 서면 같은 길로 펼쳐진다(움직임 줄이기면 즉시) */}
        <div className={`${p.r2w} ${noLine ? p.r2wOff : ''}`} aria-hidden={noLine || undefined}>
          {/* 잠금 칩이 설 수 있는 줄은 자르지 않는다(벨처럼 누름 영역이 줄 밖으로 나간다) — 칩이 있는 줄은 접히지 않으므로 안전 */}
          <div className={`${p.r2} ${showBell || r.locked ? '' : p.r2Clip}`}>
            {chipsWait || noLine ? chipSkel
              : r.chips.length > 0 ? <ChipLine key={r.chipSig} chips={r.chips} locked={interactive ? r.locked : null} onLockTap={onLockTap} />
              : <span className={p.chipSlot} />}
            {showBell && (
              isPro ? (
                <button type="button" className={`${ws.bell} ${alertOn ? ws.bellOn : ''}`}
                  aria-pressed={alertOn} aria-label={alertOn ? t.bellOn(r.t) : t.bellOff(r.t)}
                  onClick={(e) => { void onBell(r, e.currentTarget); }}>
                  {alertOn ? <span className={ws.bellBub}><WlIcon name="bell" /></span> : <WlIcon name="bell" />}
                </button>
              ) : (
                <button type="button" className={ws.bell} aria-label={proKnown ? t.bellLock(r.t) : t.bellAny(r.t)}
                  onClick={(e) => { void onBell(r, e.currentTarget); }}>
                  <WlIcon name="bell" />
                  {proKnown && <span className={ws.bellLk}><WlIcon name="lock" /></span>}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  // 빈 상태 미리보기 — 실제 데이터에서 «지도가 서는» 두 종목(없으면 가격이 있는 두 종목). 숫자를 지어내지 않는다.
  const previewRows = useMemo(() => {
    if (!empty || !now) return [];
    const built = buildRows(PREVIEW_CANDIDATES, loc, now, false, false, preview);
    const withMap = built.filter((r) => r.levels.ok);
    const withPrice = built.filter((r) => r.rt?.price);
    return (withMap.length >= 2 ? withMap : [...withMap, ...withPrice.filter((r) => !r.levels.ok)]).slice(0, 2);
  }, [empty, now, loc, preview]);

  const meterN = Math.min(wl.count, FREE_LIMIT);

  // 범례 — 서버 HTML(하이드레이션 전 틀)과 같은 내용을 그린다: 줄 수(ja 는 두 줄)가 첫 그림부터 최종이다.
  //   ● 이름은 늘 «가격»(기준 날짜는 바로 위 머리줄에 있다) — 값이 온 뒤 «9/28 종가»로 바뀌며 폭이 늘어
  //   한 줄이던 범례가 두 줄로 밀리던 흔들림을 없앤다(en 360폭 실측)
  const legend = (live: boolean) => (
    <div className={p.legend} aria-hidden={live ? undefined : true}>
      <span>{c.putFloor}</span>
      <MiniMap />
      <span>{c.callWall}</span>
      <i className={p.sep} aria-hidden="true" />
      <span className={p.lk}><i className={p.dMp} aria-hidden="true" />{c.maxPain}</span>
      <span className={p.lk}><i className={p.dPx} aria-hidden="true" />{t.price}</span>
      <button type="button" className={p.inf} aria-label={t.infoAria} tabIndex={live ? undefined : -1}
        onClick={(e) => wlUI.openSheet({ kind: 'mapInfo' }, e.currentTarget)}>
        <WlIcon name="info" />
      </button>
    </div>
  );

  // ── 하이드레이션 전(서버 HTML) — 목록을 아직 모른다: 빈 상태가 번쩍였다 목록으로 바뀌지 않게 같은 틀의 뼈대 ──
  if (!hydrated) {
    return (
      <div className={p.page}>
        <div className={p.glow} aria-hidden="true" />
        <div className={p.inner} aria-busy="true">
          <div className={p.nav}>
            <button type="button" className={p.back} aria-label={t.backAria} onClick={goBack}>
              <i><WlIcon name="chevL" /></i>
            </button>
            <span className={p.eyebrow}>{t.back}</span>
          </div>
          <div className={p.ttl}>
            <h1>{c.myList}</h1>
            <span className={`${p.cnt} ${p.cntSkel}`} aria-hidden="true" />
          </div>
          <p className={`${p.sub} ${p.subWrap}`} />
          <div className={p.sorts} aria-hidden="true">
            {[76, 58, 66].map((w) => <span key={w} className={`${p.srt} ${p.srtSkel}`} style={{ width: w }} />)}
          </div>
          {legend(false)}
          <div className={p.list} aria-hidden="true">{skeletonRows(3)}</div>
        </div>
      </div>
    );
  }

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
          {!proKnown ? (
            <span className={p.cnt} aria-label={t.countAriaPro(wl.count)}>{wl.count}</span>
          ) : isPro ? (
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
        {/* 머리 아래 한 줄 — 목록이 있으면 가격 기준(«9/28(월) 종가»·«장중»)만, 비었으면 장점 한 줄(«가입 없이 · 이 기기에 저장»).
            대표 9/29: 장점 줄은 빈 상태에 한 번만 · 레벨·장외 비중 날짜 줄은 두지 않는다. 한 줄 자리는 늘 잡아 둔다(값이 와도 목록이 밀리지 않게) */}
        <p className={`${p.sub} ${p.subWrap}`}>
          {empty ? c.onDevice : (
            <>
              {isPro && alertsOn && alertTickers.size > 0 && <><b>{t.alertsOn(alertTickers.size)}</b>{basis ? ' · ' : ''}</>}
              {basis && <b>{priceBasisLabel(basis, loc)}</b>}
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

            {legend(true)}

            <div className={`${p.list} ${data.stale ? p.stale : ''}`} role="list" aria-busy={data.loading || undefined}>
              {data.loading || !rows.length ? skeletonRows(Math.min(Math.max(wl.count, 1), 6)) : sorted.map((r) => renderRow(r))}
            </div>
            {(data.error || (data.failed && data.stale)) && (
              <p className={p.disc}>
                {t.fail} · <button type="button" className={`${p.tbtn} ${p.tbtnSm}`} onClick={data.refresh}>{t.retry}</button>
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
                  {/* 트리거 한 줄(«PRO로 100종목까지») + 짧은 부제 — 시트·페이월과 같은 말 */}
                  <b>{alertsOn ? t.pbAlertT : c.proTrigger(MAX_ITEMS)}<span className={p.proB}>PRO</span></b>
                  <small>{alertsOn ? t.pbAlertS(ALERT_TICKER_CAP) : t.pbGenS(FREE_LIMIT, WATCHLIST_CHIP_TIERING)}</small>
                </span>
                <span className={p.pbCh}><WlIcon name="chevR" /></span>
              </button>
            )}
          </>
        ) : (
          /* ── 빈 상태(05a) ── */
          <div className={p.empty}>
            <div className={p.emCard}>
              <h2>{t.emH}</h2>
              <p>{t.emP}</p>
              {previewRows.length > 0 ? (
                <>
                  <div className={p.emPv}>{t.emPv}</div>
                  <div className={p.emList} role="list">{previewRows.map((r) => renderRow(r, false))}</div>
                </>
              ) : preview.pending ? (
                <>
                  <div className={p.emPv}>{t.emPv}</div>
                  <div className={p.emList} aria-hidden="true">{skeletonRows(2)}</div>
                </>
              ) : null}
            </div>
            <div className={p.secL}>{t.picks}<span>{proKnown && !isPro && t.freeN(FREE_LIMIT)}</span></div>
            {/* 원탭 담기 — 대시보드 빈 카드와 같은 칩(.dPick: 내용 폭 + 줄바꿈). 3칸 격자는 360~390폭에서 티커가 잘렸다(C3).
                누르면 담기만 한다(담기면 빈 상태가 목록으로 바뀐다) — 토글이 아니라 aria-pressed 없이 «담기» 레이블 */}
            <div className={p.pick}>
              {PICKS.map((x) => (
                <button key={x} type="button" className={ws.dPick} aria-label={t.pickAdd(x)}
                  onClick={(e) => { void addStar(x, 'empty', e.currentTarget); }}>
                  <AppTickerLogo symbol={x} size={22} />
                  <span>{x}</span>
                  <WlIcon name="star" />
                </button>
              ))}
            </div>
            {/* 검색은 한 줄 전체 — 좁은 칸에서 «Search to add»가 잘렸다(C3) */}
            <button type="button" className={p.pkSrch} onClick={() => setSearchOpen(true)}>
              <WlIcon name="search" /><span>{t.search}</span>
            </button>
          </div>
        )}
      </div>

      {searchOpen && <TickerSearchOverlay loc={loc} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
