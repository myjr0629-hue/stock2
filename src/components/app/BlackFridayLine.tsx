'use client';

// ============================================================================
// BlackFridayLine — PRO 입구(RedeemCodeLink 자리: ProPaywall·가치 벽·대가 렌즈·대시 게이트)에 붙는 블프 한 줄 (2026-11-22 ~ 12/1) · 누르면 BlackFridayHost 가 같은 시트를 연다
// 설정은 화면을 바꾸지 않는다(tests/ratingStoreLink1105 «설정은 main 과 동일») — 설정 «SIGNUM Pro» 행이 여는 ProPaywall 안에 이 줄이 있다.
// ----------------------------------------------------------------------------
// iOS 앱(또는 프리뷰 확인 모드 ?sgbf=1)·기간 안일 때만 — ★11/24 오후 안드로이드 앱(?sgbfa=1)도, 끄기 스위치 android=true 일 때(→ AndroidBfHost). 서버 렌더·첫 그림에는 없다(마운트 뒤 판정 — 하이드레이션 불일치 없음).
// 기간이 끝나면(12/2 07:00 UTC) 그리지 않는다 — 코드를 지우지 않아도 화면은 예전과 같다.
// ============================================================================

import { useEffect, useState } from 'react';
import { BF_COPY, BF_OPEN_EVENT, bfLive, toBfLang } from '@/lib/app/blackFriday';
import { warmAndroidFrom } from '@/lib/app/warmBf';
import { bfIosHere } from './BlackFridayHost';
import { bfAndroidHere } from './AndroidBfHost';
import s from './BlackFridayLine.module.css';

// ★11/24 오후 안드로이드도(Play 개발자 결정 오퍼 — lib/app/androidBf): 끄기 스위치 /api/app/warm-bf 의 android=true 일 때만 줄을 그린다(실패·늦음 = 안 그림)
async function androidOn(): Promise<boolean> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 3_000);
  try {
    const r = await fetch('/api/app/warm-bf', ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
    return r.ok && warmAndroidFrom(await r.json());
  } catch { return false; } finally { clearTimeout(timer); }
}

export function BlackFridayLine({ locale }: { locale: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!bfLive(Date.now())) return;
    if (bfIosHere()) { setShow(true); return; }
    if (!bfAndroidHere()) return;
    // 네이티브가 아닌데 여기까지 왔으면 프리뷰 확인 모드(로컬·*.vercel.app) — 스위치 없이 그린다
    let native = false;
    try { native = !!(globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(); } catch { native = false; }
    if (!native) { setShow(true); return; }
    let alive = true;
    void androidOn().then((on) => { if (alive && on && bfLive(Date.now())) setShow(true); });
    return () => { alive = false; };
  }, []);
  if (!show) return null;
  const c = BF_COPY[toBfLang(locale)];
  return (
    <button
      type="button"
      className={s.btn}
      onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent(BF_OPEN_EVENT)); }}
      data-bf-line=""
    >
      <span className={s.tag}>BLACK FRIDAY</span>
      <span className={s.text}>{c.line}</span>
      <i className={s.chev} aria-hidden="true">›</i>
    </button>
  );
}
