// ============================================================================
// «실적 결과 알림» — 내 종목의 발표 반응(옵션 예상 vs 실제)이 확정되면 그 종목을 가진 기기에 한 번만 보낸다.
//
// 설계(관문 11010757·11011001·11011010 보류 사유를 «경합을 하나씩 막기» 대신 구조로 없앤다):
//   ① 발송은 이 단계 하나에서만 — 실적 크론(runActualsCycle)이 쓰기 잠금을 «실제로 얻은» 회차의 끝에서, 그 잠금 안에서만 돈다.
//      잠금을 못 얻었거나(busy) 잠금 저장소가 불가·시간 초과(unavailable)면 아무것도 하지 않는다(읽기·쓰기·발송 0).
//   ② 고르는 기준은 채점표 하나 — lib/earnings/earningsScorecard.scorecardPairOf(채점표·앱 실적 화면이 받아들이는 «완전한 쌍»)를
//      그대로 쓴다(별도 필드·별도 출처 규칙을 만들지 않는다). 숫자·범위 판정도 그 행(expectedPct·actualPct·beyond) 그대로.
//   ③ 대상 기준은 더하지 않고, 보내는 «때»만 본다(채점표에 이미 있는 행을 언제 알릴지 — 기존 필드):
//      · actual 계산 시각 ≥ 일봉 확정 + ACTUAL_SETTLE_MS(서비스 ③-0 «확정 뒤 재확인»을 마쳤다 — 그 전엔 임시 종가)
//      · 기록의 마지막 쓰기 뒤 6시간 이상(RESULT_STABLE_MS — 그 사이 크론 회차들이 서비스 ③ FMP 대조 보강을 시도한다)
//      · 일봉 확정 뒤 4일 이내(RESULT_MAX_AGE_MS — 배포 첫 회차·장애 복구 뒤 지난 결과를 한꺼번에 «새 알림»처럼 쏟지 않게)
//      · 채점표 행의 check === 'fmp'(FMP 종가 대조 일치 — 서비스가 더 고치지 않는다 · Intrinio 단독 행은 채점표에만, 코디네이터 11/4)
//      · 발송 직전 엄격 읽기(EC2, 폴백 없음)로 다시 읽어 저장본이 첫 읽기와 «글자 하나까지» 같을 때만
//   ④ 중복·정정 — 기기×종목×발표일 키로 한 번만. 한 발표의 값(예상·실제)을 처음 본 지문을 남기고, 그 뒤 값이 바뀌거나 지워지면
//      «정정됨»으로 영구 표시하고 로그만 남긴다 — 그 발표는 다시는 보내지 않는다(정정 푸시 없음).
//   기기·설정·하루 상한·조용한 시간·발송 금지 시간대는 «내 종목 이상 신호»의 기존 규칙을 그대로 쓴다.
// ============================================================================
import { parseRecord, reactionFinalAt, ACTUAL_SETTLE_MS, actualsKey } from '@/lib/earnings/earningsActuals';
import { scorecardPairOf } from '@/lib/earnings/earningsScorecard';
import type { CalendarImplied } from '@/lib/earnings/calendarReportedImplied';
import { calendarReaction } from '@/lib/earnings/calendarScorecardDisplay';
import { impliedPctText } from '@/lib/earnings/earningsImplied';
import { RECEIPT_COPY } from '@/lib/earnings/earningsReceiptsCopy';
import { addDaysYmd } from '@/lib/earningsWeek';
import type { ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { etDateOf } from '@/lib/marketCalendar';
import { deviceFromRecord, inPushBlackout, inQuietHours, SIG_KEYS } from './plan';
import { SIG_ICON } from './copy';
import { SIG_CFG, type Loc } from './types';
import type { SendItem, SendOutcome, SigSender, SigStore, SigMode } from './run';

/** 마지막 쓰기 뒤 이만큼 지나야 «안정»으로 본다 */
export const RESULT_STABLE_MS = 6 * 3600_000;
/** 일봉 확정 뒤 이만큼 넘게 지난 결과는 보내지 않는다(주말·휴장 하루를 넘겨도 닿게, 낡은 결과를 한꺼번에 쏟지 않게) */
export const RESULT_MAX_AGE_MS = 4 * 24 * 3600_000;
/** 크론이 보는 발표일 창(오늘 −10일 ~ 오늘) */
const WINDOW_DAYS = 10;
const LEDGER_TTL_SEC = 120 * 86400;
/**
 * 기기 발송 자리의 «선점» 수명 — 선점·재확인 동안엔 이 짧은 수명으로만 잡고, 보내기 직전에 LEDGER_TTL_SEC 로 굳힌다.
 * 보내기 전에 함수 시간 상한(60초)에 걸려 정리 코드가 못 돌아도 자리가 이 시간 뒤 풀려 다음 회차(25분+ 뒤)가 다시 본다(관문 11041431 #2).
 * 발송을 한 번 시도한 기기는(결과가 fail·불명이어도) 다시 보내지 않는다 — 중복 발송 0 이 우선(관문 11041441 #2 · 11041444 #1).
 */
export const CLAIM_TTL_SEC = 10 * 60;
/**
 * 굳히기(SET XX) 한 번의 시간 상한 — 이 안에 확인된 기기는 곧바로 보낸다(늦은 기기의 확정·반환을 기다리지 않는다, 관문 11042212 #1).
 * 먼저 굳은 기기가 발송 호출을 기다리는 시간 = «허용된 손실» 창의 상한(≤ 300ms, 코디네이터 11/4 · 관문 11041451 #1).
 * 늦은 기기는 무장 지평(ARM_MS) 안에서 확정한다 — 굳었으면 보내고, 아니면 자리를 돌려준다.
 */
export const SEAL_TIMEOUT_MS = 300;
/**
 * 굳히기 직전 «무장» 수명(ms) — 선점 자리의 수명을 이만큼으로 줄인 뒤 굳힌다(비교 후 쓰기 PX). 이 시간이 지나면 자리가 서버에서 사라져
 * 포기한 굳히기가 늦게 도착해도 120일 장부를 만들 수 없다 — 빠진 기기의 «삭제 성공»에 기대지 않는다(관문 11042212 #2).
 * 굳히기 상한(300ms)의 두 배 — 정상 굳히기는 넉넉히 들어오고, 지평(굳히기 시작 + ARM_MS) 뒤 읽은 값은 최종이다.
 */
export const ARM_MS = 2 * SEAL_TIMEOUT_MS;
/** 한 플랫폼의 굳히기 단계(무장 300 + 지평 600 + 확정 읽기 2×300) 전체가 마감 전에 끝날 때만 시작한다 */
export const SEAL_PHASE_MS = SEAL_TIMEOUT_MS + ARM_MS + 2 * SEAL_TIMEOUT_MS;
/** 한 묶음(100기기)에서 동시에 선점하는 기기 수 */
const CLAIM_CONCURRENCY = 20;
/**
 * 선점을 멈추는 여유 — 마감(lockDeadline) 이만큼 전에 새 선점을 멈추고, 이미 잡은 기기는 재확인·발송한다(부분 묶음 발송).
 * 마감에 걸린 묶음을 통째로 버리면 매 회차 같은 묶음이 반복돼 결과가 영영 안 나갈 수 있다(관문 11041441 #1).
 */
export const CLAIM_STOP_MS = 8_000;
/**
 * 지문 저장값의 머리 — Upstash 기본 클라이언트는 읽을 때 JSON 으로 해석되는 문자열을 객체로 바꾼다(automaticDeserialization).
 * 머리를 붙여 JSON 이 아니게 해 «쓴 문자열 = 읽은 문자열»을 지킨다(관문 11041431 #1).
 */
const FP_PREFIX = 'fp1:';
/** 장부에서 읽은 지문 — 문자열이 아니면(해석된 객체 등) 같은 직렬화로 되돌려 비교한다(머리가 없으니 지금 지문과는 다르다 → 보내지 않는 쪽) */
const ledgerFp = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : stableStringify(v));
/** 잠금·장부 저장소 호출의 시간 상한(넘으면 «불가»로 보고 그 단계를 접는다) */
const STORE_TIMEOUT_MS = 2500;

