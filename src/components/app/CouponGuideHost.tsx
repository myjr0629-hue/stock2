'use client';

// ============================================================================
// CouponGuideHost — 앱 레이아웃(app-view/layout.tsx)에 «하나만» 두는 안드로이드 쿠폰 안내 자리 (2026-10-06)
// ----------------------------------------------------------------------------
// openRedeem(안드로이드) → couponGuide.open() → 여기서 CouponGuideSheet 를 «그때» 불러와 그린다(레이아웃 번들은 가볍게).
// 쿠폰 입구(설정·ProPaywall·ValueWall·대시보드 게이트·«내 종목» 시트)는 전부 app-view 화면 안이다.
// 화면을 옮기면(알림 딥링크 등) 떠 있던 안내는 닫는다 — WatchlistHost 의 시트와 같은 규칙.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { couponGuide, useCouponGuide } from '@/lib/app/couponGuide';

const CouponGuideSheet = dynamic(() => import('./CouponGuideSheet').then((m) => m.CouponGuideSheet), { ssr: false });

export function CouponGuideHost() {
  const req = useCouponGuide();
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (couponGuide.getSnapshot()) couponGuide.close();
  }, [pathname]);
  const id = req?.id;
  const close = useCallback(() => { if (id != null) couponGuide.close(id); }, [id]);
  if (!req) return null;
  return <CouponGuideSheet key={req.id} req={req} onClose={close} />;
}
