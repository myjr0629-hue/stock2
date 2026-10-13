import { sanitizeTickers, sanitizeTz } from '@/lib/signals/sanitize';

/**
 * 푸시 알림 선호(설정 › 알림 토글 3개)와 토큰 레코드 병합 — 순수 함수만 (2026-10-12, feat/push-ai-line).
 *
 * 옛 결함(INTERNAL-MEASURE §4.2 실측):
 *   ① 발송(send.ts)이 preferences 를 읽지 않았다 — 토글을 꺼도 그대로 받았다(애플 4.5.4 옵트아웃 위험).
 *   ② 앱을 켤 때마다 등록 POST 가 `{morning:true, closing:true}` 로 덮어썼다 — 끈 선호가 다음 실행에 되살아났다.
 *   ③ 마스터 «알림» 토글(enabled)은 서버로 가지 않았다.
 *   ④ createdAt 이 실행마다 갱신돼 신규 등록 코호트를 셀 수 없었다.
 * 고친 규칙:
 *   · 발송 = enabled !== false && preferences[type] !== false (값이 없으면 받는다 — 예전 레코드 호환)
 *   · 등록 = «새 토큰만» 기본값 true. 기존 레코드의 선호는 유지. 단 기기가 저장된 선호(설정 화면의 실제 토글 값)를 함께 보내면 그 값으로 맞춘다.
 *   · createdAt 유지 · lastSeenAt = 이번 등록 시각 · firstSeenAt = 새 토큰일 때만(신규 코호트를 센다)
 */

export type PushType = 'morning' | 'closing' | 'signals';

/** signals(내 종목 이상 신호) 는 «없으면 켜짐» — 값이 없는 옛 레코드·새 토큰의 기본 객체는 세 칸 그대로 둔다(기존 계약 불변) */
export interface PushPrefs { enabled: boolean; morning: boolean; closing: boolean; signals?: boolean }

export const DEFAULT_PREFS: PushPrefs = { enabled: true, morning: true, closing: true };

export interface PushTokenRecord {
  token: string;
  platform: string;
  locale: string;
  app: 'signum' | 'wim';
  createdAt: string;
  lastSeenAt?: string;
  /** 정말 처음 등록된 시각 — 2026-10-12 이후 새로 생긴 토큰에만 있다(옛 레코드의 createdAt 은 실행마다 갱신돼 믿을 수 없다) */
  firstSeenAt?: string;
  preferences?: Partial<PushPrefs>;
  /** 내 종목 사본(2026-10-13, 내 종목 이상 신호) — 기기 목록이 원본이고 서버는 알림용 사본만 갖는다. 앱을 켤 때·목록이 바뀔 때 다시 올라온다 */
  watchlist?: { t: string[]; at: string };
  /** 기기 시간대(IANA) — 조용한 시간(현지 23~07시)에 소리 없이 보내는 데만 쓴다 */
  tz?: string;
  /** 마지막 앱 실행 때 시스템 알림 권한 — false 면 신호를 보내지 않는다(권한이 없으면 안 보낸다) */
  notifPerm?: boolean;
}

/** 이 기기가 이 종류의 푸시를 받기로 했나 — 값이 없으면 받는다(옛 레코드·새 토큰 기본값) */
export function wantsPush(rec: { preferences?: Partial<PushPrefs> | null } | null | undefined, type: PushType): boolean {
  const p = rec?.preferences;
  if (!p || typeof p !== 'object') return true;
  if (p.enabled === false) return false;
  return p[type] !== false;
}

/** 요청 본문의 선호 — 불리언인 칸만 받는다(그 밖은 «보내지 않음»으로 본다) */
export function sanitizePrefs(x: unknown): Partial<PushPrefs> | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const out: Partial<PushPrefs> = {};
  for (const k of ['enabled', 'morning', 'closing', 'signals'] as const) {
    if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  }
  return Object.keys(out).length ? out : null;
}