export const RESULT_KEYS = {
  /** 기기×종목×발표일 — 한 번만 */
  sent: (dev: string, ticker: string, date: string) => `push:sig:result:${dev}:${ticker}:${date}`,
  /** 그 발표의 값을 처음 본 지문 */
  fp: (ticker: string, date: string) => `push:sig:result:fp:${ticker}:${date}`,
  /** 정정됨 — 있으면 영구히 보내지 않는다 */
  corrected: (ticker: string, date: string) => `push:sig:result:corr:${ticker}:${date}`,
  /** 이 알림 전용 모드(off | dry | live) — «내 종목 이상 신호»(push:sig:mode)와 따로. 없으면 dry */
  mode: 'push:sig:result:mode',
  /** 이 단계 전용 발송 잠금 — «내 종목 이상 신호» 회차(push:sig:lock)를 막지 않게 따로 둔다(기기 하루 상한은 incr 로 원자적) */
  lock: 'push:sig:result:lock',
} as const;

export interface ResultAlert { ticker: string; date: string; expected: number; actual: number; beyond: boolean }
export type ResultEligibility = { ok: true; alert: ResultAlert } | { ok: false; reason: string };

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' ? x as Record<string, unknown> : null);

/** 키 순서와 무관한 직렬화 — «재읽기 값이 같은가» 비교용 */
export function stableStringify(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stableStringify).join(',')}]`;
  const o = obj(x);
  if (o) return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  return JSON.stringify(x) ?? 'null';
}

/**
 * 그 발표의 «값» 지문 — 실제 반응이 없으면 null. 쓰기 시각(at)·대조 표식(check)은 넣지 않는다:
 * 같은 값의 재확인(③-0 settled-same)·대조 보강(③ null→fmp)은 정정이 아니다. 값·관측이 바뀌면 지문이 바뀐다.
 */
export function resultValueFingerprint(raw: unknown): string | null {
  const r = parseRecord(raw);
  if (!r?.actual) return null;
  const re = obj(obj(raw)?.expected);
  const e = r.expected;
  return FP_PREFIX + stableStringify({
    hour: r.hour,
    e: e ? { pct: e.pct, method: e.method ?? null, straddlePct: e.straddlePct ?? null, expiry: e.expiry, session: e.session, basis: e.basis,
      strike: e.strike, straddle: e.straddle, spot: e.spot, capturedAt: e.capturedAt, src: re?.src ?? null } : null,
    a: { pct: r.actual.pct, baseDate: r.actual.baseDate, baseClose: r.actual.baseClose, reactDate: r.actual.reactDate, reactClose: r.actual.reactClose },
  });
}

/**
 * 저장본 하나가 지금 «보내도 되는 끝난 결과»인가 — 이유와 함께.
 * 고르는 기준은 채점표의 scorecardPairOf 하나(같은 기록 = 같은 판정). 그 위에 행의 check=fmp 와 «보내는 때»(정착·안정·4일)를 본다.
 */
export function resultEligibility(c: ConfirmedEarnings, raw: unknown, now: number): ResultEligibility {
  const no = (reason: string): ResultEligibility => ({ ok: false, reason });
  if (c.hour !== 'bmo' && c.hour !== 'amc') return no('no_hour');
  const pair = scorecardPairOf(raw, now);
  if (!pair) return no(parseRecord(raw) ? 'not_scorecard_pair' : 'no_record');
  const row = pair.row;
  if (row.ticker !== c.ticker.toUpperCase() || row.date !== c.date || row.hour !== c.hour) return no('record_mismatch');
  const finalAt = reactionFinalAt(row.basis.reactDate);
  if (finalAt == null) return no('no_sessions');
  // ③ 채점표 행의 check 그대로 — FMP 대조 일치(fmp)만. Intrinio 단독 행은 서비스 ③ 재대조에서 고쳐 쓰이거나 지워질 수 있어
  //    (잠금 불가 회차의 동시 쓰기 포함, 관문 11041435 #1) 알리지 않는다 — 채점표 표시는 그대로(코디네이터 11/4 결정: FMP 는 종가 검증용).
  if (row.check !== 'fmp') return no('actual_unconfirmed');
  // ③ 확정 뒤 재확인(서비스 ③-0)을 마친 actual 만 — 그 전엔 서비스가 임시 종가를 고쳐 쓴다
  const actualAt = Date.parse(row.basis.actualCalculatedAt);
  if (!(actualAt >= finalAt + ACTUAL_SETTLE_MS)) return no('actual_unsettled');
  // ③ 안정 — 마지막 쓰기 뒤 6시간(scorecardPairOf 는 미래 시각을 받아들이지 않는다 · 기록 at 은 미래면 0 으로 본다 → 원본 at 을 직접 본다)
  const recAt = parseRecord(raw)!.at;
  if (recAt > now) return no('unstable');
  if (!(pair.dataAt > 0) || now - pair.dataAt < RESULT_STABLE_MS) return no('unstable');
  if (now - finalAt > RESULT_MAX_AGE_MS) return no('too_old');
  return { ok: true, alert: { ticker: row.ticker, date: row.date, expected: row.expectedPct, actual: row.actualPct, beyond: row.beyond } };
}

/**
 * 숫자 표기 — 앱 실적 화면과 같은 함수(예상 impliedPctText · 실제 calendarReaction, 소수 1자리).
 * 소수 1자리에서 두 숫자가 같아 보이는데 «범위 밖»이면(예: ±3.6% → +3.6% 밖) 서로 달라질 때까지 자릿수를 늘린다(최대 4 — 저장 정밀도).
 */
export function resultNumbers(r: ResultAlert): { expected: string; actual: string } {
  // 앱 실적 화면이 쓰는 모양(CalendarImplied — reportedImplied 가 채점표 행에서 만드는 것과 같은 필드)
  const implied: CalendarImplied = { pct: r.expected, expiry: '', basis: null, session: null, reported: true, actualPct: r.actual, within: !r.beyond };
  const expected = impliedPctText(implied.pct), actual = calendarReaction(implied) ?? '';
  if (!r.beyond || expected.slice(1) !== actual.slice(1)) return { expected, actual };
  const half = (n: number, d: number) => (Math.round(Math.abs(n) * 10 ** d + 1e-9) / 10 ** d).toFixed(d);
  for (let d = 2; d <= 4; d++) {
    const e = half(r.expected, d), a = half(r.actual, d);
    if (e !== a || d === 4) return { expected: `±${e}%`, actual: `${r.actual >= 0 ? '+' : '−'}${a}%` };
  }
  return { expected, actual };
}

/** 문구 — «⚡ TICKER 실적» · «옵션 예상 ±X% → 실제 +Y% (범위 안/밖)». 범위 안/밖은 영수증·앱 실적 화면 문구(RECEIPT_COPY) 그대로 */
export function resultCopy(r: ResultAlert, loc: Loc) {
  const { expected, actual } = resultNumbers(r);
  const range = r.beyond ? RECEIPT_COPY[loc].outside : RECEIPT_COPY[loc].within;
  if (loc === 'ko') return { title: `${SIG_ICON} ${r.ticker} 실적`, body: `옵션 예상 ${expected} → 실제 ${actual} (${range})` };
  if (loc === 'ja') return { title: `${SIG_ICON} ${r.ticker} 決算`, body: `想定変動幅 ${expected} → 実際 ${actual}（${range}）` };
  return { title: `${SIG_ICON} ${r.ticker} earnings`, body: `Implied move ${expected} → actual ${actual} (${range})` };
}
/** 탭 목적지 — 앱 실적 화면(기존 푸시 탭 리스너가 /{loc} 를 붙여 연다 · lib/app/signalTap 닫힌 목록) */
export function resultPath(): string {
  return '/app-view/earnings';
}

// ── 발송 단계 ────────────────────────────────────────────────────────────────

export type StrictRead = { ok: boolean; value: unknown };
/**
 * 이 단계의 저장소 — 기존 SigStore + «이 회차 값일 때만 덮어쓰기·지우기»(Lua 비교 후 쓰기).
 * 굳히기를 비교 후 쓰기로 해야, 포기한 뒤 늦게 도착한 쓰기가 120일 장부를 되살리거나 다른 회차 자리를 덮지 못한다(관문 11041444 #2 · 11051012 #2).
 */
export interface ResultStore extends SigStore {
  /**
   * 값이 expect 와 «글자 그대로» 같을 때만 value 로 바꾸고 수명을 정한다(원자적 비교 후 쓰기 — Lua) · 쓰면 true.
   * 존재만 보는 SET XX 와 달리, 오래 지연된 이전 회차의 쓰기가 다음 회차가 새로 잡은 자리(다른 회차 표식)를 덮지 못한다(관문 11051012 #2).
   */
  setIfEq(key: string, expect: string, value: string, ttl: { ex: number } | { px: number }): Promise<boolean>;
  /** 값이 expects 중 하나일 때만 지운다(원자적 — Lua). 끝나면 그 키는 더 이상 이 값이 아니다 · 지연된 지우기가 다른 회차 장부를 지우지 못한다 */
  delIfEq(key: string, expects: string[]): Promise<void>;
}
export interface ResultStepDeps {
  /** Upstash — 기기·모드·잠금·장부 */
  store: ResultStore;
  sender: SigSender;
  /** 실적 기록의 엄격 읽기(EC2, 폴백 없음) — 키 순서대로. ok=false 는 «확인 못 함»(값 없음과 다르다) */
  readStrict: (keys: string[]) => Promise<StrictRead[]>;
  log?: (msg: string) => void;
  clock?: () => number;
  /** 저장소 호출 시간 상한(시험용) */
  storeTimeoutMs?: number;
}
export interface ResultStepOpts {
  list: readonly ConfirmedEarnings[];
  /** 실적 크론이 이번 회차 쓰기 잠금을 실제로 얻었는가(CycleReport.lockAcquired) */
  runLockAcquired: boolean;
  /** 실적 크론 잠금이 끝나기 전 여유를 둔 마감 시각(ms) — 이 뒤로는 발송을 시작하지 않는다 */
  lockDeadline: number;
  /** 이 알림 전용 환경 모드(EARNINGS_RESULT_ALERT_MODE — resultEnvMode()) */
  envMode: SigMode | null;
  /** «내 종목 이상 신호» 환경 모드(WL_SIGNALS_MODE) — off 만 따른다(전체 신호 비상 끄기). live 는 이 알림을 켜지 않는다 */
  signalEnvMode?: SigMode | null;
}
export interface ResultStepReport {
  status: 'no_run_lock' | 'lock_expiring' | 'off' | 'send_lock_unavailable' | 'store_unavailable' | 'observed' | 'ok';
  sent: number;
  candidates: string[];
  corrected: string[];
  skipped: Array<{ key: string; reason: string }>;
}

/** 이 알림 전용 환경 모드 — EARNINGS_RESULT_ALERT_MODE(off | dry | live). 없거나 다른 값이면 null(→ Redis 키 · 그것도 없으면 dry) */
/** 운영 저장소(Upstash)용 비교 후 쓰기·지우기 Lua — 크론 라우트가 ResultStore 로 감싼다 */
export const SET_IF_EQ_LUA = "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], ARGV[3], ARGV[4]) return 1 end return 0";
export const DEL_IF_EQ_LUA = "local v = redis.call('GET', KEYS[1]) for i = 1, #ARGV do if v == ARGV[i] then redis.call('DEL', KEYS[1]) return 1 end end return 0";

export function resultEnvMode(env: Record<string, string | undefined> = process.env): SigMode | null {
  const v = (env.EARNINGS_RESULT_ALERT_MODE || '').trim().toLowerCase();
  return v === 'off' || v === 'dry' || v === 'live' ? v : null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(timer));
}

interface Candidate { c: ConfirmedEarnings; key: string; snapshot: string; fp: string; alert: ResultAlert }
interface Claimed { item: SendItem; key: string; cap: string; cand: Candidate }

type Settle = 'ok' | 'no' | 'err' | 'pending';
/** 쓰기 하나의 결과를 ms 안에서 — ok(썼다) · no(자리가 없어 안 썼다) · err(오류 — 썼는지 모른다) · pending(아직 응답 없음) */
function settle(p: Promise<boolean>, ms: number): Promise<Settle> {
  return withTimeout(p.then((v): Settle => (v ? 'ok' : 'no'), (): Settle => 'err'), ms).catch((): Settle => 'pending');
}
/** 취소할 수 있는 타이머 */
function timer(ms: number): { done: Promise<void>; cancel: () => void } {
  let h: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<void>((res) => { h = setTimeout(res, ms); });
  return { done, cancel: () => clearTimeout(h) };
}

/**
 * 실적 결과 알림 — 크론 라우트가 runActualsCycle 뒤에 «같은 요청·같은 잠금 안에서» 부른다. 이 단계 밖에서는 보내지 않는다.
 */
export async function runEarningsResultStep(deps: ResultStepDeps, opts: ResultStepOpts): Promise<ResultStepReport> {
  const clock = deps.clock ?? Date.now;
  const log = deps.log ?? ((m: string) => console.log(m));
  const tmo = deps.storeTimeoutMs ?? STORE_TIMEOUT_MS;
  const st = <T,>(p: Promise<T>) => withTimeout(p, tmo);
  const report: ResultStepReport = { status: 'no_run_lock', sent: 0, candidates: [], corrected: [], skipped: [] };
  // ① 실적 크론 잠금을 실제로 얻은 회차만(busy·unavailable·시간 초과 → 아무것도 하지 않는다)
  if (opts.runLockAcquired !== true) return report;
  const now = clock();
  if (now >= opts.lockDeadline) { report.status = 'lock_expiring'; return report; }
  // 이 회차의 자리 표식 — 선점·무장·굳힘 값에 붙여, 비교 후 쓰기·지우기가 «이 회차가 쓴 값»에만 닿게 한다(다른 회차 자리를 건드리지 않는다)
  const runTag = `${now}.${Math.random().toString(36).slice(2, 10)}`;
  const CLAIM_V = `claim:${runTag}`, ARM_V = `arm:${runTag}`, SENT_V = `sent:${runTag}`;

  // 모드 — 이 알림 전용 스위치(환경 EARNINGS_RESULT_ALERT_MODE · Redis push:sig:result:mode)만 live 를 켠다. 둘 다 없으면 dry.
  //   «내 종목 이상 신호» 스위치는 off(비상 끄기)만 따른다 — 그 스위치가 live 여도 이 알림은 켜지지 않는다(병합 즉시 발송 방지).
  let own: unknown = null, sig: unknown = null;
  try { [own, sig] = await st(Promise.all([deps.store.get(RESULT_KEYS.mode), deps.store.get(SIG_KEYS.mode)])); }
  catch { report.status = 'store_unavailable'; return report; }
  if (opts.envMode === 'off' || own === 'off' || opts.signalEnvMode === 'off' || sig === 'off') { report.status = 'off'; return report; }
  const live = opts.envMode === 'live' || own === 'live';

  // 이 단계의 발송 잠금 — 못 얻거나 저장소 불가·시간 초과면 아무것도 하지 않는다
  let locked = false;
  try { locked = await st(deps.store.setNx(RESULT_KEYS.lock, String(now), 150)); } catch { locked = false; }
  if (!locked) { report.status = 'send_lock_unavailable'; return report; }
  /**
   * 뒤에서 도는 반환(자리 지우기·상한 되돌리기) — 발송은 이것을 기다리지 않는다(다른 기기의 느린 반환이 정상 기기 발송을 붙잡지 않게,
   * 야간 검토 20261105 #2). 단계 끝(잠금 해제 직전)에 모두 끝나기를 기다린다 — 보고(seal_unknown 등)도 그때 다 모인다.
   * 자리·상한 반환은 하나하나 시간 상한이 있다(끊긴 토큰 정리만 origin/main 처럼 끝까지 기다린다 — 순서 역전 방지).
   */
  const bg: Promise<unknown>[] = [];
  /** 스스로 시간 상한이 있는 일(release) */
  const later = (p: Promise<unknown>) => { bg.push(p.catch(() => {})); };
  /** 저장소 호출 하나 — 시간 상한(tmo)을 씌워서 */
  const laterOp = (p: Promise<unknown>) => later(withTimeout(p, tmo));
  try {
    const today = etDateOf(now);
    const entries = opts.list.filter((c) => (c.hour === 'bmo' || c.hour === 'amc') && c.date >= addDaysYmd(today, -WINDOW_DAYS) && c.date <= today);
    if (!entries.length) { report.status = 'observed'; return report; }
    const tk = (c: ConfirmedEarnings) => c.ticker.toUpperCase();
    const recKeys = entries.map((c) => actualsKey(c.ticker, c.date));
    let ledger: unknown[];
    let reads: StrictRead[];
    try {
      [ledger, reads] = await Promise.all([
        st(deps.store.mget([...entries.map((c) => RESULT_KEYS.fp(tk(c), c.date)), ...entries.map((c) => RESULT_KEYS.corrected(tk(c), c.date))])),
        deps.readStrict(recKeys),
      ]);
    } catch { report.status = 'store_unavailable'; return report; }
    const n = entries.length;
    const cands: Candidate[] = [];
    try {
      for (let i = 0; i < n; i++) {
        const c = entries[i], id = `${tk(c)}|${c.date}`;
        const r = reads[i];
        if (!r?.ok) { report.skipped.push({ key: id, reason: 'read_failed' }); continue; }
        const fpNow = r.value == null ? null : resultValueFingerprint(r.value);
        const seen = ledgerFp(ledger[i]);
        let corrected = ledger[n + i] != null;
        // ④ 처음 본 값에서 바뀌었거나(값·관측 변경) 지워졌으면(actual 삭제 · 기록 통째 삭제 — 관문 11041448 #2) 정정 — 영구 표시, 로그만.
        //    지문이 없는 발표의 «기록 없음»은 아직 안 생긴 것일 뿐 — 아래 fpNow == null 에서 건너뛴다.
        if (!corrected && seen != null && fpNow !== seen) {
          if (await st(deps.store.setNx(RESULT_KEYS.corrected(tk(c), c.date), String(now), LEDGER_TTL_SEC))) {
            log(`[Cron/EarningsResult] 정정됨 ${tk(c)} ${c.date} — 이 발표는 보내지 않는다(정정 푸시 없음)`);
          }
          corrected = true;
        }
        if (corrected) { report.corrected.push(id); continue; }
        if (fpNow == null) continue;
        // 지문은 «보낼 수 있는 상태(채점표 쌍 + 정착·안정)가 된 값»에만 남긴다 — 그 전의 정상 처리(임시 종가 → 확정 뒤 재확인 갱신 ·
        // 대조 보강)는 정정이 아니다(관문 11041428 #2). 지문을 남긴 뒤에 값이 바뀌거나 지워지면 그때부터가 정정이다.
        const el = resultEligibility(c, r.value, now);
        if (!el.ok) { report.skipped.push({ key: id, reason: el.reason }); continue; }
        if (seen == null && !(await st(deps.store.setNx(RESULT_KEYS.fp(tk(c), c.date), fpNow, LEDGER_TTL_SEC)))) {
          report.skipped.push({ key: id, reason: 'fp_race' }); continue;   // 다른 회차가 먼저 적었다 — 다음 회차가 대조한다
        }
        cands.push({ c, key: recKeys[i], snapshot: stableStringify(r.value), fp: fpNow, alert: el.alert });
      }
    } catch { report.status = 'store_unavailable'; return report; }
    report.candidates = cands.map((x) => `${x.alert.ticker}|${x.alert.date}`);
    if (!live || inPushBlackout(now) || !cands.length) { report.status = 'observed'; return report; }

    /** 발송 직전 재확인 — 엄격 재읽기 값이 첫 읽기와 같고 · 여전히 끝난 결과이고 · 지문·정정 장부가 그대로인 발표만 */
    const verify = async (picked: Candidate[]): Promise<Set<Candidate>> => {
      const ok = new Set<Candidate>();
      if (!picked.length) return ok;
      try {
        const [again, led] = await Promise.all([
          deps.readStrict(picked.map((x) => x.key)),
          st(deps.store.mget([...picked.map((x) => RESULT_KEYS.fp(x.alert.ticker, x.alert.date)), ...picked.map((x) => RESULT_KEYS.corrected(x.alert.ticker, x.alert.date))])),
        ]);
        const t = clock();
        picked.forEach((x, i) => {
          const r = again[i];
          if (!r?.ok || r.value == null || stableStringify(r.value) !== x.snapshot) return;
          if (ledgerFp(led[i]) !== x.fp || led[picked.length + i] != null) return;
          const el = resultEligibility(x.c, r.value, t);
          if (!el.ok || stableStringify(el.alert) !== stableStringify(x.alert)) return;
          ok.add(x);
        });
      } catch { /* 확인 못 함 — 하나도 보내지 않는다 */ }
      return ok;
    };

    const listed = await st(deps.store.smembers('push:token_list'));
    // 시작 위치를 회차(분)마다 돌린다 — 시간이 모자란 회차가 이어져도 늘 같은 앞쪽 기기만 처리되지 않게(이미 보낸 기기는 선점 1회로 건너뛴다)
    const off = listed.length ? Math.floor(now / 60_000) % listed.length : 0;
    const tokens = [...listed.slice(off), ...listed.slice(0, off)];
    for (let i = 0; i < tokens.length; i += 100) {
      if (clock() >= opts.lockDeadline) { report.skipped.push({ key: '*', reason: 'lock_expiring' }); break; }
      const chunk = tokens.slice(i, i + 100);
      const records = await st(deps.store.mget(chunk.map((t) => `push:tokens:${t}`)));
      const claimed: Claimed[] = [];
      let expiring = false;
      /**
       * 기기 하나 — 마감 검사 뒤 그 기기의 발표들을 차례로 선점(기기 안은 순서대로: 하루 상한·회차당 상한을 지키려고).
       * 하루 상한(공유 키 — «내 종목 이상 신호» run.ts 와 같다)은 기다림 없이 정확하게(야간 검토 20261105 #2 · 관문 11060111·11060355·11060414):
       *   · incr 값이 상한 초과로 «확인»되면 — 곧바로(뒤에서) 되돌리고 다음 종목을 계속 본다(origin/main 과 같은 순서 · 부풀린 상한을 들고 있지 않는다,
       *     관문 11060414 #1·11060420). 다음 종목 incr 가 그 되돌리기보다 먼저 서버에 닿으면 1 높게 보여 이번 회차엔 건너뛸 수 있다 — 다른 크론이
       *     같은 순간 상한을 돌려준 경우에만 생기는 보수 쪽 오차이고, 다음 회차(25분+ 뒤)가 다시 본다(넘치는 쪽 오차는 만들지 않는다).
       *   · incr 가 오류·시간 초과면 — «서버엔 반영됨»으로 본다(기존 규칙, 관문 11041451 #2). 이 자리(held)는 되돌리지 않고 들고 있다가
       *     같은 기기의 다음 종목이 선점되면 그 종목이 «넘겨받는다»: 새로 incr 하지 않고 GET 한 값이 상한 안이면 그대로 쓴다.
       *     예: 2/3 · 첫 종목 incr 시간 초과(서버 3) → 두 번째 종목 선점 → GET 3 ≤ 3 → 보낸다 · decr 0회 · 끝 3.
       *     되돌리기(decr)가 아예 없으니 반환이 느리든 끝내 응답이 없든 판정이 같고, 공유 상한은 실제 사용량(3)을 넘겨 부풀지 않는다.
       *     늦게 도착하는 첫 incr 도 그 자리를 채울 뿐이다(GET 이 그 증가 전이든 뒤든 같은 결과).
       *     넘겨받을 종목이 없으면(루프 끝) · GET 값이 상한 초과·확인 불가면 그때 곧바로 되돌리고(그 종목은 돌려준다) 다음 종목을 계속 본다.
       *   · 남는 오차는 기존 규칙과 같은 쪽 — 시간 초과된 incr 가 끝내 서버에 안 닿았으면 그날 상한이 1 덜 찬다.
       *   · 기기 키(devKey)는 토큰마다 하나라 같은 상한 키를 이 회차의 다른 루프가 건드리지 않는다.
       * 거절한 자리 지우기·되돌리기는 뒤에서(laterOp) — 정상 기기의 선점·발송은 이것을 기다리지 않는다.
       */
      const claimDevice = async (j: number) => {
        const d = deviceFromRecord(chunk[j], records[j]);
        if (!d) return;
        const cap = SIG_KEYS.cap(etDateOf(now), d.dev);
        let chosen = 0, held = false;
        const drop = (key: string) => laterOp(deps.store.delIfEq(key, [CLAIM_V]));
        const refund = () => laterOp(deps.store.decr(cap));
        try {
          for (const x of cands) {
            const a = x.alert;
            if (!d.tickers.includes(a.ticker) || chosen >= SIG_CFG.perRunPerDevice) continue;
            if (clock() >= opts.lockDeadline - CLAIM_STOP_MS) { expiring = true; return; }   // 기기마다·발표마다 검사 — 선점 창이 닫히면 더 잡지 않는다(잡은 것은 아래에서 보낸다)
            const key = RESULT_KEYS.sent(d.dev, a.ticker, a.date);
            // 선점은 짧게(CLAIM_TTL_SEC) — 발송 성공을 확인한 뒤에만 120일 장부로 굳힌다
            if (!await st(deps.store.setNx(key, CLAIM_V, CLAIM_TTL_SEC)).catch(() => false)) continue;
            if (held) {
              // 들고 있던 (시간 초과) 증가분을 이 종목이 넘겨받는다 — 새 incr 없이 지금 값이 상한 안인지만 본다
              const v = await st(deps.store.get(cap)).then((r) => Number(r ?? 0)).catch(() => NaN);
              held = false;
              if (!(v <= SIG_CFG.deviceDailyCap)) { refund(); drop(key); continue; }   // 초과·확인 불가 → 들고 있던 증가분을 곧바로 되돌린다
            } else {
              const cnt = await st(deps.store.incr(cap, 36 * 3600)).catch(() => null);
              if (cnt == null) { held = true; drop(key); continue; }   // 오류·시간 초과 → 반영됐다고 보고 들고 있는다(다음 종목이 넘겨받거나 끝에서 되돌림)
              // 상한 초과 — 이 증가를 곧바로(뒤에서) 되돌린다(부풀린 공유 상한을 들고 있지 않는다, 관문 11060414 #1) · 다음 종목은 계속 본다(관문 11060420)
              if (cnt > SIG_CFG.deviceDailyCap) { refund(); drop(key); continue; }
            }
            chosen++;
            const copy = resultCopy(a, d.locale);
            claimed.push({ key, cap, cand: x, item: { id: `${d.dev}|${a.ticker}|${a.date}`, token: d.token, platform: d.platform, ...copy, quiet: inQuietHours(d.tz, now), thread: `sig-${a.ticker}`, data: { type: 'wl_signal', path: resultPath(), ev: 'earnings_result', t: a.ticker, src: 'push_sig_earn', locale: d.locale } } });
          }
        } finally {
          // 넘겨받지 못한 (시간 초과) 증가분 되돌리기 — 루프가 끝나는 즉시(뒤에서)
          if (held) refund();
        }
      };
      // 기기 사이는 병렬(동시 CLAIM_CONCURRENCY) — 저장소가 느려도 묶음 준비가 «기기 수 × 왕복»으로 늘지 않게(관문 11041435 #2)
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CLAIM_CONCURRENCY, chunk.length) }, async () => {
        while (next < chunk.length && !expiring) await claimDevice(next++);
      }));
      const allowed = claimed.length && clock() < opts.lockDeadline ? await verify([...new Set(claimed.map((c) => c.cand))]) : new Set<Candidate>();
      // 재확인이 늦어 마감을 넘겼으면 보내지 않는다(관문 11041441 #2) — 아래에서 자리를 모두 돌려준다
      const inTime = clock() < opts.lockDeadline;
      const ready = inTime ? claimed.filter((c) => allowed.has(c.cand)) : [];
      // 보내기 «직전»에 선점 자리를 120일 장부로 굳힌다(SET XX) — 발송 도중·직후 함수가 끊겨도 다시 보내지 않는다(중복 0 우선).
      // ★ 허용된 손실(코디네이터 11/4 결정 · 관문 11041448 #1): 발송 확인 응답 없이 «누락 0·중복 0»은 동시에 불가 — 중복 0 을 택한다.
      //   굳힘을 확인한 뒤 발송 호출까지 ≤ SEAL_TIMEOUT_MS(300ms) — 그 사이 함수가 강제 중단될 때만 그 기기는 이 알림을 못 받는다.
      // 관문 11042212·11041457: 먼저 굳은 기기가 빠진 기기의 «반환(del)»을 기다리지 않는다(반환 대기 0) · 120일 장부는
      //   «보냈거나 · 되돌렸거나 · 저장소가 끝까지 답하지 않았다고 보고한» 셋 중 하나로만 끝난다(삭제 성공에 기대지 않는다).
      //   ① 무장 — 굳히기 직전에 자리 수명을 ARM_MS 로 줄인다(비교 후 쓰기 PX). 이 시간이 지나면 자리가 서버에서 사라져,
      //      포기한 굳히기가 아무리 늦게 도착해도(재시도 포함) «이 회차 무장 값일 때만» 쓰므로 120일 장부를 만들 수 없다.
      //      모든 자리 쓰기·지우기는 이 회차 표식(runTag) 값과 비교한 뒤에만 — 지연된 요청이 다른 회차 자리를 덮거나 지우지 못한다.
      //   ② 굳히기 — 300ms 안에 확인된 기기는 마감을 다시 확인하고 곧바로 보낸다.
      //   ③ 늦은 기기 — 지평(굳히기 시작 + ARM_MS) 안에 성공이 확인되면 그 기기도 보낸다 · 실패·불명이면 지평 뒤 한 번 읽어 확정한다
      //      (지평 뒤엔 어떤 굳히기도 적용될 수 없으니 읽은 값이 최종). 읽기도 실패하면 자리를 지우고, 지우기마저 실패하면 «seal_unknown»으로 보고한다.
      const attempted = new Set<Claimed>();
      const outcomes = new Map<string, SendOutcome>();
      const sealTmo = Math.min(tmo, SEAL_TIMEOUT_MS);
      /**
       * 지평 뒤 굳힘 확정 읽기 — 한 번의 MGET 으로 묶음 전체를 같은 순간에 확정한다(기기마다 따로 읽으면 느린 기기가 다른 기기 발송을 붙잡거나 —
       * 관문 11051018 — 기기마다 발송을 따로 불러 공급사 연결이 기기 수만큼 늘어난다 — 관문 11051020).
       * 이 회차의 굳힘 값이면 sealed · 그 밖(없음·다른 값)이면 not · 두 번 다 못 읽으면 모두 unknown.
       */
      const readSeals = async (keys: string[]): Promise<Array<'sealed' | 'not' | 'unknown'>> => {
        for (let k = 0; k < 2; k++) {
          try {
            const vals = await withTimeout(deps.store.mget(keys), sealTmo);
            return keys.map((_, i) => (String(vals[i]) === SENT_V ? 'sealed' : 'not'));
          } catch { /* 다시 한 번 */ }
        }
        return keys.map(() => 'unknown');
      };
      /**
       * 자리 지우기 — 이 회차가 쓴 값(선점·무장·굳힘)일 때만 지운다. 확인된 성공만 true(실패·시간 초과는 «반환 안 됨», 관문 11042212 #2) ·
       * 시간 상한 SEAL_TIMEOUT_MS × 2회. 늦게 도착한 지우기도 다른 회차의 자리·장부는 지우지 못한다(관문 11051012 #2).
       */
      const delConfirmed = async (key: string): Promise<boolean> => {
        for (let k = 0; k < 2; k++) {
          try { await withTimeout(deps.store.delIfEq(key, [CLAIM_V, ARM_V, SENT_V]), sealTmo); return true; } catch { /* 다시 한 번 */ }
        }
        return false;
      };
      /**
       * 시도하지 않은 자리 반환(한 번만) — 자리·상한, 모두 시간 상한 안에서. 다음 회차가 같은 규칙으로 다시 본다.
       * failReason 이 있으면 «지우기 확인 실패»를 반환 완료로 치지 않고 보고한다(굳었을 수 있는 자리 — 되돌림·불명).
       * 짧은 선점·무장 자리는 지우기가 실패해도 수명(CLAIM_TTL_SEC · ARM_MS)이 지나면 저절로 풀린다.
       */
      const released = new Set<Claimed>();
      const release = async (list: Claimed[], failReason?: string) => {
        await Promise.all(list.filter((c) => !released.has(c) && !attempted.has(c)).map(async (c) => {
          released.add(c);
          if (!(await delConfirmed(c.key)) && failReason) report.skipped.push({ key: c.item.id, reason: failReason });
          await withTimeout(deps.store.decr(c.cap), sealTmo).catch(() => 0);
        }));
      };
      // 재확인에서 탈락한 자리는 발송 전에 먼저 돌려주기 «시작»한다 — 끝나기를 기다리지 않는다(정상 기기 발송을 붙잡지 않게)
      later(release(claimed.filter((c) => !ready.includes(c))));
      let sendInTime = true;
      /** 굳은 묶음 하나를 보낸다 — 보내기 «직전» 마감 재확인. 넘었으면 보내지 않고 굳은 자리를 되돌린다(되돌림 확인 실패는 보고) */
      const sendSealed = async (group: Claimed[]) => {
        if (!group.length) return;
        if (clock() >= opts.lockDeadline) { sendInTime = false; await release(group, 'rollback_failed'); return; }
        for (const c of group) attempted.add(c);
        const got = await deps.sender.send(group.map((c) => c.item)).catch(() => new Map<string, SendOutcome>());
        for (const [id, o] of got) outcomes.set(id, o);
      };
      for (const platform of ['ios', 'android'] as const) {
        const batch = ready.filter((c) => c.item.platform === platform);
        if (!batch.length) continue;
        // 무장·굳히기·지평·확정 읽기가 모두 마감 전에 끝날 때만 시작 — 넘으면 이 플랫폼은 시도 전이므로 아래에서 자리·상한을 돌려준다(관문 11041444 #3)
        if (clock() + SEAL_PHASE_MS >= opts.lockDeadline) { sendInTime = false; break; }
        // ① 무장 — 이 회차 선점 값일 때만 무장 값·ARM_MS 수명으로(확인 못 한 기기는 굳히지 않는다 · 늦게 도착한 무장은 짧은 자리를 더 짧게 할 뿐,
        //    다른 회차가 다시 잡은 자리는 값이 달라 건드리지 못한다)
        const armed = (await Promise.all(batch.map(async (c) =>
          (await settle(deps.store.setIfEq(c.key, CLAIM_V, ARM_V, { px: ARM_MS }), sealTmo)) === 'ok' ? c : null))).filter((c): c is Claimed => c != null);
        // 무장 못 한 기기의 반환은 굳히기 «뒤»에(아래 release(batch)) — 반환을 기다리는 사이 무장 수명이 지나 정상 기기까지 못 굳는 일이 없게(관문 11051012 #1)
        if (!armed.length) { later(release(batch)); continue; }
        // ② 굳히기 — 무장 직후 모두 같은 순간에, 이 회차 무장 값일 때만. 지평 타이머는 무장이 모두 확인된 «뒤»에 시작하므로, 지평이 지나면 모든 무장 자리가 서버에서 사라졌다.
        const sealP = new Map(armed.map((c) => [c, deps.store.setIfEq(c.key, ARM_V, SENT_V, { ex: LEDGER_TTL_SEC })] as const));
        const horizon = timer(ARM_MS);
        const unknown = new Set<Claimed>();
        try {
          const first = await Promise.all(armed.map(async (c) => [c, await settle(sealP.get(c)!, sealTmo)] as const));
          const sealed = first.filter(([, s]) => s === 'ok').map(([c]) => c);
          const late = first.filter(([, s]) => s === 'err' || s === 'pending').map(([c]) => c);   // 'no' = 자리가 없어 쓰지 않았다(굳지 않음)
          /** ③ 늦은 기기 — 지평 안 성공은 보내고, 나머지는 지평 뒤 읽어서 확정 */
          const resolveLate = async () => {
            if (!late.length) return;
            const second = await Promise.all(late.map(async (c) => [c, await Promise.race([
              sealP.get(c)!.then((v): Settle => (v ? 'ok' : 'no'), (): Settle => 'err'), horizon.done.then((): Settle => 'pending'),
            ])] as const));
            // 지평 안에 성공이 확인된 기기 — 300ms 상한 뒤에 확인됐으므로 지평(600ms)까지 모아 보내도 확인 → 발송 대기 ≤ 300ms
            const sealedLate = second.filter(([, s]) => s === 'ok').map(([c]) => c);
            const toRead = second.filter(([, s]) => s === 'err' || s === 'pending').map(([c]) => c);
            await Promise.all([sendSealed(sealedLate), (async () => {
              if (!toRead.length) return;
              await horizon.done;
              // 묶음 전체를 한 번에 확정하고 확인된 기기를 곧바로 한 번에 보낸다(확정 → 발송 대기 0 · 발송 호출 1회)
              const read = await readSeals(toRead.map((c) => c.key));
              toRead.forEach((c, i) => { if (read[i] === 'unknown') unknown.add(c); });
              await sendSealed(toRead.filter((_, i) => read[i] === 'sealed'));
            })()]);
          };
          // 먼저 굳은 기기는 늦은 기기를 기다리지 않고 곧바로 보낸다(같은 시각에 늦은 기기 확정을 함께 진행)
          await Promise.all([sendSealed(sealed), resolveLate()]);
        } finally { horizon.cancel(); }
        // 굳지 않은 자리 반환 — 불명은 지우기 확인까지 요구하고 실패면 보고(되돌림 실패와 같은 등급).
        // 뒤에서 — 다음 플랫폼의 발송이 이 플랫폼 기기들의 반환을 기다리지 않는다(release 는 호출 즉시 «반환함»을 표시해 겹치지 않는다)
        later(release(armed.filter((c) => unknown.has(c)), 'seal_unknown'));
        later(release(batch));
      }
      const dead = new Set<string>();
      for (const c of claimed) {
        if (attempted.has(c)) {
          // 한 번 시도한 발송은 결과와 무관하게 장부를 그대로 둔다 — 공급사 'fail' 에는 «요청은 닿았으나 응답을 못 받음»도 섞여 있어
          // 다시 보내면 중복이 될 수 있다(관문 11041444 #1). 확실히 닿은 것만 센다.
          const outcome = outcomes.get(c.item.id);
          if (outcome === 'ok') report.sent++;
          else report.skipped.push({ key: c.item.id, reason: `send_${outcome ?? 'unknown'}_kept` });
          if (outcome === 'dead') dead.add(c.item.token);
        }
      }
      // 아직 남은 «시도하지 않은 자리»(마감으로 멈춘 플랫폼 등) — 돌려준다(이미 돌려준 것은 건너뛴다 · 뒤에서)
      later(release(claimed));
      if (dead.size) {
        const ts = [...dead];
        // 목록 제거 «뒤에» 기록 삭제 — 순서는 기존 그대로(관문 11060414 #2: 동시에 보내면 재등록과 겹쳐 목록에서만 빠질 수 있다)
        // (시간 상한을 씌우지 않는다 — 늦은 목록 제거가 기록 삭제·재등록 뒤에 닿는 역전을 만들지 않게, origin/main 과 같은 기다림)
        later(deps.store.srem('push:token_list', ts).catch(() => {}).then(() => deps.store.del(ts.map((t) => `push:tokens:${t}`))));
      }
      // 선점 창이 닫혔거나 마감을 넘겼으면 다음 묶음으로 가지 않는다(잡은 것은 위에서 보냈거나 돌려줬다)
      if (expiring || !inTime || !sendInTime) { report.skipped.push({ key: '*', reason: 'lock_expiring' }); break; }
    }
    report.status = 'ok';
    return report;
  } catch {
    if (report.status === 'no_run_lock') report.status = 'store_unavailable';
    return report;
  } finally {
    // 뒤에서 돌던 반환이 모두 끝난 뒤 잠금을 푼다 — 다음 회차가 반환 중인 자리·상한을 보지 않게
    await Promise.allSettled(bg);
    await deps.store.del([RESULT_KEYS.lock]).catch(() => {});
  }
}
