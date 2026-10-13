// ============================================================================
// /api/intel/fast «배경 갱신 관문» (2026-10-13) — 예열·응답 뒤 갱신이 Intrinio 한도를 태우지 않게 한다
// ----------------------------------------------------------------------------
// 실측(10/12 24시간, 운영 로그·CloudWatch):
//   · /api/intel/fast 3,496건 중 사람 요청은 7건 — 나머지는 우리 예열이다: 앱 예열 크론 2,160 · 목록 갱신(fast-all) 700 · 크론 signum-warm 614.
//   · Intrinio 429 로그 줄의 80%가 이 경로였고, 군집은 분 5·20·35·50 에만 났다(15분 주기). 수집 Lambda(signum-harvest)가 :02:54 에 시작해 15분마다
//     «최근 60초 최대 2,399회»(계약 분당 2,000)까지 올라 3~5분 동안 계정 한도를 바닥내는데, 그 안에서 우리 예열이 섹터 10곳을 같은 초에 따로 띄워
//     한 번에 수백 콜을 쏘고, 429 를 받으면 callIntrinio 가 한 번 더 묻는다.
// 고친 것(여기): 배경 갱신(refresh=1 · 응답 뒤 갱신)만 아래 관문을 지난다. 사용자 요청이 «계산을 기다리는» 경로는 한 줄도 달라지지 않는다.
//   ① 같은 키는 25초에 한 번만(진입점이 셋이어도 한 번) — 원자적 SET NX.
//   ② 지금 예산이 바닥이면(직전 60초 안에 429 · 또는 벤더에 1콜 물어 429) 건너뛴다 — 정상본은 그대로 남는다.
//      건너뜀의 상한: 정상본 나이가 허용 나이의 60%(최대 15분)에 닿으면 «그래도 한다»(신선도가 나빠지는 것을 막는 안전선).
//   ③ 429 를 받은 갱신은 정상본을 덮지 않는다 — 한도에 막힌 갱신은 마지막 정상값으로 메운 값이라 «갱신된 것처럼» 시각만 새로 찍힌다.
//   ④ 갱신 흐름 안에서 429 를 받으면 다시 묻지 않고, 처음 받은 순간부터 그 흐름의 나머지 호출을 보내지 않는다(lib/intrinioBackground).
// 끄는 스위치: Redis(Upstash) 키 `intel-fast-429:off` 하나(값이 있으면 전부 «예전 그대로»). 설정/해제: POST /api/admin/intel-fast-meter {action:'off', on:true|false}.
// ============================================================================
import { upstashMeterStore, userRecent429, note429, type MeterStore, type User429State } from '@/lib/intrinioMeter';
import { noteEvent } from '@/lib/intrinioCallMeter';

export const GOV_OFF_KEY = 'intel-fast-429:off';
export const FLIGHT_PREFIX = 'intel-fast-429:flight:';
export const PROBE_KEY = 'intel-fast-429:probe';
export const PROBE_LOCK_KEY = 'intel-fast-429:probing';
/** 같은 키의 배경 갱신은 이 간격에 한 번(시작 기준) */
export const FLIGHT_TTL_SEC = 25;
/** 스위치 읽기 인스턴스 메모 */
export const SWITCH_MEMO_MS = 30_000;
/** 벤더 1콜 점검 결과를 나눠 쓰는 시간 */
export const PROBE_FRESH_MS = 15_000;
/** 정상본 나이가 허용 나이의 이 비율에 닿으면 «건너뜀»을 접고 갱신한다 */
export const SKIP_AGE_FRACTION = 0.6;
/** 건너뜀을 허용하는 정상본 나이의 절대 상한 */
export const SKIP_AGE_CAP_MS = 15 * 60_000;

export type GovWhy = 'switch-off' | 'no-envelope' | 'ok' | 'age-override' | 'flight' | 'hot-429' | 'hot-probe';
export type GovDecision = { run: boolean; why: GovWhy };
export type ProbeResult = 'ok' | 'hot' | 'unknown';

export type GovDeps = {
  store: MeterStore;
  now: () => number;
  recent429: (now: number) => Promise<{ state: User429State }>;
  probe: (store: MeterStore, now: () => number) => Promise<ProbeResult>;
};

let switchMemo: { at: number; off: boolean } | null = null;
export function _resetGovernorMemoForTest(): void { switchMemo = null; }

/** 스위치가 켜져(= 관문이 꺼져) 있는가. 읽기에 실패하면 «관문 켜짐»으로 본다(저장소 장애가 개선을 끄지 않는다). */
export async function governorOff(d: Pick<GovDeps, 'store' | 'now'> = deps): Promise<boolean> {
  const t = d.now();
  if (switchMemo && t - switchMemo.at < SWITCH_MEMO_MS) return switchMemo.off;
  let off = false;
  try { off = !!(await d.store.get(GOV_OFF_KEY)); } catch { off = false; }
  switchMemo = { at: t, off };
  return off;
}

/** 스위치를 바꾼 직후 같은 인스턴스가 바로 보도록 메모를 비운다 */
export function resetGovernorSwitchMemo(): void { switchMemo = null; }

/** 건너뜀을 허용하는 정상본 나이 상한(ms) — 허용 나이의 60%, 최대 15분 */
export function skipAgeLimitMs(maxStaleMs: number): number {
  return Math.min(Math.max(0, maxStaleMs) * SKIP_AGE_FRACTION, SKIP_AGE_CAP_MS);
}

