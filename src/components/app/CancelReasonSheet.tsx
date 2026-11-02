'use client';

import { useEffect, useRef } from 'react';
import { BottomSheet, afterSheetHistory } from '@/components/app/watchlist/BottomSheet';
import { trackFunnel } from '@/lib/app/funnel';
import { CANCEL_REASON_CODES, cancelReasonCopy, claimCancelReason, type CancelReasonCode } from '@/lib/app/cancelReason';
import p from './ProPaywall.module.css';

export function CancelReasonSheet({ locale, preview, onDone }: { locale: string; preview: boolean; onDone: () => void }) {
  const copy = cancelReasonCopy(locale);
  const finished = useRef(false);
  const shown = useRef(false);
  useEffect(() => {
    if (preview) return;
    const markVisible = () => {
      if (document.visibilityState === 'visible') claimCancelReason();
    };
    markVisible();
    document.addEventListener('visibilitychange', markVisible);
    return () => document.removeEventListener('visibilitychange', markVisible);
  }, [preview]);
  useEffect(() => { if (!preview && !shown.current) { shown.current = true; trackFunnel('cancel_reason:show', { src: 'other' }); } }, [preview]);
  const finish = (code: CancelReasonCode | 'skip') => {
    if (finished.current) return;
    finished.current = true;
    if (!preview) trackFunnel(`cancel_reason:${code}`, { src: 'other' });
    onDone();
  };
  return <div onClick={e => e.stopPropagation()}>
    <BottomSheet open onClose={() => finish('skip')} closeLabel={copy.skip} closeButton={false}>
      {({ titleId }) => <>
        <h2 id={titleId} tabIndex={-1} className={p.title}>{copy.title}</h2>
        {CANCEL_REASON_CODES.map((code, i) => <button key={code} type="button" className={p.cta} style={{ marginTop: 8 }} onClick={() => finish(code)}>{copy.options[i]}</button>)}
        <button type="button" className={p.close} style={{ position: 'static', width: '100%' }} onClick={() => finish('skip')}>{copy.skip}</button>
      </>}
    </BottomSheet>
  </div>;
}

/** Wait for the sheet history entry to unwind before opening the store. */
export function openAfterCancelReason(action: () => void) { void afterSheetHistory().then(action); }
