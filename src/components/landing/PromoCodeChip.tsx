"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

/**
 * 홈 히어로 «리딤 코드» 칩 — 설계 REDEEM-DESIGN §4.1 (2026-10-04, 브랜치 feat/web-promo-chip).
 *
 * 켜는 조건(전부):
 *   · 기능 플래그 NEXT_PUBLIC_WEB_PROMO_CHIP === "1" — 기본 OFF(설정 없음 = 운영에 아무것도 안 그린다).
 *     G1(대표 아이폰 적용 확인) 통과 + 코드 WEBPRO 발급 뒤 대표 결정으로 켠다. 끄는 것도 플래그 하나(롤백).
 *     미리보기 확인용: 운영 도메인(signumhq.com) «밖»에서만 ?promochip=1 로 켜 볼 수 있다 — 운영에서는 무시된다.
 *   · 안드로이드가 아니다 — 안드로이드에 줄 코드가 없다(«무료» 약속 금지). 칩 문구에도 «iPhone» 을 앞에 쓴다.
 *   · 만료 전 — 오퍼 코드 만료 2026-10-31 07:00 UTC(= 10/30 PT 자정). 가짜 카운트다운 없음(만료일 외 시계 없음).
 * 고지: «무료» 문장 «안»에 자동 갱신 가격(설계 §10.7-3, FTC «Free» 지침·한국 숨은 갱신). 웹 EN 은 지역 가격이 달라 «regular price (US$9.99/mo)».
 * 링크: /app?from=home_hero_code&code=WEBPRO — 새 태그라 기존 배지(home_hero) 클릭 기준선을 오염시키지 않는다.
 *   /app 이 기기별로 보낸다: 아이폰 → 애플 적용 주소 · PC → 코드가 든 QR 화면 · (안드로이드는 칩 자체가 없다).
 * 레이아웃: 플래그 ON 이면 서버에서도 그려 아이폰·PC(대다수)에 레이아웃 이동이 없다. 안드로이드·만료만 마운트 뒤 숨긴다.
 *   플래그 OFF 면 감싸는 요소까지 없다 — 기존 화면과 한 픽셀도 다르지 않다.
 */
const FLAG_ON = process.env.NEXT_PUBLIC_WEB_PROMO_CHIP === "1";
const EXPIRES_AT = Date.parse("2026-10-31T07:00:00Z");
const PROD_HOST_RE = /(^|\.)signumhq\.com$/i;

type ChipCopy = { lead: string; free: string; renew: string; terms: string };
const COPY: Record<"ko" | "en" | "ja", ChipCopy> = {
  ko: {
    lead: "iPhone",
    free: "PRO 첫 달 무료",
    renew: ", 이후 월 ₩11,900 자동 갱신(언제든 해지)",
    terms: "광고 없음 + 내 종목 100개(무료 5개) · 선착순 500명 · 10/30까지",
  },
  en: {
    lead: "iPhone",
    free: "PRO first month free",
    renew: ", then renews at the regular price (US$9.99/mo) — cancel anytime",
    terms: "No ads + 100 watchlist tickers (free: 5) · first 500 · until Oct 30",
  },
  ja: {
    lead: "iPhone",
    free: "PRO 最初の1か月無料",
    renew: "、以降は月額¥1,280で自動更新(いつでも解約可)",
    terms: "広告なし + マイ銘柄100件(無料は5件) · 先着500名 · 10/30まで",
  },
};

/** 미리보기 확인용 켜기 — 운영 도메인에서는 절대 켜지지 않는다(순수 함수, 시험 대상). */
export function previewOverride(hostname: string, search: string): boolean {
  if (PROD_HOST_RE.test(hostname)) return false;
  try { return new URLSearchParams(search).get("promochip") === "1"; } catch { return false; }
}

/** 보일지 — 플래그(또는 미리보기 켜기) · 안드로이드 아님 · 만료 전 (순수 함수, 시험 대상). */
export function chipVisible(opts: { flag: boolean; override: boolean; ua: string; now: number }): boolean {
  if (!opts.flag && !opts.override) return false;
  if (/android/i.test(opts.ua)) return false;
  return opts.now < EXPIRES_AT;
}

export function PromoCodeChip({ href }: { href: string }) {
  const locale = useLocale();
  const c = COPY[locale === "ko" || locale === "ja" ? locale : "en"];
  const [show, setShow] = useState(FLAG_ON);
  useEffect(() => {
    let on = false;
    try {
      on = chipVisible({
        flag: FLAG_ON,
        override: previewOverride(window.location.hostname, window.location.search),
        ua: navigator.userAgent,
        now: Date.now(),
      });
    } catch { on = false; }
    setShow(on);
  }, []);
  if (!show) return null;
  return (
    <div className="mb-6 flex justify-center px-1">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-promo-chip="home_hero_code"
        className="inline-flex max-w-full flex-col items-center gap-1 rounded-2xl border border-[#fbbf24]/40 bg-[#fbbf24]/[0.08] px-4 py-2.5 text-center transition-colors hover:border-[#fbbf24]/70 hover:bg-[#fbbf24]/[0.14]"
      >
        <span className="text-[13px] font-semibold leading-snug text-[#fde68a]">
          <span className="mr-1.5 rounded-md bg-[#fbbf24] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1306] align-[1px]">
            {c.lead}
          </span>
          {c.free}
          <span className="font-medium text-[#fde68a]/90">{c.renew}</span>
        </span>
        <span className="text-[11px] leading-snug text-slate-400">{c.terms}</span>
      </a>
    </div>
  );
}