/** 벤더에 1콜 물어 지금 예산이 있는지 본다(결과는 15초 나눠 쓴다). 429 면 hot. 알 수 없으면 unknown(= 막지 않는다). */
export async function probeVendorBudget(store: MeterStore, now: () => number): Promise<ProbeResult> {
  const readMemo = async (): Promise<ProbeResult | null> => {
    try {
      const raw = await store.get(PROBE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && typeof o.at === 'number' && now() - o.at < PROBE_FRESH_MS) return o.hot ? 'hot' : 'ok';
    } catch { /* 없으면 직접 묻는다 */ }
    return null;
  };
  const memo = await readMemo();
  if (memo) return memo;
  // 동시에 여러 섹터가 물으면 한 요청만 벤더에 묻고 나머지는 그 결과를 기다린다(최대 3초)
  let won = false;
  try { won = await store.setNxEx(PROBE_LOCK_KEY, String(now()), 5); } catch { won = false; }
  if (!won) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const m = await readMemo();
      if (m) return m;
    }
    return 'unknown';
  }
  const key = process.env.INTRINIO_API_KEY || '';
  if (!key) return 'unknown';
  const base = process.env.INTRINIO_BASE_URL || 'https://api-v2.intrinio.com';
  try {
    const res = await fetch(`${base}/securities/SPY/prices/realtime?api_key=${encodeURIComponent(key)}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const hot = res.status === 429;
    try { await res.arrayBuffer(); } catch { /* 본문은 버린다 */ }
    noteEvent('gov', hot ? 'probe-429' : res.ok ? 'probe-ok' : 'probe-other');
    if (hot) note429('u', 'securities/SPY/prices/realtime');   // 벤더가 우리 키에 429 를 준 것이다 — 사전 갱신(structure-warm)도 이 신호로 물러선다
    if (hot || res.ok) {
      try { await store.setEx(PROBE_KEY, JSON.stringify({ at: now(), hot }), 30); } catch { /* 다음 요청이 다시 묻는다 */ }
    }
    return hot ? 'hot' : res.ok ? 'ok' : 'unknown';
  } catch {
    noteEvent('gov', 'probe-fail');
    return 'unknown';
  }
}

const defaultDeps: GovDeps = {
  store: upstashMeterStore,
  now: () => Date.now(),
  recent429: (now) => userRecent429(now),
  probe: probeVendorBudget,
};

let deps: GovDeps = defaultDeps;
/** 시험 전용 — 의존성을 바꾼다(되돌릴 땐 인자 없이) */
export function __setGovernorDepsForTest(d?: Partial<GovDeps>): void { deps = d ? { ...defaultDeps, ...d } : defaultDeps; switchMemo = null; }

/**
 * 배경 갱신 한 번을 «해도 되는가». 건너뛰는 경우는 항상 쓸 만한 정상본이 있을 때뿐이다(정상본이 없으면 계산하지 않을 수 없다).
 *   usableAgeMs: 쓸 수 있는 정상본의 나이(없으면 null) · maxStaleMs: 그 키의 허용 나이.
 */
export async function decideBackground(a: { key: string; usableAgeMs: number | null; maxStaleMs: number; label?: string }): Promise<GovDecision> {
  const d = await decide(a);
  noteEvent('gov', `${d.run ? 'run' : 'skip'}-${d.why}`, deps.now());
  return d;
}

async function decide(a: { key: string; usableAgeMs: number | null; maxStaleMs: number }): Promise<GovDecision> {
  if (await governorOff(deps)) return { run: true, why: 'switch-off' };
  if (a.usableAgeMs == null) return { run: true, why: 'no-envelope' };
  const overAge = a.usableAgeMs >= skipAgeLimitMs(a.maxStaleMs);
  if (!overAge) {
    // 예산이 바닥인가 — 먼저 «직전 60초 안에 누가 429 를 받았나»(공짜), 아니면 벤더에 1콜
    let hot429 = false;
    try { hot429 = (await deps.recent429(deps.now())).state === 'yes'; } catch { hot429 = false; }
    if (hot429) return { run: false, why: 'hot-429' };
    let pr: ProbeResult = 'unknown';
    try { pr = await deps.probe(deps.store, deps.now); } catch { pr = 'unknown'; }
    if (pr === 'hot') return { run: false, why: 'hot-probe' };
  }
  // 같은 키의 갱신이 방금(25초 안) 시작됐으면 건너뛴다 — 진입점(예열 크론 · 목록 갱신 · 응답 뒤 갱신)이 겹쳐도 한 번.
  const flightKey = FLIGHT_PREFIX + a.key;
  let won = false;
  try { won = await deps.store.setNxEx(flightKey, String(deps.now()), FLIGHT_TTL_SEC); } catch { won = false; }
  if (!won) {
    // setNxEx 는 «이미 있음»과 «저장소를 못 씀»을 구분하지 않는다 → 읽어서 가른다. 못 읽으면 막지 않는다(저장소 장애가 갱신을 멈추지 않게).
    let held: string | null = null;
    try { held = await deps.store.get(flightKey); } catch { held = null; }
    if (held != null) return { run: false, why: 'flight' };
  }
  return { run: true, why: overAge ? 'age-override' : 'ok' };
}
