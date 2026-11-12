// ============================================================================
// POST/DELETE /api/app/watchlist/alerts — PRO «가격 레벨 돌파» 알림 설정(2026-11-12 · 설계 pro-alert-tier/DESIGN.md 1안)
//   POST { v:2, rcAppUserId, platform, deviceToken, locale, tz, levels:[{t,id,dir,px,on,rev}] } — 기기의 전체 목록으로 «바꾼다»(빈 목록 = 삭제)
//     → 200 {ok, stored, active, fired:[{id,rev,at,px}]} | 400 bad_request | 402 not_pro | 409 unknown_device | 429 rate_limited | 503 verify_unavailable·store_unavailable
//   DELETE { rcAppUserId, deviceToken } → 200 — 그 기기 설정만 지운다.
//   · 이미 등록된 푸시 토큰(push:tokens:<token>)만 받는다 — 토큰은 그 기기만 안다(기기 소유 증명). 토큰당 3초에 한 번.
//   · PRO 는 서버가 RevenueCat 에서 확인한다(lib/proAlerts/rcVerify — 기기가 보낸 isPro 는 받지도 않는다). 양성 캐시 ≤6시간·권한 만료, 음성 60초.
//   · RC 고객 하나에 기기 5대까지 — 넘으면 409 device_limit(남의 기기를 밀어내지 않는다 · 묶음은 30일 갱신 없으면 풀린다).
//     한계: 계정 로그인이 없어 «이 RC ID 가 이 기기 것»을 암호학적으로 증명하지는 못한다. RC 익명 ID(128비트 무작위)는 그 기기와 RC 만 안다 — 체험 보고(/api/push/trial)와 같은 신뢰 모델.
//   · DELETE 는 토큰(기기만 앎) + 기록이 있으면 같은 RC 고객이어야 지운다.
//   · 저장: Upstash push:pro-alerts:v1:<기기 해시>(TTL 30일 · 앱이 하루 한 번 다시 보내 연장) — 푸시 토큰 레코드와 따로.
//   무료 «내 종목 이상 신호»(push:tokens 의 watchlist 사본 · push:sig:*)는 건드리지 않는다.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { clientIpFrom } from '@/lib/guruLens/proAccess';
import {
    PA_CFG, PA_KEYS, PA_LIMITS, activeLevels, mergeLevels, paDevKey, paUidHash, parseSaveBody, proTrustUntil, validToken, type ProAlertRecord,
} from '@/lib/proAlerts/core';
import { parseRecord } from '@/lib/push/prefs';
import { sealUid, verifyProWithRc } from '@/lib/proAlerts/rcVerify';
import { paUpstashStore, rcKeys } from '@/services/proAlertsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

let _redis: Redis | null = null;
const redis = () => (_redis ??= Redis.fromEnv());

async function readBody(req: NextRequest): Promise<unknown> {
    if (Number(req.headers.get('content-length') || 0) > PA_LIMITS.bodyBytes) return { __tooLarge: true };
    const text = await req.text().catch(() => '');
    if (text.length > PA_LIMITS.bodyBytes) return { __tooLarge: true };
    try { return JSON.parse(text); } catch { return null; }
}

/** 기기 설정 하나를 지운다(기록 · 색인 · 고객 묶음) */
async function dropDevice(r: Redis, dev: string, uidHash: string | null) {
    const p = r.pipeline();
    p.del(PA_KEYS.rec(dev));
    p.srem(PA_KEYS.idx, dev);
    if (uidHash) p.zrem(PA_KEYS.uidDevs(uidHash), dev);
    await p.exec();
}

