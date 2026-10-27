/**
 * «🎁 친구에게 PRO 1개월 선물» 앱 내 안내 — 2026-10-08 (브랜치 feat/gift-announce, 대표 승인 «그렇게해»)
 *   ★2026-10-27 노출 확대(대표 «안내 노출 늘려서 선물 더 퍼지게 해», 브랜치 feat/gift-announce-reach)
 *
 * 왜: 기존 사용자에게 선물 기능을 알리는 가장 빠른 길은 푸시지만, 애플 4.5.4 는 홍보 푸시에 «따로 받은 동의»를 요구한다
 *   (지금 알림 동의는 브리핑용). 그래서 «앱 안»에서 작은 카드로 알린다. 화면 배치·하단 메뉴·광고 칸·문구는 그대로다.
 *
 * 10/27 확대 근거(운영 레디스 실측, ET 10/26): 앱 활성 기기 27(iOS 17·안드 10) · 대시보드 실행 43(«오늘 볼 것» 노출) → 띄움 2.
 *   10/7~10/26 누적 띄움 122 — 하루 활성 기기(16~69)보다 많다 = 돌아오는 사용자 대부분이 «평생 1회»를 이미 써 버렸다(옛 'seen').
 *   → 평생 1회 → «탭·보냄 전까지 최대 3회, 48시간 간격» + 대시보드 밖 «좋은 순간»(실적 캘린더·장마감 리포트를 읽은 뒤) 입구.
 *
 * 언제(전부 만족할 때, 한 실행에 최대 1회):
 *   ① 선물이 켜져 있다(/api/gift/config live — 꺼지면 이 안내도 없다)
 *   ② localStorage 를 쓸 수 있다(못 쓰면 횟수·간격을 지킬 수 없으니 띄우지 않는다)
 *   ③ 이 기기에서 선물 링크를 «누른» 적이 없다(안내·설정 카드·대시보드 단추 어디서든 — 'stop')
 *   ④ 띄운 횟수 < 3('cap') · 마지막으로 띄운 지 48시간이 지났다('gap') — 옛 표식(첫 띄움 시각 숫자)은 «1회»로 읽는다
 *   ⑤ 첫 안내(AppFirstRunOnboarding)를 «이번 실행 전에» 이미 마쳤다 — 막 설치한 사람의 첫 실행엔 띄우지 않는다('new')
 *   ⑥ 대시보드(홈) 화면이다('route') — 또는 «좋은 순간»(실적 캘린더·장마감 리포트 탭에서 GIFT_MOMENT_DWELL_MS 머문 뒤, useGiftMoment)
 *   ⑦ 이번 실행이 평점 요청 회차(앱 세션 3·10번째, lib/app/reviewMoments)가 아니고, 최근 60초 안에 OS 평점 시트를 요청하지 않았다
 *      (인텔 열람·담기·AI 한 줄 순간 — hooks/useReviewPrompt reviewRequestedAt) — OS 평점 시트와 겹치지 않게('review')
 *   ⑧ 다른 시트·결제 창(aria-modal)이 떠 있지 않다('busy')
 * 시점: 대시보드가 뜬 뒤 3.5초 — 첫 화면의 숫자를 본 다음(평점 요청 2.5초보다 늦게).
 * 측정: 띄움 = share-hit 'open' · 누름 'tap' · 보냄 'sent'(표면 gift_pop) · 어디서 띄웠나 'at:dash|earn|report'
 *   · 막힌 이유 'block:<사유>'(실행당 사유마다 1회, 하루 합계 숫자만 — 식별자 없음) — scripts/mkt-gift.js 가 센다.
 *
 * 순수 함수(저장소·경로·시각을 인자로 받는다) — tests/giftAnnounce.test.ts 가 고정한다.
 */
import { APP_SESSION_REVIEW } from '@/lib/app/reviewMoments';
import type { GiftLang } from './gift';

export const GIFT_ANNOUNCE_KEY = 'signumhq.gift.announce.v1';
/** AppFirstRunOnboarding 의 STORAGE_KEY 와 같은 값('accepted' = 첫 안내를 마쳤다) */
export const ONBOARDING_DONE_KEY = 'signumhq.app.onboarding.v1';
export const GIFT_ANNOUNCE_DELAY_MS = 3500;
/** 시트가 떠 있어 미뤘을 때 한 번 더 볼 때까지 */
export const GIFT_ANNOUNCE_RETRY_MS = 5000;

