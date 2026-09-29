'use client';

// ============================================================================
// 대시보드 맨 위 «내 종목» — 마켓 스테이터스 카드 바로 아래(기획서 11-1 ⑤)
//   하단 탭은 이미 5개(애플 HIG «5개 이하» · 머티리얼 «3–5») → 6번째 탭 대신 여기.
//   담은 순서 앞 3줄 + «전체 ›»(관리 화면) · 비었으면 한 줄 안내 + 원탭 칩.
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
import { FREE_LIMIT, WATCHLIST_STORAGE_KEY, useAppWatchlist } from '@/lib/app/watchlist';
import { fmtPrice, fmtSignedPct, toWlLocale } from '@/lib/app/watchlistInsights';
import { tickerName } from '@/lib/app/tickerNames';
import { wlCopy } from './copy';
import { WlIcon } from './icons';
import { LogoWithBadge, starAria } from './StarButton';
import { addStar } from './starActions';
import { useStarLongPress, lpRowClass } from './useLongPress';
import { useWatchlistData } from './useWatchlistData';
import s from './watchlist.module.css';

const PICKS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];
const SHOWN = 3;

const T = {
  ko: { all: '전체', empty: '종목 화면 오른쪽 위 ☆ 를 누르면 여기 모입니다. 자주 보는 종목은 바로 담을 수 있어요.' },
  en: { all: 'All', empty: 'Tap ☆ at the top right of a stock screen and it lands here. Or add a popular one now.' },
  ja: { all: 'すべて', empty: '銘柄画面の右上の☆を押すとここに集まります。よく見る銘柄はすぐ追加できます。' },
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

  const emptyCard = (extra = '') => (
    <div className={`${classes.surf} ${s.dEmpty} ${extra}`}>
      <div className={s.dEmptyTx}><WlIcon name="star" /><span>{t.empty}</span></div>
      <div className={s.dPicks}>
        {PICKS.map((x) => (
          <button key={x} type="button" className={s.dPick} aria-label={starAria(x, false, loc)}
            onClick={(e) => { void addStar(x, 'dash', e.currentTarget); }}>
            <AppTickerLogo symbol={x} size={22} />
            <span>{x}</span>
            <WlIcon name="star" />
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
        <span className={classes.all} role="button" tabIndex={0} onClick={goAll}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goAll(); } }}>
          {t.all} &#8250;
        </span>
      </div>

      {!hydrated ? (
        <>
          <script dangerouslySetInnerHTML={{ __html: SHELL_SCRIPT }} />
          <div className={`${classes.surf} ${s.dRows} ${s.dShellRows}`} aria-hidden="true">
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
        <div className={`${classes.surf} ${s.dRows}`}>
          {top.map((x) => {
            const rt = data.rows[x];
            const ch = rt?.changePct ?? null;
            const dir = ch == null ? s.flat : ch > 0 ? s.up : ch < 0 ? s.dn : s.flat;
            const name = tickerName(x, loc);
            const wait = !rt && data.pending;
            return (
              <button key={x} type="button" className={`${s.dRow} ${lpRowClass}`}
                aria-label={`${x}${name ? ` ${name}` : ''}`}
                onClick={() => router.push(`/${loc}/app-view/cmd?t=${encodeURIComponent(x)}`)}
                {...lp(x, { name, price: rt?.price ?? null, changePct: ch })}>
                <LogoWithBadge on><AppTickerLogo symbol={x} size={18} /></LogoWithBadge>
                <b className={s.dT}>{x}</b>
                <span className={s.dN}>{name}</span>
                {wait ? pxSkel : (
                  <>
                    <span className={`${s.dPx} ${data.stale ? s.dStale : ''}`}>{rt?.price ? fmtPrice(rt.price) : '—'}</span>
                    <b className={`${s.dP} ${dir} ${data.stale ? s.dStale : ''}`}>{ch != null ? fmtSignedPct(ch, 2) : ''}</b>
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
