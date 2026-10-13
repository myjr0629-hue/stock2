'use client';

// ============================================================================
// 대시보드 «✦ AI 오늘 볼 것» 카드 (2026-10-13, 대표 10/13 «떠먹여주는 완벽한 앱» → «너무 많은 부분을 차지한다. 2개만 보이고 누르면 페이지가 열리게»)
//   마켓 스테이터스(히어로) 바로 아래, 「내 종목」 위. 카드에는 «상위 2개»(종류가 겹치지 않게 — lib/todayPicks/cardPick)만 «지금 모양 그대로»(머리 줄 + 핵심 숫자 줄 + ✦AI 해설 — 해설은 빼지도
//   말줄임하지도 않는다: 이 코너가 «특별해 보이는» 까닭이 AI 해설이다, 대표 10/13)로 보이고, 그 아래 «전체 보기 · 5 ›». 제목 줄·«전체 보기»를 누르면 앱 안 전용 페이지(app-view/today)가 열려
//   5개 전체를 보여 준다. 항목을 누르면 그 종목의 Flow 로. 값이 없으면(끄기 스위치·문서 없음·읽기 실패) 카드 자체를 그리지 않는다. 읽기는 저장본뿐 — 이 화면은 생성을 기다리지 않는다.
//
// 눌림 표시 없음(대표 10/13 «번쩍이는 것 넣지 말고 햅틱만» — 내 종목 행과 같은 처방, 9/30 7a185fa23):
//   원인 = 행에 넣은 `.row:active` 배경(눌림 틴트). iOS WKWebView 는 둥근 모서리·overflow:hidden 카드 안 버튼의 :active/탭 강조 상자를 «누른 행이 아닌 곳»(아래 행)에 그린다.
//   → :active 배경을 두지 않고 탭 강조를 투명으로(-webkit-tap-highlight-color · -webkit-touch-callout · user-select). 눌렀다는 신호는 앱 레이아웃이 모든 버튼·링크·role=button 클릭에 내는
//   햅틱 한 번(app-view/layout.tsx · 네이티브만)이라 여기서 hapticImpact 를 또 부르지 않는다(두 번이 된다).
//   누르는 영역: 행은 서로 겹치지 않는 버튼(제목 줄을 넓히려고 ::after 로 영역을 늘리지도 않는다 — 첫 행의 윗부분을 가로챈다). tests/todayPicks.test.ts 가 소스로 고정한다.
// ============================================================================
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { useTodayPicks } from '@/components/app/useTodayPicks';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { toWlLocale } from '@/lib/app/watchlistInsights';
import { cardItems } from '@/lib/todayPicks/cardPick';
import { UI, type UiCopy } from '@/lib/todayPicks/copy';
import type { PickView } from '@/lib/todayPicks/view';
import s from './TodayPicksCard.module.css';

