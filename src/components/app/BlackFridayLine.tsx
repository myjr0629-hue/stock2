'use client';

// ============================================================================
// BlackFridayLine — PRO 입구(RedeemCodeLink 자리: ProPaywall·가치 벽·대가 렌즈·대시 게이트)에 붙는 블프 한 줄 (2026-11-22 ~ 12/1) · 누르면 BlackFridayHost 가 같은 시트를 연다
// 설정은 화면을 바꾸지 않는다(tests/ratingStoreLink1105 «설정은 main 과 동일») — 설정 «SIGNUM Pro» 행이 여는 ProPaywall 안에 이 줄이 있다.
// ----------------------------------------------------------------------------
// iOS 앱(또는 프리뷰 확인 모드 ?sgbf=1)·기간 안일 때만. 서버 렌더·첫 그림에는 없다(마운트 뒤 판정 — 하이드레이션 불일치 없음).
// 기간이 끝나면(12/2 07:00 UTC) 그리지 않는다 — 코드를 지우지 않아도 화면은 예전과 같다.
// ============================================================================

import { useEffect, useState } from 'react';
import { BF_COPY, BF_OPEN_EVENT, bfLive, toBfLang } from '@/lib/app/blackFriday';
import { bfIosHere } from './BlackFridayHost';
import s from './BlackFridayLine.module.css';

export function BlackFridayLine({ locale }: { locale: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(bfIosHere() && bfLive(Date.now())); }, []);
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
