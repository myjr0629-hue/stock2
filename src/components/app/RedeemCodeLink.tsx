'use client';

// ============================================================================
// «코드가 있으신가요? 🎟 쿠폰 코드 입력» — PRO 를 만나는 자리마다 같은 문구의 작은 링크 (2026-10-05)
// ----------------------------------------------------------------------------
// 놓는 곳: ProPaywall(설정·가치 벽·«내 종목»이 여는 결제 전 화면) · ValueWall · 대시보드 게이트. «내 종목» 시트는 자기 줄(🎫 코드)을 쓴다.
// 결제 단추보다 눈에 띄지 않게 — 회색 12px 한 줄, 링크만 밑줄. 네이티브(또는 프리뷰 호스트)에서만 보인다 — 웹에선 코드를 쓸 곳이 없다.
// 동작은 lib/app/redeem.ts openRedeem(iOS 앱 안 애플 시트 · 안드 안내 시트 → 앱 안 구독 결제 창에서 «코드 사용» → «구독», 2026-10-06).
// ============================================================================

import { useEffect, useState } from 'react';
import { openRedeem, redeemCopy, showRedeemEntry } from '@/lib/app/redeem';
import type { FunnelSrc } from '@/lib/app/funnelSchema';
import s from './RedeemCodeLink.module.css';

export function RedeemCodeLink({ locale, src, className }: { locale: string; src?: FunnelSrc; className?: string }) {
  // 서버 렌더·첫 그림에는 없다 — 마운트 뒤 네이티브(또는 프리뷰)일 때만(하이드레이션 불일치 없음)
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(showRedeemEntry()); }, []);
  if (!show) return null;
  const c = redeemCopy(locale);
  return (
    <p className={className ? `${s.wrap} ${className}` : s.wrap} data-redeem-link="">
      <span className={s.ask}>{c.ask}</span>
      <button type="button" className={s.btn} onClick={() => { void openRedeem(src, locale); }}>{c.label}</button>
    </p>
  );
}