export async function POST(req: NextRequest) {
    const now = Date.now();
    let r: Redis;
    try { r = redis(); } catch { return json({ error: 'store_unavailable' }, 503); }
    try {
        const body = await readBody(req);
        if (body && (body as any).__tooLarge) return json({ error: 'bad_request', why: 'too_large' }, 413);
        const parsed = parseSaveBody(body);
        if (!parsed.ok) return json({ error: 'bad_request', why: parsed.why }, 400);
        const { uid, token, platform, locale, tz, levels } = parsed;
        const dev = paDevKey(token);

        const [tokRaw, rl] = await Promise.all([
            r.get(`push:tokens:${token}`),
            r.set(PA_KEYS.rl(dev), '1', { nx: true, ex: 3 }),
        ]);
        if (rl !== 'OK') return json({ error: 'rate_limited' }, 429);
        if (!tokRaw) return json({ error: 'unknown_device' }, 409);

        const prev = parseRecord<ProAlertRecord>(await r.get(PA_KEYS.rec(dev)));
        const uidHash = paUidHash(uid);

        // 빈 목록 = 끄기 — PRO 확인 없이 받는다(발송을 줄이기만 한다)
        if (!levels.length) {
            await dropDevice(r, dev, prev?.uidHash ?? uidHash);
            return json({ ok: true, stored: 0, active: 0, fired: [] });
        }

        // ── PRO 확인(캐시 → RC) ──
        const cached = parseRecord<{ until?: number; neg?: number }>(await r.get(PA_KEYS.pro(uidHash)));
        let proUntil = 0;
        if (cached?.until && cached.until > now) proUntil = cached.until;
        else if (cached?.neg && cached.neg > now) return json({ error: 'not_pro' }, 402);
        else {
            const v = await verifyProWithRc(uid, platform, clientIpFrom(req.headers), { store: paUpstashStore(r), keys: rcKeys() });
            if (v.kind === 'limited') return json({ error: 'rate_limited' }, 429);
            if (v.kind === 'unavailable') return json({ error: 'verify_unavailable' }, 503);
            if (v.kind === 'not_pro') {
                await r.set(PA_KEYS.pro(uidHash), JSON.stringify({ neg: now + PA_CFG.proNegativeTtlMs }), { ex: 120 });
                if (prev && prev.uidHash === uidHash && prev.proUntil > now) {
                    await r.set(PA_KEYS.rec(dev), JSON.stringify({ ...prev, proUntil: 0 }), { ex: PA_CFG.recordTtlSec });
                }
                return json({ error: 'not_pro' }, 402);
            }
            proUntil = proTrustUntil(v.expiry, now);
            await r.set(PA_KEYS.pro(uidHash), JSON.stringify({ until: proUntil }), { ex: Math.max(60, Math.ceil((proUntil - now) / 1000)) });
        }

        // 고객당 기기 상한 — 새 기기는 상한 안에서만 묶는다(남을 밀어내지 않는다 · 관문 11121338 ②). 오래된 묶음은 30일 TTL 로 풀린다
        if (!(prev && prev.uidHash === uidHash)) {
            const bound = (await r.zrange(PA_KEYS.uidDevs(uidHash), 0, -1)) as string[];
            if (!bound.includes(dev) && bound.length >= PA_LIMITS.devicesPerUid) return json({ error: 'device_limit' }, 409);
        }

        // ── 저장 ──
        const rec: ProAlertRecord = {
            v: 1, dev, token, platform, locale, tz, uidHash,
            uidEnc: prev?.uidHash === uidHash && prev.uidEnc ? prev.uidEnc : sealUid(uid, process.env.CRON_SECRET),
            proUntil,
            levels: mergeLevels(prev?.levels, levels, now),
            updatedAt: now,
        };
        const p = r.pipeline();
        p.set(PA_KEYS.rec(dev), JSON.stringify(rec), { ex: PA_CFG.recordTtlSec });
        p.sadd(PA_KEYS.idx, dev);
        p.zadd(PA_KEYS.uidDevs(uidHash), { score: now, member: dev });
        p.expire(PA_KEYS.uidDevs(uidHash), PA_CFG.recordTtlSec);
        if (prev && prev.uidHash && prev.uidHash !== uidHash) p.zrem(PA_KEYS.uidDevs(prev.uidHash), dev);
        await p.exec();

        // 이미 보낸 레벨(id, rev) — 앱이 그 레벨을 «보냄»으로 바꾼다
        const firedVals = rec.levels.length ? ((await r.mget(...rec.levels.map((l) => PA_KEYS.fired(dev, l.id, l.rev)))) as unknown[]) : [];
        const fired = rec.levels.flatMap((l, i) => {
            const f = parseRecord<{ at?: number; px?: number; s?: string }>(firedVals[i]);
            // «보냄»이 확인된 것만(발송 전 잡아 둔 장부 s:'claim' 은 아직 아니다)
            return f && f.s === 'sent' && Number.isFinite(f.at) ? [{ id: l.id, rev: l.rev, at: f.at as number, px: Number(f.px) || null }] : [];
        });
        return json({ ok: true, stored: rec.levels.length, active: activeLevels(rec).length, fired });
    } catch (e) {
        console.error('[ProAlerts/save]', (e as Error)?.message || e);
        return json({ error: 'store_unavailable' }, 503);
    }
}

export async function DELETE(req: NextRequest) {
    let r: Redis;
    try { r = redis(); } catch { return json({ error: 'store_unavailable' }, 503); }
    try {
        const body = (await readBody(req)) as Record<string, unknown> | null;
        const token = body && typeof body.deviceToken === 'string' ? body.deviceToken.trim() : '';
        if (!validToken(token)) return json({ error: 'bad_request', why: 'token' }, 400);
        const dev = paDevKey(token);
        if ((await r.set(PA_KEYS.rl(dev), '1', { nx: true, ex: 3 })) !== 'OK') return json({ error: 'rate_limited' }, 429);
        const prev = parseRecord<ProAlertRecord>(await r.get(PA_KEYS.rec(dev)));
        if (prev) {
            const uid = typeof body?.rcAppUserId === 'string' ? body.rcAppUserId.trim() : '';
            if (prev.uidHash !== paUidHash(uid)) return json({ error: 'not_owner' }, 403);
        }
        await dropDevice(r, dev, prev?.uidHash ?? null);
        return json({ ok: true });
    } catch (e) {
        console.error('[ProAlerts/delete]', (e as Error)?.message || e);
        return json({ error: 'store_unavailable' }, 503);
    }
}