export interface StoreLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** 최대 띄움 횟수(탭·보냄 전까지) */
export const GIFT_ANNOUNCE_MAX = 3;
/** 띄움 사이 최소 간격 */
export const GIFT_ANNOUNCE_GAP_MS = 48 * 3600_000;
/** «좋은 순간» — 그 화면에 이만큼 머문 뒤 */
export const GIFT_MOMENT_DWELL_MS = 10_000;
/** OS 평점 시트를 요청한 뒤 이만큼은 띄우지 않는다(인텔 열람·담기·AI 한 줄 등 어떤 순간이든 — hooks/useReviewPrompt) */
export const GIFT_REVIEW_QUIET_MS = 60_000;
/** «좋은 순간» 알림 이벤트(useGiftMoment → GiftAnnounceHost) */
export const GIFT_MOMENT_EVENT = 'sg:gift-moment';
export type GiftMomentWhere = 'earn' | 'report';
export type GiftShowAt = 'dash' | GiftMomentWhere;

export type AnnounceBlock = 'off' | 'nostore' | 'stop' | 'cap' | 'gap' | 'new' | 'route' | 'review' | 'busy';
/** 집계하는 사유(닫힌 목록 — 서버 /api/share-hit 도 같은 목록만 받는다). 'off'(설정 꺼짐)·'route'(대시보드로 오면 다시 잰다)는 세지 않는다. */
export const GIFT_BLOCK_METRICS = ['nostore', 'stop', 'cap', 'gap', 'new', 'review', 'busy'] as const;

export interface AnnounceState {
  /** 띄운 횟수 */
  n: number;
  /** 마지막으로 띄운 시각(ms) */
  last: number;
  /** 선물 링크를 눌렀다(이 뒤로는 안내하지 않는다) */
  stop?: 1;
}

/**
 * 표식 읽기 — 없음 = 처음. 옛 표식(첫 띄움 시각 숫자, 10/8~10/27)은 «1회 · 그 시각»으로 읽는다.
 * 알 수 없는 값은 «한도 다 씀»으로 본다(매번 뜨는 것보다 안 뜨는 게 낫다). 저장소가 던지면 null.
 */
export function readAnnounceState(store: StoreLike | null): AnnounceState | null {
  if (!store) return null;
  let raw: string | null;
  try { raw = store.getItem(GIFT_ANNOUNCE_KEY); } catch { return null; }
  if (raw == null || raw === '') return { n: 0, last: 0 };
  if (/^\d{1,16}$/.test(raw)) return { n: 1, last: Number(raw) };
  try {
    const o = JSON.parse(raw) as { n?: unknown; last?: unknown; stop?: unknown };
    const n = Number(o?.n), last = Number(o?.last);
    if (Number.isInteger(n) && n >= 0 && Number.isFinite(last) && last >= 0) return o.stop ? { n, last, stop: 1 } : { n, last };
  } catch { /* 깨진 값 */ }
  return { n: GIFT_ANNOUNCE_MAX, last: 0 };
}

export interface AnnounceInput {
  /** 선물 설정이 켜져 있다(useGiftConfig 가 null 이 아님) */
  live: boolean;
  /** localStorage — 접근이 막히면 null */
  store: StoreLike | null;
  /** 이번 실행이 시작될 때 첫 안내를 이미 마친 상태였다 */
  onboardedAtMount: boolean;
  /** 지금 경로(window.location.pathname) */
  path: string;
  /** 다른 시트·결제 창이 떠 있다 */
  dialogOpen: boolean;
  /** 지금 시각(ms) */
  now: number;
  /** «좋은 순간» 입구 — 경로 검사(⑥ 대시보드)를 건너뛴다(부른 화면이 이미 그 순간을 확인했다) */
  moment?: boolean;
  /** 이번 실행에서 마지막으로 OS 평점 시트를 요청한 시각(ms, 없으면 0) */
  reviewAt?: number;
}

export const isDashPath = (path: string): boolean => /\/app-view\/dash\/?$/.test(path);
/** 실적 캘린더(«좋은 순간» 입구 — GiftAnnounceHost 가 경로로 잰다) */
export const isEarningsPath = (path: string): boolean => /\/app-view\/earnings\/?$/.test(path);

/** 띄우면 안 되는 이유(없으면 null = 띄운다). 검사 순서 = 위 머리말 ①~⑧. */
export function giftAnnounceBlock(i: AnnounceInput): AnnounceBlock | null {
  if (!i.live) return 'off';
  const st = readAnnounceState(i.store);
  if (!st) return 'nostore';
  if (st.stop) return 'stop';
  if (st.n >= GIFT_ANNOUNCE_MAX) return 'cap';
  if (st.n > 0 && i.now - st.last < GIFT_ANNOUNCE_GAP_MS) return 'gap';
  if (!i.onboardedAtMount) return 'new';
  if (!i.moment && !isDashPath(i.path)) return 'route';
  try {
    const n = parseInt(i.store!.getItem(APP_SESSION_REVIEW.storageKey) || '0', 10) || 0;
    if ((APP_SESSION_REVIEW.milestones ?? []).includes(n)) return 'review';
  } catch { /* 회차를 못 읽으면 겹침 검사만 건너뛴다 */ }
  if (i.reviewAt && i.now - i.reviewAt < GIFT_REVIEW_QUIET_MS) return 'review';
  if (i.dialogOpen) return 'busy';
  return null;
}

