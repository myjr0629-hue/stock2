'use client';

// ============================================================================
// 대시보드 맨 위 «내 종목» — 마켓 스테이터스 카드 바로 아래(기획서 11-1 ⑤)
//   하단 탭은 이미 5개(애플 HIG «5개 이하» · 머티리얼 «3–5») → 6번째 탭 대신 여기.
//   담은 순서 앞 3줄 + «전체 ›»(관리 화면) · 비었으면 한 줄 안내 + 원탭 칩.
// 섹션 머리는 대시보드 9차 시안 클래스(e9Sect·e9SectHead…)를 그대로 받아 쓴다.
// ============================================================================

import { useRouter } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { FREE_LIMIT, useAppWatchlist } from '@/lib/app/watchlist';
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

const T = {
  ko: { all: '전체', empty: '종목 화면 오른쪽 위 ☆ 를 누르면 여기 모입니다. 자주 보는 종목은 바로 담을 수 있어요.' },
  en: { all: 'All', empty: 'Tap ☆ at the top right of a stock screen and it lands here. Or add a popular one now.' },
  ja: { all: 'すべて', empty: '銘柄画面の右上の☆を押すとここに集まります。よく見る銘柄はすぐ追加できます。' },
} as const;

export function DashWatchlistSection({ locale, classes }: {
  locale: string;
  classes: { sect: string; sectHead: string; sectT: string; badge: string; all: string; surf: string };
}) {
  const loc = toWlLocale(locale);
  const t = T[loc];
  const c = wlCopy(loc);
  const router = useRouter();
  const wl = useAppWatchlist();
  const top = wl.tickers.slice(0, 3);
  const data = useWatchlistData(top);
  const lp = useStarLongPress();
  const goAll = () => router.push(`/${loc}/app-view/watchlist`);

  return (
    <div className={classes.sect}>
      <div className={classes.sectHead}>
        <span className={classes.sectT}>{c.myList}</span>
        <span className={`${classes.badge} num`}>{wl.isPro ? wl.count : `${wl.count}/${FREE_LIMIT}`}</span>
        <span className={classes.all} role="button" tabIndex={0} onClick={goAll}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goAll(); } }}>
          {t.all} &#8250;
        </span>
      </div>

      {top.length > 0 ? (
        <div className={`${classes.surf} ${s.dRows}`}>
          {top.map((x) => {
            const rt = data.rows[x];
            const ch = rt?.changePct ?? null;
            const dir = ch == null ? s.flat : ch > 0 ? s.up : ch < 0 ? s.dn : s.flat;
            const name = tickerName(x, loc);
            return (
              <button key={x} type="button" className={`${s.dRow} ${lpRowClass}`}
                aria-label={`${x}${name ? ` ${name}` : ''}`}
                onClick={() => router.push(`/${loc}/app-view/cmd?t=${encodeURIComponent(x)}`)}
                {...lp(x, { name, price: rt?.price ?? null, changePct: ch })}>
                <LogoWithBadge on><AppTickerLogo symbol={x} size={18} /></LogoWithBadge>
                <b className={s.dT}>{x}</b>
                <span className={s.dN}>{name}</span>
                <span className={s.dPx}>{rt?.price ? fmtPrice(rt.price) : data.loading ? '···' : '—'}</span>
                <b className={`${s.dP} ${dir}`}>{ch != null ? fmtSignedPct(ch, 2) : ''}</b>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={`${classes.surf} ${s.dEmpty}`}>
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
      )}
    </div>
  );
}
