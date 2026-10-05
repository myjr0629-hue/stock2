"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

/**
 * 홈 히어로 «리딤 코드» 칩 — 설계 REDEEM-DESIGN §4.1 (2026-10-04 작성, 2026-10-05 운영 ON).
 *
 * 켜는 조건(전부):
 *   · 기능 플래그 NEXT_PUBLIC_WEB_PROMO_CHIP 가 "0" 이 아니다 — ★2026-10-05 기본 ON(대표 10/5 00시대 «리딤 활용 극대화» 승인,
 *     코드 WEBPRO 발급 10/5 00:59 KST). 끄기(롤백) = Vercel 환경변수 NEXT_PUBLIC_WEB_PROMO_CHIP=0 + 재배포, 또는 이 커밋 되돌리기.
 *     미리보기 확인용 ?promochip=1 은 운영 도메인(signumhq.com) «밖»에서만 듣는다(플래그 0 인 미리보기에서 켜 볼 때).
 *   · 안드로이드가 아니다 — 안드로이드에 줄 코드가 없다(«무료» 약속 금지). 칩 문구에도 «iPhone» 을 앞에 쓴다.
 *   · 우리 앱(네이티브 셸) 안이 아니다 — Capacitor.isNativePlatform() 우선, 쿠키 sig_native=1 폴백(PhLaunchBanner 와 같은 판정).
 *     셸은 /app-view 로 시작하니 홈을 볼 일이 거의 없지만, 혹시 홈에 닿아도 앱 안에는 그리지 않는다(앱·웹 분리).
 *   · 만료 전 — 오퍼 코드 만료 2026-10-31 07:00 UTC(= 10/30 PT 자정). 가짜 카운트다운 없음(만료일 외 시계 없음).
 * 고지: «무료» 문장 «안»에 자동 갱신 가격(설계 §10.7-3, FTC «Free» 지침·한국 숨은 갱신). 웹 EN 은 지역 가격이 달라 «regular price (US$9.99/mo)».
 * 희소성·마감은 «진짜»만: 선착순 500명 = 애플이 코드 WEBPRO 에 강제하는 사용 한도 · 10/30 = 실제 만료(PT). 남은 수·타이머는 쓰지 않는다.
 * 링크: /app?from=home_hero_code&code=WEBPRO — 새 태그라 기존 배지(home_hero) 클릭 기준선을 오염시키지 않는다.
 *   /app 이 기기별로 보낸다: 아이폰 → 애플 적용 주소(앱 없으면 설치부터) · PC → 코드가 든 QR 화면 · (안드로이드는 칩 자체가 없다).
 *   둘째 줄 행동 문구도 기기에 맞춘다: 아이폰 «탭 한 번에 적용» · PC «아이폰 카메라로 QR».
 * 레이아웃: 플래그 ON 이면 서버에서도 그려 아이폰·PC(대다수)에 레이아웃 이동이 없다. 안드로이드·앱·만료만 마운트 뒤 숨긴다.
 *   플래그 OFF("0") 면 감싸는 요소까지 없다 — 칩 이전 화면과 한 픽셀도 다르지 않다.
 */
/** 플래그 해석 — "0" 만 끔(순수 함수, 시험 대상). */
export function flagFromEnv(v: string | undefined): boolean {
  return v !== "0";
}
const FLAG_ON = flagFromEnv(process.env.NEXT_PUBLIC_WEB_PROMO_CHIP);
const EXPIRES_AT = Date.parse("2026-10-31T07:00:00Z");
/** ★2026-10-05 안드로이드 노출 — 공개 플래그(값 없음, 표시만). 서버의 Play 코드 환경변수(lib/marketing/androidPromo)와 «같이» 켠다.
 *  끄면(기본) 안드로이드에는 예전처럼 칩이 없다. Play 프로모션 종료 = 2026-10-31 00:00 GMT(애플보다 7시간 빠르다). */
const ANDROID_ON = process.env.NEXT_PUBLIC_ANDROID_PROMO === "1";
const ANDROID_EXPIRES_AT = Date.parse("2026-10-31T00:00:00Z");
const PROD_HOST_RE = /(^|\.)signumhq\.com$/i;

type ChipCopy = { lead: string; free: string; renew: string; actPhone: string; actPc: string; terms: string };
/** 안드로이드 판(Play 프로모션 30일 무료 · Play 맞춤 코드 최대 2,000회 = 선착순 2,000명 · 10/30까지) */
const COPY_ANDROID: Record<"ko" | "en" | "ja", Omit<ChipCopy, "actPc">> = {
  ko: { lead: "Android", free: "PRO 30일 무료", renew: ", 이후 월 ₩11,900 자동 갱신 · 언제든 해지", actPhone: "탭 한 번에 코드 적용", terms: "광고 없음 + 내 종목 100개(무료 5개) · 선착순 2,000명 · 10/30까지" },
  en: { lead: "Android", free: "30 days of PRO free", renew: ", then the regular price (US$9.99/mo) — cancel anytime", actPhone: "One tap opens Google Play with the code", terms: "No ads + 100 watchlist tickers (free: 5) · first 2,000 · until Oct\u00a030" },
  ja: { lead: "Android", free: "PRO 30日間無料", renew: "、以降は月額¥1,280で自動更新・いつでも解約可", actPhone: "タップでGoogle Playのコード画面へ", terms: "広告なし + マイ銘柄100件(無料は5件) · 先着2,000名 · 10/30まで" },
};
const COPY: Record<"ko" | "en" | "ja", ChipCopy> = {
  ko: {
    lead: "iPhone",
    free: "PRO 1개월 무료",
    renew: ", 이후 월 ₩11,900 자동 갱신 · 언제든 해지",
    actPhone: "탭 한 번에 적용",
    actPc: "아이폰 카메라로 QR → 바로 적용",
    terms: "광고 없음 + 내 종목 100개(무료 5개) · 선착순 500명 · 10/30까지",
  },
  en: {
    lead: "iPhone",
    free: "1 month of PRO free",
    renew: ", then the regular price (US$9.99/mo) — cancel anytime",
    actPhone: "One tap to apply",
    actPc: "Scan the QR with your iPhone",
    terms: "No ads + 100 watchlist tickers (free: 5) · first 500 · until Oct 30",   // «Oct 30» 이 두 줄로 갈리지 않게
  },
  ja: {
    lead: "iPhone",
    free: "PRO 1か月無料",
    renew: "、以降は月額¥1,280で自動更新・いつでも解約可",
    actPhone: "タップ1回で適用",
    actPc: "iPhoneのカメラでQRを読み取り",
    terms: "広告なし + マイ銘柄100件(無料は5件) · 先着500名 · 10/30まで",
  },
};

