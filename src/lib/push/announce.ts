// ============================================================================
// 관리자 «공지 푸시» — 문구를 지정해 등록된 모든 기기에 한 번 보내는 경로 (2026-11-14, feat/announce-push-1114)
// ----------------------------------------------------------------------------
// 왜: 운영 푸시는 문구가 고정된 것뿐(모닝·마감·종목 신호·체험 만료·실적 직후)이라 «새 기능» 소식을 보낼 길이 없었다.
// 라우트(/api/admin/announce)는 인증·본문 해석만, 규칙은 여기 한 곳 — 저장소·발송기는 주입(시험은 메모리 저장소·가짜 발송기).
//
// 규칙
//   · 대상 = push:token_list 의 SIGNUM 기기 중 마스터 «알림»을 켠 기기(preferences.enabled !== false) · 마지막 실행 때 시스템 알림 권한이
//     꺼진 기기(notifPerm=false)는 뺀다 · 레코드가 없는 토큰은 설정을 확인할 수 없으니 뺀다(모닝·마감과 달리 보수적으로).
//   · 언어 = 기기 레코드의 locale(ko/ja) · 그 밖은 en · 그 언어 문구가 없으면 en 문구.
//   · 상한 = 전체 24시간에 1회(push:announce:last) · 기기당 7일에 1회(push:announce:dev:<기기키>) · 같은 공지 ID 는 영원히 1회(push:announce:id:<ID>, 만료 없음).
//     값은 실행마다 새 일회용 번호 — Upstash 응답 유실 뒤 클라이언트 재시도가 «자기 자리»에 막히지 않는다.
//   · 200대씩 «자리 잡기 → 보내기» · 요청 시작부터 30초가 지나거나 발송 금지 창에 들어가면 새 묶음을 시작하지 않는다
//     (남은 기기는 자리도 안 잡음 = deferred, 기록 state=partial) → 같은 ID 를 resume:true 로 다시 보내면 남은 기기만 이어 보낸다.
//     공지 ID·24시간 자리는 Lua 한 번으로 «함께» 잡는다(동시 요청 둘이 와도 하나만 통과) · 기기 자리는 보내기 «전에» SET NX —
//     실패(fail)한 기기도 자리를 놓지 않는다(중복보다 한 통 누락을 택함, trial-push 와 같은 원칙).
//   · 조용한 시간(기기 현지 23~07시, 시간대 모르면 조용히)은 소리 없이 · 모닝·마감 발송 창(inPushBlackout)과 겹치면 보내지 않는다(409).
//   · 죽은 토큰(APNs 410/Unregistered·두 게이트웨이 BadDeviceToken · FCM not-registered)은 목록에서 지운다 — 다른 발송기와 같다.
//   · 드라이런 = 대상 수·언어/플랫폼 분포·상한 상태만. 자리·기록·발송 0.
//   · 기록 = push:announce:log:<ID>(400일) + 공지 ID 자리 값(최종 요약으로 덮음) + push:announce:index(최근 ID 목록).
// 탭 = 데이터 type=announce · path(닫힌 목록 lib/app/announceTap) — 앱(app-view/layout.tsx)이 그 화면으로 연다 · 계측 push_open/push_announce.
// ============================================================================
import { createHash } from 'node:crypto';
import type { SignalPushItem, SendOutcome } from '@/lib/push/sendSignal';
import { parseRecord } from '@/lib/push/prefs';
import { devKey, inPushBlackout, inQuietHours, sanitizeTz } from '@/lib/signals/plan';
import { ANNOUNCE_PATHS, ANNOUNCE_PUSH_TYPE, announceTapPath, type AnnouncePath } from '@/lib/app/announceTap';

export type AnnLoc = 'ko' | 'ja' | 'en';
export type AnnPlatform = 'ios' | 'android';
export const ANN_LOCS: AnnLoc[] = ['ko', 'ja', 'en'];
export interface AnnCopy { title: string; body: string }

