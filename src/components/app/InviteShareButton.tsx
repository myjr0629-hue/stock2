'use client';

// ============================================================================
// InviteShareButton — 공유 카드 단추(작은 아이콘) 1개 (2026-10-14, 브랜치 feat/viral-loop)
// ----------------------------------------------------------------------------
// · 쓰는 곳 3곳: ✦AI 오늘 볼 것 항목(kind=pick) · 내 종목 ✦AI 한 줄(kind=line) · 실적 옵션 반영 변동폭 행(kind=earn).
// · 새 요소일 뿐 기존 행의 글자·배치를 바꾸지 않는다 — 놓는 자리는 호출부가 className 으로 정한다(행 «형제» 단추 — 버튼 안에 버튼을 넣지 않는다).
// · 눌림 표시 없음(대표 10/13 «번쩍이는 것 넣지 말고 햅틱만»): :active 배경·확대·탭 강조 없음. 햅틱은 앱 레이아웃이 모든 버튼 클릭에 한 번 낸다(app-view/layout.tsx) — 여기서 또 부르지 않는다.
// · 규칙·집계는 lib/invite 한 곳 — 여기는 단추와 «복사했어요» 토스트(안드로이드 셸·Web Share 가 없는 곳)뿐이다. 토스트는 body 로 포털한다(ShareButton 과 같은 모양).
// · 서버가 끄라고 대답한 때(INVITE_SHARE_OFF=1)만 그려지지 않는다.
// ============================================================================

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ShareIcon } from '@/components/share/ShareButton';
import { INVITE_COPY } from '@/lib/invite/copy';
import { toInviteLang, type ShareKind } from '@/lib/invite/kinds';
import { useInviteConfig, useInviteShare } from '@/lib/invite/useInvite';
import { INVITE_HINT_MAX, bumpInviteHint, inviteHintCount } from '@/lib/invite/identity';
import s from './InviteShareButton.module.css';

export function InviteShareButton({ kind, ticker, line, locale, className }: {
  kind: ShareKind;
  ticker: string;
  /** 화면에 이미 그려진 줄(없으면 null) — 공유 문구에 싣는다 */
  line: string | null;
  locale: string;
  /** 놓는 자리(위치·크기 보정) — 호출부 CSS */
  className?: string;
}) {
  const cfg = useInviteConfig();
  const enabled = cfg ? cfg.share : true;
  const share = useInviteShare(kind, locale);
  const [toast, setToast] = useState<'copied' | 'reward' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!enabled) return null;

  const lang = toInviteLang(locale);
  const c = INVITE_COPY[lang];
  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    // 행 «형제» 단추라 번질 일은 없지만, 어떤 호출부에서 부모 클릭(행 이동)으로 번지지 않게 끊는다
    e.stopPropagation();
    const out = await share(ticker, line);
    // 링크를 복사만 한 곳(안드로이드 셸 등)은 «복사했어요» · 공유 시트를 마친 곳은 «내게 오는 것» 한 줄(보상이 켜져 있을 때만·기기에서 두 번까지)
    let which: 'copied' | 'reward' | null = null;
    if (out === 'copied') which = 'copied';
    else if (out === 'shared' && cfg?.rewards && inviteHintCount() < INVITE_HINT_MAX) { which = 'reward'; bumpInviteHint(); }
    if (which) {
      setToast(which);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), which === 'reward' ? 3200 : 2200);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className ? `${s.btn} ${className}` : s.btn}
        aria-label={c.shareAria[kind](ticker)}
        data-invite-share={kind}
        onClick={(e) => { void onClick(e); }}
      >
        <ShareIcon size={15} strokeWidth={1.9} />
      </button>
      {toast && typeof document !== 'undefined' && createPortal(
        <div role="status" aria-live="polite" style={{
          position: 'fixed', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', zIndex: 2147483000,
          width: 'max-content', maxWidth: 'calc(100vw - 32px)', padding: '11px 18px', borderRadius: 999,
          background: 'rgba(15,23,42,0.94)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          font: "700 13px/1.35 -apple-system, 'SF Pro Text', 'Segoe UI', Pretendard, sans-serif",
          textAlign: 'center', pointerEvents: 'none',
        }}>
          {toast === 'reward' ? c.rewardHint : c.copied}
        </div>,
        document.body,
      )}
    </>
  );
}

export default InviteShareButton;
