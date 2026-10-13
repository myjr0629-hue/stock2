/**
 * 초대 링크 «터치» 기록 — /app 라우트가 응답 뒤(after)에 부른다. 서버 전용. 2026-10-14 (브랜치 feat/viral-loop)
 *   조건(전부 만족할 때만 쓴다): 초대 태그(gift·share_*) + 형식 통과 ref + 폰(아이폰·안드) + «사람» 판정 + IP 를 알 수 있음 + 저장소 설정이 있음.
 *   하나라도 아니면 아무것도 하지 않는다 — 이동(302)·쿠폰 화면 속도·결과에 영향이 없다(실패는 삼킨다).
 */
import type { HeaderLike } from '@/lib/marketing/clickHuman';
import { recordTouch } from './engine';
import { inviteClientIp, inviteDebug, inviteIpHash, inviteLooseHash, inviteSecret } from './guard';
import { upstashInviteStore } from './store';

export async function touchFromRequest(h: HeaderLike, p: { from: string | null; ref: string | null; os: 'ios' | 'android' | 'desktop'; human: boolean }): Promise<void> {
  try {
    if (!p.human || !p.ref || p.os === 'desktop') return;
    const ip = inviteClientIp(h);
    if (!ip) return;
    const store = upstashInviteStore();
    if (!store) return;
    const ipHash = inviteIpHash(ip, inviteSecret());
    inviteDebug('touch', h, ip, ipHash, `os=${p.os} from=${p.from}`);
    await recordTouch(store, { ref: p.ref, from: p.from, os: p.os, ipHash, looseHash: inviteLooseHash(ip, inviteSecret()), human: p.human });
  } catch { /* 터치 기록 실패가 이동을 막지 않는다 */ }
}
