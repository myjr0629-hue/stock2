import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { UA_BOT_RE, isPreviewBot } from '@/lib/marketing/clickHuman';
import { inviteClientIp, ipFamily } from '@/lib/invite/guard';
import { giftIdentity } from './http';
import { giftSecret } from './server';

export const FUNNEL_LIMITS = {
  slots: 256, ipMinute: 120, deviceMinute: 60, processMinute: 300,
  processDay: 10000, day: 10000, retentionDays: 40,
} as const;

/** Origin/UA는 인증이 아니다. 위조 가능한 요청은 아래 비용 한도로도 막는다. */
export function validFunnelPost(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') || '';
  if (!/Mozilla\//.test(ua) || UA_BOT_RE.test(ua) || isPreviewBot(ua)) return false;
  const origin = req.headers.get('origin');
  if (!origin || origin === 'null') return false;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  try {
    return new URL(origin).origin === req.nextUrl.origin ||
      ['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost'].includes(origin);
  } catch { return false; }
}

/** 본문 상한은 0바이트. Next가 빈 POST도 스트림으로 넘길 수 있어 EOF까지 확인한다. */
export async function emptyFunnelBody(req: NextRequest): Promise<boolean> {
  if (!/^(0)?$/.test(req.headers.get('content-length') || '')) return false;
  if (!req.body) return true;
  const reader = req.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // 한 청크도 모으지 않는다. 무내용 스트림의 EOF만 허용하고 느린 본문은 제한한다.
    return await Promise.race([
      reader.read().then(chunk => chunk.done === true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 100); }),
    ]);
  } catch { return false; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

/**
 * 기존 invite IP 정규화·gift 서명 기기 쿠키 재사용. 식별자는 반환 버킷/저장소에 남기지 않는다.
 * 서명 쿠키 없는 첫 요청은 IP+UA로 보수적으로 묶는다(새 쿠키를 계측 때문에 발급하지 않는다).
 * 일별 HMAC의 1바이트만 전달: 식별자 해시가 아닌 0..255 충돌 버킷이다.
 */
export function funnelBuckets(req: NextRequest, day: string): [number, number] | null {
  const ip = inviteClientIp(req.headers);
  if (!ip || ip.length > 64) return null;
  const identity = giftIdentity(req);
  const key = giftSecret();
  if (!key) return null;
  const bucket = (kind: string, value: string) => createHmac('sha256', key).update(`${day}|${kind}|${value}`).digest()[0];
  const family = ipFamily(ip);
  const device = identity?.validCookie || identity?.app ? identity.device : `${family}|${req.headers.get('user-agent') || ''}`;
  return [bucket('ip', family), bucket('device', device)];
}
/** Upstash 호출 전 고정 메모리 상한. 실패·동시 요청도 먼저 몫을 소비한다. */
export function createFunnelAdmission() {
  let minute = -1, day = '';
  let calls = 0, daily = 0;
  const ips = new Uint16Array(FUNNEL_LIMITS.slots);
  const devices = new Uint16Array(FUNNEL_LIMITS.slots);
  return (ip: number, device: number, today: string, now: number) => {
    if (today !== day) { day = today; daily = 0; }
    const current = Math.floor(now / 60000);
    if (current !== minute) { minute = current; calls = 0; ips.fill(0); devices.fill(0); }
    if (calls >= FUNNEL_LIMITS.processMinute || daily >= FUNNEL_LIMITS.processDay ||
        ips[ip] >= FUNNEL_LIMITS.ipMinute || devices[device] >= FUNNEL_LIMITS.deviceMinute) return false;
    calls++; daily++; ips[ip]++; devices[device]++;
    return true;
  };
}
