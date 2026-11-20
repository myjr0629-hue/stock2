// ============================================================================
// /api/cron/trial-push — 체험 종료 D-2 푸시(2026-11-11). Vercel Cron 매시 :17 (vercel.json).
//   대상 목록(push:trial:due, 점수 = 만료 시각)에서 «남은 12~48시간»을 쪽(1000)씩 최대 5쪽 읽어 lib/push/trialPush.trialPushDecision 으로
//   거른 뒤 기기 언어·시간대로 한 통씩 보낸다(iOS APNs · 안드 FCM — lib/push/sendSignal 재사용). 본문은 갱신 상태를 단정하지 않는다.
//   중복 방지: 보내기 «전에» push:trial:sent:<token> 을 SET NX(25일)로 잡는다 — 동시 실행·저장 실패·함수 종료에도 한 번만.
//     실패(fail — 응답 유실 포함)도 자리를 놓지 않는다(중복보다 한 통 누락을 택함). 체험 기록은 이 크론이 «쓰지 않는다»
//     (앱이 갱신을 다시 켠 보고를 덮어쓰지 않게). 보내기 직전에 기록을 한 번 더 읽어 아직 대상인지 확인한다.
//   상한: 회차 100 · 하루(ET) 300 «발송 시도»(INCR 로 먼저 예약 — 겹친 실행도 넘지 못한다) — 가짜 토큰 대량 등록으로 공급사 호출을 키우지 못하게.
//   ?dry=1 — 보내지 않고 대상·이유·문구만 돌려준다(표식·통계 안 씀).
//   통계: push:stats:trial:{ET날짜} (TTL 60일) — 후보·보냄·실패·이유별 건너뜀.
//   ★11/19 같은 회차에서 체험 중 «가치 알림»(3일째·6일째 — lib/push/trialValuePush)도 보낸다: D-2 가 먼저 돌고, 같은 고객에게 하루 한 통.
//     대상 목록 push:trial:value(보고 API 가 확인된 체험만 넣는다) · 상한·통계는 D-2 와 따로(v_*) · 끄기 trial-value-push:off
//     (?valueOff=1 켬 / ?valueOff=0 끔 — 인증 필요) · 한 회차만 빼기 ?value=0 · ?dry=1 이면 가치 알림 미리보기(valuePreview)도 돌려준다.
//   ★11/21 체험 만료 다음 날(D+1) «다시 시작» 할인 코드 푸시(lib/push/comebackPush)도 같은 회차 맨 뒤에 보낸다 — iOS · 고객당 1회 · 발송 직전 RC 재확인.
//     대상 목록 push:comeback:due(RC 웹훅 EXPIRATION 이 넣는다) · 코드 = 환경 변수 COMEBACK_OFFER_CODE(없으면 꺼짐) · 상한·통계 따로(c_*) · 끄기 COMEBACK_PUSH=off 또는 comeback-push:off
//     (?comebackOff=1 켬 / ?comebackOff=0 끔 — 인증 필요) · 한 회차만 빼기 ?comeback=0 · ?dry=1 이면 comeback(대상 수·이유)도 돌려준다(보내지 않음·표식 없음).
// Auth: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=) — 다른 크론과 같다.
// ============================================================================
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { parseRecord } from '@/lib/push/prefs';
import { sendSignalPushes, type SignalPushItem } from '@/lib/push/sendSignal';
import { etDay } from '@/lib/app/funnelSchema';
import { TRIAL_PUSH_OWNER_KEY, TRIAL_PUSH_UID_KEY } from '@/lib/push/trialVerify';
import { bindValue, boundToken, CLAIM_GAP_LUA, COMEBACK_CLAIM_LUA, DROP_DUE_IF_SAME_LUA, SWEEP_IF_UNBOUND_LUA } from '@/lib/push/trialPushLua';
import {
  TRIAL_PUSH_GAP_S, TRIAL_PUSH_LAST_UID_KEY, TRIAL_VALUE_DAY_KEY, TRIAL_VALUE_MAX_LEN_MS, TRIAL_VALUE_MAX_PER_DAY, TRIAL_VALUE_MAX_PER_RUN,
  TRIAL_VALUE_OFF_KEY, TRIAL_VALUE_SCAN_LIMIT, TRIAL_VALUE_SCAN_PAGES, TRIAL_VALUE_SENT_KEY, TRIAL_VALUE_SENT_TTL_S, TRIAL_VALUE_SENT_UID_KEY,
  TRIAL_VALUE_ZSET, trialValueContent, trialValueData, trialValueDecision, type TrialValueStep, type TrialValueTokenRec,
} from '@/lib/push/trialValuePush';
import {
  TRIAL_PUSH_DATA, TRIAL_PUSH_DAY_KEY, TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY, TRIAL_PUSH_MAX_MS, TRIAL_PUSH_MAX_PER_DAY, TRIAL_PUSH_MAX_PER_RUN,
  TRIAL_PUSH_MIN_MS, TRIAL_PUSH_SCAN_LIMIT, TRIAL_PUSH_SCAN_PAGES, TRIAL_PUSH_SENT_KEY, TRIAL_PUSH_SENT_TTL_S, TRIAL_PUSH_SENT_UID_KEY,
  trialPushContent, trialPushDecision, type TrialPushRecord,
} from '@/lib/push/trialPush';
import {
  COMEBACK_DAY_KEY, COMEBACK_ENTRY_KEY, COMEBACK_MAX_AFTER_MS, COMEBACK_MAX_PER_DAY, COMEBACK_MAX_PER_RUN, COMEBACK_MIN_AFTER_MS, COMEBACK_OFF_KEY,
  COMEBACK_SENT_TOKEN_KEY, COMEBACK_SENT_TTL_S, COMEBACK_SENT_UID_KEY, COMEBACK_ZSET, comebackContent, comebackDecision, comebackEnvOff, comebackPushData,
  openUid, parseEntry, readComebackRc, type ComebackEntry, type ComebackTokenRec,
} from '@/lib/push/comebackPush';
import { comebackCode } from '@/lib/app/comebackOffer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const redis = Redis.fromEnv();
/** 회차당 옛 토큰 걷기 상한 */
const TRIAL_PUSH_SWEEP_MAX = 200;
type TokenRec = { app?: string; platform?: string; preferences?: { enabled?: boolean; morning?: boolean; closing?: boolean }; notifPerm?: boolean; tz?: string; createdAt?: string; watchlist?: { t?: unknown } };
/** 끄기 표식 — Upstash 가 '1' 을 숫자 1 로 돌려줄 수 있다 */
const isOn = (v: unknown) => v === 1 || v === '1' || v === true;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const ok = request.headers.get('authorization') === `Bearer ${cronSecret}` || searchParams.get('secret') === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ★11/19 가치 알림 끄기 스위치(env 없이) — ?valueOff=1 이면 끄고 ?valueOff=0 이면 다시 켠다. 이 요청은 발송하지 않는다
  const valueOff = searchParams.get('valueOff');
  if (valueOff === '1' || valueOff === '0') {
    try {
      if (valueOff === '1') await redis.set(TRIAL_VALUE_OFF_KEY, '1'); else await redis.del(TRIAL_VALUE_OFF_KEY);
      return NextResponse.json({ ok: true, valueOff: valueOff === '1' });
    } catch {
      return NextResponse.json({ ok: false, error: 'switch failed' }, { status: 500 });
    }
  }
  // ★11/21 «다시 시작» 할인 코드 푸시 끄기 스위치 — ?comebackOff=1 끔 · ?comebackOff=0 다시 켬(환경 변수 COMEBACK_PUSH=off 는 이것과 무관하게 끈다). 이 요청은 발송하지 않는다
  const comebackOff = searchParams.get('comebackOff');
  if (comebackOff === '1' || comebackOff === '0') {
    try {
      if (comebackOff === '1') await redis.set(COMEBACK_OFF_KEY, '1'); else await redis.del(COMEBACK_OFF_KEY);
      return NextResponse.json({ ok: true, comebackOff: comebackOff === '1' });
    } catch {
      return NextResponse.json({ ok: false, error: 'switch failed' }, { status: 500 });
    }
  }
  const dry = searchParams.get('dry') === '1';
  const now = Date.now();
  try {
    // 지난 만료는 목록에서 걷는다(기록은 TTL 로 사라진다)
    if (!dry) await redis.zremrangebyscore(TRIAL_PUSH_DUE_ZSET, 0, now);
    const skipped: Record<string, number> = {};
    const skip = (k: string) => { skipped[k] = (skipped[k] || 0) + 1; };
    const picked: Array<{ token: string; rec: TrialPushRecord; tokenRec: TokenRec | null; owner: string | null }> = [];
    const pickedOwners = new Set<string>();
    const stale: Array<{ token: string; owner: string }> = [];
    let candidates = 0;
    // 쪽 단위로 읽는다 — 앞쪽이 알림 꺼짐 등으로 계속 제외돼도 뒤쪽 정상 대상이 굶지 않게
    for (let page = 0; page < TRIAL_PUSH_SCAN_PAGES && picked.length < TRIAL_PUSH_MAX_PER_RUN; page++) {
      const tokens = ((await redis.zrange(TRIAL_PUSH_DUE_ZSET, now + TRIAL_PUSH_MIN_MS, now + TRIAL_PUSH_MAX_MS,
        { byScore: true, offset: page * TRIAL_PUSH_SCAN_LIMIT, count: TRIAL_PUSH_SCAN_LIMIT })) || []) as string[];
      candidates += tokens.length;
      for (let i = 0; i < tokens.length && picked.length < TRIAL_PUSH_MAX_PER_RUN; i += 50) {
        const chunk = tokens.slice(i, i + 50);
        const [trialRaw, tokenRaw, sentRaw, ownerRaw] = await Promise.all([
          redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_KEY(t))),
          redis.mget<unknown[]>(...chunk.map((t) => `push:tokens:${t}`)),
          redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_SENT_KEY(t))),
          redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_OWNER_KEY(t))),
        ]);
        // ★11/12 확인된 기록은 «그 고객의 지금 토큰»일 때만 · 고객당 한 번(관문 11121124 — 정리 실패·경합으로 옛 토큰이 남아도 두 통 가지 않는다)
        const owners = ownerRaw.map((o) => (o == null ? null : String(o)));
        const ownerList = [...new Set(owners.filter((o): o is string => !!o))];
        const [boundRaw, sentUidRaw, lastRaw] = ownerList.length ? await Promise.all([
          redis.mget<unknown[]>(...ownerList.map((o) => TRIAL_PUSH_UID_KEY(o))),
          redis.mget<unknown[]>(...ownerList.map((o) => TRIAL_PUSH_SENT_UID_KEY(o))),
          redis.mget<unknown[]>(...ownerList.map((o) => TRIAL_PUSH_LAST_UID_KEY(o))),
        ]) : [[], [], []];
        const bound = new Map(ownerList.map((o, i) => [o, boundToken(boundRaw[i])]));
        const sentUid = new Map(ownerList.map((o, i) => [o, sentUidRaw[i] != null]));
        // ★11/19 같은 고객이 20시간 안에 가치 알림을 받았으면 D-2 도 다음 회차로(하루 두 통 금지 — 관문 11192141 ②). D-2 창(남은 12~48시간) 안에서 다시 본다
        const recentPush = new Map(ownerList.map((o, i) => [o, lastRaw[i] != null]));
        for (let j = 0; j < chunk.length; j++) {
          const token = chunk[j];
          if (picked.length >= TRIAL_PUSH_MAX_PER_RUN) { skip('run_cap'); continue; }
          const rec = parseRecord<TrialPushRecord>(trialRaw[j]);
          const tokenRec = parseRecord<TokenRec>(tokenRaw[j]);
          const owner = rec?.verified === true ? owners[j] : null;
          if (rec?.verified === true && (!owner || bound.get(owner) !== token)) {
            skip('superseded');
            // 고객의 지금 토큰이 아니다 — 훑기가 끝난 «뒤»에 걷는다(훑는 중에 지우면 다음 쪽 offset 이 밀려 정상 대상을 건너뛴다 — 관문 11121138 ①)
            if (owner) stale.push({ token, owner });
            continue;
          }
          const d = trialPushDecision(rec, tokenRec, now, sentRaw[j] != null || (!!owner && sentUid.get(owner) === true) || (!!owner && pickedOwners.has(owner)));
          if (d !== 'send' || !rec) { skip(d); continue; }
          if (owner && recentPush.get(owner) === true) { skip('recent_push'); continue; }
          if (owner) pickedOwners.add(owner);
          picked.push({ token, rec, tokenRec, owner });
        }
      }
      if (tokens.length < TRIAL_PUSH_SCAN_LIMIT) break;
    }
    const dayKey = TRIAL_PUSH_DAY_KEY(etDay(new Date(now)));
    const valueOn = searchParams.get('value') !== '0' && !isOn(await redis.get(TRIAL_VALUE_OFF_KEY).catch(() => null));
    // 코드 설정(COMEBACK_OFFER_CODE)이 없으면 꺼진 것으로 본다
    const cbCode = comebackCode();
    const comebackOn = !!cbCode && searchParams.get('comeback') !== '0' && !comebackEnvOff() && !isOn(await redis.get(COMEBACK_OFF_KEY).catch(() => null));
    if (dry) {
      const v = valueOn ? await runValue(now, true, pickedOwners) : null;
      const cb = comebackOn ? await runComeback(now, true, cbCode!) : null;
      return NextResponse.json({ ok: true, dry: true, candidates, attemptsToday: Number(await redis.get(dayKey)) || 0, send: picked.length, skipped,
        preview: picked.map(({ rec, tokenRec }) => ({ platform: rec.platform, locale: rec.locale, title: trialPushContent(rec, tokenRec?.tz).title, hoursLeft: Math.round((rec.expiresAt - now) / 3600_000) })),
        value: v ? { on: true, candidates: v.candidates, send: v.preview.length, skipped: v.skipped } : { on: false },
        valuePreview: v?.preview ?? [],
        comeback: cb ? { on: true, candidates: cb.candidates, send: cb.preview.length, skipped: cb.skipped, preview: cb.preview } : { on: false } });
    }

    // 자리 잡기(SET NX) → 하루 상한 예약(INCR) → 보내기 직전 기록 재확인 → 보내기
    const items: SignalPushItem[] = [];
    const ownerOf = new Map<string, string | null>();
    const sentExp = new Map<string, number>();
    for (const { token, rec, tokenRec, owner } of picked) {
      if (owner) {
        // 확인된 기록: «지금도 이 고객의 묶인 토큰»인지 확인과 토큰·고객 자리 잡기를 한 번에(겹친 실행·묶음 변경 사이 경합 없음)
        //   ★11/19 같은 고객의 «최근 체험 알림»(20시간) 표식 확인·세우기도 같은 Lua 안에서(겹친 회차의 가치 알림과 하루 두 통 금지 — 관문 11192147)
        const c = Number(await redis.eval(CLAIM_GAP_LUA, [TRIAL_PUSH_SENT_KEY(token), TRIAL_PUSH_SENT_UID_KEY(owner), TRIAL_PUSH_UID_KEY(owner), TRIAL_PUSH_OWNER_KEY(token), TRIAL_PUSH_LAST_UID_KEY(owner)],
          [bindValue(token), String(rec.expiresAt), String(TRIAL_PUSH_SENT_TTL_S), owner, String(TRIAL_PUSH_GAP_S)]));
        if (c === -1) { skip('superseded'); continue; }
        if (c === -2) { skip('recent_push'); continue; }
        if (c !== 1) { skip('sent'); continue; }
      } else {
        const claimed = await redis.set(TRIAL_PUSH_SENT_KEY(token), String(rec.expiresAt), { nx: true, ex: TRIAL_PUSH_SENT_TTL_S });
        if (claimed !== 'OK') { skip('sent'); continue; }
      }
      const fresh = parseRecord<TrialPushRecord>(await redis.get(TRIAL_PUSH_KEY(token)));
      if (trialPushDecision(fresh, tokenRec, now, false) !== 'send' || fresh!.expiresAt !== rec.expiresAt) {
        await redis.del(TRIAL_PUSH_SENT_KEY(token), ...(owner ? [TRIAL_PUSH_SENT_UID_KEY(owner), TRIAL_PUSH_LAST_UID_KEY(owner)] : []));
        skip('changed');
        continue;
      }
      const n = await redis.incr(dayKey);
      if (n === 1) await redis.expire(dayKey, 3 * 86400).catch(() => {});
      if (n > TRIAL_PUSH_MAX_PER_DAY) {
        await redis.del(TRIAL_PUSH_SENT_KEY(token), ...(owner ? [TRIAL_PUSH_SENT_UID_KEY(owner), TRIAL_PUSH_LAST_UID_KEY(owner)] : []));
        skip('day_cap');
        break;
      }
      const content = trialPushContent(fresh!, tokenRec?.tz);
      items.push({ id: token, token, platform: fresh!.platform, title: content.title, body: content.body, data: TRIAL_PUSH_DATA, quiet: false, thread: 'trial_end' });
      ownerOf.set(token, owner); sentExp.set(token, fresh!.expiresAt);
    }
    const out = items.length ? await sendSignalPushes(items) : new Map();
    let sent = 0, failed = 0, dead = 0;
    for (const it of items) {
      const r = out.get(it.id);
      // 보낸 뒤 대상에서 뺀다 — 확인된 기록은 «아직 같은 고객의 토큰»일 때만(발송 중 다른 고객이 이 토큰을 등록했으면 그 대상은 남긴다 — 관문 11121138 ②)
      const own = ownerOf.get(it.token) ?? '';
      const done = () => redis.eval(DROP_DUE_IF_SAME_LUA, [TRIAL_PUSH_OWNER_KEY(it.token), TRIAL_PUSH_DUE_ZSET], [own, it.token, String(sentExp.get(it.token))]);
      if (r === 'ok') { sent++; await done(); }
      else if (r === 'dead') { dead++; await done(); }
      else failed++;   // 실패(응답 유실·시간 초과 포함)도 표식을 «놓지 않는다» — 공급사가 받았는데 응답만 끊긴 경우 두 번 가지 않게(관문 11110931). 한 통 놓치는 쪽을 택한다
    }
    // 걷기(발송 «뒤», 회차당 최대 TRIAL_PUSH_SWEEP_MAX — 정리가 발송 시간을 먹지 않게 · 관문 11121143 ②). 남은 것은 다음 회차에.
    //   그 사이 다시 묶였거나 다른 고객이 이 토큰을 정상 등록했으면 걷지 않는다(Lua)
    for (const { token, owner } of stale.slice(0, TRIAL_PUSH_SWEEP_MAX)) {
      await redis.eval(SWEEP_IF_UNBOUND_LUA, [TRIAL_PUSH_UID_KEY(owner), TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_OWNER_KEY(token)], [bindValue(token), token, owner]).catch(() => {});
    }
    // ★11/19 가치 알림(D-2 뒤 — D-2 가 이번 회차에 고른 고객은 건너뛴다). 실패해도 D-2 결과·통계는 남긴다
    let value: Awaited<ReturnType<typeof runValue>> | null = null;
    if (valueOn) {
      try { value = await runValue(now, false, pickedOwners); } catch (e: any) { console.error('[Cron/TrialPush] value', e?.message || e); }
    }
    // ★11/21 체험 만료 D+1 «다시 시작» 할인 코드(맨 뒤 — 실패해도 앞 결과·통계는 남긴다)
    let comeback: Awaited<ReturnType<typeof runComeback>> | null = null;
    if (comebackOn) {
      try { comeback = await runComeback(now, false, cbCode!); } catch (e: any) { console.error('[Cron/TrialPush] comeback', e?.message || e); }
    }
    const statsKey = `push:stats:trial:${etDay(new Date(now))}`;
    const prev = parseRecord<Record<string, number>>(await redis.get(statsKey)) || {};
    const stats: Record<string, number> = { ...prev, runs: (prev.runs || 0) + 1, candidates: (prev.candidates || 0) + candidates, sent: (prev.sent || 0) + sent, failed: (prev.failed || 0) + failed, dead: (prev.dead || 0) + dead };
    for (const [k, v] of Object.entries(skipped)) stats[`skip_${k}`] = (prev[`skip_${k}`] || 0) + v;
    if (value) {
      const add = (k: string, n: number) => { if (n) stats[k] = (prev[k] || 0) + n; };
      add('v_candidates', value.candidates); add('v_sent', value.sent); add('v_failed', value.failed); add('v_dead', value.dead);
      add('v_sent_d3', value.sentByStep.d3); add('v_sent_d6', value.sentByStep.d6);
      for (const [k, v] of Object.entries(value.skipped)) add(`v_skip_${k}`, v);
    }
    if (comeback) {
      const add = (k: string, n: number) => { if (n) stats[k] = (prev[k] || 0) + n; };
      add('c_candidates', comeback.candidates); add('c_sent', comeback.sent); add('c_failed', comeback.failed); add('c_dead', comeback.dead);
      for (const [k, v] of Object.entries(comeback.skipped)) add(`c_skip_${k}`, v);
    }
    await redis.set(statsKey, JSON.stringify(stats), { ex: 60 * 86400 });
    return NextResponse.json({ ok: true, candidates, sent, failed, dead, skipped,
      value: value ? { on: true, candidates: value.candidates, sent: value.sent, failed: value.failed, dead: value.dead, sentByStep: value.sentByStep, skipped: value.skipped } : { on: valueOn },
      comeback: comeback ? { on: true, candidates: comeback.candidates, sent: comeback.sent, failed: comeback.failed, dead: comeback.dead, skipped: comeback.skipped } : { on: comebackOn } });
  } catch (e: any) {
    console.error('[Cron/TrialPush]', e?.message || e);
    return NextResponse.json({ ok: false, error: 'trial push failed' }, { status: 500 });
  }
}