/** 날짜(M/D)는 그대로, 숫자·금액·레벨 이름은 굵게 — 글자는 그대로, 모양만 */
const EM_RE = /(\d{1,2}\/\d{1,2})|(Max Pain|Gamma Flip)|([$±+]?\d[\d,]*(?:\.\d+)?[KMB%]?)/g;
export function emph(text: string, cls: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(EM_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    // 날짜(M/D)와 «20일·20-day·20日» 같은 기간은 굵게 하지 않는다
    const plain = !!m[1] || (!!m[3] && /^(일|-day|日)/.test(text.slice(i + m[0].length)));
    out.push(plain ? m[0] : <b key={k++} className={cls}>{m[0]}</b>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 한 행 — 티커·종류·기준일 / 핵심 숫자 / AI 해설(AI 가 쓴 줄에만 «✦ AI» 표식). 대시보드 카드(상위 2개)와 전체 페이지(5개)가 같은 행을 쓴다 */
export function TodayPickRow({ p, ui, onOpen }: { p: PickView; ui: UiCopy; onOpen: (ticker: string) => void }) {
  return (
    <button
      type="button"
      className={s.row}
      data-kind={p.kind}
      aria-label={`${p.ticker}, ${p.label}. ${p.what}. ${p.why}`}
      onClick={() => onOpen(p.ticker)}
    >
      <span className={s.logo}><AppTickerLogo symbol={p.ticker} size={26} /></span>
      <span className={s.body}>
        <span className={s.top}>
          <b className={s.tk}>{p.ticker}</b>
          <span className={s.chip}>{p.label}</span>
          <span className={`${s.asof} num`}>{p.asOf}</span>
        </span>
        <span className={`${s.what} num`}>{emph(p.what, s.em)}</span>
        <span className={`${s.why} ${p.ai ? '' : s.whyRule}`}>
          {p.ai && <span className={s.aiTag} role="img" aria-label={ui.aiAria}><i aria-hidden="true">✦</i>AI</span>}
          <span className={s.whyTx}>{emph(p.why, s.em)}</span>
        </span>
      </span>
    </button>
  );
}

let seenSent = false;

export function TodayPicksCard({ locale, classes }: {
  locale: string;
  /** 대시보드 9차 시안 클래스(e9Sect·e9SectHead·e9SectT·e9Surf) */
  classes: { sect: string; sectHead: string; sectT: string; surf: string };
}) {
  const loc = toWlLocale(locale);
  const ui = UI[loc];
  const router = useRouter();
  const st = useTodayPicks(loc);
  const shown = st.status === 'ready';

  // 카드가 보였다 — 앱 실행당 한 번, 하루 합계만(식별자·종목 없음)
  useEffect(() => {
    if (shown && !seenSent) { seenSent = true; trackFunnel('ai_seen', { src: 'today_picks' }); }
  }, [shown]);

  if (st.status === 'empty') return null;

  const openAll = () => router.push(`/${loc}/app-view/today`);
  const total = st.status === 'ready' ? st.view.items.length : 0;
  const head = (
    <div
      className={`${classes.sectHead} ${s.headTap}`}
      role="button"
      tabIndex={0}
      aria-label={st.status === 'ready' ? `${ui.title}. ${ui.viewAll(total)}` : ui.title}
      onClick={st.status === 'ready' ? openAll : undefined}
      onKeyDown={(e) => { if (st.status === 'ready' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openAll(); } }}
    >
      <span className={s.badge} role="img" aria-label={ui.aiAria}><i aria-hidden="true">✦</i>AI</span>
      <span className={classes.sectT}>{ui.title}</span>
      {st.status === 'ready' && st.view.pickedAt && <span className={s.picked}>{ui.updated(st.view.pickedAt)}</span>}
      {st.status === 'ready' && <span className={s.chev} aria-hidden="true">&#8250;</span>}
    </div>
  );

  if (st.status === 'loading') {
    return (
      <div className={classes.sect} aria-hidden="true">
        {head}
        <div className={`${classes.surf} ${s.card}`}>
          {[0, 1].map((i) => (
            <div key={i} className={s.skRow}>
              <i className={`${s.sk} ${s.skLogo}`} />
              <div><i className={`${s.sk} ${s.skA}`} /><i className={`${s.sk} ${s.skB}`} /><i className={`${s.sk} ${s.skC2}`} /></div>
            </div>
          ))}
          <div className={s.skFoot}><i className={`${s.sk} ${s.skC}`} /></div>
        </div>
      </div>
    );
  }

  const open = (ticker: string) => {
    trackFunnel('ai_tap', { src: 'today_picks' });
    router.push(`/${loc}/app-view/flow?t=${encodeURIComponent(ticker)}`);
  };
  const items = cardItems(st.view.items, 2);

  return (
    <div className={classes.sect} data-testid="today-picks" lang={loc}>
      {head}
      <div className={`${classes.surf} ${s.card}`}>
        {items.map((p) => <TodayPickRow key={p.id} p={p} ui={ui} onOpen={open} />)}
        {total > items.length && (
          <button type="button" className={s.foot} onClick={openAll}>
            <span>{ui.viewAll(total)}</span><span aria-hidden="true">&#8250;</span>
          </button>
        )}
      </div>
    </div>
  );
}
