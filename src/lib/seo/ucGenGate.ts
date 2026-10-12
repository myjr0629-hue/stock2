/**
 * UC 종목 카드(AI 해석)를 «새로 만들어도 되는 요청인가» — 순수 함수 (2026-10-12 대표 «크레딧 합리적 최적 사용»).
 *
 * 왜 (실측 10/12):
 *   · UC 는 24시간 6,114회·$6.58 로 크레딧의 59% 를 쓴다. 호출 지점은 거의 다 웹 종목 페이지(/[locale]/flow/[ticker])가 «사본이 없을 때» 부르는 생성이다.
 *   · 그 페이지의 방문(서버 집계 pv/pvb, 10/11·10/12): 선언된 봇 8.8천/일 + «사람으로 판정된» 3.5~4.4천/일. 그런데 사람 판정분의 99% 가
 *     Sec-Fetch-Site=none · 리퍼러 없음(ref:none)이고 구글 등 검색 유입(ref:google 등)은 하루 0~1건이다 → 브라우저 헤더를 흉내 낸 수집기다.
 *   · 그래서 «봇 표지» 만 걸러서는 모자란다. 사람임을 보여 주는 단서(검색·소셜·자사 링크로 들어옴, 캠페인 링크, 앱 웹뷰)가 있을 때만 새 생성을 허용한다.
 *
 * 허용하지 않아도 페이지는 비지 않는다 — 사본이 있으면 그대로(낡으면 날짜 표기), 없으면 FINRA 현재 판본·옵션 레벨 판본으로 본문·제목·설명이 나온다
 *   (page.tsx getView). 크롤러에게 «직전 방문 사본»이나 빈 화면이 가지 않게 하는 9월 수리(lib/seo/freshness)는 그대로다.
 * 판정을 못 하면(예외) 예전처럼 허용한다 — 이 함수는 «아끼는 쪽»이지 «막는 쪽»이 아니다.
 */
import { classifyPageView } from '@/lib/marketing/pageViewHuman';
import { refBucketFromUrl } from '@/lib/marketing/referrer';
import type { HeaderLike } from '@/lib/marketing/clickHuman';

export type UcGenReason = 'native' | 'referred' | 'campaign' | 'direct' | 'bot' | 'nolang' | 'nometa' | 'nonnav' | 'prefetch' | 'router';
export interface UcGenVerdict { allow: boolean; reason: UcGenReason }

/** 캠페인 링크 표지 — 우리가 뿌린 링크(소셜 게시물·광고)는 리퍼러가 없어도 사람이다 */
export const CAMPAIGN_KEYS = ['from', 'utm_source', 'utm_medium', 'utm_campaign', 'ref', 'src'] as const;

export function hasCampaignParam(sp: Record<string, string | string[] | undefined> | null | undefined): boolean {
    if (!sp) return false;
    return CAMPAIGN_KEYS.some((k) => sp[k] != null && String(sp[k]).length > 0);
}

export function ucGenVerdict(h: HeaderLike, o: { native?: boolean; campaign?: boolean } = {}): UcGenVerdict {
    if (o.native) return { allow: true, reason: 'native' };
    const cls = classifyPageView(h, 'GET');
    if (cls !== 'human') return { allow: false, reason: cls as UcGenReason };
    if (refBucketFromUrl(h.get('referer')) !== 'none') return { allow: true, reason: 'referred' };
    if (o.campaign) return { allow: true, reason: 'campaign' };
    return { allow: false, reason: 'direct' };
}