/**
 * ★11/19 체험 중 가치 알림(3일째·6일째) — 대상 목록을 쪽(1000)씩 최대 5쪽 읽어 lib/push/trialValuePush.trialValueDecision 으로 거른 뒤 한 통씩.
 *   확인된 기록만 · «그 고객의 지금 토큰»일 때만 · 고객당 단계별 한 번 · 같은 고객 20시간 안 체험 알림이 있으면 건너뜀(D-2 와 하루 두 통 금지).
 *   자리 잡기(CLAIM_GAP_LUA: 묶음 확인 + 토큰·고객 보냄 표식 + 최근 표식을 한 번에) → 기록 재확인 → 하루 상한 예약(INCR) → 보내기.
 *   실패(응답 유실 포함)도 표식을 놓지 않는다(D-2 와 같은 원칙 — 중복보다 한 통 누락). dry 면 표식·통계 없이 미리보기만.
 */
async function runValue(now: number, dry: boolean, d2Owners: Set<string>) {
  const skipped: Record<string, number> = {};
  const skip = (k: string) => { skipped[k] = (skipped[k] || 0) + 1; };
  if (!dry) await redis.zremrangebyscore(TRIAL_VALUE_ZSET, 0, now);
  type ValuePick = { token: string; rec: TrialPushRecord; tokenRec: TokenRec | null; owner: string; step: TrialValueStep };
  const picked: ValuePick[] = [];
  const pickedOwners = new Set<string>();
  const stale: Array<{ token: string; owner: string }> = [];
  let candidates = 0;
  for (let page = 0; page < TRIAL_VALUE_SCAN_PAGES && picked.length < TRIAL_VALUE_MAX_PER_RUN; page++) {
    const tokens = ((await redis.zrange(TRIAL_VALUE_ZSET, now, now + TRIAL_VALUE_MAX_LEN_MS + 86400_000,
      { byScore: true, offset: page * TRIAL_VALUE_SCAN_LIMIT, count: TRIAL_VALUE_SCAN_LIMIT })) || []) as string[];
    candidates += tokens.length;
    for (let i = 0; i < tokens.length && picked.length < TRIAL_VALUE_MAX_PER_RUN; i += 50) {
      const chunk = tokens.slice(i, i + 50);
      const [trialRaw, tokenRaw, ownerRaw, sentD3, sentD6] = await Promise.all([
        redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_KEY(t))),
        redis.mget<unknown[]>(...chunk.map((t) => `push:tokens:${t}`)),
        redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_OWNER_KEY(t))),
        redis.mget<unknown[]>(...chunk.map((t) => TRIAL_VALUE_SENT_KEY('d3', t))),
        redis.mget<unknown[]>(...chunk.map((t) => TRIAL_VALUE_SENT_KEY('d6', t))),
      ]);
      const owners = ownerRaw.map((o) => (o == null ? null : String(o)));
      const ownerList = [...new Set(owners.filter((o): o is string => !!o))];
      const [boundRaw, uidD3, uidD6, lastRaw] = ownerList.length ? await Promise.all([
        redis.mget<unknown[]>(...ownerList.map((o) => TRIAL_PUSH_UID_KEY(o))),
        redis.mget<unknown[]>(...ownerList.map((o) => TRIAL_VALUE_SENT_UID_KEY('d3', o))),
        redis.mget<unknown[]>(...ownerList.map((o) => TRIAL_VALUE_SENT_UID_KEY('d6', o))),
        redis.mget<unknown[]>(...ownerList.map((o) => TRIAL_PUSH_LAST_UID_KEY(o))),
      ]) : [[], [], [], []];
      const bound = new Map(ownerList.map((o, k) => [o, boundToken(boundRaw[k])]));
      const sentUid = { d3: new Map(ownerList.map((o, k) => [o, uidD3[k] != null])), d6: new Map(ownerList.map((o, k) => [o, uidD6[k] != null])) };
      const last = new Map(ownerList.map((o, k) => [o, lastRaw[k] != null]));
      for (let j = 0; j < chunk.length; j++) {
        const token = chunk[j];
        if (picked.length >= TRIAL_VALUE_MAX_PER_RUN) { skip('run_cap'); continue; }
        const rec = parseRecord<TrialPushRecord>(trialRaw[j]);
        const tokenRec = parseRecord<TokenRec>(tokenRaw[j]);
        const owner = rec?.verified === true ? owners[j] : null;
        if (rec?.verified === true && (!owner || bound.get(owner) !== token)) {
          skip('superseded');
          if (owner) stale.push({ token, owner });
          continue;
        }
        const sentTok = { d3: sentD3[j] != null, d6: sentD6[j] != null };
        const d = trialValueDecision(rec, tokenRec as TrialValueTokenRec | null, now, {
          sent: (st) => sentTok[st] || (!!owner && sentUid[st].get(owner) === true),
          recentPush: !!owner && (last.get(owner) === true || d2Owners.has(owner) || pickedOwners.has(owner)),
        });
        if (d.kind !== 'send' || !rec || !owner) { skip(d.kind === 'skip' ? d.reason : 'unverified'); continue; }
        pickedOwners.add(owner);
        picked.push({ token, rec, tokenRec, owner, step: d.step });
      }
    }
    if (tokens.length < TRIAL_VALUE_SCAN_LIMIT) break;
  }
  const preview = picked.map(({ rec, tokenRec, step }) => {
    const c = trialValueContent(step, rec.locale, tokenRec as TrialValueTokenRec | null);
    return { step, variant: c.variant, platform: rec.platform, locale: rec.locale, title: c.title, dayOfTrial: Math.floor((now - (rec.startedAt as number)) / 86400_000) + 1 };
  });
  const sentByStep = { d3: 0, d6: 0 };
  if (dry) return { candidates, sent: 0, failed: 0, dead: 0, sentByStep, skipped, preview };

  const dayKey = TRIAL_VALUE_DAY_KEY(etDay(new Date(now)));
  const items: SignalPushItem[] = [];
  const stepOf = new Map<string, TrialValueStep>();
  for (const { token, rec, tokenRec, owner, step } of picked) {
    const keys = [TRIAL_VALUE_SENT_KEY(step, token), TRIAL_VALUE_SENT_UID_KEY(step, owner), TRIAL_PUSH_UID_KEY(owner), TRIAL_PUSH_OWNER_KEY(token), TRIAL_PUSH_LAST_UID_KEY(owner)];
    const c = Number(await redis.eval(CLAIM_GAP_LUA, keys, [bindValue(token), String(rec.expiresAt), String(TRIAL_VALUE_SENT_TTL_S), owner, String(TRIAL_PUSH_GAP_S)]));
    if (c === -1) { skip('superseded'); continue; }
    if (c === -2) { skip('recent_push'); continue; }
    if (c !== 1) { skip('sent'); continue; }
    const release = () => redis.del(keys[0], keys[1], keys[4]);
    const fresh = parseRecord<TrialPushRecord>(await redis.get(TRIAL_PUSH_KEY(token)));
    const again = trialValueDecision(fresh, tokenRec as TrialValueTokenRec | null, now, { sent: () => false, recentPush: false });
    if (again.kind !== 'send' || again.step !== step || fresh!.expiresAt !== rec.expiresAt) {
      await release();
      skip('changed');
      continue;
    }
    const n = await redis.incr(dayKey);
    if (n === 1) await redis.expire(dayKey, 3 * 86400).catch(() => {});
    if (n > TRIAL_VALUE_MAX_PER_DAY) {
      await release();
      skip('day_cap');
      break;
    }
    const content = trialValueContent(step, fresh!.locale, tokenRec as TrialValueTokenRec | null);
    items.push({ id: token, token, platform: fresh!.platform, title: content.title, body: content.body, data: trialValueData(content.variant), quiet: false, thread: 'trial_value' });
    stepOf.set(token, step);
  }
  const out = items.length ? await sendSignalPushes(items) : new Map();
  let sent = 0, failed = 0, dead = 0;
  for (const it of items) {
    const r = out.get(it.id);
    if (r === 'ok') { sent++; sentByStep[stepOf.get(it.token)!]++; }
    else if (r === 'dead') dead++;
    else failed++;   // 표식을 놓지 않는다(D-2 와 같은 원칙)
  }
  // 고객의 지금 토큰이 아닌 항목 걷기(발송 뒤 · 그 사이 다시 묶였으면 걷지 않는다 — D-2 와 같은 Lua)
  for (const { token, owner } of stale.slice(0, TRIAL_PUSH_SWEEP_MAX)) {
    await redis.eval(SWEEP_IF_UNBOUND_LUA, [TRIAL_PUSH_UID_KEY(owner), TRIAL_VALUE_ZSET, TRIAL_PUSH_OWNER_KEY(token)], [bindValue(token), token, owner]).catch(() => {});
  }
  return { candidates, sent, failed, dead, sentByStep, skipped, preview };
}

