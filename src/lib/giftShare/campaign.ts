/**
 * 공개 캠페인 링크 — «링크 하나로 누구나 PRO 1개월 무료 코드를 1장씩» (2026-11-01).
 *
 * 왜: 게시물에 코드 번호를 나열하면 Meta 계열 정지 이력(10/7 Threads «사기·기만»)·번호 선점 소진이 생긴다.
 *     링크만 뿌리고, 방문 기기마다 개인 일회용 코드 1장을 서버가 배정한다(iOS 원탭 등록 · 안드 Play 코드 + 등록 안내).
 * 재고: 선물 링크와 같은 전용 재고 promo:gift:v1(:pool:<os>:<묶음>)를 공유한다. 배정은 선물 CLAIM_LUA 와 같은 LPOP 한 Lua 안에서만
 *     일어나므로(Redis 단일 스레드 EVAL) 선물·캠페인 사이 이중 배정이 없다(tests/giftShareLua.test.mjs 고정).
 *     선물 몫을 지키려고 유효 재고가 reserve 이하가 되면 캠페인은 멈춘다(선물은 계속).
 * 수신자: 기기·검증 계정 각각 400일 1장 — 선물 수신 표지(recipient:*)를 함께 쓰고 함께 세운다(선물·캠페인 합쳐 1장).
 * 켜기: 코드 상수(campaigns.cjs) + Upstash 스위치 키 `<접두>:camp:<id>:on` = "1"(scripts/gift-campaign.mjs). 스위치가 없으면 새 배정 0(기존 배정 복구만).
 * 화면: 가짜 희소성·남은 수·타이머 없음. 상한·소진은 사실대로(«오늘 몫이 모두 나갔다 — 내일 다시», «모두 소진»).
 */
import { kstDay, playRedeemUrl } from '@/lib/marketing/coupon';
import { giftPrefix, type GiftOs } from './config';
import { CAMPAIGN_LUA } from './atomic.cjs';
import { GIFT_CAMPAIGNS as CAMPAIGNS } from './campaigns.cjs';
import type { GiftStore } from './server';

export type GiftCampaign = {
  id: string;
  /** OS별 하루(KST) 새 배정 상한 */
  day: Record<GiftOs, number>;
  /** OS별 캠페인 전체 새 배정 상한 */
  total: Record<GiftOs, number>;
  /** OS별 선물 몫 — 유효 재고가 이 수 이하이면 캠페인 새 배정 중단 */
  reserve: Record<GiftOs, number>;
  /** IP(정규화·HMAC)당 하루 새 배정 상한 — 한 사람이 쿠키를 지우며 하루 몫을 비우지 못하게 */
  ipDay: number;
  /** 새 배정 마감(이 시각부터 배정 0) — 밀리초 */
  endsAt: number;
};

/** 닫힌 목록(campaigns.cjs — 운영 스크립트와 공유). id 는 링크의 ?camp= 값 그대로(소문자·숫자·하이픈). */
export const GIFT_CAMPAIGNS: Readonly<Record<string, GiftCampaign>> = CAMPAIGNS;

export function giftCampaign(raw: unknown): GiftCampaign | null {
  if (typeof raw !== 'string' || !/^[a-z0-9-]{1,32}$/.test(raw)) return null;
  return Object.prototype.hasOwnProperty.call(GIFT_CAMPAIGNS, raw) ? GIFT_CAMPAIGNS[raw] : null;
}

/** 마감일(KST, 마지막 받을 수 있는 날) — ko/ja «11/30», en «Nov 30». */
export function campaignUntil(c: GiftCampaign, lang: 'ko' | 'en' | 'ja', space = ' '): string {
  const last = new Date(c.endsAt - 1 + 9 * 3_600_000);
  if (lang !== 'en') return `${last.getUTCMonth() + 1}/${last.getUTCDate()}`;
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(last);
  return `${month}${space}${last.getUTCDate()}`;
}

export const campaignKeys = (id: string, p = giftPrefix()) => ({
  on: `${p}:camp:${id}:on`,
  day: (day: string, os: GiftOs) => `${p}:camp:${id}:day:${day}:${os}`,
  total: (os: GiftOs) => `${p}:camp:${id}:total:${os}`,
  ip: (day: string, ip: string) => `${p}:camp:${id}:ip:${day}:${ip}`,
  from: (day: string) => `${p}:camp:${id}:from:${day}`,
  device: (device: string) => `${p}:camp:${id}:device:${device}`,
  account: (account: string) => `${p}:camp:${id}:account:${account}`,
});

export const CAMPAIGN_STATUSES = ['new', 'again', 'recipient', 'off', 'total', 'empty', 'reserve', 'cap', 'ip', 'invalid'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number] | 'error';
export type CampaignResult =
  | { status: 'new' | 'again'; os: GiftOs; code: string; url: string }
  | { status: Exclude<CampaignStatus, 'new' | 'again'> };

/**
 * 한 Lua 실행으로: 기존 배정 복구(같은 기기·계정·OS) → 수신 이력 → 스위치·마감 → 전체 상한 → 재고(선물 몫 남김) → 하루 상한 → IP 상한 → 배정.
 * from 은 이미 normalizeFrom 을 거친 값(없으면 'direct'). 코드는 반환값에만 있고 로그·계측에는 상태만 남긴다.
 */
export async function claimCampaign(store: GiftStore, input: {
  campaign: GiftCampaign; os: GiftOs; device: string; account?: string; ip: string; from: string;
}, now = Date.now(), onResult?: (status: string) => void): Promise<CampaignResult> {
  const report = (status: string) => { try { onResult?.(status); } catch { /* 계측 실패 무해 */ } };
  const { campaign: c, os } = input;
  const p = giftPrefix();
  const k = campaignKeys(c.id, p);
  const day = kstDay(now);
  const keys = [k.on, `${p}:batches:${os}`, k.day(day, os), k.total(os), k.ip(day, input.ip), `${p}:ledger`, k.from(day),
    k.device(input.device), `${p}:recipient:device:${input.device}`];
  if (input.account) keys.push(k.account(input.account), `${p}:recipient:account:${input.account}`);
  const from = /^[a-z0-9_]{1,24}$/.test(input.from) ? input.from : 'direct';
  let result: unknown;
  try {
    result = await store.eval(CAMPAIGN_LUA, keys, [now, os, c.endsAt, c.day[os], c.total[os], c.ipDay, c.reserve[os], p,
      from, `camp:${c.id}:${input.device}`, c.id]);
  } catch { report('error'); return { status: 'error' }; }
  if (Array.isArray(result) && (result[0] === 'new' || result[0] === 'again') && typeof result[1] === 'string'
      && (os === 'ios' ? /^[A-Z0-9]{18}$/ : /^[A-Z0-9]{23}$/).test(result[1])) {
    report(result[0]);
    const code = result[1];
    return { status: result[0], os, code, url: os === 'ios'
      ? `https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=${encodeURIComponent(code)}`
      : playRedeemUrl(code) };
  }
  const status = Array.isArray(result) && (CAMPAIGN_STATUSES as readonly string[]).includes(result[0]) && result[0] !== 'new' && result[0] !== 'again'
    ? result[0] as Exclude<CampaignStatus, 'new' | 'again'> : 'invalid';
  report(status);
  return { status };
}
