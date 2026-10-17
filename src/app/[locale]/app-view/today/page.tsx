'use client';

// ============================================================================
// 앱 안 «✦ AI 오늘 볼 것» 전체 페이지 (2026-10-13, 대표 10/13 «2개만 보이고 누르면 페이지가 열리게»)
//   대시보드 카드의 «전체 보기 · 5 ›»·제목 줄이 여는 화면. 5개 전체(핵심 숫자 + ✦AI 해설)를 앱 화면 안에서 보여 준다 — 새 데이터 읽기 없음(대시보드 카드와 같은 저장본, GET /api/today-picks).
//   뒤로 = 앱 안 이동 기록을 따른다(뒤에 앱 화면이 없으면 Dashboard 로 바꿔 간다 — 내 종목 화면과 같은 규칙, lib/app/inAppHistory). 항목을 누르면 그 종목의 Flow 로.
//   눌림 표시 없음(대표 10/13 «번쩍이는 것 넣지 말고 햅틱만» — 햅틱은 앱 레이아웃이 모든 버튼 클릭에 한 번 낸다).
//   웹 공개 페이지(/<lang>/today)와 같은 문서·같은 규칙 문장이다. 다크풀 항목이 있으면 출처 FINRA 를 적는다.
// ============================================================================
import { useCallback, useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { TodayPickItem } from '@/components/app/TodayPicksCard';
import { EarningsCalendarCard } from '@/components/app/EarningsCalendarCard';
import { useTodayPicks } from '@/components/app/useTodayPicks';
import { hasInAppBack } from '@/lib/app/inAppHistory';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { announceAiLineOpened } from '@/lib/app/reviewMoments';
import { toWlLocale } from '@/lib/app/watchlistInsights';
import { UI } from '@/lib/todayPicks/copy';
import { resetTodayPicksScroll } from '@/lib/todayPicks/navigation';
import { TodaySummary } from '@/components/app/TodaySummary';
import s from './today.module.css';
import row from '@/components/app/TodayPicksCard.module.css';
import n9 from '../dash/dash9.module.css';

export default function AppTodayPage() {
  const locale = useLocale();
  const loc = toWlLocale(locale);
  const ui = UI[loc];
  const router = useRouter();
  const st = useTodayPicks(loc);
  const ready = st.status === 'ready';
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) resetTodayPicksScroll(rootRef.current);
  }, [loc]);

  // 페이지가 열렸다 — 열 때마다 한 번, 하루 합계만(식별자·종목 없음)
  useEffect(() => {
    if (ready) trackFunnel('ai_seen', { src: 'today_page' });
  }, [ready]);

  const goBack = useCallback(() => {
    if (hasInAppBack()) router.back();
    else router.replace(`/${loc}/app-view/dash`);
  }, [router, loc]);

  const open = useCallback((ticker: string) => {
    trackFunnel('ai_tap', { src: 'today_page' });
    announceAiLineOpened();   // 평점 요청 순간 ③ (lib/app/reviewMoments.ts)
    router.push(`/${loc}/app-view/flow?t=${encodeURIComponent(ticker)}`);
  }, [router, loc]);

  return (
    <div ref={rootRef} className={s.wrap} lang={loc}>
      <div className={s.nav}>
        <button type="button" className={s.back} aria-label={ui.backAria} onClick={goBack}>
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className={s.ey}>{ui.back.toUpperCase()}</span>
      </div>
      <div className={s.head}>
        <div className={s.titleRow}>
          <span className={s.badge} role="img" aria-label={ui.aiAria}><i aria-hidden="true">✦</i>AI</span>
          <h1 className={s.title}>{ui.title}</h1>
        </div>
        <div className={s.sub}>{ready && st.view.pickedAt ? ui.updated(st.view.pickedAt) : ' '}</div>
      </div>

      <TodaySummary locale={loc} items={ready ? st.view.items : null} />

      <div className={`${n9.e9Surf} ${n9.e9Quick} ${s.earnings}`}>
        <EarningsCalendarCard locale={loc} />
      </div>

      {st.status === 'loading' && (
        <div className={s.surf} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={row.skRow}>
              <i className={`${row.sk} ${row.skLogo}`} />
              <div><i className={`${row.sk} ${row.skA}`} /><i className={`${row.sk} ${row.skB}`} /><i className={`${row.sk} ${row.skC2}`} /></div>
            </div>
          ))}
        </div>
      )}

      {st.status === 'empty' && <p className={s.empty}>{ui.empty}</p>}

      {st.status === 'ready' && (
        <>
          <div className={s.surf} data-testid="today-picks-page">
            {st.view.items.map((p) => <TodayPickItem key={p.id} p={p} ui={ui} locale={loc} onOpen={open} />)}
          </div>
          <p className={s.note}>{ui.howRule}{st.view.hasFinra ? ` ${ui.sourceFinra}.` : ''}</p>
        </>
      )}
    </div>
  );
}
