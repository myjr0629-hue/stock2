// ============================================================================
// Intrinio «호출 계측» — 흐름 이름(label)별로 벤더에 실제 나간 호출·429 와 배경 갱신 관문의 판단을 시간대·분 단위로 센다 (2026-10-13)
// ----------------------------------------------------------------------------
// 왜: 429 계측(intrinioMeter)은 «받은 429»만 센다(사전 갱신 w / 그 밖 u). «누가 얼마나 불렀는가»는 로그 줄 수(요청당 256줄 상한)로 짐작할 수밖에 없었다.
//   → 흐름 이름별 «나간 호출 수 · 429 수 · 갱신 횟수»와 관문의 판단(건너뜀 사유)을 세어, 전·후를 같은 표로 비교한다.
// 어떻게(intrinioMeter 와 같은 규칙): 메모리에 모았다가 한 번에 쓴다(사용자 경로 지연 0) · 던지지 않는다 · 키는 Upstash 직접.
//   i429 와 접두사가 다르다 — 키: ic:h:{YYYYMMDDHH}(7일) · ic:m:{epochMinute}(3시간). 필드: `{label}|{ok|429|err|runs|...}`.
//   label 이 'other'(계측 이름이 없는 흐름)인 정상 응답은 세지 않는다(Upstash 명령 수를 줄이려고) — 429·오류는 센다.
// ============================================================================
import { upstashMeterStore, normalizeHash, type MeterStore } from '@/lib/intrinioMeter';

export const CALL_HOUR_TTL_SEC = 7 * 24 * 3600;
export const CALL_MINUTE_TTL_SEC = 3 * 3600;
const FLUSH_MS = 400;

export const callHourKey = (ms: number) => `ic:h:${new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '')}`;
export const callMinuteKey = (ms: number) => `ic:m:${Math.floor(ms / 60000)}`;

// (읽기 정규화 normalizeHash 는 intrinioMeter 에 있다 — Upstash HGETALL 은 배열로 온다. 시험 저장소가 객체를 돌려줘도 같은 정규화를 지난다.)
export { normalizeHash };
export interface CallStore { hincrbyEx: MeterStore['hincrbyEx']; hgetall(key: string): Promise<Record<string, number>>; }
const upstashCallStore: CallStore = {
  hincrbyEx: (k, f, by, ttl) => upstashMeterStore.hincrbyEx(k, f, by, ttl),
  hgetall: (k) => upstashMeterStore.hgetall(k),
};

let store: CallStore = upstashCallStore;
/** 시험 전용 — 저장소를 바꾼다(되돌릴 땐 인자 없이) */
export function __setCallMeterStore(s?: CallStore): void { store = s ? { hincrbyEx: s.hincrbyEx.bind(s), hgetall: async (k) => normalizeHash(await (s as any).hgetall(k)) } : upstashCallStore; }

const pending = new Map<string, number>();   // `${key}\u0000${field}` → 건수
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  flushTimer = null;
  const items = [...pending.entries()];
  pending.clear();
  for (const [kf, n] of items) {
    const [key, field] = kf.split('\u0000');
    const ttl = key.startsWith('ic:h:') ? CALL_HOUR_TTL_SEC : CALL_MINUTE_TTL_SEC;
    try { await store.hincrbyEx(key, field, n, ttl); } catch { /* 계측 실패는 아무에게도 닿지 않는다 */ }
  }
}

/** 시험·종료 전용 — 모아 둔 것을 지금 쓴다 */
export async function flushCallMeterNow(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  await flush();
}

/** 임의의 사건 하나를 센다 — 기다리지 않고 던지지 않는다. */
export function noteEvent(label: string, event: string, now: number = Date.now()): void {
  try {
    const field = `${label}|${event}`;
    for (const key of [callHourKey(now), callMinuteKey(now)]) {
      const kf = `${key}\u0000${field}`;
      pending.set(kf, (pending.get(kf) ?? 0) + 1);
    }
    if (!flushTimer) {
      flushTimer = setTimeout(() => { void flush(); }, FLUSH_MS);
      (flushTimer as any)?.unref?.();
    }
  } catch { /* 계측이 호출을 깨뜨리지 않는다 */ }
}

