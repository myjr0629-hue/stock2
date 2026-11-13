/**
 * «실적 발표 직후» 알림 — 운영 배선(lib/signals/earningsFlash 실행기에 저장소·읽기·발송을 꽂는다).
 *
 *   · 기기·장부·상한·모드      Upstash(무료 신호와 같은 어댑터 upstashStore · 키는 push:sig:flash:* 만)
 *   · 예상값 뜨기            services/impliedMoveService.readImpliedMoveRows — 실적 D-1 알림·실적 캘린더와 같은 읽기(저장본만 · 공급사 호출 0)
 *   · 예상값 예비            services/earningsActualsService.readActualRecords — earnings:actuals 기록의 expected(읽기만)
 *   · 시세                   services/intrinioClient.getTickerSnapshot — 앱 Command 와 같은 문(Intrinio · 시간외는 15분 지연 피드 · FMP 쓰지 않음)
 *                            회차당 6종목 · 하루 실호출 400(원자 예약 · 예약 못 하면 부르지 않는다) · 이미 고정된 발표는 다시 읽지 않는다
 *   · 발송                   lib/push/sendSignal.sendSignalPushes(무료 신호와 같은 APNs·FCM 경로)
 * 끄는 법(재배포 없이): GET /api/cron/earnings-flash?mode=off (Bearer CRON_SECRET) → push:sig:flash:mode='off'.
 *   환경변수 EARNINGS_FLASH_MODE=off · 무료 신호 비상 끄기(WL_SIGNALS_MODE=off · push:sig:mode='off')도 이 알림을 끈다.
 */
import 'server-only';
import { Redis } from '@upstash/redis';
import { readImpliedMoveRows } from '@/services/impliedMoveService';
import { readActualRecords, recordMapKey } from '@/services/earningsActualsService';
import { getTickerSnapshot } from '@/services/intrinioClient';
import { sendSignalPushes } from '@/lib/push/sendSignal';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { ec2Kv, envMode as signalEnvMode, upstashStore } from '@/services/signalAlertsService';
import {
  FLASH_KEYS, flashEnvMode, quoteFromSnapshot, resolveFlashMode, runEarningsFlash,
  type FlashDeps, type FlashOpts, type FlashReaders, type FlashReport, type FlashReserve, type ImpliedRowLike,
} from '@/lib/signals/earningsFlash';
import { SIG_KEYS } from '@/lib/signals/plan';
import type { SigMode } from '@/lib/signals/run';

export const prodFlashReaders: FlashReaders = {
  async implied(entries, today) {
    const rows = await readImpliedMoveRows(entries.map((e) => ({ ticker: e.ticker, after: e.date, timing: e.hour })), today);
    const out = new Map<string, ImpliedRowLike>();
    rows.forEach((r) => out.set(r.ticker, { impliedMovePct: r.impliedMovePct, expiry: r.expiry, asOf: r.asOf, session: r.session, basis: r.basis }));
    return out;
  },
  async actuals(entries) {
    const recs = await readActualRecords(entries);
    const out = new Map<string, unknown>();
    for (const e of entries) { const r = recs.get(recordMapKey(e.ticker, e.date)); if (r) out.set(`${e.ticker}|${e.date}`, r); }
    return out;
  },
  async quote(ticker, deadlineMs) {
    const left = deadlineMs - Date.now();
    if (left <= 1000) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const snap = await Promise.race([
      getTickerSnapshot(ticker).catch(() => null),
      new Promise<null>((res) => { timer = setTimeout(() => res(null), left); }),
    ]).finally(() => clearTimeout(timer));
    return quoteFromSnapshot(snap);
  },
};

let _redis: Redis | null = null;
const redis = () => (_redis ??= Redis.fromEnv());

/** 하루 계량 원자 예약 — n 만큼 올리고 상한을 넘은 만큼 돌려준 뒤 실제로 잡은 수 */
export function flashReserve(r: Redis = redis()): FlashReserve {
  return async (key, n, cap) => {
    if (n <= 0) return 0;
    const after = Number(await r.incrby(key, n));
    await r.expire(key, 2 * 86400);
    if (!Number.isFinite(after)) return 0;
    const over = Math.max(0, after - cap);
    if (over > 0) await r.decrby(key, Math.min(over, n));
    return Math.max(0, n - over);
  };
}

/**
 * getTickerSnapshot 1회의 최대 실호출 — 기본 실시간·일봉 각각 INTRINIO_MAX_ATTEMPTS 회 + 정규장 덧입힘(같은 재시도) 또는 시간외 SIP(≤2).
 * 운영 재시도 설정이 올라가도 하루 상한(400)이 실제 호출을 묶게 예약 단위를 키운다(관문 11140731-3 #2).
 */
export function flashCallsPerQuote(env: Record<string, string | undefined> = process.env): number {
  const a = Number(env.INTRINIO_MAX_ATTEMPTS || 2);
  return 3 * Math.max(2, Number.isFinite(a) ? Math.ceil(a) : 2);
}

export function prodFlashDeps(): FlashDeps {
  return { store: upstashStore(), kv: ec2Kv, readers: prodFlashReaders, sender: { send: sendSignalPushes }, reserve: flashReserve() };
}

export async function runEarningsFlashProd(o: Omit<FlashOpts, 'now' | 'list' | 'envMode' | 'signalEnvMode'> & { now?: number }): Promise<FlashReport> {
  return runEarningsFlash(prodFlashDeps(), { ...o, now: o.now ?? Date.now(), list: CONFIRMED_EARNINGS, envMode: flashEnvMode(), signalEnvMode: signalEnvMode(), vendorCallsPerQuote: flashCallsPerQuote() });
}

/** 모드 바꾸기 — 키 하나(push:sig:flash:mode). live 는 키를 지운다(기본값) */
export async function setFlashMode(mode: SigMode): Promise<void> {
  const store = upstashStore();
  if (mode === 'live') await store.del([FLASH_KEYS.mode]);
  else await store.set(FLASH_KEYS.mode, mode);
}

export async function readFlashMode(): Promise<{ env: SigMode | null; redis: string | null; signal: string | null; effective: SigMode }> {
  const store = upstashStore();
  const [v, s] = await Promise.all([store.get(FLASH_KEYS.mode).catch(() => null), store.get(SIG_KEYS.mode).catch(() => null)]);
  return { env: flashEnvMode(), redis: typeof v === 'string' ? v : null, signal: typeof s === 'string' ? s : null, effective: resolveFlashMode(flashEnvMode(), v, signalEnvMode(), s) };
}