/** 미리보기 확인용 켜기 — 운영 도메인에서는 절대 켜지지 않는다(순수 함수, 시험 대상). */
export function previewOverride(hostname: string, search: string): boolean {
  if (PROD_HOST_RE.test(hostname)) return false;
  try { return new URLSearchParams(search).get("promochip") === "1"; } catch { return false; }
}

/** 보일지 — 플래그(또는 미리보기 켜기) · 안드로이드 아님 · 우리 앱 안 아님 · 만료 전 (순수 함수, 시험 대상). */
export function chipVisible(opts: { flag: boolean; override: boolean; ua: string; now: number; native?: boolean; androidOn?: boolean }): boolean {
  if (!opts.flag && !opts.override) return false;
  if (opts.native) return false;
  if (/android/i.test(opts.ua)) return !!opts.androidOn && opts.now < ANDROID_EXPIRES_AT;   // 안드로이드: Play 코드가 켜졌을 때만
  return opts.now < EXPIRES_AT;
}

/** 아이폰(아이팟 포함)인가 — 둘째 줄 행동 문구용. iPadOS 사파리는 맥 UA 라 PC 문구(QR)가 맞다(/app 도 PC 화면을 준다). */
export function isIphoneUa(ua: string): boolean {
  return /iphone|ipod/i.test(ua);
}

/** 우리 앱(네이티브 셸) 안인가 — PhLaunchBanner 와 같은 판정(Capacitor 우선, 쿠키·html 클래스 폴백). */
function detectNative(): boolean {
  try { if (require("@capacitor/core").Capacitor.isNativePlatform()) return true; } catch { /* 웹 */ }
  try {
    if (typeof document === "undefined") return false;
    const cl = document.documentElement.classList;
    return document.cookie.includes("sig_native=1")
      || cl.contains("native-app") || cl.contains("native-android") || cl.contains("native-ios");
  } catch { return false; }
}

export function PromoCodeChip({ href }: { href: string }) {
  const locale = useLocale();
  const lk = locale === "ko" || locale === "ja" ? locale : "en";
  const c = COPY[lk];
  const [show, setShow] = useState(FLAG_ON);
  const [pc, setPc] = useState(false);   // 서버 렌더는 아이폰 문구(폰 클릭의 대다수) — PC 는 마운트 뒤 QR 문구로
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    let on = false;
    try {
      const ua = navigator.userAgent;
      on = chipVisible({
        flag: FLAG_ON,
        override: previewOverride(window.location.hostname, window.location.search),
        ua,
        now: Date.now(),
        native: detectNative(),
        androidOn: ANDROID_ON,
      });
      const isAndroid = /android/i.test(ua);
      setAndroid(isAndroid);
      setPc(!isAndroid && !isIphoneUa(ua));
    } catch { on = false; }
    setShow(on);
  }, []);
  if (!show) return null;
  const v = android ? { ...COPY_ANDROID[lk], actPc: COPY_ANDROID[lk].actPhone } : c;   // 안드로이드 판 문구
  return (
    <div className="mb-6 flex justify-center px-1">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-promo-chip="home_hero_code"
        data-promo-platform={android ? "android" : pc ? "pc" : "iphone"}
        className="inline-flex max-w-full flex-col items-center gap-1 rounded-2xl border border-[#fbbf24]/40 bg-[#fbbf24]/[0.08] px-4 py-2.5 text-center transition-colors hover:border-[#fbbf24]/70 hover:bg-[#fbbf24]/[0.14]"
      >
        <span className={`text-[13px] font-semibold leading-snug text-[#fde68a]${locale === "ko" ? " break-keep" : ""}`}>
          <span className="mr-1.5 rounded-md bg-[#fbbf24] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#1a1306] align-[1px]">
            {v.lead}
          </span>{" "}
          {v.free}
          <span className="font-medium text-[#fde68a]/90">{v.renew}</span>
        </span>
        <span className={`text-[11px] leading-snug text-slate-400${locale === "ko" ? " break-keep" : ""}`}>
          <span className="font-semibold text-[#fbbf24]">{pc ? v.actPc : v.actPhone}</span>
          {" · "}
          {v.terms}
        </span>
      </a>
    </div>
  );
}
