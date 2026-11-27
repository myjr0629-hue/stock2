'use client';

// ============================================================================
// PromoAskHost — 혜택·할인 알림 동의 한 번 묻기 자리 (2026-11-27) · 앱 레이아웃에 «하나만»
// ----------------------------------------------------------------------------
// 판정·기록·문구는 lib/app/promoAsk 머리말. 여기는 가벼운 문(네이티브 · 동의가 필요한 기기 · 아직 값을 안 정함 · 차례)만 보고,
// 통과한 기기만 판정기(PromoAskGate — 푸시 플러그인·결제 SDK)를 불러온다. 이미 답한 기기·웹·기본 켜짐(한국 밖 안드)은 한 바이트도 더 받지 않는다.
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { readStoredPushPrefs } from '@/lib/push/prefs';
import { askDue, deviceTz, nativePlatformNow, needsAsk, pathLoc, readAsk, type MiniStore } from '@/lib/app/promoAsk';

const PromoAskGate = dynamic(() => import('./PromoAskGate').then((m) => m.PromoAskGate), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

export function PromoAskHost() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const pass = () => isNativeShell()
      && askDue(readAsk(localStore()), Date.now())
      && needsAsk(nativePlatformNow(), pathLoc(), deviceTz(), readStoredPushPrefs()?.promo);
    // 첫 판정은 다음 틱에 · 네이티브 브리지 주입이 늦는 기기 대비 2초 뒤 한 번 더(TrialPushOptInHost 와 같다)
    let t2 = 0;
    const t1 = window.setTimeout(() => {
      if (pass()) { setOn(true); return; }
      t2 = window.setTimeout(() => { if (pass()) setOn(true); }, 2_000);
    }, 0);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);
  return on ? <PromoAskGate /> : null;
}
