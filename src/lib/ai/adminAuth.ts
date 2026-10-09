/**
 * 관리자 엔드포인트 인증 — 기존 CRON_SECRET 을 «헤더로만» 받는다(URL 쿼리에 비밀을 싣지 않는다: 로그에 남는다).
 *   Authorization: Bearer <CRON_SECRET>   또는   x-cron-secret: <CRON_SECRET>
 * 운영(production)에서 CRON_SECRET 이 설정돼 있지 않으면 «열지 않는다»(fail closed) — 크론 라우트와 달리 비용·상태를 건드리는 도구라서.
 * 비교는 길이가 달라도 시간 일정(timingSafeEqual).
 */
import crypto from 'crypto';

export function adminAuthorized(headers: { get(name: string): string | null }, env: NodeJS.ProcessEnv = process.env): boolean {
    const secret = (env.CRON_SECRET || '').trim();
    if (!secret) return env.NODE_ENV !== 'production';   // 로컬/개발에서만 비밀 없이 연다
    const bearer = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const given = bearer || (headers.get('x-cron-secret') || '').trim();
    if (!given) return false;
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(secret).digest();
    return crypto.timingSafeEqual(a, b);
}