export const ANN_TITLE_MAX = 60;
export const ANN_BODY_MAX = 200;
/** 한 번에 보내는 기기 상한 — 함수 시간(60초) 안에 끝나게. 넘으면 보내지 않고 413 */
export const ANN_MAX_TARGETS = 5000;
export const ANN_DAY_TTL_S = 24 * 3600;
export const ANN_DEV_TTL_S = 7 * 24 * 3600;
export const ANN_LOG_TTL_S = 400 * 24 * 3600;
/** 과장 금지 — 평생·영구 같은 말은 받지 않는다 */
const BANNED = /평생|영구|무제한|lifetime|forever|unlimited|永久|一生|無制限|ずっと無料/i;

export const ANN_KEYS = {
  claim: (id: string) => `push:announce:id:${id}`,
  last: 'push:announce:last',
  dev: (dev: string) => `push:announce:dev:${dev}`,
  log: (id: string) => `push:announce:log:${id}`,
  index: 'push:announce:index',
  tokens: 'push:token_list',
  token: (t: string) => `push:tokens:${t}`,
};

/**
 * 공지 ID(만료 없음)와 24시간 자리를 함께 — 'ok'(새로 잡음) · 'resume'(같은 공지 이어 보내기) · 'dup' · 'busy'(다른 실행 진행 중) ·
 * 'mismatch'(이어 보내기인데 문구·경로·플랫폼이 다름) · 'expired'(첫 실행 6일 지남 — 기기 7일 자리가 풀리기 전까지만) · 'day'(24시간 안에 다른 공지).
 * ID 자리 값: 진행 중 'S:<이번 시작 ms>:<첫 시작 ms>:<지문>:<실행 번호>' · 일부만 보냄 'P:<멈춘 ms>:<첫 시작 ms>:<지문>' · 끝남 = 기록 JSON(이어 보내기 불가).
 * 24시간 자리 값: '<공지 ID>|<실행 번호>'.
 * ARGV = [실행 번호, 24시간 TTL, resume('1'/'0'), 지금 ms, 멈춘 실행으로 볼 ms, 공지 ID, 지문, 이어 보내기 최대 ms].
 * 응답 유실 뒤 클라이언트가 같은 호출을 다시 보내도 «자기 실행 번호»면 'ok' — 재시도가 자기 자리에 막혀 발송이 빠지지 않게.
 */
export const ANN_CLAIM_LUA =
  "local now = tonumber(ARGV[4]) " +
  "local v = redis.call('GET', KEYS[1]) " +
  "if v and string.sub(v, 1, 2) == 'S:' and string.sub(v, -(#ARGV[1] + 1)) == (':' .. ARGV[1]) then return 'ok' end " +
  "local d = redis.call('GET', KEYS[2]) " +
  "local mine = d and string.sub(d, 1, #ARGV[6] + 1) == (ARGV[6] .. '|') " +
  "local firstS = ARGV[4] " +
  "local res = 'ok' " +
  "if v then " +
  "  if ARGV[3] ~= '1' then return 'dup' end " +
  "  local kind, t, f, fp = string.match(v, '^([PS]):(%d+):(%d+):([0-9a-f]+)') " +
  "  if not kind then return 'dup' end " +
  "  if fp ~= ARGV[7] then return 'mismatch' end " +
  "  if now - tonumber(f) > tonumber(ARGV[8]) then return 'expired' end " +
  "  if kind == 'S' and now - tonumber(t) <= tonumber(ARGV[5]) then return 'busy' end " +
  "  if d and not mine then return 'day' end " +
  "  firstS = f " +
  "  res = 'resume' " +
  "elseif d then return 'day' end " +
  "redis.call('SET', KEYS[1], 'S:' .. ARGV[4] .. ':' .. firstS .. ':' .. ARGV[7] .. ':' .. ARGV[1]) " +
  "redis.call('SET', KEYS[2], ARGV[6] .. '|' .. ARGV[1], 'EX', ARGV[2]) " +
  "return res";
