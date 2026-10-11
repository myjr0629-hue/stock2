'use client';

// ============================================================================
// 실적 주간 페이지의 공유 단추 — 기존 공유 규칙(lib/share/share.shareOrCopy: 시스템 공유 시트 → 링크 복사 → 주소 대화상자)을 그대로 쓴다.
// 앱 화면용 ShareButton 과 달리 집계 비콘(/api/share-hit)을 보내지 않는다 — 앱 공유 루프의 표면 목록(rank·ticker…)을 오염시키지 않고,
// 수집 경로를 건드리지 않기 위해서다. 링크는 항상 운영 주소의 깨끗한 페이지 URL(쿼리 없음)이다.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { ShareIcon } from '@/components/share/ShareButton';
import { shareOrCopy, SHARE_ORIGIN } from '@/lib/share/share';

export function EarningsWeekShare({ locale, label, copiedLabel, title, text }: {
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
      const out = await shareOrCopy({ title, text, url: `${SHARE_ORIGIN}/${locale}/earnings-week` });
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
    <span className="ew-share">
      <button type="button" className="ew-btn" onClick={onClick} aria-label={label}>
        <ShareIcon size={16} />
        <span>{label}</span>
      </button>
      <span role="status" aria-live="polite" className="ew-note">{note ? copiedLabel : ''}</span>
    </span>
  );
}

export default EarningsWeekShare;