/**
 * ★11/21 체험 만료 D+1 «다시 시작» 할인 코드 푸시(lib/push/comebackPush) — 만료 +24~72시간 창의 대상(RC 고객 해시)을 읽어
 *   규칙(comebackDecision)으로 거른 뒤, 한 명씩: RC 재확인(활성 권한·유료 이력 없음 · 해지 뒤 만료) → 자리 잡기(COMEBACK_CLAIM_LUA: 대상 항목 남음 + 묶음·주인 확인
 *   + 고객·토큰 1회 표식 + 20시간 표식) → 하루 상한 예약(INCR) → 바로 그 한 통 발송(RC 확인과 발송 사이를 짧게 — 관문 11210848 ③).
 *   실패(응답 유실 포함)도 표식을 놓지 않는다. RC 호출은 회차당 COMEBACK_RC_MAX · RC 실패 2번이면 이번 회차 중단 · 시간 예산 20초(관문 11210848 ⑤).
 *   dry 면 표식·통계·목록 변경 없이 대상 수·이유·미리보기만(RC 읽기는 한다).
 */
const COMEBACK_RC_MAX = 30;
const COMEBACK_BUDGET_MS = 20_000;
async function runComeback(now: number, dry: boolean, code: string) {
  const t0 = performance.now();
  const skipped: Record<string, number> = {};
  const skip = (k: string) => { skipped[k] = (skipped[k] || 0) + 1; };
  if (!dry) await redis.zremrangebyscore(COMEBACK_ZSET, 0, now - COMEBACK_MAX_AFTER_MS - 1);
  const uhs = ((await redis.zrange(COMEBACK_ZSET, now - COMEBACK_MAX_AFTER_MS, now - COMEBACK_MIN_AFTER_MS, { byScore: true, offset: 0, count: 1000 })) || []) as string[];
  const candidates = uhs.length;
  const secret = process.env.RC_COHORT_HMAC_SECRET || '';
  type Ready = { uh: string; token: string; tokenRec: ComebackTokenRec; sealed: string; sf: ComebackEntry['sf']; cc: boolean };
  const ready: Ready[] = [];
  const drop: string[] = [];
  for (let i = 0; i < uhs.length && ready.length < COMEBACK_MAX_PER_RUN; i += 50) {
    const chunk = uhs.slice(i, i + 50);
    const [entryRaw, bindRaw, sentRaw, lastRaw] = await Promise.all([
      redis.mget<unknown[]>(...chunk.map((u) => COMEBACK_ENTRY_KEY(u))),
      redis.mget<unknown[]>(...chunk.map((u) => TRIAL_PUSH_UID_KEY(u))),
      redis.mget<unknown[]>(...chunk.map((u) => COMEBACK_SENT_UID_KEY(u))),
      redis.mget<unknown[]>(...chunk.map((u) => TRIAL_PUSH_LAST_UID_KEY(u))),
    ]);
    const tokens = bindRaw.map((b) => boundToken(b));
    const live = tokens.filter((t): t is string => !!t);
    const [tokRaw, sentTokRaw, ownRaw] = live.length ? await Promise.all([
      redis.mget<unknown[]>(...live.map((t) => `push:tokens:${t}`)),
      redis.mget<unknown[]>(...live.map((t) => COMEBACK_SENT_TOKEN_KEY(t))),
      redis.mget<unknown[]>(...live.map((t) => TRIAL_PUSH_OWNER_KEY(t))),
    ]) : [[], [], []];
    const tokOwner = new Map(live.map((t, k) => [t, ownRaw[k] == null ? null : String(ownRaw[k])]));
    const tokRec = new Map(live.map((t, k) => [t, parseRecord<ComebackTokenRec>(tokRaw[k])]));
    const tokSent = new Map(live.map((t, k) => [t, sentTokRaw[k] != null]));
    for (let j = 0; j < chunk.length; j++) {
      if (ready.length >= COMEBACK_MAX_PER_RUN) { skip('run_cap'); continue; }
      const uh = chunk[j];
      const entry = parseEntry(entryRaw[j]);
      // 묶인 토큰의 체험 기록 주인이 이 고객이 아니면(없음 포함 — 기기를 이어 쓰는 경우) 묶인 토큰이 없는 것으로 본다
      const token = tokens[j] && tokOwner.get(tokens[j]!) === uh ? tokens[j] : null;
      const tr = token ? tokRec.get(token) ?? null : null;
      const d = comebackDecision(entry, token, tr, now, { sent: sentRaw[j] != null || (!!token && tokSent.get(token) === true), recentPush: lastRaw[j] != null });
      if (d !== 'send') {
        skip(d);
        // 'sent'·'unbound' 는 지우지 않는다(unbound — 같은 고객이 곧 새 토큰으로 다시 묶일 수 있다 · 관문 11210906) — 겹친 회차가 막 자리를 잡고 보내는 중일 수 있다(그 회차가 보낸 뒤 지운다 · 남은 것은 72시간 창이 걷는다 — 관문 11210903)
        if (d === 'invalid' || d === 'unregistered' || d === 'not_ios' || d === 'muted' || d === 'no_permission' || d === 'storefront' || d === 'code_closed') drop.push(uh);
        continue;
      }
      ready.push({ uh, token: token!, tokenRec: tr!, sealed: entry!.u, sf: entry!.sf, cc: entry!.cc === true });
    }
  }
  const preview: Array<{ locale: string | null; storefront: string | null; title: string | null }> = [];
  const dayKey = COMEBACK_DAY_KEY(etDay(new Date(now)));
  let sent = 0, failed = 0, dead = 0, rcCalls = 0, rcFails = 0;
  const forget = async (uh: string) => { await redis.zrem(COMEBACK_ZSET, uh); await redis.del(COMEBACK_ENTRY_KEY(uh)); };
  if (!dry) for (const uh of drop) await forget(uh);   // 다시 볼 필요 없는 대상(보냄·권한 없음 등 — RC 장애·현지 시간·최근 실행은 남긴다)
  const left = () => COMEBACK_BUDGET_MS - (performance.now() - t0);
  for (const { uh, token, tokenRec, sealed, sf, cc } of ready) {
    // 시간 예산: RC 요청은 남은 시간 안에서만(최대 3초) · 발송 단계도 예산을 넘기면 다음 회차로(관문 11210848 ⑤·11210854 ④)
    if (rcCalls >= COMEBACK_RC_MAX || rcFails >= 2 || left() < 1000) { skip('deferred'); continue; }
    const uid = openUid(sealed, secret);
    if (!uid) { skip('no_secret'); continue; }
    rcCalls++;
    const v = await readComebackRc(uid, process.env.NEXT_PUBLIC_RC_IOS_KEY, now, sf, cc, fetch, Math.min(3000, left()));
    if (v === 'rc_unavailable') { rcFails++; skip(v); continue; }
    if (v !== 'eligible') { skip(v); if (!dry) await forget(uh); continue; }
    const content = comebackContent(tokenRec, code, sf);
    if (!content) { skip('storefront'); if (!dry) await forget(uh); continue; }
    if (left() < 500) { skip('deferred'); continue; }
    if (dry) { preview.push({ locale: tokenRec.locale ?? null, storefront: content.storefront, title: content.title }); continue; }
    const keys = [COMEBACK_SENT_UID_KEY(uh), COMEBACK_SENT_TOKEN_KEY(token), TRIAL_PUSH_LAST_UID_KEY(uh), TRIAL_PUSH_UID_KEY(uh), COMEBACK_ENTRY_KEY(uh), TRIAL_PUSH_OWNER_KEY(token)];
    const c = Number(await redis.eval(COMEBACK_CLAIM_LUA, keys, [bindValue(token), String(COMEBACK_SENT_TTL_S), String(TRIAL_PUSH_GAP_S), String(now), uh]));
    if (c === -3) { skip('cancelled'); continue; }
    if (c === -1) { skip('unbound'); continue; }   // 지우지 않는다 — 같은 고객이 새 토큰으로 다시 묶였으면 다음 회차에 새 토큰으로(묶음이 없으면 읽기 단계가 지운다 · 관문 11210904)
    if (c === -2) { skip('recent_push'); continue; }
    if (c !== 1) { skip('sent'); continue; }   // 겹친 회차가 먼저 잡았다 — 그 회차가 보내고 지운다(여기서 지우면 그쪽 재확인이 취소된다 · 관문 11210900 ②)
    const n = await redis.incr(dayKey);
    if (n === 1) await redis.expire(dayKey, 3 * 86400).catch(() => {});
    if (n > COMEBACK_MAX_PER_DAY) { await redis.del(keys[0], keys[1], keys[2]); skip('day_cap'); break; }
    // 자리 잡은 뒤 한 번 더 — 그 사이 재결제 웹훅이 대상을 지웠으면 보내지 않는다(표식은 남긴다 — 결제자라 다시 볼 일 없음 · 관문 11210854 ③)
    if ((await redis.get(COMEBACK_ENTRY_KEY(uh))) == null) { skip('cancelled'); continue; }
    const item: SignalPushItem = { id: token, token, platform: 'ios', title: content.title, body: content.body, data: comebackPushData(code), quiet: false, thread: 'comeback' };
    const r = (await sendSignalPushes([item])).get(token);
    if (r === 'ok') sent++; else if (r === 'dead') dead++; else failed++;   // 표식을 놓지 않는다(중복보다 누락)
    preview.push({ locale: tokenRec.locale ?? null, storefront: content.storefront, title: content.title });
    await forget(uh);
  }
  return { candidates, sent, failed, dead, skipped, preview };
}
