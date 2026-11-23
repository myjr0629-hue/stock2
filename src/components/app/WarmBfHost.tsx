'use client';

// ============================================================================
// WarmBfHost — 웜 블프 카드 자리 (2026-11-24) · 앱 레이아웃에 «하나만» · 규칙은 lib/app/warmBf 머리말
// ----------------------------------------------------------------------------
// 가벼운 문(iOS 앱·이번 실행 시작 때 첫 실행 마침·블프 기간·오늘 차례)만 여기서 보고, 통과한 기기만 판정기(WarmBfGate — 결제 SDK)를 싣는다.
// 웹·안드로이드·기간 밖·차례 아닌 날은 한 바이트도 더 받지 않는다. 날짜가 바뀐 뒤 앱이 다시 앞으로 오면 문을 다시 본다.
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { previewFlag } from '@/lib/app/proEntitlement';
import { readOnboardedAt } from '@/lib/app/trialAnnounce';
import { warmPreGate, type MiniStore } from '@/lib/app/warmBf';

const WarmBfGate = dynamic(() => import('./WarmBfGate').then((m) => m.WarmBfGate), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

/** iOS 앱인가(프리뷰 호스트의 확인 모드 ?sgwarm=1 포함 — 운영 도메인에선 previewFlag 가 항상 false) */
function iosHere(): boolean {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (cap?.isNativePlatform?.()) return cap.getPlatform?.() === 'ios';
  } catch { /* 웹 */ }
  return previewFlag('sgwarm');
}

let onboardedAtStart: boolean | null = null;

export function WarmBfHost() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (on) return;
    const store = localStore();
    if (onboardedAtStart === null) onboardedAtStart = readOnboardedAt(store);
    const pass = () => warmPreGate({ ios: iosHere(), onboardedAtStart: !!onboardedAtStart, store, now: Date.now() });
    let t2 = 0;
    const t1 = window.setTimeout(() => {
      if (pass()) { setOn(true); return; }
      t2 = window.setTimeout(() => { if (pass()) setOn(true); }, 2_000);
    }, 0);
    const again = () => { if (document.visibilityState === 'visible' && pass()) setOn(true); };
    document.addEventListener('visibilitychange', again);
    document.addEventListener('app:resume', again);
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2);
      document.removeEventListener('visibilitychange', again);
      document.removeEventListener('app:resume', again);
    };
  }, [on]);
  return on ? <WarmBfGate /> : null;
}
