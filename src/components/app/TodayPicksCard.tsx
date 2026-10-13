'use client';

// ============================================================================
// 대시보드 «✦ AI 오늘 볼 것» 카드 (2026-10-13, 대표 10/13 «떠먹여주는 완벽한 앱»)
//   마켓 스테이터스(히어로) 바로 아래, 「내 종목」 위 — 기존 카드·순서·문구는 그대로이고 이 카드만 얹었다.
//   하루 두 번(아침 08:00 ET 무렵·마감 뒤) 서버가 규칙으로 고른 5개(고래 신규 포지션 · 다크풀 · Gamma Flip/Max Pain · 실적 전 옵션 예상 변동)와
//   항목마다 AI 한 줄 해설. 숫자·날짜는 규칙 문장(AI 가 쓰지 않는다). 항목을 누르면 그 종목의 Flow 화면으로.
//   값이 없으면(끄기 스위치·문서 없음·읽기 실패) 카드 자체를 그리지 않는다. 읽기는 저장본뿐 — 이 화면은 생성을 기다리지 않는다.
//   디자인은 내 종목 «✦ AI 한 줄»과 같은 색 체계(보라→하늘 배지 · #7dd3fc 글자 · 숫자 굵게). AI 가 쓴 줄에만 «✦ AI» 표식 — 규칙 문장으로 대신한 줄에는 달지 않는다.
// ============================================================================
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { useTodayPicks } from '@/components/app/useTodayPicks';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { toWlLocale } from '@/lib/app/watchlistInsights';
import { UI } from '@/lib/todayPicks/copy';
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
    out.push(m[1] ? m[1] : <b key={k++} className={cls}>{m[0]}</b>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
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

  const head = (
    <div className={classes.sectHead}>
      <span className={s.badge} role="img" aria-label={ui.aiAria}><i aria-hidden="true">✦</i>AI</span>
      <span className={classes.sectT}>{ui.title}</span>
      {st.status === 'ready' && st.view.pickedAt && <span className={s.picked}>{ui.updated(st.view.pickedAt)}</span>}
    </div>
  );

  if (st.status === 'loading') {
    return (
      <div className={classes.sect} aria-hidden="true">
        {head}
        <div className={`${classes.surf} ${s.card}`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={s.skRow}>
              <i className={`${s.sk} ${s.skLogo}`} />
              <div><i className={`${s.sk} ${s.skA}`} /><i className={`${s.sk} ${s.skB}`} /><i className={`${s.sk} ${s.skC}`} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const open = (ticker: string) => {
    trackFunnel('ai_tap', { src: 'today_picks' });
    router.push(`/${loc}/app-view/flow?t=${encodeURIComponent(ticker)}`);
  };

  return (
    <div className={classes.sect} data-testid="today-picks">
      {head}
      <div className={`${classes.surf} ${s.card}`}>
        {st.view.items.map((p) => (
          <button
            key={p.id}
            type="button"
            className={s.row}
            data-kind={p.kind}
            aria-label={`${p.ticker}, ${p.label}. ${p.what}. ${p.why}`}
            onClick={() => open(p.ticker)}
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
        ))}
      </div>
    </div>
  );
}
