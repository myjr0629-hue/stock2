'use client';

// ============================================================================
// 대시보드 위쪽 «내 종목» — 마켓 스테이터스 카드 바로 아래(기획서 11-1 ⑤)
//   하단 탭은 이미 5개(애플 HIG «5개 이하» · 머티리얼 «3–5») → 6번째 탭 대신 여기.
//   담은 순서 앞 3줄 + «전체 ›»(관리 화면) · 비었으면 한 줄 + 원탭 칩(대표 9/29 — 설명을 늘어놓지 않는다).
//   행 로고엔 하트 배지를 달지 않는다 — 이 카드의 행은 전부 담긴 종목이라 새 정보가 없고 로고 ⅓ 을 가렸다.
// 섹션 머리는 대시보드 9차 시안 클래스(e9Sect·e9SectHead…)를 그대로 받아 쓴다.
//
// 앱을 켤 때(대시보드 = 첫 화면) 서버 HTML 은 기기 목록(localStorage)을 모른다.
//   그냥 두면 담은 사람에게도 «빈 카드»가 먼저 보였다가 행으로 바뀌며 아래 전체가 들썩인다.
//   → 서버 HTML 에 틀 두 벌(행 뼈대 · 빈 카드)을 싣고, 칠하기 전에 도는 한 줄 스크립트가
//     <html data-sg-wl="0~3"> 을 달아 CSS 가 맞는 틀만 보이게 한다. 하이드레이션이 끝나면 진짜 행으로 바뀐다.
// ============================================================================

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { FREE_LIMIT, WATCHLIST_STORAGE_KEY, getWatchlistStore, useAppWatchlist } from '@/lib/app/watchlist';
import { noteWatchlistEntry } from '@/lib/app/watchlistAnalytics';
import { fmtPrice, fmtSignedPct, toWlLocale } from '@/lib/app/watchlistInsights';
import { wlCopy } from './copy';
import { WlIcon } from './icons';
import { starAria } from './StarButton';
import { addStar } from './starActions';
import { useStarLongPress, lpRowClass } from './useLongPress';
import { useWatchlistData, wlTickerName } from './useWatchlistData';
import s from './watchlist.module.css';

const PICKS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];
const SHOWN = 3;

// «전체 ›»는 대시보드의 다른 섹션과 같은 말(ko 전체 · en View all · ja すべて) · 합쇼체 · 빈 카드는 한 줄 + 원탭 칩(인기 종목)
// 빈 카드 문장엔 기호를 넣지 않는다 — 문장 앞 장식 아이콘이 이미 그 모양이다. 문장 속 «☆» 까지 두면 기호가 두 번 보였다
//   (대표 폰 캡처 9/29 «☆ ☆ 버튼으로 담은 종목이 여기 모입니다»). 무엇을 누르는지는 아이콘과 아래 원탭 칩이 보여 준다.
const T = {
  ko: { all: '전체', empty: '담은 종목이 여기 모입니다' },
  en: { all: 'View all', empty: 'Stocks you add show up here' },
  ja: { all: 'すべて', empty: '追加した銘柄がここに表示されます' },
} as const;

/** 칠하기 전에 한 번 — 담은 «개수»(0~3)만 <html> 에 단다(티커는 싣지 않는다). 실패하면 아무것도 안 한다(= 빈 카드 틀). */
const SHELL_SCRIPT = `(function(){try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(WATCHLIST_STORAGE_KEY)})||'null');var n=d&&Array.isArray(d.items)?d.items.length:0;document.documentElement.setAttribute('data-sg-wl',String(Math.min(n,${SHOWN})))}catch(e){}})();`;

const noopSubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function DashWatchlistSection({ locale, classes }: {
  locale: string;
  classes: { sect: string; sectHead: string; sectT: string; badge: string; all: string; surf: string };
}) {
  const loc = toWlLocale(locale);
  const t = T[loc];
  const c = wlCopy(loc);
  const router = useRouter();
  const hydrated = useSyncExternalStore(noopSubscribe, getTrue, getFalse);
  const wl = useAppWatchlist();
  const top = wl.tickers.slice(0, SHOWN);
  const data = useWatchlistData(top);
  const lp = useStarLongPress();
  const goAll = () => router.push(`/${loc}/app-view/watchlist`);

  // 카드 면은 대시보드 카드(e9Surf) 그대로 + dSurf(아주 옅은 금빛 테두리·왼쪽 위 따뜻한 빛·한 단계 깊은 남색) —
  // 모서리·그림자·여백·글자는 이웃 카드와 같다(대표 9/29 «혼자 튀게 하는 것이 아닌 프리미엄한데 약간 다른 느낌»)
  const emptyCard = (extra = '') => (
    <div className={`${classes.surf} ${s.dSurf} ${s.dEmpty} ${extra}`}>
      <div className={s.dEmptyTx}><WlIcon name="heart" /><span>{t.empty}</span></div>
      <div className={s.dPicks}>
        {PICKS.map((x) => (
          <button key={x} type="button" className={s.dPick} aria-label={starAria(x, false, loc)}
            onClick={(e) => { void addStar(x, 'dash', e.currentTarget); }}>
            <AppTickerLogo symbol={x} size={22} />
            <span>{x}</span>
            <WlIcon name="heart" />
          </button>
        ))}
      </div>
    </div>
  );

  // 가격 자리 뼈대 — 글자 대신 같은 폭의 막대(값이 와도 이름 칸 말줄임이 흔들리지 않게)
  const pxSkel = <><i className={`${s.dSk} ${s.dSkPx}`} /><i className={`${s.dSk} ${s.dSkP}`} /></>;

  return (
    <div className={classes.sect}>
      <div className={classes.sectHead}>
        <span className={classes.sectT}>{c.myList}</span>
        {hydrated && (
          <span className={`${classes.badge} num`}>
            {wl.proReady && !wl.isPro ? `${wl.count}/${FREE_LIMIT}` : wl.count}
          </span>
        )}
        {/* 겉모양은 대시보드 «전체 ›» 그대로(e9All) · 누르는 영역만 44px 이상(dAll ::after — C15) */}
        <span className={`${classes.all} ${s.dAll}`} role="button" tabIndex={0} onClick={goAll}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goAll(); } }}>
          {t.all} &#8250;
        </span>
      </div>

      {!hydrated ? (
        <>
          <script dangerouslySetInnerHTML={{ __html: SHELL_SCRIPT }} />
          <div className={`${classes.surf} ${s.dSurf} ${s.dRows} ${s.dShellRows}`} aria-hidden="true">
            {Array.from({ length: SHOWN }, (_, i) => (
              <div key={i} className={`${s.dRow} ${s.dShellRow}`}>
                <i className={`${s.dSk} ${s.dSkLogo}`} />
                <i className={`${s.dSk} ${s.dSkT}`} />
                <span className={s.dN} />
                {pxSkel}
              </div>
            ))}
          </div>
          {emptyCard(s.dShellEmpty)}
        </>
      ) : top.length > 0 ? (
        <div className={`${classes.surf} ${s.dSurf} ${s.dRows}`}>
          {top.map((x) => {
            const rt = data.rows[x];
            const ch = rt?.changePct ?? null;
            const dir = ch == null ? s.flat : ch > 0 ? s.up : ch < 0 ? s.dn : s.flat;
            // 이름 공급원은 목록·편집 목록과 같다(이름표 → 실적 브리프 이름 · A14)
            const name = wlTickerName(x, loc);
            const wait = !rt && data.pending;
            const px = rt?.price ? fmtPrice(rt.price) : null;
            // 목록이 오래됐거나(요청 실패 중) 이 행만 옛 값을 붙들었으면 흐리게(E4)
            const dim = data.stale || data.isRowStale(x) ? s.dStale : '';
            return (
              <button key={x} type="button" className={`${s.dRow} ${lpRowClass}`}
                // 레이블이 행 전체의 이름이 된다 — 보이는 가격·등락도 같이 읽히게 싣는다(예전엔 티커·이름만 읽혀 가격이 가려졌다 · B10)
                aria-label={[`${x}${name ? ` ${name}` : ''}`, px, ch != null ? fmtSignedPct(ch, 2) : null].filter(Boolean).join(', ')}
                onClick={() => router.push(`/${loc}/app-view/cmd?t=${encodeURIComponent(x)}`)}
                {...lp(x, { name, price: rt?.price ?? null, changePct: ch })}>
                <AppTickerLogo symbol={x} size={18} />
                <b className={s.dT}>{x}</b>
                <span className={s.dN}>{name}</span>
                {wait ? pxSkel : (
                  <>
                    <span className={`${s.dPx} ${dim}`}>{px ?? '—'}</span>
                    <b className={`${s.dP} ${dir} ${dim}`}>{ch != null ? fmtSignedPct(ch, 2) : ''}</b>
                  </>
                )}
              </button>
            );
          })}
        </div>
      ) : emptyCard()}
    </div>
  );
}

/**
 * 대시보드 헤더 하트 — 설정(톱니) 왼쪽, 같은 e9Act 원(29px)·같은 선 굵기. 어느 스크롤 위치에서든 «내 종목» 화면으로 한 번에.
 * 하트는 늘 금색(대표 9/29): 비었으면 금색 선 · 담겼으면 금색 채움. 숫자 배지는 달지 않는다(알림처럼 보인다).
 * 이름(DashWatchlistStar·hdrStar)은 별 시절 그대로 둔다 — 모양만 하트.
 * 서버 HTML·하이드레이션 첫 그림은 저장소를 모른다(렌더 중 localStorage 를 읽지 않는다) — 아래 카드의
 * 칠하기 전 스크립트가 단 <html data-sg-wl> 로 CSS 가 채움을 미리 맞추고(.hdrShell), 하이드레이션 뒤엔 저장소 구독이 정한다
 * (다른 탭·다른 화면에서 담아도 storage·커스텀 이벤트·앱 복귀로 따라온다).
 * 누름의 가벼운 진동은 앱 레이아웃이 모든 버튼에 이미 낸다(layout.tsx) — 여기서 또 내지 않는다.
 */
export function DashWatchlistStar({ locale, className }: { locale: string; className: string }) {
  const loc = toWlLocale(locale);
  const router = useRouter();
  const store = getWatchlistStore();
  const on = useSyncExternalStore(store.subscribe, () => store.count() > 0, getFalse);
  const hydrated = useSyncExternalStore(noopSubscribe, getTrue, getFalse);
  return (
    <button
      type="button"
      className={hydrated ? className : `${className} ${s.hdrShell}`}
      aria-label={wlCopy(loc).myList}
      onClick={() => {
        noteWatchlistEntry('dash_header');
        router.push(`/${loc}/app-view/watchlist`);
      }}
    >
      <WlIcon name="heart" className={on ? `${s.hdrStar} ${s.hdrStarOn}` : s.hdrStar} />
    </button>
  );
}