/** 벤더 호출 하나의 결과를 센다(callIntrinio 가 fetch 뒤에 부른다). */
export function noteCall(label: string, status: number | 'err'): void {
  const cls = status === 'err' ? 'err' : status === 429 ? '429' : status >= 200 && status < 300 ? 'ok' : 'err';
  if (label === 'other' && cls === 'ok') return;
  noteEvent(label, cls);
}

export type CallMeterRow = { label: string; ok: number; r429: number; err: number; runs: number; events: Record<string, number> };

/** [fromMs, toMs] 를 덮는 분 버킷 합(최대 240분) — 라벨별 */
export async function readCallMinutes(fromMs: number, toMs: number): Promise<CallMeterRow[]> {
  const acc = new Map<string, CallMeterRow>();
  const a = Math.floor(fromMs / 60000), b = Math.floor(toMs / 60000);
  for (let m = a; m <= b && m - a < 240; m++) addFields(acc, await store.hgetall(`ic:m:${m}`).catch(() => ({} as Record<string, number>)));
  return [...acc.values()].sort((x, y) => (y.ok + y.r429) - (x.ok + x.r429));
}

/** 최근 hours 시간의 시간대별(UTC) 합 — 오래된 순 */
export async function readCallHours(now: number = Date.now(), hours = 24): Promise<Array<{ hourUtc: string; rows: CallMeterRow[] }>> {
  const out: Array<{ hourUtc: string; rows: CallMeterRow[] }> = [];
  const top = Math.floor(now / 3600000) * 3600000;
  for (let i = Math.min(Math.max(1, hours), 168) - 1; i >= 0; i--) {
    const t = top - i * 3600000;
    const acc = new Map<string, CallMeterRow>();
    addFields(acc, await store.hgetall(callHourKey(t)).catch(() => ({} as Record<string, number>)));
    out.push({ hourUtc: new Date(t).toISOString().slice(0, 13) + 'Z', rows: [...acc.values()].sort((x, y) => (y.ok + y.r429) - (x.ok + x.r429)) });
  }
  return out;
}

/** 최근 minutes 분의 분 단위 합 — 오래된 순(최대 180분) */
export async function readCallMinuteSeries(now: number = Date.now(), minutes = 60): Promise<Array<{ minuteUtc: string; rows: CallMeterRow[] }>> {
  const out: Array<{ minuteUtc: string; rows: CallMeterRow[] }> = [];
  const top = Math.floor(now / 60000);
  for (let i = Math.min(Math.max(1, minutes), 180) - 1; i >= 0; i--) {
    const m = top - i;
    const acc = new Map<string, CallMeterRow>();
    addFields(acc, await store.hgetall(`ic:m:${m}`).catch(() => ({} as Record<string, number>)));
    if (acc.size) out.push({ minuteUtc: new Date(m * 60000).toISOString().slice(0, 16) + 'Z', rows: [...acc.values()].sort((x, y) => (y.ok + y.r429) - (x.ok + x.r429)) });
  }
  return out;
}

function addFields(acc: Map<string, CallMeterRow>, h: Record<string, number>): void {
  for (const [f, n] of Object.entries(h)) {
    const i = f.lastIndexOf('|');
    if (i < 0) continue;
    const label = f.slice(0, i), ev = f.slice(i + 1);
    const row = acc.get(label) ?? { label, ok: 0, r429: 0, err: 0, runs: 0, events: {} };
    if (ev === 'ok') row.ok += n; else if (ev === '429') row.r429 += n; else if (ev === 'err') row.err += n; else if (ev === 'runs') row.runs += n; else row.events[ev] = (row.events[ev] ?? 0) + n;
    acc.set(label, row);
  }
}