/** 진행 중 표식이 이보다 오래되면 «죽은 실행»으로 보고 resume 을 허용한다(함수 상한 60초의 두 배) */
export const ANN_STALE_MS = 120_000;
/** 이어 보내기는 첫 실행부터 6일까지 — 기기 자리(7일)가 살아 있는 동안만(이미 받은 기기에 다시 가지 않게) */
export const ANN_RESUME_MAX_MS = 6 * 24 * 3600_000;
/** 한 묶음 발송 대기 상한 — 넘으면 그 묶음의 남은 결과는 fail 로 세고 기록까지 마친다(자리는 유지 → 중복 없음) */
export const ANN_SEND_TIMEOUT_MS = 18_000;

/** 공지 내용 지문 — 이어 보내기가 같은 문구·경로·플랫폼일 때만 */
export function announceFingerprint(req: Pick<AnnounceRequest, 'copy' | 'path' | 'platforms'>): string {
  const c = (l: AnnLoc) => (req.copy[l] ? [req.copy[l]!.title, req.copy[l]!.body] : null);
  return createHash('sha256').update(JSON.stringify([c('ko'), c('ja'), c('en'), req.path, [...req.platforms].sort()])).digest('hex').slice(0, 16);
}

/** ID 자리 값 → 진행/일부 표식(아니면 null) */
export function parseClaimMarker(v: unknown): { kind: 'S' | 'P'; at: number; first: number; fp: string } | null {
  if (typeof v !== 'string') return null;
  const m = /^([PS]):(\d+):(\d+):([0-9a-f]+)/.exec(v);
  return m ? { kind: m[1] as 'S' | 'P', at: Number(m[2]), first: Number(m[3]), fp: m[4] } : null;
}

/** 기기 자리 여러 개 — 잡았으면(또는 이번 실행이 이미 잡았으면) 1, 다른 공지가 잡고 있으면 0 (KEYS 순서 그대로) · 값 = 이번 실행 번호 */
export const ANN_DEV_CLAIM_LUA =
  "local out = {} for i = 1, #KEYS do local v = redis.call('GET', KEYS[i]) " +
  "if v == ARGV[1] then out[i] = 1 elseif v then out[i] = 0 else redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2]) out[i] = 1 end end return out";

/** 한 묶음(자리 잡기 → 보내기) 크기 — APNs 동시 요청도 이 수를 넘지 않는다 */
export const ANN_CHUNK = 200;
/** 이 시간이 지나면 새 묶음을 시작하지 않는다(함수 상한 60초 안에 기록까지 끝내게). 남은 기기는 자리를 잡지 않으니 다음 공지가 받는다 */
export const ANN_BUDGET_MS = 30_000;

export interface AnnounceRequest {
  id: string;
  copy: Partial<Record<AnnLoc, AnnCopy>> & { en: AnnCopy };
  path: AnnouncePath;
  dry: boolean;
  platforms: AnnPlatform[];
  /** 같은 ID 의 «일부만 보냄»(또는 죽은 실행)을 이어 보낸다 — 24시간 상한을 다시 묻지 않는다(같은 공지) */
  resume: boolean;
}

const CTRL = /[\u0000-\u001f\u007f]/;
function cleanCopy(x: unknown): AnnCopy | null | 'bad' {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) return 'bad';
  const o = x as Record<string, unknown>;
  if (typeof o.title !== 'string' || typeof o.body !== 'string') return 'bad';
  const title = o.title.trim(), body = o.body.trim();
  if (!title || !body || CTRL.test(title) || CTRL.test(body)) return 'bad';
  if ([...title].length > ANN_TITLE_MAX || [...body].length > ANN_BODY_MAX) return 'bad';
  if (BANNED.test(title) || BANNED.test(body)) return 'bad';
  return { title, body };
}

