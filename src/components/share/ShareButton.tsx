'use client';

// ============================================================================
// ShareButton — 앱 화면의 «그 콘텐츠»를 공개 URL 로 공유한다(공유 루프, 2026-09-29).
//
// · 규칙·집계는 `@/lib/share/share` 한 곳에 있다(여기는 버튼과 «복사됨» 토스트뿐).
// · 카드·행 안에 들어가도 카드 클릭으로 번지지 않게 전파를 끊는다.
// · 토스트는 body 로 포털한다 — transform·overflow 가 걸린 카드 안에서 position:fixed 가
//   카드 기준으로 갇히는 것을 피한다(WIM 히어로 카드가 그렇다).
// · 모양은 호출부가 className/style 로 정한다. 이 파일은 레이아웃을 갖지 않는다.
// ============================================================================

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { buildShareUrl, shareBeacon, shareOrCopy, shareVia, type ShareOutcome, type ShareSurface } from '@/lib/share/share';

const LABEL: Record<string, string> = { ko: '공유', en: 'Share', ja: '共有' };
const COPIED: Record<string, string> = {
  ko: '링크를 복사했어요 — 붙여넣어 보내세요',
  en: 'Link copied — paste it anywhere',
  ja: 'リンクをコピーしました — 貼り付けて送れます',
};

export function ShareIcon({ size = 18, color = 'currentColor', strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3.5M8 7.5l4-4 4 4" />
      <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
    </svg>
  );
}

export interface ShareButtonProps {
  surface: ShareSurface;
  locale: string;
  /** 공개 페이지 경로(로케일 포함) — 예: `/ko/flow/NVDA` */
  path: string;
  /** 경로에 덧붙일 쿼리(from·via 는 자동) — 예: `{ open: 'NVDA' }` */
  params?: Record<string, string>;
  title?: string;
  text?: string;
  className?: string;
  style?: CSSProperties;
  iconSize?: number;
  color?: string;
  /** 아이콘 대신 그릴 내용(앱마다 쓰는 아이콘이 다르다) */
  children?: ReactNode;
  /** 화면 낭독기 이름(기본 «공유») — 한 화면에 버튼이 여러 개면 무엇을 공유하는지 붙인다 */
  label?: string;
}

export function ShareButton({
  surface, locale, path, params, title, text, className, style, iconSize = 18, color, children, label: labelProp,
}: ShareButtonProps) {
  const [toast, setToast] = useState(false);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const via = shareVia();
    shareBeacon('tap', surface, via);
    let out: ShareOutcome = 'failed';
    try {
      out = await shareOrCopy({ title, text, url: buildShareUrl(path, params, via) });
    } finally {
      busy.current = false;
    }
    if (out === 'shared' || out === 'copied') shareBeacon('sent', surface, via);
    if (out === 'copied') {
      setToast(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(false), 2200);
    }
  };

  const label = labelProp || LABEL[locale] || LABEL.en;
  return (
    <>
      <button type="button" aria-label={label} title={label} className={className} style={style} onClick={onClick}>
        {children ?? <ShareIcon size={iconSize} color={color} />}
      </button>
      {toast && typeof document !== 'undefined' && createPortal(
        // 화면 한가운데 — 위쪽은 앱마다 헤더·칩 줄이, 아래쪽은 탭바·광고 자리가 있다(2026-09-29 실화면:
        // 위에 두면 SIGNUM 어두운 헤더와 겹쳐 안 읽혔다). 어두운 알약 + 옅은 테두리 = 밝은 UC·WIM 과 어두운 SIGNUM 둘 다에서 읽힌다.
        <div role="status" aria-live="polite" style={{
          position: 'fixed', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', zIndex: 2147483000,
          width: 'max-content', maxWidth: 'calc(100vw - 32px)', padding: '11px 18px', borderRadius: 999,
          background: 'rgba(15,23,42,0.94)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          font: "700 13px/1.35 -apple-system, 'SF Pro Text', 'Segoe UI', Pretendard, sans-serif",
          textAlign: 'center', pointerEvents: 'none',
        }}>
          {COPIED[locale] || COPIED.en}
        </div>,
        document.body,
      )}
    </>
  );
}

export default ShareButton;