/** 기존 선호 + 바꿀 칸 → 세 칸이 다 찬 선호 */
export function mergePrefs(existing: Partial<PushPrefs> | null | undefined, patch: Partial<PushPrefs> | null | undefined): PushPrefs {
  const base: PushPrefs = { ...DEFAULT_PREFS };
  for (const k of ['enabled', 'morning', 'closing'] as const) {
    if (existing && typeof existing[k] === 'boolean') base[k] = existing[k] as boolean;
    if (patch && typeof patch[k] === 'boolean') base[k] = patch[k] as boolean;
  }
  // signals 는 한 번이라도 값이 오간 기기에만 칸이 생긴다(없으면 켜짐 — 기존 세 칸 객체는 그대로)
  if (existing && typeof existing.signals === 'boolean') base.signals = existing.signals;
  if (patch && typeof patch.signals === 'boolean') base.signals = patch.signals;
  return base;
}

/**
 * 등록 POST → 저장할 레코드. 기존 레코드가 있으면 선호·createdAt 을 지킨다.
 *   incoming.preferences — 기기가 «저장된 선호»를 보냈을 때만(설정 화면을 한 번이라도 만진 기기). 없으면 기존 값 유지, 새 토큰이면 기본값 true.
 */
export function mergeRegistration(
  existing: Partial<PushTokenRecord> | null | undefined,
  incoming: { token: string; platform?: unknown; locale?: unknown; app: 'signum' | 'wim'; preferences?: unknown; tickers?: unknown; tz?: unknown; notifPerm?: unknown },
  nowIso: string,
): PushTokenRecord {
  const prev = existing && typeof existing === 'object' ? existing : null;
  const patch = sanitizePrefs(incoming.preferences);
  // 내 종목 사본(2026-10-13): 목록을 «보냈을 때만» 바꾼다. 빈 목록 = 사본 삭제. 보내지 않으면(옛 앱·언어 변경 재등록) 기존 값을 지킨다.
  const tickers = sanitizeTickers(incoming.tickers);
  const watchlist = tickers ? (tickers.length ? { t: tickers, at: nowIso } : undefined) : prev?.watchlist;
  const tz = sanitizeTz(incoming.tz) ?? (typeof prev?.tz === 'string' ? prev.tz : undefined);
  const notifPerm = typeof incoming.notifPerm === 'boolean' ? incoming.notifPerm : (typeof prev?.notifPerm === 'boolean' ? prev.notifPerm : undefined);
  return {
    token: incoming.token,
    platform: typeof incoming.platform === 'string' && incoming.platform ? incoming.platform : (prev?.platform || 'unknown'),
    locale: typeof incoming.locale === 'string' && incoming.locale ? incoming.locale : (prev?.locale || 'en'),
    app: incoming.app,
    createdAt: typeof prev?.createdAt === 'string' && prev.createdAt ? prev.createdAt : nowIso,
    lastSeenAt: nowIso,
    ...(prev ? (typeof prev.firstSeenAt === 'string' ? { firstSeenAt: prev.firstSeenAt } : {}) : { firstSeenAt: nowIso }),
    preferences: mergePrefs(prev?.preferences, patch),
    ...(watchlist ? { watchlist } : {}),
    ...(tz ? { tz } : {}),
    ...(notifPerm !== undefined ? { notifPerm } : {}),
  };
}

/** 레디스 값 → 객체(문자열 JSON·객체 둘 다 받는다 — Upstash 자동 역직렬화 여부와 무관) */
export function parseRecord<T = any>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw) as T; } catch { return null; } }
  return typeof raw === 'object' ? (raw as T) : null;
}

/** 클라이언트: 설정 화면이 저장한 선호(localStorage `signumhq.push.prefs`) — 한 번도 만지지 않았으면 null(서버 값을 건드리지 않는다) */
export const PUSH_PREFS_STORAGE_KEY = 'signumhq.push.prefs';
export function readStoredPushPrefs(): Partial<PushPrefs> | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(PUSH_PREFS_STORAGE_KEY);
    return raw ? sanitizePrefs(JSON.parse(raw)) : null;
  } catch { return null; }
}