/** 요청 본문 → 공지 요청. 틀린 칸이 하나라도 있으면 보내지 않는다(400). dry 는 «명시적으로 false» 일 때만 발송이다 */
export function parseAnnounceRequest(x: unknown): { ok: true; req: AnnounceRequest } | { ok: false; error: string } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, error: 'body must be a JSON object' };
  const o = x as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(id)) return { ok: false, error: 'id must match ^[a-z0-9][a-z0-9-]{2,47}$' };
  const rawCopy = o.copy;
  if (!rawCopy || typeof rawCopy !== 'object' || Array.isArray(rawCopy)) return { ok: false, error: 'copy must be an object of {ko,ja,en}' };
  const copy: Partial<Record<AnnLoc, AnnCopy>> = {};
  for (const k of Object.keys(rawCopy as object)) if (!ANN_LOCS.includes(k as AnnLoc)) return { ok: false, error: `copy.${k}: unknown locale` };
  for (const loc of ANN_LOCS) {
    const c = cleanCopy((rawCopy as Record<string, unknown>)[loc]);
    if (c === 'bad') return { ok: false, error: `copy.${loc}: title 1-${ANN_TITLE_MAX} / body 1-${ANN_BODY_MAX} chars, no control chars, no exaggeration` };
    if (c) copy[loc] = c;
  }
  if (!copy.en) return { ok: false, error: 'copy.en is required (fallback for other locales)' };
  const path = announceTapPath(o.path);
  if (!path) return { ok: false, error: `path must be one of ${ANNOUNCE_PATHS.join(', ')}` };
  let platforms: AnnPlatform[] = ['ios', 'android'];
  if (o.platforms !== undefined) {
    if (!Array.isArray(o.platforms) || !o.platforms.length || o.platforms.some((p) => p !== 'ios' && p !== 'android')) return { ok: false, error: 'platforms must be a non-empty subset of ["ios","android"]' };
    platforms = [...new Set(o.platforms as AnnPlatform[])];
  }
  return { ok: true, req: { id, copy: copy as AnnounceRequest['copy'], path, dry: o.dry !== false, platforms, resume: o.resume === true } };
}

export function copyFor(req: Pick<AnnounceRequest, 'copy'>, loc: AnnLoc): AnnCopy {
  return req.copy[loc] ?? req.copy.en;
}

export type SkipReason = 'noRecord' | 'otherApp' | 'optedOut' | 'noPerm' | 'platform';
export interface AnnDevice { token: string; dev: string; platform: AnnPlatform; locale: AnnLoc; tz: string | null }
type TokenRec = { app?: string; platform?: string; locale?: string; preferences?: { enabled?: unknown } | null; notifPerm?: unknown; tz?: unknown };

/** 토큰 + 레코드 → 보낼 기기 또는 뺀 이유 */
export function announceDevice(token: string, raw: unknown, platforms: AnnPlatform[]): AnnDevice | SkipReason {
  const rec = parseRecord<TokenRec>(raw);
  if (!rec) return 'noRecord';
  if (rec.app && rec.app !== 'signum') return 'otherApp';
  if (rec.preferences && typeof rec.preferences === 'object' && rec.preferences.enabled === false) return 'optedOut';
  if (rec.notifPerm === false) return 'noPerm';
  // iOS = APNs 16진 토큰(콜론 없음) · Android = FCM 토큰(콜론 있음) — send.ts planPush 와 같은 판정
  const platform: AnnPlatform = rec.platform === 'ios' || !token.includes(':') ? 'ios' : 'android';
  if (!platforms.includes(platform)) return 'platform';
  const locale: AnnLoc = rec.locale === 'ko' || rec.locale === 'ja' ? rec.locale : 'en';
  return { token, dev: devKey(token), platform, locale, tz: sanitizeTz(rec.tz) ?? null };
}

