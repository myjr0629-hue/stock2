'use client';

// ============================================================================
// BlackFridayLine — PRO 입구(RedeemCodeLink 자리: ProPaywall·가치 벽·대가 렌즈·대시 게이트)에 붙는 블프 한 줄 (2026-11-22 ~ 12/1) · 누르면 BlackFridayHost 가 같은 시트를 연다
// 설정은 화면을 바꾸지 않는다(tests/ratingStoreLink1105 «설정은 main 과 동일») — 설정 «SIGNUM Pro» 행이 여는 ProPaywall 안에 이 줄이 있다.
// ----------------------------------------------------------------------------
// iOS 앱(또는 프리뷰 확인 모드 ?sgbf=1)·기간 안일 때만 — ★11/24 오후 안드로이드 앱(?sgbfa=1)도, 끄기 스위치 android=true 일 때(→ AndroidBfHost). 서버 렌더·첫 그림에는 없다(마운트 뒤 판정 — 하이드레이션 불일치 없음).
// 기간이 끝나면(12/2 07:00 UTC) 그리지 않는다 — 코드를 지우지 않아도 화면은 예전과 같다.
// ============================================================================

import { useEffect, useState } from 'react';
import { BF_COPY, BF_OPEN_EVENT, BF_VALID_UNTIL, bfLive, toBfLang } from '@/lib/app/blackFriday';
import { ANDROID_BF_COPY, ANDROID_BF_LINE_HIDE_EVENT } from '@/lib/app/androidBf';
import { bfIosHere } from './BlackFridayHost';
import { bfAndroidHere } from './AndroidBfHost';
import s from './BlackFridayLine.module.css';

// ★11/24 오후 안드로이드도(Play 개발자 결정 오퍼 — lib/app/androidBf): 무료(캐시상)·끄기 스위치 android=true·기기에 오퍼가 있을 때만 그린다(AndroidBfGate androidLinePlan).
//   문구는 실제 주 단추에 맞춘다 — 연간 오퍼가 있으면 iOS 와 같은 «연간 첫 1년 50%», 월간만 있으면 «월간 첫 달 50%». 판정기는 안드로이드에서만 동적으로 싣는다.
export function BlackFridayLine({ locale }: { locale: string }) {
  const [show, setShow] = useState(false);
  const [plan, setPlan] = useState<'annual' | 'monthly'>('annual');
  useEffect(() => {
    if (!bfLive(Date.now())) return;
    if (bfIosHere()) { setShow(true); return; }
    if (!bfAndroidHere()) return;
    let alive = true;
    void import('./AndroidBfGate').then((m) => m.androidLinePlan()).catch(() => null).then((p) => {
      if (alive && p && bfLive(Date.now())) { setPlan(p); setShow(true); }
    });
    const hide = () => setShow(false);
    window.addEventListener(ANDROID_BF_LINE_HIDE_EVENT, hide);
    return () => { alive = false; window.removeEventListener(ANDROID_BF_LINE_HIDE_EVENT, hide); };
  }, []);
  // 줄이 떠 있는 채 블프가 끝나면(12/2 07:00 UTC) 줄을 내린다 — 끝난 뒤 누르면 아무 일도 없는 줄이 남지 않게(관문 11241325 ④)
  useEffect(() => {
    if (!show) return;
    const left = BF_VALID_UNTIL - Date.now();
    if (left <= 0) { setShow(false); return; }
    const t = left < 2 ** 31 - 1 ? window.setTimeout(() => setShow(false), left + 50) : 0;
    const vis = () => { if (!bfLive(Date.now())) setShow(false); };
    document.addEventListener('visibilitychange', vis);
    return () => { if (t) window.clearTimeout(t); document.removeEventListener('visibilitychange', vis); };
  }, [show]);
  if (!show) return null;
  const c = BF_COPY[toBfLang(locale)];
  const text = plan === 'monthly' ? ANDROID_BF_COPY[toBfLang(locale)].lineMonthly : c.line;
  return (
    <button
      type="button"
      className={s.btn}
      onClick={(e) => { e.stopPropagation(); if (!bfLive(Date.now())) { setShow(false); return; } window.dispatchEvent(new CustomEvent(BF_OPEN_EVENT)); }}
      data-bf-line=""
    >
      <span className={s.tag}>BLACK FRIDAY</span>
      <span className={s.text}>{text}</span>
      <i className={s.chev} aria-hidden="true">›</i>
    </button>
  );
}
