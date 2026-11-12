// ============================================================================
// PRO «가격 레벨 돌파» 알림 — 순수 모듈(네트워크·Redis·시계 없음). 시험: tests/proAlerts.core.test.ts
// ----------------------------------------------------------------------------
// 설계: ~/Documents/signum-work/2026-11-12/pro-alert-tier/DESIGN.md 1안(2026-11-12)
//   · 무료 «내 종목 이상 신호»(/api/cron/signal-alerts · push:sig:*)는 그대로 둔다 — 이 모듈은 그 키·상한을 읽지도 쓰지도 않는다.
//   · PRO 만: 사용자가 정한 가격 레벨(종목당 5 · 100종목 · 최대 500 레벨)을 정규장 가격이 «건너면» 한 번 보낸다.
//   · 저장: Upstash push:pro-alerts:v1:<기기 해시> (푸시 토큰 레코드와 따로 — mergeRegistration 이 모르는 칸을 지우지 않게) · TTL 30일
//   · 판정은 «종목별 직전 관측 → 지금 관측» 교차. 레벨이 무장된 뒤(armedAt)의 관측만 직전 값으로 인정 — 저장 직후 이미 넘어선 값은 보내지 않는다.
//   · 한 레벨은 (id, rev) 당 한 번 — 다시 받으려면 앱이 rev 를 올린다(수정·다시 켜기).
// ============================================================================
import { createHash } from 'node:crypto';

export const PA_LIMITS = {
    perTicker: 5,
    tickers: 100,
    levels: 500,
    bodyBytes: 64 * 1024,
    /** 같은 RC 고객에 묶을 수 있는 기기 수(아이폰·아이패드·새 폰) — 넘으면 409(남의 기기를 밀어내지 않는다) */
    devicesPerUid: 5,
} as const;

export const PA_CFG = {
    recordTtlSec: 30 * 86400,
    /** 직전 관측이 이보다 오래됐으면(크론 누락·공급 공백) 교차를 판정하지 않고 기준점만 다시 잡는다 */
    maxGapMs: 16 * 60_000,
    /** 두 관측 사이 이보다 크게 뛰면 틱 오류·분할로 보고 기준점만 다시 잡는다 */
    maxJump: 0.2,
    /** 한 기기 하루 PRO 가격 알림 상한(무료 신호 상한 push:sig:* 과 따로) */
    deviceDailyCap: 20,
    /** 한 실행에서 한 기기에 보내는 최대 수(여러 레벨이 한꺼번에 건너면 앞의 것만 — 나머지는 다음 실행) */
    perRunPerDevice: 3,
    /** RC 양성 판정을 믿는 최대 시간 */
    proPositiveTtlMs: 6 * 3600_000,
    proNegativeTtlMs: 60_000,
    /** 종목 상태(직전 관측) 수명 */
    tickerStateTtlSec: 3 * 86400,
    /** 발송 기록(id·rev) 수명 — 기록 수명과 같게(그 뒤엔 기록도 없다) */
    firedTtlSec: 30 * 86400,
    /** 발송 전 장부(s:'claim')의 수명 — 발송이 확인되면 firedTtlSec 으로 다시 쓴다 */
    claimTtlSec: 10 * 60,
    /** 교차했지만 못 보낸 레벨을 다시 시도하는 시간 */
    pendingTtlSec: 30 * 60,
} as const;

export type Dir = 'up' | 'down';
export type Loc = 'ko' | 'en' | 'ja';
export type Platform = 'ios' | 'android';

export interface LevelInput { t: string; id: string; dir: Dir; px: number; on: boolean; rev: number }
export interface StoredLevel extends LevelInput {
    /** 서버가 (id, rev)를 처음 받은 시각 — 이 뒤의 관측만 교차의 «직전 값»이 된다 */
    armedAt: number;
}
export interface ProAlertRecord {
    v: 1;
    dev: string;
    token: string;
    platform: Platform;
    locale: Loc;
    tz: string | null;
    uidHash: string;
    /** RC 고객 ID — 서버 비밀로 암호화(발송 때 PRO 재확인용). 원문은 저장·기록하지 않는다 */
    uidEnc: string | null;
    /** RC 가 확인한 PRO 를 믿는 시각(ms) — 지나면 발송 전에 다시 확인한다 */
    proUntil: number;
    levels: StoredLevel[];
    updatedAt: number;
}