export interface AnnounceStore {
  smembers(key: string): Promise<string[]>;
  mget(keys: string[]): Promise<unknown[]>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  /** ttlSec 0 = 만료 없음 */
  set(key: string, value: string, ttlSec: number): Promise<unknown>;
  lpush(key: string, value: string): Promise<unknown>;
  srem(key: string, members: string[]): Promise<unknown>;
  del(keys: string[]): Promise<unknown>;
}
export interface AnnounceDeps {
  store: AnnounceStore;
  send: (items: SignalPushItem[]) => Promise<Map<string, SendOutcome>>;
  now?: () => number;
  /** 경과 시간 시계(시험용) — 기본 Date.now */
  clock?: () => number;
  /** 이번 실행 번호(시험용) — 기본 무작위 */
  nonce?: string;
}

type Split = Record<AnnPlatform, Record<AnnLoc, number>>;
const emptySplit = (): Split => ({ ios: { ko: 0, ja: 0, en: 0 }, android: { ko: 0, ja: 0, en: 0 } });

export interface AnnounceReport {
  ok: boolean;
  status: number;
  dry: boolean;
  id: string;
  at: string;
  reason?: 'blackout' | 'duplicate' | 'daily_cap' | 'too_many_targets' | 'in_progress' | 'slow' | 'resume_mismatch';
  resumed?: boolean;
  /** 드라이런 — 지금 보내면 막힐 이유(없으면 null) */
  wouldBlock?: 'blackout' | 'duplicate' | 'resumable' | 'daily_cap' | 'too_many_targets' | null;
  path: AnnouncePath;
  platforms: AnnPlatform[];
  tokens: number;
  /** 상한(기기 7일)까지 통과한 실제 대상 */
  targets: number;
  split: Split;
  skipped: Record<SkipReason | 'weeklyCap', number>;
  quiet: number;
  sent: number;
  fail: number;
  dead: number;
  sentSplit: Split;
  /** 시간 예산이 끝나 이번에 자리도 잡지 않고 보내지 않은 기기 */
  deferred: number;
  preview: Record<AnnLoc, AnnCopy>;
}

async function readRecords(store: AnnounceStore, tokens: string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const recs = await store.mget(chunk.map(ANN_KEYS.token));
    for (let j = 0; j < chunk.length; j++) out.push(recs?.[j] ?? null);
  }
  return out;
}

