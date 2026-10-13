'use client';

// ============================================================================
// «오늘 볼 것» 웹 페이지의 공유 단추 — EarningsWeekShare 와 같은 방식(lib/share/share.shareOrCopy). 집계 비콘을 보내지 않는다.
// 링크는 항상 운영 주소의 깨끗한 페이지 URL(쿼리 없음)이다.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { ShareIcon } from '@/components/share/ShareButton';
import { shareOrCopy, SHARE_ORIGIN } from '@/lib/share/share';

export function TodayPicksShare({ locale, label, copiedLabel, title, text }: {
  locale: string; label: string; copiedLabel: string; title: string; text: string;
}) {
  const [note, setNote] = useState(false);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const out = await shareOrCopy({ title, text, url: `${SHARE_ORIGIN}/${locale}/today` });
      if (out === 'copied') {
        setNote(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setNote(false), 2400);
      }
    } finally {
      busy.current = false;
    }
  };

  return (
    <span className="tp-share">
      <button type="button" className="tp-btn" onClick={onClick} aria-label={label}>
        <ShareIcon size={16} />
        <span>{label}</span>
      </button>
      <span role="status" aria-live="polite" className="tp-note">{note ? copiedLabel : ''}</span>
    </span>
  );
}

export default TodayPicksShare;