export interface TickerObs { p: number; at: number; d: string }

export const PA_KEYS = {
    rec: (dev: string) => `push:pro-alerts:v1:${dev}`,
    idx: 'push:pro-alerts:v1:idx',
    uidDevs: (uidHash: string) => `push:pro-alerts:v1:uid:${uidHash}`,
    pro: (uidHash: string) => `push:pro-alerts:v1:pro:${uidHash}`,
    fired: (dev: string, id: string, rev: number) => `push:pro-alerts:v1:f:${dev}:${id}:${rev}`,
    pend: (dev: string, id: string, rev: number) => `push:pro-alerts:v1:pend:${dev}:${id}:${rev}`,
    /** 죽은 토큰 표식 = 그때 기록의 updatedAt — 같은 기록이면 건너뛰고, 새로 저장되면(updatedAt 바뀜) 다시 본다 */
    dead: (dev: string) => `push:pro-alerts:v1:dead:${dev}`,
    cap: (etDate: string, dev: string) => `push:pro-alerts:v1:cap:${etDate}:${dev}`,
    rl: (dev: string) => `push:pro-alerts:v1:rl:${dev}`,
    vrl: (kind: 'ip' | 'id' | 'all', k: string, w: number) => `push:pro-alerts:v1:vrl:${kind}:${k}:${w}`,
    tick: (t: string) => `push:pro-alerts:v1:px:${t}`,
    mode: 'push:pro-alerts:v1:mode',
    lock: 'push:pro-alerts:v1:lock',
    last: 'push:pro-alerts:v1:last',
    stats: (etDate: string) => `push:pro-alerts:v1:stats:${etDate}`,
    vendorDay: (etDate: string) => `push:pro-alerts:v1:vendor:${etDate}`,
} as const;

/**
 * 고객→기기 묶음(정렬 집합 · 점수 = 그 기기의 마지막 저장 시각) — 이미 묶였으면 시각만 갱신 · 아니면 상한 안에서만 더한다 → 1(묶임) | 0(상한)
 *   먼저 30일(기록 수명) 넘게 저장이 없던 기기 점수를 걷는다 — 그 기기의 기록은 이미 TTL 로 사라졌다.
 *   한 기기만 계속 동기화해도 집합 TTL 이 갱신돼 옛 기기가 영원히 자리를 차지하던 문제(야간 검토 11/13 ①)를 막는다.
 *   KEYS[1] 묶음 · ARGV = [기기, 지금(ms), 상한, 집합 TTL(초), 걷는 기준 시각(ms)]
 */