export async function runAnnounce(req: AnnounceRequest, deps: AnnounceDeps): Promise<AnnounceReport> {
  const now = (deps.now ?? Date.now)();
  const { store } = deps;
  const report: AnnounceReport = {
    ok: true, status: 200, dry: req.dry, id: req.id, at: new Date(now).toISOString(), path: req.path, platforms: req.platforms,
    tokens: 0, targets: 0, split: emptySplit(),
    skipped: { noRecord: 0, otherApp: 0, optedOut: 0, noPerm: 0, platform: 0, weeklyCap: 0 },
    quiet: 0, sent: 0, fail: 0, dead: 0, sentSplit: emptySplit(), deferred: 0,
    preview: { ko: copyFor(req, 'ko'), ja: copyFor(req, 'ja'), en: copyFor(req, 'en') },
  };
  const stop = (status: number, reason: NonNullable<AnnounceReport['reason']>) => ({ ...report, ok: false, status, reason });

  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const elapsed = () => clock() - t0;
  const blackout = inPushBlackout(now);
  if (!req.dry && blackout) return stop(409, 'blackout');

  // 1) 기기 목록(읽기만)
  const tokens = [...new Set(((await store.smembers(ANN_KEYS.tokens)) || []).filter((t) => typeof t === 'string' && t))];
  report.tokens = tokens.length;
  const recs = await readRecords(store, tokens);
  const devices: AnnDevice[] = [];
  const seenDev = new Set<string>();
  tokens.forEach((t, i) => {
    const d = announceDevice(t, recs[i], req.platforms);
    if (typeof d === 'string') { report.skipped[d]++; return; }
    if (seenDev.has(d.dev)) return;
    seenDev.add(d.dev);
    devices.push(d);
  });

  // 2) 드라이런 — 상한 상태만 읽는다(자리·기록·발송 0)
  if (req.dry) {
    const [claimed, last] = await store.mget([ANN_KEYS.claim(req.id), ANN_KEYS.last]);
    let capped = 0;
    const open: AnnDevice[] = [];
    for (let i = 0; i < devices.length; i += 100) {
      const chunk = devices.slice(i, i + 100);
      const vals = await store.mget(chunk.map((d) => ANN_KEYS.dev(d.dev)));
      chunk.forEach((d, j) => { if (vals?.[j] != null) capped++; else open.push(d); });
    }
    report.skipped.weeklyCap = capped;
    for (const d of open) { report.split[d.platform][d.locale]++; if (inQuietHours(d.tz, now)) report.quiet++; }
    report.targets = open.length;
    const mk = parseClaimMarker(claimed);
    const lastMine = typeof last === 'string' && last.startsWith(`${req.id}|`);
    const resumable = !!mk && req.resume && mk.fp === announceFingerprint(req) && now - mk.first <= ANN_RESUME_MAX_MS && (mk.kind === 'P' || now - mk.at > ANN_STALE_MS) && (last == null || lastMine);
    report.wouldBlock = blackout ? 'blackout' : claimed != null ? (resumable ? 'resumable' : 'duplicate') : last != null ? 'daily_cap' : devices.length > ANN_MAX_TARGETS ? 'too_many_targets' : null;
    return report;
  }

  if (devices.length > ANN_MAX_TARGETS) return stop(413, 'too_many_targets');

  // 목록 읽기가 예산을 다 썼으면 자리를 잡기 전에 그만둔다(아무것도 안 보냄 · 같은 ID 로 다시 가능)
  if (elapsed() > ANN_BUDGET_MS) return stop(503, 'slow');

  // 3) 공지 ID + 24시간 자리 — 원자적으로 함께(이번 실행 값으로 — 재시도해도 자기 자리)
  const nonce = (deps.nonce ?? `${now.toString(36)}${Math.random().toString(36).slice(2, 12)}`).replace(/[^a-z0-9]/gi, '');
  const fp = announceFingerprint(req);
  const c = await store.eval(ANN_CLAIM_LUA, [ANN_KEYS.claim(req.id), ANN_KEYS.last],
    [nonce, String(ANN_DAY_TTL_S), req.resume ? '1' : '0', String(now), String(ANN_STALE_MS), req.id, fp, String(ANN_RESUME_MAX_MS)]);
  if (c === 'dup' || c === 'expired') return stop(409, 'duplicate');
  if (c === 'mismatch') return stop(409, 'resume_mismatch');
  if (c === 'busy') return stop(409, 'in_progress');
  if (c !== 'ok' && c !== 'resume') return stop(429, 'daily_cap');
  // 이전 실행 기록 — 늘 읽는다(이어 보내기의 응답이 유실돼 재시도가 'ok' 를 받아도 누적이 빠지지 않게). 새 공지면 없다
  const [prevRaw, curRaw] = await store.mget([ANN_KEYS.log(req.id), ANN_KEYS.claim(req.id)]).catch(() => [null, null]);
  const prevLog = parseRecord<{ runs?: unknown[] }>(prevRaw);
  // 첫 실행 시각 = Lua 가 자리에 남긴 값(기록 전에 죽은 실행이 있어도 원래 시각을 잇는다 — 이어 보내기 6일 기한이 초기화되지 않게)
  const first = parseClaimMarker(curRaw)?.first ?? now;
  const prevRuns = Array.isArray(prevLog?.runs) ? prevLog!.runs : [];
  if (c === 'resume' || prevRuns.length) report.resumed = true;

  // 4) 묶음마다: 기기 자리(7일, 보내기 전) → 보내기 · 기기 언어 문구 · 조용한 시간은 소리 없이
  const dead: string[] = [];
  for (let i = 0; i < devices.length; i += ANN_CHUNK) {
    // 시간 예산 · 발송 금지 창(모닝·마감)을 묶음마다 다시 본다
    if (elapsed() > ANN_BUDGET_MS || inPushBlackout(now + elapsed())) { report.deferred = devices.length - i; break; }
    const chunk = devices.slice(i, i + ANN_CHUNK);
    const res = await store.eval(ANN_DEV_CLAIM_LUA, chunk.map((d) => ANN_KEYS.dev(d.dev)), [nonce, String(ANN_DEV_TTL_S)]);
    const arr = Array.isArray(res) ? res : [];
    const picked: AnnDevice[] = [];
    chunk.forEach((d, j) => { if (Number(arr[j]) === 1) picked.push(d); else report.skipped.weeklyCap++; });
    report.targets += picked.length;
    const sendAt = now + elapsed();
    const items: SignalPushItem[] = picked.map((d) => {
      const quiet = inQuietHours(d.tz, sendAt);
      if (quiet) report.quiet++;
      report.split[d.platform][d.locale]++;
      const copy = copyFor(req, d.locale);
      return {
        id: d.dev, token: d.token, platform: d.platform, title: copy.title, body: copy.body, quiet, thread: `announce-${req.id}`,
        data: { type: ANNOUNCE_PUSH_TYPE, path: req.path, aid: req.id, src: 'push_announce', locale: d.locale },
      };
    });
    if (!items.length) continue;
    let outcomes = new Map<string, SendOutcome>();
    let to: ReturnType<typeof setTimeout> | undefined;
    try {
      outcomes = await Promise.race([
        deps.send(items),
        new Promise<Map<string, SendOutcome>>((resolve) => { to = setTimeout(() => resolve(new Map()), ANN_SEND_TIMEOUT_MS); }),
      ]);
    } catch { outcomes = new Map(); } finally { if (to) clearTimeout(to); }
    for (const it of items) {
      const o = outcomes.get(it.id) ?? 'fail';
      if (o === 'ok') { report.sent++; report.sentSplit[it.platform as AnnPlatform][(it.data.locale as AnnLoc)]++; }
      else { report.fail++; if (o === 'dead') { report.dead++; dead.push(it.token); } }
    }
  }

  // 6) 죽은 토큰 정리 · 기록 — 기록 실패가 응답을 막지 않게
  try {
    if (dead.length) {
      await store.srem(ANN_KEYS.tokens, dead);
      await store.del(dead.map(ANN_KEYS.token));
    }
  } catch { /* 다음 발송기가 다시 정리한다 */ }
  const state = report.deferred ? 'partial' : 'done';
  const run = { at: report.at, resumed: !!report.resumed, targets: report.targets, sent: report.sent, fail: report.fail, dead: report.dead, deferred: report.deferred, skipped: report.skipped, split: report.split, sentSplit: report.sentSplit, quiet: report.quiet };
  const runs = [...prevRuns, run] as Array<typeof run>;
  const totals = runs.reduce((a, r) => ({ targets: a.targets + (r.targets || 0), sent: a.sent + (r.sent || 0), fail: a.fail + (r.fail || 0), dead: a.dead + (r.dead || 0) }), { targets: 0, sent: 0, fail: 0, dead: 0 });
  const log = JSON.stringify({ state, id: req.id, first, path: req.path, platforms: req.platforms, copy: req.copy, totals, deferred: report.deferred, runs });
  try {
    await store.set(ANN_KEYS.log(req.id), log, ANN_LOG_TTL_S);
    // 같은 ID 자리: 끝났으면 기록(만료 없음 — 영원히 1회) · 일부만이면 'P:' 표식(resume 으로 이어 보낼 수 있게)
    await store.set(ANN_KEYS.claim(req.id), state === 'done' ? log : `P:${now}:${first}:${fp}`, 0);
    await store.lpush(ANN_KEYS.index, JSON.stringify({ id: req.id, at: report.at, targets: report.targets, sent: report.sent, fail: report.fail }));
  } catch { /* 자리는 이미 잡혔다 — 중복은 생기지 않는다 */ }
  return report;
}
