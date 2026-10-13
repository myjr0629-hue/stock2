/**
 * 추천 API 공용 가드 — 서버 전용. 2026-10-14 (브랜치 feat/viral-loop)
 *   · 요청이 «우리 앱 화면의 fetch»인지(전용 헤더 x-invite: 1 · JSON · 같은 출처) · 사람 UA 인지
 *   · IP → 해시(IPv6 는 /64 로 줄인 뒤) — 같은 폰이 모바일 데이터에서 주소 뒷자리가 바뀌어도 같은 칸에 묶이게
 * 방문자 IP 는 Vercel 이 덮어쓰는 헤더만 믿는다(lib/marketing/couponClaim.clientIp 와 같은 규칙).
 */
import crypto from 'crypto';
import { UA_BOT_RE, isPreviewBot, clickDevice, type HeaderLike } from '@/lib/marketing/clickHuman';

export type InviteDeny = 'bot' | 'origin' | 'noip';

/** IPv6 면 앞 64비트(4칸)만, IPv4 는 그대로. 형식이 아니면 소문자로 정리만. 순수 함수. */
export function ipFamily(ip: string): string {
  const s = ip.trim().toLowerCase();
  const v4mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4mapped) return v4mapped[1];
  if (!s.includes(':')) return s;
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const missing = tail === undefined ? 0 : Math.max(0, 8 - h.length - t.length);
  const full = [...h, ...Array(missing).fill('0'), ...t].map((g) => g.replace(/^0+(?=.)/, '') || '0');
  return full.slice(0, 4).join(':') + '::/64';
}

/**
 * «느슨한» 가족 — IPv4 는 앞 3칸(/24) · IPv6 는 앞 3칸(/48). 이동통신 CGNAT 는 같은 사람의 연결도 요청마다 풀 안의 다른 공인 IP 로 나가는 경우가 있다
 *   (2026-10-14 운영 실측: 같은 Mac 에서 3초 간격 요청이 서로 다른 공인 IP 로 보였다) — 정확히 같은 IP 로만 맞추면 놓친다. 순수 함수.
 */
export function ipLooseFamily(ip: string): string {
  const s = ipFamily(ip);
  if (s.includes('::/64')) return s.split(':').slice(0, 3).join(':') + '::/48';
  const o = s.split('.');
  return o.length === 4 ? `${o[0]}.${o[1]}.${o[2]}.0/24` : s;
}

/** IP 원문은 저장하지 않는다 — 서버 비밀값을 열쇠로 한 HMAC 앞 24자(되돌릴 수 없음). 순수 함수. */
export function inviteIpHash(ip: string, secret: string): string {
  return crypto.createHmac('sha256', secret || 'signum-invite-v1').update(`invite|${ipFamily(ip)}`).digest('hex').slice(0, 24);
}

/** 느슨한(앞 3칸) 해시 — 정확한 해시와 «다른 접두사»(loose|)를 써서 서로 섞이지 않는다 */
export function inviteLooseHash(ip: string, secret: string): string {
  return crypto.createHmac('sha256', secret || 'signum-invite-v1').update(`invite-loose|${ipLooseFamily(ip)}`).digest('hex').slice(0, 24);
}

export function inviteSecret(): string {
  return process.env.INVITE_IP_SALT || process.env.COUPON_IP_SALT || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
}

/** 우리 화면의 fetch 인가 — 하나라도 걸리면 처리하지 않는다. 순수 함수. */
export function inviteDenyReason(h: HeaderLike, host: string | null): InviteDeny | null {
  const ua = h.get('user-agent') || '';
  if (!/Mozilla\//.test(ua) || UA_BOT_RE.test(ua) || isPreviewBot(ua)) return 'bot';
  if (!(h.get('accept-language') || '').trim()) return 'bot';
  if (h.get('x-invite') !== '1') return 'origin';
  if (!/application\/json/i.test(h.get('content-type') || '')) return 'origin';
  const site = (h.get('sec-fetch-site') || '').toLowerCase();
  if (site) {
    if (site !== 'same-origin') return 'origin';
  } else {
    const o = h.get('origin');
    try { if (!o || !host || new URL(o).host !== host) return 'origin'; } catch { return 'origin'; }
  }
  const mode = (h.get('sec-fetch-mode') || '').toLowerCase();
  if (mode && mode !== 'cors' && mode !== 'same-origin') return 'origin';
  return null;
}

/**
 * 방문자 IP — Vercel 이 덮어쓰는 헤더만 믿는다(클라이언트가 위조할 수 없다). 못 찾으면 null(처리 안 함 — 모두가 한 해시를 나눠 쓰지 않게).
 * 미리보기·로컬에서만 시험용 x-invite-test-ip 를 받는다 — 운영에서는 절대 듣지 않는다(lib/marketing/couponClaim.clientIp 와 같은 규칙).
 */
export function inviteClientIp(h: HeaderLike, vercelEnv: string | undefined = process.env.VERCEL_ENV): string | null {
  if (vercelEnv !== 'production') {
    const t = (h.get('x-invite-test-ip') || '').trim();
    if (/^[A-Za-z0-9.:_-]{1,64}$/.test(t)) return t;
  }
  const v = (h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim();
  return v || null;
}

/** 어느 헤더에서 IP 를 읽었나(진단용 — 값은 내보내지 않는다) */
export function inviteIpSource(h: HeaderLike, vercelEnv: string | undefined = process.env.VERCEL_ENV): string | null {
  if (vercelEnv !== 'production' && (h.get('x-invite-test-ip') || '').trim()) return 'test';
  if (h.get('x-vercel-forwarded-for')) return 'x-vercel-forwarded-for';
  if (h.get('x-real-ip')) return 'x-real-ip';
  if ((h.get('x-forwarded-for') || '').trim()) return 'x-forwarded-for';
  return null;
}

/**
 * 진단 로그(INVITE_DEBUG=1 일 때만) — 터치와 도착의 IP 해시가 왜 안 맞는지 볼 때. IP 원문은 싣지 않는다: 해시 앞 6자 · 읽은 헤더 이름 · 숫자를 #으로 가린 «모양».
 */
export function inviteDebug(tag: string, h: HeaderLike, ip: string | null, hash: string | null, extra = ''): void {
  if ((process.env.INVITE_DEBUG || '').trim() !== '1') return;
  console.log(`[invite-debug] ${tag} h6=${hash ? hash.slice(0, 6) : '-'} src=${inviteIpSource(h)} shape=${ip ? ip.replace(/[0-9a-f]/gi, '#') : '-'} ${extra}`.trim());
}

/** 요청 기기 종류(아이폰·안드) — 데스크톱이면 null. */
export function inviteOs(h: HeaderLike): 'ios' | 'android' | null {
  const d = clickDevice(h.get('user-agent') || '');
  return d === 'ios' || d === 'android' ? d : null;
}
