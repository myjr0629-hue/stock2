/**
 * «🎁 친구에게 PRO 1개월 선물» 앱 내 1회 안내 — 2026-10-08 (브랜치 feat/gift-announce, 대표 승인 «그렇게해»)
 *
 * 왜: 기존 사용자에게 선물 기능을 알리는 가장 빠른 길은 푸시지만, 애플 4.5.4 는 홍보 푸시에 «따로 받은 동의»를 요구한다
 *   (지금 알림 동의는 브리핑용). 그래서 «앱을 열 때 딱 한 번» 작은 카드로 알린다. 화면 배치·하단 메뉴·광고 칸은 그대로다.
 *
 * 언제(전부 만족할 때 한 번, 기기마다 평생 1회):
 *   ① 선물이 켜져 있다(/api/gift/config live — 꺼지면 이 안내도 없다)
 *   ② localStorage 를 쓸 수 있다(못 쓰면 «한 번»을 지킬 수 없으니 띄우지 않는다)
 *   ③ 아직 띄운 적이 없다(GIFT_ANNOUNCE_KEY)
 *   ④ 첫 안내(AppFirstRunOnboarding)를 «이번 실행 전에» 이미 마쳤다 — 막 설치한 사람의 첫 실행엔 띄우지 않는다
 *   ⑤ 대시보드(홈) 화면이다 — 다른 화면에서 하던 일을 끊지 않는다
 *   ⑥ 이번 실행이 평점 요청 회차(앱 세션 3·10번째, lib/app/reviewMoments)가 아니다 — OS 평점 시트와 겹치지 않게
 *   ⑦ 다른 시트·결제 창(aria-modal)이 떠 있지 않다
 * 시점: 대시보드가 뜬 뒤 3.5초 — 첫 화면의 숫자를 본 다음(평점 요청 2.5초보다 늦게).
 * 측정: 띄움 = share-hit 'open' · 누름 'tap' · 보냄 'sent'(표면 gift_pop) — scripts/mkt-gift.js 가 센다.
 *
 * 순수 함수(저장소·경로를 인자로 받는다) — tests/giftAnnounce.test.ts 가 고정한다.
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

export type AnnounceBlock = 'off' | 'nostore' | 'seen' | 'new' | 'route' | 'review' | 'busy';

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
}

export const isDashPath = (path: string): boolean => /\/app-view\/dash\/?$/.test(path);

/** 띄우면 안 되는 이유(없으면 null = 띄운다). 검사 순서 = 위 머리말 ①~⑦. */
export function giftAnnounceBlock(i: AnnounceInput): AnnounceBlock | null {
  if (!i.live) return 'off';
  if (!i.store) return 'nostore';
  try {
    if (i.store.getItem(GIFT_ANNOUNCE_KEY)) return 'seen';
  } catch {
    return 'nostore';
  }
  if (!i.onboardedAtMount) return 'new';
  if (!isDashPath(i.path)) return 'route';
  try {
    const n = parseInt(i.store.getItem(APP_SESSION_REVIEW.storageKey) || '0', 10) || 0;
    if ((APP_SESSION_REVIEW.milestones ?? []).includes(n)) return 'review';
  } catch { /* 회차를 못 읽으면 겹침 검사만 건너뛴다 */ }
  if (i.dialogOpen) return 'busy';
  return null;
}

/** 띄운 순간 표식 — 쓰기에 실패하면 false(호출자는 띄우지 않는다: 매번 뜨는 것보다 안 뜨는 게 낫다). */
export function markGiftAnnounced(store: StoreLike | null, now = Date.now()): boolean {
  if (!store) return false;
  try {
    store.setItem(GIFT_ANNOUNCE_KEY, String(now));
    return store.getItem(GIFT_ANNOUNCE_KEY) === String(now);
  } catch {
    return false;
  }
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