/** 띄운 순간 표식(횟수 +1 · 시각) — 쓰기에 실패하면 false(호출자는 띄우지 않는다: 매번 뜨는 것보다 안 뜨는 게 낫다). */
export function markGiftAnnounced(store: StoreLike | null, now = Date.now()): boolean {
  const st = readAnnounceState(store);
  if (!store || !st) return false;
  const next = JSON.stringify(st.stop ? { n: st.n + 1, last: now, stop: 1 } : { n: st.n + 1, last: now });
  try {
    store.setItem(GIFT_ANNOUNCE_KEY, next);
    return store.getItem(GIFT_ANNOUNCE_KEY) === next;
  } catch {
    return false;
  }
}

/** 선물 링크를 눌렀다(어느 입구든) — 이 기기에는 더 안내하지 않는다. 실패는 삼킨다(최악이면 최대 3회 안에서 한 번 더 뜬다). */
export function markGiftAnnounceStop(store: StoreLike | null): void {
  const st = readAnnounceState(store);
  if (!store || !st || st.stop) return;
  try { store.setItem(GIFT_ANNOUNCE_KEY, JSON.stringify({ n: st.n, last: st.last, stop: 1 })); } catch { /* 저장소 막힘 */ }
}

/** 첫 안내를 마쳤나 — 실행 시작 때 한 번 읽는다. */
export function readOnboarded(store: StoreLike | null): boolean {
  try {
    return !!store && store.getItem(ONBOARDING_DONE_KEY) === 'accepted';
  } catch {
    return false;
  }
}

/** 경로 첫 칸(/ko/app-view/… → ko)으로 문구 언어를 고른다 — 화면 언어와 같은 값. */
export const localeFromPath = (path: string): string => (path.split('/')[1] || 'en');

// 제목·부제(자동 갱신 고지 포함)는 GIFT_COPY(title·sub·subIosOnly)를 그대로 쓴다 — 설정 카드와 한 문장.
export interface GiftAnnounceCopy {
  eyebrow: string; cta: string; later: string; close: string;
  /** 줄 끝에서 쪼개면 안 되는 묶음(제목·부제) — iOS 웹뷰는 일본어 구절 줄바꿈(auto-phrase)을 몰라 «1か/月»처럼 끊는다(10/8 로컬 실측) */
  keep: string[];
}
export const GIFT_ANNOUNCE_COPY: Record<GiftLang, GiftAnnounceCopy> = {
  ko: { eyebrow: '새 기능', cta: '선물 링크 보내기', later: '설정에서 언제든 다시 보낼 수 있어요', close: '닫기',
    keep: ['PRO 1개월', '자동 갱신', '언제든 해지'] },
  en: { eyebrow: 'NEW', cta: 'Send gift link', later: 'You can send it again anytime from Settings', close: 'Close',
    keep: ['1 month', 'auto-renews', 'cancel anytime'] },
  ja: { eyebrow: '新機能', cta: 'ギフトリンクを送る', later: '設定からいつでも送れます', close: '閉じる',
    keep: ['PRO 1か月無料', 'PRO 1か月', 'プレゼント', 'iPhoneの', '友だち', 'リンクから', '始めると', '以降は', '自動更新、', 'いつでも解約可'] },
};

/** 글을 «묶음(nb=true)»과 나머지로 나눈다 — 화면은 묶음을 white-space:nowrap 으로 감싼다. 긴 묶음부터 맞춘다. */
export function keepTogether(text: string, keep: string[]): { t: string; nb: boolean }[] {
  const ks = keep.filter(Boolean).sort((a, b) => b.length - a.length);
  const out: { t: string; nb: boolean }[] = [];
  let rest = text;
  while (rest) {
    let at = -1, hit = '';
    for (const k of ks) {
      const i = rest.indexOf(k);
      if (i >= 0 && (at < 0 || i < at || (i === at && k.length > hit.length))) { at = i; hit = k; }
    }
    if (at < 0) { out.push({ t: rest, nb: false }); break; }
    if (at > 0) out.push({ t: rest.slice(0, at), nb: false });
    out.push({ t: hit, nb: true });
    rest = rest.slice(at + hit.length);
  }
  return out;
}
