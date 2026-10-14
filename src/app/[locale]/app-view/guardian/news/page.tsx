'use client';

// ============================================================================
// 앱 안 «뉴스 펄스 — 전체 보기» 페이지 — /app-view/guardian/news (2026-10-13, 대표 10/13 «뉴스 10개가 나오고 사라지고 …
//   해석까지 붙은 자료를 날리는 것보다 모아서 볼 수 있으면 더 좋지 않을까»)
//   Guardian › 시장 현황 › 뉴스 펄스 카드 아래 «전체 보기 · n ›» 가 여는 화면. 카드(점으로 넘기는 최신 10개)는 그대로이고,
//   여기서는 최근 48시간에 AI 해석이 붙은 뉴스를 «사라진 것까지» 시간순으로 모아 보여 준다.
//   읽기 = GET /api/guardian/news-archive 저장본뿐(AI·공급사 호출 0, lib/news/pulseArchive). 항목 = 분류 · 임팩트 배지 · 시각 · 제목(요약) · ✦ AI 해석 · 출처.
//   디자인 = «✦ AI 오늘 볼 것» 전체 페이지(app-view/today)와 같은 체계(머리 줄 · 카드 면 · AI 배지). 눌림 표시 없음 — 눌러서 열리는 항목이 없고,
//   뒤로 단추의 눌림 번쩍임도 없다(대표 10/13 «번쩍이는 것 넣지 말고 햅틱만» — 햅틱은 앱 레이아웃이 모든 버튼 클릭에 한 번 낸다).
//   뒤로 = 앱 안 이동 기록을 따른다(뒤에 앱 화면이 없으면 Guardian › 시장 현황으로 바꿔 간다 — today 페이지와 같은 규칙, lib/app/inAppHistory).
//   경로를 guardian 아래에 둔 까닭: 하단 내비가 경로 앞부분(/app-view/guardian)으로 켜진 탭을 정한다 — 안 그러면 Guardian 에서 왔는데 Dashboard 탭이 켜진다(10/13 로컬 실측).
// ============================================================================
import { useCallback, useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { NEWS_ARCHIVE_REFRESH_MS, useNewsArchive } from '@/hooks/useNewsArchive';
import { hasInAppBack } from '@/lib/app/inAppHistory';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { NEWS_COPY, clockOf, groupByLocalDay, toNewsLoc } from '@/lib/news/pulseCopy';
import { focusNewsArticle, matchesNewsFocus, newsFocusKey } from '@/lib/news/pulseNavigation';
import s from './news.module.css';

export default function AppNewsPage() {
  const locale = useLocale();
  const loc = toNewsLoc(locale);
  const c = NEWS_COPY[loc];
  const router = useRouter();
  const { data, items, isLoading, isValidating, error } = useNewsArchive();
  const searchParams = useSearchParams();
  const focus = searchParams.get('focus') || '';
  const focusKey = searchParams.get('focusKey') || '';
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<{
    done: boolean; stopped: boolean; sawValidation: boolean;
    timer?: number; clearFocus?: () => void;
  } | null>(null);
  const focusAvailable = items.some((it) => matchesNewsFocus(it, focus, focusKey));

  useEffect(() => {
    const request: NonNullable<typeof focusRequest.current> = { done: false, stopped: false, sawValidation: false };
    focusRequest.current = request;
    if (focus || focusKey) {
      // 갱신이 시작되지 않거나 응답이 멈춰도 한 갱신 간격까지만 기다린다.
      // 타임아웃은 «최신본에도 없음»이 아니므로 done으로 처리하지 않는다.
      request.timer = window.setTimeout(() => { request.stopped = true; }, NEWS_ARCHIVE_REFRESH_MS);
    }
    return () => {
      window.clearTimeout(request.timer);
      request.clearFocus?.();
    };
  }, [loc, focus, focusKey]);

  useEffect(() => {
    const request = focusRequest.current;
    if (!request || (!focus && !focusKey) || request.done || request.stopped || !rootRef.current) return;
    if (isValidating) request.sawValidation = true;
    if (isLoading) return;
    if (!focusAvailable) {
      if (isValidating || !request.sawValidation) return;
      if (error) {
        request.stopped = true;
        window.clearTimeout(request.timer);
        return;
      }
    }
    const root = rootRef.current;
    // 대상 발견 또는 첫 갱신 성공 후에도 부재일 때만 완료. 이후 SWR 갱신은 이동·강조를 건드리지 않는다.
    const frame = window.requestAnimationFrame(() => {
      if (request.stopped) return;
      request.done = true;
      window.clearTimeout(request.timer);
      request.clearFocus = focusNewsArticle(root, focus, focusKey);
    });
    return () => { window.cancelAnimationFrame(frame); };
  }, [focus, focusKey, focusAvailable, isLoading, isValidating, error, loc]);

  const total = data?.count ?? items.length;
  const ready = items.length > 0;

  // 페이지가 열렸다 — 열 때마다 한 번, 하루 합계만(식별자·기사 없음)
  useEffect(() => {
    if (ready) trackFunnel('ai_seen', { src: 'news_page' });
  }, [ready]);

  const goBack = useCallback(() => {
    if (hasInAppBack()) router.back();
    else router.replace(`/${loc}/app-view/guardian?tab=reality`);
  }, [router, loc]);

  // 묶음 머리(오늘·어제)는 «지금» 기준이라 렌더마다 다시 계산한다(자정을 넘겨 열어 둬도 맞게 — 항목은 최대 120개라 부담 없다)
  const groups = groupByLocalDay(items, Date.now(), loc);

  return (
    <div ref={rootRef} className={s.wrap} lang={loc}>
      <div className={s.nav}>
        <button type="button" className={s.back} aria-label={c.backAria} onClick={goBack}>
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className={s.ey}>{c.back.toUpperCase()}</span>
      </div>
      <div className={s.head}>
        <div className={s.titleRow}>
          <span className={s.badge} role="img" aria-label={c.aiAria}><i aria-hidden="true">✦</i>AI</span>
          <h1 className={s.title}>{c.title}</h1>
        </div>
        <div className={s.sub}>{ready ? c.sub(total) : ' '}</div>
      </div>

      {isLoading && !ready && (
        <div className={s.surf} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.skRow}>
              <i className={`${s.sk} ${s.skA}`} /><i className={`${s.sk} ${s.skB}`} /><i className={`${s.sk} ${s.skC}`} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !ready && <p className={s.empty}>{error ? c.error : c.empty}</p>}

      {ready && (
        <div className={s.surf} data-testid="news-archive-page">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.heading}>
              <h2 className={s.day}>{g.heading}</h2>
              {g.items.map((it) => (
                <article key={it.id} className={s.item} data-news-id={it.id} data-news-key={newsFocusKey(it)} data-impact={it.impact}>
                  <div className={s.top}>
                    <span className={s.cat} data-cat={it.category}>{c.categories[it.category] ?? c.categories.US_MARKET}</span>
                    <span className={s.imp} data-impact={it.impact}>{it.impact}</span>
                    <time className={`${s.time} num`} dateTime={it.publishedAt}>{clockOf(it.publishedAt)}</time>
                  </div>
                  <p className={s.text}>{it.summary}</p>
                  {it.analysis && (
                    <p className={s.ai}>
                      <span className={s.aiTag} role="img" aria-label={c.aiAria}><i aria-hidden="true">✦</i>AI</span>
                      <span className={s.aiTx}>{it.analysis}</span>
                    </p>
                  )}
                  {it.source && <span className={s.src}>{it.source}</span>}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
