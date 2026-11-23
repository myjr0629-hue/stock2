'use client';

// ============================================================================
// DailyPaywallHost — 무료 사용자 «하루 한 번» 앱 열 때 체험 페이월 자리 (2026-11-23) · 앱 레이아웃에 «하나만»
// ----------------------------------------------------------------------------
// 판정·겹침·끄기 스위치는 lib/app/dailyPaywall 머리말. 여기는 가벼운 문(네이티브·이번 실행 시작 때 첫 실행 마침·오늘 아직 안 봄)만 보고,
// 통과한 기기만 판정기(DailyPaywallGate — 결제 SDK·페이월)를 불러온다. 웹·새 설치의 첫 세션·오늘 이미 본 기기는 한 바이트도 더 받지 않는다.
// 날짜가 바뀐 뒤 앱이 다시 앞으로 오면(같은 실행) 문을 다시 본다.
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { previewFlag } from '@/lib/app/proEntitlement';
import { readOnboardedAt } from '@/lib/app/trialAnnounce';
import { dailyPreGate, type MiniStore } from '@/lib/app/dailyPaywall';

const DailyPaywallGate = dynamic(() => import('./DailyPaywallGate').then((m) => m.DailyPaywallGate), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

// «이번 실행이 시작될 때» 첫 안내를 마쳤나 — 이번 실행 중에 첫 안내를 마친 새 사용자는 first_run 몫(재마운트돼도 처음 읽은 값)
let onboardedAtStart: boolean | null = null;

export function DailyPaywallHost() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (on) return;
    const store = localStore();
    if (onboardedAtStart === null) onboardedAtStart = readOnboardedAt(store);
    const native = () => { try { return isNativeShell() || previewFlag('sgdp'); } catch { return false; } };
    const pass = () => dailyPreGate({ native: native(), onboardedAtStart: !!onboardedAtStart, store, now: Date.now() });
    // 첫 판정은 다음 틱에 · 네이티브 브리지 주입이 늦는 기기 대비 2초 뒤 한 번 더 · 앱이 다시 앞으로 올 때(자정 넘김)마다 다시
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
  return on ? <DailyPaywallGate /> : null;
}