export const PA_BIND_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[5])
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[4]); return 1
end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[4]); return 1`;
/** 묶음에서 걷는 기준 — 이 시각 «이하»로 마지막 저장된 기기는 기록도 없다.
 *  기록은 묶은 «뒤»에 30일 TTL 로 쓰이고(수 초 늦음), 다른 경로는 기록 수명을 늘리지 않는다(not_pro 는 KEEPTTL) → 10분 여유를 둬 살아 있는 기록의 묶음은 걷지 않는다 */
export const PA_BIND_SWEEP_MARGIN_MS = 10 * 60_000;
export function bindCutoff(now: number): number {
    return now - PA_CFG.recordTtlSec * 1000 - PA_BIND_SWEEP_MARGIN_MS;
}

/** 토큰 → 기기 해시(24자) — 키 이름·로그에만. 무료 신호의 devKey(12자)와 다른 접두라 키가 겹치지 않는다 */
export function paDevKey(token: string): string {
    return 'd' + createHash('sha256').update('pro-alerts:' + String(token)).digest('hex').slice(0, 23);
}
export function paUidHash(uid: string): string {
    return 'u' + createHash('sha256').update('pro-alerts-uid:' + String(uid)).digest('hex').slice(0, 31);
}

export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
export const LEVEL_ID_RE = /^[a-z0-9]{4,16}$/;
export const RC_UID_RE = /^\$RCAnonymousID:[0-9a-f]{32}$|^[A-Za-z0-9._:-]{8,100}$/;

/** 푸시 토큰 모양 — iOS 64자 16진 · FCM(콜론 포함 · 100~300자) */
export function validToken(t: unknown): t is string {
    return typeof t === 'string' && t.length >= 32 && t.length <= 400 && /^[A-Za-z0-9:_\-]+$/.test(t);
}

function validTz(x: unknown): string | null {
    if (typeof x !== 'string' || x.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/.test(x)) return null;
    try { new Intl.DateTimeFormat('en-US', { timeZone: x }); return x; } catch { return null; }
}

export type ParseResult =
    | { ok: true; uid: string; token: string; platform: Platform; locale: Loc; tz: string | null; levels: LevelInput[] }
    | { ok: false; why: string };

/** 요청 본문 검증 — 기기가 보낸 isPro·rcAppUserId 의 «구독 상태»는 믿지 않는다(검증은 RC 에서) */
export function parseSaveBody(body: unknown): ParseResult {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, why: 'body' };
    const b = body as Record<string, unknown>;
    if (b.v !== 2) return { ok: false, why: 'version' };
    const uid = typeof b.rcAppUserId === 'string' ? b.rcAppUserId.trim() : '';
    if (!RC_UID_RE.test(uid)) return { ok: false, why: 'uid' };
    const token = typeof b.deviceToken === 'string' ? b.deviceToken.trim() : '';
    if (!validToken(token)) return { ok: false, why: 'token' };
    if (b.platform !== 'ios' && b.platform !== 'android') return { ok: false, why: 'platform' };
    const platform = b.platform;
    const locale: Loc = b.locale === 'ko' || b.locale === 'ja' ? b.locale : 'en';
    const tz = validTz(b.tz);
    if (!Array.isArray(b.levels)) return { ok: false, why: 'levels' };
    if (b.levels.length > PA_LIMITS.levels) return { ok: false, why: 'too_many_levels' };
    const levels: LevelInput[] = [];
    const ids = new Set<string>();
    const perTicker = new Map<string, number>();
    for (const raw of b.levels) {
        if (!raw || typeof raw !== 'object') return { ok: false, why: 'level' };
        const l = raw as Record<string, unknown>;
        const t = typeof l.t === 'string' ? l.t.trim().toUpperCase() : '';
        if (!TICKER_RE.test(t)) return { ok: false, why: 'ticker' };
        const id = typeof l.id === 'string' ? l.id : '';
        if (!LEVEL_ID_RE.test(id) || ids.has(id)) return { ok: false, why: 'level_id' };
        if (l.dir !== 'up' && l.dir !== 'down') return { ok: false, why: 'dir' };
        const px = typeof l.px === 'number' ? l.px : NaN;
        if (!Number.isFinite(px) || px <= 0 || px >= 1e6) return { ok: false, why: 'px' };
        const rev = typeof l.rev === 'number' ? l.rev : NaN;
        if (!Number.isInteger(rev) || rev < 1 || rev > 1e9) return { ok: false, why: 'rev' };
        if (typeof l.on !== 'boolean') return { ok: false, why: 'on' };
        const n = (perTicker.get(t) ?? 0) + 1;
        if (n > PA_LIMITS.perTicker) return { ok: false, why: 'per_ticker' };
        perTicker.set(t, n);
        if (perTicker.size > PA_LIMITS.tickers) return { ok: false, why: 'tickers' };
        ids.add(id);
        levels.push({ t, id, dir: l.dir, px: Math.round(px * 10000) / 10000, on: l.on, rev });
    }
    return { ok: true, uid, token, platform, locale, tz, levels };
}

/** 새 목록 + 옛 기록 → 저장할 레벨. 같은 (id, rev, t, dir, px)면 무장 시각을 지킨다 — 아니면 지금 무장(다음 관측부터 기준점) */
export function mergeLevels(prev: readonly StoredLevel[] | null | undefined, next: readonly LevelInput[], now: number): StoredLevel[] {
    const old = new Map((prev ?? []).map((l) => [l.id, l] as const));
    return next.map((l) => {
        const o = old.get(l.id);
        const same = o && o.rev === l.rev && o.t === l.t && o.dir === l.dir && o.px === l.px;
        return { ...l, armedAt: same && Number.isFinite(o!.armedAt) ? o!.armedAt : now };
    });
}

export function activeLevels(rec: Pick<ProAlertRecord, 'levels'> | null | undefined): StoredLevel[] {
    return (rec?.levels ?? []).filter((l) => l.on);
}

/**
 * 교차 판정 — 직전 관측(prev)과 지금 관측(cur)이 «같은 거래일 · 공백 없음 · 이상 점프 없음»이고,
 * 직전 관측이 레벨 무장 «뒤»일 때만. 위로: prev < px ≤ cur · 아래로: prev > px ≥ cur.
 */
export function crossed(level: Pick<StoredLevel, 'dir' | 'px' | 'armedAt'>, prev: TickerObs | null | undefined, cur: TickerObs): boolean {
    if (!prev || !(prev.p > 0) || !(cur.p > 0)) return false;
    if (prev.d !== cur.d) return false;
    if (cur.at - prev.at > PA_CFG.maxGapMs || cur.at <= prev.at) return false;
    if (Math.abs(cur.p / prev.p - 1) > PA_CFG.maxJump) return false;
    if (prev.at <= level.armedAt) return false;
    return level.dir === 'up' ? prev.p < level.px && cur.p >= level.px : prev.p > level.px && cur.p <= level.px;
}

/** 직전 관측을 새 관측으로 바꿔도 되는가(같은 값·옛 시각이면 바꾸지 않는다 — 크론 겹침) */
export function shouldStoreObs(prev: TickerObs | null | undefined, cur: TickerObs): boolean {
    return !prev || cur.at > prev.at;
}

// ── 푸시 문구(규칙 문장 — AI 없음 · 권유·예측 없음) ─────────────────────────────

export function fmtPx(p: number): string {
    const d = p >= 100 ? 2 : p >= 1 ? 2 : 4;
    return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function pushCopy(loc: Loc, t: string, dir: Dir, target: number, price: number): { title: string; body: string } {
    const tg = fmtPx(target), pr = fmtPx(price);
    if (loc === 'ko') return {
        title: `${t} ${tg} ${dir === 'up' ? '돌파' : '이탈'}`,
        body: `설정한 가격 레벨 ${tg}${dir === 'up' ? '을 넘었습니다' : ' 아래로 내려왔습니다'} · 지금 ${pr} (미 정규장)`,
    };
    if (loc === 'ja') return {
        title: `${t} ${tg} ${dir === 'up' ? '上抜け' : '下抜け'}`,
        body: `設定した価格レベル ${tg} を${dir === 'up' ? '上回りました' : '下回りました'} · 現在 ${pr}（米国通常取引）`,
    };
    return {
        title: `${t} ${dir === 'up' ? 'crossed above' : 'fell below'} ${tg}`,
        body: `Your price level ${tg} was ${dir === 'up' ? 'crossed' : 'broken'} · now ${pr} (US regular session)`,
    };
}

/** RC v1 subscriber 응답 → PRO 만료(ms) · 평생이면 Infinity · 아니면 null */
export function proExpiryFromSubscriber(json: unknown, entitlementId: string, now: number): number | null {
    const ent = (json as { subscriber?: { entitlements?: Record<string, any> } } | null)?.subscriber?.entitlements?.[entitlementId];
    if (!ent || typeof ent !== 'object') return null;
    if (ent.expires_date == null) return typeof ent.purchase_date === 'string' ? Infinity : null;   // 평생(만료 없음)
    const exp = typeof ent.expires_date === 'string' ? Date.parse(ent.expires_date) : NaN;
    if (!Number.isFinite(exp) || exp <= now) return null;
    return exp;
}

/** 양성 판정을 믿는 시각 — min(권한 만료, 지금+6시간) */
export function proTrustUntil(expiry: number, now: number): number {
    return Math.min(expiry, now + PA_CFG.proPositiveTtlMs);
}
