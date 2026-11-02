'use client';

import { useEffect, useRef } from 'react';
import { BottomSheet, afterSheetHistory } from '@/components/app/watchlist/BottomSheet';
import { trackFunnel } from '@/lib/app/funnel';
import { CANCEL_REASON_CODES, cancelReasonCopy, canPresentCancelReason, claimCancelReason, type CancelReasonCode } from '@/lib/app/cancelReason';
import p from './ProPaywall.module.css';

export function CancelReasonSheet({ locale, preview, onDone }: { locale: string; preview: boolean; onDone: (button: boolean) => void }) {
  const copy = cancelReasonCopy(locale);
  const finished = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const allowed = useRef(preview || canPresentCancelReason());
  useEffect(() => {
    if (!allowed.current) { onDone(false); return; }
    if (preview) return;
    const markVisible = () => {
      const otherModal = Array.from(document.querySelectorAll('[aria-modal="true"], [data-pro-paywall]')).some(el => !root.current?.contains(el));
      if (document.visibilityState === 'visible' && !otherModal && claimCancelReason()) trackFunnel('cancel_reason:show', { src: 'other' });
    };
    markVisible();
    document.addEventListener('visibilitychange', markVisible);
    return () => document.removeEventListener('visibilitychange', markVisible);
  }, [preview]);
  const finish = (code: CancelReasonCode | 'skip', button: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (!preview) trackFunnel(`cancel_reason:${code}`, { src: 'other' });
    onDone(button);
  };
  if (!allowed.current) return null;
  return <div ref={root} onClick={e => e.stopPropagation()}>
    <BottomSheet open onClose={() => finish('skip', false)} closeLabel={copy.skip} closeButton={false}>
      {({ titleId }) => <>
        <h2 id={titleId} tabIndex={-1} className={p.title}>{copy.title}</h2>
        {CANCEL_REASON_CODES.map((code, i) => <button key={code} type="button" className={p.cta} style={{ marginTop: 8 }} onClick={() => finish(code, true)}>{copy.options[i]}</button>)}
        <button type="button" className={p.close} style={{ position: 'static', width: '100%' }} onClick={() => finish('skip', true)}>{copy.skip}</button>
      </>}
    </BottomSheet>
  </div>;
}

/** Wait for the sheet history entry to unwind before opening the store. */
export function openAfterCancelReason(action: () => void) { void afterSheetHistory().then(action); }
