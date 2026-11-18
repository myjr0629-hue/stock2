'use client';

// ============================================================================
// TrialPushOptInSheet — 체험자 알림 권한 다시 묻기 시트 (판정기 TrialPushOptInGate 가 기록을 마친 뒤에만 그린다)
// ----------------------------------------------------------------------------
// 모양은 첫 실행 알림 단계 그대로(같은 오버레이·패널·FirstRunNotifStep — 모닝·마감 미리보기·안내문 포함). 새 문구는 제목·한 줄·버튼 둘뿐(lib/app/trialPushOptIn).
// [알림 켜기] = 자격·권한을 다시 보고 여전히 'prompt' 일 때만 첫 실행과 같은 요청·등록 함수를 한 번. 결과를 기다리는 동안 시트는 그대로(버튼만 잠금).
// [나중에] = 닫기(다시 안 뜬다). 떠 있는 동안 네이티브 배너를 내린다.
// ============================================================================

import { useState } from 'react';
import { FirstRunNotifStep } from './FirstRunValueStep';
import { requestPushAndRegister } from './AppFirstRunOnboarding';
import { firstRunCopy } from '@/lib/app/firstRunCopy';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { readStoredPushPrefs } from '@/lib/push/prefs';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { checkPushPerm } from '@/lib/native/pushPerm';
import { outcomeStage, prefsOff, runTrialPushAccept, trialPushCopy, type TrialInfo, type TrialPushSrc } from '@/lib/app/trialPushOptIn';
import base from './AppFirstRunOnboarding.module.css';

export function TrialPushOptInSheet({ loc, src, trial, onClose }: { loc: string; src: TrialPushSrc; trial: TrialInfo; onClose: () => void }) {
  useBannerSuppression(true);
  const [busy, setBusy] = useState(false);
  const wl: 'ko' | 'en' | 'ja' = loc === 'ko' || loc === 'ja' ? loc : 'en';

  const onAllow = async () => {
    if (busy) return;
    setBusy(true);
    trackFunnel('trial_push_accept', { src });
    const o = await runTrialPushAccept({
      stillEligible: () => isNativeShell() && !prefsOff(readStoredPushPrefs()) && trial.expiresAt > Date.now(),
      checkPerm: checkPushPerm,
      requestAndRegister: requestPushAndRegister,
    });
    const st = outcomeStage(o);
    if (st) trackFunnel(st, { src });
    onClose();
  };
  const onLater = () => {
    if (busy) return;
    trackFunnel('trial_push_dismiss', { src });
    onClose();
  };

  return (
    <div className={base.overlay} role="dialog" aria-modal="true" aria-labelledby="app-onboarding-title" data-trial-push-optin="">
      <div className={base.shell}>
        <section className={base.panel}>
          <FirstRunNotifStep
            loc={wl}
            stepLabel={firstRunCopy(wl).notif.stepLabel()}
            busy={busy}
            onAllow={onAllow}
            onLater={onLater}
            copy={trialPushCopy(wl)}
          />
        </section>
      </div>
    </div>
  );
}
